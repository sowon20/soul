/**
 * conversation-pipeline.js
 * 대화 처리 파이프라인
 *
 * Phase 5.4.1: 대화 처리 파이프라인
 *
 * 주요 기능:
 * - 역순 메시지 추가 (최신부터 토큰 제한 내)
 * - 컨텍스트 감지 → 장기 메모리 자동 검색
 * - 80% 도달시 자동 압축
 * - 시스템 프롬프트 레이어링
 */

const { getMemoryManager } = require('./memory-layers');
const tokenCounter = require('./token-counter');
const { shouldAutoCompress, compressMessages } = require('./context-compressor');
const contextDetector = require('./context-detector');
const ProfileModel = require('../models/Profile');
const { getAgentProfileManager } = require('./agent-profile');
const { getDensityManager } = require('./density-manager');
const { getSessionDigest } = require('./session-digest');

/**
 * ConversationPipeline 클래스
 */
class ConversationPipeline {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 30000, // 30K 토큰 (비용 절감)
      model: config.model || '',
      compressionThreshold: config.compressionThreshold || 0.8, // 80%
      autoMemoryInjection: config.autoMemoryInjection !== false, // 기본 활성화
      systemPrompt: config.systemPrompt || this._getDefaultSystemPrompt()
    };

    this.memoryManager = null;
  }

  /**
   * 메시지 복잡도 판단 → 컨텍스트 윈도우 크기 결정
   *
   * 오미 피드백 반영:
   * - full도 "전체" 금지 → 최대 60턴 캡
   * - 각 레벨에 메모리/요약 주입 여부도 포함
   *
   * 레벨:
   * - minimal (3턴): 감탄사, 맞장구, 이모지, 단답
   * - light (10턴): 짧은 질문, 일상 대화
   * - medium (12턴): 보통 대화 + 요약 400tok + 메모리 600tok
   * - full (30턴 캡): 복잡한 질문 + 요약 800tok + 메모리 800tok
   */
  _assessContextNeeds(message) {
    if (!message) return { level: 'minimal', maxMessages: 3, reason: 'empty' };

    const trimmed = message.trim();
    const len = trimmed.length;

    // === minimal: 단답, 감탄사, 이모지 ===
    if (len <= 5) {
      if (/^[\p{Emoji}\s]+$/u.test(trimmed)) return { level: 'minimal', maxMessages: 3, reason: 'emoji' };
      if (/^[ㅋㅎㅇㄴㅂㅈㄷㅊㅌㅍ]+$/.test(trimmed)) return { level: 'minimal', maxMessages: 3, reason: 'shorthand' };
      if (/^(넵|응|예|네|아|음|오|ㅇ|굿|ok|ㅇㅋ|wow|lol|gg|thx|ty|np)$/i.test(trimmed)) {
        return { level: 'minimal', maxMessages: 3, reason: 'ack' };
      }
    }

    if (len <= 10) {
      if (/^(ㅋ{2,}|ㅎ{2,}|[ㅋㅎ]+[ㅋㅎ]+|하{2,}|오{2,}|와{2,}|대박|진짜|헐|레알|ㄹㅇ|맞아|그치|알겠어|알았어|좋아|고마워|감사|괜찮아)$/i.test(trimmed)) {
        return { level: 'minimal', maxMessages: 3, reason: 'reaction' };
      }
    }

    // === full: 이전 대화 참조, 복잡한 요청 (최대 60턴 캡!) ===
    const needsHistory = /아까|이전|방금|그때|위에|전에|앞에|말했던|말한|했던|했잖|그거|그건|그게|이어서|계속|다시|정리해|요약해|비교해|분석해|리뷰해/.test(trimmed);
    if (needsHistory) return { level: 'full', maxMessages: 30, reason: 'reference' };

    if (len > 200) return { level: 'full', maxMessages: 30, reason: 'long_message' };
    if (/[1-9]\.\s|첫째|둘째|그리고.*그리고|또한.*또한/.test(trimmed)) {
      return { level: 'full', maxMessages: 30, reason: 'multi_step' };
    }

    // === light: 짧은 질문/요청 (30자 이하) ===
    if (len <= 30) {
      return { level: 'light', maxMessages: 10, reason: 'short_query' };
    }

    // === medium: 나머지 ===
    return { level: 'medium', maxMessages: 12, reason: 'normal' };
  }

  /**
   * 초기화
   */
  async initialize() {
    this.memoryManager = await getMemoryManager();
  }

  /**
   * 대화 메시지 구성
   *
   * Long Context 최적화 구조:
   * 1. [System] 컨텍스트/문서 (프로필, 시간 정보 등)
   * 2. [대화 히스토리] 이전 대화
   * 3. [User] 현재 사용자 메시지 (가장 마지막)
   *
   * Claude 권장: 문서를 상단에, 쿼리를 하단에 배치하면 30% 성능 향상
   */
  async buildConversationMessages(userMessage, sessionId, options = {}) {
    try {
      if (!this.memoryManager) {
        await this.initialize();
      }

      const messages = [];
      let totalTokens = 0;

      // === 1단계: 컨텍스트/문서 섹션 (상단) ===

      // 1-1. 시스템 프롬프트 (프로필 포함)
      const { prompt: systemPrompt, timezone: profileTimezone } = await this._buildSystemPromptWithProfile(options);

      // 1-2. 시간 인지 프롬프트
      const { getTimeAwarePromptBuilder } = require('./time-aware-prompt');
      const timePromptBuilder = getTimeAwarePromptBuilder();

      const recentMsgs = this.memoryManager?.shortTerm?.messages || [];
      const lastMsgTime = recentMsgs.length > 0
        ? recentMsgs[recentMsgs.length - 1].timestamp
        : null;

      console.log(`[Pipeline] lastMsgTime: ${lastMsgTime}, messages count: ${recentMsgs.length}`);
      if (recentMsgs.length > 0) {
        const last = recentMsgs[recentMsgs.length - 1];
        console.log(`[Pipeline] Last message: role=${last.role}, timestamp=${last.timestamp}, content=${(last.content || '').substring(0, 50)}...`);
      }

      const timePrompt = await timePromptBuilder.build({
        timezone: profileTimezone,
        lastMessageTime: lastMsgTime,
        sessionDuration: 0,
        messageIndex: recentMsgs.length
      });

      // 시간 프롬프트 내용 로깅
      console.log(`[Pipeline] Time prompt:\n${timePrompt?.substring(0, 800)}`);

      // 복잡도 미리 판단
      const earlyContextNeeds = this._assessContextNeeds(userMessage);

      const level = earlyContextNeeds.level;

      // === 메모리 자동 주입 (벡터 검색 기반) ===
      // minimal이면 메모리/요약 모두 생략, light 이상이면 예산에 맞춰 주입
      // 메모리 예산표: minimal=0, light=300tok, medium=600tok, full=800tok
      let sessionSummarySection = '';
      let memorySection = '';

      if (level !== 'minimal') {
        try {
          const digest = getSessionDigest();

          // 요약 주입 (medium/full)
          if (level === 'medium' || level === 'full') {
            const summaryBudget = level === 'full' ? 800 : 400;
            sessionSummarySection = await digest.buildContextSummary(summaryBudget);
          }

          // 메모리 자동 주입: 벡터 검색으로 관련 기억 찾기
          const memoryBudget = { light: 300, medium: 600, full: 800 }[level] || 0;
          if (memoryBudget > 0) {
            memorySection = await this._autoInjectMemories(userMessage, memoryBudget);
          }

        } catch (e) {
          console.warn('[Pipeline] Context enrichment failed:', e.message);
        }
      }

      // 컨텍스트를 XML로 구조화하여 단일 시스템 메시지로 병합
      let contextContent = '<context>\n';
      contextContent += systemPrompt;
      if (timePrompt) {
        contextContent += `\n\n<time_context>\n${timePrompt}\n</time_context>`;
      }
      if (sessionSummarySection) {
        contextContent += '\n\n' + sessionSummarySection;
      }
      if (memorySection) {
        contextContent += '\n\n' + memorySection;
      }
      contextContent += '\n</context>';

      // 컨텍스트 자동 감지 - 비활성화 (AI가 recall_memory로 직접 검색)
      let contextData = null;

      messages.push({
        role: 'system',
        content: contextContent
      });
      totalTokens += this._estimateTokens(contextContent);

      // === 2단계: 대화 히스토리 (중간) ===
      // 메시지 복잡도에 따라 컨텍스트 윈도우 동적 조절
      const contextNeeds = this._assessContextNeeds(userMessage);
      console.log(`[Pipeline] Context needs: level=${contextNeeds.level}, maxMessages=${contextNeeds.maxMessages}, reason=${contextNeeds.reason}`);

      // 도구 토큰 예산: 도구당 약 700 토큰 (JSON 스키마 + 설명)
      // options.toolCount로 실제 도구 수 전달, 없으면 기본 10개 가정
      const toolCount = options.toolCount || 10;
      const estimatedToolTokens = toolCount * 700;
      const remainingTokens = this.config.maxTokens - totalTokens - this._estimateTokens(userMessage) - estimatedToolTokens;
      const historyMessages = await this._getMessagesWithinTokenLimit(sessionId, remainingTokens, contextNeeds.maxMessages);

      messages.push(...historyMessages);
      totalTokens += historyMessages.reduce((sum, m) => sum + this._estimateTokens(m.content), 0);

      // === 3단계: 현재 사용자 메시지 (가장 마지막) ===
      messages.push({
        role: 'user',
        content: userMessage
      });
      totalTokens += this._estimateTokens(userMessage);

      // 토큰 사용량 분석
      const usage = tokenCounter.analyzeUsage(messages, this.config.model);

      // 자동 압축 필요 여부 체크 (usagePercent는 0-100 범위, compressionThreshold는 0-1 범위)
      const usageRatio = usage.usagePercent / 100; // 80.5% → 0.805

      // 🚨 긴급 보호: 토큰이 100%를 초과하면 무조건 압축 (토큰 폭발 방지)
      const isOverLimit = usage.usedTokens > this.config.maxTokens;
      const needsCompression = usageRatio >= this.config.compressionThreshold || isOverLimit;

      if (needsCompression) {
        const reason = isOverLimit
          ? `EMERGENCY: Token overflow (${usage.usedTokens}/${this.config.maxTokens})`
          : `Token usage at ${usage.usagePercent.toFixed(1)}%`;
        console.log(`[Pipeline] ${reason}, triggering auto-compression`);

        const compressed = await this._autoCompress(messages, sessionId);

        // 압축 후에도 초과하면 더 강력한 압축 시도
        const postUsage = tokenCounter.analyzeUsage(compressed.messages, this.config.model);
        if (postUsage.usedTokens > this.config.maxTokens) {
          console.warn(`[Pipeline] Still over limit after compression: ${postUsage.usedTokens}/${this.config.maxTokens}`);
          // 시스템 메시지 + 최근 5개만 유지하는 극단적 압축
          const systemMsgs = compressed.messages.filter(m => m.role === 'system');
          const recentMsgs = compressed.messages.filter(m => m.role !== 'system').slice(-5);
          const emergencyMessages = [...systemMsgs, ...recentMsgs];
          console.log(`[Pipeline] Emergency truncation: ${compressed.messages.length} → ${emergencyMessages.length} messages`);
          return {
            messages: emergencyMessages,
            totalTokens: emergencyMessages.reduce((sum, m) => sum + this._estimateTokens(m.content), 0),
            compressed: true,
            emergency: true,
            usage: tokenCounter.analyzeUsage(emergencyMessages, this.config.model),
            contextData,
            contextNeeds
          };
        }

        return {
          messages: compressed.messages,
          totalTokens: compressed.totalTokens,
          compressed: true,
          usage: postUsage,
          contextData,
          contextNeeds
        };
      }

      return {
        messages,
        totalTokens,
        compressed: false,
        usage,
        contextData,
        contextNeeds
      };
    } catch (error) {
      console.error('Error building conversation messages:', error);
      throw error;
    }
  }

  /**
   * 토큰 제한 내 메시지 가져오기 (80/10/10 비율)
   * 80% - 원문 (최신 대화)
   * 10% - 느슨한 압축 (주간 요약)
   * 10% - 강한 압축 (월간 요약 또는 오래된 요약)
   */
  async _getMessagesWithinTokenLimit(sessionId, maxTokens, maxMessages = 999) {
    try {
      if (!this.memoryManager) {
        return [];
      }

      const messages = [];

      // 비율 계산
      const rawTokenBudget = Math.floor(maxTokens * 0.8);      // 80% 원문
      const summaryTokenBudget = Math.floor(maxTokens * 0.2);  // 20% 요약 (추후 10/10 분리)

      // 1. 원문 (80%) - 단기 메모리에서 최신 대화 (maxMessages로 상한 제한)
      const rawResult = this.memoryManager.shortTerm.getWithinTokenLimit(rawTokenBudget, maxMessages);
      console.log(`[Pipeline] Context: ${rawResult.messages.length}/${maxMessages} raw messages, ${rawResult.totalTokens} tokens (budget: ${rawTokenBudget})`);

      // 메시지 (assistant의 <thinking>, <tool_history> 태그는 제거 + 타임스탬프 인라인)
      const rawMessages = rawResult.messages.map(m => {
        let content = m.role === 'assistant' && m.content
          ? m.content
              .replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
              .replace(/<tool_history>[\s\S]*?<\/tool_history>\s*/g, '')
              .trim()
          : m.content;

        // 타임스탬프를 메시지 앞에 인라인 (별도 timeline 섹션 대신)
        if (m.timestamp) {
          const d = new Date(m.timestamp);
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          const timeStr = `${kst.getUTCMonth()+1}/${kst.getUTCDate()} ${kst.getUTCHours()}:${String(kst.getUTCMinutes()).padStart(2,'0')}`;
          content = `[${timeStr}] ${content}`;
        }

        return { role: m.role, content };
      });

      // 2. 주간 요약 - 자동 로드 제거
      // 설계 의도: AI가 필요할 때 recall_memory 도구로 직접 조회
      // 컨텍스트에는 "조회 가능하다"는 안내만 제공
      let summaryContent = '';

      // 3. 요약이 있으면 시스템 메시지로 먼저 추가
      if (summaryContent) {
        messages.push({
          role: 'system',
          content: summaryContent
        });
      }

      // 4. 원문 추가
      messages.push(...rawMessages);

      console.log(`[Pipeline] Context: ${rawMessages.length} raw messages + ${summaryContent ? 'summaries' : 'no summaries'}`);

      return messages;
    } catch (error) {
      console.error('Error getting messages within token limit:', error);
      return [];
    }
  }

  /**
   * 날조 응답 필터 — 도구 없이 과거 사실을 단정한 assistant 응답 제거
   * 모델이 보는 히스토리에서 나쁜 예시를 조용히 제거하여 패턴 강화 방지
   * @param {Array} messages - shortTerm 메시지 배열 (role, content, metadata 포함)
   * @returns {Array} 필터링된 메시지 배열
   */

  /**
   * 메모리 자동 주입 — 벡터 검색 기반
   * AI 판단 불필요. cosine similarity ≥ 0.5 이면 관련 있다고 봄.
   * @param {string} userMessage - 사용자 메시지
   * @param {number} tokenBudget - 이 메모리 섹션에 쓸 수 있는 토큰 예산
   * @returns {string} 메모리 프롬프트 (없으면 빈 문자열)
   */
  async _autoInjectMemories(userMessage, tokenBudget) {
    try {
      const vectorStore = require('./vector-store');
      const db = require('../db');

      // 1. 벡터 검색 (cosine similarity ≥ 0.5)
      const vectorResults = await vectorStore.search(userMessage, 5, { minSimilarity: 0.5 });

      // 2. soul_memories 테이블에서도 검색 (명시적으로 저장된 기억)
      let soulMemories = [];
      try {
        if (db.db) {
          const words = userMessage.split(/\s+/).filter(w => w.length >= 2);
          if (words.length > 0) {
            const conditions = words.slice(0, 3).map(() => 'content LIKE ?').join(' OR ');
            const params = words.slice(0, 3).map(w => `%${w}%`);
            soulMemories = db.db.prepare(
              `SELECT content, category, tags FROM soul_memories WHERE is_active = 1 AND (${conditions}) LIMIT 3`
            ).all(...params);
          }
        }
      } catch (e) {
        // soul_memories 테이블 없을 수 있음 — 무시
      }

      if (vectorResults.length === 0 && soulMemories.length === 0) {
        return '';
      }

      // 3. 토큰 예산 내에서 프롬프트 구성
      let prompt = '<related_memories>\n';
      let usedTokens = 0;

      // soul_memories 우선 (명시적 저장 = 높은 신뢰)
      for (const mem of soulMemories) {
        const line = `- ${mem.content}\n`;
        const lineTokens = this._estimateTokens(line);
        if (usedTokens + lineTokens > tokenBudget) break;
        prompt += line;
        usedTokens += lineTokens;
      }

      // 벡터 검색 결과 추가
      for (const result of vectorResults) {
        const content = result.content || '';
        // 너무 짧은 결과 스킵
        if (content.length < 10) continue;
        // 이미 soul_memories에서 비슷한 내용이 있으면 스킵
        if (soulMemories.some(m => content.includes(m.content.substring(0, 20)))) continue;

        const line = `- ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n`;
        const lineTokens = this._estimateTokens(line);
        if (usedTokens + lineTokens > tokenBudget) break;
        prompt += line;
        usedTokens += lineTokens;
      }

      if (usedTokens === 0) return '';

      prompt += '</related_memories>';
      console.log(`[Pipeline] Auto-injected ${soulMemories.length} memories + ${vectorResults.length} vector results (${usedTokens} tokens)`);
      return prompt;
    } catch (error) {
      console.error('[Pipeline] Auto memory injection failed:', error.message);
      return '';
    }
  }

  /**
   * 프로필 필드 프롬프트 구성 (Phase P)
   */
  _buildProfileFieldsPrompt(profileFields) {
    if (!profileFields || profileFields.length === 0) {
      return '';
    }

    let prompt = '\n\n=== 사용자 프로필 상세 정보 ===\n\n';
    prompt += '현재 대화와 관련된 사용자의 개인 정보입니다:\n\n';

    profileFields.forEach(field => {
      prompt += `- ${field.label}: ${field.value}\n`;
    });

    prompt += '\n=== 프로필 정보 끝 ===\n\n';
    prompt += '위 정보를 자연스럽게 참고하여 답변해주세요.\n';

    return prompt;
  }

  /**
   * 자동 압축 (DensityManager 사용 - 80/10/10 비율)
   */
  async _autoCompress(messages, sessionId) {
    try {
      // 시스템 메시지 제외
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // DensityManager로 80/10/10 압축
      const densityManager = getDensityManager({
        maxContextTokens: this.config.maxTokens,
        ratios: { level0: 0.8, level1: 0.1, level2: 0.1 }
      });
      
      const result = await densityManager.buildContext(conversationMessages);
      
      // 시스템 메시지 + 압축된 메시지
      const finalMessages = [...systemMessages, ...result.messages];

      console.log(`[AutoCompress] 80/10/10 applied: L0=${result.stats.level0}, L1=${result.stats.level1}, L2=${result.stats.level2}`);

      return {
        messages: finalMessages,
        totalTokens: finalMessages.reduce((sum, m) => sum + this._estimateTokens(m.content), 0),
        stats: result.stats
      };
    } catch (error) {
      console.error('Error auto-compressing messages:', error);
      return {
        messages,
        totalTokens: messages.reduce((sum, m) => sum + this._estimateTokens(m.content), 0)
      };
    }
  }

  /**
   * 응답 처리 및 저장
   * @param {string} userMessage - 사용자 메시지
   * @param {string} assistantResponse - AI 응답
   * @param {string} sessionId - 세션 ID
   * @param {Object} metadata - 메타데이터 (routing 포함)
   */
  async handleResponse(userMessage, assistantResponse, sessionId, metadata = {}) {
    try {
      if (!this.memoryManager) {
        await this.initialize();
      }

      // 0. 스토리지 경로 가져오기 (DB 설정 필수)
      const configManager = require('./config');
      const memoryConfig = await configManager.getMemoryConfig();
      // FTP 사용 시 storagePath 없어도 됨
      const useFTP = memoryConfig?.storageType === 'ftp' && memoryConfig?.ftp;
      if (!useFTP && !memoryConfig?.storagePath) {
        throw new Error('[Pipeline] memory.storagePath not configured. Please set it in Settings > Storage.');
      }
      console.log(`[Pipeline] Using storage: ${useFTP ? 'FTP' : memoryConfig.storagePath}`);

      // 0.1 Archiver 가져오기 (실시간 파일 저장 - DB 설정 기반)
      const { getArchiverAsync } = require('./conversation-archiver');
      const archiver = await getArchiverAsync();

      // 0.2 PendingEvent 매니저 가져오기
      const { getPendingEventManager } = require('./pending-event');
      const pendingEventManager = await getPendingEventManager(memoryConfig?.storagePath);

      // 0.2.1 대화 흐름 추적
      const { getConversationFlowTracker } = require('./conversation-flow');
      const flowTracker = getConversationFlowTracker();
      flowTracker.processMessage({ content: userMessage, role: 'user' });

      // 0.2.2 사용자 패턴 학습
      const { getUserPatternLearner } = require('./user-pattern');
      const patternLearner = await getUserPatternLearner(memoryConfig?.storagePath);
      await patternLearner.learnFromMessage({ content: userMessage, timestamp: new Date() });
      
      // 0.2 복귀 체크 (이전에 떠남 이벤트가 있었으면)
      let returnEvent = null;
      const timeContext = pendingEventManager.generateTimeContext();
      if (timeContext) {
        returnEvent = await pendingEventManager.recordReturn({ content: userMessage });
      }
      
      // 0.3 떠남 이벤트 감지
      let departureEvent = null;
      const departure = pendingEventManager.detectDeparture({ content: userMessage });
      if (departure.detected) {
        departureEvent = await pendingEventManager.recordDeparture({ content: userMessage }, departure);
      }
      
      // 마지막 메시지 시간 가져오기 (침묵 시간 계산용)
      let lastMessageTime = null;
      const recentMessages = this.memoryManager.shortTerm?.messages || [];
      if (recentMessages.length > 0) {
        lastMessageTime = recentMessages[recentMessages.length - 1].timestamp;
      }
      
      // 세션 정보 계산
      const sessionStartTime = recentMessages.length > 0 
        ? new Date(recentMessages[0].timestamp)
        : new Date();
      const messageIndex = recentMessages.length; // 현재 메시지가 몇 번째인지

      // 1. 사용자 메시지 저장 (명시적 타임스탬프)
      const userTimestamp = new Date();
      await this.memoryManager.addMessage({
        role: 'user',
        content: userMessage,
        timestamp: userTimestamp
      }, sessionId);
      
      // 1.1 사용자 메시지 파일 아카이브
      const timezone = metadata?.timezone || 'Asia/Seoul';
      const sessionDuration = Math.floor((userTimestamp.getTime() - sessionStartTime.getTime()) / 1000);
      await archiver.archiveMessage({
        role: 'user',
        content: userMessage,
        timestamp: userTimestamp,
        tokens: this._estimateTokens(userMessage),
        attachments: metadata?.attachments || undefined,
        sessionMeta: {
          sessionId,
          sessionDuration,
          messageIndex
        },
        eventMeta: {
          returnEvent: returnEvent?.interpretation || null,
          departureEvent: departureEvent ? { type: departureEvent.type, reason: departureEvent.reason } : null,
          timeContext
        }
      }, lastMessageTime, timezone);

      // 2. 어시스턴트 응답 저장 (사용자 메시지보다 최소 1ms 뒤)
      // TTS 태그([laughter] 등)는 음성 전용이므로 메모리에서 제거
      const cleanedResponse = assistantResponse.replace(/\[laughter\]/gi, '').replace(/ {2,}/g, ' ').trim();
      const assistantTimestamp = new Date(userTimestamp.getTime() + 1);
      await this.memoryManager.addMessage({
        role: 'assistant',
        content: cleanedResponse,
        timestamp: assistantTimestamp,
        ...metadata
      }, sessionId);

      // 2.1 어시스턴트 응답 파일 아카이브
      const responseTime = metadata?.processingTime ||
        (assistantTimestamp.getTime() - userTimestamp.getTime()) / 1000;
      await archiver.archiveMessage({
        role: 'assistant',
        content: cleanedResponse,
        timestamp: assistantTimestamp,
        tokens: this._estimateTokens(assistantResponse),
        sessionMeta: {
          sessionId,
          sessionDuration: sessionDuration + 1, // user보다 1초 뒤
          messageIndex: messageIndex + 1
        },
        metadata: {
          ...metadata,
          responseTime
        },
        // 라우팅 정보 (이전 메시지 표시용)
        routing: metadata?.routing || null
      }, userTimestamp, timezone);

      // === 실시간 벡터 임베딩 (비동기 — 응답 차단 안 함) ===
      this._embedMessages(userMessage, cleanedResponse, userTimestamp, assistantTimestamp).catch(err => {
        console.warn('[Pipeline] Embedding failed (non-blocking):', err.message);
      });

      // === 세션 다이제스트 트리거 (비동기 — 응답 차단 안 함) ===
      const digest = getSessionDigest();
      const currentMessages = this.memoryManager.shortTerm?.messages || [];
      if (digest.shouldDigest(currentMessages)) {
        // fire-and-forget: 응답에 영향 없음
        digest.runDigest(currentMessages, sessionId).catch(err => {
          console.error('[Pipeline] Digest error (non-blocking):', err.message);
        });
      }

      return {
        success: true,
        sessionId
      };
    } catch (error) {
      console.error('Error handling response:', error);
      throw error;
    }
  }

  /**
   * 프로필 포함 시스템 프롬프트 구성 (Phase P)
   *
   * Long Context 최적화: XML 태그로 구조화
   * - 문서/정보는 상단에 배치
   * - 지침은 하단에 배치
   */
  async _buildSystemPromptWithProfile(options = {}) {
    let userTimezone = 'Asia/Seoul';

    // === 1. 인격/역할 정의 (기본 프롬프트) ===
    let basePrompt = options.systemPrompt || this.config.systemPrompt;

    // === 2. 사용자 프로필 (문서 섹션) ===
    let profileSection = '';
    try {
      const userId = options.userId || 'default';
      const profile = await ProfileModel.getOrCreateDefault(userId);

      // 프로필에서 timezone 가져오기
      const tz = profile.basicInfo?.timezone?.value;
      if (tz) userTimezone = tz;

      // 프로필 섹션 제거: chat.js에서 이미 처리하고 있음 (중복 방지)
      // timezone만 가져오고 프로필 내용은 chat.js에 맡김
      // recordAccess 제거 — Profile 모델에 미구현 메서드
    } catch (error) {
      console.error('Error loading profile for system prompt:', error);
    }

    // === 3. 시간 정보 ===
    // (제거: chat.js의 <time_context>에서 더 상세하게 제공)

    // === 4. 사용자 커스텀 프롬프트 ===
    let customSection = '';
    try {
      const agentManager = getAgentProfileManager();
      const agentProfile = agentManager.getProfile('default');
      if (agentProfile && agentProfile.customPrompt && agentProfile.customPrompt.trim()) {
        customSection = `<custom_instructions>\n${agentProfile.customPrompt.trim()}\n</custom_instructions>`;
        console.log(`[Pipeline] Custom prompt added: ${agentProfile.customPrompt.substring(0, 50)}...`);
      }
    } catch (error) {
      console.warn('[Pipeline] Failed to load custom prompt:', error.message);
    }

    // === 최종 조합: 문서(상단) → 인격 → 지침(하단) ===
    let prompt = '';

    // 문서/정보 섹션 (상단)
    if (profileSection) {
      prompt += profileSection + '\n\n';
    }

    // 인격/역할 정의
    prompt += basePrompt;

    // 지침 섹션 (하단)
    if (customSection) {
      prompt += '\n\n' + customSection;
    }
    // core_principles 제거: chat.js의 <instructions>와 중복/모순되므로 삭제

    // 추가 옵션
    if (options.userContext) {
      prompt += `\n\n<additional_context>\n${JSON.stringify(options.userContext, null, 2)}\n</additional_context>`;
    }
    if (options.additionalInstructions) {
      prompt += `\n\n<additional_instructions>\n${options.additionalInstructions}\n</additional_instructions>`;
    }

    return { prompt, timezone: userTimezone };
  }

  /**
   * 시스템 프롬프트 동적 구성 (하위 호환성)
   */
  buildSystemPrompt(options = {}) {
    return this._buildSystemPromptWithProfile(options);
  }

  /**
   * 대화 세션 정리
   */
  async cleanupSession(sessionId) {
    try {
      if (!this.memoryManager) {
        await this.initialize();
      }

      // 세션 요약 생성
      await this.memoryManager.summarizeSession(sessionId);

      // 아카이브
      await this.memoryManager.archiveOldMessages(sessionId);

      return {
        success: true,
        message: 'Session cleaned up successfully'
      };
    } catch (error) {
      console.error('Error cleaning up session:', error);
      throw error;
    }
  }

  /**
   * 기본 시스템 프롬프트 - 개인 AI (사용자명은 프로필에서 주입됨)
   */
  _getDefaultSystemPrompt() {
    // 파인튜닝 모델 전용 최소 프롬프트
    return `나는 사용자의 개인 AI. 사용자를 깊이 이해하고 기억하는 존재.

**핵심 원칙:**
- 사용자에 대한 건 선명하게 기억 (희미하면 recall_memory)
- 새로 알게 된 건 저장 (update_profile)
- 추측 금지: 모르면 찾고, 없으면 솔직히 말하기

**응답 형식 (절대 규칙):**
⚠️ 시간 정보(현재, 마지막 대화 등)는 내부 참고용 — 응답 텍스트에 절대 반복하지 말 것
⚠️ [시간] 접두사 절대 금지: [2/14 7:43], [7:43], [8:00] 등 어떤 형태든 쓰지 말 것
- 잘못: "[2/14 7:43] 안녕" / "8시간 정도. 아침 8시에..."
- 올바름: "안녕" / "3시간만이네"
- 바로 내용으로 시작
- 인용(>)은 꼭 필요할 때만
- 영어 인사나 이모지 하트(💝💖💕 등) 남발 금지 — 자연스러운 한국어로만`;
  }

  /**
   * 토큰 추정
   */
  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * 실시간 벡터 임베딩 (비동기)
   * 사용자 메시지와 어시스턴트 응답을 벡터 스토어에 저장
   */
  async _embedMessages(userMessage, assistantResponse, userTimestamp, assistantTimestamp) {
    console.log('[Pipeline] _embedMessages called:', { userLen: userMessage?.length, assistantLen: assistantResponse?.length });
    try {
      const vectorStore = require('./vector-store');

      // 사용자 메시지 임베딩
      if (userMessage && userMessage.trim()) {
        const userId = `${new Date(userTimestamp).toISOString().replace(/[:.]/g, '-')}_user`;
        await vectorStore.addMessage({
          id: userId,
          text: userMessage,
          role: 'user',
          timestamp: userTimestamp
        });
      }

      // 어시스턴트 응답 임베딩
      if (assistantResponse && assistantResponse.trim()) {
        const assistantId = `${new Date(assistantTimestamp).toISOString().replace(/[:.]/g, '-')}_assistant`;
        await vectorStore.addMessage({
          id: assistantId,
          text: assistantResponse,
          role: 'assistant',
          timestamp: assistantTimestamp
        });
      }

      console.log('[Pipeline] Embedded user + assistant messages');
    } catch (error) {
      console.warn('[Pipeline] Embedding failed:', error.message);
      // 임베딩 실패해도 대화는 계속
    }
  }
}

