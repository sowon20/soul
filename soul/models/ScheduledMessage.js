const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema({
  scheduleId: { type: Number, required: true, unique: true },
  message: { type: String, required: true },
  sendAt: { type: Date, required: true },
  type: { type: String, default: 'scheduled' },
  status: { type: String, enum: ['pending', 'sent', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);
