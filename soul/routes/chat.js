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
const { builtinTools, executeBuiltinTool, isBuiltinTool, getMinimalTools } = require('../utils/builtin-tools');
const configManager = require('../utils/config');
const { trackCall: trackAlba } = require('../utils/alba-stats');

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

  // 동적 call_worker 도구 (callable 워커가 있을 때만 포함)
  const { getCallWorkerTool } = require('../utils/builtin-tools');
  const callWorkerTool = await getCallWorkerTool();

  _cachedTools = [...builtinTools, ...(callWorkerTool ? [callWorkerTool] : []), ...mcpTools];
  _cachedToolsTimestamp = now;
  console.log(`[Chat] Tools cache refreshed: ${_cachedTools.length} tools (call_worker: ${!!callWorkerTool})`);
  return _cachedTools;
}

// 도구 캐시 무효화 (설정 변경 시 호출)
function invalidateToolsCache() {
  _cachedTools = null;
  _cachedToolsTimestamp = 0;
}


/**
 * 스트리밍 가능한 AI 서비스 호출 래퍼
 * streamChat이 있으면 Socket.io로 실시간 청크 전송, 없으면 기존 chat() 사용
 */
async function callAIWithStreaming(aiService, chatMessages, chatOptions, { emitLifecycle = true, timelineCtx = null } = {}) {
  // streamChat 메서드가 없으면 기존 방식
  if (typeof aiService.streamChat !== 'function') {
    return aiService.chat(chatMessages, chatOptions);
  }

  console.log('[Chat] Using streaming mode');
  if (emitLifecycle && global.io) global.io.emit('stream_start');

  const result = await aiService.streamChat(chatMessages, chatOptions, (type, data) => {
    if (!global.io) return;
    if (type === 'thinking') {
      global.io.emit('stream_chunk', { type: 'thinking', content: data });
      if (timelineCtx) timelineCtx.addThinking(data);
    } else if (type === 'content') {
      global.io.emit('stream_chunk', { type: 'content', content: data });
      if (timelineCtx) timelineCtx.contentBuffer += data;
    } else if (type === 'content_replace' || type === 'content_append') {
      // 도구 실행 후 새 응답 — 덮어쓰기 대신 추가
      global.io.emit('stream_chunk', { type: 'content_append', content: data });
      if (timelineCtx) timelineCtx.contentBuffer += data;
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
    let visionWorkerResult = null; // vision-worker 사용 결과

    // 타임라인 축적 (생각/메시지/도구가 시간순으로 기록)
    const timelineCtx = {
      timeline: [],
      contentBuffer: '',
      addThinking(data) {
        const last = this.timeline[this.timeline.length - 1];
        if (last && last.type === 'thinking') {
          last.content += data;
        } else {
          this.timeline.push({ type: 'thinking', content: data });
        }
      },
      flushContent() {
        if (this.contentBuffer.trim()) {
          this.timeline.push({ type: 'content', content: this.contentBuffer });
          this.contentBuffer = '';
        }
      }
    };

    // 디버그용 변수 (상위 스코프에 선언)
    let combinedSystemPrompt = '';
    let chatMessages = [];
    let allTools = [];
    let actualToolCount = 0;

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
      const internalWorkers = ['digest-worker', 'embedding-worker'];
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
          if (f.value && f.visibility?.autoIncludeInContext) {
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
    const prefs = await configManager.getConfigValue('preferences', {});
    const voiceTags = prefs?.voiceConfig?.cartesia?.voiceTags || ['laughter'];

    let basePrompt = personality.generateSystemPrompt({
      model: routingResult.modelId,
      context: options.context || {},
      voiceTags
    });

    // 3단계: 핵심 규칙 (지침 섹션) — 파인튜닝 모델은 학습 완료이므로 최소화
    const isFineTunedModel = routingResult.modelId && routingResult.modelId.startsWith('sowon/');
    const instructionsSection = isFineTunedModel ? '' : `
<instructions>
도구 사용:
- 도구가 제공되면 tool_calls로 직접 호출하여 정보를 확인하라
- 도구 결과를 추측/날조하지 마라
- <tool_use>, <function_call>, <thinking>, <tool_history> 태그를 텍스트로 직접 작성 금지
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
    let aiService; // try 블록 밖에서 선언 (빈 응답 재호출에서도 접근 가능하게)
    try {

      // 모델명으로 서비스 추론하는 헬퍼
      function inferServiceFromModel(model) {
        const lower = model.toLowerCase();
        if (lower.includes('claude')) return 'anthropic';
        if (lower.includes('gpt')) return 'openai';
        if (lower.includes('gemini')) return 'google';
        if (lower.includes('grok')) return 'xai';
        if (lower.includes('accounts/fireworks') || lower.includes('fireworks')) return 'fireworks';
        if (lower.startsWith('sowon/')) return 'together';
        if (lower.includes('deepseek')) return 'deepseek';
        if (lower.includes('meta-llama/') && lower.includes('turbo')) return 'together';
        if (lower.includes('llama') || lower.includes('meta-llama/')) return 'huggingface';
        if (lower.includes('qwen/')) return 'together';
        if (lower.includes('qwen')) return 'qwen';
        if (lower.includes('mistral')) return 'huggingface';
        return null;
      }

      // 유효한 서비스명인지 확인
      const VALID_SERVICES = ['anthropic', 'openai', 'google', 'xai', 'huggingface', 'ollama', 'lightning', 'vertex', 'openrouter', 'fireworks', 'deepseek', 'qwen', 'together'];

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

      aiService = await AIServiceFactory.createService(serviceName, modelId);

      // system 메시지 분리
      const systemMessages = conversationData.messages.filter(m => m.role === 'system');
      chatMessages = conversationData.messages.filter(m => m.role !== 'system' && m.content && (typeof m.content !== 'string' || m.content.trim()));

      combinedSystemPrompt = systemMessages.map(m => m.content).join('\n\n');

      // 비전 모델 + 이미지 첨부 시 비전 안내 추가 (hallucination 방지)
      if (modelSupportsVision && attachmentDocuments.some(d => d.type === 'image')) {
        combinedSystemPrompt = '[VISION MODE] 이 대화에 이미지가 첨부되어 있다. 너는 비전 모델이며 이미지를 직접 볼 수 있다. 이미지 내용을 분석하여 답변하라. "이미지를 볼 수 없다"고 말하지 마라.\n\n' + combinedSystemPrompt;
      }

      console.log(`[Chat] System prompt: ${combinedSystemPrompt.length} chars, Messages: ${chatMessages.length}, History chars: ${chatMessages.reduce((s,m) => s + (m.content?.length||0), 0)}`);

      // MCP 도구 사용 (이미 캐시에서 로드됨)
      allTools = preloadedTools;

      // call_worker용: 대화 이미지 수집
      const conversationImages = {};
      try {
        const db = require('../db');
        const recentMsgs = db.db.prepare(
          'SELECT metadata FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT 50'
        ).all('main-conversation');
        for (const msg of recentMsgs) {
          if (!msg.metadata) continue;
          try {
            const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
            const atts = meta.attachments || [];
            for (const att of atts) {
              if (att.type && att.type.startsWith('image/') && att.url) {
                const filename = att.url.split('/').pop();
                if (filename) conversationImages[filename] = { type: att.type, name: att.name || filename };
              }
            }
          } catch {}
        }
        // 현재 턴의 이미지도 추가
        if (attachments) {
          for (const att of attachments) {
            if (att.type && att.type.startsWith('image/') && att.url) {
              const filename = att.url.split('/').pop();
              if (filename) conversationImages[filename] = { type: att.type, name: att.name || filename };
            }
          }
        }
        const imgCount = Object.keys(conversationImages).length;
        if (imgCount > 0) {
          const imageList = Object.entries(conversationImages).map(([fn, info]) => `- ${fn} (${info.name})`).join('\n');
          combinedSystemPrompt += `\n\n<conversation_images>\n현재 대화의 이미지 ${imgCount}장:\n${imageList}\ncall_worker로 vision-worker를 호출하면 이미지를 분석할 수 있다. image_ids에 파일명을 전달.\n</conversation_images>`;
          console.log(`[Chat] Conversation images: ${imgCount}`);
        }
      } catch (imgErr) {
        console.warn('[Chat] Failed to collect conversation images:', imgErr.message);
      }

      debugLog(`Total tools available: ${allTools.length}`);
      debugLog(`Tool names: ${allTools.map(t => t.name).join(', ')}`);
      console.log('[Chat] Total tools available:', allTools.length);

      // AI가 직접 tool_calls로 도구 호출 (전체 도구 전달)
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

      const summarizeToolResult = (toolName, result) => {
        if (!result) return '';
        try {
          const data = typeof result === 'string' ? JSON.parse(result) : result;
          if (typeof data !== 'object') return String(result).substring(0, 100);

          switch (toolName) {
            case 'recall_memory': {
              if (data.found === false) return data.message || '관련 기억 없음';
              const count = data.count || (data.results ? data.results.length : 0);
              if (count > 0) {
                // 첫 번째 결과 미리보기
                const first = data.results?.[0];
                const preview = first?.content ? first.content.substring(0, 80).replace(/\n/g, ' ') : '';
                return `${count}건 발견${preview ? ` — "${preview}..."` : ''}`;
              }
              return '관련 기억 없음';
            }
            case 'get_profile': {
              if (data.found === false) return data.message || '정보 없음';
              if (data.field && data.value) return `${data.field}: ${data.value}`;
              if (data.basicInfo) {
                const parts = [];
                for (const [k, v] of Object.entries(data.basicInfo)) {
                  const val = typeof v === 'object' ? v.value : v;
                  if (val) parts.push(`${k}: ${val}`);
                }
                return parts.length > 0 ? parts.join(', ') : '프로필 조회 완료';
              }
              return '프로필 조회 완료';
            }
            case 'update_profile':
              return data.success ? `${data.field || '정보'} 저장 완료` : (data.message || '저장 실패');
            case 'add_my_rule':
              return data.success ? `규칙 저장: ${(data.rule || '').substring(0, 50)}` : '저장 실패';
            case 'delete_my_rule':
              return data.success ? '규칙 삭제 완료' : '삭제 실패';
            case 'list_my_rules':
              return data.rules ? `${data.rules.length}개 규칙` : '규칙 없음';
            case 'send_message':
              return data.success ? '전송 완료' : (data.error || '전송 실패');
            case 'schedule_message':
              return data.success ? `예약 완료: ${data.scheduledTime || ''}` : '예약 실패';
            default: {
              // 일반적 결과 — success 필드 있으면 활용
              if (data.success !== undefined) return data.success ? '성공' : (data.message || data.error || '실패');
              if (data.result) return String(data.result).substring(0, 100);
              return JSON.stringify(data).substring(0, 100);
            }
          }
        } catch {
          return String(result).substring(0, 100);
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

        // 타임라인: 도구 시작 전 축적된 content flush
        timelineCtx.flushContent();

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
            result = await executeBuiltinTool(toolName, input, { context: { conversationImages } });
          } else {
            result = await executeMCPTool(toolName, input);
          }

          // 검색 결과 후처리: 중복 제거 (Jina deduplicate 활용)
          result = await deduplicateToolResult(actualToolName, result);

          // 실행된 도구 기록
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          executedTools.push({
            name: toolName,
            display: parsed.display,
            success: true,
            inputSummary: summarizeToolInput(toolName, input),
            resultPreview: summarizeToolResult(toolName, result),
            resultFull: resultStr.length > 2000 ? resultStr.substring(0, 2000) + '...' : resultStr
          });
          
          // 타임라인: 도구 실행 완료 기록
          timelineCtx.timeline.push({
            type: 'tool',
            name: toolName,
            display: parsed.display,
            inputSummary: summarizeToolInput(toolName, input),
            result: summarizeToolResult(toolName, result),
            success: true
          });

          // 도구 실행 완료 알림
          if (global.io) {
            global.io.emit('tool_end', {
              name: toolName,
              display: parsed.display,
              success: true,
              result: summarizeToolResult(toolName, result)
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

          // 타임라인: 도구 실행 실패 기록
          timelineCtx.timeline.push({
            type: 'tool',
            name: toolName,
            display: parsed.display,
            inputSummary: summarizeToolInput(toolName, input),
            result: toolError.message,
            success: false
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

      if (hasTools && contextLevel !== 'minimal') {
        // 파인튜닝 모델은 도구 사용법을 학습했으므로 tool definitions 전송 불필요
        // 도구 이름만 시스템 프롬프트에 텍스트로 포함
        const toolNames = allTools.map(t => `- ${t.name}`).join('\n');
        const finalSystemPrompt = combinedSystemPrompt + `\n\n<available_tools>\n${toolNames}\n</available_tools>`;

        console.log(`[Chat] Tools in prompt only (${allTools.length} tools, no definitions sent)`);

        aiResult = await callAIWithStreaming(aiService, chatMessages, {
          systemPrompt: finalSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: null,  // 도구 정의 전송 안 함
          toolExecutor: toolExecutor,
          thinking: routingResult.thinking || false,
          documents: attachmentDocuments.length > 0 ? attachmentDocuments : undefined,
        }, { timelineCtx });
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
        }, { timelineCtx });
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

      // 타임라인: 마지막 content flush
      timelineCtx.flushContent();
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
      } else if (statusCode === 400 || errorMessage.includes('validation') || errorMessage.includes('invalid_request')) {
        aiResponse = '⚠️ AI 요청 형식에 문제가 있었어요. 다시 말씀해주세요.';
        console.error(`❌ Input validation error — 메시지 형식 또는 도구 스키마 문제 가능성: ${errorMessage.substring(0, 300)}`);
      } else {
        aiResponse = `😅 AI 응답 생성 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.\n\n[DEBUG] ${errorMessage.substring(0, 200)}`;
      }
    }

    // 빈 응답 안전장치: 자동 재호출 (최대 2회)
    // thinking 태그만 있고 실제 내용이 없는 것도 빈 응답으로 처리
    const getVisibleContent = (resp) => {
      if (!resp) return '';
      const text = typeof resp === 'string' ? resp : (resp.text || '');
      return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
    };
    const MAX_EMPTY_RETRIES = 2;
    for (let emptyRetry = 0; emptyRetry < MAX_EMPTY_RETRIES; emptyRetry++) {
      if (getVisibleContent(aiResponse) !== '') break;

      console.warn(`[Chat] 빈 응답 감지 — 자동 재호출 (${emptyRetry + 1}/${MAX_EMPTY_RETRIES})`);
      try {
        const retryMessages = [
          ...chatMessages,
          { role: 'user', content: '[system] 비정상적으로 응답이 끝났습니다. 도구 없이 자연스럽게 답변해주세요.' }
        ];
        const retryResult = await callAIWithStreaming(aiService, retryMessages, {
          systemPrompt: combinedSystemPrompt,
          maxTokens: aiSettings.maxTokens,
          temperature: aiSettings.temperature,
          tools: null,
          thinking: false,
        }, { emitLifecycle: false, timelineCtx });
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

    // 6. 응답 후처리: 불필요한 패턴 제거
    // [날짜/시간] 접두사 패턴 제거 (모든 형태: [2/14 7:43], [7:34], [14일 7:43] 등)
    if (typeof aiResponse === 'string') {
      // 대괄호로 시작하는 모든 날짜/시간 패턴 제거
      // 패턴: [숫자/숫자 시간], [숫자:숫자], [날짜 관련 문자 포함] 등
      aiResponse = aiResponse.replace(/^\s*\[[\d/:\s일월화수목금토요년\-\.]+\]\s*/gm, '');
      aiResponse = aiResponse.trim();
    }

    // 객체 응답인 경우에도 적용
    if (typeof aiResponse === 'object' && aiResponse?.text) {
      aiResponse.text = aiResponse.text.replace(/^\s*\[[\d/:\s일월화수목금토요년\-\.]+\]\s*/gm, '');
      aiResponse.text = aiResponse.text.trim();
    }

    // 7. 알바 위임 체크 - Soul이 [DELEGATE:roleId] 태그를 사용했는지 확인
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

    // 8. 응답 일관성 검증
    const validation = personality.validateResponse(finalResponse, {
      englishExpected: options.englishExpected || false
    });

    // 9. 사용 통계 준비
    const latency = Date.now() - startTime;
    const tier = determineTier(routingResult.modelId, routingResult.tier);

    // 9.5 도구 실행 기록 — 본문이 아닌 metadata에만 저장 (AI 날조 방지)
    // 이전: <tool_history>를 응답 본문에 삽입 → AI가 패턴 학습하여 날조
    // 변경: metadata.toolsUsed에만 기록, 본문은 순수 응답만 저장
    let responseToSave = finalResponse;

    // 10. 응답 저장 (라우팅 정보 포함)
    try {
      await pipeline.handleResponse(message, responseToSave, sessionId, {
        routing: {
          modelId: routingResult.modelId,
          selectedModel: routingResult.modelName || null,
          serviceId: routingResult.serviceId,
          tier
        },
        toolsUsed: executedTools.length > 0 ? executedTools : undefined,
        timeline: timelineCtx.timeline.length > 0 ? timelineCtx.timeline : undefined,
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
        modelName: routingResult.modelName || null,
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
      timeline: timelineCtx.timeline.length > 0 ? timelineCtx.timeline : undefined,
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
        toolCount: actualToolCount,
        toolMode: 'direct'
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
        content: m.role === 'assistant' && m.text
          ? m.text.replace(/<tool_history>[\s\S]*?<\/tool_history>\s*/g, '').trim()
          : m.text,
        timestamp: m.timestamp,
        // 라우팅 정보 (assistant 메시지용)
        routing: m.routing || null,
        // 도구 사용 정보 (있으면 포함)
        toolsUsed: m.metadata?.toolsUsed || m.toolsUsed || null,
        // 타임라인 (시간순 생각/메시지/도구)
        timeline: m.metadata?.timeline || null,
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
