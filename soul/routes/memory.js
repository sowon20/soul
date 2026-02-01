/**
 * memory.js
 * 메모리 계층 API
 * - 단기/중기/장기 메모리 조회
 * - 문서 스토리지 관리
 */

const express = require('express');
const router = express.Router();
const { getMemoryManager } = require('../utils/memory-layers');

/**
 * GET /api/memory/stats
 * 메모리 전체 통계
 */
router.get('/stats', async (req, res) => {
  try {
    const manager = await getMemoryManager();
    
    const shortTermStats = {
      count: manager.shortTerm.messages.length,
      totalTokens: manager.shortTerm.totalTokens
    };
    
    const middleTermStats = {
      summaryCount: (await manager.middleTerm.getRecentWeeklySummaries(100)).length
    };
    
    const longTermStats = await manager.longTerm.getStats();
    
    const documentStats = {
      count: manager.documents.index?.documents?.length || 0,
      categories: manager.documents.getCategories()
    };
    
    res.json({
      success: true,
      stats: {
        shortTerm: shortTermStats,
        middleTerm: middleTermStats,
        longTerm: longTermStats,
        documents: documentStats
      }
    });
  } catch (error) {
    console.error('Memory stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/short-term
 * 단기 메모리 (최근 메시지)
 */
router.get('/short-term', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const manager = await getMemoryManager();
    
    const messages = manager.shortTerm.getRecent(parseInt(limit));
    
    res.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    console.error('Short-term memory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/weekly-summaries
 * 중기 메모리 (주간 요약)
 */
router.get('/weekly-summaries', async (req, res) => {
  try {
    const { limit = 8 } = req.query;
    const manager = await getMemoryManager();
    
    const summaries = await manager.middleTerm.getRecentWeeklySummaries(parseInt(limit));
    
    res.json({
      success: true,
      count: summaries.length,
      summaries
    });
  } catch (error) {
    console.error('Weekly summaries error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/archives
 * 장기 메모리 (아카이브) 검색
 */
router.get('/archives', async (req, res) => {
  try {
    const { query, category, tags, limit = 20 } = req.query;
    const manager = await getMemoryManager();
    
    const results = await manager.longTerm.search(query, {
      category,
      tags: tags ? tags.split(',') : undefined,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      count: results.length,
      archives: results
    });
  } catch (error) {
    console.error('Archives search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/archives/:id
 * 아카이브 상세 조회 (원본 대화)
 */
router.get('/archives/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const manager = await getMemoryManager();
    
    const archive = await manager.longTerm.getById(id);
    
    if (!archive) {
      return res.status(404).json({ success: false, error: 'Archive not found' });
    }
    
    res.json({ success: true, archive });
  } catch (error) {
    console.error('Archive detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/archives
 * 대화 아카이브
 */
router.post('/archives', async (req, res) => {
  try {
    const { conversationId, messages, metadata } = req.body;
    const manager = await getMemoryManager();
    
    const result = await manager.longTerm.archive(conversationId, messages, metadata);
    
    res.json({ success: true, archive: result });
  } catch (error) {
    console.error('Archive error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/documents
 * 문서 목록/검색
 */
router.get('/documents', async (req, res) => {
  try {
    const { query, category, tags, limit = 20 } = req.query;
    const manager = await getMemoryManager();
    
    const results = await manager.documents.search(query, {
      category,
      tags: tags ? tags.split(',') : undefined,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      count: results.length,
      documents: results,
      categories: manager.documents.getCategories()
    });
  } catch (error) {
    console.error('Documents search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/documents
 * 문서 업로드
 */
router.post('/documents', async (req, res) => {
  try {
    const { filename, content, metadata } = req.body;
    const manager = await getMemoryManager();
    
    // base64 디코딩 (필요시)
    const fileContent = metadata?.isBase64 
      ? Buffer.from(content, 'base64')
      : content;
    
    const result = await manager.documents.save(filename, fileContent, metadata);
    
    res.json({ success: true, document: result });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/documents/:id
 * 문서 상세 조회
 */
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const manager = await getMemoryManager();
    
    const doc = await manager.documents.read(id);
    
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    res.json({ success: true, document: doc });
  } catch (error) {
    console.error('Document detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
