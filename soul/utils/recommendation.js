const memoryUtils = require('./memory');

/**
 * 추천 및 연관 검색 유틸리티
 */
class RecommendationUtils {
  /**
   * 두 대화 간의 유사도 계산
   */
  calculateSimilarity(conv1, conv2) {
    let score = 0;

    // 공통 주제 (가중치: 10)
    const commonTopics = conv1.topics?.filter(t =>
      conv2.topics?.includes(t)
    ) || [];
    score += commonTopics.length * 10;

    // 공통 태그 (가중치: 5)
    const commonTags = conv1.tags?.filter(t =>
      conv2.tags?.includes(t)
    ) || [];
    score += commonTags.length * 5;

    // 같은 카테고리 (가중치: 8)
    if (conv1.category && conv1.category === conv2.category) {
      score += 8;
    }

    // 비슷한 중요도 (가중치: 3)
    const importanceDiff = Math.abs(
      (conv1.importance || 5) - (conv2.importance || 5)
    );
    if (importanceDiff <= 2) {
      score += 3;
    }

    // 시간적 근접성 (가중치: 2)
    const timeDiff = Math.abs(
      new Date(conv1.date).getTime() - new Date(conv2.date).getTime()
    );
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    if (daysDiff <= 7) {
      score += 2;
    }

    return score;
  }

  /**
   * 비슷한 대화 찾기
   */
  async findSimilar(conversationId, options = {}) {
    const {
      limit = 5,
      minScore = 5,
      excludeSelf = true
    } = options;

    const index = await memoryUtils.readIndex();

    // 기준 대화 찾기
    const targetConv = index.conversations.find(c => c.id === conversationId);
    if (!targetConv) {
      throw new Error('Conversation not found');
    }

    // 모든 대화와 유사도 계산
    const similarities = index.conversations
      .filter(conv => !excludeSelf || conv.id !== conversationId)
      .map(conv => ({
        conversation: conv,
        score: this.calculateSimilarity(targetConv, conv),
        commonTopics: targetConv.topics?.filter(t => conv.topics?.includes(t)) || [],
        commonTags: targetConv.tags?.filter(t => conv.tags?.includes(t)) || []
      }))
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      target: targetConv,
      similar: similarities,
      total: similarities.length
    };
  }

  /**
   * 관계 그래프 데이터 생성
   */
  async buildRelationshipGraph(options = {}) {
    const {
      minScore = 5,
      includeEdges = true
    } = options;

    const index = await memoryUtils.readIndex();
    const nodes = [];
    const edges = [];

    // 노드 생성
    index.conversations.forEach(conv => {
      nodes.push({
        id: conv.id,
        label: conv.topics?.[0] || 'Untitled',
        category: conv.category,
        importance: conv.importance,
        date: conv.date,
        tags: conv.tags,
        topics: conv.topics
      });
    });

    // 엣지 생성 (관계)
    if (includeEdges) {
      for (let i = 0; i < index.conversations.length; i++) {
        for (let j = i + 1; j < index.conversations.length; j++) {
          const conv1 = index.conversations[i];
          const conv2 = index.conversations[j];
          const score = this.calculateSimilarity(conv1, conv2);

          if (score >= minScore) {
            edges.push({
              source: conv1.id,
              target: conv2.id,
              weight: score,
              type: this.determineRelationType(conv1, conv2)
            });
          }
        }
      }
    }

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgConnections: edges.length / (nodes.length || 1)
      }
    };
  }

  /**
   * 관계 유형 결정
   */
  determineRelationType(conv1, conv2) {
    // 같은 주제
    const hasCommonTopics = conv1.topics?.some(t => conv2.topics?.includes(t));
    if (hasCommonTopics) {
      return 'topic';
    }

    // 같은 카테고리
    if (conv1.category === conv2.category) {
      return 'category';
    }

    // 공통 태그
    const hasCommonTags = conv1.tags?.some(t => conv2.tags?.includes(t));
    if (hasCommonTags) {
      return 'tag';
    }

    return 'other';
  }

  /**
   * 추천 대화 ("이것도 볼래?")
   */
  async getRecommendations(options = {}) {
    const {
      basedOn = 'recent', // recent, important, category
      limit = 5,
      excludeRecent = 3 // 최근 N개 제외
    } = options;

    const index = await memoryUtils.readIndex();
    let recommendations = [];

    switch (basedOn) {
      case 'recent':
        // 최근 대화 기반 추천
        const recentConvs = index.conversations
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, excludeRecent);

        // 최근 대화들과 비슷한 대화 찾기
        const similarToRecent = new Map();
        for (const recent of recentConvs) {
          const similar = await this.findSimilar(recent.id, { limit: 10 });
          similar.similar.forEach(item => {
            const existing = similarToRecent.get(item.conversation.id) || 0;
            similarToRecent.set(item.conversation.id, existing + item.score);
          });
        }

        recommendations = Array.from(similarToRecent.entries())
          .map(([id, score]) => ({
            conversation: index.conversations.find(c => c.id === id),
            score,
            reason: 'Similar to recent conversations'
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        break;

      case 'important':
        // 중요한 대화 추천
        recommendations = index.conversations
          .filter(conv => (conv.importance || 0) >= 7)
          .sort((a, b) => b.importance - a.importance)
          .slice(0, limit)
          .map(conv => ({
            conversation: conv,
            score: conv.importance,
            reason: 'High importance conversation'
          }));
        break;

      case 'category':
        // 카테고리별 인기 대화
        const categoryCounts = {};
        index.conversations.forEach(conv => {
          if (conv.category) {
            categoryCounts[conv.category] = (categoryCounts[conv.category] || 0) + 1;
          }
        });

        const topCategory = Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0];

        if (topCategory) {
          recommendations = index.conversations
            .filter(conv => conv.category === topCategory)
            .sort((a, b) => b.importance - a.importance)
            .slice(0, limit)
            .map(conv => ({
              conversation: conv,
              score: conv.importance,
              reason: `Popular in ${topCategory} category`
            }));
        }
        break;
    }

    return {
      recommendations,
      basedOn,
      total: recommendations.length
    };
  }

  /**
   * 태그 기반 연관 대화 찾기
   */
  async findByTags(tags, options = {}) {
    const {
      matchType = 'any', // any, all
      limit = 10,
      sortBy = 'relevance' // relevance, date, importance
    } = options;

    const index = await memoryUtils.readIndex();

    let filtered = index.conversations.filter(conv => {
      if (matchType === 'all') {
        return tags.every(tag => conv.tags?.includes(tag));
      } else {
        return tags.some(tag => conv.tags?.includes(tag));
      }
    });

    // 관련성 점수 계산
    filtered = filtered.map(conv => {
      const matchedTags = conv.tags?.filter(t => tags.includes(t)) || [];
      return {
        conversation: conv,
        matchedTags,
        score: matchedTags.length * 5 + (conv.importance || 0)
      };
    });

    // 정렬
    switch (sortBy) {
      case 'date':
        filtered.sort((a, b) => new Date(b.conversation.date) - new Date(a.conversation.date));
        break;
      case 'importance':
        filtered.sort((a, b) => b.conversation.importance - a.conversation.importance);
        break;
      default: // relevance
        filtered.sort((a, b) => b.score - a.score);
    }

    return {
      results: filtered.slice(0, limit),
      total: filtered.length,
      matchType,
      searchedTags: tags
    };
  }
}

module.exports = new RecommendationUtils();
