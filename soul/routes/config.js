const express = require('express');
const router = express.Router();
const configManager = require('../utils/config');

/**
 * GET /api/config
 * 전체 설정 조회
 */
router.get('/', async (req, res) => {
  try {
    const config = await configManager.readConfig();
    res.json(config);
  } catch (error) {
    console.error('Error reading config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/ai
 * AI 모델 설정 조회
 */
router.get('/ai', async (req, res) => {
  try {
    const aiConfig = await configManager.getAIConfig();
    res.json(aiConfig);
  } catch (error) {
    console.error('Error reading AI config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PATCH /api/config/ai
 * AI 모델 설정 업데이트
 */
router.patch('/ai', async (req, res) => {
  try {
    const aiConfig = await configManager.updateAIConfig(req.body);
    res.json(aiConfig);
  } catch (error) {
    console.error('Error updating AI config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/config/ai/default
 * 기본 AI 서비스 설정
 */
router.post('/ai/default', async (req, res) => {
  try {
    const { service, model } = req.body;

    if (!service || !model) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'service and model are required'
      });
    }

    const aiConfig = await configManager.setDefaultAI(service, model);
    res.json(aiConfig);
  } catch (error) {
    console.error('Error setting default AI:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/config/ai/toggle
 * AI 서비스 활성화/비활성화
 */
router.post('/ai/toggle', async (req, res) => {
  try {
    const { service, enabled } = req.body;

    if (!service || typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'service and enabled (boolean) are required'
      });
    }

    const aiConfig = await configManager.toggleAIService(service, enabled);
    res.json(aiConfig);
  } catch (error) {
    console.error('Error toggling AI service:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
