/**
 * memory-layers.js
 * 메모리 계층 시스템
 *
 * Phase 5.4.4: 메모리 계층 통합
 *
 * 메모리 흐름:
 * 단기 (50개) → 중기 (요약) → 장기 (아카이브)
 *     ↓            ↓             ↓
 *   즉시참조      세션복원       검색
 */

const path = require('path');
const fs = require('fs').promises;
const { FTPStorage } = require('./ftp-storage');

// 메모리 스토리지 설정 캐시 (DB 설정에서 가져옴)
let MEMORY_STORAGE_CONFIG = null;
let MEMORY_STORAGE_PATH = null;
let FTP_STORAGE_INSTANCE = null;

/**
 * DB에서 메모리 설정 가져오기
 */
async function getMemoryStorageConfig() {
  if (MEMORY_STORAGE_CONFIG) {
    return MEMORY_STORAGE_CONFIG;
  }

  try {
    const configManager = require('./config');
    const memoryConfig = await configManager.getMemoryConfig();
    MEMORY_STORAGE_CONFIG = memoryConfig;

    // FTP 설정이 있으면 FTP 인스턴스 생성
    if (memoryConfig?.storageType === 'ftp' && memoryConfig?.ftp) {
      FTP_STORAGE_INSTANCE = new FTPStorage({
        host: memoryConfig.ftp.host,
        port: memoryConfig.ftp.port || 21,
        user: memoryConfig.ftp.user,
        password: memoryConfig.ftp.password,
        basePath: memoryConfig.ftp.basePath,
        secure: memoryConfig.ftp.secure || false
      });
      console.log(`[MemoryLayers] Using FTP storage: ${memoryConfig.ftp.host}/${memoryConfig.ftp.basePath}`);
    } else if (memoryConfig?.storagePath) {
      MEMORY_STORAGE_PATH = memoryConfig.storagePath;
      console.log(`[MemoryLayers] Using local storage: ${memoryConfig.storagePath}`);
    }

    return MEMORY_STORAGE_CONFIG;
  } catch (e) {
    console.error('[MemoryLayers] Failed to get storage config from DB:', e.message);
    throw e;
  }
}

/**
 * FTP 저장소 인스턴스 가져오기 (없으면 null)
 */
async function getFTPStorageInstance() {
  if (!MEMORY_STORAGE_CONFIG) {
    await getMemoryStorageConfig();
  }
  return FTP_STORAGE_INSTANCE;
}

/**
 * 로컬 저장소 경로 가져오기 (FTP 사용 시 null)
 */
async function getMemoryStoragePath() {
  if (!MEMORY_STORAGE_CONFIG) {
    await getMemoryStorageConfig();
  }

  if (FTP_STORAGE_INSTANCE) {
    // FTP 사용 중이면 null 반환 (로컬 경로 불필요)
    return null;
  }

  if (MEMORY_STORAGE_PATH) {
    return MEMORY_STORAGE_PATH;
  }

  throw new Error('[MemoryLayers] memory.storagePath not configured. Please set it in Settings > Storage.');
}

/**
 * 스토리지 타입 확인
 */
async function isUsingFTP() {
  if (!MEMORY_STORAGE_CONFIG) {
    await getMemoryStorageConfig();
  }
  return MEMORY_STORAGE_CONFIG?.storageType === 'ftp' && !!FTP_STORAGE_INSTANCE;
}

/**
 * 단기 메모리 (Short-Term Memory)
 * - 최근 50개 메시지 유지
 * - 즉시 참조 가능
 * - MongoDB 영속 저장 + 인메모리 캐시
 */
class ShortTermMemory {
  constructor(maxMessages = 50) {
    this.maxMessages = maxMessages;
    this.messages = []; // { role, content, timestamp, tokens }
    this.totalTokens = 0;
    this.sessionId = 'main-conversation';
    this.initialized = false;
  }

  /**
   * JSON 아카이브에서 메시지 로드 (초기화)
   */
  async initialize(sessionId = 'main-conversation') {
    this.sessionId = sessionId;
    try {
      // JSON 아카이브에서 메시지 로드 (DB 설정 기반 - FTP 또는 로컬)
      const { getArchiverAsync } = require('./conversation-archiver');
      const archiver = await getArchiverAsync();
      await archiver.initialize();

      // maxMessages 설정 사용 (UI에서 설정한 단기 메모리 크기)
      const messages = await archiver.getRecentMessages(this.maxMessages);

      this.messages = messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        tokens: m.tokens || this._estimateTokens(m.content),
        // 메타데이터도 포함 (timestamp 정보용)
        meta: m.meta
      }));
      this.totalTokens = this.messages.reduce((sum, m) => sum + m.tokens, 0);
      this.initialized = true;

      // 로드된 메시지 timestamp 확인 로그
      if (this.messages.length > 0) {
        const first = this.messages[0];
        const last = this.messages[this.messages.length - 1];
        console.log(`[ShortTermMemory] Loaded ${this.messages.length} messages (${this.totalTokens} tokens)`);
        console.log(`[ShortTermMemory] Time range: ${first.timestamp} ~ ${last.timestamp}`);
      } else {
        console.log(`[ShortTermMemory] No messages loaded`);
      }
    } catch (error) {
      console.error('[ShortTermMemory] Failed to load from archive:', error.message);
      this.initialized = true;
    }
  }

  /**
   * 메시지 추가 (MongoDB + 벡터 스토어에도 저장)
   */
  add(message) {
    const messageWithMeta = {
      ...message,
      timestamp: message.timestamp || new Date(),
      tokens: message.tokens || this._estimateTokens(message.content)
    };

    this.messages.push(messageWithMeta);
    this.totalTokens += messageWithMeta.tokens;

    // MongoDB에 비동기 저장
    this._saveToDb(messageWithMeta).catch(err => {
      console.error('[ShortTermMemory] Failed to save to DB:', err.message);
    });
    
    // 벡터 스토어에 비동기 저장
    this._saveToVectorStore(messageWithMeta).catch(err => {
      console.error('[ShortTermMemory] Failed to save to vector store:', err.message);
    });

    // 최대 개수 초과 시 오래된 메시지 제거
    if (this.messages.length > this.maxMessages) {
      const removed = this.messages.shift();
      this.totalTokens -= removed.tokens;
    }

    return messageWithMeta;
  }

  /**
   * DB 저장 (비활성화 - conversation-archiver.js로 통일)
   * archiver가 JSON 아카이브에 저장하므로 여기선 스킵
   */
  async _saveToDb(message) {
    // conversation-archiver.js가 JSON 아카이브에 저장하므로 중복 저장 제거
    // console.log('[ShortTermMemory] Skipping _saveToDb (using archiver instead)');
  }
  
  /**
   * 벡터 스토어에 저장 (의미적 검색용)
   */
  async _saveToVectorStore(message) {
    try {
      const vectorStore = require('./vector-store');
      const id = `${new Date(message.timestamp).toISOString().replace(/[:.]/g, '-')}_${message.role}`;
      await vectorStore.addMessage({
        id,
        text: message.content,
        role: message.role,
        timestamp: message.timestamp,
        tags: message.tags
      });
    } catch (error) {
      // 벡터 저장 실패해도 대화는 계속
      console.warn('[ShortTermMemory] Vector store save failed:', error.message);
    }
  }

  /**
   * 최근 N개 메시지 가져오기
   */
  getRecent(count = 10) {
    return this.messages.slice(-count);
  }

  /**
   * 모든 메시지 가져오기
   */
  getAll() {
    return [...this.messages];
  }

  /**
   * 토큰 제한 내 메시지 가져오기 (역순)
   */
  getWithinTokenLimit(maxTokens) {
    const result = [];
    let tokenCount = 0;

    // 최신 메시지부터 역순으로
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (tokenCount + msg.tokens > maxTokens) {
        break;
      }
      result.unshift(msg);
      tokenCount += msg.tokens;
    }

    return { messages: result, totalTokens: tokenCount };
  }

  /**
   * 특정 역할의 메시지만 가져오기
   */
  getByRole(role) {
    return this.messages.filter(m => m.role === role);
  }

  /**
   * 메모리 클리어 (MongoDB도 삭제)
   */
  async clear() {
    this.messages = [];
    this.totalTokens = 0;

    // MongoDB에서도 삭제
    try {
      const Message = require('../models/Message');
      await Message.clearSession(this.sessionId);
      console.log(`[ShortTermMemory] Cleared messages from DB for session: ${this.sessionId}`);
    } catch (error) {
      console.error('[ShortTermMemory] Failed to clear DB:', error.message);
    }
  }

  /**
   * 통계
   */
  getStats() {
    return {
      count: this.messages.length,
      totalTokens: this.totalTokens,
      averageTokens: this.messages.length > 0 ? this.totalTokens / this.messages.length : 0,
      oldest: this.messages[0]?.timestamp,
      newest: this.messages[this.messages.length - 1]?.timestamp
    };
  }

  /**
   * 토큰 추정 (간단한 방식)
   */
  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}

