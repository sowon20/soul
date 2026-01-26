/**
 * SelfRule - Soul 내면 메모
 * 대화하면서 스스로 깨달은 것, 실수해서 배운 것을 메모로 저장
 * AI가 "내가 나한테 남긴 메모"로 인식하도록 설계됨
 */
const mongoose = require('mongoose');

const selfRuleSchema = new mongoose.Schema({
  // 메모 내용
  rule: {
    type: String,
    required: true
  },
  
  // 분류 (상황별 로드용)
  category: {
    type: String,
    enum: ['system', 'coding', 'daily', 'personality', 'user', 'general'],
    default: 'general'
  },
  
  // 중요도 (1-10, 높을수록 자주 떠올림)
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  
  // 떠올린 횟수
  useCount: {
    type: Number,
    default: 0
  },
  
  // 마지막으로 떠올린 시간
  lastUsed: {
    type: Date,
    default: null
  },
  
  // 활성 상태 (false면 잊힘)
  isActive: {
    type: Boolean,
    default: true
  },
  
  // 깨달음의 맥락 (어떤 상황에서 배웠는지)
  context: {
    type: String,
    default: null
  },
  
  // 토큰 수 (관리용)
  tokenCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// 인덱스
selfRuleSchema.index({ category: 1, isActive: 1 });
selfRuleSchema.index({ priority: -1 });
selfRuleSchema.index({ lastUsed: -1 });
selfRuleSchema.index({ useCount: -1 });

module.exports = mongoose.model('SelfRule', selfRuleSchema);
