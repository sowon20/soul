/**
 * mcp-tools.js
 * MCP 도구 로더 및 실행기
 * - 내장 도구
 * - 로컬 MCP 도구 (mcp/tools/)
 * - 외부 MCP 서버 도구 (SSE 서버)
 */

const fs = require('fs');
const path = require('path');
const { getProactiveMessenger } = require('./proactive-messenger');
const scheduledMessages = require('./scheduled-messages');

// MCP 도구 캐시
let toolsCache = null;
let executorsCache = {};
let externalServersCache = {};

// 설정 파일 경로
const CONFIG_PATH = path.join(__dirname, '../../mcp/server-config.json');

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
 * 내장 도구 정의 (description 압축으로 토큰 절약)
 */
const BUILTIN_TOOLS = [
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
 * 서버 설정 로드
 */
async function loadServerConfig() {
  try {
    const data = await fs.promises.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
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
 * 외부 MCP 서버에서 도구 목록 가져오기
 */
async function fetchExternalTools(serverInfo) {
  try {
    const baseUrl = serverInfo.url.replace(/\/sse\/?$/, '');
    const res = await fetch(baseUrl + '/tools', { timeout: 5000 });
    const data = await res.json();
    return data.tools || [];
  } catch (e) {
    console.error(`[MCP] Failed to fetch tools from ${serverInfo.url}:`, e.message);
    return [];
  }
}

/**
 * 외부 MCP 서버 도구 실행 (SSE)
 */
async function executeExternalTool(serverUrl, toolName, input) {
  try {
    const baseUrl = serverUrl.replace(/\/sse\/?$/, '');
    
    // MCP 프로토콜: SSE로 연결 후 tool call
    // 간단하게 HTTP POST로 대체 (서버에서 지원해야 함)
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
 * @returns {Promise<Array>} Claude API tools 형식의 도구 배열
 */
async function loadMCPTools() {
  // 캐시 사용 (5분)
  if (toolsCache && Date.now() - toolsCache.timestamp < 5 * 60 * 1000) {
    return toolsCache.tools;
  }

  const toolsPath = path.join(__dirname, '../../mcp/tools');
  const tools = [];
  executorsCache = {};
  externalServersCache = {};

  // 1. 내장 도구
  for (const tool of BUILTIN_TOOLS) {
    tools.push(tool);
    executorsCache[tool.name] = executeBuiltinTool;
  }
  console.log(`[MCP] Loaded ${BUILTIN_TOOLS.length} builtin tools`);

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
          executorsCache[fullName] = (name, input) => executeExternalTool(serverInfo.url, tool.name, input);
        }
        console.log(`[MCP] Loaded ${externalTools.length} tools from ${serverInfo.name}`);
      }
    }
  } catch (e) {
    console.error('[MCP] Failed to load external servers:', e.message);
  }

  toolsCache = { tools, timestamp: Date.now() };
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

module.exports = {
  loadMCPTools,
  executeMCPTool,
  clearCache
};
