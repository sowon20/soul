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

/**
 * POST /api/config/api-key
 * API 키 저장 (MongoDB 암호화 저장 - 재시작 불필요)
 */
router.post('/api-key', async (req, res) => {
  try {
    const { service, apiKey } = req.body;

    if (!service || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'service and apiKey are required'
      });
    }

    // MongoDB에 암호화하여 저장
    const APIKey = require('../models/APIKey');
    await APIKey.saveKey(service, apiKey);

    // AI Service Factory 캐시 무효화 (즉시 적용)
    const { AIServiceFactory } = require('../utils/ai-service');
    AIServiceFactory._cache = {};

    res.json({
      success: true,
      message: 'API key saved and encrypted in database',
      service,
      encrypted: true,
      restartRequired: false
    });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/config/api-key/:service
 * API 키 존재 여부 확인 (복호화하지 않음)
 */
router.get('/api-key/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const APIKey = require('../models/APIKey');

    const keyDoc = await APIKey.findOne({ service });

    res.json({
      success: true,
      service,
      configured: !!keyDoc,
      updatedAt: keyDoc ? keyDoc.updatedAt : null
    });
  } catch (error) {
    console.error('Error checking API key:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/config/api-key/:service
 * API 키 삭제
 */
router.delete('/api-key/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const APIKey = require('../models/APIKey');

    await APIKey.deleteOne({ service });

    // AI Service Factory 캐시 무효화
    const { AIServiceFactory } = require('../utils/ai-service');
    AIServiceFactory._cache = {};

    res.json({
      success: true,
      message: 'API key deleted',
      service
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/config/api-key/validate
 * API 키 검증 (저장 전 테스트)
 */
router.post('/api-key/validate', async (req, res) => {
  try {
    const { service, apiKey } = req.body;

    if (!service || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'service and apiKey are required'
      });
    }

    const { AIServiceFactory } = require('../utils/ai-service');
    const result = await AIServiceFactory.validateApiKey(service, apiKey);

    res.json({
      success: result.valid,
      message: result.message,
      service
    });
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/config/models/:service
 * 서비스별 사용 가능한 모델 목록 조회
 */
router.get('/models/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const APIKey = require('../models/APIKey');
    const { AIServiceFactory } = require('../utils/ai-service');

    // API 키 가져오기
    const apiKey = await APIKey.getKey(service);
    if (!apiKey && service !== 'ollama') {
      return res.status(404).json({
        success: false,
        error: `${service} API key not configured`
      });
    }

    // 모델 목록 가져오기
    const result = await AIServiceFactory.getAvailableModels(service, apiKey);

    res.json(result);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/config/memory
 * 메모리 설정 조회
 */
router.get('/memory', async (req, res) => {
  try {
    const memoryConfig = await configManager.getMemoryConfig();
    res.json(memoryConfig);
  } catch (error) {
    console.error('Error reading memory config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PUT /api/config/memory
 * 메모리 설정 업데이트
 */
router.put('/memory', async (req, res) => {
  try {
    const memoryConfig = await configManager.updateMemoryConfig(req.body);
    res.json(memoryConfig);
  } catch (error) {
    console.error('Error updating memory config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/config/memory/path
 * 메모리 저장 경로 변경
 */
router.post('/memory/path', async (req, res) => {
  try {
    const { storagePath } = req.body;

    if (!storagePath) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'storagePath is required'
      });
    }

    const memoryConfig = await configManager.setMemoryPath(storagePath);
    res.json(memoryConfig);
  } catch (error) {
    console.error('Error setting memory path:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/files
 * 파일 설정 조회
 */
router.get('/files', async (req, res) => {
  try {
    const filesConfig = await configManager.getFilesConfig();
    res.json(filesConfig);
  } catch (error) {
    console.error('Error reading files config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PUT /api/config/files
 * 파일 설정 업데이트
 */
router.put('/files', async (req, res) => {
  try {
    const filesConfig = await configManager.updateFilesConfig(req.body);
    res.json(filesConfig);
  } catch (error) {
    console.error('Error updating files config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
