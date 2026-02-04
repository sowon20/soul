/**
 * mcp-tools.js
 * MCP 도구 로더 및 실행기
 * - 내장 도구
 * - 로컬 MCP 도구 (mcp/tools/)
 * - 외부 MCP 서버 도구 (커스텀 HTTP + Streamable HTTP)
 */

const fs = require('fs');
const path = require('path');
const { getProactiveMessenger } = require('./proactive-messenger');
const scheduledMessages = require('./scheduled-messages');
const SystemConfig = require('../models/SystemConfig');

// MCP 도구 캐시
let toolsCache = null;
let executorsCache = {};
let externalServersCache = {};

/**
 * input_schema 압축 (토큰 절약)
 * - description 30자 제한
 * - 불필요한 필드 제거
 */
function compressInputSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };

  const compressed = { type: schema.type || 'object' };

  if (schema.properties) {
    compressed.properties = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      compressed.properties[key] = { type: prop.type || 'string' };
      // description 30자로 제한
      if (prop.description) {
        compressed.properties[key].description = prop.description.length > 30
          ? prop.description.substring(0, 27) + '...'
          : prop.description;
      }
      // enum은 유지 (선택지 정보 중요)
      if (prop.enum) compressed.properties[key].enum = prop.enum;
    }
  }

  if (schema.required) compressed.required = schema.required;

  return compressed;
}

/**
 * 프로액티브 메시징 도구 (프로액티브 기능 ON일 때만 포함)
 */
const PROACTIVE_TOOLS = [
  {
    name: 'send_message',
    description: '즉시 메시지 전송',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '내용' }
      },
      required: ['message']
    }
  },
  {
    name: 'schedule_message',
    description: '예약 메시지',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '내용' },
        delay_seconds: { type: 'number', description: '초' }
      },
      required: ['message']
    }
  },
  {
    name: 'cancel_scheduled_message',
    description: '예약 취소',
    input_schema: {
      type: 'object',
      properties: {
        schedule_id: { type: 'number', description: 'ID' }
      },
      required: ['schedule_id']
    }
  },
  {
    name: 'list_scheduled_messages',
    description: '예약 목록',
    input_schema: { type: 'object', properties: {} }
  }
];

/**
 * 서버 설정 로드 (DB에서)
 */
async function loadServerConfig() {
  try {
    const config = await SystemConfig.findOne({ configKey: 'mcp_servers' });
    return config?.value || { servers: {}, externalServers: {} };
  } catch (e) {
    console.error('[MCP] Failed to load config from DB:', e.message);
    return { servers: {}, externalServers: {} };
  }
}

/**
 * 내장 도구 실행기
 */
async function executeBuiltinTool(toolName, input) {
  const messenger = await getProactiveMessenger();

  switch (toolName) {
    case 'send_message':
      if (messenger) {
        await messenger.sendNow({ type: 'ai_initiated', message: input.message });
      }
      return { success: true, message: '메시지 전송 완료' };

    case 'schedule_message': {
      const delaySeconds = input.delay_seconds || 60;
      const result = await scheduledMessages.schedule(input.message, delaySeconds);
      return { success: true, schedule_id: result.scheduleId };
    }

    case 'cancel_scheduled_message': {
      const result = await scheduledMessages.cancel(input.schedule_id);
      return result ? { success: true } : { success: false, error: '예약을 찾을 수 없음' };
    }

    case 'list_scheduled_messages': {
      const pending = await scheduledMessages.list();
      return { success: true, scheduled: pending };
    }

    default:
      return { success: false, error: `Unknown builtin tool: ${toolName}` };
  }
}

/**
 * URL에서 프로토콜 타입 감지
 * - Streamable HTTP: /v1, /sse, /mcp 로 끝나는 URL
 * - Custom: 그 외 (기존 방식)
 */
function detectProtocol(url) {
  if (!url) return 'custom';
  const path = url.replace(/\/+$/, '');
  if (/\/(v1|sse|mcp)$/i.test(path)) return 'streamable-http';
  return 'custom';
}

/**
 * SSE 응답 텍스트에서 JSON-RPC result 파싱
 */