/**
 * 중기 메모리 (Middle-Term Memory)
 * - 세션 요약 저장
 * - 대화 재개 시 사용
 * - 파일 시스템 또는 FTP 저장
 */
class MiddleTermMemory {
  constructor(memoryPath) {
    this.memoryPath = memoryPath || path.join(process.cwd(), 'memory', 'sessions');
    this.storagePath = null; // initialize()에서 설정
    this.currentSession = null;
    this.sessionSummaries = new Map(); // sessionId -> summary
    this.useFTP = false;
    this.ftpStorage = null;
  }

  /**
   * 초기화
   */
  async initialize() {
    try {
      // DB 설정 확인
      this.useFTP = await isUsingFTP();
      if (this.useFTP) {
        this.ftpStorage = await getFTPStorageInstance();
        this.memoryPath = 'sessions'; // FTP 경로
        console.log('[MiddleTermMemory] Initialized with FTP storage');
      } else {
        this.storagePath = await getMemoryStoragePath();
        this.memoryPath = path.join(this.storagePath, 'sessions');
        await fs.mkdir(this.memoryPath, { recursive: true });
        console.log(`[MiddleTermMemory] Initialized at ${this.memoryPath}`);
      }
    } catch (error) {
      console.error('Error initializing middle-term memory:', error);
    }
  }

  /**
   * 세션 요약 저장
   */
  async saveSessionSummary(sessionId, summary) {
    try {
      const sessionData = {
        sessionId,
        summary,
        savedAt: new Date(),
        messageCount: summary.messageCount || 0,
        keywords: summary.keywords || [],
        decisions: summary.decisions || [],
        todos: summary.todos || [],
        topics: summary.topics || []
      };

      if (this.useFTP) {
        const filePath = `${this.memoryPath}/${sessionId}.json`;
        await this.ftpStorage.writeFile(filePath, JSON.stringify(sessionData, null, 2));
      } else {
        const sessionFile = path.join(this.memoryPath, `${sessionId}.json`);
        await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
      }

      this.sessionSummaries.set(sessionId, sessionData);
      return sessionData;
    } catch (error) {
      console.error('Error saving session summary:', error);
      throw error;
    }
  }

