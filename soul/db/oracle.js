/**
 * Oracle Database Layer
 * SQLite 인터페이스와 호환되는 Oracle 드라이버
 */

const oracledb = require('oracledb');
const path = require('path');

let pool = null;

// Oracle Wallet 경로
const WALLET_DIR = process.env.ORACLE_WALLET_DIR || path.join(__dirname, '../wallet');

/**
 * Oracle DB 초기화
 */
async function init() {
  if (pool) return pool;

  try {
    // Thin 모드 사용 (Instant Client 불필요)
    oracledb.initOracleClient();
  } catch (e) {
    // Thin 모드에서는 무시
  }

  const config = {
    user: process.env.ORACLE_USER || 'ADMIN',
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECTION_STRING || 'database_medium',
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
    configDir: WALLET_DIR,
    walletLocation: WALLET_DIR,
    walletPassword: process.env.ORACLE_WALLET_PASSWORD || ''
  };

  console.log('[Oracle] Connecting to database...');
  pool = await oracledb.createPool(config);
  console.log('[Oracle] Connection pool created');

  // 테이블 생성
  await createTables();

  return pool;
}

/**
 * 테이블 스키마 생성
 */
async function createTables() {
  const conn = await pool.getConnection();

  try {
    const tables = [
      // SystemConfig
      `CREATE TABLE system_configs (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        config_key VARCHAR2(255) UNIQUE NOT NULL,
        value CLOB,
        description VARCHAR2(1000),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // AIService
      `CREATE TABLE ai_services (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service_id VARCHAR2(255) UNIQUE NOT NULL,
        name VARCHAR2(255) NOT NULL,
        base_url VARCHAR2(500),
        api_key VARCHAR2(500),
        models CLOB,
        is_active NUMBER(1) DEFAULT 0,
        config CLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Profile
      `CREATE TABLE profiles (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        profile_key VARCHAR2(255) UNIQUE NOT NULL,
        value CLOB,
        visibility VARCHAR2(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // AgentProfile
      `CREATE TABLE agent_profiles (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        profile_id VARCHAR2(255) UNIQUE,
        name VARCHAR2(255) NOT NULL,
        personality CLOB,
        system_prompt CLOB,
        is_active NUMBER(1) DEFAULT 1,
        config CLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Role
      `CREATE TABLE roles (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        role_id VARCHAR2(255) UNIQUE NOT NULL,
        name VARCHAR2(255) NOT NULL,
        description VARCHAR2(1000),
        system_prompt CLOB,
        preferred_model VARCHAR2(255),
        tools CLOB,
        is_active NUMBER(1) DEFAULT 1,
        is_system NUMBER(1) DEFAULT 0,
        config CLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // UsageStats
      `CREATE TABLE usage_stats (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        stat_date VARCHAR2(20) NOT NULL,
        service VARCHAR2(255) NOT NULL,
        model VARCHAR2(255),
        input_tokens NUMBER DEFAULT 0,
        output_tokens NUMBER DEFAULT 0,
        requests NUMBER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_usage_stats UNIQUE (stat_date, service, model)
      )`,

      // ScheduledMessage
      `CREATE TABLE scheduled_messages (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        message CLOB NOT NULL,
        scheduled_time VARCHAR2(50) NOT NULL,
        status VARCHAR2(50) DEFAULT 'pending',
        metadata CLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // SelfRule
      `CREATE TABLE self_rules (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        rule CLOB NOT NULL,
        category VARCHAR2(100) DEFAULT 'general',
        priority NUMBER DEFAULT 5,
        token_count NUMBER DEFAULT 0,
        context CLOB,
        is_active NUMBER(1) DEFAULT 1,
        use_count NUMBER DEFAULT 0,
        last_used TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Memory
      `CREATE TABLE memories (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        type VARCHAR2(100) NOT NULL,
        key VARCHAR2(500) NOT NULL,
        value CLOB,
        metadata CLOB,
        stats CLOB,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Message
      `CREATE TABLE messages (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        session_id VARCHAR2(255) DEFAULT 'main-conversation',
        role VARCHAR2(50) NOT NULL,
        content CLOB NOT NULL,
        msg_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tokens NUMBER DEFAULT 0,
        density_level NUMBER DEFAULT 0,
        meta CLOB,
        ai_memo CLOB,
        tags CLOB,
        archived NUMBER(1) DEFAULT 0,
        embedding CLOB,
        metadata CLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // UserProfile
      `CREATE TABLE user_profiles (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id VARCHAR2(255) UNIQUE NOT NULL,
        name VARCHAR2(255),
        display_name VARCHAR2(255),
        email VARCHAR2(255),
        timezone VARCHAR2(100) DEFAULT 'Asia/Seoul',
        language VARCHAR2(10) DEFAULT 'ko',
        preferences CLOB,
        context CLOB,
        interests CLOB,
        custom_fields CLOB,
        last_active_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // APIKey
      `CREATE TABLE api_keys (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service VARCHAR2(255) UNIQUE NOT NULL,
        encrypted_key VARCHAR2(1000) NOT NULL,
        iv VARCHAR2(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of tables) {
      try {
        await conn.execute(sql);
        console.log(`[Oracle] Table created`);
      } catch (err) {
        if (err.errorNum === 955) {
          // ORA-00955: name is already used - 테이블 이미 존재
          // 무시
        } else {
          console.error('[Oracle] Table creation error:', err.message);
        }
      }
    }

    // 인덱스 생성
    const indexes = [
      'CREATE INDEX idx_sys_cfg_key ON system_configs(config_key)',
      'CREATE INDEX idx_ai_svc_id ON ai_services(service_id)',
      'CREATE INDEX idx_roles_id ON roles(role_id)',
      'CREATE INDEX idx_usage_date ON usage_stats(stat_date)',
      'CREATE INDEX idx_self_rules_active ON self_rules(is_active, priority)',
      'CREATE INDEX idx_mem_type_key ON memories(type, key)',
      'CREATE INDEX idx_msg_session ON messages(session_id, msg_timestamp)',
      'CREATE INDEX idx_user_prof_id ON user_profiles(user_id)',
      'CREATE INDEX idx_api_keys_svc ON api_keys(service)'
    ];

    for (const sql of indexes) {
      try {
        await conn.execute(sql);
      } catch (err) {
        // 인덱스 이미 존재하면 무시
      }
    }

    await conn.commit();
    console.log('[Oracle] Tables initialized');
  } finally {
    await conn.close();
  }
}

/**
 * 모델 생성
 */
function createModel(tableName) {
  return {
    async find(where = {}) {
      const conn = await pool.getConnection();
      try {
        const { sql, params } = buildSelect(tableName, where);
        const result = await conn.execute(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows.map(parseRow);
      } finally {
        await conn.close();
      }
    },

    async findOne(where = {}) {
      const conn = await pool.getConnection();
      try {
        const { sql, params } = buildSelect(tableName, where, 1);
        const result = await conn.execute(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows.length > 0 ? parseRow(result.rows[0]) : null;
      } finally {
        await conn.close();
      }
    },

    async findById(id) {
      return this.findOne({ id });
    },

    async create(data) {
      const conn = await pool.getConnection();
      try {
        const now = new Date().toISOString();
        const dataWithTimestamp = { ...data, createdAt: now, updatedAt: now };

        const columns = Object.keys(dataWithTimestamp).map(toSnakeCase);
        const values = Object.values(dataWithTimestamp).map(serializeValue);
        const placeholders = columns.map((_, i) => `:${i}`).join(', ');

        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id INTO :id`;
        const binds = {};
        values.forEach((v, i) => binds[i] = v);
        binds.id = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };

        const result = await conn.execute(sql, binds, { autoCommit: true });
        return { id: result.outBinds.id[0], ...dataWithTimestamp };
      } finally {
        await conn.close();
      }
    },

    async updateOne(where, update) {
      const conn = await pool.getConnection();
      try {
        const now = new Date().toISOString();
        const updateData = { ...update, updatedAt: now };

        const setClauses = [];
        const binds = {};
        let bindIdx = 0;

        for (const [key, val] of Object.entries(updateData)) {
          setClauses.push(`${toSnakeCase(key)} = :s${bindIdx}`);
          binds[`s${bindIdx}`] = serializeValue(val);
          bindIdx++;
        }

        const whereClauses = [];
        for (const [key, val] of Object.entries(where)) {
          whereClauses.push(`${toSnakeCase(key)} = :w${bindIdx}`);
          binds[`w${bindIdx}`] = val;
          bindIdx++;
        }

        const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
        const result = await conn.execute(sql, binds, { autoCommit: true });
        return { modifiedCount: result.rowsAffected };
      } finally {
        await conn.close();
      }
    },

    async findOneAndUpdate(where, update, options = {}) {
      const existing = await this.findOne(where);

      if (existing) {
        await this.updateOne(where, update.$set || update);
        return this.findOne(where);
      } else if (options.upsert) {
        const data = { ...where, ...(update.$set || update) };
        return this.create(data);
      }

      return null;
    },

    async deleteOne(where) {
      const conn = await pool.getConnection();
      try {
        const binds = {};
        const whereClauses = [];
        let bindIdx = 0;

        for (const [key, val] of Object.entries(where)) {
          whereClauses.push(`${toSnakeCase(key)} = :${bindIdx}`);
          binds[bindIdx] = val;
          bindIdx++;
        }

        const sql = `DELETE FROM ${tableName} WHERE ${whereClauses.join(' AND ')}`;
        const result = await conn.execute(sql, binds, { autoCommit: true });
        return { deletedCount: result.rowsAffected };
      } finally {
        await conn.close();
      }
    },

    async updateMany(where, update) {
      // 간단히 updateOne과 동일하게 처리 (개선 가능)
      return this.updateOne(where, update.$set || update);
    },

    async countDocuments(where = {}) {
      const conn = await pool.getConnection();
      try {
        const binds = {};
        let sql = `SELECT COUNT(*) AS cnt FROM ${tableName}`;

        if (Object.keys(where).length > 0) {
          const whereClauses = [];
          let bindIdx = 0;
          for (const [key, val] of Object.entries(where)) {
            whereClauses.push(`${toSnakeCase(key)} = :${bindIdx}`);
            binds[bindIdx] = val;
            bindIdx++;
          }
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows[0].CNT;
      } finally {
        await conn.close();
      }
    }
  };
}

/**
 * SELECT 쿼리 빌드
 */
function buildSelect(tableName, where, limit = null) {
  const binds = {};
  let sql = `SELECT * FROM ${tableName}`;

  if (Object.keys(where).length > 0) {
    const whereClauses = [];
    let bindIdx = 0;
    for (const [key, val] of Object.entries(where)) {
      whereClauses.push(`${toSnakeCase(key)} = :${bindIdx}`);
      binds[bindIdx] = val;
      bindIdx++;
    }
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  if (limit) {
    sql += ` FETCH FIRST ${limit} ROWS ONLY`;
  }

  return { sql, params: binds };
}

/**
 * camelCase → snake_case
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * snake_case → camelCase
 */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 행 파싱
 */
function parseRow(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = toCamelCase(key.toLowerCase());

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
 * 값 직렬화
 */
function serializeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * DB 연결 종료
 */
async function close() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

// 모델 캐시
const models = {};

function getModel(name) {
  if (!pool) {
    throw new Error('[Oracle] Database not initialized. Call db.init() first.');
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
  get pool() { return pool; },
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
