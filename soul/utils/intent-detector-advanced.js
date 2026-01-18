/**
 * intent-detector-advanced.js
 * 고도화된 의도 감지 시스템
 *
 * Week 2: 자연어 설정 고도화
 *
 * 기능:
 * - 기존 IntentDetector 확장
 * - ContextTracker 통합
 * - PatternLearner 통합
 * - 개인화된 의도 감지
 */

const { getContextTracker } = require('./context-tracker');
const { getPatternLearner } = require('./pattern-learner');

/**
 * AdvancedIntentDetector 클래스
 * 기존 IntentDetector를 확장
 */
class AdvancedIntentDetector {
  constructor() {
    // 기존 IntentDetector의 기능 포함
    this.intentCategories = {
      // 메모리/검색 관련
      MEMORY_SEARCH: 'memory_search',
      MEMORY_VIEW: 'memory_view',
      MEMORY_DELETE: 'memory_delete',

      // 설정 관련
      SETTING_CHANGE: 'setting_change',
      SETTING_VIEW: 'setting_view',

      // UI/패널 관련
      PANEL_OPEN: 'panel_open',
      PANEL_CLOSE: 'panel_close',
      PANEL_TOGGLE: 'panel_toggle',
      PANEL_SWITCH: 'panel_switch',

      // 대화방 관련
      CONVERSATION_NEW: 'conversation_new',
      CONVERSATION_SWITCH: 'conversation_switch',
      CONVERSATION_DELETE: 'conversation_delete',

      // 일반 대화
      CONVERSATION: 'conversation',

      // 기타
      HELP: 'help',
      UNKNOWN: 'unknown'
    };

    // 패턴 정의
    this.patterns = this.initializePatterns();

    // 설정
    this.config = {
      minConfidence: 0.7,
      enableFuzzyMatching: true,
      enableContextAware: true,
      enablePatternLearning: true,
      feedbackEnabled: true
    };

    // 통합 시스템
    this.contextTracker = getContextTracker();
    this.patternLearner = getPatternLearner();
  }

  /**
   * 패턴 초기화
   */
  initializePatterns() {
    return {
      // 메모리 검색
      memory_search: [
        /(?:찾아|검색|조회).*(?:기억|메모리|대화|내용)/i,
        /(?:언제|어떤|무슨).*(?:말|대화|이야기).*(?:했|나눴)/i,
        /(?:전에|예전에|과거에).*(?:말|대화)/i
      ],

      // 메모리 보기
      memory_view: [
        /(?:보여|확인).*(?:기억|메모리|대화)/i,
        /(?:기억|메모리|대화).*(?:목록|리스트)/i
      ],

      // 설정 변경
      setting_change: [
        /(?:설정|바꿔|변경).*(?:모델|온도|temperature)/i,
        /(?:모델|model).*(?:변경|바꿔|설정)/i,
        /(haiku|sonnet|opus).*(?:로|으로)\s*(?:바꿔|변경|설정)/i
      ],

      // 패널 열기
      panel_open: [
        /(?:열어|보여|띄워).*(?:패널|창|화면)/i,
        /(?:패널|창).*(?:열어|보여|띄워)/i
      ],

      // 도움말
      help: [
        /(?:도움말|help|사용법|명령어)/i,
        /(?:어떻게|뭘).*(?:할 수 있|가능)/i
      ]
    };
  }

  /**
   * 고도화된 의도 감지
   */
  async detect(sessionId, message, options = {}) {
    const {
      includeContext = true,
      includePatterns = true,
      messageId = null
    } = options;

    // 1. 컨텍스트 추출
    let contextItems = [];
    if (includeContext && messageId) {
      contextItems = this.contextTracker.extractFromMessage(
        sessionId,
        message,
        messageId
      );
    }

    // 2. 학습된 패턴 적용
    let learnedMatches = [];
    if (includePatterns) {
      learnedMatches = this.patternLearner.applyPatterns(
        sessionId,
        message
      );
    }

    // 3. 기본 패턴 매칭
    const basicIntent = this._detectBasicIntent(message);

    // 4. 컨텍스트 기반 의도 조정
    let adjustedIntent = basicIntent;
    if (contextItems.length > 0) {
      adjustedIntent = this._adjustIntentWithContext(
        basicIntent,
        contextItems
      );
    }

    // 5. 학습된 패턴이 더 신뢰도가 높으면 사용
    let finalIntent = adjustedIntent;
    let confidence = adjustedIntent.confidence;
    let source = 'basic';

    if (learnedMatches.length > 0 && learnedMatches[0].confidence > confidence) {
      finalIntent = {
        ...adjustedIntent,
        intent: learnedMatches[0].intent
      };
      confidence = learnedMatches[0].confidence;
      source = 'learned';
    }

    // 6. 대명사 해소
    const resolvedReferences = this._resolveReferences(sessionId, message);

    // 7. 결과 구성
    const result = {
      intent: finalIntent.intent,
      confidence,
      source,
      params: finalIntent.params,
      context: {
        items: contextItems.map(item => item.toJSON()),
        current: includeContext
          ? this.contextTracker.getCurrent(sessionId)
          : null
      },
      learnedPatterns: learnedMatches.slice(0, 3),
      resolvedReferences,
      originalMessage: message
    };

    return result;
  }