  /**
   * 세션 요약 로드
   */
  async loadSessionSummary(sessionId) {
    try {
      // 캐시 확인
      if (this.sessionSummaries.has(sessionId)) {
        return this.sessionSummaries.get(sessionId);
      }

      let content;
      if (this.useFTP) {
        const filePath = `${this.memoryPath}/${sessionId}.json`;
        content = await this.ftpStorage.readFile(filePath);
        if (!content) return null;
      } else {
        const sessionFile = path.join(this.memoryPath, `${sessionId}.json`);
        content = await fs.readFile(sessionFile, 'utf-8');
      }

      const sessionData = JSON.parse(content);
      this.sessionSummaries.set(sessionId, sessionData);
      return sessionData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // 세션 없음
      }
      console.error('Error loading session summary:', error);
      throw error;
    }
  }

  /**
   * 최근 세션 목록
   */
  async getRecentSessions(limit = 10) {
    try {
      const sessions = [];

      if (this.useFTP) {
        const files = await this.ftpStorage.listFiles(this.memoryPath);
        for (const file of files) {
          if (file.type !== 'file' || !file.name.endsWith('.json')) continue;
          const filePath = `${this.memoryPath}/${file.name}`;
          const content = await this.ftpStorage.readFile(filePath);
          if (content) {
            const data = JSON.parse(content);
            sessions.push({
              ...data,
              modifiedAt: file.modifiedAt || new Date()
            });
          }
        }
      } else {
        const files = await fs.readdir(this.memoryPath);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const filePath = path.join(this.memoryPath, file);
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          sessions.push({
            ...data,
            modifiedAt: stats.mtime
          });
        }
      }

      // 수정 시간 기준 정렬
      sessions.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

      return sessions.slice(0, limit);
    } catch (error) {
      console.error('Error getting recent sessions:', error);
      return [];
    }
  }

  /**
   * 세션 삭제
   */
  async deleteSession(sessionId) {
    try {
      if (this.useFTP) {
        // FTP는 delete 메서드가 없으므로 스킵 (또는 추후 구현)
        console.warn('[MiddleTermMemory] FTP delete not implemented');
      } else {
        const sessionFile = path.join(this.memoryPath, `${sessionId}.json`);
        await fs.unlink(sessionFile);
      }
      this.sessionSummaries.delete(sessionId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  /**
   * 통계
   */
  async getStats() {
    try {
      let sessionCount = 0;
      if (this.useFTP) {
        const files = await this.ftpStorage.listFiles(this.memoryPath);
        sessionCount = files.filter(f => f.type === 'file' && f.name.endsWith('.json')).length;
      } else {
        const files = await fs.readdir(this.memoryPath);
        sessionCount = files.filter(f => f.endsWith('.json')).length;
      }

      return {
        sessionCount,
        cachedCount: this.sessionSummaries.size
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { sessionCount: 0, cachedCount: 0 };
    }
  }

  // ==================== 주간 요약 ====================

  /**
   * 주간 요약 경로 생성
   */
  _getWeeklySummaryPath(year, month, weekNum) {
    const monthStr = String(month).padStart(2, '0');
    if (this.useFTP) {
      const dir = `summaries/${year}-${monthStr}`;
      return {
        dir,
        file: `${dir}/week-${weekNum}.json`
      };
    } else {
      const basePath = this.storagePath || MEMORY_STORAGE_PATH;
      const dir = path.join(basePath, 'summaries', `${year}-${monthStr}`);
      return {
        dir,
        file: path.join(dir, `week-${weekNum}.json`)
      };
    }
  }

  /**
   * 주간 요약 저장
   */
  async saveWeeklySummary(year, month, weekNum, summaryData) {
    try {
      const { dir, file } = this._getWeeklySummaryPath(year, month, weekNum);

      const data = {
        year,
        month,
        weekNum,
        summary: summaryData.summary || '',
        highlights: summaryData.highlights || [],
        topics: summaryData.topics || [],
        emotions: summaryData.emotions || [],
        messageCount: summaryData.messageCount || 0,
        createdAt: new Date()
      };

      if (this.useFTP) {
        await this.ftpStorage.writeFile(file, JSON.stringify(data, null, 2));
      } else {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, JSON.stringify(data, null, 2));
      }

      console.log(`[WeeklySummary] Saved: ${year}-${month} week ${weekNum}`);
      return data;
    } catch (error) {
      console.error('[WeeklySummary] Save error:', error);
      throw error;
    }
  }

  /**
   * 주간 요약 로드
   */
  async loadWeeklySummary(year, month, weekNum) {
    try {
      const { file } = this._getWeeklySummaryPath(year, month, weekNum);
      let content;
      if (this.useFTP) {
        content = await this.ftpStorage.readFile(file);
        if (!content) return null;
      } else {
        content = await fs.readFile(file, 'utf-8');
      }
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      console.error('[WeeklySummary] Load error:', error);
      return null;
    }
  }

  /**
   * 최근 주간 요약 목록 (컨텍스트 주입용)
   */
  async getRecentWeeklySummaries(count = 4) {
    try {
      const allSummaries = [];

      if (this.useFTP) {
        // FTP에서 summaries 폴더 목록 가져오기
        const monthDirs = await this.ftpStorage.listFiles('summaries');
        for (const monthDir of monthDirs.sort((a, b) => b.name.localeCompare(a.name))) {
          if (monthDir.type !== 'directory' || !monthDir.name.match(/^\d{4}-\d{2}$/)) continue;

          const files = await this.ftpStorage.listFiles(`summaries/${monthDir.name}`);
          for (const file of files.sort((a, b) => b.name.localeCompare(a.name))) {
            if (file.type !== 'file' || !file.name.endsWith('.json') || file.name.startsWith('._')) continue;

            const content = await this.ftpStorage.readFile(`summaries/${monthDir.name}/${file.name}`);
            if (content) {
              allSummaries.push(JSON.parse(content));
            }

            if (allSummaries.length >= count) break;
          }

          if (allSummaries.length >= count) break;
        }
      } else {
        const basePath = this.storagePath || MEMORY_STORAGE_PATH;
        const summariesRoot = path.join(basePath, 'summaries');

        // 폴더가 없으면 빈 배열 반환
        try {
          await fs.access(summariesRoot);
        } catch {
          return [];
        }

        const monthDirs = await fs.readdir(summariesRoot);

        // 모든 월 폴더 순회
        for (const monthDir of monthDirs.sort().reverse()) {
          if (!monthDir.match(/^\d{4}-\d{2}$/)) continue;

          const monthPath = path.join(summariesRoot, monthDir);
          const files = await fs.readdir(monthPath);

          for (const file of files.sort().reverse()) {
            // .json으로 끝나고, ._로 시작하지 않는 파일만 (macOS 메타데이터 제외)
            if (!file.endsWith('.json') || file.startsWith('._')) continue;

            const content = await fs.readFile(path.join(monthPath, file), 'utf-8');
            allSummaries.push(JSON.parse(content));

            if (allSummaries.length >= count) break;
          }

          if (allSummaries.length >= count) break;
        }
      }

      return allSummaries;
    } catch (error) {
      console.error('[WeeklySummary] getRecent error:', error);
      return [];
    }
  }

  /**
   * 주간 요약 생성 (배치 API 또는 실시간)
   * @param {Array} messages - 해당 주의 메시지 배열
   * @param {Object} weekInfo - { year, month, weekNum }
   * @param {Object} options - { useBatch: true (기본값) }
   */
  async generateWeeklySummary(messages, weekInfo, options = {}) {
    if (!messages || messages.length === 0) {
      return null;
    }

    const useBatch = options.useBatch !== false; // 기본적으로 배치 사용

    try {
      // 배치 처리 시도 (Claude 전용, 50% 비용 절감)
      if (useBatch) {
        const { getBatchProcessor } = require('./batch-processor');
        const batchProcessor = getBatchProcessor();

        const self = this; // 클로저용
        const requestId = batchProcessor.addRequest(
          'weekly_summary',
          { messages, weekInfo },
          async (result) => {
            // 배치 완료 시 콜백
            if (result.success && result.data) {
              const parsed = result.data;
              parsed.messageCount = messages.length;
              await self.saveWeeklySummary(weekInfo.year, weekInfo.month, weekInfo.weekNum, parsed);
              console.log(`[WeeklySummary] Batch completed: ${weekInfo.year}-${weekInfo.month} week ${weekInfo.weekNum}`);
            }
          }
        );

        // 배치 성공 (Claude 사용 중)
        if (requestId) {
          console.log(`[WeeklySummary] Queued for batch: ${requestId}`);
          return { queued: true, requestId };
        }
        // requestId가 null이면 배치 불가 → 아래 실시간 처리로 폴백
        console.log('[WeeklySummary] Batch unavailable, falling back to realtime');
      }

      // 실시간 처리 (폴백 또는 긴급한 경우)
      const { getAlbaWorker } = require('./alba-worker');
      const alba = await getAlbaWorker();

      const prompt = `다음은 일주일간의 대화 내용입니다. 주간 요약을 작성해주세요.

대화 내용:
${messages.map(m => `[${m.role}] ${m.content}`).join('\n').substring(0, 3000)}

다음 JSON 형식으로 응답하세요:
{
  "summary": "한 문단으로 된 주간 요약",
  "highlights": ["중요한 이벤트나 결정 1", "2", "3"],
  "topics": ["주요 화제 1", "2"],
  "emotions": ["전반적인 감정 톤"]
}`;

      const result = await alba._callAI(
        '대화 내용을 분석하여 주간 요약을 생성하는 AI입니다. JSON 형식으로만 응답하세요.',
        prompt
      );

      if (!result) return null;

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      parsed.messageCount = messages.length;

      await this.saveWeeklySummary(weekInfo.year, weekInfo.month, weekInfo.weekNum, parsed);

      return parsed;
    } catch (error) {
      console.error('[WeeklySummary] Generate error:', error);
      return null;
    }
  }

  /**
   * 주간 요약 자동 생성 체크 및 트리거
   * 조건: 마지막 요약 후 7일 경과 OR 100개 메시지
   * @param {Array} recentMessages - 최근 메시지 배열 (외부에서 전달)
   */
  async checkAndTriggerWeeklySummary(recentMessages = []) {
    try {
      const recentSummaries = await this.getRecentWeeklySummaries(1);
      const lastSummary = recentSummaries[0];
      
      const now = new Date();
      const currentWeek = this._getWeekNumber(now);
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // 조건 1: 마지막 요약이 없거나 7일 이상 경과
      let shouldGenerate = false;
      let reason = '';

      if (!lastSummary) {
        // 첫 요약 - 최소 20개 메시지 있어야 생성
        if (recentMessages.length >= 20) {
          shouldGenerate = true;
          reason = 'first_summary';
        }
      } else {
        // 같은 주면 스킵
        if (lastSummary.year === currentYear && 
            lastSummary.month === currentMonth && 
            lastSummary.weekNum === currentWeek) {
          return { triggered: false, reason: 'same_week' };
        }

        // 마지막 요약 이후 경과 확인
        const lastDate = new Date(lastSummary.createdAt);
        const daysSinceLastSummary = (now - lastDate) / (1000 * 60 * 60 * 24);

        if (daysSinceLastSummary >= 7) {
          shouldGenerate = true;
          reason = 'days_elapsed';
        } else if (recentMessages.length >= 100) {
          shouldGenerate = true;
          reason = 'message_count';
        }
      }

      if (!shouldGenerate) {
        return { triggered: false, reason: 'conditions_not_met' };
      }

      if (recentMessages.length < 10) {
        return { triggered: false, reason: 'insufficient_messages' };
      }

      // 비동기로 생성 (응답 지연 없음)
      console.log(`[WeeklySummary] Auto-trigger: ${reason}`);

      // 백그라운드 생성 (await 없음)
      this.generateWeeklySummary(recentMessages, {
        year: currentYear,
        month: currentMonth,
        weekNum: currentWeek
      }).then(result => {
        if (result) {
          console.log(`[WeeklySummary] Generated: ${currentYear}-${currentMonth} week ${currentWeek}`);
        }
      }).catch(err => {
        console.error('[WeeklySummary] Background generation error:', err);
      });

      return { triggered: true, reason };
    } catch (error) {
      console.error('[WeeklySummary] Check trigger error:', error);
      return { triggered: false, reason: 'error', error: error.message };
    }
  }

  /**
   * 주차 번호 계산
   */
  _getWeekNumber(date) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return Math.ceil((date.getDate() + firstDay.getDay()) / 7);
  }
}

/**
 * 장기 메모리 (Long-Term Memory)
 * - 아카이브된 원본 대화 (평생 보관)
 * - 파일 시스템 또는 FTP 저장
 * - AI 생성 태그로 검색 가능
 *
 * 저장 구조:
 * /memory/archives/YYYY/MM/conv-{timestamp}.json
 * /memory/archives/index.json (검색용 메타데이터)
 */
class LongTermMemory {
  constructor() {
    this.storagePath = null; // initialize()에서 설정
    this.archivesPath = null;
    this.indexPath = null;
    this.index = null; // 메모리 캐시
    this.useFTP = false;
    this.ftpStorage = null;
  }

  /**
   * 초기화 - 인덱스 로드
   */
  async initialize() {
    try {
      // DB 설정 확인
      this.useFTP = await isUsingFTP();
      if (this.useFTP) {
        this.ftpStorage = await getFTPStorageInstance();
        this.archivesPath = 'archives';
        this.indexPath = 'archives/index.json';
      } else {
        this.storagePath = await getMemoryStoragePath();
        this.archivesPath = path.join(this.storagePath, 'archives');
        this.indexPath = path.join(this.archivesPath, 'index.json');
        await fs.mkdir(this.archivesPath, { recursive: true });
      }

      // 인덱스 로드
      try {
        let content;
        if (this.useFTP) {
          content = await this.ftpStorage.readFile(this.indexPath);
        } else {
          content = await fs.readFile(this.indexPath, 'utf-8');
        }
        this.index = content ? JSON.parse(content) : { entries: [], lastUpdated: null };
      } catch {
        // 인덱스 없으면 새로 생성
        this.index = { entries: [], lastUpdated: null };
        await this._saveIndex();
      }

      console.log(`[LongTermMemory] Loaded ${this.index.entries.length} archive entries (FTP: ${this.useFTP})`);
    } catch (error) {
      console.error('Error initializing long-term memory:', error);
      this.index = { entries: [], lastUpdated: null };
    }
  }

  /**
   * 인덱스 저장
   */
  async _saveIndex() {
    this.index.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(this.index, null, 2);
    if (this.useFTP) {
      await this.ftpStorage.writeFile(this.indexPath, content);
    } else {
      await fs.writeFile(this.indexPath, content);
    }
  }

  /**
   * 아카이브 파일 경로 생성
   */
  _getArchivePath(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const timestamp = d.getTime();

    if (this.useFTP) {
      return {
        dir: `${this.archivesPath}/${year}/${month}`,
        file: `${this.archivesPath}/${year}/${month}/conv-${timestamp}.json`
      };
    } else {
      return {
        dir: path.join(this.archivesPath, String(year), month),
        file: path.join(this.archivesPath, String(year), month, `conv-${timestamp}.json`)
      };
    }
  }

  /**
   * 대화 아카이브 (원본 저장 + 배치로 메타데이터 생성)
   * @param {Object} options - { useBatch: true (기본값) }
   */
  async archive(conversationId, messages, metadata = {}, options = {}) {
    try {
      const now = new Date();
      const { dir, file } = this._getArchivePath(now);
      const useBatch = options.useBatch !== false;

      if (!this.useFTP) {
        await fs.mkdir(dir, { recursive: true });
      }

      const archiveData = {
        id: `${now.getTime()}-${conversationId}`,
        conversationId,
        messages,
        messageCount: messages.length,
        archivedAt: now.toISOString(),
        // 메타데이터 (AI가 생성한 태그 등)
        tags: metadata.tags || [],
        topics: metadata.topics || [],
        category: metadata.category || 'general',
        summary: metadata.summary || '',
        importance: metadata.importance || 5
      };

      // 원본 파일 저장 (즉시)
      if (this.useFTP) {
        await this.ftpStorage.writeFile(file, JSON.stringify(archiveData, null, 2));
      } else {
        await fs.writeFile(file, JSON.stringify(archiveData, null, 2));
      }

      // 인덱스에 메타데이터만 추가 (검색용)
      this.index.entries.push({
        id: archiveData.id,
        filePath: file,
        archivedAt: archiveData.archivedAt,
        tags: archiveData.tags,
        topics: archiveData.topics,
        category: archiveData.category,
        summary: archiveData.summary,
        importance: archiveData.importance,
        messageCount: archiveData.messageCount
      });

      await this._saveIndex();

      // 배치로 메타데이터 보강 (Claude 전용, 요약/태그 생성)
      if (useBatch && (!metadata.summary || metadata.tags?.length === 0)) {
        const { getBatchProcessor } = require('./batch-processor');
        const batchProcessor = getBatchProcessor();
        const self = this;

        const requestId = batchProcessor.addRequest(
          'archive_compress',
          { messages, metadata: { archiveId: archiveData.id } },
          async (result) => {
            if (result.success && result.data) {
              // 인덱스 업데이트
              const entry = self.index.entries.find(e => e.id === archiveData.id);
              if (entry) {
                entry.summary = result.data.summary || entry.summary;
                entry.tags = result.data.tags || entry.tags;
                entry.importance = result.data.importance || entry.importance;
                await self._saveIndex();
                console.log(`[LongTermMemory] Batch metadata updated: ${archiveData.id}`);
              }
            }
          }
        );

        // requestId가 null이면 배치 불가 (Gemini 등) → 메타데이터 없이 진행
        if (!requestId) {
          console.log('[LongTermMemory] Batch unavailable, archiving without AI metadata');
        }
      }

      console.log(`[LongTermMemory] Archived: ${archiveData.id}`);
      return archiveData;
    } catch (error) {
      console.error('Error archiving conversation:', error);
      throw error;
    }
  }

  /**
   * 검색 (인덱스 기반)
   */
  async search(query, options = {}) {
    try {
      if (!this.index) return [];
      
      const {
        limit = 10,
        tags,
        category,
        startDate,
        endDate,
        minImportance
      } = options;
      
      let results = [...this.index.entries];
      
      // 태그 필터
      if (tags && tags.length > 0) {
        results = results.filter(e => 
          tags.every(tag => e.tags?.includes(tag))
        );
      }
      
      // 카테고리 필터
      if (category) {
        results = results.filter(e => e.category === category);
      }
      
      // 날짜 범위
      if (startDate) {
        const start = new Date(startDate);
        results = results.filter(e => new Date(e.archivedAt) >= start);
      }
      if (endDate) {
        const end = new Date(endDate);
        results = results.filter(e => new Date(e.archivedAt) <= end);
      }
      
      // 중요도 필터
      if (minImportance !== undefined) {
        results = results.filter(e => (e.importance || 0) >= minImportance);
      }
      
      // 텍스트 검색 (태그, 주제, 요약)
      if (query) {
        const q = query.toLowerCase();
        results = results.filter(e => 
          e.tags?.some(t => t.toLowerCase().includes(q)) ||
          e.topics?.some(t => t.toLowerCase().includes(q)) ||
          e.summary?.toLowerCase().includes(q) ||
          e.category?.toLowerCase().includes(q)
        );
      }
      
      // 최신순 정렬 + 제한
      return results
        .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt))
        .slice(0, limit);
    } catch (error) {
      console.error('Error searching long-term memory:', error);
      return [];
    }
  }

  /**
   * ID로 원본 대화 로드
   */
  async getById(id) {
    try {
      const entry = this.index?.entries.find(e => e.id === id);
      if (!entry) return null;

      let content;
      if (this.useFTP) {
        content = await this.ftpStorage.readFile(entry.filePath);
      } else {
        content = await fs.readFile(entry.filePath, 'utf-8');
      }
      return content ? JSON.parse(content) : null;
    } catch (error) {
      console.error('Error getting archive by id:', error);
      return null;
    }
  }

  /**
   * 통계
   */
  async getStats() {
    return {
      totalCount: this.index?.entries.length || 0,
      totalMessages: this.index?.entries.reduce((sum, e) => sum + (e.messageCount || 0), 0) || 0
    };
  }
}

