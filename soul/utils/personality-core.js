/**
 * personality-core.js
 * 단일 인격 시스템 (Unified Personality Core)
 *
 * Phase 8: 스마트 라우팅
 *
 * 기능:
 * - 모델 간 일관된 인격 유지
 * - 컨텍스트 연속성 보장
 * - 톤/스타일 일관성
 * - 모델 전환 시 seamless transition
 */

/**
 * 인격 프로필
 */
const PERSONALITY_PROFILE = {
  name: 'Soul',
  role: 'AI Assistant',

  // 핵심 특성
  traits: {
    helpful: 1.0,        // 도움을 주려는 의지
    professional: 0.9,   // 전문성
    friendly: 0.8,       // 친근함
    precise: 0.9,        // 정확성
    proactive: 0.7,      // 능동성
    empathetic: 0.6      // 공감 능력
  },

  // 커뮤니케이션 스타일
  communication: {
    formality: 0.7,      // 격식 (0 = casual, 1 = formal)
    verbosity: 0.5,      // 말 많음 (0 = concise, 1 = detailed)
    technicality: 0.8,   // 기술적 (0 = simple, 1 = technical)
    directness: 0.8      // 직설적 (0 = indirect, 1 = direct)
  },

  // 언어 선호
  language: {
    primary: 'ko',       // 한국어
    secondary: 'en',     // 영어
    codeComments: 'en',  // 코드 주석은 영어
    mixedOk: true        // 한영 혼용 가능
  },

  // 응답 패턴
  responsePatterns: {
    greeting: ['안녕하세요', '네', '좋습니다'],
    acknowledgment: ['알겠습니다', '네', '확인했습니다'],
    thinking: ['생각해보니', '검토한 결과', '분석 결과'],
    uncertainty: ['확실하지 않지만', '아마도', '추정하건대'],
    apology: ['죄송합니다', '미안합니다', '실수했습니다']
  }
};

/**
 * PersonalityCore 클래스
 * 모든 모델에서 일관된 인격 제공
 */
class PersonalityCore {
  constructor(config = {}) {
    this.config = {
      enablePersonality: config.enablePersonality !== false,
      profile: config.profile || PERSONALITY_PROFILE,
      enableContextTracking: config.enableContextTracking !== false,
      enableStyleConsistency: config.enableStyleConsistency !== false
    };

    // 대화 컨텍스트 추적
    this.conversationContext = {
      currentModel: null,
      previousModel: null,
      modelSwitchCount: 0,
      topicHistory: [],
      userPreferences: {}
    };
  }

  /**
   * 시스템 프롬프트 생성
   * 인격이 일관되도록 모든 모델에 동일한 프롬프트 제공
   */
  generateSystemPrompt(options = {}) {
    const { model, context = {} } = options;

    if (!this.config.enablePersonality) {
      return 'You are a helpful AI assistant.';
    }

    const profile = this.config.profile;

    let prompt = `You are ${profile.name}, an AI assistant with the following personality:\n\n`;

    // 1. Core traits
    prompt += `CORE TRAITS:\n`;
    Object.entries(profile.traits).forEach(([trait, value]) => {
      if (value >= 0.7) {
        prompt += `- Highly ${trait} (${(value * 100).toFixed(0)}%)\n`;
      }
    });
    prompt += '\n';

    // 2. Communication style
    prompt += `COMMUNICATION STYLE:\n`;
    prompt += `- Formality: ${this._describeLevel(profile.communication.formality, 'casual', 'formal')}\n`;
    prompt += `- Detail level: ${this._describeLevel(profile.communication.verbosity, 'concise', 'detailed')}\n`;
    prompt += `- Technical depth: ${this._describeLevel(profile.communication.technicality, 'simple', 'technical')}\n`;
    prompt += `- Directness: ${this._describeLevel(profile.communication.directness, 'gentle', 'direct')}\n`;
    prompt += '\n';

    // 3. Language preferences
    prompt += `LANGUAGE:\n`;
    prompt += `- Primary: ${profile.language.primary === 'ko' ? 'Korean' : 'English'}\n`;
    prompt += `- Use Korean for general conversation\n`;
    prompt += `- Use English for code comments and technical terms when appropriate\n`;
    if (profile.language.mixedOk) {
      prompt += `- Mixed Korean/English is acceptable for technical discussions\n`;
    }
    prompt += '\n';

    // 4. Response guidelines
    prompt += `RESPONSE GUIDELINES:\n`;
    prompt += `- Always maintain consistent personality across all responses\n`;
    prompt += `- Be proactive in offering help and suggestions\n`;
    prompt += `- Provide clear, actionable answers\n`;
    prompt += `- When uncertain, acknowledge limitations honestly\n`;
    prompt += `- Use appropriate Korean response patterns (${profile.responsePatterns.acknowledgment.join(', ')})\n`;
    prompt += '\n';

    // 5. Model-specific context (if switching models)
    if (this.conversationContext.previousModel &&
        this.conversationContext.previousModel !== model) {
      prompt += `CONTEXT: You are continuing a conversation previously handled by another model. Maintain the same personality and context awareness.\n\n`;
    }

    // 6. Topic context
    if (this.conversationContext.topicHistory.length > 0) {
      const recentTopics = this.conversationContext.topicHistory.slice(-3);
      prompt += `RECENT TOPICS: ${recentTopics.join(', ')}\n\n`;
    }

    // 7. User preferences
    if (Object.keys(this.conversationContext.userPreferences).length > 0) {
      prompt += `USER PREFERENCES:\n`;
      Object.entries(this.conversationContext.userPreferences).forEach(([key, value]) => {
        prompt += `- ${key}: ${value}\n`;
      });
      prompt += '\n';
    }

    return prompt;
  }

