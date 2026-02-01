const memoryUtils = require('./memory');
const smartSearchUtils = require('./smart-search');
const Memory = require('../models/Memory');
const path = require('path');
const fs = require('fs').promises;

/**
 * 검색 유틸리티
 */
class SearchUtils {
  constructor() {
    this.memoryBasePath = null; // initialize()에서 설정
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const configManager = require('./config');
      const memoryConfig = await configManager.getMemoryConfig();
      if (memoryConfig?.storagePath) {
        this.memoryBasePath = memoryConfig.storagePath;
      } else {
        throw new Error('memory.storagePath not configured');
      }
    } catch (e) {
      console.error('[SearchUtils] Failed to initialize:', e.message);
      throw e;
    }
    this.initialized = true;
  }

  /**
   * 기본 키워드 검색
   * @param {string} keyword - 검색 키워드
   * @param {Object} filters - 필터 옵션
   * @returns {Promise<Array>} 검색 결과
   */
  async searchConversations(keyword, filters = {}) {
    await this.initialize();

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

  /**
   * 통합 검색 (모든 데이터 소스)
   */
  async smartSearch(naturalQuery, options = {}) {
    const { limit = 20 } = options;
    
    // 오타 수정
    const corrected = smartSearchUtils.fuzzyCorrection(naturalQuery);
    const { keywords, filters } = smartSearchUtils.convertToFilters(corrected);
    const searchKeywords = keywords.length > 0 ? keywords : [corrected];
    
    const results = [];
    
    // 1. MongoDB 메시지 검색
    try {
      const messageResults = await this.searchMessages(searchKeywords, limit);
      results.push(...messageResults);
    } catch (e) {
      console.error('메시지 검색 실패:', e.message);
    }
    
    // 2. MongoDB 메모리 검색 (단기)
    try {
      const memoryResults = await this.searchMemories(searchKeywords, limit);
      results.push(...memoryResults);
    } catch (e) {
      console.error('메모리 검색 실패:', e.message);
    }
    
    // 3. 중기 메모리 (주간 요약) 검색
    try {
      const summaryResults = await this.searchSummaries(searchKeywords, limit);
      results.push(...summaryResults);
    } catch (e) {
      console.error('요약 검색 실패:', e.message);
    }
    
    // 4. 장기 메모리 (아카이브) 검색
    try {
      const archiveResults = await this.searchArchives(searchKeywords, limit);
      results.push(...archiveResults);
    } catch (e) {
      console.error('아카이브 검색 실패:', e.message);
    }
    
    // 5. 문서 검색
    try {
      const docResults = await this.searchDocuments(searchKeywords, limit);
      results.push(...docResults);
    } catch (e) {
      console.error('문서 검색 실패:', e.message);
    }
    
    // 관련도 + 날짜 기준 정렬
    results.sort((a, b) => {
      // 관련도 우선
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      // 날짜 최신순
      return new Date(b.date) - new Date(a.date);
    });
    
    return {
      total: results.length,
      results: results.slice(0, limit),
      parsedQuery: {
        original: naturalQuery,
        corrected,
        keywords: searchKeywords
      }
    };
  }

  /**
   * JSONL 대화 검색
   */
  async searchMessages(keywords, limit = 10) {
    const ConversationStore = require('./conversation-store');
    const store = new ConversationStore();
    
    const messages = await store.search(keywords, limit);
    
    return messages.map(msg => ({
      id: msg.id,
      type: 'message',
      typeLabel: '대화',
      date: msg.timestamp,
      topics: [],
      preview: msg.text,  // 전체 텍스트 (프론트에서 컨텍스트 추출)
      tags: msg.tags || [],
      relevance: this.calculateRelevance(msg.text, keywords),
      source: {
        role: msg.role
      }
    }));
  }

  /**
   * MongoDB 메모리 검색 (단기)
   */
  async searchMemories(keywords, limit = 10) {
    const regex = keywords.map(k => new RegExp(k, 'i'));
    
    const memories = await Memory.find({
      $or: [
        { content: { $in: regex } },
        { tags: { $in: regex } },
        { category: { $in: regex } }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
    
    return memories.map(mem => ({
      id: mem._id.toString(),
      type: 'memory',
      typeLabel: '메모리',
      date: mem.createdAt,
      topics: [mem.category || '메모리'],
      preview: mem.content?.substring(0, 100) || '',
      tags: mem.tags || [],
      category: mem.category,
      importance: mem.importance,
      relevance: this.calculateRelevance(mem.content || '', keywords)
    }));
  }

  /**
   * 중기 메모리 (주간 요약) 검색
   */
  async searchSummaries(keywords, limit = 10) {
    await this.initialize();
    const summaryPath = path.join(this.memoryBasePath, 'summaries');
    const results = [];
    
    try {
      const files = await fs.readdir(summaryPath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(summaryPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        const text = JSON.stringify(data).toLowerCase();
        const matches = keywords.some(k => text.includes(k.toLowerCase()));
        
        if (matches) {
          results.push({
            id: `summary-${file}`,
            type: 'summary',
            typeLabel: '주간요약',
            date: data.createdAt || data.weekStart,
            topics: data.topics || ['주간 요약'],
            preview: data.summary?.substring(0, 100) || '',
            tags: data.tags || [],
            relevance: this.calculateRelevance(text, keywords)
          });
        }
        
        if (results.length >= limit) break;
      }
    } catch (e) {
      // 폴더 없으면 무시
    }
    
    return results;
  }

  /**
   * 장기 메모리 (아카이브) 검색
   */
  async searchArchives(keywords, limit = 10) {
    await this.initialize();
    const archivePath = path.join(this.memoryBasePath, 'archives');
    const results = [];
    
    try {
      const years = await fs.readdir(archivePath);
      
      for (const year of years) {
        const yearPath = path.join(archivePath, year);
        const stat = await fs.stat(yearPath);
        if (!stat.isDirectory()) continue;
        
        const files = await fs.readdir(yearPath);
        
        for (const file of files) {
          if (!file.endsWith('.md') && !file.endsWith('.json')) continue;
          
          const filePath = path.join(yearPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          
          const matches = keywords.some(k => 
            content.toLowerCase().includes(k.toLowerCase())
          );
          
          if (matches) {
            results.push({
              id: `archive-${year}-${file}`,
              type: 'archive',
              typeLabel: '아카이브',
              date: this.extractDateFromFilename(file) || new Date().toISOString(),
              topics: [file.replace(/\.(md|json)$/, '')],
              preview: content.substring(0, 100),
              tags: [],
              relevance: this.calculateRelevance(content, keywords)
            });
          }
          
          if (results.length >= limit) break;
        }
        
        if (results.length >= limit) break;
      }
    } catch (e) {
      // 폴더 없으면 무시
    }
    
    return results;
  }

  /**
   * 문서 검색
   */
  async searchDocuments(keywords, limit = 10) {
    await this.initialize();
    const docsPath = path.join(this.memoryBasePath, 'documents');
    const results = [];
    
    try {
      const files = await fs.readdir(docsPath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(docsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        const searchText = [
          data.title,
          data.content,
          data.ocrText,
          ...(data.tags || [])
        ].filter(Boolean).join(' ').toLowerCase();
        
        const matches = keywords.some(k => searchText.includes(k.toLowerCase()));
        
        if (matches) {
          results.push({
            id: `doc-${file}`,
            type: 'document',
            typeLabel: '문서',
            date: data.createdAt,
            topics: [data.title || file],
            preview: (data.content || data.ocrText || '').substring(0, 100),
            tags: data.tags || [],
            relevance: this.calculateRelevance(searchText, keywords)
          });
        }
        
        if (results.length >= limit) break;
      }
    } catch (e) {
      // 폴더 없으면 무시
    }
    
    return results;
  }

  /**
   * 관련도 계산
   */
  calculateRelevance(text, keywords) {
    if (!text) return 0;
    const lowerText = text.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      // 정확히 일치
      if (lowerText === lowerKeyword) score += 10;
      // 포함
      else if (lowerText.includes(lowerKeyword)) {
        // 등장 횟수
        const matches = (lowerText.match(new RegExp(lowerKeyword, 'g')) || []).length;
        score += Math.min(matches * 2, 8);
      }
    }
    
    return score;
  }

  /**
   * 파일명에서 날짜 추출
   */
  extractDateFromFilename(filename) {
    const match = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
    }
    return null;
  }
}

module.exports = new SearchUtils();