/**
 * 문서 스토리지 (Document Storage)
 * - OCR 스캔, 기록물 등 영구 보관 문서
 * - 파일 시스템 또는 FTP 저장
 * - AI 태그로 검색 가능
 *
 * 저장 구조:
 * /memory/documents/{category}/{filename}
 * /memory/documents/index.json
 */
class DocumentStorage {
  constructor() {
    this.storagePath = null; // initialize()에서 설정
    this.documentsPath = null;
    this.indexPath = null;
    this.index = null;
    this.useFTP = false;
    this.ftpStorage = null;
  }

  async initialize() {
    try {
      // DB 설정 확인
      this.useFTP = await isUsingFTP();
      if (this.useFTP) {
        this.ftpStorage = await getFTPStorageInstance();
        this.documentsPath = 'documents';
        this.indexPath = 'documents/index.json';
      } else {
        this.storagePath = await getMemoryStoragePath();
        this.documentsPath = path.join(this.storagePath, 'documents');
        this.indexPath = path.join(this.documentsPath, 'index.json');
        await fs.mkdir(this.documentsPath, { recursive: true });
      }

      // 인덱스 로드
      try {
        let content;
        if (this.useFTP) {
          content = await this.ftpStorage.readFile(this.indexPath);
        } else {
          content = await fs.readFile(this.indexPath, 'utf-8');
        }
        this.index = content ? JSON.parse(content) : { documents: [], lastUpdated: null };
      } catch {
        this.index = { documents: [], lastUpdated: null };
        await this._saveIndex();
      }

      console.log(`[DocumentStorage] Loaded ${this.index.documents.length} documents (FTP: ${this.useFTP})`);
    } catch (error) {
      console.error('Error initializing document storage:', error);
      this.index = { documents: [], lastUpdated: null };
    }
  }

