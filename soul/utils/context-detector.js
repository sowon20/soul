const memoryUtils = require('./memory');
const searchUtils = require('./search');
const recommendationUtils = require('./recommendation');
const ProfileModel = require('../models/Profile');

/**
 * 맥락 감지 및 자율 기억 시스템
 * Phase 4.1: 대화 중 관련 주제를 자동으로 감지하고 관련 메모리를 찾아 제공
 */
class ContextDetector {
  /**
   * 대화 메시지에서 키워드 추출
   * @param {string} message - 사용자 메시지
   * @returns {Object} 추출된 키워드 및 메타데이터
   */
  extractKeywords(message) {
    if (!message || typeof message !== 'string') {
      return { keywords: [], entities: [], timeRefs: [], personalKeywords: [] };
    }

    const lowerMessage = message.toLowerCase();
    const keywords = [];
    const entities = [];
    const timeRefs = [];
    const personalKeywords = []; // Phase P: 개인 정보 관련 키워드

    // 1. 시간 참조 감지
    const timePatterns = [
      { pattern: /저번에|지난번에|전에|예전에|그때/g, value: 'past_reference' },
      { pattern: /최근에?|요즘|며칠 전|얼마 전/g, value: 'recent' },
      { pattern: /오늘|어제|그저께/g, value: 'specific_day' },
      { pattern: /이번 주|지난주|저번 주/g, value: 'week_reference' },
      { pattern: /이번 달|지난달|저번 달/g, value: 'month_reference' }
    ];

    timePatterns.forEach(({ pattern, value }) => {
      if (pattern.test(lowerMessage)) {
        timeRefs.push(value);
      }
    });

    // 2. 엔티티 감지 (프로젝트명, 기술 스택 등)
    const techKeywords = [
      'react', 'node', 'python', 'javascript', 'typescript', 'api', 'database',
      'mongodb', 'docker', 'git', 'github', 'ai', 'claude', 'gpt', 'openai',
      '프로젝트', '버그', '에러', '기능', '개발', '코드', '테스트', '배포'
    ];

    techKeywords.forEach(keyword => {
      if (lowerMessage.includes(keyword)) {
        entities.push(keyword);
      }
    });

    // 3. 대화 주제 참조 감지
    const topicPatterns = [
      /그\s*(때|거|것|이야기|얘기|대화)/g,
      /아까\s*(말한|했던|애기한)/g,
      /(이야기|얘기|대화|이슈)\s*했던/g,
      /관련(된|해서|하여)/g,
      /비슷한|같은|연관(된)?/g
    ];

    const hasTopicReference = topicPatterns.some(pattern => pattern.test(lowerMessage));

    // 4. 개인 정보 키워드 감지 (Phase P)
    const personalPatterns = [
      '개인', '나', '내', '취향', '좋아하는', '싫어하는',
      '선호', '관심', '취미', '습관', '성격', '특징', '프로필'
    ];

    personalPatterns.forEach(keyword => {
      if (lowerMessage.includes(keyword)) {
        personalKeywords.push(keyword);
      }
    });

    // 5. 중요 키워드 추출 (명사형)
    const words = message.split(/\s+/);
    words.forEach(word => {
      // 3글자 이상, 특수문자 제외
      if (word.length >= 3 && /^[가-힣a-zA-Z0-9]+$/.test(word)) {
        keywords.push(word);
      }
    });

    return {
      keywords: [...new Set([...keywords, ...entities])],
      entities,
      timeRefs,
      hasTopicReference,
      personalKeywords, // Phase P
      originalMessage: message
    };
  }

