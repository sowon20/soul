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
 * LLM: Alba worker (Ollama 로컬) 우선 → digest-worker 역할 폴백 → 규칙 기반
 */

const { getAlbaWorker } = require('./alba-worker');
const { AIServiceFactory } = require('./ai-service');
const { trackCall: trackAlba } = require('./alba-stats');
const configManager = require('./config');
const path = require('path');
const fs = require('fs');

// 트리거 조건 (둘 중 하나면 발동)
const TRIGGER_TURN_COUNT = 20;
const TRIGGER_TOKEN_COUNT = 1200;

// 청크 분할 (둘 중 먼저 걸리는 쪽에서 끊기)
const CHUNK_MAX_TURNS = 10;
const CHUNK_MAX_TOKENS = 500;

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

      // Step 4: 액션아이템 + 키워드/엔티티 수집
      const actions = chunkResults.flatMap(r => r.actions || []).filter(Boolean);
      const keywords = [...new Set(chunkResults.flatMap(r => r.keywords || []).filter(Boolean))];
      const entities = [...new Set(chunkResults.flatMap(r => r.entities || []).filter(Boolean))];

      const digest = {
        sessionId,
        timestamp: new Date().toISOString(),
        messageRange: { from: this.lastDigestIndex, to: messages.length },
        summary: sessionSummary,
        memories: savedMemories,
        keywords,
        entities,
        actions,
        chunks: chunkResults.length,
        processingTime: Date.now() - startTime
      };

      await this._saveDigest(digest);

      // 벡터 임베딩 (fire-and-forget)
      this._embedDigestResults(digest).catch(err => {
        console.warn('[SessionDigest] Embedding failed (non-blocking):', err.message);
      });

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
   * 우선순위: Ollama → OpenRouter → 규칙 기반
   */
  async _processChunk(chunk, alba) {
    const conversationText = chunk.map(m => {
      const role = m.role === 'user' ? '사용자' : 'AI';
      return `${role}: ${(m.content || '').substring(0, 300)}`;
    }).join('\n');

    const _chunkStart = Date.now();

    // 1) Ollama (로컬 LLM)
    if (alba && alba.initialized) {
      const result = await this._processChunkWithLLM(conversationText, alba);
      trackAlba('digest-worker', {
        action: 'chunk-analyze',
        tokens: Math.ceil(conversationText.length / 4),
        latencyMs: Date.now() - _chunkStart,
        success: !!(result && result.summary),
        detail: 'ollama'
      });
      return result;
    }

    // 2) 다이제스트 워커 (역할 기반 — OpenRouter 등)
    const digestResult = await this._processChunkWithDigestLLM(conversationText);
    if (digestResult) {
      trackAlba('digest-worker', {
        action: 'chunk-analyze',
        tokens: Math.ceil(conversationText.length / 4),
        latencyMs: Date.now() - _chunkStart,
        success: true,
        detail: 'openrouter'
      });
      return digestResult;
    }

    // 3) 규칙 기반 폴백
    trackAlba('digest-worker', {
      action: 'chunk-analyze',
      tokens: 0,
      latencyMs: Date.now() - _chunkStart,
      success: true,
      detail: 'rule-based-fallback'
    });
    return this._processChunkRuleBased(chunk);
  }

  /**
   * LLM 청크 처리 — JSON 한 줄 프롬프트 (파싱 안정성)
   */
  async _processChunkWithLLM(conversationText, alba) {
    const systemPrompt = `대화 조각을 분석해서 아래 JSON 형식으로만 응답해. 다른 텍스트 없이 JSON만.
{"summary":"핵심 내용 2-3문장","keywords":["이 대화의 핵심 검색 키워드 3~10개"],"entities":["고유명사/인물/관계/호칭/장소/서비스명 등"],"actions":["유저가 할 일/결정 0~5개, 동사로 시작"]}
규칙:
- keywords: 나중에 이 대화를 찾을 때 쓸 검색어. 동의어/유사어도 포함 (예: 별명→호칭,이름,닉네임)
- entities: 사람 이름, AI 호칭, 관계("엄마=영희"), 서비스명, 프로젝트명 등 고유명사는 빠짐없이`;

    try {
      const result = await alba._callLLM(systemPrompt, conversationText);
      if (!result) return this._processChunkRuleBased(null);

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          memories: Array.isArray(parsed.memories) ? parsed.memories : [],
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
          entities: Array.isArray(parsed.entities) ? parsed.entities : [],
          actions: Array.isArray(parsed.actions) ? parsed.actions : []
        };
      }
    } catch (e) {
      console.warn('[SessionDigest] LLM chunk failed:', e.message);
    }
    return this._processChunkRuleBased(null);
  }

  /**
   * 다이제스트 LLM 청크 처리 (2차 폴백)
   * Ollama 없을 때 digest-worker 역할의 모델로 시도
   */
  async _processChunkWithDigestLLM(conversationText) {
    const systemPrompt = `대화 조각을 분석해서 아래 JSON 형식으로만 응답해. 다른 텍스트 없이 JSON만.
{"summary":"핵심 내용 2-3문장","keywords":["이 대화의 핵심 검색 키워드 3~10개"],"entities":["고유명사/인물/관계/호칭/장소/서비스명 등"],"actions":["유저가 할 일/결정 0~5개, 동사로 시작"]}
규칙:
- keywords: 나중에 이 대화를 찾을 때 쓸 검색어. 동의어/유사어도 포함 (예: 별명→호칭,이름,닉네임)
- entities: 사람 이름, AI 호칭, 관계("엄마=영희"), 서비스명, 프로젝트명 등 고유명사는 빠짐없이`;

    try {
      const result = await this._callDigestLLM(systemPrompt, conversationText);
      if (!result) return null;

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          memories: Array.isArray(parsed.memories) ? parsed.memories : [],
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
          entities: Array.isArray(parsed.entities) ? parsed.entities : [],
          actions: Array.isArray(parsed.actions) ? parsed.actions : []
        };
      }
    } catch (e) {
      console.warn('[SessionDigest] DigestLLM chunk failed:', e.message);
    }
    return null;
  }

  /**
   * 다이제스트 전용 LLM 호출 (역할 기반)
   * roles 테이블의 'digest-worker' 역할에서 모델/서비스 설정을 읽어 호출
   * @returns {string|null} LLM 응답 텍스트 또는 null
   */
  async _callDigestLLM(systemPrompt, userMessage) {
    try {
      // 1) digest-worker 역할에서 모델/서비스 설정 읽기
      const RoleModel = require('../models/Role');
      const digestRole = await RoleModel.findOne({ roleId: 'digest-worker', isActive: 1 });

      if (!digestRole) {
        return null; // digest-worker 역할 미설정 → 조용히 패스
      }

      const modelId = digestRole.preferredModel;
      const roleConfig = typeof digestRole.config === 'string'
        ? JSON.parse(digestRole.config)
        : (digestRole.config || {});
      const serviceId = roleConfig.serviceId;
      if (!modelId || !serviceId) {
        console.warn('[Digest] digest-worker 모델/서비스 미설정 — 다이제스트 스킵');
        return null;
      }
      const temperature = roleConfig.temperature || 0.3;
      const maxTokens = roleConfig.maxTokens || 800;

      // 2) 해당 서비스의 API 키 가져오기
      const AIServiceModel = require('../models/AIService');
      const aiService = await AIServiceModel.findOne({ serviceId });

      if (!aiService || !aiService.apiKey) {
        return null; // 서비스 미설정 or API 키 없음
      }

      // 3) 서비스 인스턴스 생성 + 호출
      const service = await AIServiceFactory.createService(serviceId, modelId);
      if (!service) return null;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

      const response = await service.chat(messages, { temperature, max_tokens: maxTokens });

      const responseText = response?.content || response?.text;
      if (responseText) {
        console.log(`[SessionDigest] DigestLLM OK (${serviceId}/${modelId})`);
        return responseText;
      }
    } catch (e) {
      console.warn('[SessionDigest] DigestLLM call failed:', e.message);
    }
    return null;
  }

  /**
   * 규칙 기반 청크 처리 (폴백)
   * Ollama 없을 때도 최소한의 요약 + 메모리 추출
   */
  _processChunkRuleBased(chunk) {
    if (!chunk || chunk.length === 0) return null;

    const userMsgs = chunk.filter(m => m.role === 'user');
    const assistantMsgs = chunk.filter(m => m.role === 'assistant');

    // 요약: 유저 발화 키워드 추출 (첫 + 마지막)
    const firstUser = (userMsgs[0]?.content || '').substring(0, 80);
    const lastUser = userMsgs.length > 1
      ? (userMsgs[userMsgs.length - 1]?.content || '').substring(0, 80)
      : '';
    const summary = lastUser
      ? `${firstUser}... → ${lastUser}...`
      : firstUser ? `${firstUser}...` : '(내용 없음)';

    // 키워드 추출
    const keywordSet = new Set();
    for (const msg of [...userMsgs, ...assistantMsgs]) {
      const text = (msg.content || '').substring(0, 300);
      // 2글자 이상 한글 단어 추출
      const words = text.match(/[가-힣]{2,10}/g) || [];
      for (const w of words) {
        if (!/^(그래서|그리고|하지만|근데|그런데|아니면|그러면|이거|저거|여기|거기)$/.test(w)) {
          keywordSet.add(w);
        }
      }
    }

    return { summary, memories: [], keywords: [...keywordSet].slice(0, 10), entities: [], actions: [] };
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

    // 요약 프롬프트 구성
    let summaryPrompt;
    let systemMsg;
    if (this.previousSummary) {
      summaryPrompt = `이전 세션 요약:\n${this.previousSummary}\n\n새로 추가된 대화 요약:\n${chunkSummaries}\n\n위 둘을 합쳐서 전체를 5-8문장으로 다시 정리해. 중복 줄이고, 중요한 결정/다짐/감정변화는 꼭 남겨. 요약만 출력.`;
      systemMsg = '이전 요약과 새 대화를 합쳐 전체 세션을 정리해. 5-8문장, 시간순서 유지. 요약만 출력.';
    } else {
      summaryPrompt = chunkSummaries;
      systemMsg = '대화 청크 요약들을 3-5문장으로 통합 정리해. 시간순서 유지, 중요한 결정/다짐/감정변화 포함. 요약만 출력.';
    }

    const _sumStart = Date.now();

    // 1) Ollama
    if (alba && alba.initialized) {
      try {
        const result = await alba._callLLM(systemMsg, summaryPrompt);
        if (result) {
          trackAlba('digest-worker', {
            action: 'summary-merge',
            tokens: Math.ceil(summaryPrompt.length / 4),
            latencyMs: Date.now() - _sumStart,
            success: true,
            detail: 'ollama'
          });
          return result.trim();
        }
      } catch (e) {
        console.warn('[SessionDigest] Session summary LLM failed:', e.message);
      }
    }

    // 2) 다이제스트 워커 폴백
    try {
      const digestResult = await this._callDigestLLM(systemMsg, summaryPrompt);
      if (digestResult) {
        trackAlba('digest-worker', {
          action: 'summary-merge',
          tokens: Math.ceil(summaryPrompt.length / 4),
          latencyMs: Date.now() - _sumStart,
          success: true,
          detail: 'openrouter'
        });
        return digestResult.trim();
      }
    } catch (e) {
      console.warn('[SessionDigest] Session summary DigestLLM failed:', e.message);
    }

    // 3) 규칙 기반 폴백: 최대 500자 유지 (누적 방지)
    const newSummary = chunkResults.map(r => r.summary).join(' ');
    if (!this.previousSummary) return newSummary.substring(0, 500);

    // 이전 + 새 요약 합치되, 500자 넘으면 뒤쪽(최신)만 남기기
    const combined = `${this.previousSummary} ${newSummary}`;
    if (combined.length <= 500) return combined;
    return combined.substring(combined.length - 500);
  }

  async _filterAndSaveMemories() {
    return [];
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

  /**
   * 다이제스트 결과를 벡터 임베딩 — 비활성화
   *
   * Phase 3: 원문 대화 턴을 직접 임베딩하므로 다이제스트 요약 임베딩은 중단.
   * 다이제스트 JSON 파일 저장은 유지 (세션 컨텍스트용).
   * embedding-scheduler가 매일 원문을 임베딩함.
   */
  async _embedDigestResults(digest) {
    // Phase 3: 원문 임베딩으로 전환 — 다이제스트 임베딩 스킵
    // 다이제스트 JSON은 _saveDigest()에서 계속 저장됨
    console.log(`[SessionDigest] Embedding skipped (Phase 3: raw conversation embedding enabled)`);
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
*/
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
