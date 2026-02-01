const express = require('express');
const router = express.Router();
const { AIServiceFactory } = require('../utils/ai-service');

/**
 * GET /api/ai-models/services
 * 사용 가능한 AI 서비스 목록 조회
 */
router.get('/services', (req, res) => {
  try {
    const services = AIServiceFactory.getAvailableServices();

    res.json({
      current: {
        service: process.env.DEFAULT_AI_SERVICE || 'anthropic',
        model: process.env.DEFAULT_AI_MODEL || 'claude-3-haiku-20240307'
      },
      available: services
    });
  } catch (error) {
    console.error('Error getting AI services:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/ai-models/test
 * AI 서비스 연결 테스트
 */
router.post('/test', async (req, res) => {
  try {
    const { service, model } = req.body;

    if (!service) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'service is required'
      });
    }

    const aiService = AIServiceFactory.createService(service, model);
    const isConnected = await aiService.testConnection();

    res.json({
      service,
      model: model || 'default',
      connected: isConnected
    });
  } catch (error) {
    console.error('Error testing AI service:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/ai-models/analyze
 * 테스트용 대화 분석 엔드포인트
 */
router.post('/analyze', async (req, res) => {
  try {
    const { messages, service, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'messages must be an array'
      });
    }

    const aiService = AIServiceFactory.createService(service, model);
    const analysis = await aiService.analyzeConversation(messages);

    res.json({
      service: service || process.env.DEFAULT_AI_SERVICE,
      model: model || process.env.DEFAULT_AI_MODEL,
      analysis
    });
  } catch (error) {
    console.error('Error analyzing conversation:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
