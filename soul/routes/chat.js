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
const { isProactiveActive } = require('../utils/proactive-messenger');
const configManager = require('../utils/config');
const { getAlbaWorker } = require('../utils/alba-worker');

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
let _cachedToolsCacheKey = null;
const TOOLS_CACHE_TTL = 60000; // 1분 캐시

async function getCachedTools() {
  const now = Date.now();
  const proactiveOn = isProactiveActive();
  const cacheKey = proactiveOn ? 'proactive' : 'basic';

  if (_cachedTools && _cachedToolsCacheKey === cacheKey && (now - _cachedToolsTimestamp) < TOOLS_CACHE_TTL) {
    return _cachedTools;
  }

  const mcpTools = await loadMCPTools({ includeProactive: proactiveOn });
  _cachedTools = [...builtinTools, ...mcpTools];
  _cachedToolsTimestamp = now;
  _cachedToolsCacheKey = cacheKey;
  console.log(`[Chat] Tools cache refreshed: ${_cachedTools.length} tools (proactive: ${proactiveOn})`);
  return _cachedTools;
}

// 도구 캐시 무효화 (설정 변경 시 호출)
function invalidateToolsCache() {
  _cachedTools = null;
  _cachedToolsTimestamp = 0;
  _cachedToolsCacheKey = null;
}


/**
 * POST /api/chat
 * 메시지 전송 및 응답 (핵심 엔드포인트)
 * + Phase 8: 스마트 라우팅 및 단일 인격
 */
