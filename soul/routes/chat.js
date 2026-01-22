/**
 * chat.js
 * 대화 API 라우트
 *
 * Phase 5.4: 영속적 대화방 시스템
 * Phase 8: 스마트 라우팅 통합
 */

const express = require('express');
const router = express.Router();
const { getConversationPipeline } = require('../utils/conversation-pipeline');
const { getMemoryManager } = require('../utils/memory-layers');
const { getTokenSafeguard } = require('../utils/token-safeguard');
const { getSessionContinuity } = require('../utils/session-continuity');
const { getSmartRouter } = require('../utils/smart-router');
const { getPersonalityCore } = require('../utils/personality-core');
const Role = require('../models/Role');
const { getRoleSelector } = require('../utils/role-selector');
const { loadMCPTools, executeMCPTool } = require('../utils/mcp-tools');

/**
 * POST /api/chat
 * 메시지 전송 및 응답 (핵심 엔드포인트)
 * + Phase 8: 스마트 라우팅 및 단일 인격
 */
router.post('/', async (req, res) => {
  try {
    const { message, sessionId = 'main-conversation', options = {} } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // 0. 역할 감지 - LLM 기반 컨텍스트 이해
    const startTime = Date.now();
    let detectedRole = null;
    let selectionInfo = null;

    try {
      // MongoDB에서 활성 역할 검색
      const activeRoles = await Role.getActiveRoles();

      if (activeRoles.length > 0) {
        // RoleSelector로 지능형 역할 선택
        const roleSelector = getRoleSelector();
        const selection = await roleSelector.selectRole(message, activeRoles);

        if (selection && selection.confidence >= 0.5) {
          detectedRole = selection.role;
          selectionInfo = {
            confidence: selection.confidence,
            reasoning: selection.reasoning,
            method: selection.method
          };
          console.log(`✅ 역할 선택: ${detectedRole.name} (확신도: ${selection.confidence}, 방법: ${selection.method})`);
          console.log(`   이유: ${selection.reasoning}`);
        } else if (selection === null && activeRoles.length > 0) {
          // 적합한 역할이 없음 → 새 역할 제안
          console.log('⚠️ 적합한 역할 없음. 새 역할 제안 중...');
          const suggestion = await roleSelector.suggestNewRole(message);

          if (suggestion.success) {
            console.log(`💡 제안: ${suggestion.suggestion.name} 역할 생성 권장`);
            // TODO: 자동 생성 옵션 추가 (사용자 확인 후)
          }
        }
      }
    } catch (roleDetectError) {
      console.warn('역할 감지 실패:', roleDetectError);
    }

    if (detectedRole) {
      // 전문 알바에게 위임
      try {
        const modelId = detectedRole.preferredModel;

        // AI 서비스 생성
        const serviceName = modelId.includes('claude') ? 'anthropic'
          : modelId.includes('gpt') ? 'openai'
          : modelId.includes('gemini') ? 'google'
          : 'anthropic';

        const { AIServiceFactory } = require('../utils/ai-service');
        const aiService = await AIServiceFactory.createService(serviceName, modelId);

        // 역할 실행
        const roleResult = await aiService.chat(
          [{ role: 'user', content: message }],
          {
            systemPrompt: detectedRole.systemPrompt,
            maxTokens: detectedRole.maxTokens,
            temperature: detectedRole.temperature
          }
        );

        // 성과 기록
        const responseTime = Date.now() - startTime;
        const tokensUsed = roleResult.length;
        await detectedRole.recordUsage(true, tokensUsed, responseTime);

        // Soul의 목소리로 감싸기
        const personality = getPersonalityCore();
        const wrappedResponse = `${roleResult}`;

        // 응답 저장 (메모리에 기록)
        const pipeline = await getConversationPipeline({ model: modelId });
        await pipeline.handleResponse(message, wrappedResponse, sessionId);

        return res.json({
          success: true,
          sessionId,
          message: wrappedResponse,
          reply: wrappedResponse,
          routing: {
            selectedModel: detectedRole.name,
            modelId: modelId,
            reason: `전문 작업 감지: ${detectedRole.description}`,
            delegatedRole: detectedRole.roleId,
            successRate: detectedRole.getSuccessRate(),
            selection: selectionInfo // LLM 선택 정보 추가
          }
        });
      } catch (roleError) {
        console.warn('역할 실행 실패, 일반 대화로 fallback:', roleError);

        // 실패 기록
        if (detectedRole) {
          const responseTime = Date.now() - startTime;
          await detectedRole.recordUsage(false, 0, responseTime);
        }

        // 실패시 아래 일반 대화 로직으로 계속 진행
      }
    }

    // 1. 스마트 라우팅 - 최적 모델 선택
    const router = getSmartRouter();
    const routingResult = await router.route(message, {
      historyTokens: options.historyTokens || 0,
      messageCount: options.messageCount || 0
    });

    // 2. 인격 코어 - 시스템 프롬프트 생성
    const personality = getPersonalityCore();
    const systemPrompt = personality.generateSystemPrompt({
      model: routingResult.modelId,
      context: options.context || {}
    });

    // 3. 파이프라인 가져오기
    const pipeline = await getConversationPipeline({
      ...options.pipelineConfig,
      model: routingResult.modelId,
      systemPrompt
    });

    // 4. 대화 메시지 구성
    const conversationData = await pipeline.buildConversationMessages(
      message,
      sessionId,
      options
    );

    // 5. AI 응답 생성 (실제 AI 호출)
    const { AIServiceFactory } = require('../utils/ai-service');

    let aiResponse;
    try {
      // AI 서비스 생성 (모델 ID로 자동 판단)
      const serviceName = routingResult.modelId.includes('claude') ? 'anthropic'
        : routingResult.modelId.includes('gpt') ? 'openai'
        : routingResult.modelId.includes('gemini') ? 'google'
        : 'anthropic'; // 기본값

      const aiService = await AIServiceFactory.createService(serviceName, routingResult.modelId);

      // system 메시지 분리
      const systemMessages = conversationData.messages.filter(m => m.role === 'system');
      const chatMessages = conversationData.messages.filter(m => m.role !== 'system');

      const combinedSystemPrompt = systemMessages.map(m => m.content).join('\n\n');

      // MCP 도구 로드 (스마트홈 등)
      const mcpTools = loadMCPTools();

      // AI 호출 (도구 포함)
      aiResponse = await aiService.chat(chatMessages, {
        systemPrompt: combinedSystemPrompt,
        maxTokens: options.maxTokens || 4096,
        temperature: options.temperature || 1.0,
        tools: mcpTools.length > 0 ? mcpTools : null,
        toolExecutor: mcpTools.length > 0 ? executeMCPTool : null
      });
    } catch (aiError) {
      console.error('AI 호출 실패:', aiError);
      aiResponse = `죄송합니다. AI 응답 생성 중 오류가 발생했습니다: ${aiError.message}`;
    }

    // 6. 응답 일관성 검증
    const validation = personality.validateResponse(aiResponse, {
      englishExpected: options.englishExpected || false
    });

    // 7. 응답 저장
    await pipeline.handleResponse(message, aiResponse, sessionId);

    res.json({
      success: true,
      sessionId,
      message: aiResponse,
      reply: aiResponse, // 프론트엔드 호환성
      usage: conversationData.usage,
      compressed: conversationData.compressed,
      contextData: conversationData.contextData,
      routing: {
        selectedModel: routingResult.modelName,
        modelId: routingResult.modelId,
        reason: routingResult.reason,
        confidence: routingResult.confidence,
        estimatedCost: routingResult.estimatedCost
      },
      validation: {
        valid: validation.valid,
        score: validation.score,
        issues: validation.issues
      }
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chat/resume
 * 세션 재개
 */
router.post('/resume', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const continuity = await getSessionContinuity();
    const restored = await continuity.restoreSession(sessionId);

    res.json(restored);
  } catch (error) {
    console.error('Error resuming session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chat/end
 * 세션 종료
 */
router.post('/end', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const continuity = await getSessionContinuity();
    const result = await continuity.endSession(sessionId);

    res.json(result);
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/history/:sessionId
 * 대화 히스토리 조회
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, before, after } = req.query;

    const memoryManager = await getMemoryManager();
    let messages = memoryManager.shortTerm.getAll();

    // TODO: before/after 필터링 구현
    // 현재는 최근 N개만 반환
    messages = messages.slice(-parseInt(limit));

    res.json({
      success: true,
      sessionId,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      })),
      total: messages.length
    });
  } catch (error) {
    console.error('Error getting conversation history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/sessions
 * 활성 세션 목록
 */
router.get('/sessions', async (req, res) => {
  try {
    const continuity = await getSessionContinuity();
    const sessions = await continuity.getActiveSessions();

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/memory-stats
 * 메모리 통계
 */
router.get('/memory-stats', async (req, res) => {
  try {
    const memoryManager = await getMemoryManager();
    const stats = await memoryManager.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting memory stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/token-status
 * 토큰 상태
 */
router.get('/token-status', (req, res) => {
  try {
    const safeguard = getTokenSafeguard();
    const status = safeguard.getStatus();

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting token status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chat/compress
 * 수동 압축
 */
router.post('/compress', async (req, res) => {
  try {
    const safeguard = getTokenSafeguard();
    const result = await safeguard.emergencyCompress();

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error compressing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chat/analyze-task
 * 태스크 분석 (라우팅 없이 분석만)
 */
router.post('/analyze-task', async (req, res) => {
  try {
    const { message, context = {} } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const router = getSmartRouter();
    const analysis = router.analyzeTask(message, context);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Error analyzing task:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/routing-stats
 * 라우팅 통계
 */
router.get('/routing-stats', (req, res) => {
  try {
    const router = getSmartRouter();
    const stats = router.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting routing stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/models
 * 사용 가능한 모델 목록
 */
router.get('/models', (req, res) => {
  try {
    const router = getSmartRouter();
    const models = router.getAllModels();

    res.json({
      success: true,
      models
    });
  } catch (error) {
    console.error('Error getting models:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/personality
 * 인격 정보
 */
router.get('/personality', (req, res) => {
  try {
    const personality = getPersonalityCore();
    const context = personality.getContext();

    res.json({
      success: true,
      personality: context
    });
  } catch (error) {
    console.error('Error getting personality:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chat/personality/preference
 * 사용자 선호도 설정
 */
router.post('/personality/preference', (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Key and value are required'
      });
    }

    const personality = getPersonalityCore();
    personality.setUserPreference(key, value);

    res.json({
      success: true,
      preference: { key, value }
    });
  } catch (error) {
    console.error('Error setting preference:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
