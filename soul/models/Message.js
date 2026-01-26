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

module.exports = mongoose.model('Message', messageSchema);
