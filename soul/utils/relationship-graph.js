/**
 * relationship-graph.js
 * 관계 그래프 시스템
 *
 * Week 2: 메모리 고도화
 *
 * 기능:
 * - 엔티티(사람, 개념, 프로젝트 등) 추출
 * - 관계(mentions, relates_to, causes 등) 추출
 * - 그래프 구조 생성 및 분석
 * - 중요도 계산 (PageRank 등)
 */

/**
 * 관계 유형
 */
const RELATIONSHIP_TYPES = {
  MENTIONS: 'mentions',           // A가 B를 언급
  RELATES_TO: 'relates_to',       // A와 B가 관련됨
  CAUSES: 'causes',               // A가 B를 야기
  SOLVES: 'solves',               // A가 B를 해결
  DEPENDS_ON: 'depends_on',       // A가 B에 의존
  PART_OF: 'part_of',             // A가 B의 일부
  SIMILAR_TO: 'similar_to',       // A와 B가 유사
  OPPOSITE_OF: 'opposite_of'      // A와 B가 반대
};

/**
 * 엔티티 유형
 */
const ENTITY_TYPES = {
  PERSON: 'person',               // 사람
  CONCEPT: 'concept',             // 개념
  PROJECT: 'project',             // 프로젝트
  TECHNOLOGY: 'technology',       // 기술
  TASK: 'task',                   // 작업
  FILE: 'file',                   // 파일
  TOPIC: 'topic',                 // 주제
  EVENT: 'event'                  // 이벤트
};

/**
 * RelationshipGraph 클래스
 * 엔티티와 관계를 관리하는 그래프
 */
class RelationshipGraph {
  constructor() {
    this.entities = new Map();      // id -> Entity
    this.relationships = new Map(); // id -> Relationship
    this.adjacencyList = new Map(); // entityId -> [relationshipIds]
  }

  /**
   * 엔티티 추가
   */
  addEntity(entity) {
    const id = entity.id || this._generateId('entity');

    const fullEntity = {
      id,
      name: entity.name,
      type: entity.type || ENTITY_TYPES.CONCEPT,
      properties: entity.properties || {},
      mentions: entity.mentions || 0,
      firstSeen: entity.firstSeen || new Date(),
      lastSeen: entity.lastSeen || new Date(),
      importance: entity.importance || 0
    };

    this.entities.set(id, fullEntity);

    if (!this.adjacencyList.has(id)) {
      this.adjacencyList.set(id, []);
    }

    return fullEntity;
  }

  /**
   * 관계 추가
   */
  addRelationship(relationship) {
    const id = relationship.id || this._generateId('rel');

    const { from, to, type, properties = {}, strength = 1.0 } = relationship;

    // 엔티티 존재 확인
    if (!this.entities.has(from) || !this.entities.has(to)) {
      throw new Error('Both entities must exist before creating a relationship');
    }

    const fullRelationship = {
      id,
      from,
      to,
      type: type || RELATIONSHIP_TYPES.RELATES_TO,
      properties,
      strength,
      createdAt: new Date()
    };

    this.relationships.set(id, fullRelationship);

    // Adjacency list 업데이트
    this.adjacencyList.get(from).push(id);

    // 양방향 관계인 경우
    if (type === RELATIONSHIP_TYPES.SIMILAR_TO ||
        type === RELATIONSHIP_TYPES.RELATES_TO) {
      this.adjacencyList.get(to).push(id);
    }

    return fullRelationship;
  }

  /**
   * 엔티티 조회
   */
  getEntity(id) {
    return this.entities.get(id);
  }

  /**
   * 관계 조회
   */
  getRelationship(id) {
    return this.relationships.get(id);
  }

  /**
   * 엔티티의 모든 관계 조회
   */
  getRelationships(entityId, options = {}) {
    const { type = null, direction = 'both' } = options;

    const relationshipIds = this.adjacencyList.get(entityId) || [];
    let relationships = relationshipIds.map(id => this.relationships.get(id));

    // 방향 필터
    if (direction === 'outgoing') {
      relationships = relationships.filter(r => r.from === entityId);
    } else if (direction === 'incoming') {
      relationships = relationships.filter(r => r.to === entityId);
    }

    // 타입 필터
    if (type) {
      relationships = relationships.filter(r => r.type === type);
    }

    return relationships;
  }

  /**
   * 연결된 엔티티 조회
   */
  getConnectedEntities(entityId, options = {}) {
    const relationships = this.getRelationships(entityId, options);
    const connectedIds = new Set();

    relationships.forEach(rel => {
      if (rel.from === entityId) {
        connectedIds.add(rel.to);
      } else {
        connectedIds.add(rel.from);
      }
    });

    return Array.from(connectedIds).map(id => this.entities.get(id));
  }

