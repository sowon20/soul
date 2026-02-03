/**
 * session-digest.js
 * 대화 요약 + 메모리 추출 파이프라인
 *
 * 오미앱 참고 구조 + 피드백 반영:
 * 1. 트리거: 20턴 OR 1200토큰 이상 누적 시 (둘 중 하나)
 * 2. 청크 분할: 10턴 AND 500토큰 상한 (둘 중 먼저 걸리는 거)
 * 3. 청크별 요약 + 메모리/액션 추출 (JSON 한 줄 프롬프트)
 * 4. 이전 요약 + 새 요약 → 업데이트 방식 (덮어쓰기 아님)
 * 5. 메모리 필터링 + confidence 태그 후 저장
 *
 * 실행: 비동기 (응답 지연 없음)
 * LLM: Alba worker (Ollama 로컬) 우선, 없으면 규칙 기반 폴백
 */

const { getAlbaWorker } = require('./alba-worker');
const configManager = require('./config');
const path = require('path');
const fs = require('fs');

// 트리거 조건 (둘 중 하나면 발동)
const TRIGGER_TURN_COUNT = 20;
const TRIGGER_TOKEN_COUNT = 1200;

// 청크 분할 (둘 중 먼저 걸리는 쪽에서 끊기)
const CHUNK_MAX_TURNS = 10;
const CHUNK_MAX_TOKENS = 500;

const MAX_MEMORIES_PER_DIGEST = 5;

class SessionDigest {
  constructor() {
    this.lastDigestIndex = 0;
    this.lastDigestTime = null;
    this.isRunning = false;
    this.latestDigest = null;       // 가장 최근 다이제스트 결과
    this.previousSummary = '';      // 이전 세션 요약 (업데이트용)
  }

  /**
   * 트리거 체크 — 턴 OR 토큰 (둘 중 하나)
   */
  shouldDigest(messages) {
    if (this.isRunning) return false;
    if (!messages || messages.length === 0) return false;

    const newMessages = messages.slice(this.lastDigestIndex);
    const turnCount = newMessages.length;
    const tokenCount = newMessages.reduce((sum, m) =>
      sum + (m.tokens || Math.ceil((m.content || '').length / 4)), 0);

    return turnCount >= TRIGGER_TURN_COUNT || tokenCount >= TRIGGER_TOKEN_COUNT;
  }

