/**
 * UsageStats Model
 * AI 사용 통계 (SQLite)
 */

const { UsageStats } = require('../db/models');

/**
 * 사용 기록 추가 (매 요청마다 별도 row)
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
    case 'week': {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate = weekAgo.toISOString().split('T')[0];
      break;
    }
    case 'month':
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      break;
    case 'custom':
      startDate = options.startDate || '1970-01-01';
      break;
    default:
      startDate = '1970-01-01';
  }

  // 기본 집계
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

  // metadata에서 상세 정보 추출
  const metaStmt = db.db.prepare(`
    SELECT metadata FROM usage_stats WHERE date >= ? AND metadata IS NOT NULL
  `);
  const metaRows = metaStmt.all(startDate);

  let totalCost = 0;
  let totalLatency = 0;
  let latencyCount = 0;
  const tierCounts = { light: 0, medium: 0, heavy: 0, single: 0 };
  const categoryCounts = {};
  let totalMessageTokens = 0;
  let totalSystemTokens = 0;
  let totalToolTokens = 0;
  let totalToolCount = 0;
  let breakdownCount = 0;

  for (const row of metaRows) {
    try {
      const meta = JSON.parse(row.metadata);
      if (meta.cost) totalCost += meta.cost;
      if (meta.latency) {
        totalLatency += meta.latency;
        latencyCount++;
      }
      if (meta.tier) {
        tierCounts[meta.tier] = (tierCounts[meta.tier] || 0) + 1;
      }
      if (meta.category) {
        categoryCounts[meta.category] = (categoryCounts[meta.category] || 0) + 1;
      }
      if (meta.tokenBreakdown) {
        totalMessageTokens += meta.tokenBreakdown.messages || 0;
        totalSystemTokens += meta.tokenBreakdown.system || 0;
        totalToolTokens += meta.tokenBreakdown.tools || 0;
        totalToolCount += meta.tokenBreakdown.toolCount || 0;
        breakdownCount++;
      }
    } catch (e) {
      // 파싱 실패 무시
    }
  }

  const totalReqs = stats.totalRequests || 1;

  // 복잡도 분포 (퍼센트)
  const distribution = {};
  for (const [tier, count] of Object.entries(tierCounts)) {
    if (count > 0) {
      distribution[tier] = Math.round((count / totalReqs) * 100) + '%';
    }
  }

  // 모델별 통계 (metadata에서 cost, latency도 추출)
  const modelStmt = db.db.prepare(`
    SELECT
      model,
      service,
      COUNT(*) as count,
      SUM(input_tokens + output_tokens) as totalTokens,
      metadata
    FROM usage_stats
    WHERE date >= ?
    GROUP BY model, service
    ORDER BY count DESC
  `);
  // GROUP BY + metadata는 마지막 row만 나옴 → 개별 row에서 집계 필요
  const modelMetaStmt = db.db.prepare(`
    SELECT model, service, metadata
    FROM usage_stats
    WHERE date >= ? AND metadata IS NOT NULL
  `);
  const modelMetaRows = modelMetaStmt.all(startDate);

  // 모델별 cost, latency 집계
  const modelAgg = {};
  for (const row of modelMetaRows) {
    const key = `${row.model}||${row.service}`;
    if (!modelAgg[key]) modelAgg[key] = { cost: 0, latency: 0, latencyCount: 0, tokens: 0 };
    try {
      const meta = JSON.parse(row.metadata);
      if (meta.cost) modelAgg[key].cost += meta.cost;
      if (meta.latency) {
        modelAgg[key].latency += meta.latency;
        modelAgg[key].latencyCount++;
      }
    } catch (e) {}
  }

  const modelBasicStmt = db.db.prepare(`
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
  const modelStats = modelBasicStmt.all(startDate);

  // 카테고리별 사용량 (토큰 포함)
  const categoryTokens = {};
  for (const row of modelMetaRows) {
    try {
      const meta = JSON.parse(row.metadata);
      const cat = meta.category || 'chat';
      if (!categoryTokens[cat]) categoryTokens[cat] = 0;
    } catch (e) {}
  }

  const categoryUsage = Object.entries(categoryCounts).map(([category, count]) => {
    // 카테고리별 토큰 계산
    const catTokenStmt = db.db.prepare(`
      SELECT SUM(input_tokens + output_tokens) as tokens
      FROM usage_stats
      WHERE date >= ? AND metadata LIKE ?
    `);
    const catTokenResult = catTokenStmt.get(startDate, `%"category":"${category}"%`);
    return {
      category,
      count,
      percentage: Math.round((count / totalReqs) * 100) + '%',
      totalTokens: catTokenResult?.tokens || 0
    };
  });

  return {
    period,
    totalRequests: stats.totalRequests || 0,
    totalTokens: stats.totalTokens || 0,
    inputTokens: stats.inputTokens || 0,
    outputTokens: stats.outputTokens || 0,
    totalCost,
    averageLatency: latencyCount > 0 ? totalLatency / latencyCount : null,
    distribution,
    tokenBreakdown: breakdownCount > 0 ? {
      messages: Math.round(totalMessageTokens / breakdownCount),
      system: Math.round(totalSystemTokens / breakdownCount),
      tools: Math.round(totalToolTokens / breakdownCount),
      avgToolCount: Math.round(totalToolCount / breakdownCount)
    } : {},
    modelUsage: modelStats.map(m => {
      const key = `${m.model}||${m.service}`;
      const agg = modelAgg[key] || {};
      return {
        modelId: m.model,
        serviceId: m.service,
        count: m.count,
        totalTokens: m.totalTokens || 0,
        cost: agg.cost || 0,
        avgLatency: agg.latencyCount > 0 ? agg.latency / agg.latencyCount : null,
        percentage: Math.round((m.count / totalReqs) * 100) + '%'
      };
    }),
    categoryUsage
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
      COUNT(*) as requests,
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

/**
 * 전체 삭제
 */
UsageStats.deleteMany = async function(query = {}) {
  const db = require('../db');
  if (!db.db) db.init();

  const result = db.db.prepare('DELETE FROM usage_stats').run();
  return { deletedCount: result.changes };
};

module.exports = UsageStats;
