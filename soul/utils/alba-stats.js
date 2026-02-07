/**
 * alba-stats.js
 * 알바(Worker) 호출 통계
 *
 * - 실시간 통계: 메모리 내 (서버 재시작 시 리셋)
 * - 마지막 호출: DB 영구 저장 (서버 재시작 후에도 유지)
 */

const _stats = {};
const _startedAt = new Date().toISOString();

/**
 * 알바 호출 기록
 * @param {string} roleId - 알바 ID (예: 'digest-worker', 'embedding-worker', 'tool-worker')
 * @param {object} info - 호출 정보
 * @param {string} info.action - 수행 작업 (예: 'digest', 'embed', 'tool-select')
 * @param {number} info.tokens - 추정 토큰 수
 * @param {number} info.latencyMs - 응답 시간 (ms)
 * @param {boolean} info.success - 성공 여부
 * @param {string} [info.model] - 사용 모델
 * @param {string} [info.detail] - 상세 설명
 */
function trackCall(roleId, info = {}) {
  if (!_stats[roleId]) {
    _stats[roleId] = {
      totalCalls: 0,
      successCalls: 0,
      failCalls: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      actions: {},       // { 'digest': { calls: N, tokens: N }, ... }
      recentCalls: [],   // 최근 20건
      lastCall: null
    };
  }

  const s = _stats[roleId];
  s.totalCalls++;
  if (info.success !== false) s.successCalls++;
  else s.failCalls++;
  s.totalTokens += (info.tokens || 0);
  s.totalLatencyMs += (info.latencyMs || 0);
  s.lastCall = new Date().toISOString();

  // 작업별 분류
  const action = info.action || 'unknown';
  if (!s.actions[action]) {
    s.actions[action] = { calls: 0, tokens: 0 };
  }
  s.actions[action].calls++;
  s.actions[action].tokens += (info.tokens || 0);

  // 최근 호출 20건 유지
  s.recentCalls.push({
    action,
    tokens: info.tokens || 0,
    latencyMs: info.latencyMs || 0,
    success: info.success !== false,
    model: info.model || null,
    detail: info.detail || null,
    at: new Date().toISOString()
  });
  if (s.recentCalls.length > 20) {
    s.recentCalls.shift();
  }

  // DB에 마지막 호출 정보 영구 저장 (비동기, 에러 무시)
  _saveLastCallToDB(roleId, {
    action,
    tokens: info.tokens || 0,
    latencyMs: info.latencyMs || 0,
    success: info.success !== false,
    model: info.model || null,
    detail: info.detail || null,
    at: s.lastCall
  });
}

/**
 * DB에 마지막 호출 정보 저장 (비동기)
 */
function _saveLastCallToDB(roleId, callInfo) {
  try {
    const db = require('../db');
    if (!db.db) return;
    const json = JSON.stringify(callInfo);
    db.db.prepare('UPDATE roles SET last_call_info = ? WHERE role_id = ?').run(json, roleId);
  } catch (e) {
    // 무시 — DB 저장 실패해도 메모리 통계는 유지
  }
}

/**
 * DB에서 마지막 호출 정보 조회
 */
function getLastCallFromDB(roleId) {
  try {
    const db = require('../db');
    if (!db.db) return null;
    const row = db.db.prepare('SELECT last_call_info FROM roles WHERE role_id = ?').get(roleId);
    if (row?.last_call_info) {
      return JSON.parse(row.last_call_info);
    }
  } catch (e) {
    // 무시
  }
  return null;
}

/**
 * 전체 알바의 DB 마지막 호출 정보 조회
 */
function getAllLastCallsFromDB() {
  try {
    const db = require('../db');
    if (!db.db) return {};
    const rows = db.db.prepare('SELECT role_id, last_call_info FROM roles WHERE last_call_info IS NOT NULL').all();
    const result = {};
    for (const row of rows) {
      try {
        result[row.role_id] = JSON.parse(row.last_call_info);
      } catch (e) { /* skip */ }
    }
    return result;
  } catch (e) {
    return {};
  }
}

/**
 * 전체 알바 통계 조회
 */
function getAllStats() {
  const result = {};
  for (const [roleId, s] of Object.entries(_stats)) {
    result[roleId] = {
      totalCalls: s.totalCalls,
      successCalls: s.successCalls,
      failCalls: s.failCalls,
      totalTokens: s.totalTokens,
      avgLatencyMs: s.totalCalls > 0 ? Math.round(s.totalLatencyMs / s.totalCalls) : 0,
      successRate: s.totalCalls > 0 ? Math.round((s.successCalls / s.totalCalls) * 100) : 0,
      actions: s.actions,
      recentCalls: s.recentCalls,
      lastCall: s.lastCall
    };
  }
  return { startedAt: _startedAt, roles: result };
}

/**
 * 특정 알바 통계 조회
 */
function getStats(roleId) {
  const s = _stats[roleId];
  if (!s) return null;
  return {
    totalCalls: s.totalCalls,
    successCalls: s.successCalls,
    failCalls: s.failCalls,
    totalTokens: s.totalTokens,
    avgLatencyMs: s.totalCalls > 0 ? Math.round(s.totalLatencyMs / s.totalCalls) : 0,
    successRate: s.totalCalls > 0 ? Math.round((s.successCalls / s.totalCalls) * 100) : 0,
    actions: s.actions,
    recentCalls: s.recentCalls,
    lastCall: s.lastCall
  };
}

/**
 * 통계 리셋
 */
function resetStats(roleId) {
  if (roleId) {
    delete _stats[roleId];
  } else {
    Object.keys(_stats).forEach(k => delete _stats[k]);
  }
}

module.exports = { trackCall, getAllStats, getStats, resetStats, getLastCallFromDB, getAllLastCallsFromDB };
