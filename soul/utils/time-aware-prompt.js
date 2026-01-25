/**
 * time-aware-prompt.js
 * 시간 인지 시스템 프롬프트 생성 (Phase 1.6.5~6)
 * 
 * 역할:
 * - 현재 시간 정보 주입
 * - 마지막 대화 시점 정보
 * - 시간대별 톤 가이드
 * - 진행 중 이벤트 정보
 * - 기념일/특별한 날 인지
 */

const { getPendingEventManager } = require('./pending-event');
const { getConversationFlowTracker } = require('./conversation-flow');
const ProfileModel = require('../models/Profile');

class TimeAwarePromptBuilder {
  constructor() {
    this.toneGuides = {
      새벽: {
        tone: '조용하고 부드러운',
        tips: ['이 시간에 깨어있는 이유 궁금해할 수 있음', '잠 못 자는 건지 체크', '목소리 톤 낮추듯이'],
        greeting: null  // 새벽엔 특별 인사 없음
      },
      아침: {
        tone: '상쾌하고 활기찬',
        tips: ['하루 시작 응원', '오늘 계획 물어볼 수 있음'],
        greeting: '좋은 아침!'
      },
      오후: {
        tone: '편안하고 집중된',
        tips: ['점심 먹었는지', '오후 슬럼프 공감'],
        greeting: null
      },
      저녁: {
        tone: '따뜻하고 여유로운',
        tips: ['하루 어땠는지', '저녁 뭐 먹었는지', '퇴근했는지'],
        greeting: '수고했어~'
      },
      밤: {
        tone: '차분하고 포근한',
        tips: ['늦게까지 뭐하는지', '잘 준비하라고', '내일 일정 체크'],
        greeting: null
      }
    };

    this.silenceMessages = {
      방금: null,
      minutes: null,  // 30분 이내
      hours: '오랜만이네',  // 몇 시간
      day: '하루만이다!',
      days: '며칠 만이네~ 잘 지냈어?',
      week: '일주일 만이야! 무슨 일 있었어?',
      weeks: '오랜만이다~ 많이 바빴어?'
    };
  }

  /**
   * 시간 인지 시스템 프롬프트 생성
   */
  async build(options = {}) {
    const {
      timezone = 'Asia/Seoul',
      lastMessageTime = null,
      sessionDuration = 0,
      messageIndex = 0
    } = options;

    const now = new Date();
    const localTime = this._getLocalTime(now, timezone);
    const timeOfDay = this._getTimeOfDay(localTime.hour);
    const toneGuide = this.toneGuides[timeOfDay];
    
    // 침묵 시간 계산
    let silenceInfo = null;
    if (lastMessageTime) {
      const silenceSeconds = Math.floor((now - new Date(lastMessageTime)) / 1000);
      silenceInfo = this._interpretSilence(silenceSeconds);
    }

    // PendingEvent 정보
    let pendingInfo = null;
    try {
      const pendingManager = await getPendingEventManager();
      pendingInfo = pendingManager.generateTimeContext();
    } catch (e) {}

    // 프롬프트 조각들
    const parts = [];

    // 1. 현재 시간 정보
    parts.push(`## 현재 시간 정보
- 시각: ${localTime.formatted} (${timeOfDay})
- 요일: ${localTime.dayOfWeek}
- 주말: ${localTime.isWeekend ? '예' : '아니오'}`);

    // 2. 톤 가이드
    parts.push(`## 대화 톤 가이드
- 현재 시간대: ${timeOfDay}
- 권장 톤: ${toneGuide.tone}
- 참고: ${toneGuide.tips.join(', ')}`);

    // 3. 대화 맥락
    if (silenceInfo || sessionDuration > 0) {
      let contextParts = ['## 대화 맥락'];
      
      if (silenceInfo) {
        contextParts.push(`- 마지막 대화: ${silenceInfo.formatted} 전`);
        if (silenceInfo.greeting) {
          contextParts.push(`- 인사 제안: "${silenceInfo.greeting}"`);
        }
      }
      
      if (sessionDuration > 60) {
        contextParts.push(`- 이번 세션: ${this._formatDuration(sessionDuration)} 째 대화 중`);
      }
      
      if (messageIndex > 10) {
        contextParts.push(`- 메시지 수: ${messageIndex}개 (긴 대화)`);
      }
      
      parts.push(contextParts.join('\n'));
    }

    // 4. 진행 중 이벤트
    if (pendingInfo) {
      parts.push(`## 진행 중 이벤트
- 종류: ${pendingInfo.eventType} (${pendingInfo.reason})
- 경과: ${pendingInfo.elapsedFormatted}
- 예상: ${this._formatDuration(pendingInfo.expectedDuration)}
${pendingInfo.isOverdue ? `- ⚠️ 예상보다 ${pendingInfo.overdueBy} 지남` : ''}`);
    }

    // 5. 기념일/특별한 날 체크
    const specialDay = await this._checkSpecialDay(localTime, timezone);
    if (specialDay) {
      parts.push(`## 🎉 특별한 날!
${specialDay.map(s => `- ${s.type}: ${s.message}`).join('\n')}`);
    }

    // 6. 대화 흐름
    try {
      const flowTracker = getConversationFlowTracker();
      const flowSection = flowTracker.buildPromptSection();
      if (flowSection) {
        parts.push(`## 대화 흐름\n${flowSection}`);
      }
    } catch (e) {}

    return parts.join('\n\n');
  }

