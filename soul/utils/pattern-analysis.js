/**
 * pattern-analysis.js
 * 패턴 분석 시스템
 *
 * Week 2: 메모리 고도화
 *
 * 기능:
 * - 반복 패턴 탐지
 * - 주기성 분석
 * - 행동 패턴 인식
 * - 이상 탐지
 */

/**
 * PatternAnalyzer 클래스
 * 대화/행동 패턴 분석
 */
class PatternAnalyzer {
  constructor(memoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * 전체 패턴 분석
   */
  async analyzePatterns(options = {}) {
    const {
      lookbackDays = 30,
      minOccurrences = 3
    } = options;

    const memories = await this._getRecentMemories(lookbackDays);

    return {
      recurring: this.findRecurringPatterns(memories, minOccurrences),
      temporal: this.analyzeTemporalPatterns(memories),
      behavioral: this.analyzeBehavioralPatterns(memories),
      anomalies: this.detectAnomalies(memories)
    };
  }

  /**
   * 반복 패턴 탐지
   */
  findRecurringPatterns(memories, minOccurrences = 3) {
    const patterns = new Map();

    // n-gram 추출 (2-gram, 3-gram)
    for (let n = 2; n <= 3; n++) {
      memories.forEach(memory => {
        const ngrams = this._extractNGrams(memory.content, n);
        ngrams.forEach(ngram => {
          patterns.set(ngram, (patterns.get(ngram) || 0) + 1);
        });
      });
    }

    // 최소 빈도 이상만
    const recurring = Array.from(patterns.entries())
      .filter(([_, count]) => count >= minOccurrences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pattern, count]) => ({
        pattern,
        occurrences: count,
        frequency: count / memories.length
      }));

