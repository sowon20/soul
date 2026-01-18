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
const { analyzeUsage } = require('./token-counter');
const { shouldAutoCompress, compressMessages } = require('./context-compressor');
const { detectContext } = require('./context-detector');

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

      // 1. 시스템 프롬프트 추가
      const systemPrompt = options.systemPrompt || this.config.systemPrompt;
      messages.push({
        role: 'system',
        content: systemPrompt
      });
      totalTokens += this._estimateTokens(systemPrompt);

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
      const usage = analyzeUsage(messages, this.config.model);

      // 6. 자동 압축 필요 여부 체크
      if (usage.percentage >= this.config.compressionThreshold) {
        console.log(`Token usage at ${(usage.percentage * 100).toFixed(1)}%, triggering auto-compression`);
        const compressed = await this._autoCompress(messages, sessionId);
        return {
          messages: compressed.messages,
          totalTokens: compressed.totalTokens,
          compressed: true,
          usage: analyzeUsage(compressed.messages, this.config.model),
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
   * 토큰 제한 내 메시지 가져오기 (역순)
   */
  async _getMessagesWithinTokenLimit(sessionId, maxTokens) {
    try {
      if (!this.memoryManager) {
        return [];
      }

      // 단기 메모리에서 역순으로 가져오기
      const result = this.memoryManager.shortTerm.getWithinTokenLimit(maxTokens);

      return result.messages.map(m => ({
        role: m.role,
        content: m.content
      }));
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
      // 컨텍스트 감지
      const contextResult = await detectContext(userMessage, []);

      if (!contextResult.activated) {
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
   * 자동 압축
   */
  async _autoCompress(messages, sessionId) {
    try {
      // 시스템 메시지 제외
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // 압축
      const compressed = await compressMessages(conversationMessages, {
        targetRatio: 0.5,
        preserveRecent: 10
      });

      // 시스템 메시지 + 압축된 메시지
      const result = [...systemMessages, ...compressed.compressedMessages];

      return {
        messages: result,
        totalTokens: result.reduce((sum, m) => sum + this._estimateTokens(m.content), 0)
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

      // 1. 사용자 메시지 저장
      await this.memoryManager.addMessage({
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      }, sessionId);

      // 2. 어시스턴트 응답 저장
      await this.memoryManager.addMessage({
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date(),
        ...metadata
      }, sessionId);

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
   * 시스템 프롬프트 동적 구성
   */
  buildSystemPrompt(options = {}) {
    let prompt = this.config.systemPrompt;

    // 시간 정보 추가
    if (options.includeTime !== false) {
      const now = new Date();
      const timeInfo = `\n\n현재 시간: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      prompt += timeInfo;
    }

    // 사용자 정보 추가
    if (options.userContext) {
      prompt += `\n\n사용자 정보:\n${JSON.stringify(options.userContext, null, 2)}`;
    }

    // 추가 지시사항
    if (options.additionalInstructions) {
      prompt += `\n\n추가 지시사항:\n${options.additionalInstructions}`;
    }

    return prompt;
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
 */
async function getConversationPipeline(config = {}) {
  if (!globalPipeline) {
    globalPipeline = new ConversationPipeline(config);
    await globalPipeline.initialize();
  }
  return globalPipeline;
}

module.exports = {
  ConversationPipeline,
  getConversationPipeline
};
