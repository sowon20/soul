const memoryUtils = require('./memory');

/**
 * 검색 유틸리티
 */
class SearchUtils {
  /**
   * 기본 키워드 검색
   * @param {string} keyword - 검색 키워드
   * @param {Object} filters - 필터 옵션
   * @returns {Promise<Array>} 검색 결과
   */
  async searchConversations(keyword, filters = {}) {
    const {
      tags = [],
      category = null,
      startDate = null,
      endDate = null,
      minImportance = null,
      maxImportance = null,
      sortBy = 'date', // date, importance, relevance
      sortOrder = 'desc', // asc, desc
      limit = 50,
      offset = 0
    } = filters;

    // index.json에서 대화 목록 가져오기
    const index = await memoryUtils.readIndex();
    let conversations = [...index.conversations];

    // 키워드 검색
    if (keyword && keyword.trim()) {
      const lowerKeyword = keyword.toLowerCase();
      conversations = conversations.filter(conv => {
        // 주제 검색
        const topicsMatch = conv.topics?.some(topic =>
          topic.toLowerCase().includes(lowerKeyword)
        );

        // 태그 검색
        const tagsMatch = conv.tags?.some(tag =>
          tag.toLowerCase().includes(lowerKeyword)
        );

        // 카테고리 검색
        const categoryMatch = conv.category?.toLowerCase().includes(lowerKeyword);

        // ID 검색
        const idMatch = conv.id?.toLowerCase().includes(lowerKeyword);

        return topicsMatch || tagsMatch || categoryMatch || idMatch;
      });
    }

    // 태그 필터
    if (tags.length > 0) {
      conversations = conversations.filter(conv =>
        tags.every(tag => conv.tags?.includes(tag))
      );
    }

    // 카테고리 필터
    if (category) {
      conversations = conversations.filter(conv =>
        conv.category === category
      );
    }

    // 날짜 필터
    if (startDate) {
      conversations = conversations.filter(conv =>
        new Date(conv.date) >= new Date(startDate)
      );
    }

    if (endDate) {
      conversations = conversations.filter(conv =>
        new Date(conv.date) <= new Date(endDate)
      );
    }

    // 중요도 필터
    if (minImportance !== null) {
      conversations = conversations.filter(conv =>
        conv.importance >= minImportance
      );
    }

    if (maxImportance !== null) {
      conversations = conversations.filter(conv =>
        conv.importance <= maxImportance
      );
    }

    // 정렬
    conversations.sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case 'date':
          compareValue = new Date(a.date) - new Date(b.date);
          break;
        case 'importance':
          compareValue = a.importance - b.importance;
          break;
        case 'relevance':
          // 키워드 관련성 점수 계산 (간단한 구현)
          if (keyword) {
            const scoreA = this.calculateRelevanceScore(a, keyword);
            const scoreB = this.calculateRelevanceScore(b, keyword);
            compareValue = scoreA - scoreB;
          } else {
            compareValue = new Date(a.date) - new Date(b.date);
          }
          break;
        default:
          compareValue = new Date(a.date) - new Date(b.date);
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    // 페이지네이션
    const total = conversations.length;
    const results = conversations.slice(offset, offset + limit);

    return {
      total,
      limit,
      offset,
      results
    };
  }

  /**
   * 관련성 점수 계산
   */
  calculateRelevanceScore(conversation, keyword) {
    let score = 0;
    const lowerKeyword = keyword.toLowerCase();

    // 주제에서 정확히 일치
    conversation.topics?.forEach(topic => {
      if (topic.toLowerCase() === lowerKeyword) {
        score += 10;
      } else if (topic.toLowerCase().includes(lowerKeyword)) {
        score += 5;
      }
    });

    // 태그에서 정확히 일치
    conversation.tags?.forEach(tag => {
      if (tag.toLowerCase() === lowerKeyword) {
        score += 8;
      } else if (tag.toLowerCase().includes(lowerKeyword)) {
        score += 3;
      }
    });

    // 카테고리 일치
    if (conversation.category?.toLowerCase() === lowerKeyword) {
      score += 7;
    } else if (conversation.category?.toLowerCase().includes(lowerKeyword)) {
      score += 2;
    }

    // 중요도 가중치
    score += conversation.importance || 0;

    return score;
  }