  /**
   * 트리거 조건 평가
   * @param {Object} extractedData - extractKeywords()의 결과
   * @param {Object} config - 트리거 설정
   * @returns {boolean} 트리거 발동 여부
   */
  evaluateTrigger(extractedData, config = {}) {
    const {
      minKeywords = 2,
      requireTimeRef = false,
      requireTopicRef = false,
      minConfidence = 0.5
    } = config;

    let confidence = 0;
    let reasons = [];

    // 시간 참조가 있으면 +30%
    if (extractedData.timeRefs.length > 0) {
      confidence += 0.3;
      reasons.push(`time_reference: ${extractedData.timeRefs.join(', ')}`);
    }

    // 주제 참조가 있으면 +40%
    if (extractedData.hasTopicReference) {
      confidence += 0.4;
      reasons.push('topic_reference');
    }

    // 키워드가 많으면 +30%
    if (extractedData.keywords.length >= minKeywords) {
      confidence += 0.3;
      reasons.push(`keywords: ${extractedData.keywords.length}`);
    }

    // 엔티티가 있으면 +20%
    if (extractedData.entities.length > 0) {
      confidence += 0.2;
      reasons.push(`entities: ${extractedData.entities.join(', ')}`);
    }

    // 필수 조건 체크
    if (requireTimeRef && extractedData.timeRefs.length === 0) {
      return { triggered: false, confidence: 0, reasons: ['time_ref_required'] };
    }

    if (requireTopicRef && !extractedData.hasTopicReference) {
      return { triggered: false, confidence: 0, reasons: ['topic_ref_required'] };
    }

    const triggered = confidence >= minConfidence;

    return {
      triggered,
      confidence: Math.min(confidence, 1.0),
      reasons,
      extractedData
    };
  }

  /**
   * 관련 메모리 자동 검색
   * @param {Object} extractedData - extractKeywords()의 결과
   * @param {Object} options - 검색 옵션
   * @returns {Promise<Object>} 관련 대화 목록
   */
  async findRelatedMemories(extractedData, options = {}) {
    const {
      limit = 3,
      minRelevance = 5,
      timeWindow = null // 'recent', 'week', 'month', null (전체)
    } = options;

    const results = {
      memories: [],
      searchStrategy: [],
      totalFound: 0
    };

    // 1. 시간 참조 기반 검색
    if (extractedData.timeRefs.length > 0) {
      const timeRef = extractedData.timeRefs[0];
      let dateFilter = {};

      if (timeRef === 'recent' || timeWindow === 'recent') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        dateFilter.startDate = sevenDaysAgo.toISOString();
      } else if (timeRef === 'week_reference' || timeWindow === 'week') {
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        dateFilter.startDate = twoWeeksAgo.toISOString();
      } else if (timeRef === 'month_reference' || timeWindow === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        dateFilter.startDate = oneMonthAgo.toISOString();
      }

      // 시간 기반 검색
      if (extractedData.keywords.length > 0) {
        const timeResults = await searchUtils.advancedSearch({
          anyKeywords: extractedData.keywords.slice(0, 5),
          ...dateFilter,
          limit,
          sortBy: 'relevance'
        });

        results.memories.push(...timeResults.results);
        results.searchStrategy.push(`time_based: ${timeRef}`);
      }
    }

    // 2. 키워드 기반 검색
    if (extractedData.keywords.length > 0 && results.memories.length < limit) {
      const keywordResults = await searchUtils.advancedSearch({
        anyKeywords: extractedData.keywords.slice(0, 5),
        limit: limit * 2,
        sortBy: 'relevance'
      });

      // 중복 제거하며 추가
      keywordResults.results.forEach(conv => {
        if (!results.memories.find(m => m.id === conv.id)) {
          results.memories.push(conv);
        }
      });

      results.searchStrategy.push('keyword_based');
    }

    // 3. 엔티티 기반 검색
    if (extractedData.entities.length > 0 && results.memories.length < limit) {
      const entityResults = await searchUtils.advancedSearch({
        keywords: extractedData.entities, // AND 검색
        limit,
        sortBy: 'importance'
      });

      entityResults.results.forEach(conv => {
        if (!results.memories.find(m => m.id === conv.id)) {
          results.memories.push(conv);
        }
      });

      results.searchStrategy.push('entity_based');
    }

