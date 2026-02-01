/**
 * smart-router.js
 * AI 모델 스마트 라우팅 시스템
 *
 * Phase 8: 스마트 라우팅
 *
 * 기능:
 * - 태스크 복잡도 분석
 * - 자동 모델 선택 (경량/중간/고성능)
 * - 비용 최적화
 * - 성능 모니터링
 */

const { estimateTokens } = require('./token-counter');

/**
 * 티어별 모델 설정 (UI에서 설정 필수 - 하드코딩 없음)
 */
const TIERS = {
  LIGHT: {
    id: null,  // UI에서 설정 필수
    name: '경량 모델',
    tier: 'fast',
    costPerMToken: 0.25,
    costPerMTokenOutput: 1.25,
    strengths: ['speed', 'simple_tasks', 'cost_effective'],
    maxTokens: 200000,
    description: '빠르고 효율적인 응답, 간단한 작업에 최적'
  },
  MEDIUM: {
    id: null,  // UI에서 설정 필수
    name: '중간 모델',
    tier: 'balanced',
    costPerMToken: 3.0,
    costPerMTokenOutput: 15.0,
    strengths: ['balanced', 'reasoning', 'coding', 'analysis'],
    maxTokens: 200000,
    description: '균형잡힌 성능, 대부분의 작업에 최적'
  },
  HEAVY: {
    id: null,  // UI에서 설정 필수
    name: '고성능 모델',
    tier: 'premium',
    costPerMToken: 15.0,
    costPerMTokenOutput: 75.0,
    strengths: ['complex_reasoning', 'creativity', 'expert_level'],
    maxTokens: 200000,
    description: '최고 성능, 복잡하고 중요한 작업에 최적'
  }
};

/**
 * 태스크 유형
 */
const TASK_TYPES = {
  // 경량 티어 (간단한 작업)
  SIMPLE_QUESTION: { complexity: 1, requiresReasoning: false },
  TRANSLATION: { complexity: 1, requiresReasoning: false },
  SUMMARIZATION: { complexity: 2, requiresReasoning: false },
  FORMATTING: { complexity: 1, requiresReasoning: false },

  // 중간 티어 (일반 작업)
  CODE_GENERATION: { complexity: 5, requiresReasoning: true },
  CODE_REVIEW: { complexity: 4, requiresReasoning: true },
  DATA_ANALYSIS: { complexity: 5, requiresReasoning: true },
  PROBLEM_SOLVING: { complexity: 6, requiresReasoning: true },

  // 고성능 티어 (복잡한 작업)
  ARCHITECTURE_DESIGN: { complexity: 8, requiresReasoning: true },
  COMPLEX_DEBUGGING: { complexity: 7, requiresReasoning: true },
  RESEARCH: { complexity: 7, requiresReasoning: true },
  CREATIVE_WRITING: { complexity: 6, requiresReasoning: true },
  EXPERT_CONSULTATION: { complexity: 9, requiresReasoning: true }
};

/**
 * SmartRouter 클래스
 * 태스크 분석 후 최적 모델 선택
 */
class SmartRouter {
  constructor(config = {}) {
    this.config = {
      defaultModel: config.defaultModel || TIERS.MEDIUM.id,
      enableAutoRouting: config.enableAutoRouting !== false,
      costPriority: config.costPriority || 0.3, // 0 = performance, 1 = cost
      enableMonitoring: config.enableMonitoring !== false,
      forceModel: config.forceModel || null, // 강제 모델 지정
      mode: config.mode || 'auto', // 'single' 또는 'auto'
      singleModel: config.singleModel || null, // 단일 모델 설정 { modelId, serviceId, thinking }
      manager: config.manager || 'server', // 라우팅 담당: server, ai
      managerModel: config.managerModel || null // AI 라우팅 시 사용할 모델
    };

    this.stats = {
      totalRequests: 0,
      routingDecisions: {
        light: 0,
        medium: 0,
        heavy: 0
      },
      totalCost: 0,
      averageLatency: 0
    };
  }

