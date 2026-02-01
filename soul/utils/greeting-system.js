/**
 * greeting-system.js
 * 안부 시스템
 *
 * Week 2: Proactive Messaging
 *
 * 기능:
 * - 시간대별 인사
 * - 마지막 대화 이후 경과 시간 기반 메시지
 * - 사용자 활동 패턴 분석
 * - 자연스러운 재시작 메시지
 */

const { getMemoryManager } = require('./memory-layers');
const { getNotificationManager, NOTIFICATION_TYPE, NOTIFICATION_PRIORITY } = require('./notification-manager');

/**
 * 인사 타입
 */
const GREETING_TYPE = {
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  NIGHT: 'night',
  WELCOME_BACK: 'welcome_back',
  LONG_TIME: 'long_time',
  FIRST_TIME: 'first_time'
};

/**
 * 시간대별 인사 템플릿
 */
const GREETING_TEMPLATES = {
  morning: [
    '좋은 아침이에요! 오늘도 잘 부탁드립니다.',
    '안녕하세요! 좋은 하루 되세요.',
    '좋은 아침입니다. 오늘은 무엇을 도와드릴까요?'
  ],
  afternoon: [
    '안녕하세요! 오후도 화이팅입니다.',
    '좋은 오후에요. 어떻게 도와드릴까요?',
    '오후 시간이네요. 무엇을 도와드릴까요?'
  ],
  evening: [
    '좋은 저녁이에요! 오늘 하루는 어떠셨나요?',
    '저녁 시간이네요. 편안한 시간 되세요.',
    '안녕하세요! 저녁 시간에도 도움이 필요하시면 언제든 말씀해 주세요.'
  ],
  night: [
    '늦은 시간이네요. 무리하지 마세요!',
    '밤늦게까지 수고하시네요. 어떻게 도와드릴까요?',
    '늦은 밤이에요. 건강 조심하세요!'
  ],
  welcome_back: [
    '다시 만나서 반가워요!',
    '오랜만이에요! 그동안 잘 지내셨나요?',
    '돌아오셨군요! 무엇을 도와드릴까요?'
  ],
  long_time: [
    '정말 오랜만이에요! {days}일 만이네요. 그동안 어떻게 지내셨어요?',
    '와, {days}일 만에 뵙네요! 많이 기다렸어요.',
    '{days}일 만이에요. 그동안 무슨 일 있으셨나요?'
  ],
  first_time: [
    '처음 뵙겠습니다! 저는 Soul이에요. 잘 부탁드려요.',
    '안녕하세요! Soul입니다. 무엇을 도와드릴까요?',
    '반가워요! 저는 여러분의 AI 어시스턴트 Soul입니다.'
  ]
};

/**
 * GreetingSystem 클래스
 */
class GreetingSystem {
  constructor() {
    this.lastGreeting = new Map(); // sessionId -> timestamp
    this.userPatterns = new Map(); // sessionId -> activity pattern
    this.config = {
      minGreetingInterval: 4 * 60 * 60 * 1000, // 4시간
      longTimeThreshold: 7 * 24 * 60 * 60 * 1000, // 7일
      welcomeBackThreshold: 24 * 60 * 60 * 1000, // 24시간
      analyzePatterns: true
    };
  }

  /**
   * 인사 생성
   */
  async generateGreeting(sessionId, options = {}) {
    const { force = false } = options;

    // 최근 인사했는지 확인
    if (!force && this._hasRecentGreeting(sessionId)) {
      return null;
    }

    // 사용자 활동 분석
    const analysis = await this._analyzeUserActivity(sessionId);

    // 인사 타입 결정
    const greetingType = this._determineGreetingType(analysis);

    // 메시지 생성
    const message = this._generateMessage(greetingType, analysis);

    // 인사 기록
    this.lastGreeting.set(sessionId, Date.now());

    return {
      type: greetingType,
      message,
      analysis
    };
  }

  /**
   * 자동 인사 (알림으로 전송)
   */
  async sendAutoGreeting(sessionId) {
    const greeting = await this.generateGreeting(sessionId);

    if (!greeting) {
      return null;
    }

    const notificationManager = getNotificationManager();

    const notification = notificationManager.create({
      type: NOTIFICATION_TYPE.GREETING,
      priority: NOTIFICATION_PRIORITY.LOW,
      title: '안부 인사',
      message: greeting.message,
      data: {
        greetingType: greeting.type,
        analysis: greeting.analysis
      },
      sessionId
    });

    await notificationManager.send(notification.id);

    return notification;
  }