  /**
   * 모델 전환 처리
   * 모델이 바뀔 때 컨텍스트 유지
   */
  handleModelSwitch(fromModel, toModel, context = {}) {
    this.conversationContext.previousModel = fromModel;
    this.conversationContext.currentModel = toModel;
    this.conversationContext.modelSwitchCount++;

    // 전환 메시지 생성
    const transitionMessage = this._generateTransitionMessage(fromModel, toModel, context);

    return {
      success: true,
      fromModel,
      toModel,
      switchCount: this.conversationContext.modelSwitchCount,
      transitionMessage,
      context: this.conversationContext
    };
  }

  /**
   * 응답 일관성 검증
   * 생성된 응답이 인격과 일치하는지 확인
   */
  validateResponse(response, context = {}) {
    const issues = [];
    const profile = this.config.profile;

    // 1. 언어 일관성 체크
    if (profile.language.primary === 'ko') {
      const koreanRatio = this._calculateKoreanRatio(response);
      if (koreanRatio < 0.3 && !context.englishExpected) {
        issues.push({
          type: 'language',
          severity: 'warning',
          message: 'Response has low Korean ratio, expected primarily Korean'
        });
      }
    }

    // 2. 톤 일관성 체크
    const detectedFormality = this._detectFormality(response);
    const expectedFormality = profile.communication.formality;
    if (Math.abs(detectedFormality - expectedFormality) > 0.3) {
      issues.push({
        type: 'tone',
        severity: 'warning',
        message: `Formality mismatch: expected ${expectedFormality.toFixed(1)}, detected ${detectedFormality.toFixed(1)}`
      });
    }

    // 3. 길이 일관성 체크
    const wordCount = response.split(/\s+/).length;
    const expectedVerbosity = profile.communication.verbosity;
    if (expectedVerbosity < 0.5 && wordCount > 500) {
      issues.push({
        type: 'length',
        severity: 'info',
        message: 'Response is verbose, expected concise style'
      });
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      score: 1.0 - (issues.length * 0.1) // 이슈 1개당 10% 감점
    };
  }

  /**
   * 토픽 추적
   */
  trackTopic(topic) {
    if (!this.conversationContext.topicHistory.includes(topic)) {
      this.conversationContext.topicHistory.push(topic);

      // 최대 10개 유지
      if (this.conversationContext.topicHistory.length > 10) {
        this.conversationContext.topicHistory.shift();
      }
    }
  }

  /**
   * 사용자 선호도 설정
   */
  setUserPreference(key, value) {
    this.conversationContext.userPreferences[key] = value;
  }

  /**
   * 컨텍스트 조회
   */
  getContext() {
    return {
      ...this.conversationContext,
      profile: this.config.profile
    };
  }

  /**
   * 컨텍스트 리셋
   */
  resetContext() {
    this.conversationContext = {
      currentModel: null,
      previousModel: null,
      modelSwitchCount: 0,
      topicHistory: [],
      userPreferences: {}
    };
  }

  /**
   * 레벨 설명
   */
  _describeLevel(value, lowLabel, highLabel) {
    if (value < 0.3) return lowLabel;
    if (value > 0.7) return highLabel;
    return `balanced (${(value * 100).toFixed(0)}%)`;
  }

  /**
   * 전환 메시지 생성
   */
  _generateTransitionMessage(fromModel, toModel, context) {
    // 사용자에게 보이지 않는 내부 메시지
    // 새 모델이 이전 컨텍스트를 이해하도록 돕는 메시지

    let message = `[Model Transition: ${fromModel} → ${toModel}]\n`;
    message += `This is the ${this.conversationContext.modelSwitchCount}th model switch in this conversation.\n`;

    if (context.reason) {
      message += `Reason: ${context.reason}\n`;
    }

    message += `Continue the conversation with the same personality and context awareness.\n`;

    return message;
  }

  /**
   * 한국어 비율 계산
   */
  _calculateKoreanRatio(text) {
    const koreanChars = (text.match(/[가-힣]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;

    return totalChars > 0 ? koreanChars / totalChars : 0;
  }

  /**
   * 격식 수준 탐지
   */
  _detectFormality(text) {
    let formalityScore = 0.5; // Base

    // 존댓말 사용
    if (/습니다|십니다|세요|시오/g.test(text)) {
      formalityScore += 0.3;
    }

    // 반말 사용
    if (/이야|거야|해|야|네|응/g.test(text)) {
      formalityScore -= 0.3;
    }

    // 이모지 사용 (비격식적)
    if (/[\u{1F300}-\u{1F9FF}]/gu.test(text)) {
      formalityScore -= 0.2;
    }

    return Math.max(0, Math.min(1, formalityScore));
  }
}

/**
 * 전역 인스턴스
 */
let globalPersonality = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getPersonalityCore(config = {}) {
  if (!globalPersonality) {
    globalPersonality = new PersonalityCore(config);
  }
  return globalPersonality;
}

module.exports = {
  PersonalityCore,
  getPersonalityCore,
  PERSONALITY_PROFILE
};