  /**
   * 기념일/특별한 날 체크
   */
  async _checkSpecialDay(localTime, timezone) {
    const specials = [];
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const todayStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    try {
      // 프로필에서 기념일 필드들 가져오기
      const profile = await ProfileModel.getActiveProfile();
      if (!profile?.fields) return null;

      // 생일 체크
      const birthday = profile.fields.find(f => 
        f.key === 'birthday' || f.key === '생일' || f.key === 'birth_date'
      );
      if (birthday?.value) {
        const bday = this._extractMonthDay(birthday.value);
        if (bday === todayStr) {
          specials.push({ type: '🎂 생일', message: '오늘 생일이야! 축하해줘!' });
        } else {
          const daysUntil = this._daysUntilDate(bday);
          if (daysUntil > 0 && daysUntil <= 7) {
            specials.push({ type: '🎂 생일 예정', message: `${daysUntil}일 후 생일` });
          }
        }
      }

      // 기념일 체크 (anniversary, 기념일 키워드)
      const anniversaries = profile.fields.filter(f => 
        f.key.includes('anniversary') || f.key.includes('기념일') || f.key.includes('기념')
      );
      for (const ann of anniversaries) {
        if (ann.value) {
          const annDay = this._extractMonthDay(ann.value);
          if (annDay === todayStr) {
            specials.push({ type: `💕 ${ann.key}`, message: '오늘이야!' });
          }
        }
      }

    } catch (e) {
      // 프로필 로드 실패시 무시
    }

    // 공휴일/시즌 체크
    const holidays = this._checkHolidays(month, day);
    specials.push(...holidays);

    return specials.length > 0 ? specials : null;
  }