  /**
   * 다이제스트 실행 (비동기)
   */
  async runDigest(messages, sessionId = 'main-conversation') {
    if (this.isRunning) {
      console.log('[SessionDigest] Already running, skipping');
      return null;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const newMessages = messages.slice(this.lastDigestIndex);
      console.log(`[SessionDigest] Starting: ${newMessages.length} msgs since idx ${this.lastDigestIndex}`);

      // Step 0: 청크 분할 (턴 + 토큰 이중 상한)
      const chunks = this._splitIntoChunks(newMessages);
      console.log(`[SessionDigest] Split into ${chunks.length} chunks`);

      // Step 1: 각 청크별 요약 + 메모리 추출
      const alba = await getAlbaWorker();
      const chunkResults = [];

      for (const chunk of chunks) {
        const result = await this._processChunk(chunk, alba);
        if (result) chunkResults.push(result);
      }

      // Step 2: 세션 요약 (이전 요약 + 새 청크 → 업데이트)
      const sessionSummary = await this._buildSessionSummary(chunkResults, alba);

      // Step 3: 메모리 필터링 + 저장
      const savedMemories = await this._filterAndSaveMemories(chunkResults);

      // Step 4: 액션아이템 수집
      const actions = chunkResults.flatMap(r => r.actions || []).filter(Boolean);

      const digest = {
        sessionId,
        timestamp: new Date().toISOString(),
        messageRange: { from: this.lastDigestIndex, to: messages.length },
        summary: sessionSummary,
        memories: savedMemories,
        actions,
        chunks: chunkResults.length,
        processingTime: Date.now() - startTime
      };

      await this._saveDigest(digest);

      // 상태 업데이트
      this.lastDigestIndex = messages.length;
      this.lastDigestTime = new Date();
      this.latestDigest = digest;
      this.previousSummary = sessionSummary; // 다음 다이제스트 때 이전 요약으로 사용

      console.log(`[SessionDigest] Done: ${sessionSummary.length}ch summary, ${savedMemories.length} memories, ${actions.length} actions, ${Date.now() - startTime}ms`);
      return digest;

    } catch (error) {
      console.error('[SessionDigest] Error:', error.message);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 청크 분할: 턴 + 토큰 이중 상한
   * 10턴 안 돼도 500토큰 넘으면 끊기
   */
  _splitIntoChunks(messages) {
    const chunks = [];
    let chunk = [];
    let chunkTokens = 0;

    for (const msg of messages) {
      const msgTokens = msg.tokens || Math.ceil((msg.content || '').length / 4);

      // 상한 도달 시 새 청크 시작
      if (chunk.length >= CHUNK_MAX_TURNS || (chunkTokens + msgTokens > CHUNK_MAX_TOKENS && chunk.length > 0)) {
        chunks.push(chunk);
        chunk = [];
        chunkTokens = 0;
      }

      chunk.push(msg);
      chunkTokens += msgTokens;
    }

    if (chunk.length > 0) chunks.push(chunk);
    return chunks;
  }

  /**
   * 청크 처리: 요약 + 메모리/액션 추출
   */
  async _processChunk(chunk, alba) {
    const conversationText = chunk.map(m => {
      const role = m.role === 'user' ? '사용자' : 'AI';
      return `${role}: ${(m.content || '').substring(0, 300)}`;
    }).join('\n');

    if (alba && alba.initialized) {
      return await this._processChunkWithLLM(conversationText, alba);
    }
    return this._processChunkRuleBased(chunk);
  }

  /**
   * LLM 청크 처리 — JSON 한 줄 프롬프트 (파싱 안정성)
   */
  async _processChunkWithLLM(conversationText, alba) {
    // 오미 피드백: 프롬프트를 JSON 한 줄짜리로 못 박기
    const systemPrompt = `대화 조각을 분석해서 아래 JSON 형식으로만 한 줄로 응답해. 다른 텍스트 없이 JSON만.
{"summary":"핵심 내용 2-3문장","memories":["유저에 대한 영구적 사실/취향/목표 0~5개"],"actions":["유저가 할 일/결정 0~5개, 동사로 시작"]}
규칙: memories는 "유저는 ~" 형태만. 일시적(오늘 기분, 어제 일)은 제외. 성격/취향/습관/관계/목표만.`;

    try {
      const result = await alba._callLLM(systemPrompt, conversationText);
      if (!result) return this._processChunkRuleBased(null);

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          memories: Array.isArray(parsed.memories) ? parsed.memories : [],
          actions: Array.isArray(parsed.actions) ? parsed.actions : []
        };
      }
    } catch (e) {
      console.warn('[SessionDigest] LLM chunk failed:', e.message);
    }
    return this._processChunkRuleBased(null);
  }

  /**
   * 규칙 기반 청크 처리 (폴백)
   */
  _processChunkRuleBased(chunk) {
    if (!chunk || chunk.length === 0) return null;

    const userMsgs = chunk.filter(m => m.role === 'user');
    const firstUser = userMsgs[0]?.content?.substring(0, 100) || '';

    return {
      summary: firstUser ? `"${firstUser}..." 에 대한 대화` : '(내용 없음)',
      memories: [],
      actions: []
    };
  }

  /**
   * 세션 요약 생성 — 이전 요약 + 새 청크 → 업데이트 방식
   * 오미 피드백: 덮어쓰기가 아니라 "업데이트"
   */
  async _buildSessionSummary(chunkResults, alba) {
    if (chunkResults.length === 0) return this.previousSummary || '';

    const chunkSummaries = chunkResults
      .map((r, i) => `[${i + 1}] ${r.summary}`)
      .join('\n');

    if (alba && alba.initialized) {
      try {
        // 이전 요약이 있으면 합쳐서 업데이트
        let prompt;
        if (this.previousSummary) {
          prompt = `이전 세션 요약:\n${this.previousSummary}\n\n새로 추가된 대화 요약:\n${chunkSummaries}\n\n위 둘을 합쳐서 전체를 5-8문장으로 다시 정리해. 중복 줄이고, 중요한 결정/다짐/감정변화는 꼭 남겨. 요약만 출력.`;
        } else {
          prompt = chunkSummaries;
        }

        const systemMsg = this.previousSummary
          ? '이전 요약과 새 대화를 합쳐 전체 세션을 정리해. 5-8문장, 시간순서 유지. 요약만 출력.'
          : '대화 청크 요약들을 3-5문장으로 통합 정리해. 시간순서 유지, 중요한 결정/다짐/감정변화 포함. 요약만 출력.';

        const result = await alba._callLLM(systemMsg, prompt);
        if (result) return result.trim();
      } catch (e) {
        console.warn('[SessionDigest] Session summary LLM failed:', e.message);
      }
    }

    // 폴백
    const newSummary = chunkResults.map(r => r.summary).join(' ');
    return this.previousSummary
      ? `${this.previousSummary} ${newSummary}`
      : newSummary;
  }

