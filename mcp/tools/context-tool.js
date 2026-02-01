/**
 * context-tool.js
 * MCP Tool: 컨텍스트 감지 및 관리
 */

const axios = require('axios');

const API_BASE = process.env.SOUL_API_BASE || 'http://localhost:3080/api';

/**
 * 컨텍스트 감지
 */
async function detectContext({ message, conversationHistory = [] }) {
  try {
    const response = await axios.post(`${API_BASE}/context/detect`, {
      message,
      conversationHistory
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Context detection failed');
    }

    return {
      success: true,
      activated: response.data.activated,
      relevantMemories: response.data.relevantMemories || [],
      contextPrompt: response.data.contextPrompt
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 토큰 사용량 분석
 */
async function analyzeTokens({ messages, model = 'gpt-4' }) {
  try {
    const response = await axios.post(`${API_BASE}/context-mgmt/analyze`, {
      messages,
      model
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Token analysis failed');
    }

    return {
      success: true,
      usage: response.data.usage,
      shouldCompress: response.data.shouldCompress,
      warningLevel: response.data.warningLevel
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 컨텍스트 압축
 */
async function compressContext({ messages, targetRatio = 0.5 }) {
  try {
    const response = await axios.post(`${API_BASE}/context-mgmt/compress`, {
      messages,
      targetRatio
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Compression failed');
    }

    return {
      success: true,
      compressedMessages: response.data.compressedMessages,
      compressionRatio: response.data.compressionRatio,
      savedTokens: response.data.savedTokens
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 비유/연결 찾기
 */
async function findAnalogies({ message, limit = 3 }) {
  try {
    const response = await axios.post(`${API_BASE}/analogy/analyze`, {
      message,
      options: { limit }
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Analogy search failed');
    }

    return {
      success: true,
      activated: response.data.activated,
      analogies: response.data.analogies || [],
      contextPrompt: response.data.contextPrompt
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  name: 'context',
  description: 'Soul 컨텍스트 관리 - 맥락 감지, 토큰 관리, 비유 검색',
  tools: [
    {
      name: 'detect_context',
      description: '현재 메시지에서 과거 대화 참조를 감지합니다',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '현재 사용자 메시지'
          },
          conversationHistory: {
            type: 'array',
            description: '최근 대화 히스토리 (선택)',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        },
        required: ['message']
      },
      handler: detectContext
    },
    {
      name: 'analyze_tokens',
      description: '현재 대화의 토큰 사용량을 분석합니다',
      inputSchema: {
        type: 'object',
        properties: {
          messages: {
            type: 'array',
            description: '메시지 배열',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                content: { type: 'string' }
              }
            }
          },
          model: {
            type: 'string',
            description: '모델 이름',
            default: 'gpt-4'
          }
        },
        required: ['messages']
      },
      handler: analyzeTokens
    },
    {
      name: 'compress_context',
      description: '대화 컨텍스트를 압축합니다',
      inputSchema: {
        type: 'object',
        properties: {
          messages: {
            type: 'array',
            description: '압축할 메시지 배열',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                content: { type: 'string' }
              }
            }
          },
          targetRatio: {
            type: 'number',
            description: '목표 압축 비율 (0.0-1.0)',
            default: 0.5
          }
        },
        required: ['messages']
      },
      handler: compressContext
    },
    {
      name: 'find_analogies',
      description: '현재 상황과 비슷한 과거 대화를 찾습니다',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '현재 메시지'
          },
          limit: {
            type: 'number',
            description: '최대 비유 개수',
            default: 3
          }
        },
        required: ['message']
      },
      handler: findAnalogies
    }
  ]
};
