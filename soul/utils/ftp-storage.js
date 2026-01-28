/**
 * FTP 기반 스토리지 어댑터
 * conversations.jsonl 읽기/쓰기를 FTP로 처리
 */
const ftp = require('basic-ftp');
const { Readable } = require('stream');

class FTPStorage {
  constructor(config = {}) {
    // FTP 설정은 환경변수 또는 DB 설정에서 가져옴 (하드코딩 금지)
    this.config = {
      host: config.host || process.env.FTP_HOST || '',
      port: config.port || parseInt(process.env.FTP_PORT) || 21,
      user: config.user || process.env.FTP_USER || '',
      password: config.password || process.env.FTP_PASSWORD || '',
      basePath: config.basePath || process.env.FTP_BASE_PATH || '/memory',
      secure: config.secure || process.env.FTP_SECURE === 'true' || false
    };
    this.client = null;
    this.connected = false;
    this._lock = false;
    this._queue = [];
  }

  // 동시 접속 방지를 위한 락
  async _withLock(fn) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this._lock = true;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this._lock = false;
          // 다음 대기 작업 실행
          if (this._queue.length > 0) {
            const next = this._queue.shift();
            next();
          }
        }
      };

      if (this._lock) {
        this._queue.push(execute);
      } else {
        execute();
      }
    });
  }

  async connect() {
    // 이미 연결되어 있으면 연결 상태 확인
    if (this.connected && this.client) {
      try {
        // 연결 상태 확인 (pwd 명령으로)
        await this.client.pwd();
        return;
      } catch (err) {
        // 연결 끊어짐, 재연결 필요
        console.log('[FTPStorage] Connection lost, reconnecting...');
        this.connected = false;
        this.client.close();
      }
    }
    
    this.client = new ftp.Client();
    this.client.ftp.verbose = false;
    
    try {
      await this.client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        secure: this.config.secure
      });
      this.connected = true;
      console.log('[FTPStorage] Connected to', this.config.host);
    } catch (err) {
      console.error('[FTPStorage] Connection failed:', err.message);
      this.connected = false;
      throw err;
    }
  }

  async disconnect() {
    if (this.client) {
      this.client.close();
      this.connected = false;
    }
  }

  async readFile(filename) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = `${this.config.basePath}/${filename}`;
      
      try {
        const chunks = [];
        const writable = new (require('stream').Writable)({
          write(chunk, encoding, callback) {
            chunks.push(chunk);
            callback();
          }
        });
        
        await this.client.downloadTo(writable, remotePath);
        return Buffer.concat(chunks).toString('utf-8');
      } catch (err) {
        if (err.code === 550) {
          return null;
        }
        throw err;
      }
    });
  }

  async writeFile(filename, content) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = `${this.config.basePath}/${filename}`;
      
      const readable = Readable.from([content]);
      await this.client.uploadFrom(readable, remotePath);
      console.log('[FTPStorage] Saved:', remotePath);
    });
  }

  async appendToFile(filename, content) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = `${this.config.basePath}/${filename}`;
      
      try {
        // 락 안에서는 내부 메서드 직접 호출
        const existing = await this._readFileInternal(filename) || '';
        const newContent = existing + content;
        await this._writeFileInternal(filename, newContent);
      } catch (err) {
        await this._writeFileInternal(filename, content);
      }
    });
  }

  // 락 없이 내부 호출용
  async _readFileInternal(filename) {
    await this.connect();
    const remotePath = `${this.config.basePath}/${filename}`;
    
    try {
      const chunks = [];
      const writable = new (require('stream').Writable)({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });
      
      await this.client.downloadTo(writable, remotePath);
      return Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      if (err.code === 550) {
        return null;
      }
      throw err;
    }
  }

  async _writeFileInternal(filename, content) {
    await this.connect();
    const remotePath = `${this.config.basePath}/${filename}`;
    
    const readable = Readable.from([content]);
    await this.client.uploadFrom(readable, remotePath);
    console.log('[FTPStorage] Saved:', remotePath);
  }

  async exists(filename) {
    await this.connect();
    const remotePath = `${this.config.basePath}/${filename}`;
    
    try {
      const list = await this.client.list(this.config.basePath);
      return list.some(f => f.name === filename);
    } catch {
      return false;
    }
  }

  async listFiles(subdir = '') {
    await this.connect();
    const remotePath = subdir
      ? `${this.config.basePath}/${subdir}`
      : this.config.basePath;

    try {
      const list = await this.client.list(remotePath);
      return list.map(f => ({
        name: f.name,
        type: f.type === 2 ? 'directory' : 'file',
        size: f.size,
        modifiedAt: f.modifiedAt
      }));
    } catch {
      return [];
    }
  }

  /**
   * FTP 연결 테스트
   */
  async testConnection() {
    await this.connect();
    // 연결 성공하면 basePath 존재 확인
    const list = await this.client.list(this.config.basePath);
    return true;
  }
}

// 싱글톤 인스턴스
let instance = null;

function getFTPStorage(config) {
  if (!instance) {
    instance = new FTPStorage(config);
  }
  return instance;
}

module.exports = { FTPStorage, getFTPStorage };
