/**
 * session-digest.js
 * 대화 요약 + 메모리 추출 파이프라인
 *
 * 오미앱 참고 구조:
 * 1. 트리거: 20턴 이상 OR 1000토큰 이상 누적 시
 * 2. 청크 분할 → 슬라이스별 요약 + 메모리/액션 추출
 * 3. 세션 전체 요약 생성
 * 4. 메모리 필터링 후 저장
 *
 * 실행: 비동기 (응답 지연 없음)
 * LLM: Alba worker (Ollama 로컬) 우선, 없으면 규칙 기반 폴백
 */

const { getAlbaWorker } = require('./alba-worker');
const configManager = require('./config');
const path = require('path');
const fs = require('fs');

// 트리거 조건
const TRIGGER_TURN_COUNT = 20;      // 마지막 다이제스트 이후 20턴
const TRIGGER_TOKEN_COUNT = 1000;   // 마지막 다이제스트 이후 1000토큰
const CHUNK_SIZE = 10;              // 슬라이스당 최대 턴 수
const MAX_MEMORIES_PER_DIGEST = 5;  // 한 번에 추출할 최대 메모리 수

class SessionDigest {
  constructor() {
    this.lastDigestIndex = 0;       // 마지막 다이제스트 시점의 메시지 인덱스
    this.lastDigestTime = null;
    this.isRunning = false;         // 중복 실행 방지
    this.latestDigest = null;       // 가장 최근 다이제스트 결과
  }

  /**
   * 트리거 체크 — handleResponse에서 매번 호출
   * @param {Array} messages - 현재 단기 메모리의 전체 메시지
   * @returns {boolean} 다이제스트가 필요한지
   */
  shouldDigest(messages) {
    if (this.isRunning) return false;
    if (!messages || messages.length === 0) return false;

    const newMessages = messages.slice(this.lastDigestIndex);
    if (newMessages.length < TRIGGER_TURN_COUNT) return false;

    // 토큰 체크 (빠른 추정)
    const newTokens = newMessages.reduce((sum, m) => sum + (m.tokens || Math.ceil((m.content || '').length / 4)), 0);
    if (newTokens < TRIGGER_TOKEN_COUNT && newMessages.length < TRIGGER_TURN_COUNT) return false;

    return true;
  }

