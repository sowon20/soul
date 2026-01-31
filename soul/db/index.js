/**
 * Database Abstraction Layer
 * SQLite 기반 통합 데이터베이스 (MongoDB 대체)
 *
 * 사용법:
 *   const db = require('./db');
 *   await db.init();
 *   const config = await db.SystemConfig.findOne({ configKey: 'memory' });
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 기본 데이터 경로
const DEFAULT_DATA_DIR = process.env.SOUL_DATA_DIR || path.join(os.homedir(), '.soul');
const DB_FILE = 'soul.db';

let db = null;
let dataDir = DEFAULT_DATA_DIR;

/**
 * 데이터베이스 초기화
 */
function init(customDataDir = null) {
  if (db) return db;

  // 커스텀 경로 또는 기본 경로
  dataDir = customDataDir || process.env.SOUL_DATA_DIR || DEFAULT_DATA_DIR;

  // 디렉토리 생성
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, DB_FILE);
  console.log(`[DB] Initializing SQLite: ${dbPath}`);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // 성능 향상

  // 테이블 생성
  createTables();

  return db;
}

/**
 * 테이블 스키마 생성
 */
function createTables() {
  // SystemConfig - 시스템 설정
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 마이그레이션: description 컬럼이 없으면 추가
  try {
    db.exec(`ALTER TABLE system_configs ADD COLUMN description TEXT`);
  } catch (e) {
    // 이미 컬럼이 있으면 무시
  }

  // AIService - AI 서비스 설정
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT,
      api_key TEXT,
      models TEXT,
      is_active INTEGER DEFAULT 0,
      config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Profile - 사용자 프로필
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_key TEXT UNIQUE NOT NULL,
      value TEXT,
      visibility TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // AgentProfile - 에이전트 프로필
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      personality TEXT,
      system_prompt TEXT,
      is_active INTEGER DEFAULT 1,
      config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Role - 알바 설정
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT,
      preferred_model TEXT,
      tools TEXT,
      is_active INTEGER DEFAULT 1,
      is_system INTEGER DEFAULT 0,
      config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // UsageStats - 사용량 통계
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      service TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      requests INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, service, model)
    )
  `);

  // ScheduledMessage - 예약 메시지
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // SelfRule - AI 자기학습 메모
  db.exec(`
    CREATE TABLE IF NOT EXISTS self_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      priority INTEGER DEFAULT 5,
      token_count INTEGER DEFAULT 0,
      context TEXT,
      is_active INTEGER DEFAULT 1,
      use_count INTEGER DEFAULT 0,
      last_used TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Memory - 장기 메모리
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      metadata TEXT,
      stats TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Message - 대화 메시지
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT DEFAULT 'main-conversation',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      tokens INTEGER DEFAULT 0,
      density_level INTEGER DEFAULT 0,
      meta TEXT,
      ai_memo TEXT,
      tags TEXT,
      archived INTEGER DEFAULT 0,
      embedding TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // UserProfile - 사용자 프로필
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT,
      display_name TEXT,
      email TEXT,
      timezone TEXT DEFAULT 'Asia/Seoul',
      language TEXT DEFAULT 'ko',
      preferences TEXT,
      context TEXT,
      interests TEXT,
      custom_fields TEXT,
      last_active_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // APIKey - API 키 (암호화 저장)
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT UNIQUE NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 인덱스 생성
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(config_key);
    CREATE INDEX IF NOT EXISTS idx_ai_services_id ON ai_services(service_id);
    CREATE INDEX IF NOT EXISTS idx_roles_id ON roles(role_id);
    CREATE INDEX IF NOT EXISTS idx_usage_stats_date ON usage_stats(date);
    CREATE INDEX IF NOT EXISTS idx_self_rules_active ON self_rules(is_active, priority);
    CREATE INDEX IF NOT EXISTS idx_memories_type_key ON memories(type, key);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);
  `);

  console.log('[DB] Tables created');
}

/**
 * Mongoose 스타일 모델 래퍼
 */
function createModel(tableName, options = {}) {
  const { keyField = 'id' } = options;

  return {
    /**
     * 전체 조회
     */
    find(where = {}) {
      const conditions = Object.entries(where)
        .map(([k, v]) => `${toSnakeCase(k)} = ?`)
        .join(' AND ');

      const sql = conditions
        ? `SELECT * FROM ${tableName} WHERE ${conditions}`
        : `SELECT * FROM ${tableName}`;

      const stmt = db.prepare(sql);
      const rows = conditions ? stmt.all(...Object.values(where)) : stmt.all();

      return rows.map(row => parseRow(row));
    },

    /**
     * 단일 조회
     */
    findOne(where = {}) {
      const conditions = Object.entries(where)
        .map(([k, v]) => `${toSnakeCase(k)} = ?`)
        .join(' AND ');

      const sql = `SELECT * FROM ${tableName} WHERE ${conditions} LIMIT 1`;
      const stmt = db.prepare(sql);
      const row = stmt.get(...Object.values(where));

      return row ? parseRow(row) : null;
    },

    /**
     * ID로 조회
     */
    findById(id) {
      const stmt = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`);
      const row = stmt.get(id);
      return row ? parseRow(row) : null;
    },

    /**
     * 생성
     */
    create(data) {
      const now = new Date().toISOString();
      const dataWithTimestamp = {
        ...data,
        createdAt: now,
        updatedAt: now
      };

      const columns = Object.keys(dataWithTimestamp).map(toSnakeCase);
      const values = Object.values(dataWithTimestamp).map(serializeValue);
      const placeholders = columns.map(() => '?').join(', ');

      const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);
      const result = stmt.run(...values);

      return { id: result.lastInsertRowid, ...dataWithTimestamp };
    },

    /**
     * 업데이트
     */
    updateOne(where, update) {
      const now = new Date().toISOString();
      const updateData = { ...update, updatedAt: now };

      const setClause = Object.keys(updateData)
        .map(k => `${toSnakeCase(k)} = ?`)
        .join(', ');

      const whereClause = Object.keys(where)
        .map(k => `${toSnakeCase(k)} = ?`)
        .join(' AND ');

      const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
      const stmt = db.prepare(sql);
      const result = stmt.run(
        ...Object.values(updateData).map(serializeValue),
        ...Object.values(where)
      );

      return { modifiedCount: result.changes };
    },

    /**
     * Upsert (findOneAndUpdate with upsert)
     */
    findOneAndUpdate(where, update, options = {}) {
      const existing = this.findOne(where);

      if (existing) {
        this.updateOne(where, update.$set || update);
        return this.findOne(where);
      } else if (options.upsert) {
        const data = { ...where, ...(update.$set || update) };
        return this.create(data);
      }

      return null;
    },

    /**
     * 삭제
     */
    deleteOne(where) {
      const whereClause = Object.keys(where)
        .map(k => `${toSnakeCase(k)} = ?`)
        .join(' AND ');

      const sql = `DELETE FROM ${tableName} WHERE ${whereClause}`;
      const stmt = db.prepare(sql);
      const result = stmt.run(...Object.values(where));

      return { deletedCount: result.changes };
    },

    /**
     * 다중 업데이트
     */
    updateMany(where, update) {
      const now = new Date().toISOString();
      const updateData = update.$set ? { ...update.$set, updatedAt: now } : { ...update, updatedAt: now };
      const incData = update.$inc || {};

      let setClause = Object.keys(updateData)
        .map(k => `${toSnakeCase(k)} = ?`)
        .join(', ');

      // $inc 처리
      if (Object.keys(incData).length > 0) {
        const incClause = Object.keys(incData)
          .map(k => `${toSnakeCase(k)} = ${toSnakeCase(k)} + ?`)
          .join(', ');
        setClause = setClause ? `${setClause}, ${incClause}` : incClause;
      }

      const whereClause = Object.keys(where)
        .map(k => {
          if (where[k].$in) {
            return `${toSnakeCase(k)} IN (${where[k].$in.map(() => '?').join(', ')})`;
          }
          return `${toSnakeCase(k)} = ?`;
        })
        .join(' AND ');

      const whereValues = Object.values(where).flatMap(v => v.$in || [v]);

      const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
      const stmt = db.prepare(sql);
      const result = stmt.run(
        ...Object.values(updateData).map(serializeValue),
        ...Object.values(incData),
        ...whereValues
      );

      return { modifiedCount: result.changes };
    },

    /**
     * 카운트
     */
    countDocuments(where = {}) {
      const conditions = Object.entries(where)
        .map(([k, v]) => `${toSnakeCase(k)} = ?`)
        .join(' AND ');

      const sql = conditions
        ? `SELECT COUNT(*) as count FROM ${tableName} WHERE ${conditions}`
        : `SELECT COUNT(*) as count FROM ${tableName}`;

      const stmt = db.prepare(sql);
      const row = conditions ? stmt.get(...Object.values(where)) : stmt.get();

      return row.count;
    }
  };
}

