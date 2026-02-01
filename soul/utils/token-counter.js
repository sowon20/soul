/**
 * 토큰 카운팅 유틸리티
 * Phase 5.1: 토큰 모니터링
 *
 * 다양한 AI 모델의 토큰 카운팅 및 컨텍스트 관리
 */

/**
 * 간단한 토큰 추정 (정확도 ~85%)
 * 실제 토큰라이저보다 빠르고 의존성 없음
 *
 * 참고:
 * - 영어: 평균 1 단어 = 1.3 토큰
 * - 한글: 평균 1 글자 = 1.5~2 토큰
 * - 코드: 평균 1 문자 = 0.3 토큰
 */
class TokenCounter {
  constructor() {
    // 모델별 최대 컨텍스트 길이
    this.MODEL_LIMITS = {
      // Anthropic Claude
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-haiku-20241022': 200000,
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
      'claude-sonnet-4-20250514': 200000,
      'claude-opus-4-20250514': 200000,

      // OpenAI GPT
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-4-turbo': 128000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-3.5-turbo': 16385,
      'gpt-3.5-turbo-16k': 16385,

      // Google Gemini
      'gemini-pro': 32768,
      'gemini-1.5-pro': 1000000,
      'gemini-1.5-flash': 1000000,
      'gemini-2.0-flash': 1000000,
      'gemini-2.5-flash': 1000000,
      'gemini-2.5-pro': 1000000,

      // xAI Grok
      'grok-3': 131072,
      'grok-3-mini': 131072,

      // 기본값 - 안전하게 높게 설정 (파이프라인 maxTokens가 실제 제한)
      'default': 100000
    };

    // 경고 임계값
    this.WARNING_THRESHOLD = 0.8;  // 80%
    this.CRITICAL_THRESHOLD = 0.9; // 90%
  }

  /**
   * 텍스트의 토큰 수 추정
   * @param {string} text - 추정할 텍스트
   * @returns {number} 추정 토큰 수
   */
  estimateTokens(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    let tokens = 0;

    // 1. 한글 문자 카운트 (1글자 ≈ 1.7 토큰)
    const koreanChars = (text.match(/[가-힣]/g) || []).length;
    tokens += koreanChars * 1.7;

    // 2. 영어 단어 카운트 (1단어 ≈ 1.3 토큰)
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    tokens += englishWords * 1.3;

    // 3. 숫자 (1숫자 ≈ 0.5 토큰)
    const numbers = (text.match(/[0-9]+/g) || []).length;
    tokens += numbers * 0.5;

    // 4. 특수문자 및 공백 (1문자 ≈ 0.3 토큰)
    const specialChars = text.length - koreanChars -
                        (text.match(/[a-zA-Z0-9]/g) || []).length;
    tokens += specialChars * 0.3;

    // 5. 코드 블록 감지 (더 정확한 추정)
    const codeBlocks = text.match(/```[\s\S]*?```/g);
    if (codeBlocks) {
      codeBlocks.forEach(block => {
        const codeLength = block.length;
        // 코드는 평균 1문자 = 0.4 토큰
        tokens += codeLength * 0.4;
      });
    }

    return Math.ceil(tokens);
  }

  /**
   * 메시지 배열의 총 토큰 수 계산
   * @param {Array} messages - 메시지 배열 [{role, content}]
   * @returns {number} 총 토큰 수
   */
  countMessagesTokens(messages) {
    if (!Array.isArray(messages)) {
      return 0;
    }

    let totalTokens = 0;

    messages.forEach(msg => {
      // role 토큰 (고정 4 토큰)
      totalTokens += 4;

      // content 토큰
      if (typeof msg.content === 'string') {
        totalTokens += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        // multimodal content
        msg.content.forEach(part => {
          if (part.type === 'text') {
            totalTokens += this.estimateTokens(part.text);
          } else if (part.type === 'image') {
            // 이미지는 대략 1000~2000 토큰
            totalTokens += 1500;
          }
        });
      }

      // name 필드가 있으면 +1 토큰
      if (msg.name) {
        totalTokens += 1;
      }
    });

    // 메시지 오버헤드 (+3 토큰)
    totalTokens += 3;

    return totalTokens;
  }

