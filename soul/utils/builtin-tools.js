/**
 * builtin-tools.js
 * AI가 자율적으로 호출하는 내장 도구
 *
 * 개인 AI 원칙: 사용자에 대한 정보는 항상 선명하게
 */

const { getMemoryManager } = require('./memory-layers');
const ProfileModel = require('../models/Profile');

/**
 * 내장 도구 정의 (Claude tool_use 형식)
 */
const builtinTools = [
  {
    name: 'recall_memory',
    description: '과거 대화/기억 검색. 불확실하면 호출',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        timeFilter: { type: 'string', description: '시간(어제,지난주)' },
        limit: { type: 'number', description: '개수', default: 5 }
      },
      required: ['query']
    }
  },
  {
    name: 'get_profile',
    description: '사용자 프로필 조회',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: '필드명(생략시 전체)' }
      },
      required: []
    }
  },
  {
    name: 'update_profile',
    description: '새로 알게 된 사용자 정보 저장',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: '필드명' },
        value: { type: 'string', description: '값' }
      },
      required: ['field', 'value']
    }
  }
];

/**
 * 내장 도구 실행기
 */
async function executeBuiltinTool(toolName, input) {
  switch (toolName) {
    case 'recall_memory':
      return await recallMemory(input);
    case 'get_profile':
      return await getProfile(input);
    case 'update_profile':
      return await updateProfile(input);
    default:
      return { error: `Unknown builtin tool: ${toolName}` };
  }
}

/**
 * recall_memory 구현 - 개인 AI용 메모리 검색
 */
async function recallMemory({ query, timeFilter, limit = 5 }) {
  try {
    const memoryManager = await getMemoryManager();
    const results = [];
    const queryLower = query?.toLowerCase() || '';

    console.log(`[recall_memory] Search: query="${query}", time=${timeFilter}, limit=${limit}`);

    // 1. 벡터 검색 (의미적 유사도) - 가장 정확
    try {
      const vectorStore = require('./vector-store');
      const vectorResults = await vectorStore.search(query, limit * 2);

      if (vectorResults.length > 0) {
        console.log(`[recall_memory] Vector: ${vectorResults.length} results`);
        for (const r of vectorResults.slice(0, limit)) {
          results.push({
            source: 'conversation',
            content: r.text,
            timestamp: r.metadata?.timestamp,
            role: r.metadata?.role,
            relevance: (1 - r.distance).toFixed(2)
          });
        }
      }
    } catch (vecErr) {
      console.warn('[recall_memory] Vector search failed:', vecErr.message);
    }

    // 2. 주간 요약에서 검색 - 맥락 파악용
    try {
      const weeklySummaries = await memoryManager.middleTerm.getRecentWeeklySummaries(8);

      for (const s of weeklySummaries) {
        const searchText = `${s.summary || ''} ${(s.highlights || []).join(' ')} ${(s.topics || []).join(' ')}`.toLowerCase();
        if (queryLower && searchText.includes(queryLower)) {
          results.push({
            source: 'weekly_summary',
            period: `${s.year}년 ${s.month}월 ${s.weekNum}주`,
            summary: s.summary,
            highlights: s.highlights,
            topics: s.topics
          });
        }
      }
    } catch (err) {
      console.warn('[recall_memory] Weekly summary search failed:', err.message);
    }

    // 3. 장기 아카이브 검색
    try {
      const archives = await memoryManager.longTerm.search(query, { limit: 3 });
      if (archives?.length > 0) {
        for (const a of archives) {
          results.push({
            source: 'archive',
            date: a.date || a.archivedAt,
            topics: a.topics,
            summary: a.summary
          });
        }
      }
    } catch (err) {
      console.warn('[recall_memory] Archive search failed:', err.message);
    }

    if (results.length === 0) {
      return {
        found: false,
        message: `"${query}" 관련 기억을 못 찾았어. 다른 키워드로 다시 검색해볼까?`
      };
    }

    return {
      found: true,
      count: results.length,
      results: results.slice(0, limit)
    };
  } catch (error) {
    console.error('[recall_memory] Error:', error);
    return { error: error.message };
  }
}

/**
 * get_profile 구현 - 사용자 프로필 상세 조회
 */
async function getProfile({ field, userId } = {}) {
  try {
    // userId는 context에서 전달받거나 기본값 사용
    const profile = await ProfileModel.getOrCreateDefault(userId || 'default');
    const summary = profile.generateSummary(profile.permissions.readScope);

    console.log(`[get_profile] field=${field || 'all'}`);

    // 특정 필드만 요청한 경우
    if (field) {
      const fieldLower = field.toLowerCase();
      const customField = summary.customFields?.find(f =>
        f.label.toLowerCase().includes(fieldLower) ||
        f.key?.toLowerCase().includes(fieldLower)
      );

      if (customField) {
        return {
          found: true,
          field: customField.label,
          value: customField.value  // 전체 값 반환 (압축 없이)
        };
      }

      // 기본 정보에서 찾기
      const basicInfo = summary.basicInfo || {};
      if (basicInfo[fieldLower]) {
        return { found: true, field, value: basicInfo[fieldLower] };
      }

      return { found: false, message: `"${field}" 필드를 찾지 못했어.` };
    }

    // 전체 프로필 반환
    return {
      found: true,
      basicInfo: summary.basicInfo,
      customFields: summary.customFields?.map(f => ({
        label: f.label,
        value: f.value  // 전체 값 (압축 없이)
      })) || []
    };
  } catch (error) {
    console.error('[get_profile] Error:', error);
    return { error: error.message };
  }
}

/**
 * update_profile 구현 - 대화 중 알게 된 정보 저장
 */
async function updateProfile({ field, value, userId }) {
  try {
    const profile = await ProfileModel.getOrCreateDefault(userId || 'default');

    console.log(`[update_profile] field="${field}", value="${value?.substring(0, 50)}..."`);

    // 기존 필드 찾기
    const existingIndex = profile.customFields.findIndex(f =>
      f.label.toLowerCase() === field.toLowerCase()
    );

    if (existingIndex >= 0) {
      // 기존 필드 업데이트
      profile.customFields[existingIndex].value = value;
      profile.customFields[existingIndex].updatedAt = new Date();
    } else {
      // 새 필드 추가
      profile.customFields.push({
        key: field.toLowerCase().replace(/\s+/g, '_'),
        label: field,
        value: value,
        category: 'learned',  // 대화에서 학습한 정보
        updatedAt: new Date()
      });
    }

    await profile.save();

    return {
      success: true,
      message: `"${field}" 정보를 저장했어.`,
      action: existingIndex >= 0 ? 'updated' : 'created'
    };
  } catch (error) {
    console.error('[update_profile] Error:', error);
    return { error: error.message };
  }
}

/**
 * 내장 도구인지 확인
 */
function isBuiltinTool(toolName) {
  return builtinTools.some(t => t.name === toolName);
}

module.exports = {
  builtinTools,
  executeBuiltinTool,
  isBuiltinTool
};
