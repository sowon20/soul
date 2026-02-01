const express = require('express');
const router = express.Router();
const searchUtils = require('../utils/search');
const recommendationUtils = require('../utils/recommendation');

/**
 * GET /api/search
 * 기본 검색
 */
router.get('/', async (req, res) => {
  try {
    const {
      q, // 검색 키워드
      tags, // 태그 (콤마 구분)
      category,
      startDate,
      endDate,
      minImportance,
      maxImportance,
      sortBy = 'date',
      sortOrder = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    const filters = {
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      category: category || null,
      startDate: startDate || null,
      endDate: endDate || null,
      minImportance: minImportance ? parseInt(minImportance) : null,
      maxImportance: maxImportance ? parseInt(maxImportance) : null,
      sortBy,
      sortOrder,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await searchUtils.searchConversations(q || '', filters);

    res.json(result);
  } catch (error) {
    console.error('Error searching conversations:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/search/advanced
 * 고급 검색
 */
router.post('/advanced', async (req, res) => {
  try {
    const result = await searchUtils.advancedSearch(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error in advanced search:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/search/tags
 * 모든 태그 목록 조회
 */
router.get('/tags', async (req, res) => {
  try {
    const tags = await searchUtils.getAllTags();
    res.json({ tags });
  } catch (error) {
    console.error('Error getting tags:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/search/categories
 * 모든 카테고리 목록 조회
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await searchUtils.getAllCategories();
    res.json({ categories });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/search/stats
 * 통계 정보 조회
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await searchUtils.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/search/smart
 * 자연어 지능형 검색
 */
router.post('/smart', async (req, res) => {
  try {
    const { query, recentSearches, useExpanded, additionalFilters } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'query is required'
      });
    }

    const result = await searchUtils.smartSearch(query, {
      recentSearches: recentSearches || [],
      useExpanded: useExpanded || false,
      additionalFilters: additionalFilters || {}
    });

    res.json(result);
  } catch (error) {
    console.error('Error in smart search:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/search/similar/:conversationId
 * 비슷한 대화 찾기
 */
router.get('/similar/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 5, minScore = 5 } = req.query;

    const result = await recommendationUtils.findSimilar(conversationId, {
      limit: parseInt(limit),
      minScore: parseInt(minScore)
    });

    res.json(result);
  } catch (error) {
    console.error('Error finding similar conversations:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/search/graph
 * 관계 그래프 데이터
 */
router.get('/graph', async (req, res) => {
  try {
    const { minScore = 5, includeEdges = 'true' } = req.query;

    const result = await recommendationUtils.buildRelationshipGraph({
      minScore: parseInt(minScore),
      includeEdges: includeEdges === 'true'
    });

    res.json(result);
  } catch (error) {
    console.error('Error building relationship graph:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/search/recommendations
 * 추천 대화
 */
router.get('/recommendations', async (req, res) => {
  try {
    const { basedOn = 'recent', limit = 5, excludeRecent = 3 } = req.query;

    const result = await recommendationUtils.getRecommendations({
      basedOn,
      limit: parseInt(limit),
      excludeRecent: parseInt(excludeRecent)
    });

    res.json(result);
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/search/by-tags
 * 태그 기반 검색
 */
router.post('/by-tags', async (req, res) => {
  try {
    const { tags, matchType = 'any', limit = 10, sortBy = 'relevance' } = req.body;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'tags must be a non-empty array'
      });
    }

    const result = await recommendationUtils.findByTags(tags, {
      matchType,
      limit: parseInt(limit),
      sortBy
    });

    res.json(result);
  } catch (error) {
    console.error('Error searching by tags:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
