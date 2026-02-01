/**
 * pattern-learner.js
 * 사용자 패턴 학습 시스템
 *
 * Week 2: 자연어 설정 고도화
 *
 * 기능:
 * - 사용자 명령 패턴 학습
 * - 선호도 학습
 * - 자주 사용하는 표현 학습
 * - 개인화된 의도 감지
 */

const { getContextTracker } = require('./context-tracker');

/**
 * 패턴 타입
 */
const PATTERN_TYPE = {
  COMMAND: 'command',           // 명령 패턴
  PREFERENCE: 'preference',     // 선호도
  EXPRESSION: 'expression',     // 표현 방식
  SHORTCUT: 'shortcut'         // 단축 표현
};

/**
 * Pattern 클래스
 */
class Pattern {
  constructor(options) {
    this.id = options.id || this._generateId();
    this.type = options.type;
    this.pattern = options.pattern;         // 패턴 (정규식 또는 문자열)
    this.intent = options.intent;           // 의도
    this.confidence = options.confidence || 0.5;
    this.frequency = 1;
    this.examples = [options.example];      // 예제들
    this.createdAt = new Date();
    this.lastUsed = new Date();
    this.metadata = options.metadata || {};
  }

  _generateId() {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  use() {
    this.frequency++;
    this.lastUsed = new Date();
    // 빈도에 따라 신뢰도 증가
    this.confidence = Math.min(1.0, this.confidence + 0.05);
  }

  addExample(example) {
    if (!this.examples.includes(example)) {
      this.examples.push(example);
    }
  }

  getScore() {
    const recency = this._getRecency();
    const frequencyScore = Math.min(1, this.frequency / 10);
    return this.confidence * 0.5 + recency * 0.2 + frequencyScore * 0.3;
  }

  _getRecency() {
    const elapsed = Date.now() - this.lastUsed.getTime();
    return Math.max(0, 1 - elapsed / (30 * 24 * 60 * 60 * 1000)); // 30일 기준
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      pattern: this.pattern,
      intent: this.intent,
      confidence: this.confidence,
      frequency: this.frequency,
      examples: this.examples,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      score: this.getScore(),
      metadata: this.metadata
    };
  }
}

/**
 * PatternLearner 클래스
 */
class PatternLearner {
  constructor() {
    this.sessions = new Map(); // sessionId -> user patterns
    this.globalPatterns = new Map(); // 전역 패턴
    this.config = {
      minFrequency: 2,              // 패턴으로 인정할 최소 빈도
      minConfidence: 0.6,           // 패턴 적용 최소 신뢰도
      maxPatternsPerUser: 100,
      learningRate: 0.05,
      enableGlobalLearning: true    // 전역 학습 활성화
    };
  }

