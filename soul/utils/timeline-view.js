/**
 * timeline-view.js
 * 타임라인 뷰 시스템
 *
 * Week 2: 메모리 고도화
 *
 * 기능:
 * - 시간순 메모리 조회
 * - 시간대별 그룹핑
 * - 통계 (일별, 주별, 월별)
 * - 필터링 및 검색
 */

/**
 * 시간 단위
 */
const TIME_UNITS = {
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year'
};

/**
 * TimelineView 클래스
 * 시간순 메모리 조회 및 분석
 */
class TimelineView {
  constructor(memoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * 타임라인 조회
   * 지정된 기간의 메모리를 시간순으로 조회
   */
  async getTimeline(options = {}) {
    const {
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0,
      groupBy = TIME_UNITS.DAY,
      includeStats = true
    } = options;

    // 메모리 조회
    const memories = await this._fetchMemories({
      startDate,
      endDate,
      limit: limit + offset
    });

    // 오프셋 적용
    const pagedMemories = memories.slice(offset, offset + limit);

    // 그룹핑
    const groups = this._groupByTime(pagedMemories, groupBy);

    // 통계
    let stats = null;
    if (includeStats) {
      stats = this._calculateStats(memories, groupBy);
    }

    return {
      timeline: groups,
      stats,
      total: memories.length,
      limit,
      offset,
      hasMore: memories.length > offset + limit
    };
  }

  /**
   * 특정 날짜의 메모리 조회
   */
  async getMemoriesForDate(date, options = {}) {
    const { includeRelated = false } = options;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const memories = await this._fetchMemories({
      startDate: startOfDay,
      endDate: endOfDay
    });

    let related = [];
    if (includeRelated && memories.length > 0) {
      // 관련 메모리 찾기 (같은 주제, 같은 태그 등)
      related = await this._findRelatedMemories(memories);
    }

    return {
      date: date.toISOString().split('T')[0],
      memories,
      related,
      count: memories.length
    };
  }

  /**
   * 시간대별 활동 분석
   */
  async analyzeActivity(options = {}) {
    const {
      startDate = this._getDateDaysAgo(30),
      endDate = new Date(),
      groupBy = TIME_UNITS.DAY
    } = options;

    const memories = await this._fetchMemories({ startDate, endDate });
    const groups = this._groupByTime(memories, groupBy);

    // 활동 통계
    const activity = groups.map(group => ({
      period: group.period,
      count: group.memories.length,
      topTopics: this._extractTopTopics(group.memories, 3),
      avgLength: this._calculateAvgLength(group.memories),
      mostActive: this._findMostActiveTime(group.memories)
    }));

    return {
      activity,
      summary: {
        totalMessages: memories.length,
        activeDays: groups.filter(g => g.memories.length > 0).length,
        avgPerDay: memories.length / Math.max(groups.length, 1),
        peakActivity: this._findPeakActivity(activity)
      }
    };
  }

  /**
   * 시간 흐름 분석
   * 주제가 시간에 따라 어떻게 변화하는지 분석
   */
  async analyzeTopicEvolution(topic, options = {}) {
    const {
      startDate = this._getDateDaysAgo(90),
      endDate = new Date(),
      groupBy = TIME_UNITS.WEEK
    } = options;

    const memories = await this._fetchMemories({ startDate, endDate });

    // 주제와 관련된 메모리만 필터
    const topicMemories = memories.filter(m =>
      this._isRelatedToTopic(m, topic)
    );

    const groups = this._groupByTime(topicMemories, groupBy);

    return {
      topic,
      evolution: groups.map(group => ({
        period: group.period,
        count: group.memories.length,
        sentiment: this._analyzeSentiment(group.memories),
        keywords: this._extractKeywords(group.memories, 5)
      })),
      summary: {
        totalMentions: topicMemories.length,
        firstMention: topicMemories[0]?.timestamp || null,
        lastMention: topicMemories[topicMemories.length - 1]?.timestamp || null,
        trend: this._calculateTrend(groups)
      }
    };
  }

  /**
   * 대화 밀도 분석
   * 시간대별 대화 빈도
   */
  async analyzeDensity(options = {}) {
    const {
      startDate = this._getDateDaysAgo(7),
      endDate = new Date()
    } = options;

    const memories = await this._fetchMemories({ startDate, endDate });

    // 시간대별 (0-23시)
    const hourly = Array(24).fill(0);
    const daily = new Map();

    memories.forEach(m => {
      const date = new Date(m.timestamp);
      const hour = date.getHours();
      const day = date.getDay(); // 0 = Sunday

      hourly[hour]++;

      if (!daily.has(day)) {
        daily.set(day, 0);
      }
      daily.set(day, daily.get(day) + 1);
    });

    return {
      hourly: hourly.map((count, hour) => ({
        hour,
        count,
        percentage: (count / memories.length) * 100
      })),
      daily: Array.from(daily.entries()).map(([day, count]) => ({
        day: this._getDayName(day),
        count,
        percentage: (count / memories.length) * 100
      })),
      peakHour: hourly.indexOf(Math.max(...hourly)),
      peakDay: this._getDayName(
        Array.from(daily.entries()).reduce((max, curr) =>
          curr[1] > max[1] ? curr : max
        , [0, 0])[0]
      )
    };
  }

  /**
   * 검색 (시간 범위 포함)
   */
  async search(query, options = {}) {
    const {
      startDate = null,
      endDate = null,
      limit = 50
    } = options;

    const memories = await this._fetchMemories({ startDate, endDate });

    // 간단한 키워드 검색
    const results = memories.filter(m =>
      m.content.toLowerCase().includes(query.toLowerCase()) ||
      (m.summary && m.summary.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, limit);

    return {
      query,
      results,
      count: results.length,
      timeRange: {
        start: startDate,
        end: endDate
      }
    };
  }

  /**
   * 메모리 가져오기
   */
  async _fetchMemories(options = {}) {
    const { startDate, endDate, limit } = options;

    // ShortTerm 메모리
    let memories = this.memoryManager.shortTerm.getAll();

    // MiddleTerm 메모리 (향후 구현)
    // TODO: MiddleTerm에서도 가져오기

    // 시간 필터
    if (startDate) {
      memories = memories.filter(m =>
        new Date(m.timestamp) >= new Date(startDate)
      );
    }

    if (endDate) {
      memories = memories.filter(m =>
        new Date(m.timestamp) <= new Date(endDate)
      );
    }

    // 시간순 정렬 (최신순)
    memories.sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    // 제한
    if (limit) {
      memories = memories.slice(0, limit);
    }

    return memories;
  }

  /**
   * 시간별 그룹핑
   */
  _groupByTime(memories, unit) {
    const groups = new Map();

    memories.forEach(memory => {
      const key = this._getTimeKey(memory.timestamp, unit);

      if (!groups.has(key)) {
        groups.set(key, {
          period: key,
          unit,
          memories: [],
          startTime: this._getStartOfPeriod(memory.timestamp, unit),
          endTime: this._getEndOfPeriod(memory.timestamp, unit)
        });
      }

      groups.get(key).memories.push(memory);
    });

    // 시간순 정렬
    return Array.from(groups.values()).sort((a, b) =>
      new Date(b.startTime) - new Date(a.startTime)
    );
  }

  /**
   * 시간 키 생성
   */
  _getTimeKey(timestamp, unit) {
    const date = new Date(timestamp);

    switch (unit) {
      case TIME_UNITS.HOUR:
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;

      case TIME_UNITS.DAY:
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      case TIME_UNITS.WEEK:
        const weekNum = this._getWeekNumber(date);
        return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

      case TIME_UNITS.MONTH:
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      case TIME_UNITS.YEAR:
        return `${date.getFullYear()}`;

      default:
        return date.toISOString();
    }
  }

  /**
   * 주차 계산
   */
  _getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * 기간 시작 시간
   */
  _getStartOfPeriod(timestamp, unit) {
    const date = new Date(timestamp);

    switch (unit) {
      case TIME_UNITS.HOUR:
        date.setMinutes(0, 0, 0);
        break;
      case TIME_UNITS.DAY:
        date.setHours(0, 0, 0, 0);
        break;
      case TIME_UNITS.WEEK:
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - date.getDay());
        break;
      case TIME_UNITS.MONTH:
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        break;
      case TIME_UNITS.YEAR:
        date.setMonth(0, 1);
        date.setHours(0, 0, 0, 0);
        break;
    }

    return date;
  }

  /**
   * 기간 종료 시간
   */
  _getEndOfPeriod(timestamp, unit) {
    const date = new Date(timestamp);

    switch (unit) {
      case TIME_UNITS.HOUR:
        date.setMinutes(59, 59, 999);
        break;
      case TIME_UNITS.DAY:
        date.setHours(23, 59, 59, 999);
        break;
      case TIME_UNITS.WEEK:
        date.setHours(23, 59, 59, 999);
        date.setDate(date.getDate() + (6 - date.getDay()));
        break;
      case TIME_UNITS.MONTH:
        date.setMonth(date.getMonth() + 1, 0);
        date.setHours(23, 59, 59, 999);
        break;
      case TIME_UNITS.YEAR:
        date.setMonth(11, 31);
        date.setHours(23, 59, 59, 999);
        break;
    }

    return date;
  }

  /**
   * 통계 계산
   */
  _calculateStats(memories, groupBy) {
    const groups = this._groupByTime(memories, groupBy);

    return {
      total: memories.length,
      periods: groups.length,
      avgPerPeriod: memories.length / Math.max(groups.length, 1),
      maxPerPeriod: Math.max(...groups.map(g => g.memories.length)),
      minPerPeriod: Math.min(...groups.map(g => g.memories.length))
    };
  }

  /**
   * 관련 메모리 찾기
   */
  async _findRelatedMemories(memories) {
    // 간단한 버전: 같은 주제/태그 찾기
    const topics = new Set();
    const tags = new Set();

    memories.forEach(m => {
      if (m.topics) m.topics.forEach(t => topics.add(t));
      if (m.tags) m.tags.forEach(t => tags.add(t));
    });

    const allMemories = await this._fetchMemories({ limit: 1000 });

    return allMemories.filter(m =>
      !memories.includes(m) &&
      (
        (m.topics && m.topics.some(t => topics.has(t))) ||
        (m.tags && m.tags.some(t => tags.has(t)))
      )
    ).slice(0, 10);
  }

  /**
   * 상위 주제 추출
   */
  _extractTopTopics(memories, limit) {
    const topicCounts = new Map();

    memories.forEach(m => {
      if (m.topics) {
        m.topics.forEach(topic => {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        });
      }
    });

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([topic, count]) => ({ topic, count }));
  }

