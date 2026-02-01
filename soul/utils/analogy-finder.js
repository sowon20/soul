const memoryUtils = require('./memory');
const searchUtils = require('./search');
const recommendationUtils = require('./recommendation');
const contextDetector = require('./context-detector');

/**
 * 비유/연결 시스템
 * Phase 4.3: 과거 대화에서 비유 찾기 및 선택적 활성화
 *
 * 현재 대화와 비슷한 패턴/상황을 과거 대화에서 찾아
 * "저번에 비슷한 문제 있었을 때..." 같은 자연스러운 참조 제공
 */
class AnalogyFinder {
  constructor() {
    // 비유 탐지 설정
    this.config = {
      // 유사도 임계값
      minAnalogyScore: 15, // 최소 점수
      minConfidence: 0.6,  // 최소 신뢰도

      // 선택적 활성화
      enableAnalogySearch: true,  // 비유 검색 활성화
      maxAnalogiesPerQuery: 3,    // 최대 비유 개수

      // 패턴 매칭 가중치
      weights: {
        similarProblem: 20,      // 비슷한 문제/상황
        similarSolution: 15,     // 비슷한 해결책
        similarOutcome: 10,      // 비슷한 결과
        commonContext: 8,        // 공통 맥락
        temporalPattern: 5       // 시간 패턴 (주기적 발생)
      }
    };
  }

  /**
   * 패턴 감지 (문제/해결/결과)
   * @param {string} message - 분석할 메시지
   * @returns {Object} 감지된 패턴
   */
  detectPatterns(message) {
    if (!message || typeof message !== 'string') {
      return { hasProblem: false, hasSolution: false, hasOutcome: false };
    }

    const lowerMessage = message.toLowerCase();

    // 문제/이슈 패턴
    const problemPatterns = [
      /문제|이슈|버그|에러|오류|실패|안\s*되|작동.*안/gi,
      /어떻게|방법|해결|고치|수정/gi,
      /왜|이유|원인/gi
    ];

    // 해결책 패턴
    const solutionPatterns = [
      /해결|고침|수정|변경|적용/gi,
      /방법은|~하면|~해서/gi,
      /시도|테스트|확인/gi
    ];

    // 결과 패턴
    const outcomePatterns = [
      /결과|성공|완료|해결.*됨/gi,
      /작동|동작|실행.*됨/gi,
      /실패|안.*됨/gi
    ];

    const hasProblem = problemPatterns.some(p => p.test(lowerMessage));
    const hasSolution = solutionPatterns.some(p => p.test(lowerMessage));
    const hasOutcome = outcomePatterns.some(p => p.test(lowerMessage));

    return {
      hasProblem,
      hasSolution,
      hasOutcome,
      problemKeywords: this.extractProblemKeywords(message),
      solutionKeywords: this.extractSolutionKeywords(message)
    };
  }

