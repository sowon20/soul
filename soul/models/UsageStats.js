/**
 * UsageStats.js
 * AI 사용 통계 MongoDB 모델
 *
 * 요청마다 기록하여 기간별 조회 가능
 */

const mongoose = require('mongoose');

const usageStatsSchema = new mongoose.Schema({
  // 시간 정보
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  date: {
    type: String, // YYYY-MM-DD 형식
    index: true
  },
  hour: {
    type: Number, // 0-23
    index: true
  },

  // 모델 정보
  tier: {
    type: String,
    enum: ['light', 'medium', 'heavy'],
    required: true,
    index: true
  },
  modelId: {
    type: String,
    required: true,
    index: true
  },
  serviceId: {
    type: String,
    required: true,
    index: true
  },

  // 사용량 정보
  inputTokens: {
    type: Number,
    default: 0
  },
  outputTokens: {
    type: Number,
    default: 0
  },
  totalTokens: {
    type: Number,
    default: 0
  },

  // 비용 (USD)
  cost: {
    type: Number,
    default: 0
  },

  // 응답 시간 (ms)
  latency: {
    type: Number,
    default: 0
  },

  // 세션 정보
  sessionId: {
    type: String,
    default: 'main-conversation'
  },

  // 사용 목적 구분 (어디서 호출되었는지)
  category: {
    type: String,
    enum: ['chat', 'summary', 'compression', 'alba', 'role', 'embedding', 'other'],
    default: 'chat',
    index: true
  }
}, {
  timestamps: true
});

// 복합 인덱스
usageStatsSchema.index({ date: 1, tier: 1 });
usageStatsSchema.index({ date: 1, modelId: 1 });
usageStatsSchema.index({ date: 1, category: 1 });
usageStatsSchema.index({ timestamp: -1 });

/**
 * 사용 기록 추가
 */
usageStatsSchema.statics.addUsage = async function(data) {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const hour = now.getHours();

  return this.create({
    timestamp: now,
    date,
    hour,
    tier: data.tier,
    modelId: data.modelId,
    serviceId: data.serviceId,
    inputTokens: data.inputTokens || 0,
    outputTokens: data.outputTokens || 0,
    totalTokens: data.totalTokens || 0,
    cost: data.cost || 0,
    latency: data.latency || 0,
    sessionId: data.sessionId || 'main-conversation',
    category: data.category || 'chat'
  });
};

/**
 * 기간별 통계 조회
 * @param {string} period - 'today', 'week', 'month', 'all', 'custom'
 * @param {Object} options - { startDate, endDate } for custom period
 */
usageStatsSchema.statics.getStatsByPeriod = async function(period = 'today', options = {}) {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'custom':
      // 커스텀 기간
      if (options.startDate) {
        startDate = new Date(options.startDate);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(0);
      }
      if (options.endDate) {
        endDate = new Date(options.endDate);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
    case 'all':
    default:
      startDate = new Date(0); // 전체
  }

  // 쿼리 구성
  let query = {};
  if (period === 'all') {
    query = {};
  } else if (endDate) {
    query = { timestamp: { $gte: startDate, $lte: endDate } };
  } else {
    query = { timestamp: { $gte: startDate } };
  }

  // 기본 통계
  const basicStats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        totalTokens: { $sum: '$totalTokens' },
        inputTokens: { $sum: '$inputTokens' },
        outputTokens: { $sum: '$outputTokens' },
        totalCost: { $sum: '$cost' },
        avgLatency: { $avg: '$latency' },
        lightCount: {
          $sum: { $cond: [{ $eq: ['$tier', 'light'] }, 1, 0] }
        },
        mediumCount: {
          $sum: { $cond: [{ $eq: ['$tier', 'medium'] }, 1, 0] }
        },
        heavyCount: {
          $sum: { $cond: [{ $eq: ['$tier', 'heavy'] }, 1, 0] }
        }
      }
    }
  ]);

  // 모델별 통계
  const modelStats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: { modelId: '$modelId', serviceId: '$serviceId' },
        count: { $sum: 1 },
        totalTokens: { $sum: '$totalTokens' },
        totalCost: { $sum: '$cost' },
        avgLatency: { $avg: '$latency' }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // 카테고리별 통계
  const categoryStats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalTokens: { $sum: '$totalTokens' },
        totalCost: { $sum: '$cost' }
      }
    },
    { $sort: { totalCost: -1 } }
  ]);

  const stats = basicStats[0] || {
    totalRequests: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    avgLatency: 0,
    lightCount: 0,
    mediumCount: 0,
    heavyCount: 0
  };

  const total = stats.totalRequests || 1; // 0으로 나누기 방지

  return {
    period,
    totalRequests: stats.totalRequests,
    totalTokens: stats.totalTokens,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    totalCost: stats.totalCost,
    averageLatency: stats.avgLatency || 0,
    distribution: {
      light: ((stats.lightCount / total) * 100).toFixed(1) + '%',
      medium: ((stats.mediumCount / total) * 100).toFixed(1) + '%',
      heavy: ((stats.heavyCount / total) * 100).toFixed(1) + '%'
    },
    routingDecisions: {
      light: stats.lightCount,
      medium: stats.mediumCount,
      heavy: stats.heavyCount
    },
    modelUsage: modelStats.map(m => ({
      modelId: m._id.modelId,
      serviceId: m._id.serviceId,
      count: m.count,
      percentage: ((m.count / total) * 100).toFixed(1) + '%',
      totalTokens: m.totalTokens,
      totalCost: m.totalCost,
      avgLatency: m.avgLatency
    })),
    categoryUsage: categoryStats.map(c => ({
      category: c._id || 'chat',
      count: c.count,
      percentage: ((c.count / total) * 100).toFixed(1) + '%',
      totalTokens: c.totalTokens,
      totalCost: c.totalCost
    }))
  };
};

/**
 * 일별 추이 조회 (최근 N일)
 */
usageStatsSchema.statics.getDailyTrend = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: '$date',
        requests: { $sum: 1 },
        tokens: { $sum: '$totalTokens' },
        cost: { $sum: '$cost' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

module.exports = mongoose.model('UsageStats', usageStatsSchema);