  /**
   * 메인 라우팅 함수
   * 메시지와 컨텍스트를 분석하여 최적 모델 선택
   */
  async route(message, context = {}) {
    this.stats.totalRequests++;

    // 1. 강제 모델 지정 시
    if (this.config.forceModel) {
      // 강제 모델도 통계에 포함
      this._updateStatsByModelId(this.config.forceModel);
      return {
        modelId: this.config.forceModel,
        serviceId: this.config.forceServiceId || null,
        reason: 'Forced model selection',
        confidence: 1.0
      };
    }

    // 1.5. 단일 모델 모드
    if (this.config.mode === 'single' && this.config.singleModel) {
      this.stats.routingDecisions.medium++; // 단일 모델은 medium으로 통계 집계
      return {
        modelId: this.config.singleModel.modelId,
        serviceId: this.config.singleModel.serviceId || null,
        thinking: this.config.singleModel.thinking || false,
        modelName: 'Single Model',
        reason: 'Single model mode',
        confidence: 1.0
      };
    }

    // 2.5. AI 라우팅 모드 (현재는 서버 라우팅과 동일하게 동작)
    // TODO: 실제 AI 호출을 통한 라우팅 결정 구현 필요
    if (this.config.manager === 'ai' && this.config.managerModel) {
      console.log('[SmartRouter] AI routing mode with model:', this.config.managerModel);
      // 현재는 서버 휴리스틱과 동일하게 처리
      // 나중에 managerModel을 사용해서 AI에게 라우팅 결정을 요청하는 로직 추가 예정
    }

    // 3. 자동 라우팅 비활성화 시
    if (!this.config.enableAutoRouting) {
      // 기본 모델도 통계에 포함
      this._updateStatsByModelId(this.config.defaultModel);
      return {
        modelId: this.config.defaultModel,
        serviceId: this.config.defaultServiceId || null,
        reason: 'Auto-routing disabled',
        confidence: 1.0
      };
    }

    // 4. 태스크 분석 (server 또는 ai 담당)
    const analysis = this.analyzeTask(message, context);

    // 5. 모델 선택
    const selectedModel = this.selectModel(analysis);

    // 6. 통계 업데이트
    this._updateStats(selectedModel);

    return {
      modelId: selectedModel.id,
      serviceId: selectedModel.serviceId || null,
      thinking: selectedModel.thinking || false,
      modelName: selectedModel.name,
      reason: this._buildReason(analysis, selectedModel),
      confidence: analysis.confidence,
      analysis,
      estimatedCost: this._estimateCost(analysis, selectedModel),
      manager: this.config.manager  // 어떤 담당이 결정했는지 표시
    };
  }

  /**
   * 태스크 분석
   * 복잡도, 유형, 특성 분석
   */
  analyzeTask(message, context = {}) {
    const analysis = {
      complexity: 0,
      taskType: null,
      requiresReasoning: false,
      requiresCreativity: false,
      requiresExpertise: false,
      inputTokens: estimateTokens(message),
      contextTokens: context.historyTokens || 0,
      totalTokens: 0,
      confidence: 0.5,
      signals: []
    };

    analysis.totalTokens = analysis.inputTokens + analysis.contextTokens;

    // 1. 키워드 기반 태스크 유형 탐지
    const taskType = this._detectTaskType(message);
    if (taskType) {
      analysis.taskType = taskType.name;
      analysis.complexity += taskType.complexity;
      analysis.requiresReasoning = taskType.requiresReasoning;
      analysis.signals.push(`Detected task: ${taskType.name}`);
    }

    // 2. 복잡도 시그널 분석
    const complexitySignals = this._analyzeComplexitySignals(message, context);
    analysis.complexity += complexitySignals.score;
    analysis.signals.push(...complexitySignals.signals);

    // 3. 특수 요구사항 탐지
    const requirements = this._detectRequirements(message, context);
    analysis.requiresCreativity = requirements.creativity;
    analysis.requiresExpertise = requirements.expertise;
    analysis.signals.push(...requirements.signals);

    // 4. 신뢰도 계산
    analysis.confidence = this._calculateConfidence(analysis);

    return analysis;
  }

