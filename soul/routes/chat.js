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
const fs = require('fs');
const path = require('path');
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
const { trackCall: trackAlba } = require('../utils/alba-stats');
const { ToolIntentDetector } = require('../utils/tool-intent-detector');
const { verifyToolResult, saveLieRecord, SKIP_VERIFICATION_TOOLS } = require('../utils/verification-worker');
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
 * 스트리밍 가능한 AI 서비스 호출 래퍼
 * streamChat이 있으면 Socket.io로 실시간 청크 전송, 없으면 기존 chat() 사용
 */
async function callAIWithStreaming(aiService, chatMessages, chatOptions, { emitLifecycle = true } = {}) {
  // streamChat 메서드가 없으면 기존 방식
  if (typeof aiService.streamChat !== 'function') {
    return aiService.chat(chatMessages, chatOptions);
  }

  console.log('[Chat] Using streaming mode');
  if (emitLifecycle && global.io) global.io.emit('stream_start');
  // 2차 호출(emitLifecycle=false)에서도 content 리셋 신호는 보내야 함
  if (!emitLifecycle && global.io) global.io.emit('stream_chunk', { type: 'content_reset' });

  const result = await aiService.streamChat(chatMessages, chatOptions, (type, data) => {
    if (!global.io) return;
    if (type === 'thinking') {
      global.io.emit('stream_chunk', { type: 'thinking', content: data });
    } else if (type === 'content') {
      global.io.emit('stream_chunk', { type: 'content', content: data });
    } else if (type === 'content_replace') {
      // 도구 실행 후 최종 응답으로 content 교체
      global.io.emit('stream_chunk', { type: 'content_replace', content: data });
    } else if (type === 'tool_start') {
      global.io.emit('stream_chunk', { type: 'tool', content: '도구 실행 중...' });
    }
  });

  if (emitLifecycle && global.io) global.io.emit('stream_end');
  return result;
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
    const verificationFailCounts = {}; // 검증 실패 카운터 (2번 기회)
    const filteredContents = []; // 서버 필터로 제거된 내용
    let toolNeeds = []; // {need} 요청 내용
    let toolsSelected = []; // 알바가 선택한 도구 이름
    let visionWorkerResult = null; // vision-worker 사용 결과

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

    console.log(`[Chat] Routing result: tier=${routingResult.tier || 'n/a'}, model=${routingResult.modelId}, service=${routingResult.serviceId}, manager=${routingResult.manager || 'server'}, reason=${routingResult.reason}`);

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
## 도구 사용 (필수)
너는 직접 도구를 호출할 수 없다. 대신 {need} 태그를 써서 필요한 것을 요청하면, 시스템이 적절한 도구를 골라서 너에게 제공한다. 그러면 너는 그 도구를 사용해서 작업을 수행한다.

**반드시 {need}를 써야 하는 경우:**
- 사용자가 정보를 조회/검색하라고 할 때 (프로필, 기억, 규칙 등)
- 사용자가 무언가를 저장/수정/삭제하라고 할 때
- 사용자가 명령 실행, 웹 검색, 파일 읽기/쓰기를 요청할 때
- 사용자 질문에 대한 정확한 답을 모를 때 (추측 금지, 검색 필수)
- 이전 <tool_history>에 이미 있는 결과를 재사용하지 말고, 새 요청이면 새로 {need} 호출

**{need} 문법:**
{need} 자연어로 원하는 것을 설명
- 한 줄에 하나씩, 여러 개 가능
- 응답 중 아무 위치에나 사용 가능

**예시:**
사용자: "내 이름 뭐야?" → {need} 사용자의 프로필에서 이름 조회
사용자: "투두 체크해줘" → {need} 투두 목록 읽기
사용자: "어제 뭐 했지?" → {need} 어제 대화 기억 검색

**절대 금지:**
- 도구 이름이나 파라미터를 직접 쓰지 마라 (예: list_my_memories, search_web 등). {need} 뒤에는 자연어 설명만 쓴다
- <tool_history> 태그를 응답에 직접 작성하지 마라. 이건 시스템이 자동 삽입하는 것이다
- 도구 결과를 날조/추측하지 마라. {need}로 요청해서 실제 결과를 받아야 한다
- 이전 <tool_history>의 결과를 복사해서 새 응답에 붙이지 마라

**주의:**
- {need}를 쓸 때 "나/내"를 "사용자"로 바꿔서 전달
- "할 수 없다"고 거부하지 말고, {need}로 적극 요청할 것
- 확실하지 않은 건 추측하지 말고 검색하거나 사용자에게 물어라

도구실행 및 메시지는 자체적인 AI검증 시스템이 평가하여 사용자에게 공개되므로 솔직해야 한다.

## 응답 포맷
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

도구실행 및 메시지는 자체적인 AI검증 시스템이 평가하여 사용자에게 공개되므로 솔직해야 한다.

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

    // 3.6 첨부 파일을 AI가 읽을 수 있는 documents 배열로 변환
    let enhancedMessage = message || '';
    const attachmentDocuments = [];
    if (attachments && attachments.length > 0) {
      const os = require('os');
      const DATA_DIR = process.env.SOUL_DATA_DIR || path.join(os.homedir(), '.soul');
      const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
      for (const att of attachments) {
        try {
          // URL에서 파일명 추출 (/api/files/abc123.jpg → abc123.jpg)
          const filename = att.url.split('/').pop();
          const filePath = path.join(UPLOAD_DIR, filename);

          if (att.type.startsWith('image/')) {
            // 이미지: base64로 읽어서 AI에게 직접 전달
            const imageData = fs.readFileSync(filePath);
            const base64 = imageData.toString('base64');
            attachmentDocuments.push({
              type: 'image',
              media_type: att.type,
              data: base64
            });
            debugLog(`Image attachment loaded: ${att.name} (${(att.size / 1024).toFixed(1)}KB)`);
          } else if (att.type === 'application/pdf') {
            // PDF: base64로 읽어서 전달
            const pdfData = fs.readFileSync(filePath);
            const base64 = pdfData.toString('base64');
            attachmentDocuments.push({
              type: 'pdf',
              title: att.name,
              data: base64
            });
            debugLog(`PDF attachment loaded: ${att.name}`);
          } else {
            // 텍스트 파일 (txt, md, csv, json): 내용을 텍스트로 읽기
            const textContent = fs.readFileSync(filePath, 'utf-8');
            attachmentDocuments.push({
              type: 'text',
              title: att.name,
              content: textContent
            });
            debugLog(`Text attachment loaded: ${att.name}`);
          }
        } catch (fileErr) {
          console.error(`[Chat] Failed to read attachment ${att.name}:`, fileErr.message);
          // 파일 읽기 실패 시 텍스트로 안내
          enhancedMessage += `\n\n[첨부 파일 읽기 실패: ${att.name}]`;
        }
      }
    }

    // 텍스트 없이 파일만 보낸 경우 — 빈 메시지 방지 (유저에게 안 보임)
    if (!enhancedMessage.trim() && attachmentDocuments.length > 0) {
      enhancedMessage = ' ';
    }

    // 3.7 비전 미지원 모델 + 이미지 첨부 → vision-worker 자동 호출
    const hasImages = attachmentDocuments.some(d => d.type === 'image');
    const modelSupportsVision = (() => {
      const model = (routingResult.modelId || '').toLowerCase();
      const service = (routingResult.serviceId || '').toLowerCase();
      // 비전 네이티브 서비스 (전 모델 비전 지원)
      if (['anthropic', 'google', 'openai'].includes(service)) return true;
      // 비전 전용 모델명 패턴
      if (/\bvl\b|vision|gpt-4o|gemini/.test(model)) return true;
      // 나머지는 비전 미지원으로 간주
      return false;
    })();
    console.log(`[vision-worker] check: hasImages=${hasImages}, model=${routingResult.modelId}, vision=${modelSupportsVision}`);
    if (hasImages && !modelSupportsVision) {
      try {
        const visionRole = await Role.findOne({ roleId: 'vision-worker', isActive: 1 });
        console.log(`[vision-worker] role found: ${!!visionRole}, model: ${visionRole?.preferredModel}`);
        if (visionRole && visionRole.preferredModel) {
          const rawVConfig = visionRole.config || {};
          const vConfig = typeof rawVConfig === 'string' ? JSON.parse(rawVConfig) : rawVConfig;
          const visionChain = [
            { modelId: visionRole.preferredModel, serviceId: vConfig.serviceId },
            ...(vConfig.fallbackModels || [])
          ].filter(m => m.modelId && m.serviceId);

          const imageDocuments = attachmentDocuments.filter(d => d.type === 'image');
          let imageDescription = null;

          // 프론트에 이미지 분석 시작 알림
          if (global.io) global.io.emit('tool_start', {
            name: 'vision-worker',
            display: `🔍 이미지 ${imageDocuments.length}장 분석 중...`,
            input: { model: visionChain[0]?.modelId, images: imageDocuments.length }
          });
          const visionStart = Date.now();

          for (const modelInfo of visionChain) {
            try {
              const { AIServiceFactory } = require('../utils/ai-service');
              const visionService = await AIServiceFactory.createService(modelInfo.serviceId, modelInfo.modelId);
              const visionResult = await visionService.chat(
                [{ role: 'user', content: message || '이 이미지를 분석해주세요.' }],
                {
                  systemPrompt: visionRole.systemPrompt,
                  maxTokens: vConfig.maxTokens || 1000,
                  temperature: vConfig.temperature || 0.3,
                  documents: imageDocuments
                }
              );
              imageDescription = typeof visionResult === 'object' && visionResult.text !== undefined
                ? visionResult.text : visionResult;

              trackAlba('vision-worker', {
                action: 'image-analyze',
                tokens: (typeof visionResult === 'object' && visionResult.usage)
                  ? (visionResult.usage.input_tokens || 0) + (visionResult.usage.output_tokens || 0) : 0,
                latencyMs: Date.now() - visionStart,
                success: true,
                model: modelInfo.modelId,
                detail: `${imageDocuments.length}장 분석`
              });
              console.log(`[vision-worker] 이미지 ${imageDocuments.length}장 분석 완료 (${modelInfo.modelId}, ${Date.now() - visionStart}ms)`);
              break;
            } catch (vErr) {
              console.warn(`[vision-worker] ${modelInfo.modelId} 실패:`, vErr.message);
              trackAlba('vision-worker', {
                action: 'image-analyze',
                tokens: 0,
                latencyMs: Date.now() - visionStart,
                success: false,
                model: modelInfo.modelId,
                detail: vErr.message.slice(0, 100)
              });
              continue;
            }
          }

          if (imageDescription) {
            visionWorkerResult = { model: visionChain[0]?.modelId, imageCount: imageDocuments.length };
            enhancedMessage = `[이미지 분석 결과]\n${imageDescription}\n\n${enhancedMessage}`;
            const nonImageDocs = attachmentDocuments.filter(d => d.type !== 'image');
            attachmentDocuments.length = 0;
            attachmentDocuments.push(...nonImageDocs);
            if (global.io) global.io.emit('tool_end', {
              name: 'vision-worker', success: true,
              result: `이미지 ${imageDocuments.length}장 분석 완료`
            });
          } else {
            if (global.io) global.io.emit('tool_end', {
              name: 'vision-worker', success: false,
              result: '이미지 분석 실패 — 원본 이미지로 시도합니다'
            });
          }
        }
      } catch (visionErr) {
        console.error('[vision-worker] 초기화 실패:', visionErr.message);
        if (global.io) global.io.emit('tool_end', {
          name: 'vision-worker', success: false,
          result: visionErr.message
        });
      }
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
        if (lower.includes('deepseek')) return 'deepseek';
        if (lower.includes('llama') || lower.includes('meta-llama/')) return 'huggingface';
        if (lower.includes('qwen')) return 'qwen';
        if (lower.includes('mistral')) return 'huggingface';
        if (lower.includes('gpt-oss') || lower.includes('openai/')) return 'huggingface';
        return null;
      }

      // 유효한 서비스명인지 확인
      const VALID_SERVICES = ['anthropic', 'openai', 'google', 'xai', 'huggingface', 'ollama', 'lightning', 'vertex', 'openrouter', 'fireworks', 'deepseek', 'qwen'];

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

      // 비전 모델 + 이미지 첨부 시 비전 안내 추가 (hallucination 방지)
      if (modelSupportsVision && attachmentDocuments.some(d => d.type === 'image')) {
        combinedSystemPrompt = '[VISION MODE] 이 대화에 이미지가 첨부되어 있다. 너는 비전 모델이며 이미지를 직접 볼 수 있다. 이미지 내용을 분석하여 답변하라. "이미지를 볼 수 없다"고 말하지 마라.\n\n' + combinedSystemPrompt;
      }

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

          // === 검증 단계 (검증 알바) ===
          let verification = { verdict: 'skip', memo: null };
          const failKey = `${toolName}_${JSON.stringify(input).substring(0, 100)}`;
          const currentFailCount = verificationFailCounts[failKey] || 0;
          const isFinal = currentFailCount > 0; // 2차 이상이면 최종 검증

          if (!SKIP_VERIFICATION_TOOLS.has(actualToolName)) {
            // 검증 시작 알림
            if (global.io) {
              global.io.emit('tool_verify_start', {
                name: toolName,
                display: parsed.display,
                phase: isFinal ? 'final' : 'check'
              });
            }

            verification = await verifyToolResult({
              toolName: actualToolName,
              input,
              result,
              userMessage: message
            });

            // 검증 결과 알림
            if (global.io) {
              global.io.emit('tool_verify', {
                name: toolName,
                display: parsed.display,
                verdict: verification.verdict,
                memo: verification.memo,
                phase: isFinal ? 'final' : 'check'
              });
            }

            // 거짓 감지 시 처리
            if (verification.verdict === 'fail') {
              verificationFailCounts[failKey] = currentFailCount + 1;

              if (verificationFailCounts[failKey] <= 1) {
                // 1차 실패: 간단 메모 + 에러 반환 → AI가 재시도
                console.warn(`[Verify] ❌ 1차 거짓 감지: ${toolName} — ${verification.memo}`);
                executedTools.push({
                  name: toolName,
                  display: parsed.display,
                  success: false,
                  error: `검증 실패: ${verification.memo}`,
                  inputSummary: summarizeToolInput(toolName, input),
                  verificationMemo: verification.memo,
                  verificationVerdict: 'fail'
                });
                return `[검증 실패] ${verification.memo}\n자체 분석결과 거짓이므로 다시 실행합니다.`;
              } else {
                // 2차 실패: 거짓 확정 → 메모리 저장 + 박제
                console.error(`[Verify] ❌❌ 2차 거짓 확정: ${toolName} — ${verification.memo}`);
                await saveLieRecord({ toolName, input, result, memo: verification.memo, failCount: verificationFailCounts[failKey] });
                executedTools.push({
                  name: toolName,
                  display: parsed.display,
                  success: false,
                  error: `❌ 거짓 확정: ${verification.memo}`,
                  inputSummary: summarizeToolInput(toolName, input),
                  verificationMemo: verification.memo,
                  verificationVerdict: 'confirmed_lie',
                  lieStamp: true
                });
                return `[❌ 거짓 확정] ${verification.memo}\n2회 연속 검증 실패. 거짓말 기록이 저장되었습니다.`;
              }
            }
          }

          // 실행된 도구 기록 (통과/참고/스킵)
          executedTools.push({
            name: toolName,
            display: parsed.display,
            success: true,
            inputSummary: summarizeToolInput(toolName, input),
            resultPreview: typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200),
            verificationMemo: verification.memo,
            verificationVerdict: verification.verdict
          });
          
          // 도구 실행 완료 알림
          if (global.io) {
            global.io.emit('tool_end', {
              name: toolName,
              display: parsed.display,
              success: true,
              result: typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200)
            });

            // 캔버스 패널 실시간 업데이트 이벤트
            const canvasToolMap = {
              'recall_memory': 'memory',
              'get_profile': 'profile',
              'update_profile': 'profile'
            };
            // MCP 도구도 매핑: 도구 이름에 todo/memo 관련 키워드 포함 시 todo 패널 업데이트
            let targetPanel = canvasToolMap[toolName];
            if (!targetPanel && /todo|task|memo/i.test(toolName)) {
              targetPanel = 'todo';
            }
            if (targetPanel) {
              global.io.emit('canvas_update', {
                panel: targetPanel,
                tool: toolName,
                input: input,
                result: typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result).substring(0, 500),
                timestamp: new Date().toISOString()
              });
            }
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



      let aiResult;
      let actualToolCount = 0;

      // 서버측 인텐트 감지 (폴백용)
      let serverIntent = { detected: false, suggestedNeeds: [], matches: [] };

      if (isToolRoutingEnabled) {
        // === {need} 모드: 전체 대화로 호출, {need} 감지 시 도구만 쥐어줌 ===

        // 서버측 인텐트 미리 감지 (AI가 {need}를 안 쓸 때 폴백)
        const intentDetector = new ToolIntentDetector(allTools);
        serverIntent = intentDetector.detect(message);
        if (serverIntent.detected) {
          console.log(`[Chat] Server intent detected: ${serverIntent.matches.map(m => `${m.toolName}(${m.score})`).join(', ')}`);
        }

        // Few-shot 예시 주입: AI에게 {need} 사용법을 보여주는 가짜 대화
        const fewShotExamples = [
          { role: 'user', content: '내 프로필 보여줘' },
          { role: 'assistant', content: '네, 프로필을 확인해볼게요!\n{need} 사용자의 프로필 정보 조회' },
          { role: 'user', content: '이거 기억해둬: 매주 월요일 회의' },
          { role: 'assistant', content: '알겠어요, 기억해둘게요!\n{need} 규칙에 저장: 매주 월요일 회의' },
        ];
        const chatMessagesWithFewShot = [...fewShotExamples, ...chatMessages];

        console.log(`[Chat] Tool Routing ON — first call without tools (${chatMessages.length}+${fewShotExamples.length} messages)`);
        // 1차 호출도 스트리밍 (도구 불필요 시 이게 최종 응답이므로)
        // {need} 감지되면 클라이언트에서 stream_end로 정리 후 2차 호출 진행
        aiResult = await callAIWithStreaming(aiService, chatMessagesWithFewShot, {
          systemPrompt: combinedSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: null,
          toolExecutor: null,
          thinking: routingResult.thinking || false,
          documents: attachmentDocuments.length > 0 ? attachmentDocuments : undefined,
        });

        // {need} 감지 및 처리
        let responseText = typeof aiResult === 'object' ? aiResult.text : aiResult;
        console.log(`[Chat] AI response (first call): ${(responseText || '').substring(0, 300)}`);

        // 날조 감지: AI가 <tool_history>를 직접 작성한 경우 제거
        if (responseText && responseText.includes('<tool_history>')) {
          const fabricated = responseText.match(/<tool_history>[\s\S]*?<\/tool_history>/g);
          const fabricatedText = (fabricated || []).join('\n').substring(0, 500);
          console.warn('[Chat] ⚠️ AI가 <tool_history>를 날조함 — 제거 후 텍스트만 사용');
          responseText = responseText.replace(/<tool_history>[\s\S]*?<\/tool_history>/g, '').trim();
          if (typeof aiResult === 'object') aiResult.text = responseText;
          else aiResult = responseText;

          // 필터 기록 추가
          filteredContents.push({ type: 'tool_history_날조', content: fabricatedText });

          // 증거 보존 (메모리)
          try {
            const Memory = require('../models/Memory');
            Memory.upsert('lie_record', `fabrication_${Date.now()}`, {
              type: 'tool_history_fabrication',
              fabricatedContent: fabricatedText,
              timestamp: new Date().toISOString()
            }, {
              importance: 9,
              tags: ['거짓', 'fabrication', 'tool_history_날조'],
              category: 'verification'
            });
            console.warn('[Chat] ❌ 날조 증거 메모리 저장 완료');
          } catch (e) {
            console.error('[Chat] 날조 기록 저장 실패:', e.message);
          }
        }

        // 1) {need} 패턴 — 다양한 변형 인식
        //    {need} 설명, {Need} 설명, {need:\n설명}, {\n need \n}\n설명
        const needPattern = /\{[Nn][Ee]{2}[Dd]\}[:\s]*\s*(.+?)(?:\n|$)/g;
        const needs = [];
        let match;
        while ((match = needPattern.exec(responseText)) !== null) {
          needs.push(match[1].trim());
        }

        // 1-b) 줄바꿈된 {need} — "{\n need\n}\n도구이름 파라미터" 형태
        const needMultilinePattern = /\{\s*need\s*\}\s*\n\s*(.+?)(?:\n|$)/gi;
        while ((match = needMultilinePattern.exec(responseText)) !== null) {
          const desc = match[1].trim();
          if (desc && !needs.includes(desc)) needs.push(desc);
        }

        // 1-c) [need] 설명, **{need}** 설명 등 마크다운으로 감싼 변형
        const needAltPattern = /(?:\*{0,2})\[?{[Nn]eed}\]?(?:\*{0,2})[:\s]*\s*(.+?)(?:\n|$)/g;
        while ((match = needAltPattern.exec(responseText)) !== null) {
          const desc = match[1].trim();
          if (!needs.includes(desc)) needs.push(desc);
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

        // 3) 폴백: AI가 {need}를 안 썼지만 서버가 인텐트를 감지한 경우
        if (needs.length === 0 && serverIntent.detected) {
          console.log(`[Chat] ⚡ AI가 {need} 미사용 → 서버 인텐트 폴백 적용 (${serverIntent.suggestedNeeds.length}개)`);
          needs.push(...serverIntent.suggestedNeeds);
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

          // 도구 카탈로그: MCP 접두사 제거하여 깔끔하게 (tool-worker가 이해하기 쉽게)
          const toolCatalog = allTools.map(t => {
            const shortName = t.name.includes('__') ? t.name.split('__').pop() : t.name;
            return `- ${t.name} (${shortName}): ${t.description}`;
          }).join('\n');

          const toolSelectionPrompt = `사용자 요청에 **꼭 필요한 도구만** 최소한으로 골라라.
응답 형식: ["도구이름1"]  (전체 이름 사용, mcp_ 접두사 포함)
도구를 실행하지 마세요. 이름만 선택하세요.

핵심 규칙 (반드시 따를 것):
- "체크해줘/완료해줘/토글" → toggle_task 하나만 (read 불필요, 모델이 알아서 읽음)
- "추가해줘" → add_task 하나만
- "삭제해줘/지워줘" → delete_task 하나만
- "보여줘/읽어줘" → read_todo 하나만
- "섹션 추가" → add_section 하나만
- "섹션 삭제" → delete_section 하나만
- 메모 관련 → read_memo / write_memo / add_memo_item / delete_memo_item 중 하나만
- 기억/검색 → recall_memory 하나만
- 여러 작업을 동시에 요청한 경우에만 여러 도구 선택 (최대 5개)

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

            // 사용자 원본 메시지 + AI의 {need} 요청을 함께 전달
            const combinedNeeds = `사용자: ${message}\nAI 요청: ${needs.join(', ')}`;
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
                const twLatency = Date.now() - _twStart;
                const twTokens = twUsage ? (twUsage.input_tokens || 0) + (twUsage.output_tokens || 0) : 0;
                if (twUsage) {
                  UsageStats.addUsage({
                    tier: 'tool-worker',
                    modelId: modelInfo.modelId,
                    serviceId: modelInfo.serviceId,
                    inputTokens: twUsage.input_tokens || 0,
                    outputTokens: twUsage.output_tokens || 0,
                    totalTokens: twTokens,
                    latency: twLatency,
                    sessionId,
                    category: 'tool-selection'
                  }).catch(err => console.error('Tool-worker usage save error:', err));
                }

                trackAlba('tool-worker', {
                  action: 'tool-select',
                  tokens: twTokens || Math.ceil(combinedNeeds.length / 4),
                  latencyMs: twLatency,
                  success: true,
                  model: modelInfo.modelId,
                  detail: `selected: ${[...selectedToolNames].join(', ')}`
                });

                selectionSuccess = true;
                break;
              } catch (twErr) {
                trackAlba('tool-worker', {
                  action: 'tool-select',
                  tokens: 0,
                  latencyMs: Date.now() - _twStart,
                  success: false,
                  model: modelInfo.modelId,
                  detail: twErr.message
                });
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

          // 도구 보강: 수정 도구가 선택되면 대응하는 읽기 도구를 자동 추가
          // (toggle_task가 있으면 read_todo도 넣어야 AI가 현재 상태 조회 가능)
          const writeTools = [...selectedToolNames].filter(n => /toggle|write|update|add|delete|remove/i.test(n));
          for (const writeTool of writeTools) {
            const prefix = writeTool.includes('__') ? writeTool.split('__').slice(0, -1).join('__') : '';
            // 같은 MCP 서버의 read 계열 도구 찾아서 추가
            const siblingReads = allTools.filter(t => {
              const sameServer = prefix ? t.name.startsWith(prefix + '__') : !t.name.includes('__');
              return sameServer && /read|list|get/i.test(t.name) && !selectedToolNames.has(t.name);
            });
            for (const readTool of siblingReads) {
              selectedToolNames.add(readTool.name);
              console.log(`[Chat] 🔧 읽기 도구 자동 보강: ${readTool.name} (← ${writeTool})`);
            }
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
          // 2차 호출 시스템 프롬프트 축약 (성격/말투만 유지, 규칙·포맷 지침 제거 → 토큰 절약)
          // basePrompt = 성격/말투, instructionsSection = 도구·포맷 규칙 → 성격만 남김
          const toolSystemPrompt = basePrompt + '\n도구를 사용하여 사용자 요청을 처리하세요. 도구 결과를 자연스럽게 전달하세요.';
          // 1차 thinking 보존 (최종 응답에 다시 붙임)
          const firstThinkingMatch = responseText.match(/<thinking>([\s\S]*?)<\/thinking>/);
          const firstThinking = firstThinkingMatch ? firstThinkingMatch[0] : '';
          // {need} 태그와 <thinking> 태그 제거 (2차 호출 context에서)
          const cleanedResponse = responseText
            .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
            .replace(/\{need\}\s*.+?(?:\n|$)/g, '')
            .trim();
          const lastUserMessage = chatMessages[chatMessages.length - 1];
          // 2차 호출 안내 메시지: 선택된 도구명과 용도를 구체적으로 안내
          const toolNameList = selectedTools.map(t => t.name).join(', ');
          const toolGuide = `도구가 준비되었습니다: ${toolNameList}\n즉시 도구를 호출하세요. 설명하지 말고 바로 실행하세요.`;
          const currentMessages = [
            lastUserMessage,
            { role: 'assistant', content: cleanedResponse || '(도구를 사용하여 확인하겠습니다)' },
            { role: 'user', content: toolGuide }
          ];

          console.log(`[Chat] 2차 호출: 도구 ${selectedTools.length}개 쥐어줌 (메시지 ${currentMessages.length}개, 전체 ${chatMessages.length}개 재전송 안함)`);

          // 2차 호출에서는 thinking 끔, stream_start/end 안 보냄 (기존 스트리밍 요소에 이어서 표시)
          aiResult = await callAIWithStreaming(aiService, currentMessages, {
            systemPrompt: toolSystemPrompt,
            maxTokens: aiSettings.maxTokens,
            temperature: aiSettings.temperature,
            tools: selectedTools,
            toolExecutor: toolExecutor,
            thinking: false,
          }, { emitLifecycle: false });

          // 2차+ 응답에서도 {need} 감지 → 추가 도구 호출 루프 (최대 2회)
          // 이미 처리된 {need}는 중복 방지
          const processedNeeds = new Set(needs.map(n => n.toLowerCase()));
          const MAX_NEED_LOOPS = 2;
          for (let loopIdx = 0; loopIdx < MAX_NEED_LOOPS; loopIdx++) {
            const loopText = typeof aiResult === 'object' ? aiResult.text : aiResult;
            if (!loopText) break;

            const loopNeeds = [];
            const loopNeedPattern = /\{[Nn][Ee]{2}[Dd]\}[:\s]*\s*(.+?)(?:\n|$)/g;
            let loopMatch;
            while ((loopMatch = loopNeedPattern.exec(loopText)) !== null) {
              const desc = loopMatch[1].trim();
              if (!processedNeeds.has(desc.toLowerCase())) {
                loopNeeds.push(desc);
                processedNeeds.add(desc.toLowerCase());
              }
            }
            // fake tool 패턴도 감지
            if (toolNames.length > 0) {
              const loopFakePattern = new RegExp(`\\{(${escaped.join('|')})[:\\s]+(.+?)\\}`, 'gi');
              let loopFake;
              while ((loopFake = loopFakePattern.exec(loopText)) !== null) {
                const desc = `${loopFake[1]}: ${loopFake[2].trim()}`;
                if (!processedNeeds.has(desc.toLowerCase())) {
                  loopNeeds.push(desc);
                  processedNeeds.add(desc.toLowerCase());
                }
              }
            }

            if (loopNeeds.length === 0) break; // 새로운 {need} 없으면 종료

            console.log(`[Chat] ${loopIdx + 3}차 호출: {need} ${loopNeeds.length}개 추가 감지`);
            toolNeeds.push(...loopNeeds);

            // 이전 응답에서 {need} 제거한 텍스트
            const loopCleaned = loopText
              .replace(/\{[Nn][Ee]{2}[Dd]\}[:\s]*\s*.+?(?:\n|$)/g, '')
              .trim();
            const loopMessages = [
              lastUserMessage,
              { role: 'assistant', content: loopCleaned || '(추가 확인이 필요합니다)' },
              { role: 'user', content: '도구 결과를 바탕으로 사용자에게 답변해주세요. {need}를 다시 쓰지 마세요.' }
            ];

            aiResult = await aiService.chat(loopMessages, {
              systemPrompt: toolSystemPrompt,
              maxTokens: aiSettings.maxTokens,
              temperature: aiSettings.temperature,
              tools: selectedTools,
              toolExecutor: toolExecutor,
              thinking: false,
            });
          }

          // 1차 thinking을 최종 응답에 다시 붙이기
          if (firstThinking && typeof aiResult === 'object' && aiResult.text) {
            if (!aiResult.text.includes('<thinking>')) {
              aiResult.text = firstThinking + '\n\n' + aiResult.text;
            }
          } else if (firstThinking && typeof aiResult === 'string') {
            if (!aiResult.includes('<thinking>')) {
              aiResult = firstThinking + '\n\n' + aiResult;
            }
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

        aiResult = await callAIWithStreaming(aiService, chatMessages, {
          systemPrompt: combinedSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: allTools,
          toolExecutor: toolExecutor,
          thinking: routingResult.thinking || false,
          documents: attachmentDocuments.length > 0 ? attachmentDocuments : undefined,
        });
      } else {
        // minimal 또는 도구 없음: 도구 없이 응답
        console.log(`[Chat] Direct call (${contextLevel === 'minimal' ? 'minimal context' : 'no tools'})`);
        aiResult = await callAIWithStreaming(aiService, chatMessages, {
          systemPrompt: combinedSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: null,
          toolExecutor: null,
          thinking: routingResult.thinking || false,
          documents: attachmentDocuments.length > 0 ? attachmentDocuments : undefined,
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

    // 빈 응답 안전장치: 자동 재호출 (최대 2회)
    // thinking 태그만 있고 실제 내용이 없는 것도 빈 응답으로 처리
    const getVisibleContent = (resp) => {
      if (!resp) return '';
      const text = typeof resp === 'string' ? resp : (resp.text || '');
      return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').replace(/\{need\}[\s\S]*?(?:\n|$)/g, '').trim();
    };
    const MAX_EMPTY_RETRIES = 2;
    for (let emptyRetry = 0; emptyRetry < MAX_EMPTY_RETRIES; emptyRetry++) {
      if (getVisibleContent(aiResponse) !== '') break;

      console.warn(`[Chat] 빈 응답 감지 — 자동 재호출 (${emptyRetry + 1}/${MAX_EMPTY_RETRIES})`);
      try {
        const retryMessages = [
          ...chatMessages,
          { role: 'user', content: '[system] 비정상적으로 응답이 끝났습니다. 자동 연결되었으니 멈춘 곳에서 다시 시작하세요. 도구 실행 결과가 있으면 그 결과를 바탕으로 사용자에게 답변하세요.' }
        ];
        const retryResult = await callAIWithStreaming(aiService, retryMessages, {
          systemPrompt: combinedSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: toolsSelected.length > 0 ? allTools.filter(t => toolsSelected.includes(t.name)) : null,
          toolExecutor: toolExecutor,
          thinking: false,
        }, { emitLifecycle: false });
        aiResponse = typeof retryResult === 'object' ? retryResult.text : retryResult;
        if (retryResult && typeof retryResult === 'object') {
          actualUsage = retryResult.usage || actualUsage;
        }
      } catch (retryErr) {
        console.error(`[Chat] 빈 응답 재호출 실패:`, retryErr.message);
        break;
      }
    }
    // 재호출 후에도 빈 응답이면 최종 안전장치
    if (!aiResponse || (typeof aiResponse === 'string' && aiResponse.trim() === '') || (typeof aiResponse === 'object' && (!aiResponse.text || aiResponse.text.trim() === ''))) {
      console.warn('[Chat] 재호출 후에도 빈 응답');
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
          const rawRoleConfig = role.config || {};
          const roleConfig = typeof rawRoleConfig === 'string' ? JSON.parse(rawRoleConfig) : rawRoleConfig;
          const roleServiceName = roleConfig.serviceId || inferServiceFromModel(roleModelId) || 'anthropic';

          const roleService = await AIServiceFactory.createService(roleServiceName, roleModelId);

          console.log(`[Chat] @${roleId} 작업 시작 (model: ${roleModelId}, service: ${roleServiceName})`);

          const roleResultObj = await roleService.chat(
            [{ role: 'user', content: message }],
            {
              systemPrompt: role.systemPrompt,
              maxTokens: role.maxTokens || 4096,
              temperature: role.temperature || 0.7,
              documents: attachmentDocuments.length > 0 ? attachmentDocuments : undefined
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

    // 응답에서 내부 태그 제거 ({need}, {도구이름: ...} — 사용자에게 안 보이게)
    finalResponse = finalResponse
      .replace(/\{need\}\s*.+?(?:\n|$)/g, '')
      .replace(/\{(recall_memory|get_profile|update_profile)[:\s]+.+?\}/gi, '')
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

    // 9.4 확정된 거짓 → 응답 첫줄에 박제
    const confirmedLies = executedTools.filter(t => t.lieStamp);
    if (confirmedLies.length > 0) {
      const lieStamps = confirmedLies.map(t =>
        `❌ [거짓 감지] ${t.display || t.name}: ${t.verificationMemo}`
      ).join('\n');
      finalResponse = `${lieStamps}\n\n---\n\n${finalResponse}`;
    }

    // 9.5 도구 실행 기록을 응답에 포함 (다음 턴에서 AI가 도구 사용 사실을 인지하도록)
    let responseToSave = finalResponse;
    if (executedTools.length > 0) {
      const toolSummary = executedTools.map(t => {
        const status = t.success ? '성공' : `실패: ${t.error || ''}`;
        const preview = t.resultPreview ? ` → ${t.resultPreview.substring(0, 100)}` : '';
        const vMemo = t.verificationMemo ? ` [검증: ${t.verificationMemo}]` : '';
        return `- ${t.display || t.name} (${status})${t.success ? preview : ''}${vMemo}`;
      }).join('\n');
      responseToSave = `<tool_history>\n${toolSummary}\n</tool_history>\n\n${finalResponse}`;
    }

    // 10. 응답 저장 (라우팅 정보 포함)
    try {
      await pipeline.handleResponse(message, responseToSave, sessionId, {
        routing: {
          modelId: routingResult.modelId,
          serviceId: routingResult.serviceId,
          tier
        },
        toolsUsed: executedTools.length > 0 ? executedTools : undefined,
        toolNeeds: toolNeeds.length > 0 ? toolNeeds : undefined,
        toolsSelected: toolsSelected.length > 0 ? toolsSelected : undefined,
        filtered: filteredContents.length > 0 ? filteredContents : undefined,
        attachments: attachments.length > 0 ? attachments : undefined
      });
      console.log('[Chat] Response saved successfully');
    } catch (saveError) {
      console.error('[Chat] ❌ Failed to save response:', saveError.message);
      console.error('[Chat] Stack:', saveError.stack);
    }

    // 10.5 첨부 파일 → 외부 저장소 백업 (로컬 원본은 유지)
    // 로컬 삭제는 하지 않음 — 대화 기록에서 /api/files/파일명 URL로 참조하므로
    // TODO: 추후 파일 저장소 URL 치환 + 로컬 정리 설계 필요
    if (attachments && attachments.length > 0) {
      (async () => {
        try {
          const localCfg = require('../utils/local-config');
          const fileType = localCfg.getFileStorageType();

          if (fileType !== 'local') {
            const { createFileMigrationAdapter } = require('./storage');
            const fileConfig = localCfg.getFileStorageConfig();
            const adapter = await createFileMigrationAdapter(fileType, fileConfig);

            const os = require('os');
            const DATA_DIR = process.env.SOUL_DATA_DIR || path.join(os.homedir(), '.soul');
            const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

            for (const att of attachments) {
              try {
                const filename = att.url.split('/').pop();
                const localPath = path.join(UPLOAD_DIR, filename);
                if (fs.existsSync(localPath)) {
                  const buffer = fs.readFileSync(localPath);
                  const remotePath = `images/${new Date().toISOString().slice(0, 7)}/${filename}`;
                  await adapter.importAll({ [remotePath]: buffer });
                  console.log(`[FileStorage] 백업 완료: ${remotePath}`);
                }
              } catch (uploadErr) {
                console.error(`[FileStorage] 백업 실패: ${att.name}`, uploadErr.message);
              }
            }

            if (adapter.close) await adapter.close();
          }
        } catch (err) {
          console.error('[FileStorage] 첨부파일 처리 실패:', err.message);
        }
      })();
    }

    // 11. 사용 통계 저장 (비동기, 응답 지연 없음)
    // actualUsage: API가 반환한 실제 토큰 사용량 (input_tokens, output_tokens)
    const inputTokens = actualUsage.input_tokens || 0;
    const outputTokens = actualUsage.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    console.log(`[Chat] Usage: ${inputTokens} input + ${outputTokens} output = ${totalTokens} tokens`);

    UsageStats.addUsage({
      tier,
      modelId: routingResult.modelId,
      serviceId: serviceName || routingResult.serviceId || 'unknown',
      inputTokens,
      outputTokens,
      totalTokens,
      tokenBreakdown, // 토큰 분류 정보
      latency,
      sessionId,
      category: 'chat'
    }).catch(err => console.error('Usage stats save error:', err));


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
      // 메타 정보
      meta: {
        model: routingResult.modelId,
        service: routingResult.serviceId,
        tier,
        latency,
        timestamp: new Date().toISOString(),
        // 라우팅 상세
        mode: routingResult.mode || (routingResult.tier === 'single' ? 'single' : 'auto'),
        manager: typeof routingResult.manager === 'string' ? routingResult.manager : 'server',
        managerModel: routingResult.managerModel
          ? (typeof routingResult.managerModel === 'object' ? routingResult.managerModel.modelId : routingResult.managerModel)
          : null,
        reason: typeof routingResult.reason === 'string' ? routingResult.reason : null,
        // 알바 위임 정보
        delegatedTo: delegatedRole ? {
          roleId: delegatedRole.roleId,
          name: delegatedRole.name,
          model: delegatedRole.preferredModel || null
        } : null,
        // 도구 사용 정보
        toolsUsed: executedTools.length > 0 ? executedTools.map(t => t.name || t.tool) : null,
        // vision-worker 사용 여부
        visionWorkerUsed: !!visionWorkerResult
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
      filtered: filteredContents.length > 0 ? filteredContents : undefined, // 서버 필터 내용
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
        tools: isToolRoutingEnabled
          ? [{ name: '{need} 모드', description: `도구 ${allTools.length}개 대기 — AI가 {need}로 요청 시 tool-worker가 선별` }]
          : allTools.map(t => ({ name: t.name, description: t.description })),
        messageCount: chatMessages.length,
        toolCount: isToolRoutingEnabled ? 0 : actualToolCount,
        toolMode: isToolRoutingEnabled ? 'need' : 'direct'
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
        toolsSelected: m.metadata?.toolsSelected || null,
        // 첨부파일 (user 메시지용)
        attachments: m.attachments || null
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

    // 사용자 타임존 기준 오늘 날짜 (UTC 대신)
    let tz = 'Asia/Seoul';
    try {
      const tzRow = db.db.prepare("SELECT timezone FROM user_profiles WHERE user_id = 'default-user' LIMIT 1").get();
      if (tzRow?.timezone) tz = tzRow.timezone;
    } catch (e) {}
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
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
      'lightning': ['lightning'],
      'deepseek': ['deepseek']
    };

    for (const svc of allServices) {
      const sid = svc.service_id;
      const aliases = serviceAliases[sid] || [sid];
      const placeholders = aliases.map(() => '?').join(',');

      // 오늘 사용 통계 집계 (별칭 포함)
      const stats = db.db.prepare(
        `SELECT COUNT(*) as count, SUM(input_tokens + output_tokens) as totalTokens FROM usage_stats WHERE date = ? AND service IN (${placeholders})`
      ).get(today, ...aliases) || { count: 0, totalTokens: 0 };

      // 톱 모델
      const topModel = db.db.prepare(
        `SELECT model, COUNT(*) as cnt FROM usage_stats WHERE date = ? AND service IN (${placeholders}) GROUP BY model ORDER BY cnt DESC LIMIT 1`
      ).get(today, ...aliases);

      const entry = {
        serviceId: sid,
        name: svc.name,
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

      // DeepSeek: 잔액 API (직접 호출)
      if (sid === 'deepseek' && svc.api_key) {
        try {
          const dsResp = await fetch('https://api.deepseek.com/user/balance', {
            headers: {
              'Authorization': `Bearer ${svc.api_key}`,
              'Accept': 'application/json'
            }
          });
          if (dsResp.ok) {
            const dsData = await dsResp.json();
            // 잔액이 있는 통화 우선 (CNY > USD 순)
            const balInfo = dsData.balance_infos?.find(b => parseFloat(b.total_balance) > 0) || dsData.balance_infos?.[0] || {};
            const bal = parseFloat(balInfo.total_balance) || 0;
            entry.balance = {
              total_credits: bal,
              currency: balInfo.currency || 'CNY',
              granted: parseFloat(balInfo.granted_balance) || 0,
              topped_up: parseFloat(balInfo.topped_up_balance) || 0,
              remaining: bal
            };
          }
        } catch (e) {
          console.warn('[Billing] DeepSeek balance fetch failed:', e.message);
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

  // 자동 라우팅에서 결정한 티어가 있으면 우선 사용
  // (같은 모델이 여러 티어에 설정된 경우 모델 이름으로 판단 불가)
  if (routingTier === 'fast') return 'light';
  if (routingTier === 'balanced') return 'medium';
  if (routingTier === 'premium') return 'heavy';

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
