/**
 * pending-event.js
 * 예상 이벤트 추적 시스템 (Phase 1.6.2)
 * 
 * 역할:
 * - 사용자가 떠날 때 예상 이벤트 기록
 * - 복귀 시 실제 vs 예상 비교
 * - 시간 맥락 해석에 활용
 */

const fs = require('fs').promises;
const path = require('path');

// 이벤트 유형별 예상 시간 (초)
const EVENT_DURATIONS = {
  shower: { min: 600, typical: 1800, max: 3600, keywords: ['샤워', '씻고', '씻으러'] },
  sleep: { min: 14400, typical: 28800, max: 43200, keywords: ['자러', '잘게', '잔다', '졸려', '자야'] },
  meal: { min: 1200, typical: 2700, max: 5400, keywords: ['밥', '먹고', '식사', '점심', '저녁', '아침'] },
  trip: { min: 86400, typical: 259200, max: 604800, keywords: ['여행', '놀러', '출장'] },
  work: { min: 3600, typical: 28800, max: 43200, keywords: ['일하러', '회사', '출근', '업무'] },
  errand: { min: 1800, typical: 5400, max: 14400, keywords: ['잠깐', '나갔다', '볼일', '외출'] },
  exercise: { min: 1800, typical: 5400, max: 10800, keywords: ['운동', '헬스', '러닝', '산책'] },
  study: { min: 3600, typical: 10800, max: 21600, keywords: ['공부', '스터디', '학교', '수업'] }
};

