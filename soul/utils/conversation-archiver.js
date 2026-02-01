/**
 * conversation-archiver.js
 * 대화 실시간 저장 시스템 (Phase 1.5)
 *
 * 역할:
 * - 메시지 올 때마다 실시간으로 JSON 파일에 저장
 * - 장기 메모리 = 영구 원문 보관 (절대 삭제/압축 안 함)
 * - 월별 폴더 / 일별 파일 구조
 * - 알바 연동: aiMemo, 태그 자동 생성
 *
 * 안전장치 (Phase 1.5.1):
 * - 원격 폴더 연결 실패 시 로컬 캐시에 임시 저장
 * - 재연결 시 로컬 캐시를 원격에 합치기 (덮어쓰기 아님!)
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { getAlbaWorker } = require('./alba-worker');
const { FTPStorage } = require('./ftp-storage');
const { NotionStorage } = require('./notion-storage');

// 앱 기준 캐시 경로 (실행 위치와 무관하게 고정)
const APP_ROOT = path.join(__dirname, '..');
const LOCAL_CACHE_DIR = path.join(APP_ROOT, 'cache', 'archiver');

class ConversationArchiver {
  constructor(basePath, options = {}) {
    if (!basePath && !options.useFTP && !options.useNotion) {
      throw new Error('[Archiver] basePath is required. Set memory.storagePath in settings.');
    }
    this.basePath = basePath;
    this.conversationsPath = basePath ? path.join(basePath, 'conversations') : 'conversations';
    this.cachePath = LOCAL_CACHE_DIR; // 앱 폴더 내 고정 경로
    this.initialized = false;
    this.remoteAvailable = true;

    // FTP 설정
    this.useFTP = options.useFTP || false;
    this.ftpStorage = options.ftpStorage || null;
    if (this.useFTP && !this.ftpStorage) {
      throw new Error('[Archiver] FTP storage instance required when useFTP is true');
    }

    // Notion 설정
    this.useNotion = options.useNotion || false;
    this.notionStorage = options.notionStorage || null;
    if (this.useNotion && !this.notionStorage) {
      throw new Error('[Archiver] Notion storage instance required when useNotion is true');
    }
  }

  /**
   * 캐시 디렉토리 확보 (설정 폴더 내)
   */
  _ensureCacheDir() {
    if (!fsSync.existsSync(this.cachePath)) {
      fsSync.mkdirSync(this.cachePath, { recursive: true });
    }
  }

  /**
   * 원격 폴더 접근 가능 여부 테스트
   */
  async _testRemoteAccess() {
    // Notion은 항상 접근 가능 (API 기반)
    if (this.useNotion) {
      this.remoteAvailable = true;
      return true;
    }

    // FTP는 연결 상태 확인
    if (this.useFTP) {
      this.remoteAvailable = true;
      return true;
    }

    try {
      await fs.access(this.basePath, fs.constants.W_OK);
      this.remoteAvailable = true;
      return true;
    } catch (e) {
      console.warn(`[Archiver] Remote path not accessible: ${this.basePath}`);
      this.remoteAvailable = false;
      return false;
    }
  }

  /**
   * 초기화 - 폴더 구조 확인/생성
   */
  async initialize() {
    try {
      if (this.useNotion) {
        // Notion은 초기화 불필요
        this.initialized = true;
        console.log(`[Archiver] Initialized with Notion storage`);
      } else if (this.useFTP) {
        // FTP는 폴더 자동 생성 불필요 (업로드 시 생성됨)
        this.initialized = true;
        console.log(`[Archiver] Initialized with FTP storage at ${this.ftpStorage.config.basePath}/conversations`);
      } else {
        await fs.mkdir(this.conversationsPath, { recursive: true });
        this.initialized = true;
        console.log(`[Archiver] Initialized at ${this.conversationsPath}`);
      }
    } catch (error) {
      console.error('[Archiver] Init failed:', error.message);
    }
  }

  /**
   * 메타 정보 계산 (타임존 반영)
   */
  calculateMeta(timestamp, lastMessageTime = null, timezone = 'Asia/Seoul') {
    const date = new Date(timestamp);
    
    // 타임존 적용된 시간 정보
    const options = { timeZone: timezone };
    const localDate = new Date(date.toLocaleString('en-US', options));
    const hour = localDate.getHours();
    const minute = localDate.getMinutes();
    
    // 로컬 시간 문자열 (HH:MM)
    const localTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    
    // 로컬 날짜 (YYYY-MM-DD) - localDate는 이미 타임존 적용됨
    const localYear = localDate.getFullYear();
    const localMonth = String(localDate.getMonth() + 1).padStart(2, '0');
    const localDay = String(localDate.getDate()).padStart(2, '0');
    const localDateStr = `${localYear}-${localMonth}-${localDay}`;
    
    // 시간대 계산
    let timeOfDay;
    if (hour >= 0 && hour < 6) timeOfDay = '새벽';
    else if (hour >= 6 && hour < 12) timeOfDay = '아침';
    else if (hour >= 12 && hour < 18) timeOfDay = '오후';
    else if (hour >= 18 && hour < 22) timeOfDay = '저녁';
    else timeOfDay = '밤';

    // 요일 계산
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayOfWeek = days[localDate.getDay()];
    
    // 주말 여부
    const isWeekend = localDate.getDay() === 0 || localDate.getDay() === 6;

    // 침묵 시간 계산
    let silenceBefore = null;
    let silenceFormatted = null;
    if (lastMessageTime) {
      silenceBefore = Math.floor((date.getTime() - new Date(lastMessageTime).getTime()) / 1000);
      silenceFormatted = this._formatDuration(silenceBefore);
    }

    return {
      // 시점 정보
      localTime,
      localDate: localDateStr,
      hour,
      timeOfDay,
      dayOfWeek,
      isWeekend,
      timezone,
      
      // 간격 정보
      silenceBefore,
      silenceFormatted
    };
  }
  
  /**
   * 시간 간격 포맷 (초 → 읽기 쉬운 형태)
   */
  _formatDuration(seconds) {
    if (seconds < 60) return '방금';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
    return `${Math.floor(seconds / 86400)}일`;
  }

  /**
   * 일별 파일 경로 생성
   */
  getFilePath(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const monthDir = this.useFTP
      ? `conversations/${year}-${month}`
      : path.join(this.conversationsPath, `${year}-${month}`);
    const fileName = `${year}-${month}-${day}.json`;

    return {
      monthDir,
      filePath: this.useFTP
        ? `${monthDir}/${fileName}`
        : path.join(monthDir, fileName)
    };
  }

  /**
   * 메시지 실시간 저장 (핵심 함수)
   * 원격 실패 시 로컬 캐시에 저장, 재연결 시 합침
   */
  async archiveMessage(message, lastMessageTime = null, timezone = 'Asia/Seoul') {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = message.timestamp || new Date();

    // 메타 정보 계산 (타임존 반영)
    const meta = this.calculateMeta(timestamp, lastMessageTime, timezone);

    // 세션 메타 병합
    if (message.sessionMeta) {
      meta.sessionId = message.sessionMeta.sessionId;
      meta.sessionDuration = message.sessionMeta.sessionDuration;
      meta.sessionDurationFormatted = this._formatDuration(message.sessionMeta.sessionDuration);
      meta.messageIndex = message.sessionMeta.messageIndex;
    }

    // 이벤트 메타 병합 (복귀/떠남 이벤트)
    if (message.eventMeta) {
      meta.returnEvent = message.eventMeta.returnEvent;
      meta.departureEvent = message.eventMeta.departureEvent;
      meta.pendingTimeContext = message.eventMeta.timeContext;
    }

    // 저장할 메시지 객체
    const archiveEntry = {
      role: message.role,
      content: message.content,
      timestamp: new Date(timestamp).toISOString(),
      tokens: message.tokens || 0,
      meta,
      aiMemo: message.aiMemo || null,
      tags: message.tags || [],
      metadata: message.metadata || {},
      // 라우팅 정보 (assistant 메시지용)
      routing: message.routing || null
    };

    // 원격 폴더 접근 시도
    const remoteOk = await this._testRemoteAccess();

    if (remoteOk) {
      // 재연결 시 로컬 캐시 합치기 시도
      await this._syncCacheToRemote();

      // 원격에 저장
      try {
        const result = await this._saveToRemote(archiveEntry, timestamp);
        return result;
      } catch (error) {
        console.warn('[Archiver] Remote save failed, falling back to cache:', error.message);
        this.remoteAvailable = false;
        return this._saveToLocalCache(archiveEntry, timestamp);
      }
    } else {
      // 로컬 캐시에 저장
      return this._saveToLocalCache(archiveEntry, timestamp);
    }
  }

  /**
   * 원격에 저장 (Notion, FTP 또는 로컬 파일시스템)
   */
  async _saveToRemote(archiveEntry, timestamp) {
    // Notion 저장
    if (this.useNotion) {
      const dateStr = new Date(timestamp).toISOString().split('T')[0];
      await this.notionStorage.saveMessage({
        role: archiveEntry.role,
        content: archiveEntry.content,
        date: dateStr,
        timestamp: archiveEntry.timestamp,
        tokens: archiveEntry.tokens,
        meta: archiveEntry.meta
      });
      console.log(`[Archiver/Notion] Saved message: ${archiveEntry.role}`);
      return archiveEntry;
    }

    const { monthDir, filePath } = this.getFilePath(timestamp);

    let dayMessages = [];

    if (this.useFTP) {
      // FTP 저장
      try {
        const existing = await this.ftpStorage.readFile(filePath);
        if (existing) {
          dayMessages = JSON.parse(existing);
        }
      } catch (e) {
        // 파일 없으면 새로 시작
      }

      dayMessages.push(archiveEntry);

      await this.ftpStorage.writeFile(filePath, JSON.stringify(dayMessages, null, 2));
      console.log(`[Archiver/FTP] Saved to ${filePath} (${dayMessages.length} messages)`);
    } else {
      // 로컬 파일시스템 저장
      await fs.mkdir(monthDir, { recursive: true });

      try {
        const existing = await fs.readFile(filePath, 'utf-8');
        dayMessages = JSON.parse(existing);
      } catch (e) {
        // 파일 없으면 새로 시작
      }

      dayMessages.push(archiveEntry);

      await fs.writeFile(filePath, JSON.stringify(dayMessages, null, 2), 'utf-8');
      console.log(`[Archiver] Saved to ${filePath} (${dayMessages.length} messages)`);
    }

    // 알바 작업: assistant 메시지일 때 aiMemo, 태그 생성 (비동기)
    if (archiveEntry.role === 'assistant' && dayMessages.length >= 2) {
      this._scheduleAlbaWork(filePath, dayMessages);
    }

    return archiveEntry;
  }

  /**
   * 로컬 캐시에 저장 (원격 실패 시)
   */
  async _saveToLocalCache(archiveEntry, timestamp) {
    this._ensureCacheDir();

    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheFile = path.join(this.cachePath, `${dateStr}.json`);

    // 기존 캐시 읽기
    let cached = [];
    try {
      const existing = await fs.readFile(cacheFile, 'utf-8');
      cached = JSON.parse(existing);
    } catch (e) {
      // 파일 없으면 새로 시작
    }

    cached.push(archiveEntry);

    await fs.writeFile(cacheFile, JSON.stringify(cached, null, 2), 'utf-8');
    console.log(`[Archiver] Saved to LOCAL CACHE: ${cacheFile} (${cached.length} messages, waiting for sync)`);

    return archiveEntry;
  }

  /**
   * 로컬 캐시를 원격에 합치기 (재연결 시)
   * 중요: 덮어쓰기가 아니라 합치기!
   */
  async _syncCacheToRemote() {
    this._ensureCacheDir();

    let cacheFiles;
    try {
      cacheFiles = await fs.readdir(this.cachePath);
    } catch (e) {
      return; // 캐시 폴더 없으면 패스
    }

    const jsonFiles = cacheFiles.filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) return;

    console.log(`[Archiver] Syncing ${jsonFiles.length} cached files to remote...`);

    for (const cacheFileName of jsonFiles) {
      const cacheFilePath = path.join(this.cachePath, cacheFileName);

      try {
        // 캐시 파일 읽기
        const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
        const cachedMessages = JSON.parse(cacheContent);

        if (cachedMessages.length === 0) {
          await fs.unlink(cacheFilePath);
          continue;
        }

        // 날짜 추출 (YYYY-MM-DD.json → timestamp)
        const dateStr = cacheFileName.replace('.json', '');
        const timestamp = new Date(dateStr);

        const { monthDir, filePath } = this.getFilePath(timestamp);

        // 원격 월별 폴더 생성
        await fs.mkdir(monthDir, { recursive: true });

        // 원격 기존 파일 읽기
        let remoteMessages = [];
        try {
          const existing = await fs.readFile(filePath, 'utf-8');
          remoteMessages = JSON.parse(existing);
        } catch (e) {
          // 파일 없으면 새로 시작
        }

        // 중복 제거하며 합치기 (timestamp 기준)
        const existingTimestamps = new Set(remoteMessages.map(m => m.timestamp));
        const newMessages = cachedMessages.filter(m => !existingTimestamps.has(m.timestamp));

        if (newMessages.length > 0) {
          // 합친 후 시간순 정렬
          const merged = [...remoteMessages, ...newMessages].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
          console.log(`[Archiver] Synced ${newMessages.length} messages to ${filePath} (total: ${merged.length})`);
        }

        // 캐시 파일 삭제
        await fs.unlink(cacheFilePath);
        console.log(`[Archiver] Cache file removed: ${cacheFileName}`);
      } catch (error) {
        console.error(`[Archiver] Failed to sync cache file ${cacheFileName}:`, error.message);
        // 실패해도 다음 파일 계속 처리
      }
    }
  }

  /**
   * 특정 날짜 메시지 읽기
   */
  async getMessagesForDate(date) {
    // Notion
    if (this.useNotion) {
      console.log(`[Archiver] getMessagesForDate: useNotion=true`);
      try {
        return await this.notionStorage.getMessagesForDate(date);
      } catch (e) {
        console.log(`[Archiver] Notion getMessagesForDate error: ${e.message}`);
        return [];
      }
    }

    const { filePath } = this.getFilePath(date);
    console.log(`[Archiver] getMessagesForDate: useFTP=${this.useFTP}, path=${filePath}`);
    try {
      if (this.useFTP) {
        const content = await this.ftpStorage.readFile(filePath);
        console.log(`[Archiver] FTP read result: ${content ? content.length + ' chars' : 'null'}`);
        return content ? JSON.parse(content) : [];
      } else {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.log(`[Archiver] getMessagesForDate error: ${e.message}`);
      return [];
    }
  }

  /**
   * 최근 N개 메시지 가져오기 (여러 날짜 파일에서)
   */
  async getRecentMessages(limit = 50) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Notion은 직접 API로 가져오기
    if (this.useNotion) {
      return await this.notionStorage.getRecentMessages(limit);
    }

    const messages = [];
    const today = new Date();
    let daysBack = 0;
    const maxDaysBack = 30; // 최대 30일 전까지만

    while (messages.length < limit && daysBack < maxDaysBack) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);

      const dayMessages = await this.getMessagesForDate(date);

      // 최신 메시지가 앞에 오도록
      for (let i = dayMessages.length - 1; i >= 0 && messages.length < limit; i--) {
        messages.unshift(dayMessages[i]);
      }

      daysBack++;
    }

    // limit 초과분 제거 (오래된 것부터)
    if (messages.length > limit) {
      messages.splice(0, messages.length - limit);
    }

    return messages;
  }

  /**
   * 기간 내 메시지 검색 (태그 기반)
   */
  async searchByTags(tags, startDate, endDate) {
    // TODO: Phase 1.5.3에서 구현
    return [];
  }

  /**
   * 알바 작업 스케줄링 (비동기 백그라운드)
   */
  _scheduleAlbaWork(filePath, dayMessages) {
    const self = this;
    // 비동기로 실행 (응답 블로킹 안 함)
    setImmediate(async () => {
      try {
        const alba = await getAlbaWorker();

        // 최근 2개 메시지 (user + assistant)
        const recentPair = dayMessages.slice(-2);
        const lastIndex = dayMessages.length - 1;

        // 시간 맥락 문자열 (복귀 이벤트 포함)
        const lastMsg = dayMessages[lastIndex];
        let timeContext = lastMsg.meta
          ? `${lastMsg.meta.timeOfDay}, ${lastMsg.meta.dayOfWeek}`
          : '';

        // 복귀 이벤트 맥락 추가
        if (lastMsg.meta?.returnEvent?.message) {
          timeContext += `, ${lastMsg.meta.returnEvent.message}`;
        }

        // 떠남 이벤트 맥락 추가
        if (lastMsg.meta?.departureEvent) {
          timeContext += `, ${lastMsg.meta.departureEvent.type}하러 간다고 함`;
        }

        // aiMemo 생성
        const aiMemo = await alba.generateAiMemo(recentPair, { timeContext });

        // 태그 생성 (user 메시지 기준)
        const userMsg = recentPair.find(m => m.role === 'user');
        const tags = userMsg ? await alba.generateTags(userMsg.content) : [];

        // 파일 업데이트 (마지막 메시지에 aiMemo, 태그 추가)
        if (aiMemo || tags.length > 0) {
          let content, messages;
          if (self.useFTP) {
            content = await self.ftpStorage.readFile(filePath);
            messages = content ? JSON.parse(content) : [];
          } else {
            content = await fs.readFile(filePath, 'utf-8');
            messages = JSON.parse(content);
          }

          if (aiMemo) messages[lastIndex].aiMemo = aiMemo;
          if (tags.length > 0) messages[lastIndex].tags = tags;

          if (self.useFTP) {
            await self.ftpStorage.writeFile(filePath, JSON.stringify(messages, null, 2));
          } else {
            await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf-8');
          }
          console.log(`[Archiver/Alba] Updated: aiMemo=${!!aiMemo}, tags=${tags.length}`);
        }
      } catch (error) {
        console.error('[Archiver/Alba] Work failed:', error.message);
      }
    });
  }
}

