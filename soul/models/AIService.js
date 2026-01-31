/**
 * AIService Model
 * AI 서비스 설정 (SQLite)
 */

const { AIService } = require('../db/models');

// 기본 AI 서비스 초기화
async function initializeBuiltinServices() {
  const db = require('../db');
  if (!db.db) db.init();

  const builtinServices = [
    {
      serviceId: 'anthropic',
      name: 'Anthropic Claude',
      baseUrl: 'https://api.anthropic.com/v1',
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000 },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', contextWindow: 200000 },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000 }
      ],
      isActive: 1,
      config: { supportsThinking: true }
    },
    {
      serviceId: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
        { id: 'o1', name: 'o1', contextWindow: 200000 },
        { id: 'o1-mini', name: 'o1 Mini', contextWindow: 128000 }
      ],
      isActive: 0,
      config: {}
    },
    {
      serviceId: 'google',
      name: 'Google AI',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      models: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000 },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000 },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000 }
      ],
      isActive: 0,
      config: {}
    },
    {
      serviceId: 'xai',
      name: 'xAI Grok',
      baseUrl: 'https://api.x.ai/v1',
      models: [
        { id: 'grok-beta', name: 'Grok Beta', contextWindow: 131072 }
      ],
      isActive: 0,
      config: {}
    },
    {
      serviceId: 'ollama',
      name: 'Ollama (Local)',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      models: [],
      isActive: 1,
      config: { isLocal: true }
    }
  ];

  for (const service of builtinServices) {
    const existing = db.AIService.findOne({ serviceId: service.serviceId });
    if (!existing) {
      db.AIService.create(service);
      console.log(`[AIService] Created: ${service.name}`);
    }
  }
}

// 모듈에 초기화 함수 추가
AIService.initializeBuiltinServices = initializeBuiltinServices;

module.exports = AIService;