    return recurring;
  }

  /**
   * 시간적 패턴 분석
   */
  analyzeTemporalPatterns(memories) {
    // 시간대별 분포
    const hourlyDist = Array(24).fill(0);
    const dayDist = Array(7).fill(0);

    memories.forEach(m => {
      const date = new Date(m.timestamp);
      hourlyDist[date.getHours()]++;
      dayDist[date.getDay()]++;
    });

    return {
      peakHours: this._findPeaks(hourlyDist, 3),
      peakDays: this._findPeaks(dayDist, 2),
      hourlyDistribution: hourlyDist,
      dailyDistribution: dayDist,
      regularity: this._calculateRegularity(hourlyDist)
    };
  }

  /**
   * 행동 패턴 분석
   */
  analyzeBehavioralPatterns(memories) {
    const patterns = {
      messageLengths: this._analyzeMessageLengths(memories),
      topicSwitching: this._analyzeTopicSwitching(memories),
      questionAsking: this._analyzeQuestions(memories),
      codeSharing: this._analyzeCodeSharing(memories)
    };

    return patterns;
  }

  /**
   * 이상 탐지
   */
  detectAnomalies(memories) {
    const anomalies = [];

    // 1. 비정상적으로 긴 메시지
    const avgLength = memories.reduce((sum, m) => sum + m.content.length, 0) / memories.length;
    const stdDev = Math.sqrt(
      memories.reduce((sum, m) => sum + Math.pow(m.content.length - avgLength, 2), 0) / memories.length
    );

    memories.forEach(m => {
      if (m.content.length > avgLength + 3 * stdDev) {
        anomalies.push({
          type: 'unusually_long',
          memory: m,
          value: m.content.length,
          threshold: avgLength + 3 * stdDev
        });
      }
    });

    // 2. 비정상적 시간대
    const hourCounts = Array(24).fill(0);
    memories.forEach(m => {
      hourCounts[new Date(m.timestamp).getHours()]++;
    });

    const avgHourCount = hourCounts.reduce((a, b) => a + b, 0) / 24;
    hourCounts.forEach((count, hour) => {
      if (count > 0 && count < avgHourCount * 0.2) {
        anomalies.push({
          type: 'unusual_time',
          hour,
          count,
          threshold: avgHourCount * 0.2
        });
      }
    });

    return anomalies.slice(0, 10);
  }

  /**
   * n-gram 추출
   */
  _extractNGrams(text, n) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const ngrams = [];

    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }

    return ngrams;
  }

  /**
   * 피크 찾기
   */
  _findPeaks(distribution, count) {
    return distribution
      .map((value, index) => ({ index, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, count);
  }

  /**
   * 규칙성 계산
   */
  _calculateRegularity(distribution) {
    const mean = distribution.reduce((a, b) => a + b, 0) / distribution.length;
    const variance = distribution.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / distribution.length;
    const stdDev = Math.sqrt(variance);

    // 낮은 표준편차 = 높은 규칙성
    return 1 / (1 + stdDev / (mean || 1));
  }

  /**
   * 메시지 길이 분석
   */
  _analyzeMessageLengths(memories) {
    const lengths = memories.map(m => m.content.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    return {
      average: Math.round(avg),
      min: Math.min(...lengths),
      max: Math.max(...lengths),
      trend: this._calculateTrend(lengths)
    };
  }

  /**
   * 주제 전환 분석
   */
  _analyzeTopicSwitching(memories) {
    let switches = 0;
    for (let i = 1; i < memories.length; i++) {
      if (memories[i].topics && memories[i - 1].topics) {
        const overlap = memories[i].topics.filter(t =>
          memories[i - 1].topics.includes(t)
        );
        if (overlap.length === 0) {
          switches++;
        }
      }
    }

    return {
      switches,
      frequency: switches / Math.max(memories.length - 1, 1),
      consistency: 1 - (switches / Math.max(memories.length - 1, 1))
    };
  }

  /**
   * 질문 분석
   */
  _analyzeQuestions(memories) {
    const questions = memories.filter(m =>
      m.content.includes('?') || /^(what|how|why|when|where|who|which)/i.test(m.content)
    );

    return {
      count: questions.length,
      frequency: questions.length / memories.length,
      avgLength: questions.reduce((sum, m) => sum + m.content.length, 0) / (questions.length || 1)
    };
  }

  /**
   * 코드 공유 분석
   */
  _analyzeCodeSharing(memories) {
    const withCode = memories.filter(m => /```/.test(m.content));

    return {
      count: withCode.length,
      frequency: withCode.length / memories.length
    };
  }

  /**
   * 트렌드 계산
   */
  _calculateTrend(values) {
    if (values.length < 2) return 'stable';

    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = (avgSecond - avgFirst) / (avgFirst || 1);

    if (change > 0.2) return 'increasing';
    if (change < -0.2) return 'decreasing';
    return 'stable';
  }

  /**
   * 최근 메모리 가져오기
   */
  async _getRecentMemories(days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.memoryManager.shortTerm.getAll().filter(m =>
      new Date(m.timestamp) >= startDate
    );
  }
}

/**
 * TagCloud 클래스
 * 태그 클라우드 생성 및 분석
 */
class TagCloud {
  constructor(memoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * 태그 클라우드 생성
   */
  async generate(options = {}) {
    const {
      lookbackDays = 30,
      minCount = 2,
      maxTags = 50
    } = options;

    const memories = await this._getRecentMemories(lookbackDays);

    // 태그 수집
    const tagCounts = new Map();
    const tagFirstSeen = new Map();
    const tagLastSeen = new Map();

    memories.forEach(m => {
      if (m.tags) {
        m.tags.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);

          if (!tagFirstSeen.has(tag)) {
            tagFirstSeen.set(tag, m.timestamp);
          }
          tagLastSeen.set(tag, m.timestamp);
        });
      }
    });

    // 태그 정규화 및 필터
    const tags = Array.from(tagCounts.entries())
      .filter(([_, count]) => count >= minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTags)
      .map(([tag, count]) => {
        const weight = this._calculateWeight(count, tagCounts);

        return {
          tag,
          count,
          weight,
          size: this._calculateSize(weight),
          firstSeen: tagFirstSeen.get(tag),
          lastSeen: tagLastSeen.get(tag),
          recency: this._calculateRecency(tagLastSeen.get(tag))
        };
      });

    return {
      tags,
      stats: {
        total: tags.length,
        totalOccurrences: tags.reduce((sum, t) => sum + t.count, 0),
        avgCount: tags.reduce((sum, t) => sum + t.count, 0) / tags.length
      }
    };
  }

  /**
   * 태그 관계 분석
   */
  async analyzeTagRelationships(options = {}) {
    const { lookbackDays = 30 } = options;

    const memories = await this._getRecentMemories(lookbackDays);
    const coOccurrence = new Map();

    memories.forEach(m => {
      if (m.tags && m.tags.length >= 2) {
        // 모든 태그 쌍
        for (let i = 0; i < m.tags.length; i++) {
          for (let j = i + 1; j < m.tags.length; j++) {
            const pair = [m.tags[i], m.tags[j]].sort().join('|');
            coOccurrence.set(pair, (coOccurrence.get(pair) || 0) + 1);
          }
        }
      }
    });

    const relationships = Array.from(coOccurrence.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pair, count]) => {
        const [tag1, tag2] = pair.split('|');
        return { tag1, tag2, count };
      });

    return relationships;
  }

  /**
   * 가중치 계산
   */
  _calculateWeight(count, allCounts) {
    const max = Math.max(...allCounts.values());
    const min = Math.min(...allCounts.values());

    return (count - min) / (max - min || 1);
  }

  /**
   * 크기 계산 (CSS font-size용)
   */
  _calculateSize(weight) {
    const minSize = 12;
    const maxSize = 48;

    return Math.round(minSize + weight * (maxSize - minSize));
  }

  /**
   * 최신성 계산
   */
  _calculateRecency(timestamp) {
    const now = Date.now();
    const age = now - new Date(timestamp).getTime();
    const days = age / (1000 * 60 * 60 * 24);

    if (days < 1) return 'today';
    if (days < 7) return 'this_week';
    if (days < 30) return 'this_month';
    return 'older';
  }

  /**
   * 최근 메모리 가져오기
   */
  async _getRecentMemories(days) {
    const startDate = new Date();
    startDate.setDate(startDate.setDate() - days);

    return this.memoryManager.shortTerm.getAll().filter(m =>
      new Date(m.timestamp) >= startDate
    );
  }
}

module.exports = {
  PatternAnalyzer,
  TagCloud
};
