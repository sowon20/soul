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

    // 1. 주간 요약에서 검색
    const weeklySummaries = await memoryManager.middleTerm.getRecentWeeklySummaries(8);
    
    const matchingSummaries = weeklySummaries.filter(s => {
      const searchText = `${s.summary} ${s.highlights?.join(' ')} ${s.topics?.join(' ')} ${s.emotions || ''}`.toLowerCase();
      if (queryLower && searchText.includes(queryLower)) return true;
      if (emotion && searchText.includes(emotion.toLowerCase())) return true;
      return false;
    });

    if (matchingSummaries.length > 0) {
      results.push({
        type: 'weekly_summaries',
        data: matchingSummaries.slice(0, 3).map(s => ({
          period: `${s.year}-${s.month} week ${s.weekNum}`,
          summary: s.summary,
          highlights: s.highlights,
          topics: s.topics,
          emotions: s.emotions
        }))
      });
    }

    // 2. 원문(JSONL)에서 검색 - memoryManager 경로 사용
    try {
      const ConversationStore = require('./conversation-store');
      const path = require('path');
      // memoryManager의 middleTerm에서 storagePath 가져오기
      const memoryPath = memoryManager.middleTerm?.storagePath || '/Volumes/sowon-cloud/memory';
      const jsonlPath = path.join(memoryPath, 'conversations.jsonl');
      const store = new ConversationStore(jsonlPath);
      const allMessages = await store.getRecentMessages(500);
      console.log(`[recall_memory] Loaded ${allMessages.length} messages from ${jsonlPath}`);
      
      const matchingMessages = allMessages.filter(m => {
        const content = (m.text || m.content || '').toLowerCase();
        const msgDate = m.timestamp ? new Date(m.timestamp) : null;
        const hour = msgDate ? msgDate.getHours() : 0;
        const timeOfDay = hour < 6 ? '새벽' : hour < 12 ? '아침' : hour < 18 ? '오후' : '저녁';
        
        // searchType에 따른 검색
        switch (searchType) {
          case 'keyword':
            return content.includes(queryLower);
          
          case 'time':
            if (timeFilter) {
              const filterLower = timeFilter.toLowerCase();
              // 시간대 검색
              if (['새벽', '아침', '오후', '저녁'].includes(filterLower)) {
                return timeOfDay === filterLower;
              }
              // 날짜 검색 (예: "1월 25일", "어제")
              if (msgDate) {
                const dateStr = `${msgDate.getMonth() + 1}월 ${msgDate.getDate()}일`;
                if (filterLower.includes(dateStr) || dateStr.includes(filterLower.replace('월', '').replace('일', ''))) {
                  return true;
                }
              }
            }
            return false;
          
          case 'emotion':
            if (emotion) {
              return m.emotion?.toLowerCase().includes(emotion.toLowerCase()) ||
                     content.includes(emotion.toLowerCase());
            }
            return false;
          
          case 'topic':
            return m.tags?.some(t => t.toLowerCase().includes(queryLower)) ||
                   content.includes(queryLower);
          
          case 'all':
          default:
            // 모든 필드에서 검색
            if (queryLower && content.includes(queryLower)) return true;
            if (m.tags?.some(t => t.toLowerCase().includes(queryLower))) return true;
            if (m.emotion?.toLowerCase().includes(queryLower)) return true;
            if (emotion && m.emotion?.toLowerCase().includes(emotion.toLowerCase())) return true;
            if (timeFilter) {
              const filterLower = timeFilter.toLowerCase();
              if (timeOfDay === filterLower) return true;
            }
            return false;
        }
      });

      if (matchingMessages.length > 0) {
        const contextMessages = [];
        const seen = new Set();
        
        for (const msg of matchingMessages.slice(0, 5)) {
          const idx = allMessages.findIndex(m => m.id === msg.id);
          for (let i = Math.max(0, idx - 2); i <= Math.min(allMessages.length - 1, idx + 2); i++) {
            if (!seen.has(allMessages[i].id)) {
              seen.add(allMessages[i].id);
              contextMessages.push({
                role: allMessages[i].role,
                content: allMessages[i].text || allMessages[i].content,
                timestamp: allMessages[i].timestamp,
                emotion: allMessages[i].emotion,
                tags: allMessages[i].tags
              });
            }
          }
        }

        results.push({
          type: 'raw_conversations',
          matchCount: matchingMessages.length,
          data: contextMessages.slice(0, 15)
        });
        console.log(`[recall_memory] Found ${matchingMessages.length} raw messages`);
      }
    } catch (err) {
      console.warn('[recall_memory] Raw search failed:', err.message);
    }

    // 3. 장기 메모리(아카이브)에서 검색
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
