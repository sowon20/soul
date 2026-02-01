/**
 * Oracle Autonomous Database Storage (Thin Mode - no Oracle Client needed)
 * 대화 및 임베딩 저장용
 * 비밀번호는 macOS 키체인에서 가져옴
 */

const oracledb = require('oracledb');
const keytar = require('keytar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVICE_NAME = 'soul-oracle-db';

class OracleStorage {
  constructor(config = {}) {
    this.config = {
      user: config.user || 'ADMIN',
      walletDir: config.walletDir || path.join(__dirname, '../config/oracle'),
      connectString: config.connectString || 'database_low',
      ...config
    };
    this.pool = null;
    this.password = null;
    this.encryptionKey = null;
  }

  /**
   * 키체인에서 비밀번호 가져오기
   */
  async _getCredentials() {
    this.password = await keytar.getPassword(SERVICE_NAME, 'password');
    this.encryptionKey = await keytar.getPassword(SERVICE_NAME, 'encryptionKey');

    if (!this.password) {
      throw new Error('[OracleStorage] Password not found in keychain. Run setup first.');
    }

    return { password: this.password, encryptionKey: this.encryptionKey };
  }

  /**
   * 키체인에 비밀번호 저장 (최초 설정용)
   */
  static async setCredentials(password, encryptionKey) {
    await keytar.setPassword(SERVICE_NAME, 'password', password);
    if (encryptionKey) {
      await keytar.setPassword(SERVICE_NAME, 'encryptionKey', encryptionKey);
    }
    console.log('[OracleStorage] Credentials saved to keychain');
  }

  /**
   * 키체인에서 비밀번호 삭제
   */
  static async deleteCredentials() {
    await keytar.deletePassword(SERVICE_NAME, 'password');
    await keytar.deletePassword(SERVICE_NAME, 'encryptionKey');
    console.log('[OracleStorage] Credentials deleted from keychain');
  }

  /**
   * 연결 초기화 (Thin Mode)
   */
  async initialize() {
    try {
      // 키체인에서 비밀번호 가져오기
      await this._getCredentials();

      // Thin 모드 연결 (Oracle Client 불필요)
      this.pool = await oracledb.createPool({
        user: this.config.user,
        password: this.password,
        connectString: this.config.connectString,
        configDir: this.config.walletDir,
        walletLocation: this.config.walletDir,
        walletPassword: this.password,
        poolMin: 1,
        poolMax: 5,
        poolIncrement: 1
      });

      console.log('[OracleStorage] Connected successfully (Thin mode)');

      // 테이블 생성
      await this._createTables();

      return true;
    } catch (error) {
      console.error('[OracleStorage] Connection error:', error.message);
      throw error;
    }
  }

  /**
   * 테이블 생성
   */
  async _createTables() {
    const connection = await this.pool.getConnection();
    try {
      // 대화 테이블
      await connection.execute(`
        BEGIN
          EXECUTE IMMEDIATE 'CREATE TABLE conversations (
            id VARCHAR2(64) PRIMARY KEY,
            role VARCHAR2(20) NOT NULL,
            content CLOB NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            date_str VARCHAR2(10),
            tags VARCHAR2(500),
            metadata CLOB,
            encrypted NUMBER(1) DEFAULT 0
          )';
        EXCEPTION WHEN OTHERS THEN
          IF SQLCODE = -955 THEN NULL; END IF;
        END;
      `);

      // 임베딩 테이블 (벡터 저장용)
      await connection.execute(`
        BEGIN
          EXECUTE IMMEDIATE 'CREATE TABLE embeddings (
            id VARCHAR2(64) PRIMARY KEY,
            conversation_id VARCHAR2(64),
            vector CLOB,
            text_preview VARCHAR2(500),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
          )';
        EXCEPTION WHEN OTHERS THEN
          IF SQLCODE = -955 THEN NULL; END IF;
        END;
      `);

      // 인덱스 생성
      await connection.execute(`
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX idx_conv_date ON conversations(date_str)';
        EXCEPTION WHEN OTHERS THEN
          IF SQLCODE = -955 THEN NULL; END IF;
        END;
      `);

      await connection.commit();
      console.log('[OracleStorage] Tables ready');
    } finally {
      await connection.close();
    }
  }

  /**
   * 암호화
   */
  _encrypt(text) {
    if (!this.encryptionKey) return { data: text, encrypted: false };

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc',
      crypto.scryptSync(this.encryptionKey, 'salt', 32), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      data: iv.toString('hex') + ':' + encrypted,
      encrypted: true
    };
  }

  /**
   * 복호화
   */
  _decrypt(data) {
    if (!this.encryptionKey || !data.includes(':')) return data;

    const [ivHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc',
      crypto.scryptSync(this.encryptionKey, 'salt', 32), iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 메시지 저장
   */
  async saveMessage(message) {
    const connection = await this.pool.getConnection();
    try {
      const id = message.id || crypto.randomUUID();
      const timestamp = message.timestamp || new Date().toISOString();
      const dateStr = timestamp.split('T')[0];
      const tags = message.tags ? message.tags.join(',') : '';

      // 암호화 적용
      const { data: content, encrypted } = this._encrypt(message.content);
      const metadata = message.metadata ? JSON.stringify(message.metadata) : null;

      await connection.execute(`
        INSERT INTO conversations (id, role, content, timestamp, date_str, tags, metadata, encrypted)
        VALUES (:id, :role, :content, TO_TIMESTAMP(:timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'), :dateStr, :tags, :metadata, :encrypted)
      `, {
        id,
        role: message.role,
        content,
        timestamp,
        dateStr,
        tags,
        metadata,
        encrypted: encrypted ? 1 : 0
      });

      await connection.commit();
      console.log('[OracleStorage] Message saved:', id);
      return id;
    } catch (error) {
      console.error('[OracleStorage] saveMessage error:', error.message);
      throw error;
    } finally {
      await connection.close();
    }
  }

  /**
   * 날짜별 메시지 조회
   */
  async getMessagesForDate(date) {
    const connection = await this.pool.getConnection();
    try {
      const result = await connection.execute(`
        SELECT id, role, content, timestamp, tags, metadata, encrypted
        FROM conversations
        WHERE date_str = :dateStr
        ORDER BY timestamp ASC
      `, { dateStr: date }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      return result.rows.map(row => ({
        id: row.ID,
        role: row.ROLE,
        content: row.ENCRYPTED ? this._decrypt(row.CONTENT) : row.CONTENT,
        timestamp: row.TIMESTAMP,
        tags: row.TAGS ? row.TAGS.split(',') : [],
        metadata: row.METADATA ? JSON.parse(row.METADATA) : null
      }));
    } finally {
      await connection.close();
    }
  }

  /**
   * 최근 메시지 조회
   */
  async getRecentMessages(limit = 50) {
    const connection = await this.pool.getConnection();
    try {
      const result = await connection.execute(`
        SELECT id, role, content, timestamp, tags, metadata, encrypted
        FROM conversations
        ORDER BY timestamp DESC
        FETCH FIRST :limit ROWS ONLY
      `, { limit }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      return result.rows.reverse().map(row => ({
        id: row.ID,
        role: row.ROLE,
        content: row.ENCRYPTED ? this._decrypt(row.CONTENT) : row.CONTENT,
        timestamp: row.TIMESTAMP,
        tags: row.TAGS ? row.TAGS.split(',') : [],
        metadata: row.METADATA ? JSON.parse(row.METADATA) : null
      }));
    } finally {
      await connection.close();
    }
  }

  /**
   * 임베딩 저장
   */
  async saveEmbedding(conversationId, vector, textPreview) {
    const connection = await this.pool.getConnection();
    try {
      const id = crypto.randomUUID();
      const vectorJson = JSON.stringify(vector);

      await connection.execute(`
        INSERT INTO embeddings (id, conversation_id, vector, text_preview)
        VALUES (:id, :conversationId, :vector, :textPreview)
      `, {
        id,
        conversationId,
        vector: vectorJson,
        textPreview: textPreview.substring(0, 500)
      });

      await connection.commit();
      return id;
    } finally {
      await connection.close();
    }
  }

  /**
   * 연결 종료
   */
  async close() {
    if (this.pool) {
      await this.pool.close();
      console.log('[OracleStorage] Connection closed');
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection() {
    try {
      const connection = await this.pool.getConnection();
      const result = await connection.execute('SELECT 1 FROM DUAL');
      await connection.close();
      console.log('[OracleStorage] Connection test passed');
      return true;
    } catch (error) {
      console.error('[OracleStorage] Connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = { OracleStorage };
