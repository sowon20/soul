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

    // 1) Ollama (로컬 LLM)
    if (alba && alba.initialized) {
      return await this._processChunkWithLLM(conversationText, alba);
    }

    // 2) 다이제스트 워커 (역할 기반 — OpenRouter 등)
    const digestResult = await this._processChunkWithDigestLLM(conversationText);
    if (digestResult) return digestResult;

    // 3) 규칙 기반 폴백
    return this._processChunkRuleBased(chunk);
  }

  /**
   * LLM 청크 처리 — JSON 한 줄 프롬프트 (파싱 안정성)
   */
  async _processChunkWithLLM(conversationText, alba) {
    const systemPrompt = `대화 조각을 분석해서 아래 JSON 형식으로만 응답해. 다른 텍스트 없이 JSON만.
{"summary":"핵심 내용 2-3문장","memories":["유저에 대한 영구적 사실/취향/목표 0~5개"],"keywords":["이 대화의 핵심 검색 키워드 3~10개"],"entities":["고유명사/인물/관계/호칭/장소/서비스명 등"],"actions":["유저가 할 일/결정 0~5개, 동사로 시작"]}
규칙:
- memories는 "유저는 ~" 형태의 확정된 사실만. 일시적(오늘 기분, 어제 일) 제외
- 유저가 부정/정정한 내용은 부정형으로 저장
- 확인 안 된 추측은 저장 금지
- keywords: 나중에 이 대화를 찾을 때 쓸 검색어. 동의어/유사어도 포함 (예: 별명→호칭,이름,닉네임)
- entities: 사람 이름, AI 호칭, 관계("엄마=영희"), 서비스명, 프로젝트명 등 고유명사는 빠짐없이
- 호칭/별명/관계 정보는 memories와 entities 양쪽에 반드시 기록`;

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
{"summary":"핵심 내용 2-3문장","memories":["유저에 대한 영구적 사실/취향/목표 0~5개"],"keywords":["이 대화의 핵심 검색 키워드 3~10개"],"entities":["고유명사/인물/관계/호칭/장소/서비스명 등"],"actions":["유저가 할 일/결정 0~5개, 동사로 시작"]}
규칙:
- memories는 "유저는 ~" 형태의 확정된 사실만. 일시적(오늘 기분, 어제 일) 제외
- 유저가 부정/정정한 내용은 부정형으로 저장
- 확인 안 된 추측은 저장 금지
- keywords: 나중에 이 대화를 찾을 때 쓸 검색어. 동의어/유사어도 포함 (예: 별명→호칭,이름,닉네임)
- entities: 사람 이름, AI 호칭, 관계("엄마=영희"), 서비스명, 프로젝트명 등 고유명사는 빠짐없이
- 호칭/별명/관계 정보는 memories와 entities 양쪽에 반드시 기록`;

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

      const modelId = digestRole.preferredModel || 'openai/gpt-oss-20b:free';
      const roleConfig = typeof digestRole.config === 'string'
        ? JSON.parse(digestRole.config)
        : (digestRole.config || {});
      const serviceId = roleConfig.serviceId || 'openrouter';
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

    // 메모리: 규칙 기반 키워드 매칭
    const memories = [];
    const memoryPatterns = [
      // "나는 ~" "나 ~" 형태의 자기 진술
      /(?:나는|내가|저는|제가)\s*(.{10,50}?)(?:[.!?]|$)/g,
      // 좋아하다/싫어하다
      /(.{5,30}?(?:좋아|싫어|관심|선호|취향|취미)(?:해|해요|한다|합니다|하는|이야)?)/g,
      // 직업/학교/전공
      /(?:직업|일|회사|학교|전공|근무|개발|코딩)[^\n.]{5,40}/g,
      // 목표/계획
      /(?:목표|계획|하려고|할 예정|되고 싶|만들고 싶|하고 싶)[^\n.]{5,40}/g,
      // 호칭/별명
      /(?:부르|불러|호칭|별명|이름은|이름이)[^\n.]{3,40}/g,
      // 관계 정보
      /(?:엄마|아빠|형|누나|동생|언니|오빠|남편|아내|친구|동료|여자친구|남자친구|반려)[^\n.]{3,40}/g,
    ];

    for (const msg of userMsgs) {
      const text = (msg.content || '').substring(0, 500);
      for (const pattern of memoryPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const memText = (match[1] || match[0]).trim();
          if (memText.length >= 10 && memText.length <= 100 && memories.length < 3) {
            // 중복 방지
            if (!memories.some(m => m.includes(memText.substring(0, 15)))) {
              memories.push(`유저: ${memText}`);
            }
          }
        }
      }
    }

    // 규칙 기반 키워드 추출
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

    return { summary, memories, keywords: [...keywordSet].slice(0, 10), entities: [], actions: [] };
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

    // 1) Ollama
    if (alba && alba.initialized) {
      try {
        const result = await alba._callLLM(systemMsg, summaryPrompt);
        if (result) return result.trim();
      } catch (e) {
        console.warn('[SessionDigest] Session summary LLM failed:', e.message);
      }
    }

    // 2) 다이제스트 워커 폴백
    try {
      const digestResult = await this._callDigestLLM(systemMsg, summaryPrompt);
      if (digestResult) return digestResult.trim();
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

  /**
   * 메모리 필터링 + 저장
   * 임베딩 기반 의미적 중복 체크 (90% 이상 유사도면 중복)
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
      const vectorStore = require('./vector-store');

      for (const memText of toSave) {
        // 중복 체크: 임베딩 기반 의미적 유사도
        const allActive = await SelfRule.find({ is_active: 1 });

        let isDuplicate = false;
        let bestMatch = null;
        let bestSimilarity = 0;
        let newEmbedding = null;

        // 1) 임베딩 기반 중복 체크 시도
        try {
          newEmbedding = await vectorStore.embed(memText);

          if (newEmbedding && newEmbedding.length > 0) {
            // 기존 메모리와 코사인 유사도 비교 (저장된 임베딩 재사용)
            for (const existing of allActive) {
              const existingText = existing.rule || '';
              if (existingText.length < 10) continue;

              // 저장된 임베딩 사용 (없으면 스킵)
              let existingEmbedding = null;
              if (existing.embedding) {
                try {
                  existingEmbedding = JSON.parse(existing.embedding);
                } catch (e) {
                  // 파싱 실패 시 스킵
                  continue;
                }
              } else {
                // 임베딩 없으면 스킵 (새로 생성하지 않음)
                continue;
              }

              if (!existingEmbedding || existingEmbedding.length === 0) continue;

              const similarity = this._cosineSimilarity(newEmbedding, existingEmbedding);

              if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = existingText;
              }

              // 90% 이상 유사하면 중복으로 판단
              if (similarity >= 0.90) {
                console.log(`[SessionDigest] Semantic duplicate found (${(similarity*100).toFixed(1)}%):`);
                console.log(`  새 메모리: ${memText.substring(0, 60)}...`);
                console.log(`  기존 메모리: ${existingText.substring(0, 60)}...`);
                isDuplicate = true;
                break;
              }
            }

            // 임베딩 기반 체크 완료
            if (isDuplicate) continue;

            // 70-90% 유사도: 경고만 출력하고 저장은 진행
            if (bestSimilarity >= 0.70 && bestSimilarity < 0.90) {
              console.log(`[SessionDigest] Similar memory (${(bestSimilarity*100).toFixed(1)}%), saving anyway:`);
              console.log(`  새 메모리: ${memText.substring(0, 60)}...`);
              console.log(`  유사 메모리: ${bestMatch?.substring(0, 60)}...`);
            }
          }
        } catch (embeddingError) {
          // 임베딩 실패 시 텍스트 기반 폴백
          console.warn('[SessionDigest] Embedding check failed, using text similarity:', embeddingError.message);

          const normalized = memText.toLowerCase().replace(/[.,!?]/g, '').trim();

          for (const existing of allActive) {
            const existingNorm = (existing.rule || '').toLowerCase().replace(/[.,!?]/g, '').trim();

            // 완전 일치
            if (existingNorm === normalized) {
              isDuplicate = true;
              break;
            }

            // 유사도 체크 (한쪽이 다른 쪽을 70% 이상 포함)
            const longer = existingNorm.length > normalized.length ? existingNorm : normalized;
            const shorter = existingNorm.length > normalized.length ? normalized : existingNorm;
            const similarity = this._calculateSimilarity(shorter, longer);

            if (similarity > 0.7) {
              console.log(`[SessionDigest] Text-based duplicate (${(similarity*100).toFixed(0)}%), skip: ${memText.substring(0, 40)}...`);
              isDuplicate = true;
              break;
            }
          }
        }

        if (isDuplicate) continue;

        const category = this._inferCategory(memText);
        // confidence: 영구적 표현이 있으면 높게
        const confidence = /항상|매일|늘|주로|좋아하|싫어하|관심/.test(memText) ? 0.9 : 0.7;

        // 메모리 저장 (임베딩 포함)
        await SelfRule.create({
          rule: memText,
          category,
          priority: Math.round(confidence * 10),  // 0.9 → 9, 0.7 → 7
          context: `digest:auto (${new Date().toLocaleDateString('ko-KR')}) conf=${confidence}`,
          tokenCount: Math.ceil(memText.length / 4),
          embedding: newEmbedding ? JSON.stringify(newEmbedding) : null
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
   * 문자열 유사도 계산 (간단한 포함 기반 - 임베딩 폴백용)
   */
  _calculateSimilarity(shorter, longer) {
    if (!shorter || !longer) return 0;

    // 짧은 문자열이 긴 문자열에 포함되면 유사도 높음
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // 단어 단위로 비교
    const shorterWords = shorter.split(/\s+/);
    const longerWords = longer.split(/\s+/);
    const matchingWords = shorterWords.filter(w => longerWords.includes(w));

    return matchingWords.length / shorterWords.length;
  }

  /**
   * 코사인 유사도 계산 (벡터 임베딩용)
   */
  _cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) return 0;

    return dotProduct / (mag1 * mag2);
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

  /**
   * 다이제스트 결과를 벡터 임베딩 (fire-and-forget)
   */
  async _embedDigestResults(digest) {
    try {
      const vectorStore = require('./vector-store');
      let embedded = 0;

      // 키워드+엔티티를 태그로 활용
      const extraTags = [
        ...(digest.keywords || []),
        ...(digest.entities || [])
      ];

      // 1. 세션 요약 임베딩 (키워드/엔티티 포함)
      if (digest.summary && digest.summary.length >= 10) {
        // 요약 + 키워드/엔티티를 합쳐서 임베딩 (검색 적중률 향상)
        const enrichedSummary = extraTags.length > 0
          ? `${digest.summary}\n[키워드: ${extraTags.join(', ')}]`
          : digest.summary;

        await vectorStore.addMessage({
          id: `digest_summary_${Date.now()}`,
          content: enrichedSummary,
          role: 'system',
          sessionId: 'embeddings',
          timestamp: digest.timestamp,
          tags: ['digest', 'summary', ...extraTags]
        });
        embedded++;
      }

      // 2. 추출된 메모리 각각 임베딩
      for (const mem of (digest.memories || [])) {
        const memText = typeof mem === 'string' ? mem : (mem.text || '');
        if (!memText || memText.length < 10) continue;

        await vectorStore.addMessage({
          id: `digest_mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          content: memText,
          role: 'system',
          sessionId: 'embeddings',
          timestamp: digest.timestamp,
          tags: ['digest', 'memory', ...extraTags]
        });
        embedded++;
      }

      if (embedded > 0) {
        console.log(`[SessionDigest] Embedded ${embedded} items (tags: ${extraTags.length} keywords/entities)`);
      }
    } catch (e) {
      console.warn('[SessionDigest] Embedding failed:', e.message);
    }
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