  /**
   * 사용자 패턴 가져오기
   */
  _getUserPatterns(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        patterns: new Map(),
        preferences: {},
        shortcuts: new Map(),
        history: []
      });
    }
    return this.sessions.get(sessionId);
  }

  /**
   * 명령 학습
   */
  learnCommand(sessionId, message, detectedIntent, wasCorrect = true) {
    const userPatterns = this._getUserPatterns(sessionId);

    // 히스토리에 추가
    userPatterns.history.push({
      message,
      intent: detectedIntent,
      correct: wasCorrect,
      timestamp: new Date()
    });

    // 최근 100개만 유지
    if (userPatterns.history.length > 100) {
      userPatterns.history.shift();
    }

    if (!wasCorrect) {
      return; // 틀린 경우 학습하지 않음
    }

    // 기존 패턴 찾기
    const existingPattern = this._findSimilarPattern(
      sessionId,
      message,
      detectedIntent
    );

    if (existingPattern) {
      // 기존 패턴 강화
      existingPattern.use();
      existingPattern.addExample(message);
    } else {
      // 새 패턴 생성
      const pattern = new Pattern({
        type: PATTERN_TYPE.COMMAND,
        pattern: this._extractPattern(message),
        intent: detectedIntent,
        example: message,
        confidence: 0.6
      });

      userPatterns.patterns.set(pattern.id, pattern);

      // 전역 학습
      if (this.config.enableGlobalLearning) {
        this._learnGlobal(pattern);
      }
    }

    // 패턴 수 제한
    if (userPatterns.patterns.size > this.config.maxPatternsPerUser) {
      this._prunePatterns(sessionId);
    }
  }

  /**
   * 선호도 학습
   */
  learnPreference(sessionId, key, value) {
    const userPatterns = this._getUserPatterns(sessionId);
    userPatterns.preferences[key] = value;
  }

  /**
   * 단축 표현 학습
   */
  learnShortcut(sessionId, shortcut, fullCommand) {
    const userPatterns = this._getUserPatterns(sessionId);

    if (userPatterns.shortcuts.has(shortcut)) {
      const existing = userPatterns.shortcuts.get(shortcut);
      existing.frequency++;
      existing.lastUsed = new Date();
    } else {
      userPatterns.shortcuts.set(shortcut, {
        shortcut,
        fullCommand,
        frequency: 1,
        createdAt: new Date(),
        lastUsed: new Date()
      });
    }
  }

  /**
   * 유사 패턴 찾기
   */
  _findSimilarPattern(sessionId, message, intent) {
    const userPatterns = this._getUserPatterns(sessionId);

    for (const pattern of userPatterns.patterns.values()) {
      if (pattern.intent === intent) {
        // 유사도 계산
        const similarity = this._calculateSimilarity(
          message,
          pattern.examples
        );

        if (similarity > 0.7) {
          return pattern;
        }
      }
    }

    return null;
  }

  /**
   * 유사도 계산 (간단한 Jaccard 유사도)
   */
  _calculateSimilarity(text1, examples) {
    const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
    let maxSimilarity = 0;

    examples.forEach(example => {
      const tokens2 = new Set(example.toLowerCase().split(/\s+/));
      const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
      const union = new Set([...tokens1, ...tokens2]);
      const similarity = intersection.size / union.size;
      maxSimilarity = Math.max(maxSimilarity, similarity);
    });

    return maxSimilarity;
  }

  /**
   * 패턴 추출
   */
  _extractPattern(message) {
    // 간단한 패턴 추출 (실제로는 더 복잡한 NLP 사용)
    const words = message.split(/\s+/);

    // 핵심 단어 추출 (동사, 명사 중심)
    const keywords = words.filter(word => word.length > 1);

    // 패턴 생성
    return keywords.slice(0, 3).join('\\s+');
  }

  /**
   * 전역 학습
   */
  _learnGlobal(pattern) {
    const key = `${pattern.intent}_${pattern.pattern}`;

    if (this.globalPatterns.has(key)) {
      const existing = this.globalPatterns.get(key);
      existing.frequency++;
      existing.confidence = Math.min(
        1.0,
        existing.confidence + this.config.learningRate
      );
    } else {
      this.globalPatterns.set(key, {
        ...pattern.toJSON(),
        frequency: 1
      });
    }
  }

  /**
   * 패턴 정리
   */
  _prunePatterns(sessionId) {
    const userPatterns = this._getUserPatterns(sessionId);

    // 점수 기준 정렬
    const patterns = Array.from(userPatterns.patterns.values())
      .sort((a, b) => b.getScore() - a.getScore());

    // 상위 패턴만 유지
    const toKeep = patterns.slice(0, this.config.maxPatternsPerUser);
    const toRemove = patterns.slice(this.config.maxPatternsPerUser);

    // 제거
    toRemove.forEach(pattern => {
      userPatterns.patterns.delete(pattern.id);
    });

    return toRemove.length;
  }

  /**
   * 패턴 적용 (의도 감지 향상)
   */
  applyPatterns(sessionId, message) {
    const userPatterns = this._getUserPatterns(sessionId);
    const matches = [];

    // 사용자 패턴 확인
    for (const pattern of userPatterns.patterns.values()) {
      if (pattern.confidence < this.config.minConfidence) {
        continue;
      }

      // 패턴 매칭
      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(message)) {
        matches.push({
          pattern: pattern.toJSON(),
          confidence: pattern.confidence,
          intent: pattern.intent
        });
      }
    }

    // 전역 패턴 확인
    if (this.config.enableGlobalLearning) {
      for (const [key, pattern] of this.globalPatterns.entries()) {
        if (pattern.confidence < this.config.minConfidence) {
          continue;
        }

        const regex = new RegExp(pattern.pattern, 'i');
        if (regex.test(message)) {
          matches.push({
            pattern,
            confidence: pattern.confidence * 0.8, // 전역은 신뢰도 낮춤
            intent: pattern.intent
          });
        }
      }
    }

    // 점수 기준 정렬
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;
  }

  /**
   * 선호도 조회
   */
  getPreference(sessionId, key, defaultValue = null) {
    const userPatterns = this._getUserPatterns(sessionId);
    return userPatterns.preferences[key] || defaultValue;
  }

  /**
   * 단축 표현 해소
   */
  resolveShortcut(sessionId, shortcut) {
    const userPatterns = this._getUserPatterns(sessionId);
    const resolved = userPatterns.shortcuts.get(shortcut);

    if (resolved) {
      resolved.frequency++;
      resolved.lastUsed = new Date();
      return resolved.fullCommand;
    }

    return null;
  }

  /**
   * 히스토리 조회
   */
  getHistory(sessionId, limit = 10) {
    const userPatterns = this._getUserPatterns(sessionId);
    return userPatterns.history.slice(-limit);
  }

  /**
   * 학습 통계
   */
  getStats(sessionId = null) {
    if (sessionId) {
      const userPatterns = this._getUserPatterns(sessionId);
      return {
        sessionId,
        patterns: userPatterns.patterns.size,
        preferences: Object.keys(userPatterns.preferences).length,
        shortcuts: userPatterns.shortcuts.size,
        history: userPatterns.history.length,
        topPatterns: Array.from(userPatterns.patterns.values())
          .sort((a, b) => b.getScore() - a.getScore())
          .slice(0, 5)
          .map(p => p.toJSON())
      };
    }

    return {
      totalSessions: this.sessions.size,
      totalPatterns: Array.from(this.sessions.values()).reduce(
        (sum, user) => sum + user.patterns.size,
        0
      ),
      globalPatterns: this.globalPatterns.size
    };
  }

  /**
   * 패턴 분석
   */
  analyzePatterns(sessionId) {
    const userPatterns = this._getUserPatterns(sessionId);

    const analysis = {
      totalPatterns: userPatterns.patterns.size,
      byIntent: {},
      topPatterns: [],
      recentCommands: []
    };

    // 의도별 분류
    userPatterns.patterns.forEach(pattern => {
      analysis.byIntent[pattern.intent] =
        (analysis.byIntent[pattern.intent] || 0) + 1;
    });

    // 상위 패턴
    analysis.topPatterns = Array.from(userPatterns.patterns.values())
      .sort((a, b) => b.getScore() - a.getScore())
      .slice(0, 10)
      .map(p => p.toJSON());

    // 최근 명령
    analysis.recentCommands = userPatterns.history
      .slice(-20)
      .reverse()
      .map(h => ({
        message: h.message,
        intent: h.intent,
        correct: h.correct,
        timestamp: h.timestamp
      }));

    return analysis;
  }

  /**
   * 세션 초기화
   */
  clear(sessionId) {
    this.sessions.delete(sessionId);
  }
}

/**
 * 전역 인스턴스
 */
let globalPatternLearner = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getPatternLearner() {
  if (!globalPatternLearner) {
    globalPatternLearner = new PatternLearner();
  }
  return globalPatternLearner;
}

module.exports = {
  PatternLearner,
  getPatternLearner,
  PATTERN_TYPE
};