  async _saveIndex() {
    this.index.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(this.index, null, 2);
    if (this.useFTP) {
      await this.ftpStorage.writeFile(this.indexPath, content);
    } else {
      await fs.writeFile(this.indexPath, content);
    }
  }

  /**
   * 문서 저장
   * @param {string} filename - 파일명
   * @param {Buffer|string} content - 파일 내용
   * @param {Object} metadata - { category, tags, ocrText, description }
   */
  async save(filename, content, metadata = {}) {
    try {
      const category = metadata.category || 'general';
      let filePath;

      if (this.useFTP) {
        filePath = `${this.documentsPath}/${category}/${filename}`;
        await this.ftpStorage.writeFile(filePath, content);
      } else {
        const categoryPath = path.join(this.documentsPath, category);
        await fs.mkdir(categoryPath, { recursive: true });
        filePath = path.join(categoryPath, filename);
        await fs.writeFile(filePath, content);
      }

      const doc = {
        id: `${Date.now()}-${filename}`,
        filename,
        filePath,
        category,
        tags: metadata.tags || [],
        ocrText: metadata.ocrText || '',
        description: metadata.description || '',
        createdAt: new Date().toISOString(),
        size: Buffer.byteLength(content)
      };

      this.index.documents.push(doc);
      await this._saveIndex();

      console.log(`[DocumentStorage] Saved: ${filename}`);
      return doc;
    } catch (error) {
      console.error('Error saving document:', error);
      throw error;
    }
  }

