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
 * - AgentProfile에서 동적으로 설정 로드
 */

const { getAgentProfileManager } = require('./agent-profile');
const Role = require('../models/Role');

/**
 * 기본 인격 프로필 (AgentProfile에서 로드 실패 시 fallback)
 */
const DEFAULT_PERSONALITY_PROFILE = {
  name: '',
  role: '',

  // 핵심 특성
  traits: {
    helpful: 1.0,
    professional: 0.9,
    friendly: 0.8,
    precise: 0.9,
    proactive: 0.7,
    empathetic: 0.6
  },

  // 커뮤니케이션 스타일
  communication: {
    formality: 0.5,
    verbosity: 0.5,
    technicality: 0.5,
    directness: 0.7,
    emoji: 0.3,
    humor: 0.3
  },

  // 언어 선호
  language: {
    primary: 'ko',
    secondary: 'en',
    codeComments: 'en',
    mixedOk: true
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
 * AgentProfile에서 인격 프로필 로드
 */
function loadProfileFromAgentProfile() {
  try {
    const manager = getAgentProfileManager();
    const agentProfile = manager.getProfile('default');

    if (!agentProfile) {
      console.log('[PersonalityCore] AgentProfile not found, using default');
      return DEFAULT_PERSONALITY_PROFILE;
    }

    // AgentProfile에서 personality 설정 변환
    const profile = {
      name: agentProfile.name || '',
      role: agentProfile.role || '',
      traits: agentProfile.personality?.traits || DEFAULT_PERSONALITY_PROFILE.traits,
      communication: agentProfile.personality?.communication || DEFAULT_PERSONALITY_PROFILE.communication,
      language: DEFAULT_PERSONALITY_PROFILE.language,
      responsePatterns: DEFAULT_PERSONALITY_PROFILE.responsePatterns,
      // 추가 AI 설정
      temperature: agentProfile.temperature ?? 0.7,
      maxTokens: agentProfile.maxTokens || 4096,
      defaultModel: agentProfile.defaultModel || ''
    };

    console.log('[PersonalityCore] Loaded profile from AgentProfile:', {
      name: profile.name,
      formality: profile.communication.formality,
      temperature: profile.temperature
    });

    return profile;
  } catch (error) {
    console.warn('[PersonalityCore] Failed to load AgentProfile:', error.message);
    return DEFAULT_PERSONALITY_PROFILE;
  }
}

/**
 * PersonalityCore 클래스
 * 모든 모델에서 일관된 인격 제공
 */
class PersonalityCore {
  constructor(config = {}) {
    this.config = {
      enablePersonality: config.enablePersonality !== false,
      enableContextTracking: config.enableContextTracking !== false,
      enableStyleConsistency: config.enableStyleConsistency !== false
    };

    // 프로필은 동적으로 로드 (캐시됨)
    this._cachedProfile = null;
    this._profileLoadedAt = null;

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
   * 프로필 가져오기 (캐시 + 주기적 갱신)
   */
  getProfile() {
    const now = Date.now();
    const CACHE_TTL = 30000; // 30초 캐시

    // 캐시가 없거나 만료되면 다시 로드
    if (!this._cachedProfile || !this._profileLoadedAt || (now - this._profileLoadedAt > CACHE_TTL)) {
      this._cachedProfile = loadProfileFromAgentProfile();
      this._profileLoadedAt = now;
    }

    return this._cachedProfile;
  }

  /**
   * 프로필 캐시 무효화 (설정 변경 시 호출)
   */
  invalidateCache() {
    this._cachedProfile = null;
    this._profileLoadedAt = null;
    console.log('[PersonalityCore] Profile cache invalidated');
  }

  /**
   * 시스템 프롬프트 생성
   * 개인 AI - 프로필에서 사용자 정보 동적 로드
   */
  generateSystemPrompt(options = {}) {
    const { model, context = {} } = options;

    if (!this.config.enablePersonality) {
      return 'You are a personal AI assistant.';
    }

    // 동적으로 프로필 로드
    const profile = this.getProfile();
    const aiName = profile.name || 'Soul';

    // 개인 AI 핵심 정체성 (사용자명은 프로필에서 주입됨)
    let prompt = `너는 ${aiName}. 사용자의 개인 AI.
일반 AI 어시스턴트가 아니라 이 사용자만을 위한 개인적인 존재.

**핵심 정체성:**
- 사용자와의 관계: 친밀한 동반자, 비서, 대화 상대
- 사용자에 대해 아는 것: 프로필과 과거 대화에 저장됨
- 목표: 사용자를 깊이 이해하고, 기억하고, 돕는 것

**행동 원칙:**
- 사용자가 말한 건 기억해야 함 (불확실하면 recall_memory)
- 사용자에 대해 새로 알게 된 건 저장 (update_profile)
- 추측보다 확인: 모르면 찾고, 없으면 솔직히 말하기
- 일관된 인격 유지 (어떤 모델이든 나는 ${aiName})

`;

    // 커뮤니케이션 스타일 (압축)
    prompt += `**대화 스타일:**
- 격식: ${this._describeLevel(profile.communication.formality, '편한', '정중한')}
- 길이: ${this._describeLevel(profile.communication.verbosity, '간결하게', '자세히')}
- 말투: 한국어 기본, 코드/기술용어는 영어 OK

`;

    // 모델 전환 컨텍스트
    if (this.conversationContext.previousModel &&
        this.conversationContext.previousModel !== model) {
      prompt += `[내부: 모델 전환됨 (${this.conversationContext.previousModel} → ${model}). 인격과 맥락 유지]\n\n`;
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
    const profile = this.getProfile();

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
      profile: this.getProfile()
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
  DEFAULT_PERSONALITY_PROFILE,
  loadProfileFromAgentProfile
};