  /**
   * 경로 찾기 (BFS)
   */
  findPath(fromId, toId, maxDepth = 5) {
    if (!this.entities.has(fromId) || !this.entities.has(toId)) {
      return null;
    }

    const queue = [[fromId]];
    const visited = new Set([fromId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === toId) {
        return this._buildPathResult(path);
      }

      if (path.length >= maxDepth) {
        continue;
      }

      const connected = this.getConnectedEntities(current);

      for (const entity of connected) {
        if (!visited.has(entity.id)) {
          visited.add(entity.id);
          queue.push([...path, entity.id]);
        }
      }
    }

    return null;
  }

  /**
   * PageRank 계산
   * 엔티티 중요도 계산
   */
  calculateImportance(iterations = 20, dampingFactor = 0.85) {
    const entityCount = this.entities.size;
    if (entityCount === 0) return;

    // 초기화
    const scores = new Map();
    this.entities.forEach((_, id) => {
      scores.set(id, 1.0 / entityCount);
    });

    // PageRank 반복
    for (let i = 0; i < iterations; i++) {
      const newScores = new Map();

      this.entities.forEach((_, id) => {
        let score = (1 - dampingFactor) / entityCount;

        // Incoming links
        const incoming = this.getRelationships(id, { direction: 'incoming' });

        incoming.forEach(rel => {
          const fromId = rel.from;
          const fromOutgoing = this.getRelationships(fromId, { direction: 'outgoing' });
          const outgoingCount = fromOutgoing.length || 1;

          score += dampingFactor * (scores.get(fromId) / outgoingCount) * rel.strength;
        });

        newScores.set(id, score);
      });

      // 업데이트
      newScores.forEach((score, id) => {
        scores.set(id, score);
      });
    }

    // 엔티티에 importance 저장
    scores.forEach((score, id) => {
      const entity = this.entities.get(id);
      entity.importance = score;
    });

    return scores;
  }

  /**
   * 클러스터 탐지 (간단한 버전)
   * 연결이 밀집된 엔티티 그룹 찾기
   */
  detectClusters(minSize = 3) {
    const visited = new Set();
    const clusters = [];

    this.entities.forEach((_, id) => {
      if (visited.has(id)) return;

      const cluster = this._dfs(id, visited);

      if (cluster.length >= minSize) {
        clusters.push({
          entities: cluster.map(entityId => this.entities.get(entityId)),
          size: cluster.length,
          connections: this._countInternalConnections(cluster)
        });
      }
    });

    return clusters.sort((a, b) => b.size - a.size);
  }

  /**
   * 가장 중요한 엔티티 조회
   */
  getMostImportant(limit = 10, type = null) {
    let entities = Array.from(this.entities.values());

    if (type) {
      entities = entities.filter(e => e.type === type);
    }

    entities.sort((a, b) => b.importance - a.importance);

    return entities.slice(0, limit);
  }

  /**
   * 통계
   */
  getStats() {
    const entityTypes = {};
    const relationshipTypes = {};

    this.entities.forEach(entity => {
      entityTypes[entity.type] = (entityTypes[entity.type] || 0) + 1;
    });

    this.relationships.forEach(rel => {
      relationshipTypes[rel.type] = (relationshipTypes[rel.type] || 0) + 1;
    });

    return {
      totalEntities: this.entities.size,
      totalRelationships: this.relationships.size,
      entityTypes,
      relationshipTypes,
      avgConnectionsPerEntity: this.relationships.size * 2 / (this.entities.size || 1)
    };
  }

  /**
   * 그래프 데이터 추출 (시각화용)
   */
  toGraphData(options = {}) {
    const { limit = 100, minImportance = 0 } = options;

    let entities = Array.from(this.entities.values())
      .filter(e => e.importance >= minImportance)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);

    const entityIds = new Set(entities.map(e => e.id));

    const relationships = Array.from(this.relationships.values())
      .filter(r => entityIds.has(r.from) && entityIds.has(r.to));