  /**
   * 문서 검색
   */
  async search(query, options = {}) {
    if (!this.index) return [];
    
    const { category, tags, limit = 10 } = options;
    let results = [...this.index.documents];
    
    if (category) {
      results = results.filter(d => d.category === category);
    }
    
    if (tags && tags.length > 0) {
      results = results.filter(d => 
        tags.every(tag => d.tags?.includes(tag))
      );
    }
    
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(d =>
        d.filename.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        d.ocrText?.toLowerCase().includes(q) ||
        d.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    
    return results.slice(0, limit);
  }

  /**
   * 문서 읽기
   */
  async read(id) {
    const doc = this.index?.documents.find(d => d.id === id);
    if (!doc) return null;

    let content;
    if (this.useFTP) {
      content = await this.ftpStorage.readFile(doc.filePath);
    } else {
      content = await fs.readFile(doc.filePath);
    }
    return { ...doc, content };
  }

  /**
   * 카테고리 목록
   */
  getCategories() {
    if (!this.index) return [];
    return [...new Set(this.index.documents.map(d => d.category))];
  }

  /**
   * Claude Citations용 문서 형식으로 변환
   * @param {Array<string>} ids - 문서 ID 배열
   * @returns {Promise<Array>} Claude API documents 형식
   *
   * @example
   * const docs = await documentStorage.toClaudeDocuments(['doc-id-1', 'doc-id-2']);
   * const result = await aiService.chatWithDocuments('질문', docs);
   */
  async toClaudeDocuments(ids) {
    const documents = [];

    for (const id of ids) {
      const doc = await this.read(id);
      if (!doc) continue;

      // 텍스트 문서인 경우
      let textContent = '';
      if (doc.ocrText) {
        // OCR 텍스트가 있으면 사용
        textContent = doc.ocrText;
      } else if (Buffer.isBuffer(doc.content)) {
        // 바이너리면 텍스트로 변환 시도
        textContent = doc.content.toString('utf-8');
      } else if (typeof doc.content === 'string') {
        textContent = doc.content;
      }

      if (textContent) {
        documents.push({
          title: doc.filename || doc.description || `문서 ${doc.id}`,
          content: textContent,
          context: doc.description || `카테고리: ${doc.category}, 태그: ${(doc.tags || []).join(', ')}`
        });
      }
    }

    return documents;
  }

  /**
   * 검색 결과를 Claude Citations용 문서로 변환
   * @param {string} query - 검색어
   * @param {Object} options - 검색 옵션
   * @returns {Promise<Array>} Claude API documents 형식
   */
  async searchAsClaudeDocuments(query, options = {}) {
    const results = await this.search(query, options);
    const ids = results.map(r => r.id);
    return this.toClaudeDocuments(ids);
  }

  /**
   * PDF 파일 저장 및 Claude 형식 반환
   * PDF는 base64로 저장하고, Claude API에서 직접 사용 가능한 형식 반환
   *
   * @param {Buffer} pdfBuffer - PDF 파일 버퍼
   * @param {string} filename - 파일명
   * @param {Object} metadata - { category, tags, description }
   * @returns {Promise<{doc: Object, claudeDoc: Object}>}
   */
  async savePdf(pdfBuffer, filename, metadata = {}) {
    // 1. DocumentStorage에 저장
    const doc = await this.save(filename, pdfBuffer, {
      ...metadata,
      category: metadata.category || 'pdf'
    });

    // 2. Claude API용 형식 반환
    const claudeDoc = {
      type: 'pdf',
      title: filename,
      data: pdfBuffer.toString('base64'),
      context: metadata.description || `카테고리: ${metadata.category || 'pdf'}`
    };

    return { doc, claudeDoc };
  }

  /**
   * 저장된 PDF를 Claude API 형식으로 변환
   * @param {string} id - 문서 ID
   * @returns {Promise<Object|null>} Claude API document 형식
   */
  async getPdfAsClaudeDocument(id) {
    const doc = await this.read(id);
    if (!doc || !doc.filename.toLowerCase().endsWith('.pdf')) {
      return null;
    }

    return {
      type: 'pdf',
      title: doc.filename,
      data: Buffer.isBuffer(doc.content) ? doc.content.toString('base64') : doc.content,
      context: doc.description || `카테고리: ${doc.category}`
    };
  }

  /**
   * PDF 검색 결과를 Claude API 형식으로 변환
   * @param {string} query - 검색어
   * @param {Object} options - 검색 옵션
   * @returns {Promise<Array>} Claude API documents 형식 (PDF용)
   */
  async searchPdfsAsClaudeDocuments(query, options = {}) {
    const results = await this.search(query, { ...options, category: 'pdf' });
    const claudeDocs = [];

    for (const result of results) {
      const claudeDoc = await this.getPdfAsClaudeDocument(result.id);
      if (claudeDoc) {
        claudeDocs.push(claudeDoc);
      }
    }

    return claudeDocs;
  }

  /**
   * 이미지 파일 저장 및 Claude 형식 반환
   * @param {Buffer} imageBuffer - 이미지 버퍼
   * @param {string} filename - 파일명
   * @param {Object} metadata - { category, tags, description }
   * @returns {Promise<{doc: Object, claudeDoc: Object}>}
   */
  async saveImage(imageBuffer, filename, metadata = {}) {
    // MIME 타입 결정
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    // 1. DocumentStorage에 저장
    const doc = await this.save(filename, imageBuffer, {
      ...metadata,
      category: metadata.category || 'images'
    });

    // 2. Claude API용 형식 반환
    const claudeDoc = {
      type: 'image',
      media_type: mimeType,
      data: imageBuffer.toString('base64')
    };

    return { doc, claudeDoc };
  }
}

/**
 * 메모리 매니저 (Memory Manager)
 * - 3계층 메모리 통합 관리
 * - 자동 계층 이동
 * - 컨텍스트 수집 최적화
 */
class MemoryManager {
  constructor(config = {}) {
    // DB 설정 사용 (UI에서 설정한 값)
    const shortTermSize = config.shortTermSize || 50;
    const archiveThreshold = config.archiveThreshold || 100;
    const sessionSummaryInterval = config.sessionSummaryInterval || 50;

    this.shortTerm = new ShortTermMemory(shortTermSize);
    this.middleTerm = new MiddleTermMemory(config.memoryPath);
    this.longTerm = new LongTermMemory();
    this.documents = new DocumentStorage(); // 문서 스토리지 추가

    this.config = {
      autoArchive: config.autoArchive !== false, // 기본 활성화
      archiveThreshold, // DB 설정 사용
      sessionSummaryInterval // DB 설정 사용
    };

    this.messagesSinceArchive = 0;
    this.messagesSinceSummary = 0;
  }

