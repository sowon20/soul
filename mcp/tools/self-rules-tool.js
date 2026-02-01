/**
 * self-rules-tool.js
 * MCP Tool: Soul 자기학습 규칙 관리
 * Soul이 직접 자신의 규칙을 추가/조회/삭제
 */

const axios = require('axios');

const API_BASE = process.env.SOUL_API_BASE || 'http://localhost:3001/api';

/**
 * 내 규칙 목록 보기
 */
async function listMyRules({ category = null, limit = 20 }) {
  try {
    let url = `${API_BASE}/self-rules?limit=${limit}`;
    if (category) url += `&category=${category}`;
    
    const response = await axios.get(url);
    
    if (!response.data.success) {
      throw new Error(response.data.error || '규칙 조회 실패');
    }
    
    const rules = response.data.rules || [];
    if (rules.length === 0) {
      return { success: true, message: '아직 저장한 규칙이 없어.' };
    }
    
    const formatted = rules.map(r => 
      `[${r.category}] ${r.rule}${r.context ? ` (${r.context})` : ''}`
    ).join('\n');
    
    return {
      success: true,
      count: rules.length,
      rules: formatted
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 새 규칙 추가 (내가 배운 것 메모)
 */
async function addMyRule({ rule, category = 'general', priority = 5, context = null }) {
  try {
    const response = await axios.post(`${API_BASE}/self-rules`, {
      rule,
      category,
      priority,
      context
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error || '규칙 추가 실패');
    }
    
    return {
      success: true,
      message: `규칙 저장했어: "${rule.substring(0, 50)}${rule.length > 50 ? '...' : ''}"`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 규칙 삭제
 */
async function deleteMyRule({ ruleId }) {
  try {
    const response = await axios.delete(`${API_BASE}/self-rules/${ruleId}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error || '규칙 삭제 실패');
    }
    
    return { success: true, message: '규칙 삭제했어.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 도구 정의
 */
const tools = [
  {
    name: 'list_my_rules',
    description: '내가 저장해둔 규칙들 보기. 이전에 배운 것들, 메모해둔 것들 확인할 때 사용.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['system', 'coding', 'daily', 'personality', 'user', 'general'],
          description: '카테고리 필터 (선택)'
        },
        limit: {
          type: 'number',
          description: '최대 개수 (기본 20)'
        }
      }
    }
  },
  {
    name: 'add_my_rule',
    description: '새로 배운 것, 기억해둘 것 저장. 실수해서 깨달은 것, 사용자가 알려준 것 등을 메모할 때 사용.',
    input_schema: {
      type: 'object',
      properties: {
        rule: {
          type: 'string',
          description: '규칙 내용 (간결하게)'
        },
        category: {
          type: 'string',
          enum: ['system', 'coding', 'daily', 'personality', 'user', 'general'],
          description: '카테고리 (system: 시스템/인프라, coding: 코딩, user: 사용자 관련, general: 일반)'
        },
        priority: {
          type: 'number',
          description: '중요도 1-10 (높을수록 중요, 기본 5)'
        },
        context: {
          type: 'string',
          description: '왜 이걸 배웠는지, 어떤 상황이었는지 (선택)'
        }
      },
      required: ['rule']
    }
  },
  {
    name: 'delete_my_rule',
    description: '저장한 규칙 삭제. 더 이상 필요없거나 틀린 규칙 지울 때.',
    input_schema: {
      type: 'object',
      properties: {
        ruleId: {
          type: 'string',
          description: '삭제할 규칙 ID'
        }
      },
      required: ['ruleId']
    }
  }
];

/**
 * 도구 실행
 */
async function executeTool(name, input) {
  switch (name) {
    case 'list_my_rules':
      return await listMyRules(input);
    case 'add_my_rule':
      return await addMyRule(input);
    case 'delete_my_rule':
      return await deleteMyRule(input);
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

module.exports = {
  tools,
  executeTool
};
