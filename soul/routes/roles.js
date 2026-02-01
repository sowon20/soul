/**
 * roles.js
 * Soul의 알바(Worker Roles) API - MongoDB 기반 동적 관리
 *
 * Soul이 전문 작업을 알바에게 위임하는 엔드포인트
 */

const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
const { AIServiceFactory } = require('../utils/ai-service');

/**
 * POST /api/roles/execute
 * 특정 역할로 작업 실행 (MongoDB 기반)
 */
router.post('/execute', async (req, res) => {
  const startTime = Date.now();
  let role = null;

  try {
    const { roleId, input, options = {} } = req.body;

    if (!roleId || !input) {
      return res.status(400).json({
        success: false,
        error: 'roleId and input are required'
      });
    }

    // MongoDB에서 역할 조회
    role = await Role.findOne({ roleId, active: true });
    if (!role) {
      return res.status(404).json({
        success: false,
        error: `Role not found: ${roleId}`
      });
    }

    // 모델 선택 (우선 모델 → 폴백)
    const modelId = options.model || role.preferredModel;

    // AI 서비스 생성
    const serviceName = modelId.includes('claude') ? 'anthropic'
      : modelId.includes('gpt') ? 'openai'
      : modelId.includes('gemini') ? 'google'
      : 'anthropic';

    const aiService = await AIServiceFactory.createService(serviceName, modelId);

    // 역할 실행
    const messages = [
      { role: 'user', content: input }
    ];

    const result = await aiService.chat(messages, {
      systemPrompt: role.systemPrompt,
      maxTokens: options.maxTokens || role.maxTokens,
      temperature: options.temperature || role.temperature
    });

    // 성과 기록
    const responseTime = Date.now() - startTime;
    const tokensUsed = result.length; // 간단한 추정 (향후 정확한 토큰 카운터 사용)

    // 사용량 추적
    const estimatedInputTokens = Math.ceil((role.systemPrompt.length + input.length) / 4);
    const estimatedOutputTokens = Math.ceil(result.length / 4);
    try {
      await AIServiceFactory.trackUsage({
        serviceId: serviceName,
        modelId,
        tier: 'medium',
        usage: {
          input_tokens: estimatedInputTokens,
          output_tokens: estimatedOutputTokens
        },
        latency: responseTime,
        category: 'role'
      });
    } catch (trackError) {
      console.warn('Role usage tracking failed:', trackError.message);
    }
    await role.recordUsage(true, tokensUsed, responseTime);

    res.json({
      success: true,
      roleId,
      roleName: role.name,
      model: modelId,
      result,
      metadata: {
        input: input.substring(0, 100) + '...',
        outputLength: result.length,
        responseTime,
        successRate: role.getSuccessRate()
      }
    });

  } catch (error) {
    console.error('Error executing role:', error);

    // 실패 기록
    if (role) {
      const responseTime = Date.now() - startTime;
      await role.recordUsage(false, 0, responseTime);
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles/chain
 * 여러 역할을 순차 실행 (체인)
 */
router.post('/chain', async (req, res) => {
  try {
    const { steps, input, options = {} } = req.body;

    if (!steps || !Array.isArray(steps) || !input) {
      return res.status(400).json({
        success: false,
        error: 'steps (array) and input are required'
      });
    }

    let currentInput = input;
    const outputs = [];

    for (const step of steps) {
      const roleId = typeof step === 'string' ? step : step.roleId;
      const stepOptions = typeof step === 'object' ? step.options : {};

      const role = ROLES[roleId];
      if (!role) {
        return res.status(404).json({
          success: false,
          error: `Role not found in chain: ${roleId}`
        });
      }

      // 모델 선택
      const modelId = stepOptions.model || role.preferredModel;
      const serviceName = modelId.includes('claude') ? 'anthropic'
        : modelId.includes('gpt') ? 'openai'
        : modelId.includes('gemini') ? 'google'
        : 'anthropic';

      const aiService = await AIServiceFactory.createService(serviceName, modelId);

      // 실행
      const messages = [
        { role: 'user', content: currentInput }
      ];

      const stepStartTime = Date.now();
      const result = await aiService.chat(messages, {
        systemPrompt: role.systemPrompt,
        maxTokens: stepOptions.maxTokens || role.maxTokens,
        temperature: stepOptions.temperature || role.temperature
      });
      const stepLatency = Date.now() - stepStartTime;

      // 사용량 추적
      const estimatedInputTokens = Math.ceil((role.systemPrompt.length + currentInput.length) / 4);
      const estimatedOutputTokens = Math.ceil(result.length / 4);
      try {
        await AIServiceFactory.trackUsage({
          serviceId: serviceName,
          modelId,
          tier: 'medium',
          usage: {
            input_tokens: estimatedInputTokens,
            output_tokens: estimatedOutputTokens
          },
          latency: stepLatency,
          category: 'role'
        });
      } catch (trackError) {
        console.warn('Role chain usage tracking failed:', trackError.message);
      }

      outputs.push({
        step: roleId,
        roleName: role.name,
        model: modelId,
        result
      });

      // 다음 단계의 입력으로 사용
      currentInput = result;
    }

    res.json({
      success: true,
      chain: steps,
      outputs,
      final: currentInput
    });

  } catch (error) {
    console.error('Error executing chain:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/roles
 * 사용 가능한 역할 목록 (MongoDB)
 */
router.get('/', async (req, res) => {
  try {
    const { category, active, sortBy = 'usageCount' } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (active !== undefined) filter.active = active === 'true';

    let query = Role.find(filter);

    // 정렬
    const sortOptions = {
      usageCount: { 'stats.usageCount': -1 },
      lastUsed: { 'stats.lastUsed': -1 },
      successRate: { 'stats.successCount': -1 },
      name: { name: 1 }
    };
    query = query.sort(sortOptions[sortBy] || sortOptions.usageCount);

    const roles = await query.exec();

    const roleList = roles.map(role => {
      // stats 파싱 (SQLite에서 JSON 문자열로 저장됨)
      const stats = typeof role.stats === 'string' ? JSON.parse(role.stats || '{}') : (role.stats || {});
      const usageCount = stats.usageCount || 0;
      const successCount = stats.successCount || 0;
      const successRate = usageCount > 0 ? Math.round((successCount / usageCount) * 100) : 0;

      return {
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        category: role.category,
        preferredModel: role.preferredModel,
        fallbackModel: role.fallbackModel,
        systemPrompt: role.systemPrompt,
        maxTokens: role.maxTokens,
        temperature: role.temperature,
        triggers: role.triggers,
        tags: role.tags || [],
        active: role.active === 1 || role.active === true,
        mode: role.mode || 'single',
        chainSteps: role.chainSteps || [],
        parallelRoles: role.parallelRoles || [],
        stats: {
          usageCount,
          successRate,
          lastUsed: stats.lastUsed
        },
        createdBy: role.createdBy
      };
    });

    res.json({
      success: true,
      roles: roleList,
      total: roles.length
    });

  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/roles/:roleId
 * 특정 역할 상세 정보 (MongoDB)
 */
router.get('/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    const role = await Role.findOne({ roleId });

    if (!role) {
      return res.status(404).json({
        success: false,
        error: `Role not found: ${roleId}`
      });
    }

    res.json({
      success: true,
      role: {
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        category: role.category,
        preferredModel: role.preferredModel,
        fallbackModel: role.fallbackModel,
        systemPrompt: role.systemPrompt,
        maxTokens: role.maxTokens,
        temperature: role.temperature,
        triggers: role.triggers,
        active: role.active,
        stats: {
          usageCount: role.stats.usageCount,
          successCount: role.stats.successCount,
          failureCount: role.stats.failureCount,
          successRate: role.getSuccessRate(),
          averageResponseTime: role.stats.averageResponseTime,
          totalTokensUsed: role.stats.totalTokensUsed,
          lastUsed: role.stats.lastUsed
        },
        createdBy: role.createdBy,
        tags: role.tags,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt
      }
    });

  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles
 * 새로운 역할 생성 (고용)
 */
router.post('/', async (req, res) => {
  try {
    const {
      roleId,
      name,
      description,
      preferredModel,
      fallbackModel,
      systemPrompt,
      maxTokens,
      temperature,
      triggers,
      category,
      tags,
      createdBy = 'user',
      mode = 'single',
      chainSteps,
      parallelModels
    } = req.body;

    // 필수 필드 검증 (체인/병렬 모드는 systemPrompt 없어도 됨)
    if (!roleId || !name) {
      return res.status(400).json({
        success: false,
        error: 'roleId and name are required'
      });
    }

    // 중복 체크
    const existing = await Role.findOne({ roleId });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Role already exists: ${roleId}`
      });
    }

    // 역할 생성 데이터
    const roleData = {
      roleId,
      name,
      description: description || '',
      preferredModel: preferredModel || null,
      fallbackModel: fallbackModel || null,
      systemPrompt: systemPrompt || '',
      maxTokens: maxTokens || 4096,
      temperature: temperature !== undefined ? temperature : 0.7,
      triggers: triggers || [],
      category: category || 'other',
      tags: tags || [],
      createdBy,
      mode
    };

    // 모드별 추가 데이터
    if (mode === 'chain' && chainSteps) {
      roleData.chainSteps = JSON.stringify(chainSteps);
    }
    if (mode === 'parallel' && parallelModels) {
      roleData.parallelModels = JSON.stringify(parallelModels);
    }

    const role = await Role.create(roleData);

    res.status(201).json({
      success: true,
      message: `새로운 알바 고용 완료: ${name}`,
      role: {
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        category: role.category
      }
    });

  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/roles/:roleId
 * 역할 부분 수정 (모드, 상태 등 부분 업데이트)
 */
router.patch('/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    const updates = req.body;

    // 변경 불가 필드 제거
    delete updates.roleId;
    delete updates.stats;
    delete updates.createdBy;

    // active → isActive 변환 (DB 컬럼명 is_active)
    if ('active' in updates) {
      updates.isActive = updates.active ? 1 : 0;
      delete updates.active;
    }

    const role = await Role.findOneAndUpdate(
      { roleId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!role) {
      return res.status(404).json({
        success: false,
        error: `Role not found: ${roleId}`
      });
    }

    res.json({
      success: true,
      message: `알바 정보 업데이트 완료: ${role.name}`,
      role: {
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        category: role.category,
        active: role.active,
        mode: role.mode,
        chainSteps: role.chainSteps,
        parallelRoles: role.parallelRoles,
        systemPrompt: role.systemPrompt
      }
    });

  } catch (error) {
    console.error('Error patching role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/roles/:roleId
 * 역할 수정 (교육/재배치)
 */
router.put('/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    const updates = req.body;

    // roleId는 변경 불가
    delete updates.roleId;
    delete updates.stats;
    delete updates.createdBy;

    const role = await Role.findOneAndUpdate(
      { roleId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!role) {
      return res.status(404).json({
        success: false,
        error: `Role not found: ${roleId}`
      });
    }

    res.json({
      success: true,
      message: `알바 정보 업데이트 완료: ${role.name}`,
      role: {
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        category: role.category,
        active: role.active
      }
    });

  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/roles/:roleId
 * 역할 삭제 (퇴사)
 */
router.delete('/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permanent = false } = req.query;

    if (permanent === 'true') {
      // 완전 삭제
      const role = await Role.findOne({ roleId });
      if (!role) {
        return res.status(404).json({
          success: false,
          error: `Role not found: ${roleId}`
        });
      }
      await Role.deleteOne({ roleId });

      res.json({
        success: true,
        message: `알바 완전 퇴사 처리 완료: ${role.name}`
      });
    } else {
      // 비활성화 (소프트 삭제)
      const role = await Role.findOneAndUpdate(
        { roleId },
        { $set: { is_active: false } },
        { new: true }
      );

      if (!role) {
        return res.status(404).json({
          success: false,
          error: `Role not found: ${roleId}`
        });
      }

      res.json({
        success: true,
        message: `알바 휴직 처리 완료: ${role.name} (재고용 가능)`
      });
    }

  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles/:roleId/activate
 * 역할 재활성화 (재고용)
 */
router.post('/:roleId/activate', async (req, res) => {
  try {
    const { roleId } = req.params;

    const role = await Role.findOneAndUpdate(
      { roleId },
      { $set: { active: true } },
      { new: true }
    );

    if (!role) {
      return res.status(404).json({
        success: false,
        error: `Role not found: ${roleId}`
      });
    }

    res.json({
      success: true,
      message: `알바 재고용 완료: ${role.name}`,
      role: {
        roleId: role.roleId,
        name: role.name,
        active: role.active
      }
    });

  } catch (error) {
    console.error('Error activating role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles/detect
 * 컨텍스트 기반 역할 감지 (LLM 지능형)
 */
router.post('/detect', async (req, res) => {
  try {
    const { message, useLLM = true } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    // 활성 역할 가져오기
    const activeRoles = await Role.getActiveRoles();

    if (activeRoles.length === 0) {
      return res.json({
        success: true,
        detected: null,
        reason: '활성화된 역할이 없습니다'
      });
    }

    if (useLLM) {
      // LLM 기반 지능형 선택
      const { getRoleSelector } = require('../utils/role-selector');
      const roleSelector = getRoleSelector();
      const selection = await roleSelector.selectRole(message, activeRoles);

      if (selection && selection.role) {
        res.json({
          success: true,
          detected: {
            roleId: selection.role.roleId,
            name: selection.role.name,
            description: selection.role.description,
            confidence: selection.confidence
          },
          reason: selection.reasoning,
          method: selection.method
        });
      } else {
        // 적합한 역할 없음 → 새 역할 제안
        const suggestion = await roleSelector.suggestNewRole(message);

        res.json({
          success: true,
          detected: null,
          reason: '매칭되는 역할을 찾지 못했습니다',
          suggestion: suggestion.success ? suggestion.suggestion : '새로운 알바 고용을 고려하세요'
        });
      }
    } else {
      // 레거시 키워드 매칭
      const lowerMessage = message.toLowerCase();
      let bestMatch = null;
      let highestScore = 0;

      for (const role of activeRoles) {
        let score = 0;
        for (const trigger of role.triggers) {
          if (lowerMessage.includes(trigger.toLowerCase())) {
            score += 1;
            score += role.getSuccessRate() / 100;
          }
        }

        if (score > highestScore) {
          highestScore = score;
          bestMatch = role;
        }
      }

      if (bestMatch) {
        res.json({
          success: true,
          detected: {
            roleId: bestMatch.roleId,
            name: bestMatch.name,
            description: bestMatch.description,
            confidence: Math.min(highestScore / 2, 1)
          },
          reason: `트리거 키워드 매칭 (${highestScore.toFixed(2)} 점)`,
          method: 'keyword-legacy'
        });
      } else {
        res.json({
          success: true,
          detected: null,
          reason: '매칭되는 역할을 찾지 못했습니다',
          suggestion: '새로운 알바 고용을 고려하세요'
        });
      }
    }

  } catch (error) {
    console.error('Error detecting role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles/suggest
 * AI가 새로운 역할 제안
 */
router.post('/suggest', async (req, res) => {
  try {
    const { message, autoCreate = false } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    const { getRoleSelector } = require('../utils/role-selector');
    const roleSelector = getRoleSelector();

    const suggestion = await roleSelector.suggestNewRole(message);

    if (!suggestion.success) {
      return res.status(500).json({
        success: false,
        error: suggestion.error
      });
    }

    // 자동 생성 옵션
    if (autoCreate) {
      const newRole = await Role.create({
        ...suggestion.suggestion,
        createdBy: 'auto'
      });

      return res.json({
        success: true,
        message: `새 역할 자동 생성 완료: ${newRole.name}`,
        role: {
          roleId: newRole.roleId,
          name: newRole.name,
          description: newRole.description,
          category: newRole.category
        },
        auto: true
      });
    }

    // 제안만
    res.json({
      success: true,
      suggestion: suggestion.suggestion,
      reasoning: suggestion.reasoning,
      message: '역할 제안 완료 (수동 생성 필요)'
    });

  } catch (error) {
    console.error('Error suggesting role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles/initialize
 * 기본 역할 초기화
 */
router.post('/initialize', async (req, res) => {
  try {
    await Role.initializeDefaultRoles();

    const roles = await Role.find({});

    res.json({
      success: true,
      message: '기본 역할 초기화 완료',
      count: roles.length,
      roles: roles.map(r => ({ roleId: r.roleId, name: r.name }))
    });

  } catch (error) {
    console.error('Error initializing roles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles/auto-manage
 * 자동 역할 관리 (성능 기반 최적화)
 */
router.post('/auto-manage', async (req, res) => {
  try {
    const { action = 'optimize' } = req.body;
    const results = {
      optimized: [],
      deactivated: [],
      suggested: []
    };

    const roles = await Role.find({ active: true });

    for (const role of roles) {
      const successRate = role.getSuccessRate();
      const usageCount = role.stats.usageCount;

      // 규칙 1: 성공률 낮고 사용 많음 → 개선 필요
      if (successRate < 30 && usageCount > 10) {
        results.optimized.push({
          roleId: role.roleId,
          name: role.name,
          issue: '낮은 성공률',
          successRate,
          usageCount,
          recommendation: 'systemPrompt 개선 권장'
        });
      }

      // 규칙 2: 사용 안됨 (30일 이상) → 비활성화 고려
      if (role.stats.lastUsed) {
        const daysSinceUse = (Date.now() - new Date(role.stats.lastUsed)) / (1000 * 60 * 60 * 24);
        if (daysSinceUse > 30 && role.createdBy !== 'system') {
          results.deactivated.push({
            roleId: role.roleId,
            name: role.name,
            daysSinceUse: Math.floor(daysSinceUse),
            recommendation: '휴직 처리 고려'
          });
        }
      }
    }

    res.json({
      success: true,
      action,
      results,
      summary: {
        totalRoles: roles.length,
        needsOptimization: results.optimized.length,
        inactiveRoles: results.deactivated.length
      }
    });

  } catch (error) {
    console.error('Error auto-managing roles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
