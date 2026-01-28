/**
 * Message.js
 * 대화 메시지 MongoDB 모델
 *
 * 서버 재시작 후에도 메시지가 유지되도록 영속 저장
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    default: 'main-conversation',
    index: true
  },
  role: {
    type: String,
    required: true,
    enum: ['user', 'assistant', 'system']
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  tokens: {
    type: Number,
    default: 0
  },
  
  // === Phase 1.5 새 필드 ===
  
  // 밀도 레벨 (0: 원문, 1: 느슨한 압축, 2: 더 압축)
  densityLevel: {
    type: Number,
    default: 0,
    index: true
  },
  
  // 메타 정보 (객관적 사실)
  meta: {
    silenceBefore: Number,    // 이전 메시지로부터 경과 시간 (초)
    responseTime: Number,      // AI 응답까지 걸린 시간 (초)
    timeOfDay: String,         // 새벽/아침/오후/저녁/밤
    dayOfWeek: String          // 요일
  },
  
  // AI 내면 메모 (주관적 해석)
  aiMemo: {
    type: String,
    default: null
  },
  
  // 검색용 태그
  tags: [{
    type: String
  }],
  
  // 압축된 경우 원본 메시지 ID들
  originalMessageIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  
  // 장기 메모리 파일로 저장됨 여부
  archived: {
    type: Boolean,
    default: false
  },

  // === Phase 1.7 임베딩 ===
  // 시맨틱 검색용 벡터 (qwen3-embedding:8b = 4096차원)
  embedding: {
    type: [Number],
    default: null,
    select: false  // 기본 조회시 제외 (용량 큼)
  },

  // 기존 metadata
  metadata: {
    modelId: String,
    serviceId: String,
    delegatedRole: String,
    processingTime: Number
  }
}, {
  timestamps: true
});

// 복합 인덱스: 세션별 시간순 조회 최적화
messageSchema.index({ sessionId: 1, timestamp: -1 });

/**
 * 세션의 최근 메시지 조회
 */
messageSchema.statics.getRecentMessages = async function(sessionId, limit = 50) {
  return this.find({ sessionId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()
    .then(messages => messages.reverse()); // 시간순 정렬
};

/**
 * 세션의 모든 메시지 수 조회
 */
messageSchema.statics.getMessageCount = async function(sessionId) {
  return this.countDocuments({ sessionId });
};

/**
 * 메시지 추가
 */
messageSchema.statics.addMessage = async function(sessionId, message) {
  return this.create({
    sessionId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || new Date(),
    tokens: message.tokens || 0,
    metadata: message.metadata || {}
  });
};

/**
 * 세션의 이전 메시지 조회 (페이지네이션)
 */
messageSchema.statics.getMessagesBefore = async function(sessionId, beforeTimestamp, limit = 50) {
  return this.find({
    sessionId,
    timestamp: { $lt: new Date(beforeTimestamp) }
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()
    .then(messages => messages.reverse());
};

/**
 * 특정 메시지 주변 조회 (검색 결과 이동용)
 */
messageSchema.statics.getMessagesAround = async function(sessionId, messageId, limit = 40) {
  const mongoose = require('mongoose');
  const ObjectId = mongoose.Types.ObjectId;
  
  // 해당 메시지 찾기
  const targetMessage = await this.findById(messageId).lean();
  if (!targetMessage) {
    // ID로 못 찾으면 최근 메시지 반환
    return this.getRecentMessages(sessionId, limit);
  }
  
  const halfLimit = Math.floor(limit / 2);
  
  // 이전 메시지
  const beforeMessages = await this.find({
    sessionId,
    timestamp: { $lt: targetMessage.timestamp }
  })
    .sort({ timestamp: -1 })
    .limit(halfLimit)
    .lean();
  
  // 이후 메시지 (타겟 포함)
  const afterMessages = await this.find({
    sessionId,
    timestamp: { $gte: targetMessage.timestamp }
  })
    .sort({ timestamp: 1 })
    .limit(halfLimit)
    .lean();
  
  // 합쳐서 시간순 정렬
  return [...beforeMessages.reverse(), ...afterMessages];
};

/**
 * 세션 메시지 전체 삭제
 */
messageSchema.statics.clearSession = async function(sessionId) {
  return this.deleteMany({ sessionId });
};

/**
 * 임베딩으로 유사 메시지 검색
 * @param {Array} queryEmbedding - 검색할 임베딩 벡터
 * @param {Object} options - { sessionId, limit, minSimilarity, excludeIds }
 */
messageSchema.statics.findSimilar = async function(queryEmbedding, options = {}) {
  const {
    sessionId = 'main-conversation',
    limit = 10,
    minSimilarity = 0.5,
    excludeIds = []
  } = options;

  // 임베딩 있는 메시지만 조회
  const query = {
    sessionId,
    embedding: { $exists: true, $ne: null }
  };

  if (excludeIds.length > 0) {
    query._id = { $nin: excludeIds };
  }

  const messages = await this.find(query)
    .select('+embedding')  // 명시적으로 embedding 포함
    .lean();

  // 코사인 유사도 계산
  const cosineSimilarity = (a, b) => {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // 유사도 계산 및 정렬
  const scored = messages
    .map(msg => ({
      ...msg,
      similarity: cosineSimilarity(queryEmbedding, msg.embedding)
    }))
    .filter(msg => msg.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  // embedding 필드 제거 (응답 용량 절약)
  return scored.map(({ embedding, ...rest }) => rest);
};

/**
 * 임베딩 업데이트
 */
messageSchema.statics.updateEmbedding = async function(messageId, embedding) {
  return this.findByIdAndUpdate(messageId, { embedding }, { new: true });
};

/**
 * 임베딩 없는 메시지 조회 (배치 처리용)
 */
messageSchema.statics.getWithoutEmbedding = async function(sessionId, limit = 100) {
  return this.find({
    sessionId,
    role: 'user',  // 사용자 메시지만
    embedding: { $exists: false },
    content: { $exists: true, $ne: '' }
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('Message', messageSchema);