  /**
   * 평균 길이 계산
   */
  _calculateAvgLength(memories) {
    if (memories.length === 0) return 0;

    const totalLength = memories.reduce((sum, m) =>
      sum + (m.content ? m.content.length : 0), 0
    );

    return Math.round(totalLength / memories.length);
  }

  /**
   * 가장 활발한 시간 찾기
   */
  _findMostActiveTime(memories) {
    if (memories.length === 0) return null;

    const hours = new Map();

    memories.forEach(m => {
      const hour = new Date(m.timestamp).getHours();
      hours.set(hour, (hours.get(hour) || 0) + 1);
    });

    const [mostActiveHour, count] = Array.from(hours.entries())
      .reduce((max, curr) => curr[1] > max[1] ? curr : max, [0, 0]);

    return { hour: mostActiveHour, count };
  }

  /**
   * 피크 활동 찾기
   */
  _findPeakActivity(activity) {
    if (activity.length === 0) return null;

    return activity.reduce((max, curr) =>
      curr.count > max.count ? curr : max
    );
  }

  /**
   * 주제 관련성 확인
   */
  _isRelatedToTopic(memory, topic) {
    const text = (memory.content + ' ' + (memory.summary || '')).toLowerCase();
    return text.includes(topic.toLowerCase());
  }

