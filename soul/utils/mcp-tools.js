/**
 * mcp-tools.js
 * MCP 도구 로더 및 실행기
 */

const fs = require('fs');
const path = require('path');
const { getProactiveMessenger } = require('./proactive-messenger');
const scheduledMessages = require('./scheduled-messages');

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
    description: '일정 시간 후에 메시지를 보냅니다. "1분 뒤에 알려줄게", "10분 후에 확인해볼게" 같은 상황에 사용합니다. 예약 ID가 반환됩니다.',
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
  },
  {
    name: 'cancel_scheduled_message',
    description: '예약된 메시지를 취소합니다. 사용자가 "아 그거 안 보내도 돼", "취소해" 라고 하면 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        schedule_id: {
          type: 'number',
          description: '취소할 예약 ID (schedule_message에서 반환된 값)'
        }
      },
      required: ['schedule_id']
    }
  },
  {
    name: 'update_scheduled_message',
    description: '예약된 메시지의 시간이나 내용을 수정합니다.',
    input_schema: {
      type: 'object',
      properties: {
        schedule_id: {
          type: 'number',
          description: '수정할 예약 ID'
        },
        message: {
          type: 'string',
          description: '새 메시지 내용 (변경 시)'
        },
        delay_seconds: {
          type: 'number',
          description: '지금부터 몇 초 후로 변경할지'
        }
      },
      required: ['schedule_id']
    }
  },
  {
    name: 'list_scheduled_messages',
    description: '현재 예약된 메시지 목록을 보여줍니다.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * 내장 도구 실행기
 */
async function executeBuiltinTool(toolName, input) {
  const messenger = await getProactiveMessenger();
  
  if (toolName !== 'list_scheduled_messages' && toolName !== 'cancel_scheduled_message' && !messenger) {
    return { success: false, error: 'ProactiveMessenger not initialized' };
  }

  switch (toolName) {
    case 'send_message':
      await messenger.sendNow({ 
        type: 'ai_initiated', 
        message: input.message 
      });
      return { success: true, message: '메시지 전송 완료' };

    case 'schedule_message': {
      const delaySeconds = input.delay_seconds || 60;
      const result = await scheduledMessages.schedule(input.message, delaySeconds);
      return { 
        success: true, 
        schedule_id: result.scheduleId,
        message: `${delaySeconds}초 후에 메시지가 전송됩니다 (예약 ID: ${result.scheduleId})` 
      };
    }

    case 'cancel_scheduled_message': {
      const result = await scheduledMessages.cancel(input.schedule_id);
      if (!result) {
        return { success: false, error: `예약 ID ${input.schedule_id}를 찾을 수 없습니다` };
      }
      return { success: true, message: `예약 #${input.schedule_id} 취소됨: "${result.message}"` };
    }

    case 'list_scheduled_messages': {
      const pending = await scheduledMessages.list();
      return { 
        success: true, 
        count: pending.length,
        scheduled: pending.map(d => ({ id: d.scheduleId, message: d.message, sendAt: d.sendAt }))
      };
    }

    case 'update_scheduled_message': {
      const result = await scheduledMessages.update(input.schedule_id, {
        message: input.message,
        delaySeconds: input.delay_seconds
      });
      if (!result) {
        return { success: false, error: `예약 ID ${input.schedule_id}를 찾을 수 없습니다` };
      }
      return { success: true, message: `예약 #${input.schedule_id} 수정됨: "${result.message}"` };
    }

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
