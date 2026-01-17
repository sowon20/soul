const express = require('express');
const router = express.Router();
const memoryUtils = require('../utils/memory');

/**
 * POST /api/memory/archive
 * 대화를 아카이브로 저장
 */
router.post('/archive', async (req, res) => {
  try {
    const { conversationId, messages, metadata, autoAnalyze } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'conversationId is required'
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'messages must be an array'
      });
    }

    const result = await memoryUtils.saveConversation({
      id: conversationId,
      messages,
      metadata: metadata || {},
      autoAnalyze: autoAnalyze !== undefined ? autoAnalyze : true
    });

    res.json(result);
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/memory/archive/:conversationId
 * 특정 대화 ID로 아카이브
 */
router.post('/archive/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messages, metadata, autoAnalyze } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'messages must be an array'
      });
    }

    const result = await memoryUtils.saveConversation({
      id: conversationId,
      messages,
      metadata: metadata || {},
      autoAnalyze: autoAnalyze !== undefined ? autoAnalyze : true
    });

    res.json(result);
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/memory/index
 * 전체 메모리 인덱스 조회
 */
router.get('/index', async (req, res) => {
  try {
    const index = await memoryUtils.readIndex();
    res.json(index);
  } catch (error) {
    console.error('Error reading index:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/memory/conversations
 * 대화 목록 조회 (필터링 지원)
 */
router.get('/conversations', async (req, res) => {
  try {
    const { tag, category, startDate, endDate, limit = 50 } = req.query;
    const index = await memoryUtils.readIndex();

    let conversations = index.conversations;

    // 필터링
    if (tag) {
      conversations = conversations.filter(conv =>
        conv.tags && conv.tags.includes(tag)
      );
    }

    if (category) {
      conversations = conversations.filter(conv =>
        conv.category === category
      );
    }

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

    // 개수 제한
    conversations = conversations.slice(0, parseInt(limit));

    res.json({
      total: conversations.length,
      conversations
    });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
