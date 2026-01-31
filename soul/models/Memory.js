/**
 * Memory Model
 * 장기 메모리 저장소 (SQLite)
 */

const { Memory } = require('../db/models');

/**
 * 타입별 메모리 조회
 */
Memory.findByType = async function(type, limit = 100) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`
    SELECT * FROM memories
    WHERE type = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `);

  return stmt.all(type, limit).map(row => parseRow(row));
};

/**
 * 사용자별 메모리 조회
 */
Memory.findByUser = async function(userId, type = null) {
  const db = require('../db');
  if (!db.db) db.init();

  let sql = `SELECT * FROM memories WHERE metadata LIKE ? `;
  const params = [`%"userId":"${userId}"%`];

  if (type) {
    sql += `AND type = ? `;
    params.push(type);
  }

  sql += `ORDER BY updated_at DESC LIMIT 100`;

  const stmt = db.db.prepare(sql);
  return stmt.all(...params).map(row => parseRow(row));
};

/**
 * 키로 메모리 조회 또는 생성 (Upsert)
 */
Memory.upsert = async function(type, key, value, metadata = {}) {
  const db = require('../db');
  if (!db.db) db.init();

  const existing = db.Memory.findOne({ type, key });

  if (existing) {
    db.Memory.updateOne({ type, key }, {
      value: JSON.stringify(value),
      metadata: JSON.stringify(metadata),
      stats: JSON.stringify({
        accessCount: (existing.stats?.accessCount || 0) + 1,
        lastAccessed: new Date().toISOString()
      })
    });
    return db.Memory.findOne({ type, key });
  } else {
    return db.Memory.create({
      type,
      key,
      value: JSON.stringify(value),
      metadata: JSON.stringify(metadata),
      stats: JSON.stringify({
        accessCount: 1,
        lastAccessed: new Date().toISOString(),
        createdAt: new Date().toISOString()
      })
    });
  }
};

/**
 * 중요한 메모리만 조회
 */
Memory.findImportant = async function(minImportance = 5, limit = 50) {
  const db = require('../db');
  if (!db.db) db.init();

  const stmt = db.db.prepare(`
    SELECT * FROM memories
    WHERE json_extract(metadata, '$.importance') >= ?
    ORDER BY json_extract(metadata, '$.importance') DESC
    LIMIT ?
  `);

  return stmt.all(minImportance, limit).map(row => parseRow(row));
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
  return result;
}

module.exports = Memory;