  /**
   * 문제 키워드 추출
   * @param {string} message - 메시지
   * @returns {Array<string>} 문제 관련 키워드
   */
  extractProblemKeywords(message) {
    const keywords = [];
    const patterns = [
      /(\w+)\s*(문제|에러|오류|버그|이슈)/g,
      /(안|못)\s*(\w+)/g
    ];

    patterns.forEach(pattern => {
      const matches = message.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 1) {
          keywords.push(match[1]);
        }
      }
    });

    return [...new Set(keywords)];
  }

  /**
   * 해결책 키워드 추출
   * @param {string} message - 메시지
   * @returns {Array<string>} 해결책 관련 키워드
   */
  extractSolutionKeywords(message) {
    const keywords = [];
    const patterns = [
      /(\w+)\s*(로|으로)\s*해결/g,
      /(\w+)\s*(하면|하니까)\s*(됨|작동)/g
    ];

    patterns.forEach(pattern => {
      const matches = message.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 1) {
          keywords.push(match[1]);
        }
      }
    });

    return [...new Set(keywords)];
  }

  /**
   * 비유 점수 계산
   * @param {Object} current - 현재 대화 패턴
   * @param {Object} past - 과거 대화
   * @returns {number} 비유 점수
   */
  calculateAnalogyScore(current, past) {
    let score = 0;
    const weights = this.config.weights;

    // 1. 비슷한 문제 감지
    if (current.hasProblem && past.topics) {
      const problemMatch = current.problemKeywords.some(keyword =>
        past.topics.some(topic => topic.toLowerCase().includes(keyword.toLowerCase()))
      );
      if (problemMatch) {
        score += weights.similarProblem;
      }
    }

    // 2. 비슷한 해결책 패턴
    if (current.hasSolution && past.tags) {
      const solutionMatch = current.solutionKeywords.some(keyword =>
        past.tags.some(tag => tag.toLowerCase().includes(keyword.toLowerCase()))
      );
      if (solutionMatch) {
        score += weights.similarSolution;
      }
    }

    // 3. 공통 맥락 (카테고리, 엔티티)
    if (current.extractedData) {
      // 엔티티 매칭
      const entityMatch = current.extractedData.entities?.some(entity =>
        past.tags?.some(tag => tag.toLowerCase().includes(entity.toLowerCase())) ||
        past.topics?.some(topic => topic.toLowerCase().includes(entity.toLowerCase()))
      );
      if (entityMatch) {
        score += weights.commonContext;
      }
    }

    // 4. 주제 유사도 (기존 시스템 활용)
    const similarity = recommendationUtils.calculateSimilarity(
      { topics: current.topics || [], tags: current.tags || [] },
      past
    );
    score += similarity * 0.3; // 유사도를 점수에 반영

    return score;
  }

  /**
   * 비유 검색
   * @param {string} message - 현재 메시지
   * @param {Object} options - 옵션
   * @returns {Promise<Object>} 비유 검색 결과
   */
  async findAnalogies(message, options = {}) {
    const {
      limit = this.config.maxAnalogiesPerQuery,
      minScore = this.config.minAnalogyScore,
      includeContext = true
    } = options;

    // 1. 패턴 감지
    const patterns = this.detectPatterns(message);

    // 2. 키워드 추출 (맥락 감지 재사용)
    const extractedData = contextDetector.extractKeywords(message);

    const currentContext = {
      ...patterns,
      extractedData,
      topics: extractedData.keywords.slice(0, 3),
      tags: extractedData.entities
    };

    // 3. 잠재적 비유 후보 검색
    let candidates = [];

    // 문제 키워드 기반 검색
    if (patterns.problemKeywords.length > 0) {
      const problemResults = await searchUtils.advancedSearch({
        anyKeywords: patterns.problemKeywords,
        limit: limit * 3,
        sortBy: 'relevance'
      });
      candidates.push(...problemResults.results);
    }

    // 엔티티 기반 검색
    if (extractedData.entities.length > 0) {
      const entityResults = await searchUtils.advancedSearch({
        anyKeywords: extractedData.entities,
        limit: limit * 2,
        sortBy: 'importance'
      });
      candidates.push(...entityResults.results);
    }

    // 중복 제거
    candidates = candidates.filter((conv, index, self) =>
      index === self.findIndex(c => c.id === conv.id)
    );

    // 4. 비유 점수 계산
    const analogies = candidates.map(conv => {
      const analogyScore = this.calculateAnalogyScore(currentContext, conv);

      return {
        ...conv,
        analogyScore,
        analogyType: this.determineAnalogyType(currentContext, conv),
        confidence: Math.min(analogyScore / 50, 1.0) // 정규화
      };
    })
    .filter(conv => conv.analogyScore >= minScore)
    .sort((a, b) => b.analogyScore - a.analogyScore)
    .slice(0, limit);

    // 5. 컨텍스트 생성 (선택)
    let contextPrompt = null;
    if (includeContext && analogies.length > 0) {
      contextPrompt = this.generateAnalogyPrompt(analogies, currentContext);
    }

    return {
      success: true,
      analogies,
      totalFound: analogies.length,
      patterns: currentContext,
      contextPrompt
    };
  }

  /**
   * 비유 타입 결정
   * @param {Object} current - 현재 컨텍스트
   * @param {Object} past - 과거 대화
   * @returns {string} 비유 타입
   */
  determineAnalogyType(current, past) {
    if (current.hasProblem) {
      return 'similar_problem';
    }
    if (current.hasSolution) {
      return 'similar_solution';
    }
    if (current.hasOutcome) {
      return 'similar_outcome';
    }
    return 'general_context';
  }

  /**
   * 비유 프롬프트 생성
   * @param {Array} analogies - 비유 목록
   * @param {Object} context - 현재 컨텍스트
   * @returns {string} 시스템 프롬프트
   */
  generateAnalogyPrompt(analogies, context) {
    let prompt = '\n\n[Analogies from Past Conversations]\n';
    prompt += 'You may reference these similar past situations if relevant:\n\n';

    analogies.forEach((analogy, index) => {
      prompt += `${index + 1}. ${analogy.topics?.[0] || 'Past Conversation'} (${new Date(analogy.date).toLocaleDateString()})\n`;
      prompt += `   - Type: ${analogy.analogyType.replace('_', ' ')}\n`;
      prompt += `   - Relevance: ${(analogy.confidence * 100).toFixed(0)}%\n`;
      prompt += `   - Topics: ${analogy.topics?.join(', ') || 'N/A'}\n`;
      prompt += `   - Tags: ${analogy.tags?.slice(0, 3).join(', ') || 'N/A'}\n`;
      if (analogy.category) {
        prompt += `   - Category: ${analogy.category}\n`;
      }
      prompt += '\n';
    });

    prompt += 'Note: Use natural phrasing like:\n';
    prompt += '- "This reminds me of when we..."\n';
    prompt += '- "Similar to that time when..."\n';
    prompt += '- "We had a similar situation before..."\n';
    prompt += 'Only mention if genuinely helpful to the current discussion.\n';

    return prompt;
  }

  /**
   * 선택적 활성화 체크
   * @param {string} message - 메시지
   * @param {Object} options - 옵션
   * @returns {Object} 활성화 여부 및 이유
   */
  shouldActivate(message, options = {}) {
    const {
      forceActivate = false,
      minPatternMatch = 1
    } = options;

    if (forceActivate) {
      return { activated: true, reason: 'force_activate' };
    }

    if (!this.config.enableAnalogySearch) {
      return { activated: false, reason: 'disabled' };
    }

    // 패턴 감지
    const patterns = this.detectPatterns(message);
    const patternCount = [
      patterns.hasProblem,
      patterns.hasSolution,
      patterns.hasOutcome
    ].filter(Boolean).length;

    if (patternCount < minPatternMatch) {
      return {
        activated: false,
        reason: 'insufficient_patterns',
        patternCount
      };
    }

    // 키워드 체크
    const keywords = contextDetector.extractKeywords(message);
    if (keywords.keywords.length < 2) {
      return {
        activated: false,
        reason: 'insufficient_keywords',
        keywordCount: keywords.keywords.length
      };
    }

    return {
      activated: true,
      reason: 'pattern_detected',
      patternCount,
      patterns
    };
  }

  /**
   * 통합 비유 파이프라인
   * @param {string} message - 메시지
   * @param {Object} options - 옵션
   * @returns {Promise<Object>} 비유 분석 결과
   */
  async analyze(message, options = {}) {
    // 1. 활성화 체크
    const activation = this.shouldActivate(message, options);

    if (!activation.activated) {
      return {
        success: false,
        activated: false,
        reason: activation.reason,
        analogies: []
      };
    }

    // 2. 비유 검색
    const result = await this.findAnalogies(message, options);

    return {
      success: true,
      activated: true,
      ...result,
      activation
    };
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

module.exports = new AnalogyFinder();