router.post('/', async (req, res) => {
  // 디버그 로그 (환경변수로 활성화 시에만)
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const DEBUG_ENABLED = process.env.SOUL_DEBUG === 'true';
  const logFile = process.env.SOUL_DEBUG_LOG || path.join(os.homedir(), '.soul', 'debug-chat.log');
  const debugLog = DEBUG_ENABLED ? (msg) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
  } : () => {};

  try {
    const { message, sessionId = 'main-conversation', options = {} } = req.body;
    debugLog(`=== New request: ${message?.substring(0, 50)}... ===`);

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

    // === Long Context 최적화: 문서/컨텍스트 먼저, 지침은 나중에 ===
    // Claude 권장: 문서를 상단에, 쿼리/지침을 하단에 배치하면 30% 성능 향상

    // 1단계: 컨텍스트/문서 섹션 (상단)
    let contextSection = '';

    // 1-1. 알바(전문가) 팀 정보
    try {
      const activeRoles = await Role.getActiveRoles();
      if (activeRoles.length > 0) {
        contextSection += `<available_experts>
다음 전문가들에게 작업을 위임할 수 있음:
`;
        activeRoles.forEach(role => {
          contextSection += `- @${role.roleId}: ${role.name} - ${role.description} (트리거: ${role.triggers.slice(0, 3).join(', ')})\n`;
        });
        contextSection += `위임 방법: [DELEGATE:역할ID]
</available_experts>\n\n`;
      }
    } catch (roleError) {
      console.warn('알바 목록 로드 실패:', roleError.message);
    }

    // 1-2. 자기학습 메모 (내면 성찰)
    try {
      const SelfRule = require('../models/SelfRule');
      const selfRules = await SelfRule.find({ isActive: true })
        .sort({ priority: -1, useCount: -1 })
        .limit(5)
        .select('rule tokenCount');

      if (selfRules.length > 0) {
        let rulesText = '';
        let tokenCount = 0;
        const maxTokens = 300;

        for (const rule of selfRules) {
          const ruleTokens = rule.tokenCount || Math.ceil(rule.rule.length / 4);
          if (tokenCount + ruleTokens > maxTokens) break;
          rulesText += `- ${rule.rule}\n`;
          tokenCount += ruleTokens;
        }

        // 사용 횟수 업데이트는 비동기로
        SelfRule.updateMany(
          { _id: { $in: selfRules.map(r => r._id) } },
          { $inc: { useCount: 1 }, $set: { lastUsed: new Date() } }
        ).exec().catch(err => console.warn('SelfRule update failed:', err.message));

        if (rulesText) {
          contextSection += `<self_notes>
이전 대화에서 스스로 깨닫거나 배운 것들:
${rulesText}</self_notes>\n\n`;
        }
      }
    } catch (ruleError) {
      console.warn('자기학습 규칙 로드 실패:', ruleError.message);
    }

    // 1-3. 사용자 프로필 (autoIncludeInContext인 필드만)
    let userProfileSection = '';
    let userName = '';
    try {
      const ProfileModel = require('../models/Profile');
      const userProfile = await ProfileModel.getOrCreateDefault('default');
      if (userProfile) {
        let profileLines = [];
        const basicInfo = userProfile.basicInfo || {};
        for (const [key, field] of Object.entries(basicInfo)) {
          if (field?.value && field?.visibility?.autoIncludeInContext) {
            const labels = { name: '이름', country: '국가', timezone: '시간대', language: '언어' };
            profileLines.push(`- ${labels[key] || key}: ${field.value}`);
            if (key === 'name') userName = field.value;
          }
        }
        const customFields = userProfile.customFields || [];
        for (const f of customFields) {
          if (f.value) {
            profileLines.push(`- ${f.label}: ${f.value}`);
          }
        }
        if (profileLines.length > 0) {
          userProfileSection = `<user_profile>\n${profileLines.join('\n')}\n</user_profile>\n\n`;
        }
      }
    } catch (profileError) {
      console.warn('사용자 프로필 로드 실패:', profileError.message);
    }

    // 2단계: 인격/행동 지침 (하단에 배치될 것)
    let basePrompt = personality.generateSystemPrompt({
      model: routingResult.modelId,
      context: options.context || {}
    });

    // 3단계: 핵심 규칙 (지침 섹션)
    const instructionsSection = `
<instructions>
도구 사용:
- tool_use 기능으로만 호출 (텍스트로 태그 작성 금지)
- 도구 결과 추측/날조 금지
- <tool_use>, <function_call>, <thinking> 태그 직접 작성 금지

메모 남기기:
- 기억할 것이 있으면 [MEMO: 내용] 태그 사용
- 예: [MEMO: 사용자는 새벽에 자주 깨어있음]
- 메모는 사용자에게 보이지 않음
</instructions>`;

    // 최종 조합: 컨텍스트(문서) → 사용자프로필 → 인격 → 지침 순서
    let systemPrompt = '';
    if (contextSection) {
      systemPrompt = contextSection;
    }
    if (userProfileSection) {
      systemPrompt += userProfileSection;
    }
    systemPrompt += basePrompt;
    systemPrompt += instructionsSection;

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

    // 3.5 도구 수 미리 확인 (토큰 예산 계산용)
    const preloadedTools = await getCachedTools();
    const estimatedToolCount = Math.min(preloadedTools.length, 12); // 최대 12개까지 선택됨

    // 4. 대화 메시지 구성
    const conversationData = await pipeline.buildConversationMessages(
      message,
      sessionId,
      { ...options, toolCount: estimatedToolCount }
    );

    // 5. AI 응답 생성 (실제 AI 호출)
    const { AIServiceFactory } = require('../utils/ai-service');
    const AIServiceModel = require('../models/AIService');

    let aiResponse;
    let actualUsage = {}; // 실제 API가 반환한 토큰 사용량
    // 토큰 분류 정보 (대시보드용)
    let tokenBreakdown = { messages: 0, system: 0, tools: 0, toolCount: 0 };
    let serviceName, modelId;
    try {

      // 모델명으로 서비스 추론하는 헬퍼
      function inferServiceFromModel(model) {
        const lower = model.toLowerCase();
        if (lower.includes('claude')) return 'anthropic';
        if (lower.includes('gpt') && !lower.includes('gpt-oss')) return 'openai';
        if (lower.includes('gemini')) return 'google';
        if (lower.includes('grok')) return 'xai';
        if (lower.includes('llama') || lower.includes('meta-llama/')) return 'huggingface';
        if (lower.includes('qwen')) return 'huggingface';
        if (lower.includes('mistral')) return 'huggingface';
        if (lower.includes('gpt-oss') || lower.includes('openai/')) return 'huggingface';
        return null;
      }

      // 유효한 서비스명인지 확인
      const VALID_SERVICES = ['anthropic', 'openai', 'google', 'xai', 'huggingface', 'ollama', 'lightning', 'vertex', 'openrouter'];

      // 스마트 라우팅 결과 사용
      if (routingResult && routingResult.modelId) {
        modelId = routingResult.modelId;
        serviceName = routingResult.serviceId;

        // serviceId가 없거나 유효하지 않으면 모델명에서 추론
        if (!serviceName || !VALID_SERVICES.includes(serviceName)) {
          const inferred = inferServiceFromModel(modelId);
          if (inferred) {
            console.log(`[Chat] Invalid serviceId "${serviceName}", inferred: ${inferred} from model: ${modelId}`);
            serviceName = inferred;
          }
        }

        console.log(`[Chat] Using routing: ${serviceName}, model: ${modelId}`);
      } else {
        throw new Error('No routing result or model specified');
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

      // MCP 도구 사용 (이미 캐시에서 로드됨)
      let allTools = preloadedTools;
      debugLog(`Total tools available: ${allTools.length}`);
      debugLog(`Tool names: ${allTools.map(t => t.name).join(', ')}`);
      console.log('[Chat] Total tools available:', allTools.length);

      // 도구 선택: 알바(로컬 LLM)가 있어야 MCP 도구 사용 가능
      // 알바 없음 → builtin만 (AI가 컨텍스트에서 판단)
      // 알바 있음 → builtin + 알바가 고른 MCP 도구
      const builtinToolNames = builtinTools.map(t => t.name);
      const builtinOnly = allTools.filter(t => builtinToolNames.includes(t.name));
      const mcpTools = allTools.filter(t => !builtinToolNames.includes(t.name));

      if (mcpTools.length > 0) {
        try {
          const alba = await getAlbaWorker();
          if (alba.initialized) {
            const budget = Math.max(12 - builtinOnly.length, 5);
            const selected = await alba.selectTools(message, mcpTools, budget);
            if (selected && selected.length > 0) {
              allTools = [...builtinOnly, ...selected];
              console.log('[Chat] Alba selected tools:', selected.map(t => t.name).join(', '));
            } else {
              allTools = builtinOnly;
            }
          } else {
            // 알바 없음 → MCP 도구 사용 불가
            allTools = builtinOnly;
            console.log('[Chat] No alba worker - builtin tools only');
          }
        } catch (e) {
          allTools = builtinOnly;
          console.warn('[Chat] Tool selection failed, builtin only:', e.message);
        }
      }
      console.log('[Chat] Using tools:', allTools.map(t => t.name).join(', '));
      
      // 도구 이름 파싱 헬퍼 (mcp_123__server__tool → server > tool)
      const parseToolName = (name) => {
        const mcpMatch = name.match(/^mcp_\d+__(.+?)__(.+)$/);
        if (mcpMatch) {
          const [, serverKey, toolName] = mcpMatch;
          return { server: serverKey, tool: toolName, display: `${serverKey} > ${toolName}` };
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

      // === 2단계 도구 호출: 복잡도에 따라 동적 결정 ===
      const totalChars = chatMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
      const hasTools = allTools.length > 0;
      const systemPromptTokens = Math.ceil(combinedSystemPrompt.length / 4);
      const messageTokens = Math.ceil(totalChars / 4);

      // 컨텍스트 복잡도 정보 (pipeline에서 전달)
      const contextLevel = conversationData.contextNeeds?.level || 'full';
      console.log(`[Chat] Context level: ${contextLevel} (${conversationData.contextNeeds?.reason || 'unknown'})`);

      // Tool Search 설정 로드
      const toolSearchConfig = await configManager.getConfigValue('toolSearch', {
        enabled: false,
        type: 'regex',
        alwaysLoad: []
      });

      let aiResult;
      let actualToolCount = 0;
      const TOOL_REQUEST_TAG = '[NEED_TOOLS]';

      // 기억/과거 관련 키워드가 있으면 Phase 1 스킵 → 바로 도구와 함께 호출
      const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop()?.content || '';
      const memoryKeywords = /기억|작년|예전|지난번|저번|과거|이전에|그때|몇\s?달\s?전|몇\s?주\s?전|어제|지난\s?주|지난\s?달|작업하던|이야기하던|recall|remember/i;
      const needsMemory = memoryKeywords.test(lastUserMsg);

      if (hasTools && contextLevel !== 'minimal') {
        if (needsMemory) {
          // 기억/과거 질문: Phase 1 스킵, 바로 도구와 함께 호출
          console.log(`[Chat] Memory-related query detected, skipping Phase 1 → direct with tools (${allTools.length})`);
          actualToolCount = allTools.length;

          aiResult = await aiService.chat(chatMessages, {
            systemPrompt: combinedSystemPrompt,
            maxTokens: aiSettings.maxTokens,
            temperature: aiSettings.temperature,
            tools: allTools,
            toolExecutor: toolExecutor,
            thinking: routingResult.thinking || false,
            enableToolSearch: toolSearchConfig.enabled,
            toolSearchType: toolSearchConfig.type,
            alwaysLoadTools: toolSearchConfig.alwaysLoad
          });
        } else {
        // minimal이 아닌 경우: 2-phase 도구 호출
        // 1차 호출: 도구 없이 — 답할 수 있으면 바로 답하고, 못 하면 [NEED_TOOLS]
        const phase1Prompt = combinedSystemPrompt + `\n\n도구(검색, 기억 조회 등) 없이 답할 수 있으면 바로 답하세요. 외부 정보가 필요해서 답할 수 없으면 "${TOOL_REQUEST_TAG}"만 출력하세요.`;

        console.log(`[Chat] Phase 1: Without tools (${chatMessages.length} messages, ~${totalChars} chars)`);

        const phase1Result = await aiService.chat(chatMessages, {
          systemPrompt: phase1Prompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: null,
          toolExecutor: null,
          thinking: routingResult.thinking || false,
        });

        const phase1Text = typeof phase1Result === 'object' ? phase1Result.text : phase1Result;
        const phase1Usage = typeof phase1Result === 'object' ? phase1Result.usage : {};

        if (phase1Text && phase1Text.trim().includes(TOOL_REQUEST_TAG)) {
          // 2차 호출: 도구 포함
          console.log(`[Chat] Phase 2: AI requested tools, retrying with ${allTools.length} tools`);
          actualToolCount = allTools.length;

          aiResult = await aiService.chat(chatMessages, {
            systemPrompt: combinedSystemPrompt,
            maxTokens: aiSettings.maxTokens,
            temperature: aiSettings.temperature,
            tools: allTools,
            toolExecutor: toolExecutor,
            thinking: routingResult.thinking || false,
            enableToolSearch: toolSearchConfig.enabled,
            toolSearchType: toolSearchConfig.type,
            alwaysLoadTools: toolSearchConfig.alwaysLoad
          });
        } else {
          // 도구 불필요 — 1차 응답 사용
          console.log(`[Chat] Phase 1 sufficient, no tools needed`);
          aiResult = phase1Result;
        }
        }
      } else {
        // minimal 또는 도구 없음: 바로 응답 (Phase 1 스킵)
        console.log(`[Chat] Direct call (${contextLevel === 'minimal' ? 'minimal context - skip phase1' : 'no tools'})`);
        aiResult = await aiService.chat(chatMessages, {
          systemPrompt: combinedSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: null,
          toolExecutor: null,
          thinking: routingResult.thinking || false,
        });
      }

      const toolsTokenEstimate = actualToolCount * 700;
      const totalTokenEstimate = messageTokens + systemPromptTokens + toolsTokenEstimate;

      tokenBreakdown = {
        messages: messageTokens,
        system: systemPromptTokens,
        tools: toolsTokenEstimate,
        toolCount: actualToolCount
      };

      console.log(`[Chat] Final: tools(${actualToolCount})=${toolsTokenEstimate}, total=${totalTokenEstimate}`);

      // aiResult는 { text, usage } 객체 또는 문자열
      if (typeof aiResult === 'object' && aiResult.text !== undefined) {
        aiResponse = aiResult.text;
        actualUsage = aiResult.usage || {};
      } else {
        aiResponse = aiResult;
        actualUsage = {};
      }
    } catch (aiError) {
      console.error('AI 호출 실패:', aiError);

      // 오류 유형에 따른 친절한 메시지 생성
      const errorMessage = aiError.message || '';
      const statusMatch = errorMessage.match(/\((\d{3})\)/) || errorMessage.match(/^(\d{3})/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;

      if (statusCode === 401 || errorMessage.includes('authentication_error') || errorMessage.includes('invalid x-api-key')) {
        aiResponse = '🔑 API 인증에 문제가 발생했어요. 관리자에게 API 키 설정을 확인해달라고 요청해주세요.';
        console.error('❌ API 키 인증 오류 - .env 파일의 ANTHROPIC_API_KEY 또는 해당 서비스 API 키를 확인하세요.');
      } else if (statusCode === 402 || statusCode === 429 || errorMessage.includes('spend limit') || errorMessage.includes('insufficient') || errorMessage.includes('rate_limit') || errorMessage.includes('rate-limit')) {
        aiResponse = '⏳ 무료 모델이 일시적으로 불안정해요 (재시도 3회 실패). 잠시 후 다시 시도하거나, 다른 모델로 전환해보세요.';
      } else if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
        aiResponse = '🔧 AI 서버에 일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        aiResponse = '⏱️ 응답 시간이 너무 오래 걸려서 중단됐어요. 다시 시도해주세요.';
      } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
        aiResponse = '🌐 네트워크 연결에 문제가 있어요. 인터넷 연결을 확인해주세요.';
      } else {
        aiResponse = `😅 AI 응답 생성 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.\n\n[DEBUG] ${errorMessage.substring(0, 200)}`;
      }
    }

    // 빈 응답 안전장치
    if (!aiResponse || (typeof aiResponse === 'string' && aiResponse.trim() === '')) {
      console.warn('[Chat] AI returned empty response');
      aiResponse = '🤔 응답을 생성하지 못했어요. 다시 시도해주세요.';
    }

    // 6. 알바 위임 체크 - Soul이 [DELEGATE:roleId] 태그를 사용했는지 확인
    let delegatedRole = null;
    let finalResponse = aiResponse;
    const delegateMatch = typeof aiResponse === 'string' ? aiResponse.match(/\[DELEGATE:([a-z_-]+)\]/i) : null;

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

          const roleResultObj = await roleService.chat(
            [{ role: 'user', content: message }],
            {
              systemPrompt: role.systemPrompt,
              maxTokens: role.maxTokens || 4096,
              temperature: role.temperature || 0.7
            }
          );

          // roleResult는 { text, usage } 객체 또는 문자열
          const roleResult = typeof roleResultObj === 'object' && roleResultObj.text !== undefined
            ? roleResultObj.text
            : roleResultObj;

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

    // 9. 사용 통계 준비
    const latency = Date.now() - startTime;
    const tier = determineTier(routingResult.modelId, routingResult.tier);

    // 10. 응답 저장 (라우팅 정보 포함)
    try {
      await pipeline.handleResponse(message, finalResponse, sessionId, {
        routing: {
          modelId: routingResult.modelId,
          serviceId: routingResult.serviceId,
          tier
        },
        toolsUsed: executedTools.length > 0 ? executedTools : undefined
      });
      console.log('[Chat] Response saved successfully');
    } catch (saveError) {
      console.error('[Chat] ❌ Failed to save response:', saveError.message);
      console.error('[Chat] Stack:', saveError.stack);
    }

    // 11. 사용 통계 저장 (비동기, 응답 지연 없음)
    // actualUsage: API가 반환한 실제 토큰 사용량 (input_tokens, output_tokens)
    const inputTokens = actualUsage.input_tokens || 0;
    const outputTokens = actualUsage.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    // 비용 계산 (서비스/모델별)
    let cost = 0;
    const lowerModelId = (routingResult.modelId || '').toLowerCase();
    if (lowerModelId.includes('opus')) {
      cost = (inputTokens * 0.015 + outputTokens * 0.075) / 1000;
    } else if (lowerModelId.includes('sonnet')) {
      cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;
    } else if (lowerModelId.includes('haiku')) {
      cost = (inputTokens * 0.0008 + outputTokens * 0.004) / 1000;
    } else if (lowerModelId.includes('gpt-4o')) {
      cost = (inputTokens * 0.005 + outputTokens * 0.015) / 1000;
    } else if (lowerModelId.includes('gpt-4')) {
      cost = (inputTokens * 0.03 + outputTokens * 0.06) / 1000;
    } else if (lowerModelId.includes('gemini')) {
      cost = (inputTokens * 0.00125 + outputTokens * 0.005) / 1000;
    }

    console.log(`[Chat] Usage: ${inputTokens} input + ${outputTokens} output = ${totalTokens} tokens, ${cost.toFixed(6)}`);

    UsageStats.addUsage({
      tier,
      modelId: routingResult.modelId,
      serviceId: serviceName || routingResult.serviceId || 'unknown',
      inputTokens,
      outputTokens,
      totalTokens,
      tokenBreakdown, // 토큰 분류 정보
      cost,
      latency,
      sessionId,
      category: 'chat'
    }).catch(err => console.error('Usage stats save error:', err));

    // 11. 주간 요약 자동 트리거 (비동기, 응답 지연 없음)
    getMemoryManager().then(async manager => {
      const recentMessages = manager.shortTerm.getRecent(100);
      manager.middleTerm.checkAndTriggerWeeklySummary(recentMessages)
        .catch(err => console.error('Weekly summary trigger error:', err));
    }).catch(err => console.error('Memory manager error:', err));

    // 상세 토큰 사용량 (실시간 대시보드용)
    const detailedTokenUsage = {
      // 실제 API 사용량
      actual: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens
      },
      // 입력 토큰 분류 (어디에 사용됐는지)
      breakdown: {
        messages: tokenBreakdown.messages,
        system: tokenBreakdown.system,
        tools: tokenBreakdown.tools,
        toolCount: tokenBreakdown.toolCount
      },
      // 비용 정보
      cost: {
        usd: cost,
        krw: Math.round(cost * 1450) // 대략적인 환율
      },
      // 메타 정보
      meta: {
        model: routingResult.modelId,
        service: routingResult.serviceId,
        tier,
        latency,
        timestamp: new Date().toISOString()
      }
    };

    res.json({
      success: true,
      sessionId,
      message: finalResponse,
      reply: finalResponse, // 프론트엔드 호환성
      toolsUsed: executedTools, // 사용된 도구 목록
      usage: conversationData.usage,
      tokenUsage: detailedTokenUsage, // 상세 토큰 사용량 (실시간용)
      compressed: conversationData.compressed,
      contextData: conversationData.contextData,
      routing: {
        selectedModel: routingResult.modelName,
        modelId: routingResult.modelId,
        serviceId: routingResult.serviceId,
        tier: tier,
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
    // 에러 메시지에 스택 정보 간략 포함 (디버깅용)
    const errorDetail = error.message || 'Unknown error';
    const errorStack = error.stack ? error.stack.split('\n').slice(0, 3).join(' → ') : '';
    console.error('Error stack:', errorStack);
    res.status(500).json({
      success: false,
      error: errorDetail,
      message: errorDetail
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
        timestamp: m.timestamp,
        // 라우팅 정보 (assistant 메시지용)
        routing: m.routing || null,
        // 도구 사용 정보 (있으면 포함)
        toolsUsed: m.metadata?.toolsUsed || m.toolsUsed || null
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
 * DELETE /api/chat/routing-stats
 * 모든 사용 통계 삭제
 */
router.delete('/routing-stats', async (req, res) => {
  try {
    const result = await UsageStats.deleteMany({});
    console.log(`[Stats] Deleted ${result.deletedCount} usage records`);

    res.json({
      success: true,
      message: `${result.deletedCount}개의 통계 기록이 삭제되었습니다.`
    });
  } catch (error) {
    console.error('Error deleting routing stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/embedding-models
 * 활성 서비스별 임베딩 모델 목록 조회
 * - OpenRouter: /api/v1/embeddings/models
 * - OpenAI: /v1/models → embedding 필터
 * - Google: /v1beta/models → embedContent 필터
 */
router.get('/embedding-models', async (req, res) => {
  try {
    const db = require('../db');
    if (!db.db) db.init();

    const allServices = db.db.prepare(
      'SELECT service_id, name, api_key, base_url FROM ai_services WHERE is_active = 1 AND api_key IS NOT NULL AND api_key != ?'
    ).all('');

    const groups = []; // { service, serviceId, models[] }

    const fetchers = allServices.map(async (svc) => {
      const sid = svc.service_id;
      try {
        if (sid === 'openrouter') {
          const resp = await fetch('https://openrouter.ai/api/v1/embeddings/models', {
            headers: { 'Authorization': `Bearer ${svc.api_key}` }
          });
          if (!resp.ok) return;
          const data = await resp.json();
          const models = (data.data || []).map(m => ({
            id: m.id,
            name: m.name || m.id,
            context_length: m.context_length || null
          }));
          if (models.length) groups.push({ service: 'OpenRouter', serviceId: sid, models });

        } else if (sid === 'openai') {
          const resp = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${svc.api_key}` }
          });
          if (!resp.ok) return;
          const data = await resp.json();
          const models = (data.data || [])
            .filter(m => m.id.includes('embedding'))
            .map(m => ({ id: m.id, name: m.id, context_length: null }));
          if (models.length) groups.push({ service: 'OpenAI', serviceId: sid, models });

        } else if (sid === 'google') {
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${svc.api_key}`);
          if (!resp.ok) return;
          const data = await resp.json();
          const models = (data.models || [])
            .filter(m => (m.supportedGenerationMethods || []).includes('embedContent'))
            .map(m => ({
              id: m.name?.replace('models/', '') || m.name,
              name: m.displayName || m.name,
              context_length: m.inputTokenLimit || null
            }));
          if (models.length) groups.push({ service: 'Google', serviceId: sid, models });
        }
        // huggingface, ollama 등: 임베딩 전용 목록 API 없음 → 스킵
      } catch (e) {
        console.warn(`[embedding-models] ${sid} fetch failed:`, e.message);
      }
    });

    await Promise.all(fetchers);

    res.json({ success: true, groups });
  } catch (error) {
    console.error('[embedding-models] Error:', error.message);
    res.json({ success: true, groups: [] });
  }
});

/**
 * POST /api/chat/ingest-memory
 * JSONL 파일을 벌크 임베딩하여 벡터 DB에 저장
 * body: { filePath, batchDelay?, maxChunkChars? }
 */
router.post('/ingest-memory', async (req, res) => {
  try {
    const { filePath, batchDelay, maxChunkChars } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'filePath 필수' });
    }

    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '파일을 찾을 수 없음: ' + filePath });
    }

    const vectorStore = require('../utils/vector-store');
    const result = await vectorStore.ingestJsonl(filePath, {
      batchDelay: batchDelay || 500,
      maxChunkChars: maxChunkChars || 1500,
      onProgress: (progress) => {
        // SSE가 아니므로 서버 로그만
        if (progress.current % 10 === 0) {
          console.log(`[ingest-memory] ${progress.current}/${progress.total} (embedded: ${progress.embedded})`);
        }
      }
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ingest-memory] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/service-billing
 * 서비스별 잔액/사용량 조회
 * - 오픈라우터: 실시간 잔액 API
 * - 나머지: 내부 UsageStats 기반
 */
router.get('/service-billing', async (req, res) => {
  try {
    const db = require('../db');
    if (!db.db) db.init();

    // 활성 서비스 목록 (api_key 있는 것만)
    const allServices = db.db.prepare(
      'SELECT service_id, name, api_key, is_active FROM ai_services WHERE is_active = 1 AND api_key IS NOT NULL AND api_key != ?'
    ).all('');

    const today = new Date().toISOString().split('T')[0];
    const result = [];

    // usage_stats.service → ai_services.service_id 매핑
    // (Gemini 등이 openai-compatible로 기록되는 경우 처리)
    const serviceAliases = {
      'google': ['google', 'openai-compatible'],
      'openai': ['openai'],
      'anthropic': ['anthropic'],
      'huggingface': ['huggingface'],
      'openrouter': ['openrouter'],
      'xai': ['xai'],
      'ollama': ['ollama'],
      'lightning': ['lightning']
    };

    for (const svc of allServices) {
      const sid = svc.service_id;
      const aliases = serviceAliases[sid] || [sid];
      const placeholders = aliases.map(() => '?').join(',');

      // 오늘 사용 통계 집계 (별칭 포함)
      const stats = db.db.prepare(
        `SELECT COUNT(*) as count, SUM(input_tokens + output_tokens) as totalTokens FROM usage_stats WHERE date = ? AND service IN (${placeholders})`
      ).get(today, ...aliases) || { count: 0, totalTokens: 0 };

      // 메타데이터에서 비용 합산
      const metaRows = db.db.prepare(
        `SELECT metadata FROM usage_stats WHERE date = ? AND service IN (${placeholders}) AND metadata IS NOT NULL`
      ).all(today, ...aliases);

      let todayCost = 0;
      for (const row of metaRows) {
        try {
          const meta = JSON.parse(row.metadata);
          if (meta.cost) todayCost += meta.cost;
        } catch (e) { /* skip */ }
      }

      // 톱 모델
      const topModel = db.db.prepare(
        `SELECT model, COUNT(*) as cnt FROM usage_stats WHERE date = ? AND service IN (${placeholders}) GROUP BY model ORDER BY cnt DESC LIMIT 1`
      ).get(today, ...aliases);

      const entry = {
        serviceId: sid,
        name: svc.name,
        todayCost,
        todayRequests: stats.count || 0,
        todayTokens: stats.totalTokens || 0,
        topModel: topModel?.model || null,
        balance: null
      };

      // 오픈라우터: 실시간 잔액
      if (sid === 'openrouter') {
        try {
          const [authResp, creditsResp] = await Promise.all([
            fetch('https://openrouter.ai/api/v1/auth/key', {
              headers: { 'Authorization': `Bearer ${svc.api_key}` }
            }),
            fetch('https://openrouter.ai/api/v1/credits', {
              headers: { 'Authorization': `Bearer ${svc.api_key}` }
            })
          ]);

          if (authResp.ok && creditsResp.ok) {
            const authData = await authResp.json();
            const creditsData = await creditsResp.json();
            entry.balance = {
              ...authData.data,
              total_credits: creditsData.data?.total_credits,
              total_usage: creditsData.data?.total_usage
            };
          }
        } catch (e) {
          console.warn('[Billing] OpenRouter balance fetch failed:', e.message);
        }
      }

      result.push(entry);
    }

    res.json({ success: true, services: result });
  } catch (error) {
    console.error('Error getting service billing:', error);
    res.status(500).json({ success: false, error: error.message });
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
 * @param {string} modelId - 모델 ID
 * @param {string} routingTier - 라우팅 결과의 tier (선택)
 */
function determineTier(modelId, routingTier = null) {
  // 단일 모델 모드면 'single' 반환
  if (routingTier === 'single') {
    return 'single';
  }

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
