/**
 * 대화 저장/로드 유틸리티
 * 일별 JSON 파일 기반 (JSONL 폐기)
 * 로컬 파일, FTP, Oracle 스토리지 지원
 *
 * 저장 구조:
 *   conversations/YYYY-MM/YYYY-MM-DD.json
 */
const fs = require('fs');
const path = require('path');
const { OracleStorage } = require('./oracle-storage');
const { getArchiverAsync } = require('./conversation-archiver');
const localConfig = require('./local-config');

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

    // local-config에서 복호화된 credentials 가져오기
    const fileConfig = localConfig.readStorageConfigSync();

    // FTP 설정이 있으면 FTP 사용 (storagePath 불필요)
    if (config?.value?.storageType === 'ftp' && config?.value?.ftp) {
      const ftpFromFile = fileConfig.memory?.ftp || {};
      storageConfig = {
        type: 'ftp',
        path: null,
        ftp: { ...config.value.ftp, password: ftpFromFile.password || config.value.ftp.password }
      };
      storageConfigLoaded = true;
      console.log('[ConversationStore] Storage config: FTP', config.value.ftp.host);
      return storageConfig;
    }

    // Oracle 설정
    if (config?.value?.storageType === 'oracle') {
      const oracleFromFile = fileConfig.memory?.oracle || {};
      storageConfig = {
        type: 'oracle',
        path: config.value.storagePath || null,
        oracle: { ...config.value.oracle, password: oracleFromFile.password, encryptionKey: oracleFromFile.encryptionKey }
      };
      storageConfigLoaded = true;
      console.log('[ConversationStore] Storage config: Oracle DB');
      return storageConfig;
    }

    // 로컬 저장소
    if (config?.value?.storagePath) {
      storageConfig = {
        type: config.value.storageType || 'local',
        path: config.value.storagePath,
        ftp: null
      };
      storageConfigLoaded = true;
      console.log('[ConversationStore] Storage config:', storageConfig.type, storageConfig.path);
      return storageConfig;
    }
  } catch (e) {
    console.log('[ConversationStore] DB error:', e.message);
  }

  // 설정 없으면 에러
  throw new Error('[ConversationStore] memory storage not configured. Please set memory.storagePath or memory.ftp in Settings > Storage.');
}

class ConversationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.initialized = false;
    this.storageType = 'local';
    this.ftpStorage = null;
    this.ftpConnected = false;
    this.oracleStorage = null;
    this.oracleConnected = false;
    this.archiver = null;
    this.storagePath = null;
  }

  async init() {
    if (this.initialized) return;

    const config = await getStorageConfig();
    this.storageType = config.type;
    this.storagePath = config.path;

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

    // Oracle 스토리지
    if (this.storageType === 'oracle') {
      this.oracleStorage = new OracleStorage(config.oracle || {});
      try {
        await this.oracleStorage.initialize();
        this.oracleConnected = true;
        console.log('[ConversationStore] Oracle connected');
      } catch (e) {
        this.oracleConnected = false;
        console.error('[ConversationStore] Oracle connection failed:', e.message);
      }
      this.initialized = true;
      return;
    }

    // 로컬 스토리지 - Archiver 사용 (일별 JSON)
    try {
      this.archiver = await getArchiverAsync();
      await this.archiver.initialize();
      console.log('[ConversationStore] Using Archiver for local storage');
    } catch (e) {
      console.error('[ConversationStore] Archiver init failed:', e.message);
    }

    this.initialized = true;
  }

  ensureFile() {
    // 더 이상 JSONL 파일 사용하지 않음
    // Archiver가 일별 JSON 파일 관리
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

    if (this.storageType === 'oracle') {
      // Oracle DB 저장
      if (this.oracleConnected && this.oracleStorage) {
        try {
          await this.oracleStorage.saveMessage({
            id,
            role: message.role,
            content: text,
            timestamp,
            tags: message.tags || [],
            metadata: message.metadata || {}
          });
        } catch (e) {
          console.error('[ConversationStore] Oracle save failed:', e.message);
          // 로컬 캐시에 백업
          this._saveToLocalCache(line);
        }
      } else {
        console.error('[ConversationStore] Oracle not connected, saving to local cache');
        this._saveToLocalCache(line);
      }
    } else if (this.storageType === 'ftp') {
      // FTP: Archiver 사용 (일별 JSON)
      if (this.archiver) {
        try {
          await this.archiver.archiveMessage({
            role: message.role,
            content: text,
            timestamp,
            tokens: message.tokens || 0,
            tags: message.tags || [],
            metadata: message.metadata || {},
            routing: message.routing || null
          });
        } catch (e) {
          console.error('[ConversationStore] Archiver save failed:', e.message);
          this._saveToLocalCache(line);
        }
      } else {
        this._saveToLocalCache(line);
      }
    } else {
      // 로컬: Archiver 사용 (일별 JSON)
      if (this.archiver) {
        try {
          await this.archiver.archiveMessage({
            role: message.role,
            content: text,
            timestamp,
            tokens: message.tokens || 0,
            tags: message.tags || [],
            metadata: message.metadata || {},
            routing: message.routing || null
          });
        } catch (e) {
          console.error('[ConversationStore] Archiver save failed:', e.message);
          // 폴백: 레거시 JSONL 저장
          if (this.filePath) {
            fs.appendFileSync(this.filePath, line + '\n');
          }
        }
      } else if (this.filePath) {
        // Archiver 없으면 레거시 JSONL 사용
        fs.appendFileSync(this.filePath, line + '\n');
      }
    }

    return { id, timestamp };
  }

  /**
   * 최근 메시지만 효율적으로 가져오기 (tail 알고리즘)
   * 전체 파일을 읽지 않고 끝에서부터 필요한 만큼만 읽음
   */
  async getRecentMessages(limit = 50) {
    await this.init();

    // Oracle 모드
    if (this.storageType === 'oracle') {
      if (this.oracleConnected && this.oracleStorage) {
        try {
          const messages = await this.oracleStorage.getRecentMessages(limit);
          // ConversationStore 형식으로 변환
          return messages.map(m => ({
            id: m.id,
            role: m.role,
            text: m.content,
            content: m.content,
            timestamp: m.timestamp,
            tags: m.tags || [],
            metadata: m.metadata || {}
          }));
        } catch (e) {
          console.error('[ConversationStore] Oracle read failed:', e.message);
          return [];
        }
      }
      return [];
    }

    // FTP/로컬 모드: Archiver 사용 (일별 JSON)
    if (this.archiver) {
      try {
        const messages = await this.archiver.getRecentMessages(limit);
        // ConversationStore 형식으로 변환
        return messages.map(m => ({
          id: m.id || `${m.timestamp}_${m.role}`,
          role: m.role,
          text: m.content,
          content: m.content,
          timestamp: m.timestamp,
          tags: m.tags || [],
          tokens: m.tokens || 0,
          metadata: m.metadata || {},
          routing: m.routing || null,
          attachments: m.attachments || null
        }));
      } catch (e) {
        console.error('[ConversationStore] Archiver read failed:', e.message);
      }
    }

    // 폴백: JSON 아카이브에서 로드
    return this._loadFromJsonArchive(limit);
  }

  /**
   * JSON 아카이브 파일에서 최근 메시지 로드
   * conversations/YYYY-MM/YYYY-MM-DD.json 형식
   */
  async _loadFromJsonArchive(limit = 50) {
    const config = await getStorageConfig();
    const conversationsPath = path.join(config.path, 'conversations');

    try {
      // 월별 폴더 목록 (최신순)
      const monthDirs = fs.readdirSync(conversationsPath)
        .filter(d => /^\d{4}-\d{2}$/.test(d))
        .sort()
        .reverse();

      const allMessages = [];

      for (const monthDir of monthDirs) {
        const monthPath = path.join(conversationsPath, monthDir);

        // 일별 파일 목록 (최신순)
        const dayFiles = fs.readdirSync(monthPath)
          .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
          .sort()
          .reverse();

        for (const dayFile of dayFiles) {
          const filePath = path.join(monthPath, dayFile);
          const content = fs.readFileSync(filePath, 'utf-8');
          const dayMessages = JSON.parse(content);

          // JSON 아카이브 형식을 ConversationStore 형식으로 변환
          const converted = dayMessages.map(m => ({
            id: m.id || `${m.timestamp}_${m.role}`,
            role: m.role,
            text: m.content,
            content: m.content,
            timestamp: m.timestamp,
            tags: m.tags || [],
            tokens: m.tokens || 0,
            metadata: m.metadata || {},
            // 라우팅 정보 (assistant 메시지용)
            routing: m.routing || null
          }));

          allMessages.unshift(...converted);

          if (allMessages.length >= limit) {
            break;
          }
        }

        if (allMessages.length >= limit) {
          break;
        }
      }

      // 시간순 정렬 후 최근 limit개 반환
      const sorted = allMessages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      console.log(`[ConversationStore] Loaded ${Math.min(sorted.length, limit)} messages from JSON archive`);
      return sorted.slice(-limit);
    } catch (e) {
      console.log('[ConversationStore] No JSON archive found:', e.message);
      return [];
    }
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
    const beforeDate = new Date(beforeTimestamp);

    if (isNaN(beforeDate.getTime())) {
      console.error('Invalid beforeTimestamp:', beforeTimestamp);
      return [];
    }

    // 아카이브 JSON 파일에서 before 이전 메시지 탐색 (기한 없음)
    const config = await getStorageConfig();
    if (!config.path) return [];
    const resolvedPath = config.path.replace(/^~/, require('os').homedir());
    const conversationsPath = path.join(resolvedPath, 'conversations');

    try {
      if (!fs.existsSync(conversationsPath)) return [];

      // 월별 폴더 (최신순)
      const monthDirs = fs.readdirSync(conversationsPath)
        .filter(d => /^\d{4}-\d{2}$/.test(d))
        .sort()
        .reverse();

      const results = [];

      for (const monthDir of monthDirs) {
        // 이 월이 before보다 미래면 스킵하되, 같은 월이면 탐색 필요
        // (월 단위로 크게 거르기)
        const monthPath = path.join(conversationsPath, monthDir);

        const dayFiles = fs.readdirSync(monthPath)
          .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
          .sort()
          .reverse(); // 최신 날짜부터

        for (const dayFile of dayFiles) {
          const dateStr = dayFile.replace('.json', '');
          // before 날짜보다 크게 미래인 파일은 스킵 (1일 여유)
          const fileDate = new Date(dateStr + 'T23:59:59');
          if (fileDate > new Date(beforeDate.getTime() + 86400000)) continue;

          const filePath = path.join(monthPath, dayFile);
          const content = fs.readFileSync(filePath, 'utf-8');
          const dayMessages = JSON.parse(content);

          // before 이전 메시지만 필터 (역순으로)
          for (let i = dayMessages.length - 1; i >= 0; i--) {
            const m = dayMessages[i];
            const msgTime = new Date(m.timestamp);
            if (msgTime < beforeDate) {
              results.unshift({
                id: m.id || `${m.timestamp}_${m.role}`,
                role: m.role,
                text: m.content,
                content: m.content,
                timestamp: m.timestamp,
                tags: m.tags || [],
                tokens: m.tokens || 0,
                metadata: m.metadata || {},
                routing: m.routing || null
              });

              if (results.length >= limit) break;
            }
          }

          if (results.length >= limit) break;
        }

        if (results.length >= limit) break;
      }

      // 시간순 정렬
      results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      console.log(`[ConversationStore] getMessagesBefore: ${results.length} messages before ${beforeTimestamp}`);
      return results.slice(-limit);
    } catch (e) {
      console.error('[ConversationStore] getMessagesBefore archive error:', e.message);
      return [];
    }
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

    // Oracle 모드
    if (this.storageType === 'oracle') {
      if (this.oracleConnected && this.oracleStorage) {
        try {
          const messages = await this.oracleStorage.getRecentMessages(1000);
          return messages.map(m => JSON.stringify({
            id: m.id,
            role: m.role,
            text: m.content,
            timestamp: m.timestamp,
            tags: m.tags || [],
            metadata: m.metadata || {}
          }));
        } catch (e) {
          console.error('[ConversationStore] Oracle read failed:', e.message);
          return [];
        }
      }
      return [];
    }

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
   * 연결 상태 확인
   */
  isConnected() {
    if (this.storageType === 'ftp') return this.ftpConnected;
    if (this.storageType === 'oracle') return this.oracleConnected;
    return true;
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
