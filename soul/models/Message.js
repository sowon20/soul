/**
 * Message Model
 * 대화 메시지 (SQLite)
 */

const { Message } = require('../db/models');

/**
 * 세션의 최근 메시지 조회
 */
Message.getRecentMessages = async function(sessionId, limit = 50) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(sessionId, limit);
  return rows.reverse().map(row => parseRow(row));
};

/**
 * 세션의 모든 메시지 수 조회
 */
Message.getMessageCount = async function(sessionId) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`
    SELECT COUNT(*) as count FROM messages WHERE session_id = ?
  `);

  const row = stmt.get(sessionId);
  return row ? row.count : 0;
};

/**
 * 메시지 추가
 */
Message.addMessage = async function(sessionId, message) {
  const db = require('../db');
  if (!db.db) db.init();

  return db.Message.create({
    sessionId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || new Date().toISOString(),
    tokens: message.tokens || 0,
    metadata: JSON.stringify(message.metadata || {})
  });
};

/**
 * 세션의 이전 메시지 조회 (페이지네이션)
 */
Message.getMessagesBefore = async function(sessionId, beforeTimestamp, limit = 50) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ? AND timestamp < ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(sessionId, beforeTimestamp, limit);
  return rows.reverse().map(row => parseRow(row));
};

/**
 * 세션 메시지 전체 삭제
 */
Message.clearSession = async function(sessionId) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`DELETE FROM messages WHERE session_id = ?`);
  const result = stmt.run(sessionId);
  return { deletedCount: result.changes };
};

/**
 * 임베딩으로 유사 메시지 검색
 */
Message.findSimilar = async function(queryEmbedding, options = {}) {
  const db = require('../db');
  if (!db.db) db.init();

  const {
    sessionId = 'main-conversation',
    limit = 10,
    minSimilarity = 0.5
  } = options;

  const stmt = db.db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ? AND embedding IS NOT NULL
  `);

  const messages = stmt.all(sessionId).map(row => parseRow(row));

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

  // embedding 필드 제거
  return scored.map(({ embedding, ...rest }) => rest);
};

/**
 * 임베딩 업데이트
 */
Message.updateEmbedding = async function(messageId, embedding) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`
    UPDATE messages SET embedding = ? WHERE id = ?
  `);

  stmt.run(JSON.stringify(embedding), messageId);
  return db.Message.findById(messageId);
};

/**
 * 임베딩 없는 메시지 조회
 */
Message.getWithoutEmbedding = async function(sessionId, limit = 100) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
      AND role = 'user'
      AND (embedding IS NULL OR embedding = '')
      AND content IS NOT NULL
      AND content != ''
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(sessionId, limit).map(row => parseRow(row));
};

// 헬퍼: 행 파싱
function parseRow(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        result[camelKey] = JSON.parse(value);
      } catch {
        result[camelKey] = value;
      }
    } else {
      result[camelKey] = value;
    }
  }
  // Mongoose 호환: _id 추가
  result._id = result.id;
  return result;
}

module.exports = Message;
