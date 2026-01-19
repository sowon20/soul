/**
 * AIService Model
 * 사용자 정의 AI 서비스 관리
 * - 기본 서비스 외 커스텀 서비스 추가 가능
 * - OpenAI 호환 API 지원
 */

const mongoose = require('mongoose');

const aiServiceSchema = new mongoose.Schema({
  // 고유 식별자 (예: 'custom-openai', 'office-ollama')
  serviceId: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  // 표시명 (UI에 보이는 이름)
  name: {
    type: String,
    required: true,
    trim: true
  },

  // 서비스 타입
  type: {
    type: String,
    required: true,
    enum: ['openai', 'anthropic', 'google', 'ollama', 'openai-compatible'],
    default: 'openai-compatible'
  },

  // API Base URL
  baseUrl: {
    type: String,
    required: true,
    trim: true
  },

  // API Key 참조 (APIKey 컬렉션의 service 값)
  // null이면 API 키 불필요 (Ollama 등)
  apiKeyRef: {
    type: String,
    default: null
  },

  // 활성/비활성
  isActive: {
    type: Boolean,
    default: true
  },

  // 사용 가능한 모델 목록 (캐시)
  models: [{
    id: String,
    name: String,
    description: String
  }],

  // 마지막 모델 목록 갱신 시간
  lastRefresh: {
    type: Date,
    default: null
  },

  // 기본 제공 서비스 여부 (삭제 불가)
  isBuiltIn: {
    type: Boolean,
    default: false
  },

  // 추가 설정 (서비스별 커스텀 옵션)
  config: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // 생성/수정 시간
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

/**
 * 기본 서비스 초기화
 */
aiServiceSchema.statics.initializeBuiltInServices = async function() {
  const builtInServices = [
    {
      serviceId: 'anthropic',
      name: 'Anthropic Claude',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKeyRef: 'anthropic',
      isBuiltIn: true,
      isActive: true
    },
    {
      serviceId: 'openai',
      name: 'OpenAI GPT',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyRef: 'openai',
      isBuiltIn: true,
      isActive: true
    },
    {
      serviceId: 'google',
      name: 'Google Gemini',
      type: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKeyRef: 'google',
      isBuiltIn: true,
      isActive: true
    },
    {
      serviceId: 'xai',
      name: 'xAI Grok',
      type: 'openai-compatible',
      baseUrl: 'https://api.x.ai/v1',
      apiKeyRef: 'xai',
      isBuiltIn: true,
      isActive: true
    },
    {
      serviceId: 'ollama',
      name: 'Ollama (Local)',
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      apiKeyRef: null,
      isBuiltIn: true,
      isActive: true
    }
  ];

  for (const service of builtInServices) {
    // 이미 존재하면 건드리지 않음 (사용자 설정 보존)
    const existing = await this.findOne({ serviceId: service.serviceId });
    if (!existing) {
      await this.create(service);
    }
  }

  console.log('✅ Built-in AI services initialized');
};

/**
 * 활성화된 서비스 목록 조회
 */
aiServiceSchema.statics.getActiveServices = async function() {
  return await this.find({ isActive: true }).sort({ isBuiltIn: -1, name: 1 });
};

/**
 * 모델 목록 업데이트
 */
aiServiceSchema.methods.updateModels = async function(models) {
  this.models = models;
  this.lastRefresh = new Date();
  await this.save();
};

/**
 * 서비스 활성화/비활성화
 */
aiServiceSchema.methods.toggleActive = async function() {
  this.isActive = !this.isActive;
  await this.save();
  return this.isActive;
};

module.exports = mongoose.model('AIService', aiServiceSchema);
