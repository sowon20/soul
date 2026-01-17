const fs = require('fs').promises;
const path = require('path');

/**
 * 설정 파일 관리 클래스
 * 사용자 설정을 JSON 파일로 저장/로드
 */
class ConfigManager {
  constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'settings.json');
    this.defaultConfig = {
      ai: {
        defaultService: process.env.DEFAULT_AI_SERVICE || 'anthropic',
        defaultModel: process.env.DEFAULT_AI_MODEL || 'claude-3-haiku-20240307',
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
        storagePath: process.env.MEMORY_PATH || './memory',
        autoArchive: true
      },
      files: {
        storagePath: process.env.FILES_PATH || './files'
      }
    };
  }

  /**
   * 설정 파일 읽기
   */
  async readConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // 파일이 없으면 기본 설정 반환
      if (error.code === 'ENOENT') {
        return this.defaultConfig;
      }
      throw error;
    }
  }

  /**
   * 설정 파일 쓰기
   */
  async writeConfig(config) {
    const configDir = path.dirname(this.configPath);

    // config 디렉토리 생성
    try {
      await fs.access(configDir);
    } catch {
      await fs.mkdir(configDir, { recursive: true });
    }

    await fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    return config;
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
}

// Singleton 인스턴스
const configManager = new ConfigManager();

module.exports = configManager;
