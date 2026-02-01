/**
 * user-pattern.js
 * 사용자 패턴 학습 시스템 (Phase 1.6.4)
 * 
 * 역할:
 * - 활동 시간 패턴 수집
 * - 이벤트 소요시간 학습
 * - 대화 빈도 분석
 * - 패턴 기반 예측
 */

const fs = require('fs').promises;
const path = require('path');

class UserPatternLearner {
  constructor(basePath) {
    if (!basePath) {
      throw new Error('[UserPatternLearner] basePath is required. Use getUserPatternLearner() instead.');
    }
    this.basePath = basePath;
    this.patternPath = path.join(basePath, 'patterns');
    this.patterns = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      await fs.mkdir(this.patternPath, { recursive: true });
      await this._loadPatterns();
      this.initialized = true;
      console.log('[UserPattern] Initialized');
    } catch (error) {
      console.error('[UserPattern] Init failed:', error.message);
    }
  }

  /**
   * 메시지에서 패턴 학습
   */
  async learnFromMessage(message) {
    if (!this.initialized) await this.initialize();
    
    const timestamp = new Date(message.timestamp || Date.now());
    const hour = timestamp.getHours();
    const dayOfWeek = timestamp.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 활동 시간 기록
    this.patterns.hourlyActivity[hour] = (this.patterns.hourlyActivity[hour] || 0) + 1;
    this.patterns.dailyActivity[dayOfWeek] = (this.patterns.dailyActivity[dayOfWeek] || 0) + 1;
    
    if (isWeekend) {
      this.patterns.weekendActivity++;
    } else {
      this.patterns.weekdayActivity++;
    }

    // 마지막 활동 시간 기록
    this.patterns.lastActiveHour = hour;
    this.patterns.lastActiveDay = dayOfWeek;
    this.patterns.lastMessageTime = timestamp.toISOString();
    this.patterns.totalMessages++;

    // 주기적 저장 (10개마다)
    if (this.patterns.totalMessages % 10 === 0) {
      await this._savePatterns();
    }
  }

  /**
   * 이벤트 소요시간 학습
   */
  async learnEventDuration(eventType, actualDuration) {
    if (!this.initialized) await this.initialize();
    
    if (!this.patterns.eventDurations[eventType]) {
      this.patterns.eventDurations[eventType] = {
        samples: [],
        avg: 0,
        min: Infinity,
        max: 0
      };
    }

    const event = this.patterns.eventDurations[eventType];
    event.samples.push(actualDuration);
    
    // 최근 20개만 유지
    if (event.samples.length > 20) {
      event.samples.shift();
    }

    // 통계 업데이트
    event.avg = Math.round(event.samples.reduce((a, b) => a + b, 0) / event.samples.length);
    event.min = Math.min(event.min, actualDuration);
    event.max = Math.max(event.max, actualDuration);

    await this._savePatterns();
  }

  /**
   * 패턴 분석 결과
   */
  analyze() {
    if (!this.patterns) return null;

    const analysis = {
      // 피크 시간대
      peakHours: this._findPeakHours(),
      
      // 활동 타입 (야행성, 아침형 등)
      activityType: this._classifyActivityType(),
      
      // 주말/평일 선호
      weekendPreference: this._analyzeWeekendPreference(),
      
      // 대화 빈도
      conversationFrequency: this._analyzeFrequency(),
      
      // 학습된 이벤트 시간
      eventDurations: this.patterns.eventDurations,
      
      // 신뢰도 (데이터 양 기반)
      confidence: this._calculateConfidence()
    };

    return analysis;
  }

  /**
   * 프롬프트용 요약 생성
   */
  buildPromptSummary() {
    const analysis = this.analyze();
    if (!analysis || analysis.confidence < 0.3) return null;

    const parts = [];

    // 활동 타입
    if (analysis.activityType) {
      parts.push(`- 패턴: ${analysis.activityType.label} (${analysis.activityType.description})`);
    }

    // 피크 시간대
    if (analysis.peakHours.length > 0) {
      const peakStr = analysis.peakHours.map(h => `${h}시`).join(', ');
      parts.push(`- 활발한 시간: ${peakStr}`);
    }

    // 주말 선호
    if (analysis.weekendPreference) {
      parts.push(`- ${analysis.weekendPreference}`);
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  /**
   * 피크 시간대 찾기
   */
  _findPeakHours() {
    const hourly = this.patterns.hourlyActivity;
    const total = Object.values(hourly).reduce((a, b) => a + b, 0);
    if (total < 10) return [];

    // 상위 3개 시간대
    return Object.entries(hourly)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));
  }

  /**
   * 활동 타입 분류
   */
  _classifyActivityType() {
    const hourly = this.patterns.hourlyActivity;
    const total = Object.values(hourly).reduce((a, b) => a + b, 0);
    if (total < 20) return null;

    // 시간대별 비율 계산
    let nightCount = 0;  // 0-6시
    let morningCount = 0;  // 6-12시
    let afternoonCount = 0;  // 12-18시
    let eveningCount = 0;  // 18-24시

    for (const [hour, count] of Object.entries(hourly)) {
      const h = parseInt(hour);
      if (h >= 0 && h < 6) nightCount += count;
      else if (h >= 6 && h < 12) morningCount += count;
      else if (h >= 12 && h < 18) afternoonCount += count;
      else eveningCount += count;
    }

    const nightRatio = nightCount / total;
    const morningRatio = morningCount / total;

    if (nightRatio > 0.3) {
      return { type: 'night_owl', label: '야행성', description: '새벽에 활동 많음' };
    } else if (morningRatio > 0.4) {
      return { type: 'early_bird', label: '아침형', description: '아침에 활동 많음' };
    } else {
      return { type: 'balanced', label: '균형형', description: '다양한 시간대 활동' };
    }
  }

  /**
   * 주말 선호 분석
   */
  _analyzeWeekendPreference() {
    const weekend = this.patterns.weekendActivity || 0;
    const weekday = this.patterns.weekdayActivity || 0;
    const total = weekend + weekday;
    
    if (total < 20) return null;

    const weekendRatio = weekend / total;
    
    // 주말은 7일 중 2일이므로 28.6%가 기준
    if (weekendRatio > 0.4) {
      return '주말에 더 활발';
    } else if (weekendRatio < 0.2) {
      return '평일에 더 활발';
    }
    return null;
  }

  /**
   * 대화 빈도 분석
   */
  _analyzeFrequency() {
    // TODO: 날짜별 대화 수 기록 후 분석
    return {
      typical: 'unknown',
      averageGap: null
    };
  }

  /**
   * 신뢰도 계산 (데이터 양 기반)
   */
  _calculateConfidence() {
    const total = this.patterns.totalMessages || 0;
    if (total < 10) return 0.1;
    if (total < 30) return 0.3;
    if (total < 100) return 0.6;
    if (total < 300) return 0.8;
    return 0.9;
  }

  /**
   * 패턴 로드
   */
  async _loadPatterns() {
    const filePath = path.join(this.patternPath, 'user-patterns.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      this.patterns = JSON.parse(content);
    } catch (e) {
      // 새로 시작
      this.patterns = {
        hourlyActivity: {},
        dailyActivity: {},
        weekendActivity: 0,
        weekdayActivity: 0,
        eventDurations: {},
        totalMessages: 0,
        lastMessageTime: null,
        createdAt: new Date().toISOString()
      };
    }
  }

  /**
   * 패턴 저장
   */
  async _savePatterns() {
    const filePath = path.join(this.patternPath, 'user-patterns.json');
    this.patterns.updatedAt = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(this.patterns, null, 2), 'utf-8');
  }
}

// 싱글톤
let globalPatternLearner = null;

async function getUserPatternLearner(basePath = null) {
  if (!globalPatternLearner) {
    // basePath가 없으면 DB 설정에서 가져오기
    if (!basePath) {
      const configManager = require('./config');
      const memoryConfig = await configManager.getMemoryConfig();
      basePath = memoryConfig?.storagePath;
      if (!basePath) {
        throw new Error('[UserPatternLearner] memory.storagePath not configured');
      }
    }
    globalPatternLearner = new UserPatternLearner(basePath);
    await globalPatternLearner.initialize();
  }
  return globalPatternLearner;
}

function resetUserPatternLearner() {
  globalPatternLearner = null;
}

module.exports = {
  UserPatternLearner,
  getUserPatternLearner,
  resetUserPatternLearner
};
