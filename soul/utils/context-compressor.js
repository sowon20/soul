const tokenCounter = require('./token-counter');
const memoryUtils = require('./memory');

/**
 * 컨텍스트 압축 유틸리티
 * Phase 5.2: 자동 압축
 *
 * 대화 컨텍스트가 너무 커지면 자동으로 오래된 메시지를 요약하고 압축
 */
class ContextCompressor {
  constructor() {
    // 압축 설정
    this.config = {
      // 자동 압축 트리거
      autoCompressThreshold: 0.85,  // 85% 도달 시 자동 압축
      targetUsageAfterCompression: 0.60,  // 압축 후 60%로 감소 목표

      // 메시지 보호 설정
      keepRecentMessages: 10,  // 최근 N개 메시지는 절대 압축 안 함
      keepSystemMessages: true,  // 시스템 메시지 유지 여부

      // 요약 설정
      useAISummary: false,  // AI 요약 사용 (false면 간단한 요약)
      summaryModel: 'claude-3-haiku-20240307',  // 요약에 사용할 모델

      // 원본 저장
      saveOriginalToMemory: true  // 압축 전 원본을 메모리에 저장
    };
  }

  /**
   * 자동 압축 필요 여부 체크
   * @param {Array} messages - 메시지 배열
   * @param {string} modelName - 모델명
   * @returns {Object} 체크 결과
   */
  shouldAutoCompress(messages, modelName = 'default') {
    const usage = tokenCounter.analyzeUsage(messages, modelName);

    return {
      shouldCompress: usage.usagePercent >= (this.config.autoCompressThreshold * 100),
      usage,
      reason: usage.status === 'critical' ? 'Critical threshold reached' :
              usage.status === 'warning' ? 'Warning threshold reached' :
              'Normal usage'
    };
  }

  /**
   * 메시지 압축 실행
   * @param {Array} messages - 메시지 배열
   * @param {string} modelName - 모델명
   * @param {Object} options - 압축 옵션
   * @returns {Promise<Object>} 압축 결과
   */
  async compressMessages(messages, modelName = 'default', options = {}) {
    const startTime = Date.now();

    // 현재 사용량 분석
    const usage = tokenCounter.analyzeUsage(messages, modelName);

    if (!usage.shouldCompress && !options.forceCompress) {
      return {
        compressed: false,
        reason: 'Compression not needed',
        usage,
        messages
      };
    }

    // 목표 토큰 수 계산
    const targetTokens = Math.floor(
      usage.maxTokens * (options.targetUsage || this.config.targetUsageAfterCompression)
    );

    // 압축 대상 메시지 선택
    const selection = tokenCounter.selectMessagesForCompression(
      messages,
      targetTokens,
      {
        keepRecent: options.keepRecent || this.config.keepRecentMessages,
        systemWeight: this.config.keepSystemMessages ? -1 : 0.1
      }
    );

    // 원본 저장
    let originalSaved = null;
    if (this.config.saveOriginalToMemory && selection.toCompress.length > 0) {
      originalSaved = await this.saveOriginalToMemory(selection.toCompress);
    }

    // 요약 생성
    let summary = null;
    if (selection.toCompress.length > 0) {
      if (this.config.useAISummary && options.aiService) {
        summary = await this.generateAISummary(selection.toCompress, options.aiService);
      } else {
        summary = tokenCounter.generateSimpleSummary(selection.toCompress);
      }
    }

    // 압축된 메시지 구성
    const compressedMessages = [];

    // 요약 메시지 추가
    if (summary) {
      compressedMessages.push({
        role: 'system',
        content: `[Context Summary]\n${summary}`,
        timestamp: Date.now(),
        _compressed: true,
        _originalCount: selection.toCompress.length,
        _originalTokens: selection.stats.tokensToSave
      });
    }

    // 유지할 메시지 추가
    compressedMessages.push(...selection.toKeep);

    // 최종 사용량 계산
    const finalUsage = tokenCounter.analyzeUsage(compressedMessages, modelName);

    const compressionTime = Date.now() - startTime;

    return {
      compressed: true,
      reason: 'Compression successful',
      originalUsage: usage,
      finalUsage,
      stats: {
        ...selection.stats,
        savedTokens: usage.usedTokens - finalUsage.usedTokens,
        savedPercent: ((usage.usedTokens - finalUsage.usedTokens) / usage.usedTokens * 100).toFixed(2),
        compressionTime
      },
      messages: compressedMessages,
      summary,
      originalSaved
    };
  }

  /**
   * 원본 메시지를 메모리에 저장
   * @param {Array} messages - 저장할 메시지
   * @returns {Promise<Object>} 저장 결과
   */
  async saveOriginalToMemory(messages) {
    try {
      const conversationId = `compressed_${Date.now()}`;

      const result = await memoryUtils.saveConversation({
        id: conversationId,
        messages,
        metadata: {
          type: 'compressed_backup',
          compressedAt: new Date().toISOString(),
          messageCount: messages.length
        },
        autoAnalyze: false  // 백업은 분석 안 함
      });

      return {
        saved: true,
        conversationId,
        path: result.file
      };
    } catch (error) {
      console.error('Failed to save original messages:', error);
      return {
        saved: false,
        error: error.message
      };
    }
  }

