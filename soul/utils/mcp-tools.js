/**
 * mcp-tools.js
 * MCP 도구 로더 및 실행기
 */

const fs = require('fs');
const path = require('path');
const { getProactiveMessenger } = require('./proactive-messenger');

// MCP 도구 캐시
let toolsCache = null;
let executorsCache = {};

/**
 * 내장 도구 정의
 */
const BUILTIN_TOOLS = [
  {
    name: 'send_message',
    description: '사용자에게 즉시 메시지를 보냅니다. 알려줄 게 있거나, 먼저 말 걸고 싶을 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '보낼 메시지 내용'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'schedule_message',
    description: '일정 시간 후에 메시지를 보냅니다. "1분 뒤에 알려줄게", "10분 후에 확인해볼게" 같은 상황에 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '보낼 메시지 내용'
        },
        delay_seconds: {
          type: 'number',
          description: '몇 초 후에 보낼지 (기본: 60초 = 1분)'
        }
      },
      required: ['message']
    }
  }
];

/**
 * 내장 도구 실행기
 */
async function executeBuiltinTool(toolName, input) {
  const messenger = await getProactiveMessenger();
  
  if (!messenger) {
    return { success: false, error: 'ProactiveMessenger not initialized' };
  }

  switch (toolName) {
    case 'send_message':
      await messenger.sendNow({ 
        type: 'ai_initiated', 
        message: input.message 
      });
      return { success: true, message: '메시지 전송 완료' };

    case 'schedule_message':
      const delaySeconds = input.delay_seconds || 60;
      setTimeout(async () => {
        await messenger.sendNow({ 
          type: 'scheduled', 
          message: input.message 
        });
        console.log(`[Scheduled] Sent: "${input.message}"`);
      }, delaySeconds * 1000);
      return { 
        success: true, 
        message: `${delaySeconds}초 후에 메시지가 전송됩니다` 
      };

    default:
      return { success: false, error: `Unknown builtin tool: ${toolName}` };
  }
}

/**
 * MCP 도구 목록 로드
 * @returns {Array} Claude API tools 형식의 도구 배열
 */
function loadMCPTools() {
  if (toolsCache) return toolsCache;

  const toolsPath = path.join(__dirname, '../../mcp/tools');
  const tools = [];
  executorsCache = {};

  // 1. 내장 도구 먼저 추가
  for (const tool of BUILTIN_TOOLS) {
    tools.push(tool);
    executorsCache[tool.name] = executeBuiltinTool;
  }
  console.log(`[MCP] Loaded ${BUILTIN_TOOLS.length} builtin tools`);

  // 2. 외부 MCP 도구 로드
  try {
    const files = fs.readdirSync(toolsPath);

    for (const file of files) {
      if (!file.endsWith('.js')) continue;

      try {
        const toolModule = require(path.join(toolsPath, file));

        if (toolModule.tools && Array.isArray(toolModule.tools)) {
          // Claude API 형식으로 변환
          for (const tool of toolModule.tools) {
            tools.push({
              name: tool.name,
              description: tool.description,
              input_schema: tool.input_schema || tool.inputSchema || { type: 'object', properties: {} }
            });

            // 실행기 등록
            if (toolModule.executeTool) {
              executorsCache[tool.name] = toolModule.executeTool;
            }
          }
        }
      } catch (error) {
        console.error(`Failed to load tool module ${file}:`, error.message);
      }
    }

    toolsCache = tools;
    console.log(`[MCP] Loaded ${tools.length} tools from ${Object.keys(executorsCache).length} modules`);
  } catch (error) {
    console.error('Failed to load MCP tools:', error);
  }

  return tools;
}

/**
 * MCP 도구 실행
 * @param {string} toolName - 도구 이름
 * @param {object} input - 입력 파라미터
 * @returns {Promise<any>} 실행 결과
 */
async function executeMCPTool(toolName, input) {
  // 캐시 확인
  if (!toolsCache) {
    loadMCPTools();
  }

  const executor = executorsCache[toolName];

  if (!executor) {
    return {
      success: false,
      error: `도구를 찾을 수 없습니다: ${toolName}`
    };
  }

  try {
    console.log(`[MCP] Executing tool: ${toolName}`, input);
    const result = await executor(toolName, input);
    console.log(`[MCP] Tool result:`, result);
    return result;
  } catch (error) {
    console.error(`[MCP] Tool execution error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Google Home 관련 도구만 가져오기
 */
function getGoogleHomeTools() {
  const allTools = loadMCPTools();
  return allTools.filter(t =>
    ['list_smart_devices', 'get_device_state', 'search_devices', 'get_rooms_summary', 'control_smart_device'].includes(t.name)
  );
}

/**
 * 캐시 초기화
 */
function clearCache() {
  toolsCache = null;
  executorsCache = {};
}

module.exports = {
  loadMCPTools,
  executeMCPTool,
  getGoogleHomeTools,
  clearCache
};