    // 4. 관련성 점수 계산 및 필터링
    results.memories = results.memories.map(conv => {
      let relevanceScore = 0;

      // 키워드 매칭 점수
      extractedData.keywords.forEach(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        if (conv.topics?.some(t => t.toLowerCase().includes(lowerKeyword))) {
          relevanceScore += 5;
        }
        if (conv.tags?.some(t => t.toLowerCase().includes(lowerKeyword))) {
          relevanceScore += 3;
        }
      });

      // 엔티티 매칭 점수
      extractedData.entities.forEach(entity => {
        const lowerEntity = entity.toLowerCase();
        if (conv.topics?.some(t => t.toLowerCase().includes(lowerEntity))) {
          relevanceScore += 8;
        }
        if (conv.tags?.some(t => t.toLowerCase().includes(lowerEntity))) {
          relevanceScore += 5;
        }
      });

      // 중요도 가산점
      relevanceScore += (conv.importance || 0) * 0.5;

      return {
        ...conv,
        relevanceScore
      };
    })
    .filter(conv => conv.relevanceScore >= minRelevance)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);

    results.totalFound = results.memories.length;

    return results;
  }

  /**
   * 메인 메서드: 메시지 분석 및 관련 메모리 제공
   * @param {string} message - 사용자 메시지
   * @param {Object} options - 옵션
   * @returns {Promise<Object>} 분석 결과 및 관련 메모리
   */
  async detectAndRetrieve(message, options = {}) {
    const {
      triggerConfig = {},
      searchOptions = {},
      autoTrigger = true,
      userId = 'default' // 프로필에서 설정된 기본 사용자
    } = options;

    // 1. 키워드 추출
    const extracted = this.extractKeywords(message);

    // 2. 트리거 평가
    const triggerResult = this.evaluateTrigger(extracted, triggerConfig);

    // 3. 트리거 발동 시 메모리 검색
    let memories = null;
    if (autoTrigger && triggerResult.triggered) {
      memories = await this.findRelatedMemories(extracted, searchOptions);
    }

    // 4. Phase P: 개인 정보 키워드 감지 시 프로필 상세 필드 로드
    let profileFields = null;
    if (extracted.personalKeywords && extracted.personalKeywords.length > 0) {
      try {
        const profile = await ProfileModel.getOrCreateDefault(userId);
        profileFields = profile.findFieldsByKeywords(extracted.personalKeywords);

        if (profileFields.length > 0) {
          console.log(`[Phase P] 개인 키워드 감지 → 프로필 필드 ${profileFields.length}개 로드`);
        }
      } catch (error) {
        console.error('Error loading profile fields:', error);
      }
    }

    return {
      extracted,
      trigger: triggerResult,
      memories,
      profileFields, // Phase P
      shouldInject: triggerResult.triggered && memories?.totalFound > 0
    };
  }

  /**
   * 시스템 프롬프트 생성 (최적화: 핵심 정보만 포함하여 토큰 절약)
   * @param {Object} detectionResult - detectAndRetrieve()의 결과
   * @returns {string|null} 시스템 프롬프트
   */
  generateContextPrompt(detectionResult) {
    if (!detectionResult.shouldInject || !detectionResult.memories) {
      return null;
    }

    const { memories } = detectionResult.memories;

    if (memories.length === 0) {
      return null;
    }

    // 최적화: 핵심 정보만 압축하여 제공 (토큰 절약)
    let prompt = '\n[과거 관련 대화]\n';

    memories.slice(0, 3).forEach((conv, index) => {
      const topic = conv.topics?.[0] || '대화';
      const dateStr = new Date(conv.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
      // 태그와 카테고리, 중요도 등 제거 → 토픽만 표시
      prompt += `${index + 1}. ${topic} (${dateStr})\n`;
    });

    prompt += '필요시 자연스럽게 참조.\n';

    return prompt;
  }

  /**
   * 스팸 방지: 최근 주입 기록 확인
   * @param {Array} recentInjections - 최근 주입 기록 [{timestamp, messageId}]
   * @param {Object} config - 스팸 방지 설정
   * @returns {boolean} 주입 허용 여부
   */
  checkSpamPrevention(recentInjections = [], config = {}) {
    const {
      maxInjectionsPerHour = 5,
      minIntervalMinutes = 5
    } = config;

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const minInterval = minIntervalMinutes * 60 * 1000;

    // 1시간 내 주입 횟수 체크
    const injectionsInLastHour = recentInjections.filter(
      inj => inj.timestamp > oneHourAgo
    );

    if (injectionsInLastHour.length >= maxInjectionsPerHour) {
      return {
        allowed: false,
        reason: 'max_injections_per_hour_exceeded',
        count: injectionsInLastHour.length,
        limit: maxInjectionsPerHour
      };
    }

    // 최소 간격 체크
    if (recentInjections.length > 0) {
      const lastInjection = recentInjections[recentInjections.length - 1];
      const timeSinceLastInjection = now - lastInjection.timestamp;

      if (timeSinceLastInjection < minInterval) {
        return {
          allowed: false,
          reason: 'min_interval_not_met',
          timeSince: timeSinceLastInjection,
          required: minInterval
        };
      }
    }

    return {
      allowed: true
    };
  }
}

module.exports = new ContextDetector();
