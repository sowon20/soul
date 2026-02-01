/**
 * context-tracker.js
 * 대화 컨텍스트 추적 시스템
 *
 * Week 2: 자연어 설정 고도화
 *
 * 기능:
 * - 대화 컨텍스트 추적
 * - 엔티티 추출 및 추적
 * - 대명사 해소 (anaphora resolution)
 * - 대화 상태 관리
 */

/**
 * 컨텍스트 타입
 */
const CONTEXT_TYPE = {
  ENTITY: 'entity',        // 엔티티 (사람, 장소, 사물)
  TOPIC: 'topic',          // 주제
  ACTION: 'action',        // 행동/작업
  SETTING: 'setting',      // 설정
  REFERENCE: 'reference'   // 참조
};

/**
 * 엔티티 타입
 */
const ENTITY_TYPE = {
  PERSON: 'person',
  PLACE: 'place',
  THING: 'thing',
  CONCEPT: 'concept',
  TIME: 'time',
  NUMBER: 'number'
};

/**
 * ContextItem 클래스
 */
class ContextItem {
  constructor(options) {
    this.id = options.id || this._generateId();
    this.type = options.type;
    this.value = options.value;
    this.entityType = options.entityType || null;
    this.confidence = options.confidence || 1.0;
    this.timestamp = new Date();
    this.lastAccessed = new Date();
    this.accessCount = 0;
    this.mentions = []; // 언급된 메시지 ID들
    this.relations = new Map(); // 다른 컨텍스트와의 관계
  }

  _generateId() {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  access() {
    this.lastAccessed = new Date();
    this.accessCount++;
  }

  addMention(messageId) {
    this.mentions.push(messageId);
  }

  addRelation(contextId, relationType) {
    this.relations.set(contextId, relationType);
  }

  getRecency() {
    const now = Date.now();
    const elapsed = now - this.lastAccessed.getTime();
    return Math.max(0, 1 - elapsed / (30 * 60 * 1000)); // 30분 기준
  }

  getImportance() {
    const recency = this.getRecency();
    const frequency = Math.min(1, this.accessCount / 10);
    return (recency * 0.6 + frequency * 0.4) * this.confidence;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      value: this.value,
      entityType: this.entityType,
      confidence: this.confidence,
      timestamp: this.timestamp,
      lastAccessed: this.lastAccessed,
      accessCount: this.accessCount,
      mentions: this.mentions,
      relations: Array.from(this.relations.entries()),
      recency: this.getRecency(),
      importance: this.getImportance()
    };
  }
}

/**
 * ContextTracker 클래스
 */
class ContextTracker {
  constructor() {
    this.sessions = new Map(); // sessionId -> session context
    this.config = {
      maxContextItems: 50,
      contextDecayMinutes: 30,
      minImportance: 0.1,
      autoCleanup: true
    };
  }