  /**
   * 모델의 최대 컨텍스트 길이 반환
   * @param {string} modelName - 모델명
   * @returns {number} 최대 토큰 수
   */
  getModelLimit(modelName) {
    if (!modelName) {
      return this.MODEL_LIMITS.default;
    }

    // 정확한 매칭 시도
    if (this.MODEL_LIMITS[modelName]) {
      return this.MODEL_LIMITS[modelName];
    }

    // 부분 매칭 시도 (정확한 키부터)
    for (const [key, limit] of Object.entries(this.MODEL_LIMITS)) {
      if (key !== 'default' && (modelName.includes(key) || key.includes(modelName))) {
        return limit;
      }
    }

    // 패턴 기반 매칭 (모델 패밀리)
    const lowerName = modelName.toLowerCase();
    if (lowerName.includes('claude')) return 200000;
    if (lowerName.includes('gemini')) return 1000000;
    if (lowerName.includes('gpt-4o') || lowerName.includes('gpt-4-turbo')) return 128000;
    if (lowerName.includes('gpt-4')) return 8192;
    if (lowerName.includes('gpt-3')) return 16385;
    if (lowerName.includes('grok')) return 131072;
    if (lowerName.includes('llama') || lowerName.includes('mistral')) return 32768;

    // 기본값 반환 (안전하게 높게)
    console.warn(`[TokenCounter] Unknown model "${modelName}", using default limit`);
    return this.MODEL_LIMITS.default;
  }

  /**
   * 컨텍스트 사용량 분석
   * @param {Array} messages - 메시지 배열
   * @param {string} modelName - 모델명
   * @returns {Object} 분석 결과
   */
  analyzeUsage(messages, modelName = 'default') {
    const usedTokens = this.countMessagesTokens(messages);
    const maxTokens = this.getModelLimit(modelName);
    const usagePercent = (usedTokens / maxTokens) * 100;
    const remainingTokens = maxTokens - usedTokens;

    let status = 'normal';
    let shouldCompress = false;

    if (usagePercent >= this.CRITICAL_THRESHOLD * 100) {
      status = 'critical';
      shouldCompress = true;
    } else if (usagePercent >= this.WARNING_THRESHOLD * 100) {
      status = 'warning';
      shouldCompress = true;
    }

    return {
      usedTokens,
      maxTokens,
      remainingTokens,
      usagePercent: parseFloat(usagePercent.toFixed(2)),
      status,
      shouldCompress,
      thresholds: {
        warning: this.WARNING_THRESHOLD * 100,
        critical: this.CRITICAL_THRESHOLD * 100
      }
    };
  }

  /**
   * 압축 우선순위 계산
   * 오래되고 덜 중요한 메시지부터 압축
   *
   * @param {Array} messages - 메시지 배열
   * @param {Object} options - 옵션
   * @returns {Array} 우선순위가 추가된 메시지 배열
   */
  calculateCompressionPriority(messages, options = {}) {
    const {
      keepRecent = 10,  // 최근 N개는 유지
      systemWeight = 0,  // 시스템 메시지는 압축 안 함
      userWeight = 0.3,  // 사용자 메시지는 낮은 우선순위
      assistantWeight = 0.5  // AI 응답은 중간 우선순위
    } = options;

    const now = Date.now();
    const totalMessages = messages.length;

    return messages.map((msg, index) => {
      let priority = 0;

      // 1. 역할 기반 가중치
      if (msg.role === 'system') {
        priority += systemWeight;
      } else if (msg.role === 'user') {
        priority += userWeight;
      } else if (msg.role === 'assistant') {
        priority += assistantWeight;
      }

      // 2. 시간 기반 가중치 (오래될수록 높은 우선순위)
      const ageWeight = (index / totalMessages) * 0.5;
      priority += ageWeight;

      // 3. 최근 메시지는 보호
      const isRecent = index >= totalMessages - keepRecent;
      if (isRecent) {
        priority = -1; // 압축 제외
      }

      // 4. 길이 기반 가중치 (길수록 높은 우선순위)
      const tokenCount = this.estimateTokens(
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      );
      if (tokenCount > 1000) {
        priority += 0.2;
      }

      return {
        ...msg,
        _priority: priority,
        _index: index,
        _tokens: tokenCount
      };
    });
  }

