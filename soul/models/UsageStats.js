/**
 * UsageStats Model
 * AI 사용 통계 (SQLite)
 */

const { UsageStats } = require('../db/models');

/**
 * 사용 기록 추가
 */
UsageStats.addUsage = async function(data) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];

  return this.create({
    date,
    service: data.serviceId || 'unknown',
    model: data.modelId || 'unknown',
    inputTokens: data.inputTokens || 0,
    outputTokens: data.outputTokens || 0,
    requests: 1,
    metadata: JSON.stringify({
      tier: data.tier,
      tokenBreakdown: data.tokenBreakdown,
      cost: data.cost || 0,
      latency: data.latency || 0,
      sessionId: data.sessionId || 'main-conversation',
      category: data.category || 'chat',
      timestamp: now.toISOString(),
      hour: now.getHours()
    })
  });
};

/**
 * 기간별 통계 조회
 */
UsageStats.getStatsByPeriod = async function(period = 'today', options = {}) {
  const db = require('../db');
  if (!db.db) db.init();

  const now = new Date();
  let startDate;

  switch (period) {
    case 'today':
      startDate = now.toISOString().split('T')[0];
      break;
    case 'week':
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate = weekAgo.toISOString().split('T')[0];
      break;
    case 'month':
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      break;
    case 'custom':
      startDate = options.startDate || '1970-01-01';
      break;
    default:
      startDate = '1970-01-01';
  }

  // SQLite에서 집계
  const stmt = db.db.prepare(`
    SELECT
      COUNT(*) as totalRequests,
      SUM(input_tokens) as inputTokens,
      SUM(output_tokens) as outputTokens,
      SUM(input_tokens + output_tokens) as totalTokens
    FROM usage_stats
    WHERE date >= ?
  `);

  const stats = stmt.get(startDate) || {
    totalRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  };

  // 모델별 통계
  const modelStmt = db.db.prepare(`
    SELECT
      model,
      service,
      COUNT(*) as count,
      SUM(input_tokens + output_tokens) as totalTokens
    FROM usage_stats
    WHERE date >= ?
    GROUP BY model, service
    ORDER BY count DESC
  `);

  const modelStats = modelStmt.all(startDate);

  return {
    period,
    totalRequests: stats.totalRequests || 0,
    totalTokens: stats.totalTokens || 0,
    inputTokens: stats.inputTokens || 0,
    outputTokens: stats.outputTokens || 0,
    modelUsage: modelStats.map(m => ({
      modelId: m.model,
      serviceId: m.service,
      count: m.count,
      totalTokens: m.totalTokens
    }))
  };
};

/**
 * 일별 추이 조회
 */
UsageStats.getDailyTrend = async function(days = 7) {
  const db = require('../db');
  if (!db.db) db.init();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const stmt = db.db.prepare(`
    SELECT
      date,
      SUM(requests) as requests,
      SUM(input_tokens + output_tokens) as tokens
    FROM usage_stats
    WHERE date >= ?
    GROUP BY date
    ORDER BY date ASC
  `);

  return stmt.all(startDateStr).map(row => ({
    _id: row.date,
    requests: row.requests,
    tokens: row.tokens,
    cost: 0
  }));
};

module.exports = UsageStats;