class PendingEventManager {
  constructor(basePath) {
    if (!basePath) {
      throw new Error('[PendingEventManager] basePath is required. Use getPendingEventManager() instead.');
    }
    this.basePath = basePath;
    this.eventsPath = path.join(basePath, 'events');
    this.currentEvent = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      await fs.mkdir(this.eventsPath, { recursive: true });
      await this._loadCurrentEvent();
      this.initialized = true;
      console.log('[PendingEvent] Initialized');
    } catch (error) {
      console.error('[PendingEvent] Init failed:', error.message);
    }
  }

  /**
   * 메시지에서 떠남 이벤트 감지
   */
  detectDeparture(message) {
    const content = message.content.toLowerCase();
    
    for (const [eventType, config] of Object.entries(EVENT_DURATIONS)) {
      for (const keyword of config.keywords) {
        if (content.includes(keyword)) {
          // "올게", "간다", "할게" 등의 떠남 패턴과 함께인지 확인
          const departurePatterns = ['올게', '간다', '가야', '할게', '하러', '다녀올게', '갔다올게'];
          const hasDeparturePattern = departurePatterns.some(p => content.includes(p));
          
          if (hasDeparturePattern || eventType === 'sleep') {
            return {
              detected: true,
              type: eventType,
              keyword,
              expectedDuration: config.typical,
              minDuration: config.min,
              maxDuration: config.max
            };
          }
        }
      }
    }
    
    return { detected: false };
  }

  /**
   * 떠남 이벤트 기록
   */
  async recordDeparture(message, detection) {
    const event = {
      type: detection.type,
      reason: detection.keyword,
      userMessage: message.content,
      
      expectedDuration: detection.expectedDuration,
      minDuration: detection.minDuration,
      maxDuration: detection.maxDuration,
      
      startedAt: new Date().toISOString(),
      expectedReturnAt: new Date(Date.now() + detection.expectedDuration * 1000).toISOString(),
      
      // 복귀 시 채워짐
      returnedAt: null,
      actualDuration: null,
      interpretation: null
    };

    this.currentEvent = event;
    await this._saveCurrentEvent();
    
    console.log(`[PendingEvent] Recorded: ${event.type} (expected ${this._formatDuration(event.expectedDuration)})`);
    return event;
  }

  /**
   * 복귀 처리
   */
  async recordReturn(message) {
    if (!this.currentEvent) {
      return null;
    }

    const now = new Date();
    const startedAt = new Date(this.currentEvent.startedAt);
    const actualDuration = Math.floor((now - startedAt) / 1000);
    
    this.currentEvent.returnedAt = now.toISOString();
    this.currentEvent.actualDuration = actualDuration;
    this.currentEvent.interpretation = this._interpretDuration(actualDuration);
    
    // 패턴 학습: 이벤트 소요시간 기록
    try {
      const { getUserPatternLearner } = require('./user-pattern');
      const patternLearner = await getUserPatternLearner(this.basePath);
      await patternLearner.learnEventDuration(this.currentEvent.type, actualDuration);
    } catch (e) {
      console.error('[PendingEvent] Pattern learning failed:', e.message);
    }
    
    // 이벤트 히스토리에 저장
    await this._archiveEvent(this.currentEvent);
    
    const result = { ...this.currentEvent };
    
    // 현재 이벤트 클리어
    this.currentEvent = null;
    await this._saveCurrentEvent();
    
    console.log(`[PendingEvent] Returned: ${result.type}, actual=${this._formatDuration(actualDuration)}`);
    return result;
  }

  /**
   * 시간 해석 (예상 vs 실제)
   */
  _interpretDuration(actualDuration) {
    if (!this.currentEvent) return null;
    
    const { expectedDuration, minDuration, maxDuration, type } = this.currentEvent;
    const ratio = actualDuration / expectedDuration;
    
    let interpretation;
    
    if (actualDuration < minDuration) {
      interpretation = {
        status: 'very_quick',
        message: `${type}치고 엄청 빨랐네`,
        surprise: 0.8
      };
    } else if (actualDuration < expectedDuration * 0.7) {
      interpretation = {
        status: 'quick',
        message: `빨리 끝났네`,
        surprise: 0.3
      };
    } else if (actualDuration <= expectedDuration * 1.3) {
      interpretation = {
        status: 'normal',
        message: null,  // 정상이면 언급 안 함
        surprise: 0
      };
    } else if (actualDuration <= maxDuration) {
      interpretation = {
        status: 'slow',
        message: `좀 오래 걸렸네`,
        surprise: 0.4
      };
    } else {
      interpretation = {
        status: 'very_slow',
        message: `${type}한다더니 한참 걸렸네. 다른 일도 했나?`,
        surprise: 0.7
      };
    }
    
    interpretation.actualFormatted = this._formatDuration(actualDuration);
    interpretation.expectedFormatted = this._formatDuration(expectedDuration);
    interpretation.ratio = ratio;
    
    return interpretation;
  }

  /**
   * aiMemo용 시간 맥락 생성
   */
  generateTimeContext() {
    if (!this.currentEvent) {
      return null;
    }
    
    const now = Date.now();
    const startedAt = new Date(this.currentEvent.startedAt).getTime();
    const elapsed = Math.floor((now - startedAt) / 1000);
    
    return {
      eventType: this.currentEvent.type,
      reason: this.currentEvent.reason,
      elapsed,
      elapsedFormatted: this._formatDuration(elapsed),
      expectedDuration: this.currentEvent.expectedDuration,
      isOverdue: elapsed > this.currentEvent.expectedDuration,
      overdueBy: elapsed > this.currentEvent.expectedDuration 
        ? this._formatDuration(elapsed - this.currentEvent.expectedDuration)
        : null
    };
  }

  /**
   * 현재 이벤트 로드
   */
  async _loadCurrentEvent() {
    try {
      const filePath = path.join(this.eventsPath, 'current.json');
      const content = await fs.readFile(filePath, 'utf-8');
      this.currentEvent = JSON.parse(content);
    } catch (e) {
      this.currentEvent = null;
    }
  }

  /**
   * 현재 이벤트 저장
   */
  async _saveCurrentEvent() {
    const filePath = path.join(this.eventsPath, 'current.json');
    if (this.currentEvent) {
      await fs.writeFile(filePath, JSON.stringify(this.currentEvent, null, 2), 'utf-8');
    } else {
      try {
        await fs.unlink(filePath);
      } catch (e) {}
    }
  }

  /**
   * 이벤트 아카이브
   */
  async _archiveEvent(event) {
    const date = new Date();
    const fileName = `${date.toISOString().split('T')[0]}.json`;
    const filePath = path.join(this.eventsPath, 'history', fileName);
    
    await fs.mkdir(path.join(this.eventsPath, 'history'), { recursive: true });
    
    let events = [];
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      events = JSON.parse(existing);
    } catch (e) {}
    
    events.push(event);
    await fs.writeFile(filePath, JSON.stringify(events, null, 2), 'utf-8');
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
    return `${Math.floor(seconds / 86400)}일`;
  }
}

// 싱글톤
let globalPendingEventManager = null;

async function getPendingEventManager(basePath = null) {
  if (!globalPendingEventManager) {
    // basePath가 없으면 DB 설정에서 가져오기
    if (!basePath) {
      const configManager = require('./config');
      const memoryConfig = await configManager.getMemoryConfig();
      basePath = memoryConfig?.storagePath;
      if (!basePath) {
        throw new Error('[PendingEventManager] memory.storagePath not configured');
      }
    }
    globalPendingEventManager = new PendingEventManager(basePath);
    await globalPendingEventManager.initialize();
  }
  return globalPendingEventManager;
}

function resetPendingEventManager() {
  globalPendingEventManager = null;
}

module.exports = {
  PendingEventManager,
  getPendingEventManager,
  resetPendingEventManager,
  EVENT_DURATIONS
};
