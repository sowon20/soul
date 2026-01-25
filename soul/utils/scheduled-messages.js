/**
 * scheduled-messages.js
 * DB 기반 예약 메시지 관리 (서버 재시작해도 유지)
 */

const ScheduledMessage = require('../models/ScheduledMessage');
const { getProactiveMessenger } = require('./proactive-messenger');

// 메모리에 타이머만 추적
const timers = new Map();

/**
 * 메시지 발송 실행
 */
async function sendScheduledMessage(doc) {
  try {
    const messenger = await getProactiveMessenger();
    if (messenger) {
      await messenger.sendNow({ type: 'scheduled', message: doc.message });
    }
    await ScheduledMessage.findByIdAndUpdate(doc._id, { status: 'sent' });
    timers.delete(doc.scheduleId);
    console.log(`[Scheduled] Sent #${doc.scheduleId}: "${doc.message}"`);
  } catch (err) {
    console.error(`[Scheduled] Error sending #${doc.scheduleId}:`, err);
  }
}

/**
 * 단일 예약에 타이머 설정
 */
function setTimer(doc) {
  const delay = doc.sendAt.getTime() - Date.now();
  if (delay <= 0) {
    sendScheduledMessage(doc);
    return;
  }
  
  const timeoutId = setTimeout(() => sendScheduledMessage(doc), delay);
  timers.set(doc.scheduleId, timeoutId);
}

/**
 * 서버 시작 시 DB에서 복구
 */
async function restoreScheduledMessages() {
  const pending = await ScheduledMessage.find({ status: 'pending' });
  console.log(`[Scheduled] Restoring ${pending.length} scheduled messages`);
  
  for (const doc of pending) {
    setTimer(doc);
  }
}

/**
 * 예약 생성
 */
async function schedule(message, delaySeconds) {
  const lastDoc = await ScheduledMessage.findOne().sort({ scheduleId: -1 });
  const scheduleId = (lastDoc?.scheduleId || 0) + 1;
  const sendAt = new Date(Date.now() + delaySeconds * 1000);
  
  const doc = await ScheduledMessage.create({ scheduleId, message, sendAt });
  setTimer(doc);
  
  return { scheduleId, sendAt: sendAt.toISOString() };
}

/**
 * 예약 취소
 */
async function cancel(scheduleId) {
  const doc = await ScheduledMessage.findOne({ scheduleId, status: 'pending' });
  if (!doc) return null;
  
  clearTimeout(timers.get(scheduleId));
  timers.delete(scheduleId);
  await ScheduledMessage.findByIdAndUpdate(doc._id, { status: 'cancelled' });
  
  return { message: doc.message };
}

/**
 * 예약 수정
 */
async function update(scheduleId, { message, delaySeconds }) {
  const doc = await ScheduledMessage.findOne({ scheduleId, status: 'pending' });
  if (!doc) return null;
  
  clearTimeout(timers.get(scheduleId));
  
  const newMessage = message || doc.message;
  const newSendAt = delaySeconds ? new Date(Date.now() + delaySeconds * 1000) : doc.sendAt;
  
  doc.message = newMessage;
  doc.sendAt = newSendAt;
  await doc.save();
  
  setTimer(doc);
  
  return { message: newMessage, sendAt: newSendAt.toISOString() };
}

/**
 * 예약 목록
 */
async function list() {
  return ScheduledMessage.find({ status: 'pending' }).sort({ sendAt: 1 });
}

module.exports = { restoreScheduledMessages, schedule, cancel, update, list };