  /**
   * 메모리 필터링 + 저장
   * 오미 피드백: 더 엄격한 규칙 필터 + confidence
   */
  async _filterAndSaveMemories(chunkResults) {
    const allMemories = chunkResults.flatMap(r => r.memories || []);
    if (allMemories.length === 0) return [];

    // 1차 필터: 규칙 기반
    const filtered = allMemories.filter(mem => {
      if (!mem || typeof mem !== 'string') return false;
      if (mem.length < 10) return false; // 너무 짧음
      // 일시적 표현
      if (/^(오늘|어제|내일|이번 주|지금|방금|이번에|아까)\s/.test(mem)) return false;
      // 애매한 서술만
      if (/^(좀|약간|가끔|조금|살짝)\s/.test(mem)) return false;
      return true;
    });

    const toSave = filtered.slice(0, MAX_MEMORIES_PER_DIGEST);
    const saved = [];

    try {
      const { SelfRule } = require('../db/models');

      for (const memText of toSave) {
        // 중복 체크
        const existing = await SelfRule.find({ rule: memText, is_active: 1 });
        if (existing && existing.length > 0) {
          console.log(`[SessionDigest] Memory exists, skip: ${memText.substring(0, 40)}...`);
          continue;
        }

        const category = this._inferCategory(memText);
        // confidence: 영구적 표현이 있으면 높게
        const confidence = /항상|매일|늘|주로|좋아하|싫어하|관심/.test(memText) ? 0.9 : 0.7;

        await SelfRule.create({
          rule: memText,
          category,
          priority: Math.round(confidence * 10),  // 0.9 → 9, 0.7 → 7
          context: `digest:auto (${new Date().toLocaleDateString('ko-KR')}) conf=${confidence}`,
          tokenCount: Math.ceil(memText.length / 4)
        });

        saved.push({ text: memText, category, confidence });
        console.log(`[SessionDigest] Memory saved: [${category}] conf=${confidence} "${memText.substring(0, 50)}..."`);
      }
    } catch (e) {
      console.error('[SessionDigest] Memory save error:', e.message);
    }

    return saved;
  }

  /**
   * 메모리 카테고리 추론
   */
  _inferCategory(text) {
    if (/취향|좋아|싫어|선호|즐겨|관심/.test(text)) return 'preference';
    if (/목표|계획|하려고|할 예정|다짐|되고 싶/.test(text)) return 'goal';
    if (/가족|친구|동료|연인|부모|형제|남편|아내|엄마|아빠/.test(text)) return 'relationship';
    if (/직업|회사|학교|전공|일|근무|직장/.test(text)) return 'fact';
    if (/습관|매일|항상|자주|늘|루틴/.test(text)) return 'habit';
    if (/코드|코딩|개발|버그|에러|프로그래밍/.test(text)) return 'coding';
    return 'general';
  }

  // === 저장/로드 ===

  _getBasePath() {
    try {
      // 동기적으로 접근 가능한 캐시가 있으면 사용
      return this._cachedBasePath || path.join(require('os').homedir(), '.soul');
    } catch {
      return path.join(require('os').homedir(), '.soul');
    }
  }

  async _resolveBasePath() {
    try {
      const memoryConfig = await configManager.getMemoryConfig();
      if (memoryConfig?.storagePath) {
        this._cachedBasePath = memoryConfig.storagePath;
        return memoryConfig.storagePath;
      }
    } catch { /* ignore */ }
    return path.join(require('os').homedir(), '.soul');
  }

  async _saveDigest(digest) {
    try {
      const basePath = await this._resolveBasePath();
      const digestDir = path.join(basePath, 'digests');

      if (!fs.existsSync(digestDir)) {
        fs.mkdirSync(digestDir, { recursive: true });
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const filePath = path.join(digestDir, `${dateStr}.json`);

      let existing = [];
      if (fs.existsSync(filePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (!Array.isArray(existing)) existing = [existing];
        } catch { existing = []; }
      }

      existing.push(digest);
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`[SessionDigest] Saved to ${filePath}`);
    } catch (e) {
      console.error('[SessionDigest] Save error:', e.message);
    }
  }

