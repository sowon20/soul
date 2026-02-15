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

    // 모든 인스턴스 리셋 (경로 변경 적용)
    const { resetMemoryManager } = require('../utils/memory-layers');
    const { resetConversationPipeline } = require('../utils/conversation-pipeline');
    const { clearStorageConfigCache } = require('../utils/conversation-store');
    const { resetArchiver } = require('../utils/conversation-archiver');
    clearStorageConfigCache();
    resetArchiver();
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
 * GET /api/config/storage
 * 저장소 설정 조회 (로컬 파일 기반)
 */
router.get('/storage', async (req, res) => {
  try {
    const localConfig = require('../utils/local-config');
    const storageConfig = await localConfig.readStorageConfig();
    res.json(storageConfig);
  } catch (error) {
    console.error('Error reading storage config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PUT /api/config/storage
 * 저장소 설정 업데이트 (로컬 파일에 저장)
 */
router.put('/storage', async (req, res) => {
  try {
    const localConfig = require('../utils/local-config');
    const storageConfig = await localConfig.writeStorageConfig(req.body);

    // 모든 관련 인스턴스 리셋 (설정 즉시 적용)
    const { resetMemoryManager } = require('../utils/memory-layers');
    const { resetConversationPipeline } = require('../utils/conversation-pipeline');
    const { clearStorageConfigCache } = require('../utils/conversation-store');
    const { resetArchiver } = require('../utils/conversation-archiver');
    clearStorageConfigCache();
    resetArchiver();
    resetMemoryManager();
    resetConversationPipeline();

    res.json({
      ...storageConfig,
      message: '저장소 설정이 저장되었습니다. 변경사항을 적용하려면 서버를 재시작하세요.',
      restartRequired: true
    });
  } catch (error) {
    console.error('Error updating storage config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/storage/available-types
 * 사용 가능한 저장소 타입 목록
 */
router.get('/storage/available-types', async (req, res) => {
  res.json({
    memory: [
      { type: 'local', name: '로컬', enabled: true, description: '로컬 SQLite 데이터베이스' },
      { type: 'oracle', name: 'Oracle', enabled: true, description: 'Oracle Autonomous Database' },
      { type: 'notion', name: 'Notion', enabled: true, description: 'Notion 데이터베이스' },
      { type: 'ftp', name: 'FTP', enabled: false, description: 'FTP 서버 (준비중)' }
    ],
    file: [
      { type: 'local', name: '로컬', enabled: true, description: '로컬 파일 시스템' },
      { type: 'sftp', name: 'SFTP', enabled: true, description: '원격 서버 (SSH)' },
      { type: 'oracle', name: 'Oracle Storage', enabled: false, description: 'Oracle Object Storage (준비중)' },
      { type: 'nas', name: 'NAS', enabled: false, description: 'NAS/SMB 공유 (준비중)' }
    ]
  });
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
 * GET /api/config/dock
 * 독 아이템 목록 조회
 */
router.get('/dock', async (req, res) => {
  try {
    const defaultDock = [
      { id: 'voice-input', name: '음성 대화', icon: 'mic-icon.webp', url: null, order: 0, fixed: true },
      { id: 'settings', name: '설정', icon: 'setup-icom.webp', url: null, order: 999, fixed: true }
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
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Bad Request', message: 'request body must be an array' });
    }
    await configManager.setConfigValue('dock_items', items, 'Dock items configuration');
    res.json({ success: true, items });
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
  const storageTypeLabels = {
    local: '로컬 디스크',
    ftp: 'FTP/NAS',
    oracle: 'Oracle Cloud',
    notion: 'Notion'
  };

  const status = {
    backend: { online: true, port: process.env.PORT || 5041 },
    sqlite: { online: false, label: '설정 DB' },
    storage: { online: false, type: 'local', label: '로딩중...' }
  };

  // SQLite 체크
  try {
    const db = require('../db');
    status.sqlite.online = !!db.db;
  } catch (e) {
    status.sqlite.online = false;
  }

  // 저장소 상태 체크
  try {
    const storageConfig = await configManager.getStorageConfig();
    status.storage.type = storageConfig.type || 'local';
    status.storage.label = storageTypeLabels[status.storage.type] || status.storage.type;

    // 연결 상태 확인
    if (storageConfig.type === 'local') {
      // 로컬은 항상 온라인
      status.storage.online = true;
    } else if (storageConfig.type === 'oracle') {
      // Oracle 연결 체크
      const ConversationStore = require('../utils/conversation-store');
      const store = new ConversationStore();
      await store.init();
      status.storage.online = store.oracleConnected === true;
    } else if (storageConfig.type === 'ftp') {
      // FTP 연결 체크
      const ConversationStore = require('../utils/conversation-store');
      const store = new ConversationStore();
      await store.init();
      status.storage.online = store.ftpConnected === true;
    } else {
      status.storage.online = false;
    }
  } catch (e) {
    console.error('Storage status check failed:', e.message);
    status.storage.online = false;
  }

  res.json(status);
});

/**
 * GET /api/config/storage/oracle
 * Oracle 스토리지 설정 조회
 */
router.get('/storage/oracle', async (req, res) => {
  try {
    const localConfig = require('../utils/local-config');
    const storageConf = localConfig.readStorageConfigSync();
    const oracleConf = storageConf.memory?.oracle || {};

    const hasPassword = !!oracleConf.password;
    const hasEncryptionKey = !!oracleConf.encryptionKey;

    res.json({
      success: true,
      configured: hasPassword,
      encrypted: hasEncryptionKey,
      connectString: oracleConf.connectionString || 'database_low',
      user: oracleConf.user || ''
    });
  } catch (error) {
    console.error('Error reading Oracle config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/config/storage/oracle
 * Oracle 스토리지 설정 저장
 */
router.put('/storage/oracle', async (req, res) => {
  try {
    const { enabled, connectString, walletDir } = req.body;

    const oracleConfig = {
      enabled: !!enabled,
      connectString: connectString || 'database_low',
      walletDir: walletDir || './config/oracle'
    };

    await configManager.setConfigValue('oracle_storage', oracleConfig, 'Oracle storage configuration');

    res.json({ success: true, ...oracleConfig });
  } catch (error) {
    console.error('Error saving Oracle config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/storage/oracle/credentials
 * Oracle 비밀번호/암호화키 저장 (암호화)
 */
router.post('/storage/oracle/credentials', async (req, res) => {
  try {
    const { password, encryptionKey, user, connectionString } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, error: 'password is required' });
    }

    const localConfig = require('../utils/local-config');
    const storageConf = localConfig.readStorageConfigSync();

    storageConf.memory.oracle = {
      ...storageConf.memory.oracle,
      password,
      ...(encryptionKey ? { encryptionKey } : {}),
      ...(user ? { user } : {}),
      ...(connectionString ? { connectionString } : {})
    };

    await localConfig.writeStorageConfig(storageConf);

    res.json({
      success: true,
      message: 'Credentials saved (encrypted)',
      hasEncryptionKey: !!encryptionKey
    });
  } catch (error) {
    console.error('Error saving Oracle credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/config/storage/oracle/credentials
 * Oracle 비밀번호 삭제
 */
router.delete('/storage/oracle/credentials', async (req, res) => {
  try {
    const localConfig = require('../utils/local-config');
    const storageConf = localConfig.readStorageConfigSync();

    if (storageConf.memory?.oracle) {
      delete storageConf.memory.oracle.password;
      delete storageConf.memory.oracle.encryptionKey;
    }

    await localConfig.writeStorageConfig(storageConf);
    res.json({ success: true, message: 'Credentials deleted' });
  } catch (error) {
    console.error('Error deleting Oracle credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/storage/oracle/test
 * Oracle 연결 테스트
 */
router.post('/storage/oracle/test', async (req, res) => {
  try {
    const { OracleStorage } = require('../utils/oracle-storage');
    const localConfig = require('../utils/local-config');
    const storageConf = localConfig.readStorageConfigSync();
    const oracleConf = storageConf.memory?.oracle || {};
    const { user, password, connectionString, connectString } = req.body;

    const storage = new OracleStorage({
      user: user || oracleConf.user || 'ADMIN',
      connectString: connectString || connectionString || oracleConf.connectionString || 'database_low',
      password: password || oracleConf.password
    });

    await storage.initialize();
    const testResult = await storage.testConnection();
    await storage.close();

    res.json({
      success: testResult,
      message: testResult ? 'Oracle 연결 성공!' : 'Oracle 연결 실패'
    });
  } catch (error) {
    console.error('Error testing Oracle connection:', error);
    res.status(500).json({
      success: false,
      message: 'Oracle 연결 실패',
      error: error.message
    });
  }
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

// ============================================================
// Web Search 설정
// ============================================================

/**
 * GET /api/config/web-search
 * 웹검색 설정 조회
 */
router.get('/web-search', async (req, res) => {
  try {
    const config = await configManager.getConfigValue('web_search', {
      enabled: false,
      apiKey: null
    });
    res.json({
      success: true,
      enabled: config.enabled || false,
      configured: !!config.apiKey
    });
  } catch (error) {
    console.error('Error reading web search config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/web-search
 * 웹검색 API 키 저장
 */
router.post('/web-search', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'apiKey is required'
      });
    }

    const currentConfig = await configManager.getConfigValue('web_search', {});
    const updatedConfig = {
      ...currentConfig,
      apiKey,
      enabled: true,
      updatedAt: new Date()
    };

    await configManager.setConfigValue('web_search', updatedConfig, 'Web search configuration');

    res.json({
      success: true,
      message: 'Web search API key saved',
      configured: true
    });
  } catch (error) {
    console.error('Error saving web search API key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/config/web-search
 * 웹검색 API 키 삭제
 */
router.delete('/web-search', async (req, res) => {
  try {
    await configManager.setConfigValue('web_search', {
      enabled: false,
      apiKey: null
    }, 'Web search configuration');

    res.json({
      success: true,
      message: 'Web search API key deleted'
    });
  } catch (error) {
    console.error('Error deleting web search API key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/web-search/toggle
 * 웹검색 활성화/비활성화
 */
router.post('/web-search/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const currentConfig = await configManager.getConfigValue('web_search', {});

    if (!currentConfig.apiKey && enabled) {
      return res.status(400).json({
        success: false,
        error: 'API key not configured'
      });
    }

    const updatedConfig = {
      ...currentConfig,
      enabled: !!enabled
    };

    await configManager.setConfigValue('web_search', updatedConfig, 'Web search configuration');

    res.json({
      success: true,
      enabled: updatedConfig.enabled
    });
  } catch (error) {
    console.error('Error toggling web search:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 날씨 API 설정
// ============================================================

/**
 * GET /api/config/weather
 * 날씨 API 설정 조회
 */
router.get('/weather', async (req, res) => {
  try {
    const config = await configManager.getConfigValue('weather_api', {});
    res.json({
      success: true,
      configured: !!config.apiKey
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/weather
 * 날씨 API 키 저장 (공공데이터포털 기상청 서비스키)
 */
router.post('/weather', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, error: 'apiKey is required' });

    await configManager.setConfigValue('weather_api', {
      apiKey,
      updatedAt: new Date()
    }, 'Weather API configuration');

    res.json({ success: true, configured: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/config/weather
 * 날씨 API 키 삭제
 */
router.delete('/weather', async (req, res) => {
  try {
    await configManager.setConfigValue('weather_api', {}, 'Weather API configuration');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// Google Drive 설정
// ============================================================

/**
 * GET /api/config/gdrive
 * Google Drive 연결 상태 조회
 */
router.get('/gdrive', async (req, res) => {
  try {
    const config = await configManager.getConfigValue('gdrive', {});
    const configured = !!(config.keyFile && config.folderId);
    res.json({
      success: true,
      configured,
      folderId: config.folderId || '',
      keyFileSet: !!config.keyFile,
      connectedAt: config.connectedAt || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/gdrive
 * Google Drive 연결 설정 저장 + 연결 테스트
 */
router.post('/gdrive', async (req, res) => {
  try {
    const { folderId, serviceAccountKey } = req.body;

    if (!folderId) {
      return res.status(400).json({ success: false, error: 'folderId is required' });
    }
    if (!serviceAccountKey) {
      return res.status(400).json({ success: false, error: 'serviceAccountKey is required' });
    }

    // JSON 파싱 검증
    let keyData;
    try {
      keyData = typeof serviceAccountKey === 'string' ? JSON.parse(serviceAccountKey) : serviceAccountKey;
    } catch (e) {
      return res.status(400).json({ success: false, error: '서비스 계정 키가 유효한 JSON이 아닙니다' });
    }

    if (!keyData.client_email || !keyData.private_key) {
      return res.status(400).json({ success: false, error: '서비스 계정 키에 client_email 또는 private_key가 없습니다' });
    }

    // DB에 저장 (키 파일 내용을 직접 저장)
    const gdriveConfig = {
      folderId,
      keyFile: keyData,
      connectedAt: new Date().toISOString()
    };

    // 연결 테스트
    const { resetGDriveStorage, getGDriveStorage } = require('../utils/gdrive-storage');
    resetGDriveStorage();

    try {
      const gdrive = getGDriveStorage({
        keyData: keyData,
        folderId: folderId
      });
      if (gdrive) {
        await gdrive.testConnection();
      }
    } catch (testErr) {
      return res.status(400).json({
        success: false,
        error: `연결 테스트 실패: ${testErr.message}`
      });
    }

    await configManager.setConfigValue('gdrive', gdriveConfig, 'Google Drive configuration');

    res.json({
      success: true,
      message: 'Google Drive 연결 완료',
      configured: true,
      clientEmail: keyData.client_email
    });
  } catch (error) {
    console.error('Error saving GDrive config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/config/gdrive
 * Google Drive 연결 해제
 */
router.delete('/gdrive', async (req, res) => {
  try {
    const { resetGDriveStorage } = require('../utils/gdrive-storage');
    resetGDriveStorage();
    await configManager.setConfigValue('gdrive', {}, 'Google Drive configuration');
    res.json({ success: true, message: 'Google Drive 연결 해제됨' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// DDNS 설정
// ============================================================

/**
 * GET /api/config/ddns
 * DDNS 설정 + 공인 IP 조회
 */
router.get('/ddns', async (req, res) => {
  try {
    const ddns = require('../utils/ddns-service');
    const config = await ddns.getConfig();
    const publicIP = await ddns.getPublicIP();
    res.json({ config: config || { enabled: false, provider: '' }, publicIP });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/config/ddns
 * DDNS 설정 저장 + 즉시 테스트
 */
router.put('/ddns', async (req, res) => {
  try {
    const ddns = require('../utils/ddns-service');
    const config = req.body;

    // 저장
    await ddns.saveConfig(config);

    // 활성화 시 즉시 테스트
    if (config.enabled) {
      try {
        const result = await ddns.update(config);
        // 자동 갱신 재시작
        await ddns.startAutoUpdate();
        res.json({ success: true, result });
      } catch (err) {
        // 설정은 저장되지만 업데이트 실패
        res.json({ success: false, error: err.message });
      }
    } else {
      ddns.stop();
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
