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

    // MemoryManager 및 ConversationPipeline 인스턴스 리셋 (설정 즉시 적용)
    const { resetMemoryManager } = require('../utils/memory-layers');
    const { resetConversationPipeline } = require('../utils/conversation-pipeline');
    resetMemoryManager();
    resetConversationPipeline();

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

    // MemoryManager 인스턴스 리셋 (경로 변경 적용)
    const { resetMemoryManager } = require('../utils/memory-layers');
    const { resetConversationPipeline } = require('../utils/conversation-pipeline');
    resetMemoryManager();
    resetConversationPipeline();

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

/**
 * GET /api/config/routing
 * 스마트 라우팅 설정 조회
 */
router.get('/routing', async (req, res) => {
  try {
    const routingConfig = await configManager.getRoutingConfig();
    res.json(routingConfig);
  } catch (error) {
    console.error('Error reading routing config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PUT /api/config/routing
 * 스마트 라우팅 설정 업데이트
 */
router.put('/routing', async (req, res) => {
  try {
    const routingConfig = await configManager.updateRoutingConfig(req.body);

    // SmartRouter 인스턴스 갱신
    const { getSmartRouter, resetSmartRouter } = require('../utils/smart-router');
    resetSmartRouter(routingConfig);

    res.json(routingConfig);
  } catch (error) {
    console.error('Error updating routing config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/tool-search
 * Tool Search 설정 조회
 */
router.get('/tool-search', async (req, res) => {
  try {
    const defaultConfig = {
      enabled: false,
      type: 'regex',
      alwaysLoad: []
    };
    const toolSearchConfig = await configManager.getConfigValue('toolSearch', defaultConfig);
    res.json(toolSearchConfig);
  } catch (error) {
    console.error('Error reading tool search config:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * PUT /api/config/tool-search
 * Tool Search 설정 저장
 */
router.put('/tool-search', async (req, res) => {
  try {
    const { enabled, type, alwaysLoad } = req.body;
    const config = {
      enabled: !!enabled,
      type: type || 'regex',
      alwaysLoad: Array.isArray(alwaysLoad) ? alwaysLoad : []
    };
    await configManager.setConfigValue('toolSearch', config, 'Tool Search configuration');
    res.json(config);
  } catch (error) {
    console.error('Error saving tool search config:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * GET /api/config/dock
 * 독 아이템 목록 조회
 */
router.get('/dock', async (req, res) => {
  try {
    const defaultDock = [
      { id: 'settings', name: '설정', icon: 'setup-icom.webp', url: null, order: 0, fixed: true }
    ];
    const dockItems = await configManager.getConfigValue('dock_items', defaultDock);
    res.json(dockItems);
  } catch (error) {
    console.error('Error reading dock config:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * PUT /api/config/dock
 * 독 아이템 목록 저장
 */
router.put('/dock', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Bad Request', message: 'items must be an array' });
    }
    const dockItems = await configManager.setConfigValue('dock_items', items, 'Dock items configuration');
    res.json(dockItems);
  } catch (error) {
    console.error('Error saving dock config:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * POST /api/config/restart
 * 서버 재시작 (PM2)
 */
router.post('/restart', async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    // 먼저 응답 보내고
    res.json({ success: true, message: '서버 재시작 중...' });
    
    // 1초 후 재시작 (응답 전송 완료 대기)
    setTimeout(() => {
      exec('pm2 restart soul-backend', (error) => {
        if (error) {
          console.error('Restart failed:', error);
        }
      });
    }, 1000);
  } catch (error) {
    console.error('Restart error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/server-status
 * 서버 상태 확인
 */
router.get('/server-status', async (req, res) => {
  const status = {
    backend: { online: true, port: 3001 },
    mongodb: { online: false, port: 27017 },
    chroma: { online: false, port: 8000 },
    ftp: { online: false, port: 21 }
  };
  
  // MongoDB 체크
  try {
    const mongoose = require('mongoose');
    status.mongodb.online = mongoose.connection.readyState === 1;
  } catch (e) {
    status.mongodb.online = false;
  }
  
  // ChromaDB 체크
  try {
    const http = require('http');
    await new Promise((resolve) => {
      const req = http.get('http://localhost:8000/api/v2/heartbeat', (res) => {
        status.chroma.online = res.statusCode === 200;
        resolve();
      });
      req.on('error', () => {
        status.chroma.online = false;
        resolve();
      });
      req.setTimeout(2000, () => {
        status.chroma.online = false;
        req.destroy();
        resolve();
      });
    });
  } catch (e) {
    status.chroma.online = false;
  }
  
  // FTP 체크 (설정에서 가져오기)
  try {
    const SystemConfig = require('../models/SystemConfig');
    const config = await SystemConfig.findOne({ configKey: 'memory' });
    if (config?.value?.storageType === 'ftp' && config?.value?.ftp) {
      const ftpConfig = config.value.ftp;
      status.ftp.port = ftpConfig.port || 21;
      status.ftp.host = ftpConfig.host;
      
      // 간단한 TCP 연결 체크
      const net = require('net');
      await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
          status.ftp.online = true;
          socket.destroy();
          resolve();
        });
        socket.on('error', () => {
          status.ftp.online = false;
          resolve();
        });
        socket.on('timeout', () => {
          status.ftp.online = false;
          socket.destroy();
          resolve();
        });
        socket.connect(ftpConfig.port || 21, ftpConfig.host);
      });
    }
  } catch (e) {
    status.ftp.online = false;
  }
  
  res.json(status);
});

/**
 * GET /api/config/locale
 * 언어/시간대 설정 조회
 */
router.get('/locale', async (req, res) => {
  try {
    const defaultLocale = {
      language: 'ko',
      timezone: 'Asia/Seoul'
    };
    const locale = await configManager.getConfigValue('locale', defaultLocale);
    res.json({ success: true, settings: locale });
  } catch (error) {
    console.error('Error reading locale config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/config/locale
 * 언어/시간대 설정 저장
 */
router.put('/locale', async (req, res) => {
  try {
    const { language, timezone } = req.body;
    const locale = {
      language: language || 'ko',
      timezone: timezone || 'Asia/Seoul'
    };
    await configManager.setConfigValue('locale', locale, 'Locale settings');

    // ConversationPipeline 리셋 (시간대 설정 즉시 적용)
    const { resetConversationPipeline } = require('../utils/conversation-pipeline');
    resetConversationPipeline();

    res.json({ success: true, settings: locale });
  } catch (error) {
    console.error('Error saving locale config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config/preferences
 * 사용자 환경 설정 조회
 */
router.get('/preferences', async (req, res) => {
  try {
    const defaultPrefs = {
      currency: 'USD'
    };
    const preferences = await configManager.getConfigValue('preferences', defaultPrefs);
    res.json(preferences);
  } catch (error) {
    console.error('Error reading preferences:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * PUT /api/config/preferences
 * 사용자 환경 설정 저장
 */
router.put('/preferences', async (req, res) => {
  try {
    const currentPrefs = await configManager.getConfigValue('preferences', {});
    const updatedPrefs = { ...currentPrefs, ...req.body };
    await configManager.setConfigValue('preferences', updatedPrefs, 'User preferences');
    res.json(updatedPrefs);
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

module.exports = router;