  async getRecentDigests(maxCount = 3, maxTokens = 800) {
    try {
      const basePath = await this._resolveBasePath();
      const digestDir = path.join(basePath, 'digests');

      if (!fs.existsSync(digestDir)) return [];

      const files = fs.readdirSync(digestDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 7);

      const digests = [];
      let tokenCount = 0;

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(digestDir, file), 'utf8'));
          const items = Array.isArray(data) ? data : [data];

          for (const item of items.reverse()) {
            if (digests.length >= maxCount) break;
            const summaryTokens = Math.ceil((item.summary || '').length / 4);
            if (tokenCount + summaryTokens > maxTokens) break;

            digests.push({
              timestamp: item.timestamp,
              summary: item.summary,
              memories: (item.memories || []).map(m => m.text || m),
              tokens: summaryTokens
            });
            tokenCount += summaryTokens;
          }

          if (digests.length >= maxCount) break;
        } catch { continue; }
      }

      return digests;
    } catch (e) {
      console.error('[SessionDigest] Load error:', e.message);
      return [];
    }
  }

  /**
   * 컨텍스트용 요약 텍스트 생성
   */
  async buildContextSummary(maxTokens = 600) {
    try {
      const currentSummary = this.latestDigest?.summary || '';
      const remainingBudget = maxTokens - Math.ceil(currentSummary.length / 4);
      const pastDigests = await this.getRecentDigests(3, Math.max(remainingBudget, 200));

      let parts = [];

      if (currentSummary) {
        parts.push(`[현재 세션] ${currentSummary}`);
      }

      for (const d of pastDigests) {
        const date = d.timestamp ? new Date(d.timestamp).toLocaleDateString('ko-KR') : '';
        parts.push(`[${date}] ${d.summary}`);
      }

      if (parts.length === 0) {
        console.log('[SessionDigest] No digests for context');
        return '';
      }

      const result = `<session_summaries>\n이전 대화 요약:\n${parts.join('\n')}\n</session_summaries>`;
      console.log(`[SessionDigest] Context: ${parts.length} digests, ~${Math.ceil(result.length / 4)} tokens`);
      return result;
    } catch (e) {
      console.warn('[SessionDigest] buildContextSummary error:', e.message);
      return '';
    }
  }

  /**
   * 관련 메모리 검색 (컨텍스트 주입용)
   * SelfRule에서 관련 메모리를 가져와 컨텍스트에 넣을 텍스트 생성
   * @param {number} maxCount - 최대 개수
   * @param {number} maxTokens - 토큰 예산
   */
  async buildMemoryContext(maxCount = 5, maxTokens = 500) {
    try {
      const { SelfRule } = require('../db/models');

      // 활성 메모리 중 우선순위 높은 것부터
      const memories = await SelfRule.find({ is_active: 1 })
        .sort({ priority: -1, use_count: -1 })
        .limit(maxCount * 2); // 필터링 여유분

      if (!memories || memories.length === 0) return '';

      const lines = [];
      let tokenCount = 0;

      for (const mem of memories) {
        if (lines.length >= maxCount) break;
        const tokens = mem.token_count || Math.ceil(mem.rule.length / 4);
        if (tokenCount + tokens > maxTokens) break;

        lines.push(`- ${mem.rule}`);
        tokenCount += tokens;

        // 사용 횟수 업데이트 (비동기)
        SelfRule.updateOne(
          { id: mem.id },
          { use_count: (mem.use_count || 0) + 1, last_used: new Date().toISOString() }
        ).catch(() => {});
      }

      if (lines.length === 0) return '';

      return `<user_memories>\n이 유저에 대해 알고 있는 정보:\n${lines.join('\n')}\n</user_memories>`;
    } catch (e) {
      console.warn('[SessionDigest] buildMemoryContext error:', e.message);
      return '';
    }
  }
}

// 싱글톤
let _instance = null;

function getSessionDigest() {
  if (!_instance) {
    _instance = new SessionDigest();
  }
  return _instance;
}

function resetSessionDigest() {
  _instance = null;
}

module.exports = { SessionDigest, getSessionDigest, resetSessionDigest };
