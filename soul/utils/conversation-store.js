/**
 * JSONL 기반 대화 저장/로드 유틸리티
 * 로컬 파일 또는 FTP 스토리지 지원
 * FTP 연결 실패 시 로컬 캐시에 저장 후 자동 동기화
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 스토리지 설정 캐시 (서버 재시작 시 초기화됨)
let storageConfig = null;
let storageConfigLoaded = false;

// 로컬 캐시 경로
const LOCAL_CACHE_PATH = path.join(__dirname, '../memory/cache');
const PENDING_SYNC_FILE = path.join(LOCAL_CACHE_PATH, 'pending_sync.jsonl');

// 동기화 상태
let syncInProgress = false;

// 캐시 디렉토리 확보
function ensureCacheDir() {
  if (!fs.existsSync(LOCAL_CACHE_PATH)) {
    fs.mkdirSync(LOCAL_CACHE_PATH, { recursive: true });
  }
}

// 설정 가져오기
async function getStorageConfig() {
  // 이미 로드했으면 캐시 반환
  if (storageConfigLoaded && storageConfig) {
    return storageConfig;
  }

  console.log('[ConversationStore] Loading config from DB...');

  try {
    const SystemConfig = require('../models/SystemConfig');
    const config = await SystemConfig.findOne({ configKey: 'memory' });

    if (config?.value) {
      storageConfig = {
        type: config.value.storageType || 'local',
        path: config.value.storagePath || path.join(__dirname, '../memory'),
        ftp: config.value.ftp || null
      };
      storageConfigLoaded = true;
      console.log('[ConversationStore] Storage config:', storageConfig.type);
      return storageConfig;
    }
  } catch (e) {
    console.log('[ConversationStore] DB error:', e.message);
  }

  storageConfig = {
    type: 'local',
    path: path.join(__dirname, '../memory')
  };
  storageConfigLoaded = true;
  return storageConfig;
}

class ConversationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.initialized = false;
    this.storageType = 'local';
    this.ftpStorage = null;
    this.ftpConnected = false;
  }

  async init() {
    if (this.initialized) return;

    const config = await getStorageConfig();
    this.storageType = config.type;

    if (this.storageType === 'ftp') {
      const { getFTPStorage } = require('./ftp-storage');
      this.ftpStorage = getFTPStorage(config.ftp);

      // FTP 연결 테스트
      try {
        await this.ftpStorage.testConnection();
        this.ftpConnected = true;
        console.log('[ConversationStore] FTP connected');

        // 연결되면 보류 중인 데이터 동기화
        this._syncPendingData();
      } catch (e) {
        this.ftpConnected = false;
        console.log('[ConversationStore] FTP not available, using local cache:', e.message);
      }

      this.initialized = true;
      return;
    }

    // 로컬 스토리지
    if (!this.filePath) {
      this.filePath = path.join(config.path, 'conversations.jsonl');
    }
    this.ensureFile();
    this.initialized = true;
  }

  ensureFile() {
    if (this.storageType !== 'local') return;

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '');
    }
  }

  /**
   * 로컬 캐시에 저장 (FTP 실패 시)
   */
  _saveToLocalCache(line) {
    ensureCacheDir();
    fs.appendFileSync(PENDING_SYNC_FILE, line + '\n');
    console.log('[ConversationStore] Saved to local cache (pending sync)');
  }

  /**
   * 보류 중인 데이터를 FTP로 동기화
   */
  async _syncPendingData() {
    if (syncInProgress) return;
    if (!this.ftpConnected || !this.ftpStorage) return;
    if (!fs.existsSync(PENDING_SYNC_FILE)) return;

    syncInProgress = true;
    console.log('[ConversationStore] Starting sync of pending data...');

    try {
      const pendingContent = fs.readFileSync(PENDING_SYNC_FILE, 'utf-8');
      const lines = pendingContent.split('\n').filter(l => l.trim());

      if (lines.length === 0) {
        syncInProgress = false;
        return;
      }

      // FTP에 한 줄씩 추가
      for (const line of lines) {
        await this.ftpStorage.appendToFile('conversations.jsonl', line + '\n');
      }

      // 동기화 완료 후 캐시 파일 삭제
      fs.unlinkSync(PENDING_SYNC_FILE);
      console.log(`[ConversationStore] Synced ${lines.length} messages to FTP`);
    } catch (e) {
      console.error('[ConversationStore] Sync failed:', e.message);
    } finally {
      syncInProgress = false;
    }
  }

  /**
   * FTP 재연결 시도
   */
  async _tryReconnectFTP() {
    if (this.storageType !== 'ftp' || !this.ftpStorage) return false;

    try {
      await this.ftpStorage.testConnection();
      this.ftpConnected = true;
      console.log('[ConversationStore] FTP reconnected');

      // 재연결되면 보류 데이터 동기화
      this._syncPendingData();
      return true;
    } catch (e) {
      this.ftpConnected = false;
      return false;
    }
  }

  async saveMessage(message) {
    await this.init();

    let timestamp = message.timestamp || new Date().toISOString();
    if (timestamp instanceof Date) {
      timestamp = timestamp.toISOString();
    }
    const id = message.id || `${timestamp.replace(/[:.]/g, '-')}_${message.role}`;

    // thinking 태그 제거 (AI가 패턴 학습하는 것 방지)
    let text = message.content || message.text || '';
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '');

    const line = JSON.stringify({
      id,
      role: message.role,
      text,
      timestamp,
      tags: message.tags || [],
      thought: message.thought || null,
      emotion: message.emotion || null,
      tokens: message.tokens || 0,
      metadata: message.metadata || {}
    });

    if (this.storageType === 'ftp') {
      // FTP 연결 안 되어 있으면 재연결 시도
      if (!this.ftpConnected) {
        await this._tryReconnectFTP();
      }

      if (this.ftpConnected) {
        try {
          await this.ftpStorage.appendToFile('conversations.jsonl', line + '\n');
        } catch (e) {
          console.error('[ConversationStore] FTP save failed:', e.message);
          this.ftpConnected = false;
          // 로컬 캐시에 저장
          this._saveToLocalCache(line);
        }
      } else {
        // FTP 안 되면 로컬 캐시에 저장
        this._saveToLocalCache(line);
      }
    } else {
      fs.appendFileSync(this.filePath, line + '\n');
    }

    return { id, timestamp };
  }

  /**
   * 최근 메시지만 효율적으로 가져오기 (tail 알고리즘)
   * 전체 파일을 읽지 않고 끝에서부터 필요한 만큼만 읽음
   */
  async getRecentMessages(limit = 50) {
    await this.init();

    // FTP 모드
    if (this.storageType === 'ftp') {
      // FTP 연결 안 되어 있으면 재연결 시도
      if (!this.ftpConnected) {
        await this._tryReconnectFTP();
      }

      let ftpMessages = [];
      let cacheMessages = [];

      // FTP에서 가져오기 (연결된 경우)
      if (this.ftpConnected) {
        try {
          const lines = await this.readAllLines();
          ftpMessages = lines.slice(-limit).map(line => {
            try { return JSON.parse(line); } catch { return null; }
          }).filter(Boolean);
        } catch (e) {
          console.error('[ConversationStore] FTP read failed:', e.message);
          this.ftpConnected = false;
        }
      }

      // 로컬 캐시에서 추가로 가져오기
      if (fs.existsSync(PENDING_SYNC_FILE)) {
        const cacheContent = fs.readFileSync(PENDING_SYNC_FILE, 'utf-8');
        cacheMessages = cacheContent.split('\n').filter(l => l.trim()).map(line => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
      }

      // FTP + 캐시 합치기
      const allMessages = [...ftpMessages, ...cacheMessages];
      return allMessages.slice(-limit);
    }

    // 로컬: tail 알고리즘 사용
    return this._tailReadLines(limit);
  }

  /**
   * 파일 끝에서부터 N개 라인만 읽기 (메모리 효율적)
   */
  async _tailReadLines(limit) {
    const CHUNK_SIZE = 8192; // 8KB씩 읽기

    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const fd = fs.openSync(this.filePath, 'r');
    const stats = fs.fstatSync(fd);
    const fileSize = stats.size;

    if (fileSize === 0) {
      fs.closeSync(fd);
      return [];
    }

    const lines = [];
    let position = fileSize;
    let buffer = '';

    try {
      while (position > 0 && lines.length < limit) {
        const readSize = Math.min(CHUNK_SIZE, position);
        position -= readSize;

        const chunk = Buffer.alloc(readSize);
        fs.readSync(fd, chunk, 0, readSize, position);
        buffer = chunk.toString('utf-8') + buffer;

        // 줄바꿈으로 분리
        const parts = buffer.split('\n');

        // 마지막 부분은 불완전할 수 있으므로 버퍼에 유지
        buffer = parts[0];

        // 나머지 완전한 라인들 추가 (역순으로)
        for (let i = parts.length - 1; i > 0; i--) {
          const line = parts[i].trim();
          if (line) {
            try {
              lines.unshift(JSON.parse(line));
              if (lines.length >= limit) break;
            } catch { /* 파싱 실패 무시 */ }
          }
        }
      }

      // 마지막 버퍼 처리
      if (lines.length < limit && buffer.trim()) {
        try {
          lines.unshift(JSON.parse(buffer.trim()));
        } catch { /* 파싱 실패 무시 */ }
      }
    } finally {
      fs.closeSync(fd);
    }

    return lines.slice(-limit);
  }

  /**
   * 토큰 제한 내에서 최근 메시지 가져오기
   * @param {number} maxTokens - 최대 토큰 수
   * @returns {{ messages: Array, totalTokens: number }}
   */
  async getMessagesWithinTokenLimit(maxTokens) {
    await this.init();
    const lines = await this.readAllLines();

    const result = [];
    let totalTokens = 0;

    // 최신 메시지부터 역순으로
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const msg = JSON.parse(lines[i]);
        const msgTokens = msg.tokens || this._estimateTokens(msg.text || msg.content || '');

        if (totalTokens + msgTokens > maxTokens) {
          break;
        }

        result.unshift(msg);
        totalTokens += msgTokens;
      } catch {
        // 파싱 실패한 라인 무시
      }
    }

    return { messages: result, totalTokens };
  }

  /**
   * 토큰 수 추정 (한글/영어 고려)
   */
  _estimateTokens(text) {
    if (!text) return 0;
    // 한글은 글자당 약 1.5토큰, 영어는 단어당 약 1토큰
    const koreanChars = (text.match(/[\u3131-\uD79D]/g) || []).length;
    const otherChars = text.length - koreanChars;
    return Math.ceil(koreanChars * 1.5 + otherChars / 4);
  }

  async getMessagesBefore(beforeTimestamp, limit = 20) {
    await this.init();
    const allLines = await this.readAllLines();
    const beforeDate = new Date(beforeTimestamp);

    if (isNaN(beforeDate.getTime())) {
      console.error('Invalid beforeTimestamp:', beforeTimestamp);
      return [];
    }

    const filtered = [];
    for (let i = allLines.length - 1; i >= 0 && filtered.length < limit; i--) {
      try {
        const msg = JSON.parse(allLines[i]);
        if (new Date(msg.timestamp) < beforeDate) {
          filtered.unshift(msg);
        }
      } catch {}
    }

    return filtered;
  }

  async getMessagesAround(messageId, limit = 40) {
    await this.init();
    const allLines = await this.readAllLines();
    const halfLimit = Math.floor(limit / 2);

    let targetIndex = -1;
    for (let i = 0; i < allLines.length; i++) {
      try {
        const msg = JSON.parse(allLines[i]);
        if (msg.id === messageId) {
          targetIndex = i;
          break;
        }
      } catch {}
    }

    if (targetIndex === -1) {
      return this.getRecentMessages(limit);
    }

    const start = Math.max(0, targetIndex - halfLimit);
    const end = Math.min(allLines.length, targetIndex + halfLimit);

    return allLines.slice(start, end).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async search(keywords, limit = 20) {
    await this.init();
    const allLines = await this.readAllLines();
    const results = [];
    const keywordsLower = keywords.map(k => k.toLowerCase());

    for (let i = allLines.length - 1; i >= 0 && results.length < limit; i--) {
      try {
        const msg = JSON.parse(allLines[i]);
        const text = (msg.text || '').toLowerCase();
        const tags = (msg.tags || []).join(' ').toLowerCase();
        const searchText = text + ' ' + tags;

        if (keywordsLower.some(k => searchText.includes(k))) {
          results.push(msg);
        }
      } catch {}
    }

    return results;
  }

  async readAllLines() {
    await this.init();

    if (this.storageType === 'ftp') {
      // FTP 연결 안 되어 있으면 재연결 시도
      if (!this.ftpConnected) {
        await this._tryReconnectFTP();
      }

      let ftpLines = [];
      let cacheLines = [];

      // FTP에서 읽기
      if (this.ftpConnected) {
        try {
          const content = await this.ftpStorage.readFile('conversations.jsonl');
          ftpLines = (content || '').split('\n').filter(line => line.trim());
        } catch (e) {
          console.error('[ConversationStore] FTP read failed:', e.message);
          this.ftpConnected = false;
        }
      }

      // 로컬 캐시도 포함
      if (fs.existsSync(PENDING_SYNC_FILE)) {
        const cacheContent = fs.readFileSync(PENDING_SYNC_FILE, 'utf-8');
        cacheLines = cacheContent.split('\n').filter(l => l.trim());
      }

      return [...ftpLines, ...cacheLines];
    }

    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const content = fs.readFileSync(this.filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim());
  }

  async count() {
    await this.init();
    const lines = await this.readAllLines();
    return lines.length;
  }

  async updateMessage(messageId, updates) {
    await this.init();
    const lines = await this.readAllLines();
    let updated = false;

    const newLines = lines.map(line => {
      try {
        const msg = JSON.parse(line);
        if (msg.id === messageId) {
          updated = true;
          return JSON.stringify({
            ...msg,
            ...updates,
            tags: updates.tags || msg.tags || [],
            thought: updates.thought !== undefined ? updates.thought : msg.thought,
            emotion: updates.emotion !== undefined ? updates.emotion : msg.emotion
          });
        }
        return line;
      } catch {
        return line;
      }
    });

    if (updated) {
      const content = newLines.join('\n') + '\n';
      if (this.storageType === 'ftp') {
        if (this.ftpConnected) {
          try {
            await this.ftpStorage.writeFile('conversations.jsonl', content);
          } catch (e) {
            console.error('[ConversationStore] FTP update failed:', e.message);
            this.ftpConnected = false;
          }
        }
      } else {
        fs.writeFileSync(this.filePath, content);
      }
      console.log(`[ConversationStore] Updated message ${messageId}`);
    }

    return updated;
  }

  /**
   * FTP 연결 상태 확인
   */
  isConnected() {
    if (this.storageType !== 'ftp') return true;
    return this.ftpConnected;
  }

  /**
   * 보류 중인 동기화 데이터 개수
   */
  getPendingSyncCount() {
    if (!fs.existsSync(PENDING_SYNC_FILE)) return 0;
    const content = fs.readFileSync(PENDING_SYNC_FILE, 'utf-8');
    return content.split('\n').filter(l => l.trim()).length;
  }

  /**
   * 수동 동기화 트리거
   */
  async triggerSync() {
    await this.init();
    if (this.storageType === 'ftp') {
      await this._tryReconnectFTP();
      if (this.ftpConnected) {
        await this._syncPendingData();
        return true;
      }
    }
    return false;
  }
}

// 설정 캐시 초기화 (설정 변경 시)
function clearStorageConfigCache() {
  storageConfig = null;
  storageConfigLoaded = false;
}

module.exports = ConversationStore;
module.exports.clearStorageConfigCache = clearStorageConfigCache;
