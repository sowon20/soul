/**
 * role-selector.js
 * LLM 기반 컨텍스트 이해 역할 선택기
 *
 * 단순 키워드가 아닌 "상황"을 이해해서 적합한 역할 선택
 */

const { AIServiceFactory } = require('./ai-service');

class RoleSelector {
  constructor() {
    this.cache = new Map(); // 간단한 캐싱 (동일 메시지 반복 방지)
  }

  /**
   * 메시지 분석 후 최적의 역할 선택
   * @param {string} message - 사용자 메시지
   * @param {Array} availableRoles - 사용 가능한 역할 목록
   * @returns {Object|null} - {role, confidence, reasoning}
   */
  async selectRole(message, availableRoles) {
    if (!message || !availableRoles || availableRoles.length === 0) {
      return null;
    }

    // 캐시 확인
    const cacheKey = `${message}_${availableRoles.length}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // Phase 1: 빠른 키워드 필터링 (후보군 추리기)
      const candidates = this._filterCandidates(message, availableRoles);

      if (candidates.length === 0) {
        return null;
      }

      // 후보가 1개뿐이면 LLM 호출 없이 바로 반환 (비용 절약)
      if (candidates.length === 1) {
        const result = {
          role: candidates[0],
          confidence: 0.7,
          reasoning: '유일한 매칭 역할',
          method: 'keyword-only'
        };
        this.cache.set(cacheKey, result);
        return result;
      }

      // Phase 2: LLM으로 컨텍스트 분석
      const selected = await this._llmAnalysis(message, candidates);

      // 캐싱 (최대 100개)
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, selected);

      return selected;

    } catch (error) {
      console.error('역할 선택 실패:', error);
      // 폴백: 가장 사용 빈도 높은 역할
      const fallback = availableRoles.sort((a, b) =>
        b.stats.usageCount - a.stats.usageCount
      )[0];

      return fallback ? {
        role: fallback,
        confidence: 0.3,
        reasoning: '에러로 인한 폴백 (가장 많이 사용된 역할)',
        method: 'fallback'
      } : null;
    }
  }

  /**
   * Phase 1: 키워드로 후보 필터링
   * @private
   */
  _filterCandidates(message, roles) {
    const lowerMessage = message.toLowerCase();
    const candidates = [];

    for (const role of roles) {
      if (!role.active) continue;

      let score = 0;

      // 트리거 매칭
      for (const trigger of role.triggers) {
        if (lowerMessage.includes(trigger.toLowerCase())) {
          score += 1;
        }
      }

      // 성공률 가중치
      const successRate = role.getSuccessRate ? role.getSuccessRate() : 0;
      score += successRate / 100;

      if (score > 0.5) {
        candidates.push({ role, score });
      }
    }

    // 스코어 높은 순으로 정렬, 상위 3개만 LLM 분석
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(c => c.role);
  }

  /**
   * Phase 2: LLM으로 컨텍스트 분석
   * @private
   */
  async _llmAnalysis(message, candidates) {
    // 빠르고 저렴한 모델 사용 (Haiku)
    const aiService = await AIServiceFactory.createService(
      'anthropic',
      'claude-3-5-haiku-20241022'
    );

    const rolesDescription = candidates.map((role, idx) =>
      `${idx + 1}. ${role.name} (${role.roleId}): ${role.description}`
    ).join('\n');

    const systemPrompt = `당신은 작업 분류 전문가입니다.
사용자의 메시지를 분석해서 가장 적합한 전문가를 선택하세요.

중요: 키워드만 보지 말고 "맥락"을 이해하세요.
예시:
- "이 코드를 요약해줘" → 코드 관련이므로 "코드 생성" 역할 (요약 역할 아님!)
- "이 문서를 번역해줘" → 번역 역할
- "이 에러를 고쳐줘" → 디버깅/코드 역할

응답 형식 (JSON만):
{
  "selected": 역할번호 (1, 2, 3 중),
  "confidence": 0.0~1.0 (확신도),
  "reasoning": "선택 이유 (한 줄)"
}`;

    const userPrompt = `사용자 메시지: "${message}"

사용 가능한 역할:
${rolesDescription}

가장 적합한 역할을 JSON 형식으로 선택하세요.`;

    try {
      const startTime = Date.now();
      const response = await aiService.chat(
        [{ role: 'user', content: userPrompt }],
        {
          systemPrompt,
          maxTokens: 200,
          temperature: 0.3 // 낮은 온도 (일관성)
        }
      );
      const latency = Date.now() - startTime;

      // 사용량 추적
      const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const estimatedOutputTokens = response ? Math.ceil(response.length / 4) : 0;
      try {
        await AIServiceFactory.trackUsage({
          serviceId: 'anthropic',
          modelId: 'claude-3-5-haiku-20241022',
          tier: 'light',
          usage: {
            input_tokens: estimatedInputTokens,
            output_tokens: estimatedOutputTokens
          },
          latency,
          category: 'role'
        });
      } catch (trackError) {
        console.warn('Role selector usage tracking failed:', trackError.message);
      }

      // JSON 파싱
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON 응답 없음');
      }

      const result = JSON.parse(jsonMatch[0]);
      const selectedRole = candidates[result.selected - 1];

      if (!selectedRole) {
        throw new Error('잘못된 역할 번호');
      }

      return {
        role: selectedRole,
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning || 'LLM 선택',
        method: 'llm-analysis'
      };

    } catch (parseError) {
      console.warn('LLM 응답 파싱 실패, 첫 번째 후보 반환:', parseError);
      return {
        role: candidates[0],
        confidence: 0.5,
        reasoning: 'LLM 파싱 실패로 첫 후보 선택',
        method: 'llm-fallback'
      };
    }
  }

  /**
   * 역할이 없을 때 새 역할 제안
   * @param {string} message - 사용자 메시지
   * @returns {Object} - 제안된 역할 정보
   */
  async suggestNewRole(message) {
    try {
      // 활성화된 AI 서비스 사용
      const AIServiceModel = require('../models/AIService');
      const activeService = await AIServiceModel.findOne({ isActive: true, apiKey: { $ne: null } }).select('+apiKey');

      let serviceName = 'anthropic';
      let modelId = 'claude-3-5-haiku-20241022';

      if (activeService && activeService.models && activeService.models.length > 0) {
        serviceName = activeService.serviceId;
        modelId = activeService.models[0].id;
      }

      const aiService = await AIServiceFactory.createService(serviceName, modelId);

      const systemPrompt = `당신은 HR 전문가입니다.
사용자의 요청을 분석해서 새로운 전문가 역할을 제안하세요.

응답 형식 (JSON만):
{
  "roleId": "영문소문자_언더스코어",
  "name": "역할 이름 (한글)",
  "description": "역할 설명 (한 줄)",
  "category": "content|code|data|creative|technical|other 중 하나",
  "triggers": ["키워드1", "키워드2", ...],
  "systemPrompt": "이 역할의 시스템 프롬프트 (영어)",
  "preferredModel": "claude-3-5-sonnet-20241022"
}`;

      const userPrompt = `이 작업을 처리할 새로운 전문가를 제안하세요:\n"${message}"`;

      const startTime = Date.now();
      const response = await aiService.chat(
        [{ role: 'user', content: userPrompt }],
        {
          systemPrompt,
          maxTokens: 500,
          temperature: 0.7
        }
      );
      const latency = Date.now() - startTime;

      // 사용량 추적
      const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const estimatedOutputTokens = response ? Math.ceil(response.length / 4) : 0;
      try {
        await AIServiceFactory.trackUsage({
          serviceId: serviceName,
          modelId,
          tier: 'light',
          usage: {
            input_tokens: estimatedInputTokens,
            output_tokens: estimatedOutputTokens
          },
          latency,
          category: 'role'
        });
      } catch (trackError) {
        console.warn('Role suggestion usage tracking failed:', trackError.message);
      }

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON 응답 없음');
      }

      const suggestion = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        suggestion,
        reasoning: '기존 역할로 처리하기 어려운 작업으로 판단'
      };

    } catch (error) {
      console.error('새 역할 제안 실패:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 캐시 초기화
   */
  clearCache() {
    this.cache.clear();
  }
}

// 싱글톤 인스턴스
let instance = null;

function getRoleSelector() {
  if (!instance) {
    instance = new RoleSelector();
  }
  return instance;
}

module.exports = {
  RoleSelector,
  getRoleSelector
};
