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
    description: '과거 대화나 기억을 검색할 때 사용. 키워드, 시간대, 감정, 주제 등 다양한 기준으로 검색 가능. "저번에", "예전에", "기억나?", "언제", "무슨 얘기" 같은 상황에서 호출.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색 키워드 (예: "프로젝트", "고양이")'
        },
        searchType: {
          type: 'string',
          description: '검색 유형',
          enum: ['keyword', 'time', 'emotion', 'topic', 'all'],
          default: 'all'
        },
        timeFilter: {
          type: 'string',
          description: '시간 필터 (예: "새벽", "아침", "저녁", "어제", "지난주", "1월 25일")'
        },
        emotion: {
          type: 'string',
          description: '감정 필터 (예: "기쁨", "피곤", "설렘")'
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
async function recallMemory({ query, searchType = 'all', timeFilter, emotion }) {
  try {
    const memoryManager = await getMemoryManager();
    const results = [];
    const queryLower = query?.toLowerCase() || '';

    console.log(`[recall_memory] Search: query="${query}", type=${searchType}, time=${timeFilter}, emotion=${emotion}`);

    // 1. 벡터 검색 (의미적 유사도)
    try {
      const vectorStore = require('./vector-store');
      const vectorResults = await vectorStore.search(query, 10);
      
      if (vectorResults.length > 0) {
        console.log(`[recall_memory] Vector search found ${vectorResults.length} results`);
        results.push({
          type: 'semantic_search',
          data: vectorResults.map(r => ({
            content: r.text,
            timestamp: r.metadata?.timestamp,
            role: r.metadata?.role,
            similarity: (1 - r.distance).toFixed(3)
          }))
        });
      }
    } catch (vecErr) {
      console.warn('[recall_memory] Vector search failed, falling back to keyword:', vecErr.message);
    }

    // 2. 주간 요약에서 검색 (보조)
    const weeklySummaries = await memoryManager.middleTerm.getRecentWeeklySummaries(4);
    
    const matchingSummaries = weeklySummaries.filter(s => {
      const searchText = `${s.summary} ${s.highlights?.join(' ')} ${s.topics?.join(' ')} ${s.emotions || ''}`.toLowerCase();
      if (queryLower && searchText.includes(queryLower)) return true;
      if (emotion && searchText.includes(emotion.toLowerCase())) return true;
      return false;
    });

    if (matchingSummaries.length > 0) {
      results.push({
        type: 'weekly_summaries',
        data: matchingSummaries.slice(0, 2).map(s => ({
          period: `${s.year}-${s.month} week ${s.weekNum}`,
          summary: s.summary,
          highlights: s.highlights
        }))
      });
    }

    // 3. 장기 메모리(아카이브)에서 검색 (보조)
    try {
      const archives = await memoryManager.longTerm.search(query, { limit: 3 });
      if (archives && archives.length > 0) {
        results.push({
          type: 'archives',
          data: archives.slice(0, 3).map(a => ({
            date: a.date || a.archivedAt,
            topics: a.topics,
            tags: a.tags
          }))
        });
      }
    } catch (archiveErr) {
      console.warn('[recall_memory] Archive search failed:', archiveErr.message);
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
