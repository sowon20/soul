const SystemConfig = require('../models/SystemConfig');

/**
 * 설정 관리 클래스
 * 시스템 설정을 MongoDB에 저장/로드
 */
class ConfigManager {
  constructor() {
    this.defaultConfig = {
      ai: {
        defaultService: process.env.DEFAULT_AI_SERVICE || 'anthropic',
        defaultModel: process.env.DEFAULT_AI_MODEL || 'claude-haiku-4-5-20251001',
        services: {
          anthropic: {
            enabled: !!process.env.ANTHROPIC_API_KEY,
            apiKey: process.env.ANTHROPIC_API_KEY || null
          },
          openai: {
            enabled: !!process.env.OPENAI_API_KEY,
            apiKey: process.env.OPENAI_API_KEY || null
          },
          google: {
            enabled: !!process.env.GOOGLE_API_KEY,
            apiKey: process.env.GOOGLE_API_KEY || null
          },
          ollama: {
            enabled: true,
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
          }
        }
      },
      memory: {
        storagePath: process.env.MEMORY_PATH || null, // 필수 설정 - UI에서 설정해야 함
        autoArchive: true,
        autoSave: true,
        autoInject: true,
        shortTermSize: 50,
        compressionThreshold: 80
      },
      files: {
        storagePath: process.env.FILES_PATH || null // 필수 설정 - UI에서 설정해야 함
      },
      routing: {
        enabled: true,
        light: 'auto',
        medium: 'auto',
        heavy: 'auto'
      },
      toolSearch: {
        enabled: false, // Tool Search Tool 활성화 (도구 10개+ 시 유용)
        type: 'regex', // 'regex' | 'bm25'
        alwaysLoad: [] // 항상 로드할 도구 이름 배열
      },
      storage: {
        type: 'local', // 'local' | 'ftp' | 'oracle' | 'notion'
        path: process.env.SOUL_STORAGE_PATH || '~/.soul',
        ftp: null,
        oracle: null,
        notion: null
      }
    };
  }

