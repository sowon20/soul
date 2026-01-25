/**
 * builtin-tools.js
 * AI가 자율적으로 호출하는 내장 도구
 */

const { getMemoryManager } = require('./memory-layers');

/**
 * 내장 도구 정의 (Claude tool_use 형식)
 */
const builtinTools = [
  {
    name: 'recall_memory',
    description: '과거 대화 맥락이 필요할 때 호출. 주간 요약이나 관련 기억을 검색해서 가져온다. "저번에", "예전에", "기억나?" 같은 상황이나 과거 맥락이 필요할 때 사용.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색할 키워드나 주제 (예: "프로젝트 설계", "고양이 사료")'
        },
        timeRange: {
          type: 'string',
          description: '검색 범위 (예: "last_week", "last_month", "all")',
          enum: ['last_week', 'last_month', 'all']
        }
      },
      required: ['query']
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
    default:
      return { error: `Unknown builtin tool: ${toolName}` };
  }
}

/**
 * recall_memory 구현
 */
async function recallMemory({ query, timeRange = 'all' }) {
  try {
    const memoryManager = await getMemoryManager();
    const results = [];

    // 1. 주간 요약에서 검색
    const weeklySummaries = await memoryManager.middleTerm.getRecentWeeklySummaries(8);
    const matchingSummaries = weeklySummaries.filter(s => {
      const searchText = `${s.summary} ${s.highlights?.join(' ')} ${s.topics?.join(' ')}`.toLowerCase();
      return searchText.includes(query.toLowerCase());
    });

    if (matchingSummaries.length > 0) {
      results.push({
        type: 'weekly_summaries',
        data: matchingSummaries.slice(0, 3).map(s => ({
          period: `${s.year}-${s.month} week ${s.weekNum}`,
          summary: s.summary,
          highlights: s.highlights,
          topics: s.topics
        }))
      });
    }

    // 2. 장기 메모리(아카이브)에서 검색
    const archives = await memoryManager.longTerm.search(query, { limit: 5 });
    if (archives && archives.length > 0) {
      results.push({
        type: 'archives',
        data: archives.slice(0, 5).map(a => ({
          date: a.date || a.archivedAt,
          topics: a.topics,
          tags: a.tags
        }))
      });
    }

    if (results.length === 0) {
      return { found: false, message: `"${query}"와 관련된 기억을 찾지 못했어.` };
    }

    return { found: true, results };
  } catch (error) {
    console.error('[recall_memory] Error:', error);
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