// 싱글톤 인스턴스
let archiverInstance = null;

/**
 * Archiver 싱글톤 가져오기
 * DB 설정에서 storageType을 확인하여 FTP 또는 로컬 사용
 * @param {string} basePath - 로컬 경로 (storageType이 local일 때만 사용)
 */
async function getArchiverAsync() {
  if (archiverInstance) {
    console.log(`[Archiver] Returning existing instance, useFTP: ${archiverInstance.useFTP}`);
    return archiverInstance;
  }

  console.log('[Archiver] Creating new instance...');
  // DB에서 설정 읽기
  const configManager = require('./config');
  const memoryConfig = await configManager.getMemoryConfig();

  if (memoryConfig?.storageType === 'notion' && memoryConfig?.notion) {
    // Notion 저장소 사용
    const notionConfig = memoryConfig.notion;
    const notionStorage = new NotionStorage({
      token: notionConfig.token,
      databaseId: notionConfig.databaseId
    });

    archiverInstance = new ConversationArchiver(null, {
      useNotion: true,
      notionStorage
    });
    console.log(`[Archiver] Using Notion storage: ${notionConfig.databaseId}`);
  } else if (memoryConfig?.storageType === 'ftp' && memoryConfig?.ftp) {
    // FTP 저장소 사용
    const ftpConfig = memoryConfig.ftp;
    const ftpStorage = new FTPStorage({
      host: ftpConfig.host,
      port: ftpConfig.port || 21,
      user: ftpConfig.user,
      password: ftpConfig.password,
      basePath: ftpConfig.basePath,
      secure: ftpConfig.secure || false
    });

    archiverInstance = new ConversationArchiver(null, {
      useFTP: true,
      ftpStorage
    });
    console.log(`[Archiver] Using FTP storage: ${ftpConfig.host}/${ftpConfig.basePath}`);
  } else if (memoryConfig?.storagePath) {
    // 로컬 저장소 사용
    archiverInstance = new ConversationArchiver(memoryConfig.storagePath);
    console.log(`[Archiver] Using local storage: ${memoryConfig.storagePath}`);
  } else {
    throw new Error('[Archiver] No storage configured. Set memory.storagePath or memory.ftp in settings.');
  }

  return archiverInstance;
}