  /**
   * 다이제스트 실행 (비동기 — 응답 차단 안 함)
   * @param {Array} messages - 단기 메모리 메시지 전체
   * @param {string} sessionId
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
      console.log(`[SessionDigest] Starting digest: ${newMessages.length} new messages since index ${this.lastDigestIndex}`);

      // Step 0: 청크 분할
      const chunks = this._splitIntoChunks(newMessages, CHUNK_SIZE);
      console.log(`[SessionDigest] Split into ${chunks.length} chunks`);

      // Step 1: 각 청크별 요약 + 메모리 추출
      const alba = await getAlbaWorker();
      const chunkResults = [];

      for (const chunk of chunks) {
        const result = await this._processChunk(chunk, alba);
        if (result) chunkResults.push(result);
      }

      // Step 2: 세션 전체 요약
      const sessionSummary = await this._buildSessionSummary(chunkResults, alba);

      // Step 3: 메모리 필터링 + 저장
      const savedMemories = await this._filterAndSaveMemories(chunkResults);

      // Step 4: 저장
      const digest = {
        sessionId,
        timestamp: new Date().toISOString(),
        messageRange: {
          from: this.lastDigestIndex,
          to: messages.length
        },
        summary: sessionSummary,
        memories: savedMemories,
        chunks: chunkResults.length,
        processingTime: Date.now() - startTime
      };

      // 파일 저장
      await this._saveDigest(digest);

      // 상태 업데이트
      this.lastDigestIndex = messages.length;
      this.lastDigestTime = new Date();
      this.latestDigest = digest;

      console.log(`[SessionDigest] Complete: ${sessionSummary.length} chars summary, ${savedMemories.length} memories, ${Date.now() - startTime}ms`);

      return digest;

    } catch (error) {
      console.error('[SessionDigest] Error:', error.message);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 메시지를 청크로 분할
   */
  _splitIntoChunks(messages, chunkSize) {
    const chunks = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 청크 하나 처리: 요약 + 메모리/액션 추출
   */
  async _processChunk(chunk, alba) {
    // 대화 텍스트 구성
    const conversationText = chunk.map(m => {
      const role = m.role === 'user' ? '사용자' : 'AI';
      return `${role}: ${(m.content || '').substring(0, 300)}`;
    }).join('\n');

    // Alba (로컬 LLM) 사용 가능하면 AI로 추출
    if (alba && alba.initialized) {
      return await this._processChunkWithLLM(conversationText, alba);
    }

    // 폴백: 규칙 기반
    return this._processChunkRuleBased(chunk);
  }

  /**
   * LLM으로 청크 처리
   */
  async _processChunkWithLLM(conversationText, alba) {
    const systemPrompt = `대화 조각을 분석해서 JSON으로만 답해.
형식:
{"summary":"핵심 내용 2-3문장","memories":["유저에 대해 새로 알게 된 사실 (영구적인 것만)"],"actions":["할 일/약속"]}

규칙:
- summary: 무슨 대화를 했는지 핵심만
- memories: "유저는 ~" 형태, 일시적인 것(오늘 기분 등) 제외, 성격/취향/습관/관계 같은 영구 정보만
- actions: 없으면 빈 배열
- JSON만 출력, 다른 텍스트 없이`;

    try {
      const result = await alba._callLLM(systemPrompt, conversationText);
      if (!result) return this._processChunkRuleBased(null);

      // JSON 파싱 (LLM이 ```json 감싸거나 할 수 있으므로 추출)
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
      console.warn('[SessionDigest] LLM chunk processing failed:', e.message);
    }

    return null;
  }

  /**
   * 규칙 기반 청크 처리 (LLM 없을 때 폴백)
   */
  _processChunkRuleBased(chunk) {
    if (!chunk || chunk.length === 0) return null;

    // 간단 요약: 첫 사용자 메시지 + 마지막 AI 응답
    const userMsgs = chunk.filter(m => m.role === 'user');
    const firstUser = userMsgs[0]?.content?.substring(0, 100) || '';
    const lastAI = chunk.filter(m => m.role === 'assistant').pop()?.content?.substring(0, 100) || '';

    return {
      summary: firstUser ? `사용자: "${firstUser}..." 에 대한 대화` : '(내용 없음)',
      memories: [],
      actions: []
    };
  }

  /**
   * 세션 전체 요약 생성
   */
  async _buildSessionSummary(chunkResults, alba) {
    if (chunkResults.length === 0) return '';

    const chunkSummaries = chunkResults
      .map((r, i) => `[${i + 1}] ${r.summary}`)
      .join('\n');

    // LLM으로 통합 요약
    if (alba && alba.initialized) {
      try {
        const result = await alba._callLLM(
          '아래는 대화를 나눈 청크별 요약이다. 전체를 3-5문장으로 통합 정리해. 시간순서 유지, 중요한 결정/다짐/감정변화 포함. 요약만 출력.',
          chunkSummaries
        );
        if (result) return result.trim();
      } catch (e) {
        console.warn('[SessionDigest] Session summary LLM failed:', e.message);
      }
    }

    // 폴백: 청크 요약 합치기
    return chunkResults.map(r => r.summary).join(' ');
  }

  /**
   * 메모리 필터링 + SelfRule로 저장
   */
  async _filterAndSaveMemories(chunkResults) {
    // 모든 청크에서 메모리 후보 수집
    const allMemories = chunkResults.flatMap(r => r.memories || []);
    if (allMemories.length === 0) return [];

    // 1차 필터: 규칙 기반
    const filtered = allMemories.filter(mem => {
      if (!mem || mem.length < 10) return false; // 너무 짧으면 제거
      // 일시적 표현 제거
      if (/^(오늘|지금|방금|이번에|아까)\s/.test(mem)) return false;
      // 너무 애매한 표현
      if (/^(가끔|조금|약간|좀)\s/.test(mem)) return false;
      return true;
    });

    // 최대 개수 제한
    const toSave = filtered.slice(0, MAX_MEMORIES_PER_DIGEST);

    // SelfRule에 저장
    const saved = [];
    try {
      const { SelfRule } = require('../db/models');

      for (const memText of toSave) {
        // 중복 체크 (같은 텍스트가 이미 있는지)
        const existing = await SelfRule.find({
          rule: memText,
          is_active: 1
        });

        if (existing && existing.length > 0) {
          console.log(`[SessionDigest] Memory already exists, skip: ${memText.substring(0, 40)}...`);
          continue;
        }

        // 카테고리 자동 추론
        const category = this._inferCategory(memText);

        await SelfRule.create({
          rule: memText,
          category,
          priority: 7,  // 자동 추출된 메모리는 priority 7 (높은 편)
          context: `세션 다이제스트 자동 추출 (${new Date().toLocaleDateString('ko-KR')})`,
          tokenCount: Math.ceil(memText.length / 4)
        });

        saved.push({ text: memText, category });
        console.log(`[SessionDigest] Memory saved: [${category}] ${memText.substring(0, 50)}...`);
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
    if (/목표|계획|하려고|할 예정|다짐/.test(text)) return 'goal';
    if (/가족|친구|동료|연인|부모|형제/.test(text)) return 'relationship';
    if (/직업|회사|학교|전공|일|근무/.test(text)) return 'fact';
    if (/습관|매일|항상|자주|늘/.test(text)) return 'habit';
    if (/코드|코딩|개발|버그|에러|프로그래밍/.test(text)) return 'coding';
    return 'general';
  }

  /**
   * 다이제스트 파일 저장
   */
  async _saveDigest(digest) {
    try {
      let basePath;
      try {
        const memoryConfig = await configManager.getMemoryConfig();
        basePath = memoryConfig?.storagePath;
      } catch { /* config 에러 무시 */ }
      if (!basePath) basePath = path.join(require('os').homedir(), '.soul');
      const digestDir = path.join(basePath, 'digests');

      if (!fs.existsSync(digestDir)) {
        fs.mkdirSync(digestDir, { recursive: true });
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const filePath = path.join(digestDir, `${dateStr}.json`);

      // 기존 파일에 추가 (같은 날 여러 다이제스트 가능)
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

  /**
   * 최근 다이제스트 로드 (컨텍스트 주입용)
   * @param {number} maxCount - 최대 로드 개수
   * @param {number} maxTokens - 토큰 예산
   * @returns {Array} 요약 목록
   */
  async getRecentDigests(maxCount = 3, maxTokens = 800) {
    try {
      let basePath;
      try {
        const memoryConfig = await configManager.getMemoryConfig();
        basePath = memoryConfig?.storagePath;
      } catch { /* config 에러 무시 */ }
      if (!basePath) basePath = path.join(require('os').homedir(), '.soul');
      const digestDir = path.join(basePath, 'digests');

      if (!fs.existsSync(digestDir)) return [];

      // 최근 날짜 파일부터
      const files = fs.readdirSync(digestDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 7); // 최근 7일

      const digests = [];
      let tokenCount = 0;

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(digestDir, file), 'utf8'));
          const items = Array.isArray(data) ? data : [data];

          for (const item of items.reverse()) { // 최신 먼저
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
   * @param {number} maxTokens - 토큰 예산
   * @returns {string} 시스템 프롬프트에 넣을 요약 텍스트
   */
  async buildContextSummary(maxTokens = 600) {
    try {
      // 현재 세션 다이제스트 (있으면)
      const currentSummary = this.latestDigest?.summary || '';

      // 과거 다이제스트
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
        console.log('[SessionDigest] No digests available for context');
        return '';
      }

      const result = `<session_summaries>\n이전 대화 요약:\n${parts.join('\n')}\n</session_summaries>`;
      console.log(`[SessionDigest] Context summary: ${parts.length} digests, ~${Math.ceil(result.length / 4)} tokens`);
      return result;
    } catch (e) {
      console.warn('[SessionDigest] buildContextSummary error:', e.message);
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