  /**
   * 기본 의도 감지
   */
  _detectBasicIntent(message) {
    for (const [intent, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          const params = this._extractParams(message, intent);
          return {
            intent: this.intentCategories[intent.toUpperCase()] || intent,
            confidence: 0.8,
            params
          };
        }
      }
    }

    // 일반 대화로 분류
    return {
      intent: this.intentCategories.CONVERSATION,
      confidence: 0.5,
      params: {}
    };
  }

  /**
   * 파라미터 추출
   */
  _extractParams(message, intent) {
    const params = {};

    // 의도별 파라미터 추출
    switch (intent) {
      case 'memory_search':
        params.query = message;
        break;

      case 'setting_change':
        // 모델 추출
        const modelMatch = message.match(/(haiku|sonnet|opus)/i);
        if (modelMatch) {
          params.model = modelMatch[1].toLowerCase();
        }
        break;

      case 'panel_open':
        // 패널 타입 추출
        const panelTypes = [
          'memory',
          'settings',
          'history',
          'search',
          'profile'
        ];
        for (const type of panelTypes) {
          if (message.includes(type) || message.includes(type + '패널')) {
            params.panelType = type;
            break;
          }
        }
        break;
    }

    return params;
  }

  /**
   * 컨텍스트 기반 의도 조정
   */
  _adjustIntentWithContext(basicIntent, contextItems) {
    // 컨텍스트를 기반으로 의도 신뢰도 조정
    const relevantContext = contextItems.filter(
      item => item.type === 'action' || item.type === 'topic'
    );

    if (relevantContext.length > 0) {
      return {
        ...basicIntent,
        confidence: Math.min(1.0, basicIntent.confidence + 0.1)
      };
    }

    return basicIntent;
  }

  /**
   * 대명사 해소
   */
  _resolveReferences(sessionId, message) {
    const pronouns = ['그것', '그거', '이것', '이거', '저것', '저거', '거기', '여기', '그때'];
    const resolved = {};

    for (const pronoun of pronouns) {
      if (message.includes(pronoun)) {
        const reference = this.contextTracker.resolveReference(
          sessionId,
          pronoun
        );
        if (reference) {
          resolved[pronoun] = reference.toJSON();
        }
      }
    }

    return resolved;
  }

  /**
   * 피드백 학습
   */
  async provideFeedback(sessionId, message, detectedIntent, correctIntent) {
    if (!this.config.enablePatternLearning) {
      return;
    }

    const wasCorrect = detectedIntent === correctIntent;

    // 학습
    this.patternLearner.learnCommand(
      sessionId,
      message,
      correctIntent || detectedIntent,
      wasCorrect
    );

    return {
      learned: true,
      wasCorrect,
      intent: correctIntent || detectedIntent
    };
  }

  /**
   * 선호도 설정
   */
  setPreference(sessionId, key, value) {
    this.patternLearner.learnPreference(sessionId, key, value);
  }

  /**
   * 선호도 조회
   */
  getPreference(sessionId, key, defaultValue = null) {
    return this.patternLearner.getPreference(sessionId, key, defaultValue);
  }

  /**
   * 단축 표현 등록
   */
  registerShortcut(sessionId, shortcut, fullCommand) {
    this.patternLearner.learnShortcut(sessionId, shortcut, fullCommand);
  }

  /**
   * 단축 표현 해소
   */
  resolveShortcut(sessionId, shortcut) {
    return this.patternLearner.resolveShortcut(sessionId, shortcut);
  }

  /**
   * 학습 통계
   */
  getStats(sessionId = null) {
    return {
      context: this.contextTracker.getStats(sessionId),
      patterns: this.patternLearner.getStats(sessionId)
    };
  }

  /**
   * 분석
   */
  async analyze(sessionId) {
    return {
      context: this.contextTracker.getCurrent(sessionId),
      patterns: this.patternLearner.analyzePatterns(sessionId),
      history: this.patternLearner.getHistory(sessionId, 20)
    };
  }

  /**
   * 세션 초기화
   */
  clear(sessionId) {
    this.contextTracker.clear(sessionId);
    this.patternLearner.clear(sessionId);
  }
}

/**
 * 전역 인스턴스
 */
let globalAdvancedIntentDetector = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getAdvancedIntentDetector() {
  if (!globalAdvancedIntentDetector) {
    globalAdvancedIntentDetector = new AdvancedIntentDetector();
  }
  return globalAdvancedIntentDetector;
}

module.exports = {
  AdvancedIntentDetector,
  getAdvancedIntentDetector
};
