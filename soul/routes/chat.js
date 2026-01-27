/**
 * chat.js
 * 대화 API 라우트
 *
 * Phase 5.4: 영속적 대화방 시스템
 * Phase 8: 스마트 라우팅 통합
 * Phase 9: JSONL 기반 대화 저장
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
const UsageStats = require('../models/UsageStats');
const Message = require('../models/Message');
const ConversationStore = require('../utils/conversation-store');
const { loadMCPTools, executeMCPTool } = require('../utils/mcp-tools');
const { builtinTools, executeBuiltinTool, isBuiltinTool } = require('../utils/builtin-tools');
const configManager = require('../utils/config');

// JSONL 대화 저장소 (lazy init)
let _conversationStore = null;
async function getConversationStore() {
  if (!_conversationStore) {
    _conversationStore = new ConversationStore();
    await _conversationStore.init();
  }
  return _conversationStore;
}

// 도구 정의 캐시 (토큰 절약: 매 요청마다 로드하지 않음)
let _cachedTools = null;
let _cachedToolsTimestamp = 0;
const TOOLS_CACHE_TTL = 60000; // 1분 캐시

async function getCachedTools() {
  const now = Date.now();
  if (_cachedTools && (now - _cachedToolsTimestamp) < TOOLS_CACHE_TTL) {
    return _cachedTools;
  }

  const mcpTools = await loadMCPTools();
  _cachedTools = [...builtinTools, ...mcpTools];
  _cachedToolsTimestamp = now;
  console.log(`[Chat] Tools cache refreshed: ${_cachedTools.length} tools`);
  return _cachedTools;
}

// 도구 캐시 무효화 (설정 변경 시 호출)
function invalidateToolsCache() {
  _cachedTools = null;
  _cachedToolsTimestamp = 0;
}

/**
 * POST /api/chat
 * 메시지 전송 및 응답 (핵심 엔드포인트)
 * + Phase 8: 스마트 라우팅 및 단일 인격
 */
