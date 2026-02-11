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
        query: { type: 'string', description: '검색 키워드 (구체적으로)' },
        timeFilter: { type: 'string', description: '특정 시점이 확실할 때만 사용(예: 2025년 11월, 어제). 모르면 생략 — 생략시 전체 기간 검색' },
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
  },
  {
    name: 'save_memory',
    description: '대화에서 알게 된 중요한 사실, 관계, 변화를 기억으로 저장하세요. 예: 이름 변경, 취향, 인물 관계, 중요한 사건.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '기억할 내용 (구체적으로)' },
        category: { type: 'string', enum: ['fact', 'preference', 'relationship', 'event', 'general'], description: 'fact=사실, preference=취향, relationship=관계, event=사건, general=기타' },
        tags: { type: 'array', items: { type: 'string' }, description: '관련 키워드 태그' }
      },
      required: ['content', 'category']
    }
  },
  {
    name: 'update_memory',
    description: '이전에 저장한 기억을 수정하거나 비활성화하세요. list_memories로 id를 확인 후 사용.',
    input_schema: {
      type: 'object',
      properties: {
        memory_id: { type: 'number', description: '수정할 기억의 id' },
        content: { type: 'string', description: '새 내용 (변경 시)' },
        category: { type: 'string', enum: ['fact', 'preference', 'relationship', 'event', 'general'] },
        tags: { type: 'array', items: { type: 'string' } },
        is_active: { type: 'boolean', description: 'false로 비활성화 (soft delete)' }
      },
      required: ['memory_id']
    }
  },
  {
    name: 'list_memories',
    description: '내가 저장한 기억들을 확인하세요. 카테고리별 필터, 키워드 검색 가능. include_hidden=true로 비활성화된 기억도 볼 수 있음.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['fact', 'preference', 'relationship', 'event', 'general'], description: '카테고리 필터' },
        query: { type: 'string', description: '내용 검색 키워드' },
        limit: { type: 'number', description: '최대 개수', default: 20 },
        include_hidden: { type: 'boolean', description: '비활성화된 기억도 포함할지 여부', default: false }
      },
      required: []
    }
  },
  {
    name: 'update_tags',
    description: '대화 메시지의 태그를 추가, 수정, 삭제하세요. 대화 맥락상 중요한 키워드를 태그로 보완할 때 사용.',
    input_schema: {
      type: 'object',
      properties: {
        message_id: { type: 'number', description: '태그를 수정할 메시지 id' },
        tags: { type: 'array', items: { type: 'string' }, description: '태그 배열' },
        mode: { type: 'string', enum: ['replace', 'add', 'remove'], description: 'replace=전체교체, add=기존에추가, remove=특정태그삭제', default: 'add' }
      },
      required: ['message_id', 'tags']
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
    case 'save_memory':
      return await saveMemory(input);
    case 'update_memory':
      return await updateMemory(input);
    case 'list_memories':
      return await listMemories(input);
    case 'update_tags':
      return await updateTags(input);
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

  // "최근 N개월" / "최근 N달" 패턴
  const recentMonthsMatch = tf.match(/최근\s*(\d+)\s*(?:개월|달)/);
  if (recentMonthsMatch) {
    const months = parseInt(recentMonthsMatch[1]);
    const start = new Date(now); start.setMonth(start.getMonth() - months); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "최근 N년" 패턴
  const recentYearsMatch = tf.match(/최근\s*(\d+)\s*년/);
  if (recentYearsMatch) {
    const years = parseInt(recentYearsMatch[1]);
    const start = new Date(now); start.setFullYear(start.getFullYear() - years); start.setHours(0, 0, 0, 0);
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
 * recall_memory 구현 - 3경로 병렬 검색
 *
 * 경로 1 (벡터): HNSW/brute-force로 원문 임베딩 직접 검색
 * 경로 2 (태그): 키워드를 태그로 변환하여 아카이브 태그 검색
 * 경로 3 (키워드): 아카이브 원문에서 키워드 매칭 (벡터 결과가 부족할 때)
 *
 * 벡터 검색이 원문을 직접 임베딩하므로 날짜→원문 2단계 불필요
 */
async function recallMemory({ query, timeFilter, limit = 5 }) {
  try {
    const keywords = query.split(/[\s,.\-!?~]+/).filter(k => k.length >= 2);
    const timeRange = parseTimeFilter(timeFilter);
    const timeOpts = timeRange ? { startDate: timeRange.startDate, endDate: timeRange.endDate } : {};

    console.log(`[recall_memory] query="${query}", time=${timeFilter || 'none'}, keywords=[${keywords.join(',')}]`);

    const results = [];
    const seenKeys = new Set(); // 중복 방지

    function addResult(r) {
      const key = (r.content || '').substring(0, 80);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      results.push(r);
    }

    // ========================================
    // 경로 0: Soul Memory 검색 (사실 관계 우선)
    // ========================================
    try {
      const db = require('../db');
      let memorySql = 'SELECT * FROM soul_memories WHERE is_active = 1 AND (content LIKE ?';
      const memoryParams = [`%${query}%`];

      // 각 키워드로도 검색
      for (const kw of keywords) {
        memorySql += ' OR content LIKE ?';
        memoryParams.push(`%${kw}%`);
      }
      memorySql += ') ORDER BY updated_at DESC LIMIT ?';
      memoryParams.push(limit);

      const memories = db.db.prepare(memorySql).all(...memoryParams);

      for (const m of memories) {
        addResult({
          source: 'soul_memory',
          date: m.source_date || m.created_at?.substring(0, 10),
          content: m.content,
          category: m.category,
          tags: m.tags ? JSON.parse(m.tags) : [],
          score: 0.95  // memory는 명시적 사실이므로 최고 점수
        });
      }
      if (memories.length > 0) {
        console.log(`[recall_memory] 경로0(memory): ${memories.length}건`);
      }
    } catch (e) {
      console.warn('[recall_memory] 경로0 실패:', e.message);
    }

    // ========================================
    // 경로 1: 벡터 검색 (HNSW → brute-force 폴백)
    // 원문 임베딩이므로 결과가 곧 원문
    // ========================================
    try {
      const vectorStore = require('./vector-store');
      const vectorHits = await Promise.race([
        vectorStore.search(query, limit * 3, timeOpts),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ]);

      for (const r of vectorHits) {
        const similarity = 1 - r.distance;
        if (similarity < 0.3) continue;
        const dateStr = r.metadata?.sourceDate || (r.metadata?.timestamp || '').substring(0, 10);

        addResult({
          source: r.metadata?.source?.startsWith('conversation:') ? 'conversation' : (r.metadata?.source || 'vector'),
          date: dateStr,
          content: (r.text || '').substring(0, 500),
          role: r.metadata?.role,
          timestamp: r.metadata?.timestamp,
          score: similarity
        });
      }
      console.log(`[recall_memory] 경로1(벡터): ${results.length}건`);
    } catch (e) {
      console.warn('[recall_memory] 경로1 실패:', e.message);
    }

    // ========================================
    // 경로 2: 태그 검색 (벡터 결과 부족 시)
    // ========================================
    if (results.length < limit && keywords.length > 0) {
      try {
        const { getArchiverAsync } = require('./conversation-archiver');
        const archiver = await getArchiverAsync();
        const tagResults = await archiver.searchByTags(
          keywords,
          timeOpts.startDate || null,
          timeOpts.endDate || null,
          { matchType: 'any', limit: limit * 2, withContext: true }
        );

        for (const r of tagResults) {
          addResult({
            source: 'tag_search',
            date: r.date,
            content: r.content,
            role: r.role,
            timestamp: r.timestamp,
            context: r.context,
            score: 0.5 + (r.matchCount / Math.max(keywords.length, 1)) * 0.3
          });
        }
        console.log(`[recall_memory] 경로2(태그): +${tagResults.length}건 → 총 ${results.length}건`);
      } catch (e) {
        console.warn('[recall_memory] 경로2 실패:', e.message);
      }
    }

    // ========================================
    // 경로 3: 키워드 매칭 (여전히 부족할 때)
    // ========================================
    if (results.length < 2 && keywords.length > 0) {
      try {
        const { getArchiverAsync } = require('./conversation-archiver');
        const archiver = await getArchiverAsync();
        const kwResults = await archiver.searchByKeywords(keywords, {
          startDate: timeOpts.startDate || null,
          endDate: timeOpts.endDate || null,
          limit: limit * 2
        });

        for (const r of kwResults) {
          addResult({
            source: 'keyword_search',
            date: (r.timestamp || '').substring(0, 10),
            content: (r.content || '').substring(0, 500),
            role: r.role,
            timestamp: r.timestamp,
            score: 0.3 + r.matchRatio * 0.4
          });
        }
        console.log(`[recall_memory] 경로3(키워드): +${kwResults.length}건 → 총 ${results.length}건`);
      } catch (e) {
        console.warn('[recall_memory] 경로3 실패:', e.message);
      }
    }

    // === 정렬 + 반환 ===
    results.sort((a, b) => b.score - a.score);

    if (results.length === 0) {
      return {
        found: false,
        message: `"${query}" 관련 기억을 찾지 못했습니다. 검색 결과가 없으므로 사실만 이야기하세요. 기억에 없는 내용을 사실처럼 말하지 마세요. 다른 키워드로 재검색하거나, 사용자에게 직접 물어보세요.`
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

// ========================================
// Memory 도구 구현 (save/update/list)
// ========================================

/**
 * save_memory — 새 기억 저장
 */
async function saveMemory({ content, category = 'general', tags }) {
  try {
    const db = require('../db');

    // 중복 체크
    const existing = db.db.prepare(
      'SELECT id FROM soul_memories WHERE content = ? AND is_active = 1'
    ).get(content);
    if (existing) {
      return { success: false, message: '이미 동일한 기억이 저장되어 있어.', existing_id: existing.id };
    }

    const now = new Date().toISOString();
    const tagsJson = tags ? JSON.stringify(tags) : null;
    const sourceDate = now.substring(0, 10);

    const result = db.db.prepare(
      'INSERT INTO soul_memories (category, content, tags, source_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(category, content, tagsJson, sourceDate, now, now);

    console.log(`[save_memory] id=${result.lastInsertRowid} category=${category} content="${content.substring(0, 50)}..."`);

    return {
      success: true,
      id: result.lastInsertRowid,
      message: `기억을 저장했어. (id: ${result.lastInsertRowid}, category: ${category})`
    };
  } catch (error) {
    console.error('[save_memory] Error:', error);
    return { error: error.message };
  }
}

/**
 * update_memory — 기존 기억 수정
 */
async function updateMemory({ memory_id, content, category, tags, is_active }) {
  try {
    const db = require('../db');

    const existing = db.db.prepare('SELECT * FROM soul_memories WHERE id = ?').get(memory_id);
    if (!existing) {
      return { success: false, message: `id ${memory_id} 기억을 찾지 못했어.` };
    }

    const updates = [];
    const values = [];

    if (content !== undefined) { updates.push('content = ?'); values.push(content); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (updates.length === 0) {
      return { success: false, message: '수정할 항목이 없어.' };
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(memory_id);

    db.db.prepare(`UPDATE soul_memories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    console.log(`[update_memory] id=${memory_id} fields=[${updates.join(',')}]`);

    return {
      success: true,
      message: is_active === false
        ? `기억 id ${memory_id}를 비활성화했어.`
        : `기억 id ${memory_id}를 수정했어.`
    };
  } catch (error) {
    console.error('[update_memory] Error:', error);
    return { error: error.message };
  }
}

/**
 * list_memories — 기억 목록 조회
 */
async function listMemories({ category, query, limit = 20, include_hidden = false } = {}) {
  try {
    const db = require('../db');

    let sql = 'SELECT * FROM soul_memories';
    const params = [];

    if (!include_hidden) {
      sql += ' WHERE is_active = 1';
    } else {
      sql += ' WHERE 1=1';  // include_hidden이면 비활성화된 것도 포함
    }

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (query) {
      sql += ' AND content LIKE ?';
      params.push(`%${query}%`);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.db.prepare(sql).all(...params);

    // tags JSON 파싱
    const memories = rows.map(r => ({
      id: r.id,
      category: r.category,
      content: r.content,
      tags: r.tags ? JSON.parse(r.tags) : [],
      is_active: r.is_active === 1,
      sourceDate: r.source_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    console.log(`[list_memories] category=${category || 'all'} query="${query || ''}" include_hidden=${include_hidden} → ${memories.length}건`);

    return {
      count: memories.length,
      memories
    };
  } catch (error) {
    console.error('[list_memories] Error:', error);
    return { error: error.message };
  }
}

// ========================================
// 태그 관리 도구 구현
// ========================================

/**
 * update_tags — 메시지 태그 수정
 * DB messages 테이블 + archive JSON 파일 양쪽 동기화
 */
async function updateTags({ message_id, tags, mode = 'add' }) {
  try {
    const db = require('../db');

    // 1. DB에서 메시지 조회
    const msg = db.db.prepare('SELECT id, tags, timestamp, content FROM messages WHERE id = ?').get(message_id);
    if (!msg) {
      return { success: false, message: `메시지 id ${message_id}를 찾지 못했어.` };
    }

    // 현재 태그 파싱
    let currentTags = [];
    try { currentTags = msg.tags ? JSON.parse(msg.tags) : []; } catch { currentTags = []; }

    // 모드별 처리
    let newTags;
    if (mode === 'replace') {
      newTags = tags;
    } else if (mode === 'add') {
      newTags = [...new Set([...currentTags, ...tags])];
    } else if (mode === 'remove') {
      const removeSet = new Set(tags);
      newTags = currentTags.filter(t => !removeSet.has(t));
    } else {
      return { success: false, message: `알 수 없는 mode: ${mode}` };
    }

    // 2. DB 업데이트
    db.db.prepare('UPDATE messages SET tags = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(newTags), new Date().toISOString(), message_id);

    // 3. Archive JSON 파일도 동기화
    try {
      const { getArchiverAsync } = require('./conversation-archiver');
      const archiver = await getArchiverAsync();
      if (msg.timestamp && archiver.updateMessageTags) {
        await archiver.updateMessageTags(msg.timestamp, newTags);
      }
    } catch (e) {
      console.warn('[update_tags] Archive 동기화 실패 (DB만 업데이트됨):', e.message);
    }

    console.log(`[update_tags] id=${message_id} mode=${mode} before=[${currentTags.join(',')}] after=[${newTags.join(',')}]`);

    return {
      success: true,
      message_id,
      previous_tags: currentTags,
      current_tags: newTags,
      message: `태그를 ${mode === 'add' ? '추가' : mode === 'remove' ? '삭제' : '교체'}했어.`
    };
  } catch (error) {
    console.error('[update_tags] Error:', error);
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
