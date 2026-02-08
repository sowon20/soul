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
    description: '너와 유저의 과거 대화와 기억을 DB에서 검색. 검색 결과는 모두 너와 유저 사이의 대화 기록이다. 확실하지 않은 것은 추측하지 말고 검색으로 확인할 것.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 키워드' },
        timeFilter: { type: 'string', description: '시간 범위(어제, 지난주, 2025년 11월, 최근 7일 등)' },
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
  },
  {
    name: 'execute_command',
    description: '서버에서 쉘 명령어 실행. 결과는 터미널에 실시간 표시됨. 위험한 명령(rm -rf /, shutdown 등)은 거부할 것.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '실행할 쉘 명령어' },
        timeout: { type: 'number', description: '타임아웃(초)', default: 30 }
      },
      required: ['command']
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
    case 'execute_command':
      return await executeCommandTool(input);
    default:
      return { error: `Unknown builtin tool: ${toolName}` };
  }
}

/**
 * timeFilter 자연어 → 날짜 범위 변환
 * @param {string} timeFilter - "어제", "지난주", "2025년 11월" 등
 * @returns {{ startDate: Date, endDate: Date } | null}
 */
function parseTimeFilter(timeFilter) {
  if (!timeFilter) return null;

  const now = new Date();
  const tf = timeFilter.trim().toLowerCase();

  // "오늘"
  if (tf === '오늘' || tf === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "어제"
  if (tf === '어제' || tf === 'yesterday') {
    const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "그저께" / "엊그제"
  if (tf === '그저께' || tf === '엊그제') {
    const start = new Date(now); start.setDate(start.getDate() - 2); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "이번 주" / "이번주"
  if (tf === '이번 주' || tf === '이번주' || tf === 'this week') {
    const dayOfWeek = now.getDay();
    const start = new Date(now); start.setDate(start.getDate() - dayOfWeek); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "지난주" / "지난 주"
  if (tf === '지난주' || tf === '지난 주' || tf === 'last week') {
    const dayOfWeek = now.getDay();
    const end = new Date(now); end.setDate(end.getDate() - dayOfWeek - 1); end.setHours(23, 59, 59, 999);
    const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end };
  }

  // "이번 달" / "이번달"
  if (tf === '이번 달' || tf === '이번달' || tf === 'this month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start, endDate: now };
  }

  // "지난달" / "지난 달"
  if (tf === '지난달' || tf === '지난 달' || tf === 'last month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "N일 전" 패턴
  const daysAgoMatch = tf.match(/(\d+)\s*일\s*전/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1]);
    const start = new Date(now); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "최근 N일" 패턴
  const recentDaysMatch = tf.match(/최근\s*(\d+)\s*일/);
  if (recentDaysMatch) {
    const days = parseInt(recentDaysMatch[1]);
    const start = new Date(now); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "YYYY년 MM월" 패턴 (예: "2025년 11월")
  const yearMonthMatch = tf.match(/(\d{4})\s*년?\s*(\d{1,2})\s*월/);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1]);
    const month = parseInt(yearMonthMatch[2]) - 1;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "MM월" 패턴 (올해 기준, 미래 월이면 작년)
  const monthOnlyMatch = tf.match(/^(\d{1,2})\s*월$/);
  if (monthOnlyMatch) {
    const month = parseInt(monthOnlyMatch[1]) - 1;
    const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "YYYY-MM-DD to YYYY-MM-DD" 또는 "YYYY-MM-DD ~ YYYY-MM-DD" 패턴
  const rangeMatch = tf.match(/(\d{4}-\d{1,2}-\d{1,2})\s*(?:to|~|부터)\s*(\d{4}-\d{1,2}-\d{1,2})/);
  if (rangeMatch) {
    const start = new Date(rangeMatch[1]); start.setHours(0, 0, 0, 0);
    const end = new Date(rangeMatch[2]); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "YYYY-MM-DD" 단일 날짜
  const singleDateMatch = tf.match(/^(\d{4}-\d{1,2}-\d{1,2})$/);
  if (singleDateMatch) {
    const start = new Date(singleDateMatch[1]); start.setHours(0, 0, 0, 0);
    const end = new Date(singleDateMatch[1]); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  return null;
}

/**
 * recall_memory 구현 - 단계적 검색 (기억 → 달력 → 일기)
 *
 * 1단계 (기억): 벡터 검색으로 요약/메모리에서 관련 내용 찾기
 * 2단계 (달력): 1단계 결과 + 다이제스트 키워드/엔티티에서 날짜 특정
 * 3단계 (일기): 특정된 날짜의 원문에서 해당 위치 주변 2~3턴만 읽기
 */
async function recallMemory({ query, timeFilter, limit = 5 }) {
  try {
    const results = [];
    const queryLower = query?.toLowerCase() || '';

    // 시간 필터 파싱
    const timeRange = parseTimeFilter(timeFilter);
    const timeOpts = timeRange ? {
      startDate: timeRange.startDate,
      endDate: timeRange.endDate
    } : {};

    const keywords = query.split(/[\s,.\-!?~]+/).filter(k => k.length >= 2);

    console.log(`[recall_memory] query="${query}", time=${timeFilter || 'none'}, keywords=[${keywords.join(',')}]`);

    // ========================================
    // 1단계: 기억 더듬기 (벡터 + DB 키워드)
    // ========================================
    let vectorHits = [];
    try {
      const vectorStore = require('./vector-store');
      vectorHits = await Promise.race([
        vectorStore.search(query, limit * 2, timeOpts),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ]);

      for (const r of vectorHits) {
        const similarity = 1 - r.distance;
        if (similarity < 0.3) continue; // 너무 낮은 유사도 제외
        results.push({
          source: 'memory',
          content: r.text,
          timestamp: r.metadata?.timestamp,
          role: r.metadata?.role,
          score: similarity
        });
      }
      console.log(`[recall_memory] 1단계(기억): ${results.length}건`);
    } catch (e) {
      console.warn('[recall_memory] 1단계 실패:', e.message);
    }

    // 1단계에서 충분하면 (높은 유사도 결과가 limit 이상) 바로 반환
    const highConfidence = results.filter(r => r.score >= 0.7);
    if (highConfidence.length >= limit) {
      console.log(`[recall_memory] 1단계에서 충분 (${highConfidence.length}건 고신뢰)`);
      return formatResults(highConfidence.slice(0, limit), timeRange);
    }

    // ========================================
    // 2단계: 달력 확인 (다이제스트 키워드/엔티티로 날짜 특정)
    // ========================================
    const targetDates = new Set();
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const configManager = require('./config');
      const memConfig = await configManager.getMemoryConfig();
      const storagePath = memConfig?.storagePath?.replace(/^~/, require('os').homedir()) || `${require('os').homedir()}/.soul`;
      const digestsDir = path.join(storagePath, 'digests');

      const digestFiles = await fs.readdir(digestsDir).catch(() => []);
      for (const file of digestFiles) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(digestsDir, file), 'utf-8');
          let digests = JSON.parse(raw);
          if (!Array.isArray(digests)) digests = [digests];

          for (const d of digests) {
            const allTags = [
              ...(d.keywords || []),
              ...(d.entities || []),
              d.summary || ''
            ].join(' ').toLowerCase();

            const matched = keywords.filter(k => allTags.includes(k.toLowerCase()));
            if (matched.length > 0 || allTags.includes(queryLower)) {
              // 이 다이제스트의 타임스탬프에서 날짜 추출
              if (d.timestamp) {
                targetDates.add(d.timestamp.split('T')[0]);
              }
              // 요약 내용도 결과에 추가
              if (d.summary && !results.some(r => r.content === d.summary)) {
                results.push({
                  source: 'digest',
                  content: d.summary,
                  timestamp: d.timestamp,
                  keywords: matched,
                  score: (matched.length / keywords.length) * 0.6
                });
              }
            }
          }
        } catch (e) { /* 개별 파일 실패 무시 */ }
      }
      console.log(`[recall_memory] 2단계(달력): 날짜 ${targetDates.size}개 특정, digest ${results.filter(r => r.source === 'digest').length}건`);
    } catch (e) {
      console.warn('[recall_memory] 2단계 실패:', e.message);
    }

    // ========================================
    // 3단계: 일기 읽기 (특정 날짜 원문에서 주변 턴만)
    // ========================================
    if (targetDates.size > 0 && results.filter(r => r.score >= 0.6).length < limit) {
      try {
        const { getArchiverAsync } = require('./conversation-archiver');
        const archiver = await getArchiverAsync();

        for (const dateStr of targetDates) {
          const date = new Date(dateStr + 'T00:00:00');
          const dayMessages = await archiver.getMessagesForDate(date);
          if (!dayMessages || dayMessages.length === 0) continue;

          // 이 날짜의 메시지에서 키워드 매칭 + 점수 수집
          const candidates = [];
          for (let i = 0; i < dayMessages.length; i++) {
            const msg = dayMessages[i];
            const content = (msg.content || msg.text || '').toLowerCase();
            const matched = keywords.filter(k => content.includes(k));
            if (matched.length > 0) {
              candidates.push({ index: i, msg, matched });
            }
          }

          // 매칭 키워드 많은 순 정렬 → 상위 몇 건만
          candidates.sort((a, b) => b.matched.length - a.matched.length);
          const topCandidates = candidates.slice(0, limit);

          for (const { index: i, msg, matched } of topCandidates) {
            // 주변 2~3턴 읽기 (앞 1턴 + 현재 + 뒤 1턴)
            const context = [];
            for (let j = Math.max(0, i - 1); j <= Math.min(dayMessages.length - 1, i + 1); j++) {
              const m = dayMessages[j];
              context.push({
                role: m.role,
                content: (m.content || m.text || '').substring(0, 300),
                timestamp: m.timestamp
              });
            }

            // 중복 방지
            const contentKey = (msg.content || msg.text || '').substring(0, 50);
            if (!results.some(r => (r.content || '').substring(0, 50) === contentKey)) {
              results.push({
                source: 'original',
                date: dateStr,
                content: (msg.content || msg.text || '').substring(0, 500),
                role: msg.role,
                timestamp: msg.timestamp,
                context,
                matchedKeywords: matched,
                score: 0.7 + (matched.length / keywords.length) * 0.3
              });
            }
          }
        }
        console.log(`[recall_memory] 3단계(일기): ${results.filter(r => r.source === 'original').length}건`);
      } catch (e) {
        console.warn('[recall_memory] 3단계 실패:', e.message);
      }
    }

    // === 정렬 + 반환 ===
    results.sort((a, b) => b.score - a.score);

    if (results.length === 0) {
      return {
        found: false,
        message: `"${query}" 관련 기억을 못 찾았어. 다른 키워드로 다시 검색해볼까?`
      };
    }

    return formatResults(results.slice(0, limit), timeRange);
  } catch (error) {
    console.error('[recall_memory] Error:', error);
    return { error: error.message };
  }
}

function formatResults(results, timeRange) {
  const finalResults = results.map(r => {
    const result = { ...r };
    result.relevance = r.score?.toFixed(2);
    delete result.score;
    return result;
  });

  return {
    found: true,
    count: finalResults.length,
    timeRange: timeRange ? {
      from: timeRange.startDate.toISOString().split('T')[0],
      to: timeRange.endDate.toISOString().split('T')[0]
    } : null,
    results: finalResults
  };
}

/**
 * get_profile 구현 - 사용자 프로필 상세 조회
 */
async function getProfile({ field, userId } = {}) {
  try {
    const profile = await ProfileModel.getOrCreateDefault(userId || 'default');

    console.log(`[get_profile] field=${field || 'all'}`);

    // 특정 필드만 요청한 경우
    if (field) {
      const fieldLower = field.toLowerCase();
      const customField = (profile.customFields || []).find(f =>
        (f.label || '').toLowerCase().includes(fieldLower) ||
        (f.key || '').toLowerCase().includes(fieldLower)
      );

      if (customField) {
        return {
          found: true,
          field: customField.label,
          value: customField.value
        };
      }

      // 기본 정보에서 찾기
      const basicInfo = profile.basicInfo || {};
      if (basicInfo[fieldLower]) {
        const val = basicInfo[fieldLower];
        return { found: true, field, value: typeof val === 'object' ? val.value : val };
      }

      return { found: false, message: `"${field}" 필드를 찾지 못했어.` };
    }

    // 전체 프로필 반환
    const basicInfo = profile.basicInfo || {};
    const simplifiedBasicInfo = {};
    for (const [key, val] of Object.entries(basicInfo)) {
      simplifiedBasicInfo[key] = typeof val === 'object' ? val.value : val;
    }

    return {
      found: true,
      basicInfo: simplifiedBasicInfo,
      customFields: (profile.customFields || []).map(f => ({
        label: f.label,
        value: f.value
      }))
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

/**
 * execute_command 구현
 * 터미널 서비스의 PTY에서 명령어 실행, 결과 반환
 * 캔버스 터미널에도 실시간으로 표시됨
 */
async function executeCommandTool({ command, timeout = 30 }) {
  try {
    const terminalService = require('./terminal-service');

    if (!terminalService.isAvailable()) {
      return { error: 'node-pty를 사용할 수 없습니다' };
    }

    // 기본 세션 사용 (없으면 생성)
    const session = terminalService.getOrCreateSession({ sessionId: 'default' });

    // 명령어 실행 + 결과 대기
    const output = await terminalService.executeCommand(session.id, command, timeout * 1000);

    // 결과가 너무 길면 잘라서 반환 (AI 컨텍스트 절약)
    const maxLen = 3000;
    const truncated = output.length > maxLen
      ? output.slice(0, maxLen) + `\n...(${output.length - maxLen}자 생략)`
      : output;

    return {
      success: true,
      command,
      output: truncated
    };
  } catch (error) {
    console.error('[execute_command] Error:', error);
    return { error: error.message, command };
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
