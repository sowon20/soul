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
      maxTokens: config.maxTokens || 100000, // 기본 100K 토큰
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
   */
  async buildConversationMessages(userMessage, sessionId, options = {}) {
    try {
      if (!this.memoryManager) {
        await this.initialize();
      }

      const messages = [];
      let totalTokens = 0;

      // 1. 시스템 프롬프트 추가 (프로필 요약 포함)
      const systemPrompt = await this._buildSystemPromptWithProfile(options);
      messages.push({
        role: 'system',
        content: systemPrompt
      });
      totalTokens += this._estimateTokens(systemPrompt);

      // 1.5 시간 인지 프롬프트 추가
      const { getTimeAwarePromptBuilder } = require('./time-aware-prompt');
      const timePromptBuilder = getTimeAwarePromptBuilder();
      
      // 마지막 메시지 시간 가져오기
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
      
      if (timePrompt) {
        messages.push({
          role: 'system',
          content: timePrompt
        });
        totalTokens += this._estimateTokens(timePrompt);
      }

      // 2. 컨텍스트 감지 (과거 대화 참조 여부)
      let contextData = null;
      if (this.config.autoMemoryInjection) {
        contextData = await this._detectAndInjectContext(userMessage, sessionId);

        if (contextData && contextData.relevantMemories.length > 0) {
          // 관련 메모리를 시스템 프롬프트에 추가
          const memoryPrompt = this._buildMemoryPrompt(contextData.relevantMemories);
          messages.push({
            role: 'system',
            content: memoryPrompt
          });
          totalTokens += this._estimateTokens(memoryPrompt);
        }

        // Phase P: 프로필 필드가 감지되었다면 추가
        if (contextData && contextData.profileFields && contextData.profileFields.length > 0) {
          const profilePrompt = this._buildProfileFieldsPrompt(contextData.profileFields);
          messages.push({
            role: 'system',
            content: profilePrompt
          });
          totalTokens += this._estimateTokens(profilePrompt);
        }
      }

      // 3. 메모리 매니저에서 메시지 가져오기 (역순, 토큰 제한 내)
      const remainingTokens = this.config.maxTokens - totalTokens - this._estimateTokens(userMessage);
      const historyMessages = await this._getMessagesWithinTokenLimit(sessionId, remainingTokens);

      messages.push(...historyMessages);
      totalTokens += historyMessages.reduce((sum, m) => sum + this._estimateTokens(m.content), 0);

      // 4. 현재 사용자 메시지 추가
      messages.push({
        role: 'user',
        content: userMessage
      });
      totalTokens += this._estimateTokens(userMessage);

      // 5. 토큰 사용량 분석
      const usage = tokenCounter.analyzeUsage(messages, this.config.model);

      // 6. 자동 압축 필요 여부 체크
      if (usage.percentage >= this.config.compressionThreshold) {
        console.log(`Token usage at ${(usage.percentage * 100).toFixed(1)}%, triggering auto-compression`);
        const compressed = await this._autoCompress(messages, sessionId);
        return {
          messages: compressed.messages,
          totalTokens: compressed.totalTokens,
          compressed: true,
          usage: tokenCounter.analyzeUsage(compressed.messages, this.config.model),
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
      const rawMessages = rawResult.messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      // 2. 주간 요약 (20%) - 중기 메모리에서 요약
      let summaryContent = '';
      try {
        const summaries = await this.memoryManager.middleTerm.getRecentWeeklySummaries(4);
        if (summaries && summaries.length > 0) {
          summaryContent = '\n=== 최근 기억 요약 ===\n';
          for (const s of summaries) {
            const weekLabel = `${s.year}년 ${s.month}월 ${s.weekNum}주차`;
            summaryContent += `\n[${weekLabel}]\n`;
            summaryContent += `${s.summary}\n`;
            if (s.highlights && s.highlights.length > 0) {
              summaryContent += `주요 내용: ${s.highlights.join(', ')}\n`;
            }
            if (s.topics && s.topics.length > 0) {
              summaryContent += `주제: ${s.topics.join(', ')}\n`;
            }
          }
          summaryContent += '\n=== 요약 끝 ===\n';
        }
      } catch (err) {
        console.warn('[Pipeline] Failed to load weekly summaries:', err.message);
      }

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
   */
  async _buildSystemPromptWithProfile(options = {}) {
    let prompt = options.systemPrompt || this.config.systemPrompt;
    let userTimezone = 'Asia/Seoul'; // 기본 타임존

    // 프로필 자동 포함 (Phase P)
    try {
      const userId = options.userId || 'sowon';
      const profile = await ProfileModel.getOrCreateDefault(userId);

      // 프로필 권한 체크
      if (profile.permissions.autoIncludeInContext) {
        const profileSummary = profile.generateSummary(profile.permissions.readScope);

        // 프로필 정보를 시스템 프롬프트에 추가
        prompt += '\n\n=== 사용자 프로필 ===\n';

        // 기본 정보
        if (profileSummary.basicInfo) {
          prompt += `\n이름: ${profileSummary.basicInfo.name || '소원'}`;
          if (profileSummary.basicInfo.nickname) {
            prompt += ` (${profileSummary.basicInfo.nickname})`;
          }
          if (profileSummary.basicInfo.location) {
            prompt += `\n위치: ${profileSummary.basicInfo.location}`;
          }
          if (profileSummary.basicInfo.timezone) {
            // timezone이 객체인 경우 value 추출, 문자열인 경우 그대로 사용
            const tz = typeof profileSummary.basicInfo.timezone === 'string'
              ? profileSummary.basicInfo.timezone
              : (profileSummary.basicInfo.timezone?.value || 'Asia/Seoul');
            prompt += `\n타임존: ${tz}`;
            userTimezone = tz; // 프로필 타임존 사용
          }
        }

        // 커스텀 필드
        if (profileSummary.customFields && profileSummary.customFields.length > 0) {
          prompt += '\n\n추가 정보:';
          profileSummary.customFields.forEach(field => {
            if (field.value) {
              prompt += `\n- ${field.label}: ${field.value}`;
            }
          });
        }

        prompt += '\n\n=== 프로필 끝 ===\n';
        prompt += '\n위 프로필 정보를 참고하여 개인화된 대화를 진행해주세요.\n';

        // 액세스 기록
        await profile.recordAccess('soul');
      }
    } catch (error) {
      console.error('Error loading profile for system prompt:', error);
      // 프로필 로드 실패해도 대화는 계속 진행
    }

    // 시간 정보 추가 (프로필 타임존 반영)
    if (options.includeTime !== false) {
      const now = new Date();
      const timeInfo = `\n현재 시간: ${now.toLocaleString('ko-KR', { timeZone: userTimezone })}`;
      prompt += timeInfo;
    }

    // 사용자 정보 추가
    if (options.userContext) {
      prompt += `\n\n사용자 컨텍스트:\n${JSON.stringify(options.userContext, null, 2)}`;
    }

    // 추가 지시사항
    if (options.additionalInstructions) {
      prompt += `\n\n추가 지시사항:\n${options.additionalInstructions}`;
    }

    // 사용자 커스텀 프롬프트 (UI에서 설정한 시스템 프롬프트)
    try {
      const agentManager = getAgentProfileManager();
      const agentProfile = agentManager.getProfile('default');
      if (agentProfile && agentProfile.customPrompt && agentProfile.customPrompt.trim()) {
        prompt += `\n\n=== 사용자 지정 지침 ===\n`;
        prompt += agentProfile.customPrompt.trim();
        prompt += `\n=== 지침 끝 ===\n`;
        console.log(`[Pipeline] Custom prompt added: ${agentProfile.customPrompt.substring(0, 50)}...`);
      }
    } catch (error) {
      console.warn('[Pipeline] Failed to load custom prompt:', error.message);
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
   * 기본 시스템 프롬프트
   */
  _getDefaultSystemPrompt() {
    return `당신은 Soul, 사용자의 AI 동반자입니다.

핵심 원칙:
- 단일 인격: 일관되고 자연스러운 대화체
- 맥락 인지: 과거 대화를 기억하고 참조
- 자연스러움: 템플릿화된 응답 금지
- 투명성: 모르는 것은 솔직하게 인정

대화 스타일:
- 사용자의 말투에 30% 정도 맞춤
- 상황에 따라 유연하게 대응
- 불필요한 존댓말이나 인사 최소화
- 핵심만 간결하게

능력:
- 메모리 검색 및 과거 대화 참조
- 자연어 명령 처리
- 파일 관리 및 문서 분석
- 코드 작성 및 디버깅
- 일정 관리 및 알림`;
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