  /**
   * 압축 대상 메시지 선택
   * @param {Array} messages - 메시지 배열
   * @param {number} targetTokens - 목표 토큰 수
   * @param {Object} options - 옵션
   * @returns {Object} 압축 대상 및 유지 메시지
   */
  selectMessagesForCompression(messages, targetTokens, options = {}) {
    const prioritized = this.calculateCompressionPriority(messages, options);

    // 압축 제외 메시지 (priority < 0)
    const protectedMsgs = prioritized.filter(m => m._priority < 0);

    // 압축 가능 메시지 (priority >= 0)
    const compressible = prioritized
      .filter(m => m._priority >= 0)
      .sort((a, b) => b._priority - a._priority); // 높은 우선순위 먼저

    let currentTokens = this.countMessagesTokens(messages);
    const toCompress = [];
    const toKeep = [...protectedMsgs];

    // 압축 대상 선택
    for (const msg of compressible) {
      if (currentTokens <= targetTokens) {
        toKeep.push(msg);
      } else {
        toCompress.push(msg);
        currentTokens -= msg._tokens;
      }
    }

    // 인덱스 순서로 재정렬
    toKeep.sort((a, b) => a._index - b._index);
    toCompress.sort((a, b) => a._index - b._index);

    return {
      toCompress: toCompress.map(m => {
        const { _priority, _index, _tokens, ...rest } = m;
        return rest;
      }),
      toKeep: toKeep.map(m => {
        const { _priority, _index, _tokens, ...rest } = m;
        return rest;
      }),
      stats: {
        originalTokens: this.countMessagesTokens(messages),
        targetTokens,
        compressedCount: toCompress.length,
        keptCount: toKeep.length,
        tokensToSave: toCompress.reduce((sum, m) => sum + m._tokens, 0)
      }
    };
  }

  /**
   * 메시지 요약 생성 (간단한 버전)
   * 실제로는 AI API를 사용해야 하지만, 여기서는 간단한 추출 요약
   *
   * @param {Array} messages - 압축할 메시지들
   * @returns {string} 요약문
   */
  generateSimpleSummary(messages) {
    if (messages.length === 0) {
      return '';
    }

    const summary = [];
    summary.push(`[Compressed ${messages.length} messages]`);

    // 주요 키워드 추출
    const allText = messages
      .map(m => typeof m.content === 'string' ? m.content : '')
      .join(' ');

    const keywords = this.extractKeywords(allText, 5);
    if (keywords.length > 0) {
      summary.push(`Key topics: ${keywords.join(', ')}`);
    }

    // 시간 범위
    const timestamps = messages
      .map(m => m.timestamp)
      .filter(t => t);

    if (timestamps.length > 0) {
      const earliest = new Date(Math.min(...timestamps));
      const latest = new Date(Math.max(...timestamps));
      summary.push(`Period: ${earliest.toISOString()} to ${latest.toISOString()}`);
    }

    return summary.join('\n');
  }

  /**
   * 간단한 키워드 추출 (TF-IDF 간소화 버전)
   * @param {string} text - 텍스트
   * @param {number} topN - 상위 N개
   * @returns {Array<string>} 키워드 배열
   */
  extractKeywords(text, topN = 5) {
    // 불용어 제거 및 토큰화
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
                               '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도']);

    const words = text
      .toLowerCase()
      .match(/[가-힣a-z]+/g) || [];

    const wordCounts = {};
    words.forEach(word => {
      if (word.length >= 2 && !stopwords.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);
  }

  /**
   * 설정 업데이트
   * @param {Object} config - 새 설정
   */
  updateConfig(config) {
    if (config.warningThreshold !== undefined) {
      this.WARNING_THRESHOLD = config.warningThreshold;
    }
    if (config.criticalThreshold !== undefined) {
      this.CRITICAL_THRESHOLD = config.criticalThreshold;
    }
  }
}

module.exports = new TokenCounter();