function parseSSEResponse(text) {
  // JSON 직접 응답인 경우
  try {
    const json = JSON.parse(text);
    if (json.result) return json.result;
    return json;
  } catch { /* SSE 형식 시도 */ }

  // SSE 형식: "event: message\ndata: {...}"
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data:')) {
      try {
        const json = JSON.parse(line.slice(5).trim());
        if (json.result) return json.result;
        return json;
      } catch { /* 다음 줄 시도 */ }
    }
  }
  return null;
}

/**
 * Streamable HTTP로 도구 목록 가져오기 (MCP JSON-RPC)
 */
async function fetchToolsStreamableHTTP(serverInfo) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (serverInfo.apiKey) {
      headers['Authorization'] = `Bearer ${serverInfo.apiKey}`;
    }

    const res = await fetch(serverInfo.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    const result = parseSSEResponse(text);
    return result?.tools || [];
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error(`[MCP] Timeout fetching tools (streamable) from ${serverInfo.url}`);
    } else {
      console.error(`[MCP] Streamable HTTP fetch failed from ${serverInfo.url}:`, e.message);
    }
    return [];
  }
}

/**
 * Streamable HTTP로 도구 실행 (MCP JSON-RPC)
 */
async function executeToolStreamableHTTP(serverUrl, toolName, input, apiKey) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 도구 실행은 30초

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: input },
        id: Date.now()
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const text = await res.text();
    const result = parseSSEResponse(text);

    if (!result) {
      return { success: false, error: 'Empty response from MCP server' };
    }

    // MCP 표준: result.content = [{ type: 'text', text: '...' }]
    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      return { success: true, result: textParts || JSON.stringify(result.content) };
    }

    return { success: true, result: typeof result === 'string' ? result : JSON.stringify(result) };
  } catch (e) {
    console.error(`[MCP] Streamable HTTP execution failed:`, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 외부 MCP 서버에서 도구 목록 가져오기 (프로토콜 자동 감지)
 */
async function fetchExternalTools(serverInfo) {
  const protocol = detectProtocol(serverInfo.url);

  if (protocol === 'streamable-http') {
    return fetchToolsStreamableHTTP(serverInfo);
  }

  // 기존 커스텀 방식
  try {
    const baseUrl = serverInfo.url.replace(/\/sse\/?$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(baseUrl + '/tools', { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();
    return data.tools || [];
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error(`[MCP] Timeout fetching tools from ${serverInfo.url}`);
    } else {
      console.error(`[MCP] Failed to fetch tools from ${serverInfo.url}:`, e.message);
    }
    return [];
  }
}

/**
 * 외부 MCP 서버 도구 실행 (프로토콜 자동 감지)
 */
async function executeExternalTool(serverUrl, toolName, input, apiKey) {
  const protocol = detectProtocol(serverUrl);

  if (protocol === 'streamable-http') {
    return executeToolStreamableHTTP(serverUrl, toolName, input, apiKey);
  }

  // 기존 커스텀 방식
  try {
    const baseUrl = serverUrl.replace(/\/sse\/?$/, '');
    const res = await fetch(baseUrl + '/api/tool-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, arguments: input })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  } catch (e) {
    console.error(`[MCP] External tool execution failed:`, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * MCP 도구 목록 로드 (async)
 * @param {Object} options
 * @param {boolean} options.includeProactive - 프로액티브 도구 포함 여부 (기본: false)
 * @returns {Promise<Array>} Claude API tools 형식의 도구 배열
 */
async function loadMCPTools({ includeProactive = false } = {}) {
  // 캐시 키에 proactive 포함 여부 반영
  const cacheKey = includeProactive ? 'with_proactive' : 'no_proactive';
  if (toolsCache && toolsCache.key === cacheKey && Date.now() - toolsCache.timestamp < 5 * 60 * 1000) {
    return toolsCache.tools;
  }

  const toolsPath = path.join(__dirname, '../../mcp/tools');
  const tools = [];
  executorsCache = {};
  externalServersCache = {};

  // 1. 프로액티브 도구 (옵션에 따라 포함)
  if (includeProactive) {
    for (const tool of PROACTIVE_TOOLS) {
      tools.push(tool);
      executorsCache[tool.name] = executeBuiltinTool;
    }
    console.log(`[MCP] Loaded ${PROACTIVE_TOOLS.length} proactive tools`);
  } else {
    // 프로액티브 도구 executor는 항상 등록 (직접 호출 대비)
    for (const tool of PROACTIVE_TOOLS) {
      executorsCache[tool.name] = executeBuiltinTool;
    }
  }

  // 2. 로컬 MCP 도구 (mcp/tools/)
  try {
    const files = fs.readdirSync(toolsPath);
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      try {
        const toolModule = require(path.join(toolsPath, file));
        if (toolModule.tools && Array.isArray(toolModule.tools)) {
          for (const tool of toolModule.tools) {
            tools.push({
              name: tool.name,
              description: tool.description,
              input_schema: tool.input_schema || tool.inputSchema || { type: 'object', properties: {} }
            });
            if (toolModule.executeTool) {
              executorsCache[tool.name] = toolModule.executeTool;
            }
          }
        }
      } catch (e) {
        console.error(`[MCP] Failed to load ${file}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[MCP] Failed to read tools directory:', e.message);
  }

  // 3. 외부 MCP 서버 도구 (enabled된 것만)
  try {
    const config = await loadServerConfig();
    if (config.externalServers) {
      for (const [serverId, serverInfo] of Object.entries(config.externalServers)) {
        // enabled 체크
        if (config.servers[serverId]?.enabled === false) continue;

        const externalTools = await fetchExternalTools(serverInfo);
        for (const tool of externalTools) {
          const fullName = `${serverId}__${tool.name}`; // 서버별 구분
          // description 압축 (50자 제한)
          const shortDesc = tool.description?.length > 50
            ? tool.description.substring(0, 47) + '...'
            : tool.description || '';
          tools.push({
            name: fullName,
            description: `[${serverInfo.name}] ${shortDesc}`,
            input_schema: compressInputSchema(tool.inputSchema || tool.input_schema || { type: 'object', properties: {} })
          });
          externalServersCache[fullName] = serverInfo.url;
          executorsCache[fullName] = (name, input) => executeExternalTool(serverInfo.url, tool.name, input, serverInfo.apiKey);
        }
        console.log(`[MCP] Loaded ${externalTools.length} tools from ${serverInfo.name}`);
      }
    }
  } catch (e) {
    console.error('[MCP] Failed to load external servers:', e.message);
  }

  toolsCache = { tools, key: cacheKey, timestamp: Date.now() };
  console.log(`[MCP] Total ${tools.length} tools loaded`);
  return tools;
}

/**
 * MCP 도구 실행
 */
async function executeMCPTool(toolName, input) {
  if (!toolsCache) {
    await loadMCPTools();
  }

  const executor = executorsCache[toolName];
  if (!executor) {
    return { success: false, error: `도구를 찾을 수 없습니다: ${toolName}` };
  }

  try {
    console.log(`[MCP] Executing: ${toolName}`, input);
    const result = await executor(toolName, input);
    console.log(`[MCP] Result:`, result);
    return result;
  } catch (e) {
    console.error(`[MCP] Execution error:`, e);
    return { success: false, error: e.message };
  }
}

/**
 * 캐시 초기화
 */
function clearCache() {
  toolsCache = null;
  executorsCache = {};
  externalServersCache = {};
}

/**
 * Jina MCP 서버에 도구 직접 호출 (내부 후처리용)
 * 검색 결과 중복 제거 등에 사용
 */
async function callJinaTool(toolName, input) {
  try {
    const config = await loadServerConfig();
    if (!config.externalServers) return null;

    // Jina 서버 찾기 (URL에 jina 포함)
    const jinaEntry = Object.entries(config.externalServers)
      .find(([, info]) => info.url?.includes('jina'));
    if (!jinaEntry) return null;

    const [, serverInfo] = jinaEntry;
    const result = await executeToolStreamableHTTP(serverInfo.url, toolName, input, serverInfo.apiKey);
    return result?.success ? result.result : null;
  } catch (e) {
    console.error(`[MCP] callJinaTool(${toolName}) failed:`, e.message);
    return null;
  }
}

module.exports = {
  loadMCPTools,
  executeMCPTool,
  callJinaTool,
  clearCache
};