  /**
   * 모델 선택
   * 분석 결과 기반 최적 모델 선택
   */
  selectModel(analysis) {
    const { complexity, requiresExpertise, totalTokens } = analysis;

    // 1. 고성능: 복잡도 7+, 전문성 요구
    if (complexity >= 7 || requiresExpertise) {
      return TIERS.HEAVY;
    }

    // 2. 경량: 복잡도 3 이하, 간단한 작업
    if (complexity <= 3 && !analysis.requiresReasoning) {
      return TIERS.LIGHT;
    }

    // 3. 중간: 기본값, 대부분의 작업
    return TIERS.MEDIUM;
  }

  /**
   * 태스크 유형 탐지
   */
  _detectTaskType(message) {
    const text = message.toLowerCase();

    // Code-related
    if (/\b(코드|code|함수|function|클래스|class|구현|implement|refactor|리팩토링)\b/i.test(text)) {
      if (/\b(설계|architecture|design|시스템)\b/i.test(text)) {
        return { name: 'ARCHITECTURE_DESIGN', ...TASK_TYPES.ARCHITECTURE_DESIGN };
      }
      if (/\b(버그|bug|에러|error|디버그|debug)\b/i.test(text)) {
        return { name: 'COMPLEX_DEBUGGING', ...TASK_TYPES.COMPLEX_DEBUGGING };
      }
      if (/\b(리뷰|review|분석|analyze)\b/i.test(text)) {
        return { name: 'CODE_REVIEW', ...TASK_TYPES.CODE_REVIEW };
      }
      return { name: 'CODE_GENERATION', ...TASK_TYPES.CODE_GENERATION };
    }

    // Analysis
    if (/\b(분석|analyze|분석해|데이터|data)\b/i.test(text)) {
      return { name: 'DATA_ANALYSIS', ...TASK_TYPES.DATA_ANALYSIS };
    }

    // Research
    if (/\b(연구|research|조사|investigate|탐구)\b/i.test(text)) {
      return { name: 'RESEARCH', ...TASK_TYPES.RESEARCH };
    }

    // Creative
    if (/\b(작성|write|글|창작|creative|스토리|story)\b/i.test(text)) {
      return { name: 'CREATIVE_WRITING', ...TASK_TYPES.CREATIVE_WRITING };
    }

    // Simple tasks
    if (/\b(번역|translate|요약|summarize|정리)\b/i.test(text)) {
      if (/\b(요약|summarize)\b/i.test(text)) {
        return { name: 'SUMMARIZATION', ...TASK_TYPES.SUMMARIZATION };
      }
      return { name: 'TRANSLATION', ...TASK_TYPES.TRANSLATION };
    }

    // Questions
    if (/^(what|how|why|when|where|who|무엇|어떻게|왜|언제|어디|누가)\b/i.test(text)) {
      return { name: 'SIMPLE_QUESTION', ...TASK_TYPES.SIMPLE_QUESTION };
    }

    return null;
  }