  /**
   * 고급 검색 (여러 조건 조합)
   */
  async advancedSearch(searchParams) {
    const {
      keywords = [], // 여러 키워드 AND 검색
      anyKeywords = [], // 여러 키워드 OR 검색
      excludeKeywords = [], // 제외할 키워드
      ...filters
    } = searchParams;

    let result = await this.searchConversations('', filters);
    let conversations = result.results;

    // AND 키워드 검색
    if (keywords.length > 0) {
      conversations = conversations.filter(conv => {
        return keywords.every(keyword => {
          const lowerKeyword = keyword.toLowerCase();
          const topicsMatch = conv.topics?.some(t => t.toLowerCase().includes(lowerKeyword));
          const tagsMatch = conv.tags?.some(t => t.toLowerCase().includes(lowerKeyword));
          const categoryMatch = conv.category?.toLowerCase().includes(lowerKeyword);
          return topicsMatch || tagsMatch || categoryMatch;
        });
      });
    }

    // OR 키워드 검색
    if (anyKeywords.length > 0) {
      conversations = conversations.filter(conv => {
        return anyKeywords.some(keyword => {
          const lowerKeyword = keyword.toLowerCase();
          const topicsMatch = conv.topics?.some(t => t.toLowerCase().includes(lowerKeyword));
          const tagsMatch = conv.tags?.some(t => t.toLowerCase().includes(lowerKeyword));
          const categoryMatch = conv.category?.toLowerCase().includes(lowerKeyword);
          return topicsMatch || tagsMatch || categoryMatch;
        });
      });
    }

    // 제외 키워드
    if (excludeKeywords.length > 0) {
      conversations = conversations.filter(conv => {
        return !excludeKeywords.some(keyword => {
          const lowerKeyword = keyword.toLowerCase();
          const topicsMatch = conv.topics?.some(t => t.toLowerCase().includes(lowerKeyword));
          const tagsMatch = conv.tags?.some(t => t.toLowerCase().includes(lowerKeyword));
          const categoryMatch = conv.category?.toLowerCase().includes(lowerKeyword);
          return topicsMatch || tagsMatch || categoryMatch;
        });
      });
    }

    return {
      ...result,
      total: conversations.length,
      results: conversations
    };
  }

  /**
   * 모든 태그 목록 조회
   */
  async getAllTags() {
    const index = await memoryUtils.readIndex();
    const tagCounts = {};

    index.conversations.forEach(conv => {
      conv.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // 사용 빈도순 정렬
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 모든 카테고리 목록 조회
   */
  async getAllCategories() {
    const index = await memoryUtils.readIndex();
    const categoryCounts = {};

    index.conversations.forEach(conv => {
      if (conv.category) {
        categoryCounts[conv.category] = (categoryCounts[conv.category] || 0) + 1;
      }
    });

    return Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 통계 정보 조회
   */
  async getStatistics() {
    const index = await memoryUtils.readIndex();
    const tags = await this.getAllTags();
    const categories = await this.getAllCategories();

    return {
      totalConversations: index.conversations.length,
      totalTags: tags.length,
      totalCategories: categories.length,
      averageImportance: index.conversations.reduce((sum, conv) =>
        sum + (conv.importance || 0), 0) / (index.conversations.length || 1),
      dateRange: {
        earliest: index.conversations.reduce((min, conv) =>
          !min || new Date(conv.date) < new Date(min) ? conv.date : min, null),
        latest: index.conversations.reduce((max, conv) =>
          !max || new Date(conv.date) > new Date(max) ? conv.date : max, null)
      },
      topTags: tags.slice(0, 10),
      categoriesDistribution: categories
    };
  }
}

module.exports = new SearchUtils();