/**
 * 동기 버전 (이미 초기화된 경우에만 사용)
 * 새 인스턴스 생성 시에는 getArchiverAsync 사용 권장
 */
function getArchiver(basePath) {
  if (archiverInstance) {
    return archiverInstance;
  }
  // basePath가 주어지면 로컬로 생성 (레거시 호환)
  if (basePath) {
    archiverInstance = new ConversationArchiver(basePath);
    return archiverInstance;
  }
  throw new Error('[Archiver] Use getArchiverAsync() for first initialization');
}

function resetArchiver() {
  archiverInstance = null;
}

/**
 * 수동 동기화 트리거 (API용)
 */
async function triggerSync() {
  if (archiverInstance) {
    await archiverInstance._syncCacheToRemote();
    return { success: true, message: 'Sync triggered' };
  }
  return { success: false, message: 'No archiver instance' };
}

/**
 * 캐시 상태 확인
 */
function getCacheStatus() {
  if (!archiverInstance) {
    return { hasPendingData: false, files: [], error: 'No archiver instance' };
  }
  try {
    const cachePath = archiverInstance.cachePath;
    if (!fsSync.existsSync(cachePath)) {
      return { hasPendingData: false, files: [] };
    }
    const files = fsSync.readdirSync(cachePath).filter(f => f.endsWith('.json'));
    return {
      hasPendingData: files.length > 0,
      files,
      cacheDir: cachePath
    };
  } catch (e) {
    return { hasPendingData: false, files: [], error: e.message };
  }
}

module.exports = {
  ConversationArchiver,
  getArchiver,
  getArchiverAsync,
  resetArchiver,
  triggerSync,
  getCacheStatus
};