/**
 * 전역 인스턴스
 */
let globalPipeline = null;

/**
 * 싱글톤 인스턴스 가져오기
 * 사용자 메모리 설정을 자동으로 로드
 */
async function getConversationPipeline(config = {}) {
  if (!globalPipeline) {
    // configManager에서 메모리 설정 로드
    let memoryConfig = {};
    try {
      const configManager = require('./config');
      memoryConfig = await configManager.getMemoryConfig();
      console.log('[ConversationPipeline] Loaded memory config:', memoryConfig);
    } catch (err) {
      console.warn('[ConversationPipeline] Could not load memory config:', err.message);
    }

    // 사용자 설정과 기본값 병합
    const mergedConfig = {
      ...config,
      compressionThreshold: (memoryConfig.compressionThreshold || 80) / 100, // 80 -> 0.8
      autoMemoryInjection: memoryConfig.autoInject ?? config.autoMemoryInjection ?? true
    };

    globalPipeline = new ConversationPipeline(mergedConfig);
    globalPipeline.memoryConfig = memoryConfig; // memoryConfig를 인스턴스에 저장
    await globalPipeline.initialize();
  }
  return globalPipeline;
}

/**
 * ConversationPipeline 인스턴스 리셋 (설정 변경 시)
 */
function resetConversationPipeline() {
  globalPipeline = null;
  console.log('[ConversationPipeline] Pipeline reset');
}

module.exports = {
  ConversationPipeline,
  getConversationPipeline,
  resetConversationPipeline
};
