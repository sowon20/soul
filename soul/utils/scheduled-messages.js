/**
 * scheduled-messages.js
 * DB 기반 예약 메시지 관리 (서버 재시작해도 유지)
 * SQLite 호환 버전
 */

const { getProactiveMessenger } = require('./proactive-messenger');

// 메모리에 타이머만 추적
const timers = new Map();

/**
 * DB 접근 헬퍼 (lazy init)
 */
function getDb() {
  const db = require('../db');
  return db.db;
}

/**
 * 메시지 발송 실행
 */
async function sendScheduledMessage(doc) {
  try {
    const messenger = await getProactiveMessenger();
    if (messenger) {
      await messenger.sendNow({ type: 'scheduled', message: doc.message });
    }
    // DB에서 status 업데이트
    const db = getDb();
    db.prepare('UPDATE scheduled_messages SET status = ?, updated_at = ? WHERE id = ?')
      .run('sent', new Date().toISOString(), doc.id);
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
  // sendAt이 문자열이면 Date로 변환
  const sendAtTime = typeof doc.sendAt === 'string' ? new Date(doc.sendAt).getTime() : doc.sendAt.getTime();
  const delay = sendAtTime - Date.now();

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
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM scheduled_messages WHERE status = 'pending'").all();
    console.log(`[Scheduled] Restoring ${rows.length} scheduled messages`);

    for (const row of rows) {
      setTimer({
        id: row.id,
        scheduleId: row.schedule_id,
        message: row.message,
        sendAt: row.send_at,
        status: row.status
      });
    }
  } catch (err) {
    console.error('[Scheduled] Restore error:', err.message);
  }
}

/**
 * 예약 생성
 */
async function schedule(message, delaySeconds) {
  const db = getDb();

  // 다음 schedule_id 계산
  const lastRow = db.prepare('SELECT schedule_id FROM scheduled_messages ORDER BY schedule_id DESC LIMIT 1').get();
  const scheduleId = (lastRow?.schedule_id || 0) + 1;
  const sendAt = new Date(Date.now() + delaySeconds * 1000);
  const now = new Date().toISOString();

  const sendAtStr = sendAt.toISOString();
  const result = db.prepare(
    'INSERT INTO scheduled_messages (schedule_id, message, send_at, scheduled_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(scheduleId, message, sendAtStr, sendAtStr, 'pending', now, now);

  const doc = {
    id: result.lastInsertRowid,
    scheduleId,
    message,
    sendAt: sendAt.toISOString()
  };
  setTimer(doc);

  console.log(`[Scheduled] Created #${scheduleId}: "${message}" → ${sendAt.toISOString()}`);
  return { scheduleId, sendAt: sendAt.toISOString() };
}

/**
 * 예약 취소
 */
async function cancel(scheduleId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM scheduled_messages WHERE schedule_id = ? AND status = 'pending'").get(scheduleId);
  if (!row) return null;

  clearTimeout(timers.get(scheduleId));
  timers.delete(scheduleId);

  db.prepare('UPDATE scheduled_messages SET status = ?, updated_at = ? WHERE id = ?')
    .run('cancelled', new Date().toISOString(), row.id);

  console.log(`[Scheduled] Cancelled #${scheduleId}`);
  return { message: row.message };
}

/**
 * 예약 수정
 */
async function update(scheduleId, { message, delaySeconds }) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM scheduled_messages WHERE schedule_id = ? AND status = 'pending'").get(scheduleId);
  if (!row) return null;

  clearTimeout(timers.get(scheduleId));

  const newMessage = message || row.message;
  const newSendAt = delaySeconds
    ? new Date(Date.now() + delaySeconds * 1000)
    : new Date(row.send_at);

  db.prepare('UPDATE scheduled_messages SET message = ?, send_at = ?, updated_at = ? WHERE id = ?')
    .run(newMessage, newSendAt.toISOString(), new Date().toISOString(), row.id);

  setTimer({
    id: row.id,
    scheduleId,
    message: newMessage,
    sendAt: newSendAt.toISOString()
  });

  console.log(`[Scheduled] Updated #${scheduleId}`);
  return { message: newMessage, sendAt: newSendAt.toISOString() };
}

/**
 * 예약 목록
 */
async function list() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM scheduled_messages WHERE status = 'pending' ORDER BY send_at ASC").all();

  return rows.map(r => ({
    id: r.id,
    scheduleId: r.schedule_id,
    message: r.message,
    sendAt: r.send_at,
    status: r.status,
    createdAt: r.created_at
  }));
}

module.exports = { restoreScheduledMessages, schedule, cancel, update, list };
