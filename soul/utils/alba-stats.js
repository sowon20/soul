/**
 * alba-stats.js
 * 알바(Worker) 호출 통계 — 메모리 내 (서버 재시작 시 리셋)
 *
 * 모든 알바 호출을 중앙 추적:
 * - digest-worker: 대화 요약/메모리 추출
 * - embedding-worker: 벡터 임베딩
 * - tool-worker: 도구 선별
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

module.exports = { trackCall, getAllStats, getStats, resetStats };
