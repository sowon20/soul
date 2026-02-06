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
const { loadMCPTools, executeMCPTool, callJinaTool } = require('../utils/mcp-tools');
const { builtinTools, executeBuiltinTool, isBuiltinTool } = require('../utils/builtin-tools');
const { isProactiveActive } = require('../utils/proactive-messenger');
const configManager = require('../utils/config');
// alba-worker는 더 이상 사용하지 않음 (도구 선택은 tool-worker 알바가 {need} 단계에서 처리)

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
    const { attachments = [] } = options; // 첨부 파일 정보
    debugLog(`=== New request: ${message?.substring(0, 50)}... ===`);
    if (attachments.length > 0) {
      debugLog(`Attachments: ${attachments.map(a => a.name).join(', ')}`);
    }

    // 실행된 도구 기록 (응답에 포함)
    const executedTools = [];
    let toolNeeds = []; // {need} 요청 내용
    let toolsSelected = []; // 알바가 선택한 도구 이름

    // 디버그용 변수 (상위 스코프에 선언)
    let combinedSystemPrompt = '';
    let chatMessages = [];
    let allTools = [];

    if (!message && attachments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message or attachments required'
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

    // 1-1. 알바(전문가) 팀 정보 (내부 워커 제외)
    try {
      const activeRoles = await Role.getActiveRoles();
      const internalWorkers = ['digest-worker', 'embedding-worker', 'tool-worker'];
      const delegatableRoles = activeRoles.filter(r => !internalWorkers.includes(r.roleId) && r.triggers?.length > 0);
      if (delegatableRoles.length > 0) {
        contextSection += `<!-- 출처: 설정 > 알바 (활성화된 역할) -->\n`;
        contextSection += `<available_experts>\n다음 전문가들에게 작업을 위임할 수 있음:\n`;
        delegatableRoles.forEach(role => {
          contextSection += `- @${role.roleId}: ${role.name} - ${role.description} (트리거: ${role.triggers.slice(0, 3).join(', ')})\n`;
        });
        contextSection += `위임 방법: [DELEGATE:역할ID]\n</available_experts>\n\n`;
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
          contextSection += `<!-- 출처: AI가 add_my_rule 도구로 자동 저장한 규칙 -->\n`;
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

    // Tool Routing 설정 로드
    const toolRoutingConfig = await configManager.getConfigValue('toolRouting', { enabled: false });
    const isToolRoutingEnabled = toolRoutingConfig?.enabled === true;

    // 3단계: 핵심 규칙 (지침 섹션)
    let instructionsSection;
    if (isToolRoutingEnabled) {
      // {need} 모드: 도구 정의 없이, 자연어로 요청
      instructionsSection = `
<instructions>
도구 사용:
- 직접 사용할 수 있는 도구가 없음
- 무언가 필요하면 {need} 태그 사용
- {need} 뒤에 자연어로 원하는 것을 설명
- 결과가 돌아오면 그걸 바탕으로 답변
- {need}는 응답 중 아무 위치에나 사용 가능, 여러 개 가능 (각각 별도 줄)

주의:
- {need}를 쓸 때 주어를 명확히 구분할 것. 사용자의 "나/내"를 "사용자"로 바꿔서 전달
- 예: 사용자 "내 이름 뭐야?" → {need} 사용자의 이름 찾아줘 (X: 내 이름 찾아줘)
- 예: 사용자 "내가 뭘 좋아해?" → {need} 사용자가 좋아하는 것 검색 (X: 내가 좋아하는 것)
- "나/내"가 사용자를 가리키는지, AI를 가리키는지 항상 확인
- 확실하지 않은 건 추측하지 말고 사용자에게 물어라

메모 남기기:
- 기억할 것이 있으면 [MEMO: 내용] 태그 사용
- 예: [MEMO: 사용자는 새벽에 자주 깨어있음]
- 메모는 사용자에게 보이지 않음

응답 포맷:
- 긴 문장은 적절히 줄바꿈하여 가독성 유지
- 한 문단이 3~4문장을 넘기면 줄바꿈으로 나누기
- 목록이나 단계가 있으면 번호/글머리 기호 활용
- 핵심 키워드는 **굵게** 강조 가능
</instructions>`;
    } else {
      instructionsSection = `
<instructions>
도구 사용:
- tool_use 기능으로만 호출 (텍스트로 태그 작성 금지)
- 도구 결과 추측/날조 금지
- <tool_use>, <function_call>, <thinking> 태그 직접 작성 금지

메모 남기기:
- 기억할 것이 있으면 [MEMO: 내용] 태그 사용
- 예: [MEMO: 사용자는 새벽에 자주 깨어있음]
- 메모는 사용자에게 보이지 않음

응답 포맷:
- 긴 문장은 적절히 줄바꿈하여 가독성 유지
- 한 문단이 3~4문장을 넘기면 줄바꿈으로 나누기
- 목록이나 단계가 있으면 번호/글머리 기호 활용
- 핵심 키워드는 **굵게** 강조 가능
</instructions>`;
    }

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

    // 3.6 첨부 파일 정보를 메시지에 추가
    let enhancedMessage = message || '';
    if (attachments && attachments.length > 0) {
      const attachmentInfo = attachments.map(a => {
        const sizeKB = (a.size / 1024).toFixed(1);
        return `- ${a.name} (${a.type}, ${sizeKB}KB): ${a.url}`;
      }).join('\n');
      enhancedMessage = enhancedMessage
        ? `${enhancedMessage}\n\n[첨부 파일]\n${attachmentInfo}`
        : `[첨부 파일]\n${attachmentInfo}`;
      debugLog(`Enhanced message with attachments: ${enhancedMessage}`);
    }

    // 4. 대화 메시지 구성
    const conversationData = await pipeline.buildConversationMessages(
      enhancedMessage,
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
        if (lower.includes('accounts/fireworks') || lower.includes('fireworks')) return 'fireworks';
        if (lower.includes('llama') || lower.includes('meta-llama/')) return 'huggingface';
        if (lower.includes('qwen')) return 'huggingface';
        if (lower.includes('mistral')) return 'huggingface';
        if (lower.includes('gpt-oss') || lower.includes('openai/')) return 'huggingface';
        return null;
      }

      // 유효한 서비스명인지 확인
      const VALID_SERVICES = ['anthropic', 'openai', 'google', 'xai', 'huggingface', 'ollama', 'lightning', 'vertex', 'openrouter', 'fireworks'];

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
      chatMessages = conversationData.messages.filter(m => m.role !== 'system' && m.content && (typeof m.content !== 'string' || m.content.trim()));

      combinedSystemPrompt = systemMessages.map(m => m.content).join('\n\n');
      console.log(`[Chat] System prompt: ${combinedSystemPrompt.length} chars, Messages: ${chatMessages.length}`);

      // MCP 도구 사용 (이미 캐시에서 로드됨)
      allTools = preloadedTools;
      debugLog(`Total tools available: ${allTools.length}`);
      debugLog(`Tool names: ${allTools.map(t => t.name).join(', ')}`);
      console.log('[Chat] Total tools available:', allTools.length);

      // 도구 필터링은 {need} 단계의 tool-worker 알바에게 위임
      // 여기서는 전체 도구를 전달하고, AI가 {need}로 요청하면 tool-worker가 선별
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

      // 도구 입력값 요약 헬퍼
      const summarizeToolInput = (toolName, input) => {
        if (!input) return '';
        switch (toolName) {
          case 'recall_memory':
            return input.query || '';
          case 'get_profile':
            return input.field || '전체';
          case 'update_profile':
            return `${input.field}: ${String(input.value || '').substring(0, 50)}`;
          case 'list_my_rules':
            return input.category || '전체';
          case 'add_my_rule':
            return String(input.rule || '').substring(0, 80);
          case 'delete_my_rule':
            return input.ruleId || '';
          case 'send_message':
            return String(input.message || '').substring(0, 50);
          case 'schedule_message':
            return `${input.time || ''} ${String(input.message || '').substring(0, 30)}`;
          default: {
            const keys = Object.keys(input);
            if (keys.length === 0) return '';
            const firstKey = keys[0];
            return `${firstKey}: ${String(input[firstKey] || '').substring(0, 60)}`;
          }
        }
      };

      // 검색 결과 중복 제거 후처리
      const SEARCH_TOOLS = new Set(['search_web', 'search_arxiv', 'search_ssrn', 'search_jina_blog', 'search_bibtex',
        'parallel_search_web', 'parallel_search_arxiv', 'parallel_search_ssrn']);
      const IMAGE_TOOLS = new Set(['search_images']);

      async function deduplicateToolResult(toolName, result) {
        if (!result) return result;
        const resultStr = typeof result === 'string' ? result : (result.result || '');
        if (!resultStr || resultStr.length < 500) return result; // 짧으면 스킵

        try {
          // 텍스트 검색 결과 → deduplicate_strings
          if (SEARCH_TOOLS.has(toolName)) {
            // snippet 줄 단위로 분리 (title: ...\nsnippet: ... 패턴)
            const lines = resultStr.split('\n').filter(l => l.trim());
            if (lines.length < 5) return result; // 항목이 적으면 스킵

            console.log(`[Dedup] ${toolName}: ${lines.length}줄 → deduplicate_strings 호출`);
            const deduped = await callJinaTool('deduplicate_strings', { strings: lines });
            if (deduped) {
              const parsed = typeof deduped === 'string' ? deduped : JSON.stringify(deduped);
              const originalLen = resultStr.length;
              const newLen = parsed.length;
              console.log(`[Dedup] 결과: ${originalLen} → ${newLen} chars (${Math.round((1 - newLen / originalLen) * 100)}% 절감)`);
              if (typeof result === 'object') {
                return { ...result, result: parsed };
              }
              return parsed;
            }
          }

          // 이미지 검색 결과 → deduplicate_images
          if (IMAGE_TOOLS.has(toolName)) {
            // base64 이미지나 URL 추출
            const urlPattern = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|svg)[^\s"'<>]*/gi;
            const imageUrls = resultStr.match(urlPattern);
            if (imageUrls && imageUrls.length >= 3) {
              console.log(`[Dedup] ${toolName}: ${imageUrls.length}개 이미지 → deduplicate_images 호출`);
              const deduped = await callJinaTool('deduplicate_images', { images: imageUrls });
              if (deduped) {
                const dedupedUrls = typeof deduped === 'string' ? deduped : JSON.stringify(deduped);
                console.log(`[Dedup] 이미지: ${imageUrls.length}개 → 중복 제거 완료`);
                // 중복 제거된 URL 목록을 결과에 추가
                const appendNote = `\n\n[중복 제거된 고유 이미지]\n${dedupedUrls}`;
                if (typeof result === 'object') {
                  return { ...result, result: resultStr + appendNote };
                }
                return resultStr + appendNote;
              }
            }
          }
        } catch (e) {
          console.error(`[Dedup] 후처리 실패 (원본 유지):`, e.message);
        }

        return result; // 실패 시 원본 그대로
      }

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
          // 검색 도구: num 기본값 20으로 제한
          const searchTools = ['search_web', 'search_arxiv', 'search_ssrn', 'search_jina_blog', 'search_images', 'search_bibtex'];
          const actualToolName = parsed.tool || toolName;
          if (searchTools.includes(actualToolName) && !input.num) {
            input.num = 20;
          }

          if (isBuiltinTool(toolName)) {
            result = await executeBuiltinTool(toolName, input);
          } else {
            result = await executeMCPTool(toolName, input);
          }

          // 검색 결과 후처리: 중복 제거 (Jina deduplicate 활용)
          result = await deduplicateToolResult(actualToolName, result);
          
          // 실행된 도구 기록
          executedTools.push({
            name: toolName,
            display: parsed.display,
            success: true,
            inputSummary: summarizeToolInput(toolName, input),
            resultPreview: typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200)
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
            error: toolError.message,
            inputSummary: summarizeToolInput(toolName, input)
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

      if (isToolRoutingEnabled) {
        // === {need} 모드: 전체 대화로 호출, {need} 감지 시 도구만 쥐어줌 ===
        console.log(`[Chat] Tool Routing ON — first call without tools (${chatMessages.length} messages)`);
        aiResult = await aiService.chat(chatMessages, {
          systemPrompt: combinedSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: null,
          toolExecutor: null,
          thinking: routingResult.thinking || false,
        });

        // {need} 감지 및 처리
        let responseText = typeof aiResult === 'object' ? aiResult.text : aiResult;
        console.log(`[Chat] AI response (first call): ${(responseText || '').substring(0, 300)}`);

        // 1) 정규 {need} 패턴
        const needPattern = /\{need\}\s*(.+?)(?:\n|$)/g;
        const needs = [];
        let match;
        while ((match = needPattern.exec(responseText)) !== null) {
          needs.push(match[1].trim());
        }

        // 2) AI가 {도구이름: 설명} 형태로 직접 쓴 경우도 {need}로 변환
        //    등록된 모든 도구 이름을 동적으로 매칭 (하드코딩 없음)
        const toolNames = allTools.map(t => t.name).filter(Boolean);
        const escaped = toolNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (toolNames.length > 0) {
          const fakeToolPattern = new RegExp(`\\{(${escaped.join('|')})[:\\s]+(.+?)\\}`, 'gi');
          let fakeMatch;
          while ((fakeMatch = fakeToolPattern.exec(responseText)) !== null) {
            const toolName = fakeMatch[1];
            const desc = fakeMatch[2].trim();
            needs.push(`${toolName}: ${desc}`);
            console.log(`[Chat] Fake tool tag → need 변환: {${toolName}: ${desc}}`);
          }
        }

        if (needs.length > 0) {
          console.log(`[Chat] {need} detected: ${needs.length} requests`);

          toolNeeds = needs;

          // {need} 요청을 클라이언트에 전송
          if (global.io) {
            global.io.emit('tool_need', {
              needs: needs,
              message: needs.join(', ')
            });
          }

          // tool-worker 알바: 도구 선택만 담당 (실행은 주모델이)
          const toolWorkerRole = await Role.findOne({ roleId: 'tool-worker', isActive: true });
          const routingMode = toolRoutingConfig?.mode || 'single';

          // 도구 카탈로그 (이름 + 설명만, 가벼움)
          const toolCatalog = allTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
          const toolSelectionPrompt = `요청을 분석하여 필요한 도구 이름을 JSON 배열로만 반환하세요.
응답 형식: ["도구이름1", "도구이름2"]
도구를 실행하지 마세요. 이름만 선택하세요. 최대 5개.

사용 가능한 도구:
${toolCatalog}`;

          let selectedToolNames = new Set();

          if (toolWorkerRole) {
            const rawConfig = toolWorkerRole.config || {};
            const roleConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
            const primaryModel = toolWorkerRole.preferredModel || 'openai/gpt-oss-20b:free';
            const primaryService = roleConfig.serviceId || 'openrouter';

            const modelChain = routingMode === 'chain'
              ? [{ modelId: primaryModel, serviceId: primaryService }, ...(roleConfig.fallbackModels || [])]
              : [{ modelId: primaryModel, serviceId: primaryService }];

            console.log(`[Chat] tool-worker ${routingMode} mode (${modelChain.length} models) — tool selection only`);

            // 모든 {need}를 합쳐서 한 번에 도구 선택 요청
            const combinedNeeds = needs.join('\n');
            let selectionSuccess = false;

            for (const modelInfo of modelChain) {
              const _twStart = Date.now();
              try {
                console.log(`[Chat] tool-selector 시도: ${modelInfo.modelId}`);
                const twService = await AIServiceFactory.createService(modelInfo.serviceId, modelInfo.modelId);
                const twResult = await twService.chat(
                  [{ role: 'user', content: combinedNeeds }],
                  {
                    systemPrompt: toolSelectionPrompt,
                    maxTokens: roleConfig.maxTokens || 500,
                    temperature: roleConfig.temperature || 0.2,
                    tools: null,
                    toolExecutor: null
                  }
                );
                const resultText = typeof twResult === 'object' ? twResult.text : twResult;
                console.log(`[Chat] ✅ tool-selector ${modelInfo.modelId} 성공 (${Date.now() - _twStart}ms): ${resultText}`);

                // JSON 배열 파싱
                const jsonMatch = (resultText || '').match(/\[[\s\S]*?\]/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(parsed)) {
                    parsed.slice(0, 5).forEach(name => {
                      if (typeof name === 'string') selectedToolNames.add(name.trim());
                    });
                  }
                }
                // 알바 사용량 기록
                const twUsage = typeof twResult === 'object' ? twResult.usage : null;
                if (twUsage) {
                  const twInput = twUsage.input_tokens || 0;
                  const twOutput = twUsage.output_tokens || 0;
                  UsageStats.addUsage({
                    tier: 'tool-worker',
                    modelId: modelInfo.modelId,
                    serviceId: modelInfo.serviceId,
                    inputTokens: twInput,
                    outputTokens: twOutput,
                    totalTokens: twInput + twOutput,
                    cost: 0, // 무료 모델 또는 별도 계산
                    latency: Date.now() - _twStart,
                    sessionId,
                    category: 'tool-selection'
                  }).catch(err => console.error('Tool-worker usage save error:', err));
                }

                selectionSuccess = true;
                break;
              } catch (twErr) {
                console.warn(`[Chat] ❌ tool-selector ${modelInfo.modelId} 실패 (${Date.now() - _twStart}ms): ${twErr.message}`);
              }
            }

            if (!selectionSuccess || selectedToolNames.size === 0) {
              // 알바 실패 시 폴백: builtin 도구 전부 제공
              console.warn('[Chat] tool-selector 실패, builtin 도구 전체 제공');
              const { builtinTools } = require('../utils/builtin-tools');
              builtinTools.forEach(t => selectedToolNames.add(t.name));
            }
          } else {
            // tool-worker 없으면 builtin 전부 제공
            console.warn('[Chat] tool-worker 역할 없음, builtin 도구 전체 제공');
            const { builtinTools } = require('../utils/builtin-tools');
            builtinTools.forEach(t => selectedToolNames.add(t.name));
          }

          // 선택된 도구의 전체 스키마 추출
          const selectedTools = allTools.filter(t => selectedToolNames.has(t.name));
          console.log(`[Chat] 선택된 도구 (${selectedTools.length}개): ${selectedTools.map(t => t.name).join(', ')}`);

          toolsSelected = selectedTools.map(t => t.name);

          // 알바 도구 선택 결과를 클라이언트에 전송
          if (global.io) {
            global.io.emit('tool_selected', {
              tools: toolsSelected,
              display: toolsSelected.join(', ')
            });
          }

          // 주모델 재호출: 1차 응답 이어서 + 도구만 쥐어줌 (대화 전체 재전송 X)
          const cleanedResponse = responseText.replace(/\{need\}\s*.+?(?:\n|$)/g, '').trim();
          const lastUserMessage = chatMessages[chatMessages.length - 1];
          const currentMessages = [
            lastUserMessage,
            { role: 'assistant', content: cleanedResponse || '(도구를 사용하여 확인하겠습니다)' },
            { role: 'user', content: '도구가 준비되었습니다. 사용하여 답변해주세요.' }
          ];

          console.log(`[Chat] 2차 호출: 도구 ${selectedTools.length}개 쥐어줌 (메시지 ${currentMessages.length}개, 전체 ${chatMessages.length}개 재전송 안함)`);

          aiResult = await aiService.chat(currentMessages, {
            systemPrompt: combinedSystemPrompt,
            maxTokens: aiSettings.maxTokens,
            temperature: aiSettings.temperature,
            tools: selectedTools,
            toolExecutor: toolExecutor,
            thinking: routingResult.thinking || false,
          });

          // 2차+ 응답에서도 {need} 감지 → 추가 도구 호출 루프 (최대 3회)
          const MAX_NEED_LOOPS = 3;
          for (let loopIdx = 0; loopIdx < MAX_NEED_LOOPS; loopIdx++) {
            const loopText = typeof aiResult === 'object' ? aiResult.text : aiResult;
            const loopNeeds = [];
            const loopNeedPattern = /\{need\}\s*(.+?)(?:\n|$)/g;
            let loopMatch;
            while ((loopMatch = loopNeedPattern.exec(loopText)) !== null) {
              loopNeeds.push(loopMatch[1].trim());
            }
            // fake tool 패턴도 감지
            if (toolNames.length > 0) {
              const loopFakePattern = new RegExp(`\\{(${escaped.join('|')})[:\\s]+(.+?)\\}`, 'gi');
              let loopFake;
              while ((loopFake = loopFakePattern.exec(loopText)) !== null) {
                loopNeeds.push(`${loopFake[1]}: ${loopFake[2].trim()}`);
              }
            }

            if (loopNeeds.length === 0) break; // 더 이상 {need} 없으면 종료

            console.log(`[Chat] ${loopIdx + 3}차 호출: {need} ${loopNeeds.length}개 추가 감지`);
            toolNeeds.push(...loopNeeds);

            // 이전 응답에서 {need} 제거한 텍스트
            const loopCleaned = loopText.replace(/\{need\}\s*.+?(?:\n|$)/g, '').trim();
            const loopMessages = [
              lastUserMessage,
              { role: 'assistant', content: loopCleaned || '(추가 확인이 필요합니다)' },
              { role: 'user', content: '추가 도구를 사용하여 답변해주세요.' }
            ];

            aiResult = await aiService.chat(loopMessages, {
              systemPrompt: combinedSystemPrompt,
              maxTokens: aiSettings.maxTokens,
              temperature: aiSettings.temperature,
              tools: selectedTools,
              toolExecutor: toolExecutor,
              thinking: routingResult.thinking || false,
            });
          }
        }

        // 실제 실행된 도구 수 또는 선택된 도구 수 중 큰 값
        actualToolCount = Math.max(
          executedTools.length,
          (typeof selectedToolNames !== 'undefined' && selectedToolNames) ? selectedToolNames.size : 0
        );
      } else if (hasTools && contextLevel !== 'minimal') {
        // 기존 방식: 도구와 함께 호출
        console.log(`[Chat] Calling with ${allTools.length} tools (${chatMessages.length} messages, ~${totalChars} chars)`);
        actualToolCount = allTools.length;

        // 🔍 DEBUG: AI에게 실제 전송되는 전체 데이터
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🤖 [AI INPUT] 실제 전송 데이터');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('시스템 프롬프트:');
        console.log(combinedSystemPrompt);
        console.log('\n메시지 배열 (' + chatMessages.length + '개):');
        chatMessages.forEach((msg, i) => {
          console.log(`  [${i}] ${msg.role}: ${msg.content?.substring(0, 100)}${msg.content?.length > 100 ? '...' : ''}`);
        });
        console.log('\n도구 목록 (' + allTools.length + '개):');
        allTools.forEach(tool => {
          console.log(`  - ${tool.name}: ${tool.description?.substring(0, 80) || '설명 없음'}`);
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
        // minimal 또는 도구 없음: 도구 없이 응답
        console.log(`[Chat] Direct call (${contextLevel === 'minimal' ? 'minimal context' : 'no tools'})`);
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

      // aiResult는 { text, usage, systemFallback? } 객체 또는 문자열
      var systemFallback = false;
      if (typeof aiResult === 'object' && aiResult.text !== undefined) {
        aiResponse = aiResult.text;
        actualUsage = aiResult.usage || {};
        systemFallback = aiResult.systemFallback || false;
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
        const modelName = routingResult.modelId || '현재 모델';
        aiResponse = `⏳ ${modelName} 요청 한도에 도달했어요. 잠시 후 다시 시도하거나, 다른 모델로 전환해보세요.`;
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

          // 알바 사용량을 UsageStats에도 기록
          const delegateUsage = typeof roleResultObj === 'object' ? roleResultObj.usage : null;
          if (delegateUsage) {
            const dInput = delegateUsage.input_tokens || 0;
            const dOutput = delegateUsage.output_tokens || 0;
            UsageStats.addUsage({
              tier: 'delegate',
              modelId: roleModelId,
              serviceId: roleServiceName,
              inputTokens: dInput,
              outputTokens: dOutput,
              totalTokens: dInput + dOutput,
              cost: 0,
              latency: responseTime,
              sessionId,
              category: 'delegate'
            }).catch(err => console.error('Delegate usage save error:', err));
          }

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

    // 응답에서 내부 태그 제거 ({need}, {도구이름: ...} — 사용자에게 안 보이게)
    finalResponse = finalResponse
      .replace(/\{need\}\s*.+?(?:\n|$)/g, '')
      .replace(/\{(recall_memory|get_profile|update_profile|list_my_rules|add_my_rule|delete_my_rule)[:\s]+.+?\}/gi, '')
      .trim();
    // 동적 도구 이름도 제거
    if (preloadedTools && preloadedTools.length > 0) {
      const toolNames = preloadedTools.map(t => t.name).filter(Boolean);
      const escaped = toolNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const fakePattern = new RegExp(`\\{(${escaped.join('|')})[:\\s]+.+?\\}`, 'gi');
      finalResponse = finalResponse.replace(fakePattern, '').trim();
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
        toolsUsed: executedTools.length > 0 ? executedTools : undefined,
        toolNeeds: toolNeeds.length > 0 ? toolNeeds : undefined,
        toolsSelected: toolsSelected.length > 0 ? toolsSelected : undefined
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
      toolNeeds: toolNeeds.length > 0 ? toolNeeds : undefined, // {need} 요청 내용
      toolsSelected: toolsSelected.length > 0 ? toolsSelected : undefined, // 알바 선택 도구
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
      // 🔍 DEBUG: AI 입력 데이터 (브라우저 콘솔용)
      _debug: {
        systemPrompt: combinedSystemPrompt,
        messages: chatMessages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '') : m.content
        })),
        tools: allTools.map(t => ({ name: t.name, description: t.description })),
        messageCount: chatMessages.length,
        toolCount: allTools.length
      },
      validation: {
        valid: validation.valid,
        score: validation.score,
        issues: validation.issues
      },
      ...(systemFallback ? { systemFallback: true } : {})
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
        toolsUsed: m.metadata?.toolsUsed || m.toolsUsed || null,
        toolNeeds: m.metadata?.toolNeeds || null,
        toolsSelected: m.metadata?.toolsSelected || null
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

      // Fireworks: firectl account get으로 잔액 조회
      if (sid === 'fireworks') {
        try {
          const billingResp = await fetch('http://localhost:5041/api/billing/fireworks');
          if (billingResp.ok) {
            const billingData = await billingResp.json();
            entry.balance = {
              total_credits: billingData.balance,
              total_usage: billingData.usedCredits || 0,
              remaining: billingData.balance
            };
          }
        } catch (e) {
          console.warn('[Billing] Fireworks balance fetch failed:', e.message);
        }
      }

      // OpenAI: 사용량 조회
      if (sid === 'openai') {
        try {
          const billingResp = await fetch('http://localhost:5041/api/billing/openai');
          if (billingResp.ok) {
            const billingData = await billingResp.json();
            entry.balance = {
              total_usage: billingData.total_usage,
              daily_data: billingData.daily_data
            };
          }
        } catch (e) {
          console.warn('[Billing] OpenAI usage fetch failed:', e.message);
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