/**
 * camelCase → snake_case 변환
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * snake_case → camelCase 변환
 */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 행 데이터 파싱 (snake_case → camelCase, JSON 파싱)
 */
function parseRow(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = toCamelCase(key);

    // JSON 문자열 파싱 시도
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

/**
 * 값 직렬화 (객체/배열 → JSON)
 */
function serializeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * 데이터 경로 반환
 */
function getDataDir() {
  return dataDir;
}

/**
 * DB 연결 종료
 */
function close() {
  if (db) {
    db.close();
    db = null;
  }
}

// 모델 정의
const models = {
  SystemConfig: null,
  AIService: null,
  Profile: null,
  AgentProfile: null,
  Role: null,
  UsageStats: null,
  ScheduledMessage: null,
  SelfRule: null,
  Memory: null,
  Message: null,
  UserProfile: null,
  APIKey: null
};

// 모델 초기화 (lazy)
function getModel(name) {
  if (!db) {
    throw new Error('[DB] Database not initialized. Call db.init() first.');
  }

  if (!models[name]) {
    const tableMap = {
      SystemConfig: 'system_configs',
      AIService: 'ai_services',
      Profile: 'profiles',
      AgentProfile: 'agent_profiles',
      Role: 'roles',
      UsageStats: 'usage_stats',
      ScheduledMessage: 'scheduled_messages',
      SelfRule: 'self_rules',
      Memory: 'memories',
      Message: 'messages',
      UserProfile: 'user_profiles',
      APIKey: 'api_keys'
    };

    models[name] = createModel(tableMap[name]);
  }

  return models[name];
}

module.exports = {
  init,
  close,
  getDataDir,
  get db() { return db; },
  get SystemConfig() { return getModel('SystemConfig'); },
  get AIService() { return getModel('AIService'); },
  get Profile() { return getModel('Profile'); },
  get AgentProfile() { return getModel('AgentProfile'); },
  get Role() { return getModel('Role'); },
  get UsageStats() { return getModel('UsageStats'); },
  get ScheduledMessage() { return getModel('ScheduledMessage'); },
  get SelfRule() { return getModel('SelfRule'); },
  get Memory() { return getModel('Memory'); },
  get Message() { return getModel('Message'); },
  get UserProfile() { return getModel('UserProfile'); },
  get APIKey() { return getModel('APIKey'); }
};