  /**
   * 초기화 (MongoDB에서 메시지 로드 포함)
   */
  async initialize(sessionId = 'main-conversation') {
    await this.shortTerm.initialize(sessionId);
    await this.middleTerm.initialize();
    await this.longTerm.initialize();
    await this.documents.initialize(); // 문서 스토리지 초기화
  }

  /**
   * 메시지 추가 (모든 계층)
   */
  async addMessage(message, sessionId) {
    // id 생성 (없으면)
    if (!message.id) {
      const timestamp = message.timestamp || new Date().toISOString();
      const ts = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
      message.id = `${ts.replace(/[:.]/g, '-')}_${message.role}`;
    }

    // 1. 단기 메모리에 추가
    const added = this.shortTerm.add(message);

    this.messagesSinceArchive++;
    this.messagesSinceSummary++;

    // 2. 백그라운드에서 태그/감정 분석 (비동기, 블로킹 안 함)
    this._enrichMessageAsync(message, sessionId);

    // 3. 자동 세션 요약
    if (this.messagesSinceSummary >= this.config.sessionSummaryInterval) {
      await this.summarizeSession(sessionId);
      this.messagesSinceSummary = 0;
    }

    // 4. 자동 아카이브
    if (this.config.autoArchive && this.messagesSinceArchive >= this.config.archiveThreshold) {
      await this.archiveOldMessages(sessionId);
      this.messagesSinceArchive = 0;
    }

    return added;
  }

  /**
   * 메시지 메타데이터 보강 (백그라운드)
   */
  async _enrichMessageAsync(message, sessionId) {
    try {
      // 백그라운드 워커 역할 확인
      const Role = require('../models/Role');
      const bgWorker = await Role.findOne({ category: 'background', active: true });
      
      if (!bgWorker) {
        // 백그라운드 워커가 없거나 비활성화면 스킵
        return;
      }
      
      const tasks = bgWorker.backgroundTasks || {};
      if (!tasks.tagGeneration) {
        // 태그 생성 비활성화면 스킵
        return;
      }

      const { getAlbaWorker } = require('./alba-worker');
      const alba = await getAlbaWorker();

      const content = message.text || message.content || '';
      if (!content || content.length < 5) return;

      const hour = new Date().getHours();
      const timeContext = hour < 6 ? '새벽' : hour < 12 ? '아침' : hour < 18 ? '오후' : '저녁';

      // 태그 생성
      const tags = await alba.generateTags(content, { timeContext });

      if (tags?.length > 0) {
        const ConversationStore = require('./conversation-store');
        const store = new ConversationStore();
        await store.updateMessage(message.id, {
          tags: tags || []
        });
        console.log(`[MemoryManager] Enriched message: ${tags?.length || 0} tags`);
      }
    } catch (error) {
      console.warn('[MemoryManager] Enrich failed (non-blocking):', error.message);
    }
  }

  /**
   * 세션 요약 생성
   */
  async summarizeSession(sessionId) {
    try {
      const messages = this.shortTerm.getAll();

      // 간단한 키워드 추출 (AI 요약은 선택적)
      const summary = this._generateSimpleSummary(messages);

      await this.middleTerm.saveSessionSummary(sessionId, summary);

      return summary;
    } catch (error) {
      console.error('Error summarizing session:', error);
      return null;
    }
  }

  /**
   * 오래된 메시지 아카이브
   */
  async archiveOldMessages(sessionId) {
    try {
      const messages = this.shortTerm.getAll();

      if (messages.length === 0) return;

      // 절반 아카이브
      const toArchive = messages.slice(0, Math.floor(messages.length / 2));

      // 장기 메모리에 저장
      await this.longTerm.archive(sessionId, toArchive, {
        topics: this._extractTopics(toArchive),
        messageCount: toArchive.length
      });

      console.log(`Archived ${toArchive.length} messages to long-term memory`);
    } catch (error) {
      console.error('Error archiving old messages:', error);
    }
  }