  /**
   * DB에서 설정 값 가져오기
   */
  async getConfigValue(key, defaultValue = null) {
    try {
      const config = await SystemConfig.findOne({ configKey: key });
      return config ? config.value : defaultValue;
    } catch (error) {
      console.error(`Failed to get config ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * DB에 설정 값 저장
   */
  async setConfigValue(key, value, description = '') {
    try {
      const config = await SystemConfig.findOneAndUpdate(
        { configKey: key },
        { value, description, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return config.value;
    } catch (error) {
      console.error(`Failed to set config ${key}:`, error);
      throw error;
    }
  }

  /**
   * 전체 설정 읽기 (호환성 유지)
   */
  async readConfig() {
    try {
      const ai = await this.getConfigValue('ai', this.defaultConfig.ai);
      const memory = await this.getConfigValue('memory', this.defaultConfig.memory);
      const files = await this.getConfigValue('files', this.defaultConfig.files);
      const routing = await this.getConfigValue('routing', this.defaultConfig.routing);
      const toolSearch = await this.getConfigValue('toolSearch', this.defaultConfig.toolSearch);
      const storage = await this.getConfigValue('storage', this.defaultConfig.storage);

      return { ai, memory, files, routing, toolSearch, storage };
    } catch (error) {
      console.error('Failed to read config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * 전체 설정 쓰기 (호환성 유지)
   */
  async writeConfig(config) {
    try {
      if (config.ai) await this.setConfigValue('ai', config.ai, 'AI service configuration');
      if (config.memory) await this.setConfigValue('memory', config.memory, 'Memory storage configuration');
      if (config.files) await this.setConfigValue('files', config.files, 'File storage configuration');
      if (config.routing) await this.setConfigValue('routing', config.routing, 'Smart routing configuration');
      if (config.toolSearch) await this.setConfigValue('toolSearch', config.toolSearch, 'Tool Search configuration');
      if (config.storage) await this.setConfigValue('storage', config.storage, 'Unified storage configuration');

      return config;
    } catch (error) {
      console.error('Failed to write config:', error);
      throw error;
    }
  }

  /**
   * AI 모델 설정 가져오기
   */
  async getAIConfig() {
    const config = await this.readConfig();
    return config.ai || this.defaultConfig.ai;
  }

  /**
   * AI 모델 설정 업데이트
   */
  async updateAIConfig(aiConfig) {
    const config = await this.readConfig();
    config.ai = {
      ...config.ai,
      ...aiConfig
    };
    await this.writeConfig(config);
    return config.ai;
  }

  /**
   * 기본 AI 서비스 변경
   */
  async setDefaultAI(service, model) {
    const config = await this.readConfig();
    config.ai.defaultService = service;
    config.ai.defaultModel = model;
    await this.writeConfig(config);
    return config.ai;
  }

  /**
   * AI 서비스 활성화/비활성화
   */
  async toggleAIService(serviceName, enabled) {
    const config = await this.readConfig();
    if (config.ai.services[serviceName]) {
      config.ai.services[serviceName].enabled = enabled;
      await this.writeConfig(config);
    }
    return config.ai;
  }

  /**
   * 메모리 설정 가져오기
   */
  async getMemoryConfig() {
    const config = await this.readConfig();
    return config.memory || this.defaultConfig.memory;
  }

  /**
   * 메모리 설정 업데이트
   */
  async updateMemoryConfig(memoryConfig) {
    const config = await this.readConfig();
    config.memory = {
      ...config.memory,
      ...memoryConfig
    };
    await this.writeConfig(config);
    return config.memory;
  }

  /**
   * 메모리 저장 경로 변경
   */
  async setMemoryPath(storagePath) {
    const config = await this.readConfig();
    if (!config.memory) {
      config.memory = { ...this.defaultConfig.memory };
    }
    config.memory.storagePath = storagePath;
    await this.writeConfig(config);
    return config.memory;
  }

  /**
   * 파일 설정 가져오기
   */
  async getFilesConfig() {
    const config = await this.readConfig();
    return config.files || this.defaultConfig.files;
  }

  /**
   * 파일 설정 업데이트
   */
  async updateFilesConfig(filesConfig) {
    const config = await this.readConfig();
    config.files = {
      ...config.files,
      ...filesConfig
    };
    await this.writeConfig(config);
    return config.files;
  }

  /**
   * 통합 저장소 설정 가져오기
   */
  async getStorageConfig() {
    const config = await this.readConfig();
    // 통합 저장소 설정이 없으면 기존 memory 설정에서 마이그레이션
    if (!config.storage) {
      return {
        type: config.memory?.storageType || 'local',
        path: config.memory?.storagePath || '~/.soul',
        ftp: config.memory?.ftp || null,
        oracle: config.memory?.oracle || null,
        notion: null
      };
    }
    return config.storage;
  }

  /**
   * 통합 저장소 설정 업데이트
   */
  async updateStorageConfig(storageConfig) {
    const config = await this.readConfig();
    config.storage = {
      type: storageConfig.type || 'local',
      path: storageConfig.path || '~/.soul',
      ftp: storageConfig.ftp || null,
      oracle: storageConfig.oracle || null,
      notion: storageConfig.notion || null
    };

    // 하위 호환성: memory/files에도 반영
    const storagePath = config.storage.type === 'local' ? config.storage.path : null;
    if (!config.memory) config.memory = { ...this.defaultConfig.memory };
    if (!config.files) config.files = { ...this.defaultConfig.files };

    config.memory.storageType = config.storage.type;
    config.memory.storagePath = storagePath || config.memory.storagePath;
    config.memory.ftp = config.storage.ftp;
    config.files.storageType = config.storage.type;
    config.files.storagePath = storagePath || config.files.storagePath;
    config.files.ftp = config.storage.ftp;

    await this.writeConfig(config);
    return config.storage;
  }

  /**
   * 라우팅 설정 가져오기
   */
  async getRoutingConfig() {
    const config = await this.readConfig();
    return config.routing || this.defaultConfig.routing;
  }

  /**
   * 라우팅 설정 업데이트
   */
  async updateRoutingConfig(routingConfig) {
    const config = await this.readConfig();
    config.routing = {
      ...config.routing,
      ...routingConfig
    };
    await this.writeConfig(config);
    return config.routing;
  }
}

// Singleton 인스턴스
const configManager = new ConfigManager();

module.exports = configManager;