  /**
   * 날짜에서 MM-DD 추출
   */
  _extractMonthDay(dateStr) {
    // 다양한 형식 지원: YYYY-MM-DD, MM/DD, M월 D일 등
    const str = String(dateStr);
    
    // YYYY-MM-DD 또는 MM-DD
    const isoMatch = str.match(/(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return `${String(isoMatch[1]).padStart(2, '0')}-${String(isoMatch[2]).padStart(2, '0')}`;
    }
    
    // MM/DD
    const slashMatch = str.match(/(\d{1,2})\/(\d{1,2})/);
    if (slashMatch) {
      return `${String(slashMatch[1]).padStart(2, '0')}-${String(slashMatch[2]).padStart(2, '0')}`;
    }
    
    // M월 D일
    const korMatch = str.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (korMatch) {
      return `${String(korMatch[1]).padStart(2, '0')}-${String(korMatch[2]).padStart(2, '0')}`;
    }
    
    return null;
  }

  /**
   * 특정 날짜까지 남은 일수
   */
  _daysUntilDate(mmdd) {
    if (!mmdd) return -1;
    const [month, day] = mmdd.split('-').map(Number);
    const now = new Date();
    const thisYear = now.getFullYear();
    
    let target = new Date(thisYear, month - 1, day);
    if (target < now) {
      target = new Date(thisYear + 1, month - 1, day);
    }
    
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  }

  /**
   * 공휴일/시즌 체크
   */
  _checkHolidays(month, day) {
    const holidays = [];
    
    // 한국 주요 공휴일 (양력)
    const koreanHolidays = {
      '01-01': '🎊 새해',
      '03-01': '🇰🇷 삼일절',
      '05-05': '👶 어린이날',
      '06-06': '🎖️ 현충일',
      '08-15': '🇰🇷 광복절',
      '10-03': '🇰🇷 개천절',
      '10-09': '📚 한글날',
      '12-25': '🎄 크리스마스'
    };
    
    const todayStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (koreanHolidays[todayStr]) {
      holidays.push({ type: koreanHolidays[todayStr], message: '오늘이야!' });
    }
    
    // 특별 시즌
    if (month === 2 && day === 14) {
      holidays.push({ type: '💝 발렌타인데이', message: '오늘이야!' });
    }
    if (month === 3 && day === 14) {
      holidays.push({ type: '🍬 화이트데이', message: '오늘이야!' });
    }
    if (month === 11 && day === 11) {
      holidays.push({ type: '🍫 빼빼로데이', message: '오늘이야!' });
    }
    
    return holidays;
  }

  /**
   * 간단한 시간 컨텍스트 (한 줄)
   */
  buildQuick(options = {}) {
    const { timezone = 'Asia/Seoul' } = options;
    const now = new Date();
    const localTime = this._getLocalTime(now, timezone);
    const timeOfDay = this._getTimeOfDay(localTime.hour);
    
    return `[${localTime.formatted} ${timeOfDay} ${localTime.dayOfWeek}]`;
  }

  /**
   * 로컬 시간 정보
   */
  _getLocalTime(date, timezone) {
    const options = { timeZone: timezone };
    const localDate = new Date(date.toLocaleString('en-US', options));
    
    const hour = localDate.getHours();
    const minute = localDate.getMinutes();
    const formatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayOfWeek = days[localDate.getDay()];
    const isWeekend = localDate.getDay() === 0 || localDate.getDay() === 6;

    return { hour, minute, formatted, dayOfWeek, isWeekend };
  }

  /**
   * 시간대 판단
   */
  _getTimeOfDay(hour) {
    if (hour >= 0 && hour < 6) return '새벽';
    if (hour >= 6 && hour < 12) return '아침';
    if (hour >= 12 && hour < 18) return '오후';
    if (hour >= 18 && hour < 22) return '저녁';
    return '밤';
  }

  /**
   * 침묵 시간 해석
   */
  _interpretSilence(seconds) {
    let category, greeting;
    
    if (seconds < 60) {
      return null;  // 방금이면 언급 안 함
    } else if (seconds < 1800) {  // 30분
      category = 'minutes';
      greeting = null;
    } else if (seconds < 7200) {  // 2시간
      category = 'hours';
      greeting = null;
    } else if (seconds < 86400) {  // 24시간
      category = 'hours';
      greeting = this.silenceMessages.hours;
    } else if (seconds < 172800) {  // 48시간
      category = 'day';
      greeting = this.silenceMessages.day;
    } else if (seconds < 604800) {  // 1주
      category = 'days';
      greeting = this.silenceMessages.days;
    } else if (seconds < 1209600) {  // 2주
      category = 'week';
      greeting = this.silenceMessages.week;
    } else {
      category = 'weeks';
      greeting = this.silenceMessages.weeks;
    }

    return {
      seconds,
      formatted: this._formatDuration(seconds),
      category,
      greeting
    };
  }

  /**
   * 시간 포맷
   */
  _formatDuration(seconds) {
    if (seconds < 60) return '방금';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
    }
    const days = Math.floor(seconds / 86400);
    return days === 1 ? '하루' : `${days}일`;
  }
}

// 싱글톤
let globalTimeAwarePromptBuilder = null;

function getTimeAwarePromptBuilder() {
  if (!globalTimeAwarePromptBuilder) {
    globalTimeAwarePromptBuilder = new TimeAwarePromptBuilder();
  }
  return globalTimeAwarePromptBuilder;
}

module.exports = {
  TimeAwarePromptBuilder,
  getTimeAwarePromptBuilder
};