  /**
   * 세션 컨텍스트 가져오기
   */
  _getSessionContext(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        items: new Map(),
        currentTopic: null,
        lastAction: null,
        state: {}
      });
    }
    return this.sessions.get(sessionId);
  }

  /**
   * 컨텍스트 추가
   */
  add(sessionId, options) {
    const context = this._getSessionContext(sessionId);
    const item = new ContextItem(options);

    context.items.set(item.id, item);

    // 주제 업데이트
    if (item.type === CONTEXT_TYPE.TOPIC) {
      context.currentTopic = item.value;
    }

    // 행동 업데이트
    if (item.type === CONTEXT_TYPE.ACTION) {
      context.lastAction = item.value;
    }

    // 크기 제한
    if (context.items.size > this.config.maxContextItems) {
      this._cleanup(sessionId);
    }

    return item;
  }

  /**
   * 메시지에서 컨텍스트 추출
   */
  extractFromMessage(sessionId, message, messageId) {
    const context = this._getSessionContext(sessionId);
    const extracted = [];

    // 1. 엔티티 추출
    const entities = this._extractEntities(message);
    entities.forEach(entity => {
      const item = this.add(sessionId, {
        type: CONTEXT_TYPE.ENTITY,
        value: entity.value,
        entityType: entity.type,
        confidence: entity.confidence
      });
      item.addMention(messageId);
      extracted.push(item);
    });

    // 2. 주제 추출
    const topic = this._extractTopic(message);
    if (topic) {
      const item = this.add(sessionId, {
        type: CONTEXT_TYPE.TOPIC,
        value: topic,
        confidence: 0.8
      });
      item.addMention(messageId);
      extracted.push(item);
    }

    // 3. 행동 추출
    const action = this._extractAction(message);
    if (action) {
      const item = this.add(sessionId, {
        type: CONTEXT_TYPE.ACTION,
        value: action,
        confidence: 0.9
      });
      item.addMention(messageId);
      extracted.push(item);
    }

    // 4. 설정 추출
    const setting = this._extractSetting(message);
    if (setting) {
      const item = this.add(sessionId, {
        type: CONTEXT_TYPE.SETTING,
        value: setting.key,
        entityType: setting.value,
        confidence: 0.95
      });
      item.addMention(messageId);
      extracted.push(item);
    }

    return extracted;
  }

  /**
   * 엔티티 추출
   */
  _extractEntities(message) {
    const entities = [];

    // 사람 이름 패턴
    const personPatterns = [
      /(?:^|\s)([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g,  // 영어 이름
      /([가-힣]{2,4})(?:님|씨|이|가|은|는)/g          // 한국 이름
    ];

    personPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        entities.push({
          value: match[1],
          type: ENTITY_TYPE.PERSON,
          confidence: 0.7
        });
      }
    });

    // 장소
    const placePatterns = [
      /([가-힣]+(?:시|구|동|리|로|가))(?:\s|$|에|에서|으로|로)/g,
      /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)(?:\s+(?:시|구|동))?\s*(?:에|에서)/g
    ];

    placePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        entities.push({
          value: match[1],
          type: ENTITY_TYPE.PLACE,
          confidence: 0.6
        });
      }
    });

    // 시간
    const timePatterns = [
      /(\d{1,2}시(?:\s?\d{1,2}분)?)/g,
      /(오늘|내일|어제|모레)/g,
      /(\d{4}년\s?\d{1,2}월\s?\d{1,2}일)/g
    ];

    timePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        entities.push({
          value: match[1],
          type: ENTITY_TYPE.TIME,
          confidence: 0.9
        });
      }
    });

    // 숫자
    const numberPattern = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:개|명|원|달러|킬로|미터)?/g;
    let match;
    while ((match = numberPattern.exec(message)) !== null) {
      entities.push({
        value: match[1],
        type: ENTITY_TYPE.NUMBER,
        confidence: 0.95
      });
    }

    return entities;
  }

  /**
   * 주제 추출
   */
  _extractTopic(message) {
    const topicPatterns = [
      /(?:에 대해|관해|대한)\s+([가-힣A-Za-z\s]+)/,
      /([가-힣A-Za-z\s]+)\s+(?:이야기|얘기|설명)/
    ];

    for (const pattern of topicPatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * 행동 추출
   */
  _extractAction(message) {
    const actionPatterns = [
      /^(검색|찾아|조회|확인|실행|시작|중지|열어|닫아|바꿔|변경)/,
      /(저장|삭제|수정|추가|제거|생성|만들어)/
    ];

    for (const pattern of actionPatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 설정 추출
   */
  _extractSetting(message) {
    const settingPatterns = [
      /([가-힣A-Za-z]+)\s*(?:을|를|을로|로|로\s+설정)\s+([가-힣A-Za-z0-9\s]+)/,
      /([가-힣A-Za-z]+)\s+([가-힣A-Za-z0-9]+)\s*(?:으로|로)\s+(?:바꿔|변경)/
    ];

    for (const pattern of settingPatterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          key: match[1].trim(),
          value: match[2].trim()
        };
      }
    }

    return null;
  }

  /**
   * 대명사 해소
   */
  resolveReference(sessionId, reference) {
    const context = this._getSessionContext(sessionId);

    // 대명사 매핑
    const pronounMap = {
      '그것': CONTEXT_TYPE.ENTITY,
      '그거': CONTEXT_TYPE.ENTITY,
      '이것': CONTEXT_TYPE.ENTITY,
      '이거': CONTEXT_TYPE.ENTITY,
      '저것': CONTEXT_TYPE.ENTITY,
      '저거': CONTEXT_TYPE.ENTITY,
      '그': CONTEXT_TYPE.ENTITY,
      '그거로': CONTEXT_TYPE.ENTITY,
      '거기': CONTEXT_TYPE.PLACE,
      '여기': CONTEXT_TYPE.PLACE,
      '그때': CONTEXT_TYPE.TIME,
      '그분': CONTEXT_TYPE.PERSON,
      '그사람': CONTEXT_TYPE.PERSON
    };

    const targetType = pronounMap[reference];
    if (!targetType) {
      return null;
    }

    // 가장 최근의 해당 타입 컨텍스트 찾기
    const items = Array.from(context.items.values())
      .filter(item => item.type === targetType)
      .sort((a, b) => b.lastAccessed - a.lastAccessed);

    return items[0] || null;
  }

  /**
   * 컨텍스트 조회
   */
  get(sessionId, contextId) {
    const context = this._getSessionContext(sessionId);
    const item = context.items.get(contextId);

    if (item) {
      item.access();
    }

    return item;
  }

  /**
   * 현재 컨텍스트 조회
   */
  getCurrent(sessionId) {
    const context = this._getSessionContext(sessionId);

    const items = Array.from(context.items.values())
      .filter(item => item.getImportance() > this.config.minImportance)
      .sort((a, b) => b.getImportance() - a.getImportance())
      .slice(0, 10);

    return {
      currentTopic: context.currentTopic,
      lastAction: context.lastAction,
      state: context.state,
      items: items.map(item => item.toJSON())
    };
  }

  /**
   * 세션 상태 설정
   */
  setState(sessionId, key, value) {
    const context = this._getSessionContext(sessionId);
    context.state[key] = value;
  }

  /**
   * 세션 상태 조회
   */
  getState(sessionId, key) {
    const context = this._getSessionContext(sessionId);
    return context.state[key];
  }

  /**
   * 정리
   */
  _cleanup(sessionId) {
    const context = this._getSessionContext(sessionId);

    // 중요도가 낮은 항목 제거
    const items = Array.from(context.items.values())
      .sort((a, b) => b.getImportance() - a.getImportance());

    const toKeep = items.slice(0, this.config.maxContextItems);
    const toRemove = items.slice(this.config.maxContextItems);

    toRemove.forEach(item => {
      context.items.delete(item.id);
    });

    return toRemove.length;
  }

  /**
   * 세션 초기화
   */
  clear(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * 통계
   */
  getStats(sessionId = null) {
    if (sessionId) {
      const context = this._getSessionContext(sessionId);
      return {
        sessionId,
        totalItems: context.items.size,
        currentTopic: context.currentTopic,
        lastAction: context.lastAction,
        stateKeys: Object.keys(context.state).length
      };
    }

    return {
      totalSessions: this.sessions.size,
      totalItems: Array.from(this.sessions.values()).reduce(
        (sum, ctx) => sum + ctx.items.size,
        0
      )
    };
  }
}

/**
 * 전역 인스턴스
 */
let globalContextTracker = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getContextTracker() {
  if (!globalContextTracker) {
    globalContextTracker = new ContextTracker();
  }
  return globalContextTracker;
}

module.exports = {
  ContextTracker,
  getContextTracker,
  CONTEXT_TYPE,
  ENTITY_TYPE
};
