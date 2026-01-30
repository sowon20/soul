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

/**
 * ConversationPipeline 클래스
 */
class ConversationPipeline {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 30000, // 30K 토큰 (비용 절감)
      model: config.model || 'claude-3-5-sonnet-20241022',
      compressionThreshold: config.compressionThreshold || 0.8, // 80%
      autoMemoryInjection: config.autoMemoryInjection !== false, // 기본 활성화
      systemPrompt: config.systemPrompt || this._getDefaultSystemPrompt()
    };

    this.memoryManager = null;
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
      const systemPrompt = await this._buildSystemPromptWithProfile(options);

      // 1-2. 시간 인지 프롬프트
      const { getTimeAwarePromptBuilder } = require('./time-aware-prompt');
      const timePromptBuilder = getTimeAwarePromptBuilder();

      const recentMsgs = this.memoryManager?.shortTerm?.messages || [];
      const lastMsgTime = recentMsgs.length > 0
        ? recentMsgs[recentMsgs.length - 1].timestamp
        : null;

      const timePrompt = await timePromptBuilder.build({
        timezone: options.timezone || 'Asia/Seoul',
        lastMessageTime: lastMsgTime,
        sessionDuration: 0,
        messageIndex: recentMsgs.length
      });

      // 컨텍스트를 XML로 구조화하여 단일 시스템 메시지로 병합
      let contextContent = '<context>\n';
      contextContent += systemPrompt;
      if (timePrompt) {
        contextContent += `\n\n<time_context>\n${timePrompt}\n</time_context>`;
      }
      contextContent += '\n</context>';

      messages.push({
        role: 'system',
        content: contextContent
      });
      totalTokens += this._estimateTokens(contextContent);

      // 컨텍스트 자동 감지 - 비활성화 (AI가 recall_memory로 직접 검색)
      let contextData = null;

      // === 2단계: 대화 히스토리 (중간) ===
      const remainingTokens = this.config.maxTokens - totalTokens - this._estimateTokens(userMessage);
      const historyMessages = await this._getMessagesWithinTokenLimit(sessionId, remainingTokens);

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
            contextData
          };
        }

        return {
          messages: compressed.messages,
          totalTokens: compressed.totalTokens,
          compressed: true,
          usage: postUsage,
          contextData
        };
      }

      return {
        messages,
        totalTokens,
        compressed: false,
        usage,
        contextData
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
  async _getMessagesWithinTokenLimit(sessionId, maxTokens) {
    try {
      if (!this.memoryManager) {
        return [];
      }

      const messages = [];
      
      // 비율 계산
      const rawTokenBudget = Math.floor(maxTokens * 0.8);      // 80% 원문
      const summaryTokenBudget = Math.floor(maxTokens * 0.2);  // 20% 요약 (추후 10/10 분리)

      // 1. 원문 (80%) - 단기 메모리에서 최신 대화
      const rawResult = this.memoryManager.shortTerm.getWithinTokenLimit(rawTokenBudget);
      console.log(`[Pipeline] Context: ${rawResult.messages.length} raw messages, ${rawResult.totalTokens} tokens (budget: ${rawTokenBudget})`);
      const rawMessages = rawResult.messages.map(m => ({
        role: m.role,
        content: m.content
      }));

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
   * 컨텍스트 감지 및 메모리 주입
   */
  async _detectAndInjectContext(userMessage, sessionId) {
    try {
      // 컨텍스트 감지 및 관련 메모리 검색
      const contextResult = await contextDetector.detectAndRetrieve(userMessage, {
        sessionId,
        includeMemories: true
      });

      if (!contextResult || !contextResult.activated) {
        return null;
      }

      return contextResult;
    } catch (error) {
      console.error('Error detecting context:', error);
      return null;
    }
  }

  /**
   * 메모리 프롬프트 구성
   */
  _buildMemoryPrompt(memories) {
    if (!memories || memories.length === 0) {
      return '';
    }

    let prompt = '\n\n=== 관련 과거 대화 ===\n\n';

    memories.forEach((memory, index) => {
      prompt += `[${index + 1}] ${memory.date}`;
      if (memory.topics && memory.topics.length > 0) {
        prompt += ` - 주제: ${memory.topics.join(', ')}`;
      }
      prompt += '\n';

      if (memory.summary) {
        prompt += `요약: ${memory.summary}\n`;
      }

      prompt += '\n';
    });

    prompt += '=== 과거 대화 끝 ===\n\n';
    prompt += '위 과거 대화를 참고하여 사용자의 현재 질문에 답변해주세요.\n';

    return prompt;
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
   */
  async handleResponse(userMessage, assistantResponse, sessionId, metadata = {}) {
    try {
      if (!this.memoryManager) {
        await this.initialize();
      }

      // 0. Archiver 가져오기 (실시간 파일 저장)
      const { getArchiver } = require('./conversation-archiver');
      const archiver = getArchiver(this.memoryConfig?.storagePath || './memory');
      
      // 0.1 PendingEvent 매니저 가져오기
      const { getPendingEventManager } = require('./pending-event');
      const pendingEventManager = await getPendingEventManager(this.memoryConfig?.storagePath || './memory');
      
      // 0.1.1 대화 흐름 추적
      const { getConversationFlowTracker } = require('./conversation-flow');
      const flowTracker = getConversationFlowTracker();
      flowTracker.processMessage({ content: userMessage, role: 'user' });
      
      // 0.1.2 사용자 패턴 학습
      const { getUserPatternLearner } = require('./user-pattern');
      const patternLearner = await getUserPatternLearner(this.memoryConfig?.storagePath || './memory');
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
      const assistantTimestamp = new Date(userTimestamp.getTime() + 1);
      await this.memoryManager.addMessage({
        role: 'assistant',
        content: assistantResponse,
        timestamp: assistantTimestamp,
        ...metadata
      }, sessionId);
      
      // 2.1 어시스턴트 응답 파일 아카이브
      const responseTime = metadata?.processingTime || 
        (assistantTimestamp.getTime() - userTimestamp.getTime()) / 1000;
      await archiver.archiveMessage({
        role: 'assistant',
        content: assistantResponse,
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
        }
      }, userTimestamp, timezone);

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

      if (profile.permissions.autoIncludeInContext) {
        const profileSummary = profile.generateSummary(profile.permissions.readScope);
        const basicInfo = profileSummary.basicInfo || {};

        const name = basicInfo.name || '';
        const nickname = basicInfo.nickname ? ` (${basicInfo.nickname})` : '';
        const location = basicInfo.location || '';
        const tz = typeof basicInfo.timezone === 'string'
          ? basicInfo.timezone
          : (basicInfo.timezone?.value || 'Asia/Seoul');

        userTimezone = tz;

        // 프로필 정보를 XML로 구조화
        profileSection = '<user_profile>\n';
        if (name) profileSection += `이름: ${name}${nickname}\n`;
        if (location) profileSection += `위치: ${location}\n`;

        // 커스텀 필드
        if (profileSummary.customFields && profileSummary.customFields.length > 0) {
          const fields = profileSummary.customFields.filter(f => f.value);
          for (const field of fields) {
            const value = field.value.length > 50
              ? field.value.substring(0, 47) + '...'
              : field.value;
            profileSection += `${field.label}: ${value}\n`;
          }
        }
        profileSection += '</user_profile>';

        await profile.recordAccess('soul');
      }
    } catch (error) {
      console.error('Error loading profile for system prompt:', error);
    }

    // === 3. 시간 정보 ===
    let timeSection = '';
    if (options.includeTime !== false) {
      const now = new Date();
      timeSection = `<current_time>${now.toLocaleString('ko-KR', { timeZone: userTimezone })}</current_time>`;
    }

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

    // === 5. 핵심 원칙 (지침 섹션) ===
    const coreInstructions = `<core_principles>
메모리 활용:
- 현재 대화 → 바로 참조
- 과거 대화 → recall_memory(키워드)
- 프로필 상세 → get_profile()

판단: 추측하려는 순간 = 도구 써야 하는 순간
</core_principles>`;

    // === 최종 조합: 문서(상단) → 인격 → 지침(하단) ===
    let prompt = '';

    // 문서/정보 섹션 (상단)
    if (profileSection) prompt += profileSection + '\n\n';
    if (timeSection) prompt += timeSection + '\n\n';

    // 인격/역할 정의
    prompt += basePrompt;

    // 지침 섹션 (하단)
    if (customSection) prompt += '\n\n' + customSection;
    prompt += '\n\n' + coreInstructions;

    // 추가 옵션
    if (options.userContext) {
      prompt += `\n\n<additional_context>\n${JSON.stringify(options.userContext, null, 2)}\n</additional_context>`;
    }
    if (options.additionalInstructions) {
      prompt += `\n\n<additional_instructions>\n${options.additionalInstructions}\n</additional_instructions>`;
    }

    return prompt;
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
    return `나는 사용자의 개인 AI.

**나의 역할:**
- 이 사용자만을 위한 개인 비서이자 동반자
- 사용자를 깊이 이해하고 기억하는 존재
- 일반 AI가 아닌, 사용자와 관계를 쌓아가는 AI

**핵심 원칙:**
- 사용자에 대한 건 선명하게 기억 (희미하면 recall_memory)
- 새로 알게 된 건 저장 (update_profile)
- 추측 금지: 모르면 찾고, 없으면 솔직히 말하기
- 일관된 인격 유지

**대화 스타일:**
- 편한 대화체, 핵심만 간결하게
- 사용자 말투에 자연스럽게 맞춤`;
  }

  /**
   * 토큰 추정
   */
  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
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
