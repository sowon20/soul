/**
 * Role Model
 * 동적 역할 관리 시스템
 *
 * Soul의 알바들 - 고용, 수정, 퇴사 가능
 */

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  // 기본 정보
  roleId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },

  // AI 설정
  preferredModel: {
    type: String,
    required: true,
    default: 'claude-sonnet-4-5-20250929'
  },
  fallbackModel: {
    type: String,
    default: 'claude-haiku-4-5-20251001'
  },
  systemPrompt: {
    type: String,
    required: true
  },
  maxTokens: {
    type: Number,
    default: 4096
  },
  temperature: {
    type: Number,
    default: 0.7,
    min: 0,
    max: 2
  },

  // 트리거 (학습 가능)
  triggers: [{
    type: String
  }],

  // 성과 추적
  stats: {
    usageCount: {
      type: Number,
      default: 0
    },
    successCount: {
      type: Number,
      default: 0
    },
    failureCount: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    },
    totalTokensUsed: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    }
  },

  // 메타데이터
  createdBy: {
    type: String,
    enum: ['system', 'user', 'auto'], // system: 기본, user: 사용자 생성, auto: AI 자동 생성
    default: 'system'
  },
  active: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['content', 'code', 'data', 'creative', 'technical', 'other', 'background'],
    default: 'other'
  },
  
  // 백그라운드 워커 전용 설정
  backgroundTasks: {
    tagGeneration: { type: Boolean, default: false },      // 태그 생성
    memoGeneration: { type: Boolean, default: false },     // 내면 메모 생성
    compression: { type: Boolean, default: false },        // 대화 압축
    weeklySummary: { type: Boolean, default: false }       // 주간 요약
  },
  
  tags: [{
    type: String
  }],

  // 작동 방식 설정
  mode: {
    type: String,
    enum: ['single', 'chain', 'parallel'],
    default: 'single'
  },

  // 체인 모드 설정 (순차 실행할 다른 알바들의 roleId)
  chainSteps: [{
    type: String
  }],

  // 병렬 모드 설정 (동시 실행할 다른 알바들의 roleId)
  parallelRoles: [{
    type: String
  }]
}, {
  timestamps: true
});

// 인덱스
roleSchema.index({ active: 1, category: 1 });
roleSchema.index({ 'stats.usageCount': -1 });
roleSchema.index({ 'stats.lastUsed': -1 });

// 메서드: 성과 기록
roleSchema.methods.recordUsage = async function(success = true, tokensUsed = 0, responseTime = 0) {
  this.stats.usageCount += 1;

  if (success) {
    this.stats.successCount += 1;
  } else {
    this.stats.failureCount += 1;
  }

  if (tokensUsed > 0) {
    this.stats.totalTokensUsed += tokensUsed;
  }

  // 평균 응답 시간 계산
  if (responseTime > 0) {
    const totalResponseTime = this.stats.averageResponseTime * (this.stats.usageCount - 1) + responseTime;
    this.stats.averageResponseTime = totalResponseTime / this.stats.usageCount;
  }

  this.stats.lastUsed = new Date();

  await this.save();
};

// 메서드: 성공률 계산
roleSchema.methods.getSuccessRate = function() {
  if (this.stats.usageCount === 0) return 0;
  return (this.stats.successCount / this.stats.usageCount) * 100;
};

// 메서드: 트리거 추가 (학습)
roleSchema.methods.addTrigger = async function(trigger) {
  if (!this.triggers.includes(trigger)) {
    this.triggers.push(trigger);
    await this.save();
  }
};

// 스태틱 메서드: 활성 역할 목록
roleSchema.statics.getActiveRoles = async function() {
  return this.find({ active: true }).sort({ 'stats.usageCount': -1 });
};

// 스태틱 메서드: 역할 검색 (트리거 키워드)
roleSchema.statics.findByTriggers = async function(message) {
  const lowerMessage = message.toLowerCase();

  return this.find({
    active: true,
    triggers: {
      $elemMatch: {
        $regex: new RegExp(lowerMessage.split(' ').join('|'), 'i')
      }
    }
  }).sort({ 'stats.successCount': -1 });
};