  /**
   * 컨텍스트 수집 (모든 계층)
   */
  async collectContext(sessionId, maxTokens) {
    const context = {
      shortTerm: [],
      middleTerm: null,
      longTerm: [],
      totalTokens: 0
    };

    try {
      // 1. 단기 메모리 (최우선)
      const shortTermResult = this.shortTerm.getWithinTokenLimit(maxTokens * 0.7);
      context.shortTerm = shortTermResult.messages;
      context.totalTokens += shortTermResult.totalTokens;

      // 2. 중기 메모리 (세션 요약)
      const sessionSummary = await this.middleTerm.loadSessionSummary(sessionId);
      if (sessionSummary) {
        context.middleTerm = sessionSummary;
        // 요약은 토큰 소비가 적음
        context.totalTokens += this._estimateTokens(JSON.stringify(sessionSummary));
      }

      // 3. 장기 메모리 (관련 대화 검색)
      const remainingTokens = maxTokens - context.totalTokens;
      if (remainingTokens > 1000) {
        // 최근 메시지에서 키워드 추출
        const recentMessages = this.shortTerm.getRecent(5);
        const keywords = this._extractKeywords(recentMessages.map(m => m.content).join(' '));

        if (keywords.length > 0) {
          const related = await this.longTerm.search(keywords[0], { limit: 3 });
          context.longTerm = related;
          context.totalTokens += related.reduce((sum, r) => sum + (r.length || 0), 0);
        }
      }

      return context;
    } catch (error) {
      console.error('Error collecting context:', error);
      return context;
    }
  }

  /**
   * 세션 복원
   */
  async restoreSession(sessionId) {
    try {
      // 중기 메모리에서 세션 요약 로드
      const sessionSummary = await this.middleTerm.loadSessionSummary(sessionId);

      if (!sessionSummary) {
        return null;
      }

      return {
        summary: sessionSummary,
        resumePrompt: this._generateResumePrompt(sessionSummary)
      };
    } catch (error) {
      console.error('Error restoring session:', error);
      return null;
    }
  }

  /**
   * 통계
   */
  async getStats() {
    const shortTermStats = this.shortTerm.getStats();
    const middleTermStats = await this.middleTerm.getStats();
    const longTermStats = await this.longTerm.getStats();

    return {
      shortTerm: shortTermStats,
      middleTerm: middleTermStats,
      longTerm: longTermStats,
      total: {
        messages: shortTermStats.count + longTermStats.totalCount,
        tokens: shortTermStats.totalTokens + longTermStats.totalTokens
      }
    };
  }

  /**
   * 헬퍼: 간단한 요약 생성
   */
  _generateSimpleSummary(messages) {
    const keywords = this._extractKeywords(messages.map(m => m.content).join(' '));
    const topics = this._extractTopics(messages);

    return {
      messageCount: messages.length,
      keywords: keywords.slice(0, 10),
      topics: topics.slice(0, 5),
      startTime: messages[0]?.timestamp,
      endTime: messages[messages.length - 1]?.timestamp
    };
  }

  /**
   * 헬퍼: 키워드 추출
   */
  _extractKeywords(text) {
    if (!text) return [];

    // 간단한 키워드 추출 (공백 기준)
    const words = text.toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // 빈도수 계산
    const frequency = {};
    words.forEach(w => {
      frequency[w] = (frequency[w] || 0) + 1;
    });

    // 빈도순 정렬
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * 헬퍼: 주제 추출
   */
  _extractTopics(messages) {
    const topics = [];

    // 기술 키워드
    const techKeywords = ['react', 'node', 'python', 'mongodb', 'docker', 'api', 'database'];
    const content = messages.map(m => m.content).join(' ').toLowerCase();

    techKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        topics.push(keyword);
      }
    });

    return topics;
  }

  /**
   * 헬퍼: 재개 프롬프트 생성
   */
  _generateResumePrompt(sessionSummary) {
    const { keywords, topics, messageCount, endTime } = sessionSummary;

    const timeSince = this._getTimeSince(new Date(endTime));

    let prompt = `이전 대화를 계속합니다. (${timeSince} 전, ${messageCount}개 메시지)\n\n`;

    if (topics && topics.length > 0) {
      prompt += `주요 주제: ${topics.join(', ')}\n`;
    }

    if (keywords && keywords.length > 0) {
      prompt += `키워드: ${keywords.slice(0, 5).join(', ')}\n`;
    }

    return prompt;
  }

  /**
   * 헬퍼: 시간 차이 계산
   */
  _getTimeSince(date) {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일`;
    if (hours > 0) return `${hours}시간`;
    if (minutes > 0) return `${minutes}분`;
    return '방금';
  }

  /**
   * 헬퍼: 토큰 추정
   */
  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}

/**
 * 전역 인스턴스
 */
let globalMemoryManager = null;

/**
 * 싱글톤 인스턴스 가져오기
 * 사용자 메모리 설정을 자동으로 로드
 */
async function getMemoryManager(config = {}) {
  if (!globalMemoryManager) {
    // configManager에서 메모리 설정 로드
    let memoryConfig = {};
    try {
      const configManager = require('./config');
      memoryConfig = await configManager.getMemoryConfig();
      console.log('[MemoryManager] Loaded memory config:', memoryConfig);
    } catch (err) {
      console.warn('[MemoryManager] Could not load memory config:', err.message);
    }

    // 사용자 설정과 기본값 병합
    const mergedConfig = {
      shortTermSize: memoryConfig.shortTermSize || config.maxShortTerm || 50,
      memoryPath: memoryConfig.storagePath || config.memoryPath,
      autoArchive: memoryConfig.autoArchive ?? config.autoArchive ?? true,
      archiveThreshold: memoryConfig.archiveThreshold || config.archiveThreshold || 100,
      sessionSummaryInterval: memoryConfig.sessionSummaryInterval || config.sessionSummaryInterval || 50
    };

    globalMemoryManager = new MemoryManager(mergedConfig);
    await globalMemoryManager.initialize();
  }
  return globalMemoryManager;
}

/**
 * MemoryManager 인스턴스 리셋 (설정 변경 시)
 */
function resetMemoryManager() {
  globalMemoryManager = null;
  // 스토리지 설정 캐시도 리셋
  MEMORY_STORAGE_CONFIG = null;
  MEMORY_STORAGE_PATH = null;
  FTP_STORAGE_INSTANCE = null;
  console.log('[MemoryManager] Manager and storage config reset');
}

module.exports = {
  ShortTermMemory,
  MiddleTermMemory,
  LongTermMemory,
  DocumentStorage,
  MemoryManager,
  getMemoryManager,
  resetMemoryManager,
  getMemoryStoragePath,
  getMemoryStorageConfig,
  getFTPStorageInstance,
  isUsingFTP,
  MEMORY_STORAGE_PATH
};
