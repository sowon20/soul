const express = require('express');
const router = express.Router();
const searchUtils = require('../utils/search');

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

module.exports = router;