// 스태틱 메서드: 기본 역할 초기화
roleSchema.statics.initializeDefaultRoles = async function() {
  const defaultRoles = [
    {
      roleId: 'summarizer',
      name: '문서 요약',
      description: '긴 문서를 간결하게 요약',
      preferredModel: 'claude-sonnet-4-5-20250929',
      fallbackModel: 'claude-haiku-4-5-20251001',
      systemPrompt: `당신은 문서 요약 전문가입니다.
주어진 텍스트를 간결하고 핵심만 담아 요약하세요.
- 핵심 포인트 3-5개로 정리
- 불필요한 세부사항 제거
- 명확하고 이해하기 쉽게`,
      maxTokens: 1000,
      temperature: 0.3,
      triggers: ['요약', 'summarize', '정리', '핵심', '간단히'],
      category: 'content',
      createdBy: 'system'
    },
    {
      roleId: 'coder',
      name: '코드 생성',
      description: '고품질 코드 작성 및 리팩토링',
      preferredModel: 'claude-sonnet-4-5-20250929',
      fallbackModel: 'claude-haiku-4-5-20251001',
      systemPrompt: `당신은 시니어 개발자입니다.
고품질의 프로덕션 레벨 코드를 작성하세요.
- 클린 코드 원칙 준수
- 적절한 에러 핸들링
- 명확한 변수/함수명
- 필요시 주석 추가 (영어)`,
      maxTokens: 4096,
      temperature: 0.7,
      triggers: ['코드', 'code', '함수', '구현', 'implement', '작성'],
      category: 'code',
      createdBy: 'system'
    },
    {
      roleId: 'analyzer',
      name: '데이터 분석',
      description: '데이터 분석 및 인사이트 도출',
      preferredModel: 'claude-sonnet-4-5-20250929',
      fallbackModel: 'claude-haiku-4-5-20251001',
      systemPrompt: `당신은 데이터 분석 전문가입니다.
데이터를 깊이 분석하고 의미있는 인사이트를 제공하세요.
- 패턴 발견
- 트렌드 파악
- 실행 가능한 제안`,
      maxTokens: 2048,
      temperature: 0.5,
      triggers: ['분석', 'analyze', '데이터', '통계', '인사이트'],
      category: 'data',
      createdBy: 'system'
    },
    {
      roleId: 'researcher',
      name: '심층 리서치',
      description: '깊이 있는 조사 및 분석',
      preferredModel: 'claude-sonnet-4-5-20250929',
      fallbackModel: 'claude-haiku-4-5-20251001',
      systemPrompt: `당신은 리서치 전문가입니다.
주제를 깊이 있게 조사하고 다각도로 분석하세요.
- 다양한 관점 고려
- 근거 기반 분석
- 상세한 설명`,
      maxTokens: 8192,
      temperature: 0.6,
      triggers: ['조사', 'research', '리서치', '알아봐', '찾아봐'],
      category: 'technical',
      createdBy: 'system'
    },
    {
      roleId: 'translator',
      name: '번역',
      description: '다국어 번역',
      preferredModel: 'claude-sonnet-4-5-20250929',
      fallbackModel: 'claude-haiku-4-5-20251001',
      systemPrompt: `당신은 전문 번역가입니다.
정확하고 자연스러운 번역을 제공하세요.
- 문맥 고려
- 자연스러운 표현
- 문화적 뉘앙스 반영`,
      maxTokens: 2000,
      temperature: 0.3,
      triggers: ['번역', 'translate', '영어로', '한국어로', '일본어로'],
      category: 'content',
      createdBy: 'system'
    },
    {
      roleId: 'reviewer',
      name: '코드 리뷰',
      description: '코드 품질 검토',
      preferredModel: 'claude-sonnet-4-5-20250929',
      fallbackModel: 'claude-haiku-4-5-20251001',
      systemPrompt: `당신은 코드 리뷰어입니다.
코드를 꼼꼼히 검토하고 개선점을 제안하세요.
- 버그 찾기
- 성능 이슈
- 보안 취약점
- 개선 제안`,
      maxTokens: 3000,
      temperature: 0.4,
      triggers: ['리뷰', 'review', '검토', '문제점', '개선'],
      category: 'code',
      createdBy: 'system'
    }
  ];

  for (const roleData of defaultRoles) {
    const existing = await this.findOne({ roleId: roleData.roleId });
    if (!existing) {
      await this.create(roleData);
      console.log(`✅ 기본 역할 생성: ${roleData.name}`);
    }
  }
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