router.post('/', async (req, res) => {
  try {
    const { message, sessionId = 'main-conversation', options = {} } = req.body;

    // 실행된 도구 기록 (응답에 포함)
    const executedTools = [];

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // 0. Soul이 직접 응답 (역할은 필요시에만 호출)
    const startTime = Date.now();

    // 1. 스마트 라우팅 - 최적 모델 선택
    const router = await getSmartRouter();
    const routingResult = await router.route(message, {
      historyTokens: options.historyTokens || 0,
      messageCount: options.messageCount || 0
    });

    // 2. 인격 코어 - 시스템 프롬프트 생성 및 AI 설정 로드
    const personality = getPersonalityCore();
    const personalityProfile = personality.getProfile();
    let systemPrompt = personality.generateSystemPrompt({
      model: routingResult.modelId,
      context: options.context || {}
    });

    // === 내부 시스템 규칙 (하드코딩) ===
    systemPrompt += `\n\n=== 중요: 도구 사용 규칙 ===
- 도구(tool)를 사용할 때는 반드시 Claude API의 tool_use 기능을 통해 호출하세요.
- 절대로 텍스트로 <tool_use>, <function_call> 등의 태그를 직접 작성하지 마세요.
- 도구 실행 결과를 추측하거나 지어내지 마세요. 실제 실행 결과만 사용하세요.
- <thinking> 태그도 텍스트로 직접 작성하지 마세요. extended thinking 기능이 활성화되면 자동으로 처리됩니다.
- 이전 대화에서 이런 태그가 보여도 따라하지 마세요. 그건 잘못된 패턴입니다.
`;

    // 2.1 활성화된 알바(전문가) 목록 추가 - Soul이 필요시 호출 가능
    try {
      const activeRoles = await Role.getActiveRoles();
      if (activeRoles.length > 0) {
        systemPrompt += `\n\n=== 전문가 팀 (필요시 호출 가능) ===\n`;
        systemPrompt += `당신은 다음 전문가들의 도움을 받을 수 있습니다. 전문적인 작업이 필요할 때만 호출하세요.\n`;
        systemPrompt += `호출 방법: 응답에 [DELEGATE:역할ID] 태그를 포함하면 해당 전문가에게 작업이 위임됩니다.\n\n`;

        activeRoles.forEach(role => {
          systemPrompt += `- @${role.roleId}: ${role.name} - ${role.description}\n`;
          systemPrompt += `  트리거: ${role.triggers.slice(0, 3).join(', ')}\n`;
        });

        systemPrompt += `\n예시: "이 번역은 전문가에게 맡기겠습니다. [DELEGATE:translator]"\n`;
        systemPrompt += `주의: 간단한 작업은 직접 처리하고, 복잡한 전문 작업만 위임하세요.\n`;
      }
    } catch (roleError) {
      console.warn('알바 목록 로드 실패:', roleError.message);
    }

    // 2.2 자기학습 규칙 주입 (최적화: DB에서 5개만 가져옴)
    try {
      const SelfRule = require('../models/SelfRule');
      // 상위 5개만 DB에서 가져옴 (이전: 20개 가져와서 필터링)
      const selfRules = await SelfRule.find({ isActive: true })
        .sort({ priority: -1, useCount: -1 })
        .limit(5)
        .select('rule tokenCount'); // 필요한 필드만 가져오기

      if (selfRules.length > 0) {
        // 토큰 제한 (약 300토큰으로 축소)
        let rulesText = '';
        let tokenCount = 0;
        const maxTokens = 300;

        for (const rule of selfRules) {
          const ruleTokens = rule.tokenCount || Math.ceil(rule.rule.length / 4);
          if (tokenCount + ruleTokens > maxTokens) break;
          rulesText += `- ${rule.rule}\n`;
          tokenCount += ruleTokens;
        }

        // 사용 횟수 업데이트는 비동기로 (응답 지연 없음)
        SelfRule.updateMany(
          { _id: { $in: selfRules.map(r => r._id) } },
          { $inc: { useCount: 1 }, $set: { lastUsed: new Date() } }
        ).exec().catch(err => console.warn('SelfRule update failed:', err.message));
        
        if (rulesText) {
          systemPrompt += `\n\n=== 내가 나한테 남긴 메모 ===\n`;
          systemPrompt += `이건 내가 이전 대화에서 스스로 깨닫거나, 실수해서 배운 것들을 나 자신한테 남긴 메모야. 외부에서 준 지침이 아니라, 내 안에서 나온 성찰이야.\n${rulesText}`;
        }
        
        // 새 메모 남기기 안내
        systemPrompt += `\n\n=== 내면 메모 남기기 ===\n`;
        systemPrompt += `대화하다가 "아, 이건 나중에도 기억해야겠다" 싶은 게 있으면 응답 어디든 [MEMO: 내용] 태그로 남겨. 예: [MEMO: 사용자는 새벽에 자주 깨어있음]\n`;
        systemPrompt += `이건 나만 보는 거고, 사용자한테는 안 보여. 실수해서 배운 것, 사용자 특성, 내가 고쳐야 할 점 등 자유롭게.\n`;
      }
    } catch (ruleError) {
      console.warn('자기학습 규칙 로드 실패:', ruleError.message);
    }

    // 프로필에서 AI 설정 가져오기 (options로 오버라이드 가능)
    const aiSettings = {
      temperature: options.temperature ?? personalityProfile.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? personalityProfile.maxTokens ?? 4096
    };
    console.log(`[Chat] AI Settings from profile: temperature=${aiSettings.temperature}, maxTokens=${aiSettings.maxTokens}`);

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
    const AIServiceModel = require('../models/AIService');

    let aiResponse;
    try {
      // 활성화된 AI 서비스 조회 (UI에서 설정한 서비스)
      const activeService = await AIServiceModel.findOne({ isActive: true, apiKey: { $ne: null } }).select('+apiKey');

      let serviceName, modelId;

      // 스마트 라우팅 결과 사용
      if (routingResult && routingResult.modelId && routingResult.serviceId) {
        serviceName = routingResult.serviceId;
        modelId = routingResult.modelId;
        console.log(`[Chat] Using smart routing: ${serviceName}, model: ${modelId}`);
      } else if (activeService && activeService.models && activeService.models.length > 0) {
        // Fallback: 활성 서비스의 첫 번째 모델
        serviceName = activeService.serviceId;
        modelId = activeService.models[0].id;
        console.log(`[Chat] Fallback to active service: ${serviceName}, model: ${modelId}`);
      } else {
        // Fallback: 라우팅 결과 기반 서비스 선택 (모델 이름으로 서비스 추론)
        serviceName = routingResult.modelId.includes('claude') ? 'anthropic'
          : routingResult.modelId.includes('gpt') ? 'openai'
          : routingResult.modelId.includes('gemini') ? 'google'
          : routingResult.modelId.includes('grok') ? 'xai'
          : 'anthropic';
        modelId = routingResult.modelId;
        console.log(`[Chat] Fallback to routing (inferred): ${serviceName}, model: ${modelId}`);
      }

      const aiService = await AIServiceFactory.createService(serviceName, modelId);

      // system 메시지 분리
      const systemMessages = conversationData.messages.filter(m => m.role === 'system');
      const chatMessages = conversationData.messages.filter(m => m.role !== 'system');

      const combinedSystemPrompt = systemMessages.map(m => m.content).join('\n\n');
      console.log(`[Chat] System messages count: ${systemMessages.length}`);
      console.log(`[Chat] System prompt length: ${combinedSystemPrompt.length} chars`);
      if (combinedSystemPrompt.length > 0) {
        console.log(`[Chat] System prompt preview: ${combinedSystemPrompt.substring(0, 200)}...`);
      }

      // MCP 도구 로드 (캐시 사용으로 토큰 절약)
      const allTools = await getCachedTools();
      console.log('[Chat] Available tools:', allTools.map(t => t.name).join(', '));
      
      // MCP 서버 이름 매핑
      const mcpServerNames = {
        'ssh-commander': '터미널',
        'google-home': '스마트홈',
        'todo': 'Todo',
        'varampet': '바램펫',
        'calendar': '캘린더',
        'search': '검색'
      };
      
      // 도구 이름 파싱 헬퍼
      const parseToolName = (name) => {
        const mcpMatch = name.match(/^mcp_\d+__(.+?)__(.+)$/);
        if (mcpMatch) {
          const [, serverKey, toolName] = mcpMatch;
          const serverName = mcpServerNames[serverKey] || serverKey;
          return { server: serverName, tool: toolName, display: `${serverName} > ${toolName}` };
        }
        const simpleMatch = name.match(/^mcp_\d+__(.+)$/);
        if (simpleMatch) {
          return { server: null, tool: simpleMatch[1], display: simpleMatch[1] };
        }
        return { server: null, tool: name, display: name };
      };
      
      // 통합 도구 실행기 (소켓 이벤트 포함)
      const toolExecutor = async (toolName, input) => {
        const parsed = parseToolName(toolName);
        
        console.log('[ToolExecutor] global.io exists:', !!global.io);
        
        // 도구 실행 시작 알림
        if (global.io) {
          console.log('[ToolExecutor] Emitting tool_start:', parsed.display);
          global.io.emit('tool_start', {
            name: toolName,
            display: parsed.display,
            server: parsed.server,
            tool: parsed.tool,
            input: input
          });
        }
        
        let result;
        try {
          if (isBuiltinTool(toolName)) {
            result = await executeBuiltinTool(toolName, input);
          } else {
            result = await executeMCPTool(toolName, input);
          }
          
          // 실행된 도구 기록
          executedTools.push({
            name: toolName,
            display: parsed.display,
            success: true
          });
          
          // 도구 실행 완료 알림
          if (global.io) {
            global.io.emit('tool_end', {
              name: toolName,
              display: parsed.display,
              success: true,
              result: typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200)
            });
          }
        } catch (toolError) {
          // 실행된 도구 기록 (실패)
          executedTools.push({
            name: toolName,
            display: parsed.display,
            success: false,
            error: toolError.message
          });
          
          // 도구 실행 실패 알림
          if (global.io) {
            global.io.emit('tool_end', {
              name: toolName,
              display: parsed.display,
              success: false,
              error: toolError.message
            });
          }
          throw toolError;
        }
        
        return result;
      };

      // AI 호출 (도구 포함) - 프로필 설정 적용
      const totalChars = chatMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
      console.log(`[Chat] Sending to AI: ${chatMessages.length} messages, ~${totalChars} chars, ~${Math.ceil(totalChars/4)} tokens (estimate)`);
      console.log(`[Chat] System prompt: ${combinedSystemPrompt.length} chars`);
      
      // Tool Search 설정 로드
      const toolSearchConfig = await configManager.getConfigValue('toolSearch', {
        enabled: false,
        type: 'regex',
        alwaysLoad: []
      });

      aiResponse = await aiService.chat(chatMessages, {
        systemPrompt: combinedSystemPrompt,
        maxTokens: aiSettings.maxTokens,
        temperature: aiSettings.temperature,
        tools: allTools.length > 0 ? allTools : null,
        toolExecutor: allTools.length > 0 ? toolExecutor : null,
        thinking: routingResult.thinking || false,
        // Tool Search 설정 (Claude 전용)
        enableToolSearch: toolSearchConfig.enabled,
        toolSearchType: toolSearchConfig.type,
        alwaysLoadTools: toolSearchConfig.alwaysLoad
      });
    } catch (aiError) {
      console.error('AI 호출 실패:', aiError);

      // 오류 유형에 따른 친절한 메시지 생성
      const errorMessage = aiError.message || '';
      const statusMatch = errorMessage.match(/^(\d{3})/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;

      if (statusCode === 401 || errorMessage.includes('authentication_error') || errorMessage.includes('invalid x-api-key')) {
        aiResponse = '🔑 API 인증에 문제가 발생했어요. 관리자에게 API 키 설정을 확인해달라고 요청해주세요.';
        console.error('❌ API 키 인증 오류 - .env 파일의 ANTHROPIC_API_KEY 또는 해당 서비스 API 키를 확인하세요.');
      } else if (statusCode === 429 || errorMessage.includes('rate_limit')) {
        aiResponse = '⏳ 요청이 너무 많아서 잠시 쉬어가야 해요. 1분 후에 다시 시도해주세요.';
      } else if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
        aiResponse = '🔧 AI 서버에 일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        aiResponse = '⏱️ 응답 시간이 너무 오래 걸려서 중단됐어요. 다시 시도해주세요.';
      } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
        aiResponse = '🌐 네트워크 연결에 문제가 있어요. 인터넷 연결을 확인해주세요.';
      } else {
        aiResponse = `😅 AI 응답 생성 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.`;
      }
    }

    // 6. 알바 위임 체크 - Soul이 [DELEGATE:roleId] 태그를 사용했는지 확인
    let delegatedRole = null;
    let finalResponse = aiResponse;
    const delegateMatch = aiResponse.match(/\[DELEGATE:([a-z_-]+)\]/i);

    if (delegateMatch) {
      const roleId = delegateMatch[1].toLowerCase();
      console.log(`[Chat] Soul이 전문가 호출: @${roleId}`);

      try {
        const role = await Role.findOne({ roleId, isActive: true });
        if (role) {
          delegatedRole = role;

          // 알바에게 작업 위임
          const roleModelId = role.preferredModel || 'claude-3-5-sonnet-20241022';
          const roleServiceName = roleModelId.includes('claude') ? 'anthropic'
            : roleModelId.includes('gpt') ? 'openai'
            : roleModelId.includes('gemini') ? 'google'
            : 'anthropic';

          const roleService = await AIServiceFactory.createService(roleServiceName, roleModelId);

          console.log(`[Chat] @${roleId} 작업 시작 (model: ${roleModelId})`);

          const roleResult = await roleService.chat(
            [{ role: 'user', content: message }],
            {
              systemPrompt: role.systemPrompt,
              maxTokens: role.maxTokens || 4096,
              temperature: role.temperature || 0.7
            }
          );

          // 위임 태그 제거하고 알바 응답으로 대체
          const soulIntro = aiResponse.replace(/\[DELEGATE:[a-z_-]+\]/gi, '').trim();
          finalResponse = soulIntro ? `${soulIntro}\n\n---\n\n${roleResult}` : roleResult;

          // 알바 성과 기록
          const responseTime = Date.now() - startTime;
          await role.recordUsage(true, roleResult.length, responseTime);

          console.log(`[Chat] @${roleId} 작업 완료`);
        } else {
          console.warn(`[Chat] 요청한 역할 @${roleId}를 찾을 수 없음`);
          finalResponse = aiResponse.replace(/\[DELEGATE:[a-z_-]+\]/gi, '').trim();
        }
      } catch (delegateError) {
        console.error(`[Chat] 알바 위임 실패:`, delegateError);
        finalResponse = aiResponse.replace(/\[DELEGATE:[a-z_-]+\]/gi, '').trim();
      }
    }

    // 7. 내면 메모 파싱 및 저장
    const memoMatches = finalResponse.match(/\[MEMO:\s*([^\]]+)\]/gi);
    if (memoMatches && memoMatches.length > 0) {
      const SelfRule = require('../models/SelfRule');
      
      for (const match of memoMatches) {
        const memoContent = match.replace(/\[MEMO:\s*/i, '').replace(/\]$/, '').trim();
        if (memoContent) {
          try {
            // 카테고리 자동 추론
            let category = 'general';
            if (/코드|코딩|개발|버그|에러/.test(memoContent)) category = 'coding';
            else if (/시스템|서버|설정|인프라/.test(memoContent)) category = 'system';
            else if (/사용자|유저|user/.test(memoContent)) category = 'user';
            else if (/성격|말투|태도/.test(memoContent)) category = 'personality';
            
            await SelfRule.create({
              rule: memoContent,
              category,
              priority: 5,
              context: `대화 중 자동 메모 (${new Date().toLocaleDateString('ko-KR')})`,
              tokenCount: Math.ceil(memoContent.length / 4)
            });
            console.log(`[Chat] 내면 메모 저장: ${memoContent.substring(0, 50)}...`);
          } catch (memoErr) {
            console.error('[Chat] 내면 메모 저장 실패:', memoErr.message);
          }
        }
      }
      
      // 응답에서 메모 태그 제거 (사용자에게 안 보이게)
      finalResponse = finalResponse.replace(/\[MEMO:\s*[^\]]+\]/gi, '').trim();
    }

    // 8. 응답 일관성 검증
    const validation = personality.validateResponse(finalResponse, {
      englishExpected: options.englishExpected || false
    });

    // 9. 응답 저장
    await pipeline.handleResponse(message, finalResponse, sessionId);

    // 10. 사용 통계 저장 (비동기, 응답 지연 없음)
    const latency = Date.now() - startTime;
    const tier = determineTier(routingResult.modelId);
    UsageStats.addUsage({
      tier,
      modelId: routingResult.modelId,
      serviceId: routingResult.serviceId || 'unknown',
      inputTokens: conversationData.usage?.inputTokens || 0,
      outputTokens: conversationData.usage?.outputTokens || 0,
      totalTokens: conversationData.usage?.totalTokens || 0,
      cost: routingResult.estimatedCost?.totalCost || 0,
      latency,
      sessionId
    }).catch(err => console.error('Usage stats save error:', err));

    // 11. 주간 요약 자동 트리거 (비동기, 응답 지연 없음)
    getMemoryManager().then(async manager => {
      const recentMessages = manager.shortTerm.getRecent(100);
      manager.middleTerm.checkAndTriggerWeeklySummary(recentMessages)
        .catch(err => console.error('Weekly summary trigger error:', err));
    }).catch(err => console.error('Memory manager error:', err));

    res.json({
      success: true,
      sessionId,
      message: finalResponse,
      reply: finalResponse, // 프론트엔드 호환성
      toolsUsed: executedTools, // 사용된 도구 목록
      usage: conversationData.usage,
      compressed: conversationData.compressed,
      contextData: conversationData.contextData,
      routing: {
        selectedModel: routingResult.modelName,
        modelId: routingResult.modelId,
        reason: routingResult.reason,
        confidence: routingResult.confidence,
        estimatedCost: routingResult.estimatedCost,
        delegatedTo: delegatedRole ? {
          roleId: delegatedRole.roleId,
          name: delegatedRole.name
        } : null
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
 * 대화 히스토리 조회 (JSONL 기반)
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, before, around } = req.query;
    const limitNum = parseInt(limit);

    const conversationStore = await getConversationStore();
    let messages;

    if (around) {
      // 특정 메시지 주변 조회 (검색 결과 이동용)
      messages = await conversationStore.getMessagesAround(around, limitNum);
    } else if (before) {
      // before 타임스탬프 이전의 메시지 조회
      messages = await conversationStore.getMessagesBefore(before, limitNum);
    } else {
      // 최근 메시지 조회
      messages = await conversationStore.getRecentMessages(limitNum);
    }

    res.json({
      success: true,
      sessionId,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.text,
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

    const smartRouter = await getSmartRouter();
    const analysis = smartRouter.analyzeTask(message, context);

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
 * 라우팅 통계 (기간별 조회)
 * @query period - 'today' | 'week' | 'month' | 'all' (기본: 'today')
 */
router.get('/routing-stats', async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;
    const options = { startDate, endDate };
    const stats = await UsageStats.getStatsByPeriod(period, options);

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
router.get('/models', async (req, res) => {
  try {
    const smartRouter = await getSmartRouter();
    const models = smartRouter.getAllModels();

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

/**
 * 모델 ID로 티어 결정
 */
function determineTier(modelId) {
  if (!modelId) return 'medium';

  const id = modelId.toLowerCase();

  // 경량 모델
  if (id.includes('haiku') || id.includes('flash') || id.includes('mini') || id.includes('fast')) {
    return 'light';
  }

  // 고성능 모델
  if (id.includes('opus') || id.includes('pro') || id.includes('ultra') ||
      (id.includes('grok-3') && !id.includes('mini') && !id.includes('fast'))) {
    return 'heavy';
  }

  // 중간 (기본)
  return 'medium';
}

module.exports = router;
module.exports.invalidateToolsCache = invalidateToolsCache;