    return {
      nodes: entities.map(e => ({
        id: e.id,
        label: e.name,
        type: e.type,
        importance: e.importance,
        mentions: e.mentions
      })),
      edges: relationships.map(r => ({
        id: r.id,
        source: r.from,
        target: r.to,
        type: r.type,
        strength: r.strength
      }))
    };
  }

  /**
   * JSON으로 직렬화
   */
  toJSON() {
    return {
      entities: Array.from(this.entities.values()),
      relationships: Array.from(this.relationships.values())
    };
  }

  /**
   * JSON에서 복원
   */
  static fromJSON(data) {
    const graph = new RelationshipGraph();

    data.entities.forEach(entity => {
      graph.addEntity(entity);
    });

    data.relationships.forEach(rel => {
      graph.addRelationship(rel);
    });

    return graph;
  }

  /**
   * ID 생성
   */
  _generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 경로 결과 구성
   */
  _buildPathResult(path) {
    const entities = path.map(id => this.entities.get(id));
    const relationships = [];

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      const rels = this.getRelationships(from);
      const connecting = rels.find(r =>
        (r.from === from && r.to === to) ||
        (r.from === to && r.to === from)
      );

      if (connecting) {
        relationships.push(connecting);
      }
    }

    return {
      entities,
      relationships,
      length: path.length - 1
    };
  }

  /**
   * DFS (클러스터 탐지용)
   */
  _dfs(startId, visited) {
    const cluster = [];
    const stack = [startId];

    while (stack.length > 0) {
      const id = stack.pop();

      if (visited.has(id)) continue;

      visited.add(id);
      cluster.push(id);

      const connected = this.getConnectedEntities(id);
      connected.forEach(entity => {
        if (!visited.has(entity.id)) {
          stack.push(entity.id);
        }
      });
    }

    return cluster;
  }

  /**
   * 클러스터 내부 연결 수 계산
   */
  _countInternalConnections(cluster) {
    const clusterSet = new Set(cluster);
    let count = 0;

    cluster.forEach(id => {
      const rels = this.getRelationships(id);
      rels.forEach(rel => {
        if (clusterSet.has(rel.to)) {
          count++;
        }
      });
    });

    return count;
  }
}

/**
 * EntityExtractor 클래스
 * 텍스트에서 엔티티와 관계 자동 추출
 */
class EntityExtractor {
  constructor() {
    // 패턴 기반 추출 (간단한 버전)
    this.patterns = {
      person: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
      technology: /\b(React|Vue|Angular|Node\.js|Python|Java|TypeScript|JavaScript|MongoDB|PostgreSQL|Redis|Docker|Kubernetes)\b/gi,
      file: /\b([a-z0-9_-]+\.(js|ts|py|java|md|json|yaml|yml))\b/gi,
      project: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:project|프로젝트)\b/gi
    };
  }

  /**
   * 텍스트에서 엔티티 추출
   */
  extractEntities(text) {
    const entities = new Map();

    // Person
    let match;
    while ((match = this.patterns.person.exec(text)) !== null) {
      const name = match[1];
      if (!entities.has(name)) {
        entities.set(name, {
          name,
          type: ENTITY_TYPES.PERSON,
          mentions: 0
        });
      }
      entities.get(name).mentions++;
    }

    // Technology
    this.patterns.technology.lastIndex = 0;
    while ((match = this.patterns.technology.exec(text)) !== null) {
      const name = match[1];
      if (!entities.has(name)) {
        entities.set(name, {
          name,
          type: ENTITY_TYPES.TECHNOLOGY,
          mentions: 0
        });
      }
      entities.get(name).mentions++;
    }

    // File
    this.patterns.file.lastIndex = 0;
    while ((match = this.patterns.file.exec(text)) !== null) {
      const name = match[1];
      if (!entities.has(name)) {
        entities.set(name, {
          name,
          type: ENTITY_TYPES.FILE,
          mentions: 0
        });
      }
      entities.get(name).mentions++;
    }

    return Array.from(entities.values());
  }

  /**
   * 텍스트에서 관계 추출 (간단한 버전)
   */
  extractRelationships(text, entities) {
    const relationships = [];

    // 공출현 기반 관계 (co-occurrence)
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];

        // 같은 문장에 등장하면 relates_to
        if (this._coOccurs(text, e1.name, e2.name)) {
          relationships.push({
            from: e1.id,
            to: e2.id,
            type: RELATIONSHIP_TYPES.RELATES_TO,
            strength: 0.5
          });
        }
      }
    }

    return relationships;
  }

  /**
   * 공출현 확인
   */
  _coOccurs(text, name1, name2, windowSize = 100) {
    const index1 = text.indexOf(name1);
    const index2 = text.indexOf(name2);

    if (index1 === -1 || index2 === -1) return false;

    return Math.abs(index1 - index2) <= windowSize;
  }
}

module.exports = {
  RelationshipGraph,
  EntityExtractor,
  RELATIONSHIP_TYPES,
  ENTITY_TYPES
};