  /**
   * AI를 사용한 요약 생성
   * @param {Array} messages - 요약할 메시지
   * @param {Object} aiService - AI 서비스 인스턴스
   * @returns {Promise<string>} 요약문
   */
  async generateAISummary(messages, aiService) {
    try {
      // 메시지를 텍스트로 변환
      const conversationText = messages
        .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n\n');

      const prompt = `다음 대화를 간결하게 요약해주세요. 주요 주제, 결정사항, 중요한 정보만 포함하세요:

${conversationText}

요약:`;

      const summary = await aiService.generateText(prompt, {
        model: this.config.summaryModel,
        maxTokens: 500
      });

      return summary;
    } catch (error) {
      console.error('AI summary failed, using simple summary:', error);
      return tokenCounter.generateSimpleSummary(messages);
    }
  }

  /**
   * 압축된 세션 복원 (원본 로드)
   * @param {string} conversationId - 저장된 대화 ID
   * @returns {Promise<Array>} 원본 메시지
   */
  async restoreCompressedSession(conversationId) {
    try {
      const conversation = await memoryUtils.loadConversation(conversationId);
      return conversation.messages;
    } catch (error) {
      console.error('Failed to restore compressed session:', error);
      throw error;
    }
  }

  /**
   * 세션 종료 시 요약 생성
   * @param {Array} messages - 전체 메시지
   * @param {Object} options - 옵션
   * @returns {Promise<Object>} 세션 요약
   */
  async generateSessionSummary(messages, options = {}) {
    const {
      includeKeywords = true,
      includeDecisions = true,
      includeTodos = true
    } = options;

    const summary = {
      totalMessages: messages.length,
      totalTokens: tokenCounter.countMessagesTokens(messages),
      duration: this.calculateSessionDuration(messages),
      createdAt: new Date().toISOString()
    };

    // 키워드 추출
    if (includeKeywords) {
      const allText = messages
        .map(m => typeof m.content === 'string' ? m.content : '')
        .join(' ');
      summary.keywords = tokenCounter.extractKeywords(allText, 10);
    }

    // 결정사항 추출 (간단한 패턴 매칭)
    if (includeDecisions) {
      summary.decisions = this.extractDecisions(messages);
    }

    // TODO 추출
    if (includeTodos) {
      summary.todos = this.extractTodos(messages);
    }

    // 주요 주제
    summary.topics = this.extractTopics(messages);

    return summary;
  }

  /**
   * 세션 지속 시간 계산
   * @param {Array} messages - 메시지 배열
   * @returns {Object} 지속 시간 정보
   */
  calculateSessionDuration(messages) {
    const timestamps = messages
      .map(m => m.timestamp)
      .filter(t => t)
      .sort((a, b) => a - b);

    if (timestamps.length < 2) {
      return { duration: 0, start: null, end: null };
    }

    const start = new Date(timestamps[0]);
    const end = new Date(timestamps[timestamps.length - 1]);
    const durationMs = end - start;

    return {
      duration: durationMs,
      durationMinutes: Math.round(durationMs / 60000),
      start: start.toISOString(),
      end: end.toISOString()
    };
  }

  /**
   * 결정사항 추출 (간단한 패턴 매칭)
   * @param {Array} messages - 메시지 배열
   * @returns {Array<string>} 결정사항 배열
   */
  extractDecisions(messages) {
    const decisions = [];
    const patterns = [
      /결정했습니다?|결정.*했어요?/gi,
      /하기로 했습니다?|하기로.*했어요?/gi,
      /decided to|going to/gi
    ];

    messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        patterns.forEach(pattern => {
          if (pattern.test(msg.content)) {
            // 해당 문장만 추출
            const sentences = msg.content.split(/[.!?]\s+/);
            sentences.forEach(sentence => {
              if (pattern.test(sentence) && sentence.length < 200) {
                decisions.push(sentence.trim());
              }
            });
          }
        });
      }
    });

    return [...new Set(decisions)].slice(0, 5);
  }

  /**
   * TODO 추출
   * @param {Array} messages - 메시지 배열
   * @returns {Array<string>} TODO 배열
   */
  extractTodos(messages) {
    const todos = [];
    const patterns = [
      /TODO:|해야.*할.*것|해야.*함|할.*예정/gi,
      /\[ \].*|^-\s+\[ \]/gm
    ];

    messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        patterns.forEach(pattern => {
          const matches = msg.content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              if (match.length < 200) {
                todos.push(match.trim());
              }
            });
          }
        });
      }
    });

    return [...new Set(todos)].slice(0, 10);
  }

  /**
   * 주요 주제 추출
   * @param {Array} messages - 메시지 배열
   * @returns {Array<string>} 주제 배열
   */
  extractTopics(messages) {
    const allText = messages
      .map(m => typeof m.content === 'string' ? m.content : '')
      .join(' ');

    // 키워드 기반 주제 추출
    const keywords = tokenCounter.extractKeywords(allText, 15);

    // 관련 키워드 그룹화 (간단한 버전)
    const topics = [];
    const used = new Set();

    keywords.forEach(keyword => {
      if (!used.has(keyword)) {
        // 이 키워드와 관련된 다른 키워드 찾기
        const related = keywords.filter(k =>
          !used.has(k) && (
            k.includes(keyword) || keyword.includes(k)
          )
        );

        related.forEach(k => used.add(k));
        topics.push(related.length > 1 ? related.join(', ') : keyword);
      }
    });

    return topics.slice(0, 5);
  }

  /**
   * 설정 업데이트
   * @param {Object} newConfig - 새 설정
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 현재 설정 조회
   * @returns {Object} 현재 설정
   */
  getConfig() {
    return { ...this.config };
  }
}

module.exports = new ContextCompressor();
