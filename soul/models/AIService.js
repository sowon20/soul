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
      isActive: 0,  // API 키 설정 전까지 비활성
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
      isActive: 0,  // 서버 연결 확인 전까지 비활성
      config: { isLocal: true }
    },
    {
      serviceId: 'huggingface',
      name: 'HuggingFace',
      baseUrl: 'https://router.huggingface.co/v1',
      models: [
        { id: 'openai/gpt-oss-20b', name: 'GPT-OSS-20B', contextWindow: 32000 },
        { id: 'openai/gpt-oss-120b', name: 'GPT-OSS-120B', contextWindow: 32000 },
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', contextWindow: 128000 },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', contextWindow: 128000 }
      ],
      isActive: 0,
      config: {}
    },
    {
      serviceId: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [
        { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B (Free)', contextWindow: 131072 },
        { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (Free)', contextWindow: 131072 },
        { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini Flash 2.0 (Free)', contextWindow: 1000000 },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', contextWindow: 131072 }
      ],
      isActive: 0,
      config: {}
    },
    {
      serviceId: 'fireworks',
      name: 'Fireworks AI',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      models: [
        { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B Instruct', contextWindow: 131072 },
        { id: 'accounts/fireworks/models/llama-v3p1-405b-instruct', name: 'Llama 3.1 405B Instruct', contextWindow: 131072 },
        { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', name: 'Qwen 2.5 72B Instruct', contextWindow: 131072 },
        { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3', contextWindow: 65536 }
      ],
      isActive: 0,
      config: {}
    },
    {
      serviceId: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3', contextWindow: 65536 },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextWindow: 65536 }
      ],
      isActive: 0,
      config: {}
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