  /**
   * 복잡도 시그널 분석
   */
  _analyzeComplexitySignals(message, context) {
    const signals = [];
    let score = 0;

    // 1. 메시지 길이
    const wordCount = message.split(/\s+/).length;
    if (wordCount > 200) {
      score += 2;
      signals.push('Long input (200+ words)');
    } else if (wordCount > 100) {
      score += 1;
      signals.push('Medium input (100+ words)');
    }

    // 2. 코드 블록 존재
    const codeBlocks = (message.match(/```/g) || []).length / 2;
    if (codeBlocks > 0) {
      score += codeBlocks;
      signals.push(`${codeBlocks} code block(s)`);
    }

    // 3. 다중 요구사항
    const requirements = (message.match(/\d+\./g) || []).length;
    if (requirements >= 3) {
      score += 2;
      signals.push(`${requirements} numbered requirements`);
    }

    // 4. 기술 키워드 밀도
    const techKeywords = [
      'algorithm', 'architecture', 'optimization', 'performance',
      'scalability', 'security', 'design pattern', 'database',
      '알고리즘', '아키텍처', '최적화', '성능', '확장성', '보안', '디자인패턴', '데이터베이스'
    ];
    const techCount = techKeywords.filter(kw =>
      message.toLowerCase().includes(kw.toLowerCase())
    ).length;
    if (techCount >= 3) {
      score += 2;
      signals.push(`${techCount} technical keywords`);
    }

    // 5. 컨텍스트 크기
    if (context.messageCount && context.messageCount > 20) {
      score += 1;
      signals.push('Long conversation history');
    }

    return { score, signals };
  }

  /**
   * 특수 요구사항 탐지
   */
  _detectRequirements(message, context) {
    const requirements = {
      creativity: false,
      expertise: false,
      signals: []
    };

    // Creativity
    const creativityKeywords = [
      'creative', 'innovative', 'unique', 'original', 'novel',
      '창의적', '혁신적', '독창적', '새로운'
    ];
    if (creativityKeywords.some(kw => message.toLowerCase().includes(kw.toLowerCase()))) {
      requirements.creativity = true;
      requirements.signals.push('Requires creativity');
    }

    // Expertise
    const expertiseKeywords = [
      'expert', 'advanced', 'complex', 'sophisticated', 'critical',
      '전문가', '고급', '복잡한', '정교한', '중요한'
    ];
    if (expertiseKeywords.some(kw => message.toLowerCase().includes(kw.toLowerCase()))) {
      requirements.expertise = true;
      requirements.signals.push('Requires expertise');
    }

    // Production/Critical
    if (/\b(production|critical|important|프로덕션|중요|핵심)\b/i.test(message)) {
      requirements.expertise = true;
      requirements.signals.push('Production/Critical task');
    }

    return requirements;
  }

  /**
   * 신뢰도 계산
   */
  _calculateConfidence(analysis) {
    let confidence = 0.5; // Base

    // Task type detected
    if (analysis.taskType) {
      confidence += 0.2;
    }

    // Multiple signals
    if (analysis.signals.length >= 3) {
      confidence += 0.2;
    }

    // Clear complexity
    if (analysis.complexity >= 7 || analysis.complexity <= 2) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 이유 생성
   */
  _buildReason(analysis, model) {
    const reasons = [];

    if (analysis.taskType) {
      reasons.push(`Task type: ${analysis.taskType}`);
    }

    reasons.push(`Complexity: ${analysis.complexity}/10`);

    if (analysis.requiresExpertise) {
      reasons.push('Requires expertise');
    }

    if (analysis.requiresCreativity) {
      reasons.push('Requires creativity');
    }

    reasons.push(`Selected: ${model.name} (${model.tier})`);

    return reasons.join(' | ');
  }

  /**
   * 비용 추정
   */
  _estimateCost(analysis, model) {
    // 예상 출력 토큰 (입력의 2배로 가정)
    const estimatedOutputTokens = analysis.inputTokens * 2;

    const inputCost = (analysis.totalTokens / 1000000) * model.costPerMToken;
    const outputCost = (estimatedOutputTokens / 1000000) * model.costPerMTokenOutput;

    return {
      inputTokens: analysis.totalTokens,
      estimatedOutputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD'
    };
  }

  /**
   * 통계 업데이트
   */
  _updateStats(model) {
    if (model.tier === 'fast') {
      this.stats.routingDecisions.light++;
    } else if (model.tier === 'balanced') {
      this.stats.routingDecisions.medium++;
    } else if (model.tier === 'premium') {
      this.stats.routingDecisions.heavy++;
    }
  }

  /**
   * 모델 ID로 통계 업데이트 (강제/기본 모델용)
   */
  _updateStatsByModelId(modelId) {
    if (!modelId) return;

    const id = modelId.toLowerCase();
    // 경량 모델 패턴
    if (id.includes('haiku') || id.includes('flash') || id.includes('mini') || id.includes('grok-3-mini')) {
      this.stats.routingDecisions.light++;
    }
    // 고성능 모델 패턴
    else if (id.includes('opus') || id.includes('pro') || id.includes('grok-3') && !id.includes('mini')) {
      this.stats.routingDecisions.heavy++;
    }
    // 중간 모델 (기본)
    else {
      this.stats.routingDecisions.medium++;
    }
  }

  /**
   * 통계 조회
   */
  getStats() {
    const total = this.stats.totalRequests;

    return {
      totalRequests: total,
      routingDecisions: this.stats.routingDecisions,
      distribution: {
        light: total > 0 ? ((this.stats.routingDecisions.light / total) * 100).toFixed(1) + '%' : '0%',
        medium: total > 0 ? ((this.stats.routingDecisions.medium / total) * 100).toFixed(1) + '%' : '0%',
        heavy: total > 0 ? ((this.stats.routingDecisions.heavy / total) * 100).toFixed(1) + '%' : '0%'
      },
      totalCost: this.stats.totalCost,
      averageLatency: this.stats.averageLatency
    };
  }

  /**
   * 통계 리셋
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      routingDecisions: {
        light: 0,
        medium: 0,
        heavy: 0
      },
      totalCost: 0,
      averageLatency: 0
    };
  }

  /**
   * 모델 정보 조회
   */
  getModelInfo(modelId) {
    return Object.values(MODELS).find(m => m.id === modelId) || null;
  }

  /**
   * 모든 모델 목록
   */
  getAllModels() {
    return Object.values(MODELS);
  }
}

/**
 * 전역 인스턴스
 */
let globalRouter = null;

/**
 * 모델 ID에서 표시 이름 생성
 */
function getModelDisplayName(modelId) {
  if (!modelId) return '미설정';

  // 알려진 모델 패턴
  const patterns = [
    { match: /claude.*opus/i, name: 'Claude Opus' },
    { match: /claude.*sonnet/i, name: 'Claude Sonnet' },
    { match: /claude.*haiku/i, name: 'Claude Haiku' },
    { match: /gpt-4o/i, name: 'GPT-4o' },
    { match: /gpt-4/i, name: 'GPT-4' },
    { match: /gpt-3/i, name: 'GPT-3.5' },
    { match: /gemini.*pro/i, name: 'Gemini Pro' },
    { match: /gemini.*flash/i, name: 'Gemini Flash' },
    { match: /gemini/i, name: 'Gemini' },
    { match: /grok/i, name: 'Grok' },
    { match: /llama/i, name: 'Llama' },
    { match: /mistral/i, name: 'Mistral' },
  ];

  for (const { match, name } of patterns) {
    if (match.test(modelId)) {
      return name;
    }
  }

  // 패턴 매칭 실패 시 모델 ID 정리해서 반환
  return modelId.split('-').slice(0, 2).join(' ');
}

/**
 * 사용자 설정에서 모델 정보 업데이트
 * 새 형식: { modelId: '...', serviceId: '...' } 또는 이전 형식: 'modelId'
 * 'auto'일 경우 기본 모델 사용
 * thinking 설정: lightThinking, mediumThinking, heavyThinking 키 사용
 */
function updateModelsFromConfig(routingConfig) {
  if (routingConfig.light && routingConfig.light !== 'auto') {
    // 새 형식 또는 이전 형식 모두 지원
    if (typeof routingConfig.light === 'object') {
      TIERS.LIGHT.id = routingConfig.light.modelId;
      TIERS.LIGHT.serviceId = routingConfig.light.serviceId;
      TIERS.LIGHT.thinking = routingConfig.light.thinking || false;
      // 모델 ID에서 표시 이름 생성
      TIERS.LIGHT.name = getModelDisplayName(routingConfig.light.modelId);
    } else {
      TIERS.LIGHT.id = routingConfig.light;
      TIERS.LIGHT.name = getModelDisplayName(routingConfig.light);
    }
  }
  // lightThinking 별도 키 지원
  if (routingConfig.lightThinking !== undefined) {
    TIERS.LIGHT.thinking = routingConfig.lightThinking;
  }

  if (routingConfig.medium && routingConfig.medium !== 'auto') {
    if (typeof routingConfig.medium === 'object') {
      TIERS.MEDIUM.id = routingConfig.medium.modelId;
      TIERS.MEDIUM.serviceId = routingConfig.medium.serviceId;
      TIERS.MEDIUM.thinking = routingConfig.medium.thinking || false;
      TIERS.MEDIUM.name = getModelDisplayName(routingConfig.medium.modelId);
    } else {
      TIERS.MEDIUM.id = routingConfig.medium;
      TIERS.MEDIUM.name = getModelDisplayName(routingConfig.medium);
    }
  }
  // mediumThinking 별도 키 지원
  if (routingConfig.mediumThinking !== undefined) {
    TIERS.MEDIUM.thinking = routingConfig.mediumThinking;
  }

  if (routingConfig.heavy && routingConfig.heavy !== 'auto') {
    if (typeof routingConfig.heavy === 'object') {
      TIERS.HEAVY.id = routingConfig.heavy.modelId;
      TIERS.HEAVY.serviceId = routingConfig.heavy.serviceId;
      TIERS.HEAVY.thinking = routingConfig.heavy.thinking || false;
      TIERS.HEAVY.name = getModelDisplayName(routingConfig.heavy.modelId);
    } else {
      TIERS.HEAVY.id = routingConfig.heavy;
      TIERS.HEAVY.name = getModelDisplayName(routingConfig.heavy);
    }
  }
  // heavyThinking 별도 키 지원
  if (routingConfig.heavyThinking !== undefined) {
    TIERS.HEAVY.thinking = routingConfig.heavyThinking;
  }
  
  console.log('[SmartRouter] Models updated from config:', {
    manager: routingConfig.manager || 'server',
    light: { modelId: TIERS.LIGHT.id, serviceId: TIERS.LIGHT.serviceId, thinking: TIERS.LIGHT.thinking },
    medium: { modelId: TIERS.MEDIUM.id, serviceId: TIERS.MEDIUM.serviceId, thinking: TIERS.MEDIUM.thinking },
    heavy: { modelId: TIERS.HEAVY.id, serviceId: TIERS.HEAVY.serviceId, thinking: TIERS.HEAVY.thinking }
  });

  // manager 설정 반환 (getSmartRouter에서 사용)
  return routingConfig.manager || 'server';
}

/**
 * 싱글톤 인스턴스 가져오기
 */
async function getSmartRouter(config = {}) {
  if (!globalRouter) {
    // 설정에서 라우팅 정보 로드
    let mode = 'auto';
    let singleModel = null;
    let manager = 'server';
    let managerModel = null;
    try {
      const configManager = require('./config');
      const routingConfig = await configManager.getRoutingConfig();
      console.log('[SmartRouter] Loading routing config from DB:', JSON.stringify(routingConfig, null, 2));
      mode = routingConfig.mode || 'auto';
      singleModel = routingConfig.singleModel || null;
      manager = updateModelsFromConfig(routingConfig);
      managerModel = routingConfig.managerModel || null;
    } catch (err) {
      console.warn('[SmartRouter] Could not load routing config:', err.message);
      console.warn('[SmartRouter] Using default hardcoded models - this should be fixed!');
    }
    globalRouter = new SmartRouter({ ...config, mode, singleModel, manager, managerModel });
    console.log('[SmartRouter] Router initialized with mode:', mode, 'manager:', manager);
  }
  return globalRouter;
}

/**
 * SmartRouter 인스턴스 리셋 (설정 변경 시)
 */
function resetSmartRouter(routingConfig = null) {
  let mode = 'auto';
  let singleModel = null;
  let manager = 'server';
  let managerModel = null;
  if (routingConfig) {
    mode = routingConfig.mode || 'auto';
    singleModel = routingConfig.singleModel || null;
    manager = updateModelsFromConfig(routingConfig);
    managerModel = routingConfig.managerModel || null;
  }
  globalRouter = new SmartRouter({ mode, singleModel, manager, managerModel });
  console.log('[SmartRouter] Router reset with mode:', mode, 'manager:', manager);
  return globalRouter;
}

module.exports = {
  SmartRouter,
  getSmartRouter,
  resetSmartRouter,
  TIERS,
  TASK_TYPES
};