  /**
   * 감정 분석 (간단한 버전)
   */
  _analyzeSentiment(memories) {
    // 긍정/부정 키워드 기반 간단한 감정 분석
    const positiveWords = ['좋', '훌륭', '멋진', '완벽', '성공', 'good', 'great', 'excellent'];
    const negativeWords = ['나쁜', '문제', '실패', '오류', 'bad', 'error', 'fail'];

    let positive = 0;
    let negative = 0;

    memories.forEach(m => {
      const text = m.content.toLowerCase();
      positiveWords.forEach(word => {
        if (text.includes(word)) positive++;
      });
      negativeWords.forEach(word => {
        if (text.includes(word)) negative++;
      });
    });

    const total = positive + negative;
    if (total === 0) return 'neutral';

    const score = (positive - negative) / total;
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  /**
   * 키워드 추출
   */
  _extractKeywords(memories, limit) {
    const words = new Map();

    memories.forEach(m => {
      const tokens = m.content.toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 3);

      tokens.forEach(word => {
        words.set(word, (words.get(word) || 0) + 1);
      });
    });

    return Array.from(words.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  /**
   * 트렌드 계산
   */
  _calculateTrend(groups) {
    if (groups.length < 2) return 'stable';

    const recent = groups.slice(0, Math.ceil(groups.length / 2));
    const older = groups.slice(Math.ceil(groups.length / 2));

    const recentAvg = recent.reduce((sum, g) => sum + g.count, 0) / recent.length;
    const olderAvg = older.reduce((sum, g) => sum + g.count, 0) / older.length;

    const change = (recentAvg - olderAvg) / (olderAvg || 1);

    if (change > 0.2) return 'increasing';
    if (change < -0.2) return 'decreasing';
    return 'stable';
  }

  /**
   * N일 전 날짜
   */
  _getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  /**
   * 요일 이름
   */
  _getDayName(day) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day];
  }
}

module.exports = {
  TimelineView,
  TIME_UNITS
};
