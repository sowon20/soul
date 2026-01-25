/**
 * SystemConfig Model
 * 시스템 설정을 MongoDB에 저장
 */

const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  configKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 저장 전에 updatedAt 자동 업데이트
systemConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