  /**
   * 사용자 활동 분석
   */
  async _analyzeUserActivity(sessionId) {
    const memoryManager = await getMemoryManager();

    // 최근 메시지 조회
    const recentMessages = await memoryManager.getRecentMessages(
      sessionId,
      10
    );

    const analysis = {
      sessionId,
      lastMessageTime: null,
      timeSinceLastMessage: null,
      messageCount: recentMessages.length,
      isFirstTime: recentMessages.length === 0,
      timeOfDay: this._getTimeOfDay(),
      daysSinceLastMessage: 0
    };

    if (recentMessages.length > 0) {
      const lastMessage = recentMessages[0];
      analysis.lastMessageTime = new Date(lastMessage.timestamp);
      analysis.timeSinceLastMessage = Date.now() - analysis.lastMessageTime;
      analysis.daysSinceLastMessage = Math.floor(
        analysis.timeSinceLastMessage / (24 * 60 * 60 * 1000)
      );
    }

    // 활동 패턴 분석
    if (this.config.analyzePatterns && recentMessages.length > 0) {
      analysis.pattern = this._analyzePattern(recentMessages);
    }

    return analysis;
  }

  /**
   * 활동 패턴 분석
   */
  _analyzePattern(messages) {
    const hourCounts = new Array(24).fill(0);
    const dayOfWeekCounts = new Array(7).fill(0);

    messages.forEach(msg => {
      const date = new Date(msg.timestamp);
      hourCounts[date.getHours()]++;
      dayOfWeekCounts[date.getDay()]++;
    });

    // 가장 활동이 많은 시간대
    const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts));
    const mostActiveDay = dayOfWeekCounts.indexOf(
      Math.max(...dayOfWeekCounts)
    );

    return {
      mostActiveHour,
      mostActiveDay,
      hourCounts,
      dayOfWeekCounts
    };
  }

  /**
   * 인사 타입 결정
   */
  _determineGreetingType(analysis) {
    // 첫 방문
    if (analysis.isFirstTime) {
      return GREETING_TYPE.FIRST_TIME;
    }

    // 오랜만에 방문
    if (analysis.timeSinceLastMessage > this.config.longTimeThreshold) {
      return GREETING_TYPE.LONG_TIME;
    }

    // 하루 이상 지남
    if (analysis.timeSinceLastMessage > this.config.welcomeBackThreshold) {
      return GREETING_TYPE.WELCOME_BACK;
    }

    // 시간대별 인사
    return analysis.timeOfDay;
  }

  /**
   * 메시지 생성
   */
  _generateMessage(greetingType, analysis) {
    const templates = GREETING_TEMPLATES[greetingType];

    if (!templates || templates.length === 0) {
      return '안녕하세요! 무엇을 도와드릴까요?';
    }

    // 랜덤 선택
    let message = templates[Math.floor(Math.random() * templates.length)];

    // 변수 치환
    if (greetingType === GREETING_TYPE.LONG_TIME) {
      message = message.replace('{days}', analysis.daysSinceLastMessage);
    }

    // 패턴 기반 추가 메시지
    if (analysis.pattern) {
      const additionalMessage = this._generatePatternBasedMessage(
        analysis.pattern
      );
      if (additionalMessage) {
        message += ' ' + additionalMessage;
      }
    }

    return message;
  }

  /**
   * 패턴 기반 메시지 생성
   */
  _generatePatternBasedMessage(pattern) {
    const currentHour = new Date().getHours();

    // 평소와 다른 시간대라면
    if (Math.abs(currentHour - pattern.mostActiveHour) > 4) {
      return '평소와 다른 시간이네요!';
    }

    return null;
  }

  /**
   * 현재 시간대
   */
  _getTimeOfDay() {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
      return GREETING_TYPE.MORNING;
    } else if (hour >= 12 && hour < 17) {
      return GREETING_TYPE.AFTERNOON;
    } else if (hour >= 17 && hour < 22) {
      return GREETING_TYPE.EVENING;
    } else {
      return GREETING_TYPE.NIGHT;
    }
  }

  /**
   * 최근 인사 여부
   */
  _hasRecentGreeting(sessionId) {
    const lastGreeting = this.lastGreeting.get(sessionId);

    if (!lastGreeting) {
      return false;
    }

    const elapsed = Date.now() - lastGreeting;
    return elapsed < this.config.minGreetingInterval;
  }

  /**
   * 사용자 선호 시간대 학습
   */
  async learnUserPreferences(sessionId) {
    const memoryManager = await getMemoryManager();

    // 최근 30일간의 메시지
    const messages = await memoryManager.getRecentMessages(sessionId, 1000);

    if (messages.length < 10) {
      return null; // 데이터 부족
    }

    const pattern = this._analyzePattern(messages);

    this.userPatterns.set(sessionId, {
      pattern,
      updatedAt: new Date()
    });

    return pattern;
  }

  /**
   * 사용자 패턴 조회
   */
  getUserPattern(sessionId) {
    return this.userPatterns.get(sessionId);
  }

  /**
   * 통계
   */
  getStats() {
    return {
      totalGreetings: this.lastGreeting.size,
      learnedPatterns: this.userPatterns.size,
      config: this.config
    };
  }
}

/**
 * 전역 인스턴스
 */
let globalGreetingSystem = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getGreetingSystem() {
  if (!globalGreetingSystem) {
    globalGreetingSystem = new GreetingSystem();
  }
  return globalGreetingSystem;
}

module.exports = {
  GreetingSystem,
  getGreetingSystem,
  GREETING_TYPE,
  GREETING_TEMPLATES
};
