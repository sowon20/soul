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

// 메모리 스토리지 경로 (환경 변수 또는 기본값)
const MEMORY_STORAGE_PATH = process.env.MEMORY_STORAGE_PATH || path.join(process.cwd(), 'memory');

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
   * MongoDB에서 메시지 로드 (초기화)
   */
  async initialize(sessionId = 'main-conversation') {
    this.sessionId = sessionId;
    try {
      const Message = require('../models/Message');
      const messages = await Message.getRecentMessages(sessionId, this.maxMessages);
      this.messages = messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        tokens: m.tokens || this._estimateTokens(m.content)
      }));
      this.totalTokens = this.messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
      this.initialized = true;
      console.log(`[ShortTermMemory] Loaded ${this.messages.length} messages from DB`);
    } catch (error) {
      console.error('[ShortTermMemory] Failed to load from DB:', error.message);
      this.initialized = true;
    }
  }

  /**
   * 메시지 추가 (MongoDB에도 저장)
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

    // 최대 개수 초과 시 오래된 메시지 제거
    if (this.messages.length > this.maxMessages) {
      const removed = this.messages.shift();
      this.totalTokens -= removed.tokens;
    }

    return messageWithMeta;
  }

  /**
   * MongoDB에 메시지 저장
   */
  async _saveToDb(message) {
    try {
      const Message = require('../models/Message');
      await Message.addMessage(this.sessionId, message);
    } catch (error) {
      throw error;
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
 * - 파일 시스템 저장
 */
class MiddleTermMemory {
  constructor(memoryPath) {
    this.memoryPath = memoryPath || path.join(process.cwd(), 'memory', 'sessions');
    this.currentSession = null;
    this.sessionSummaries = new Map(); // sessionId -> summary
  }

  /**
   * 초기화
   */
  async initialize() {
    try {
      await fs.mkdir(this.memoryPath, { recursive: true });
    } catch (error) {
      console.error('Error initializing middle-term memory:', error);
    }
  }

  /**
   * 세션 요약 저장
   */
  async saveSessionSummary(sessionId, summary) {
    try {
      const sessionFile = path.join(this.memoryPath, `${sessionId}.json`);

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

      await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
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

      // 파일에서 로드
      const sessionFile = path.join(this.memoryPath, `${sessionId}.json`);
      const content = await fs.readFile(sessionFile, 'utf-8');
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
      const files = await fs.readdir(this.memoryPath);
      const sessions = [];

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

      // 수정 시간 기준 정렬
      sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);

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
      const sessionFile = path.join(this.memoryPath, `${sessionId}.json`);
      await fs.unlink(sessionFile);
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
      const files = await fs.readdir(this.memoryPath);
      const sessionCount = files.filter(f => f.endsWith('.json')).length;

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
    const dir = path.join(MEMORY_STORAGE_PATH, 'summaries', `${year}-${monthStr}`);
    return {
      dir,
      file: path.join(dir, `week-${weekNum}.json`)
    };
  }

  /**
   * 주간 요약 저장
   */
  async saveWeeklySummary(year, month, weekNum, summaryData) {
    try {
      const { dir, file } = this._getWeeklySummaryPath(year, month, weekNum);
      await fs.mkdir(dir, { recursive: true });
      
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

      await fs.writeFile(file, JSON.stringify(data, null, 2));
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
      const content = await fs.readFile(file, 'utf-8');
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
      const summariesRoot = path.join(MEMORY_STORAGE_PATH, 'summaries');
      
      // 폴더가 없으면 빈 배열 반환
      try {
        await fs.access(summariesRoot);
      } catch {
        return [];
      }

      const monthDirs = await fs.readdir(summariesRoot);
      const allSummaries = [];

      // 모든 월 폴더 순회
      for (const monthDir of monthDirs.sort().reverse()) {
        if (!monthDir.match(/^\d{4}-\d{2}$/)) continue;
        
        const monthPath = path.join(summariesRoot, monthDir);
        const files = await fs.readdir(monthPath);
        
        for (const file of files.sort().reverse()) {
          if (!file.endsWith('.json')) continue;
          
          const content = await fs.readFile(path.join(monthPath, file), 'utf-8');
          allSummaries.push(JSON.parse(content));
          
          if (allSummaries.length >= count) break;
        }
        
        if (allSummaries.length >= count) break;
      }

      return allSummaries;
    } catch (error) {
      console.error('[WeeklySummary] getRecent error:', error);
      return [];
    }
  }

  /**
   * 주간 요약 생성 (Alba 사용)
   * @param {Array} messages - 해당 주의 메시지 배열
   * @param {Object} weekInfo - { year, month, weekNum }
   */
  async generateWeeklySummary(messages, weekInfo) {
    if (!messages || messages.length === 0) {
      return null;
    }

    try {
      const { getAlbaWorker } = require('./alba-worker');
      const alba = await getAlbaWorker();  // await 추가, initialize 자동 호출됨

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

      // JSON 파싱
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      parsed.messageCount = messages.length;

      // 저장
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
 * - 아카이브된 대화
 * - 검색 가능
 * - MongoDB 저장
 */
class LongTermMemory {
  constructor() {
    this.Memory = null; // Mongoose 모델 (지연 로딩)
  }

  /**
   * 초기화
   */
  async initialize() {
    try {
      // Memory 모델 로드
      this.Memory = require('../models/Memory');
    } catch (error) {
      console.error('Error initializing long-term memory:', error);
    }
  }

  /**
   * 대화 아카이브
   */
  async archive(conversationId, messages, metadata = {}) {
    try {
      if (!this.Memory) {
        throw new Error('Long-term memory not initialized');
      }

      const memory = new this.Memory({
        conversationId,
        messages,
        ...metadata,
        archivedAt: new Date()
      });

      await memory.save();
      return memory;
    } catch (error) {
      console.error('Error archiving conversation:', error);
      throw error;
    }
  }

  /**
   * 대화 검색
   */
  async search(query, options = {}) {
    try {
      if (!this.Memory) {
        throw new Error('Long-term memory not initialized');
      }

      const {
        limit = 10,
        tags,
        category,
        startDate,
        endDate,
        minImportance
      } = options;

      const filter = {};

      // 태그 필터
      if (tags && tags.length > 0) {
        filter.tags = { $all: tags };
      }

      // 카테고리 필터
      if (category) {
        filter.category = category;
      }

      // 날짜 범위
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }

      // 중요도 필터
      if (minImportance !== undefined) {
        filter.importance = { $gte: minImportance };
      }

      // 텍스트 검색 (주제, 태그, 카테고리)
      if (query) {
        filter.$or = [
          { topics: { $regex: query, $options: 'i' } },
          { tags: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } }
        ];
      }

      const results = await this.Memory.find(filter)
        .sort({ date: -1 })
        .limit(limit)
        .lean();

      return results;
    } catch (error) {
      console.error('Error searching long-term memory:', error);
      return [];
    }
  }

  /**
   * ID로 조회
   */
  async getById(id) {
    try {
      if (!this.Memory) {
        throw new Error('Long-term memory not initialized');
      }

      return await this.Memory.findById(id).lean();
    } catch (error) {
      console.error('Error getting memory by id:', error);
      return null;
    }
  }

  /**
   * 통계
   */
  async getStats() {
    try {
      if (!this.Memory) {
        return { totalCount: 0, totalTokens: 0 };
      }

      const totalCount = await this.Memory.countDocuments();
      const stats = await this.Memory.aggregate([
        {
          $group: {
            _id: null,
            totalTokens: { $sum: '$length' }
          }
        }
      ]);

      return {
        totalCount,
        totalTokens: stats[0]?.totalTokens || 0
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { totalCount: 0, totalTokens: 0 };
    }
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
  }

  /**
   * 메시지 추가 (모든 계층)
   */
  async addMessage(message, sessionId) {
    // 1. 단기 메모리에 추가
    const added = this.shortTerm.add(message);

    this.messagesSinceArchive++;
    this.messagesSinceSummary++;

    // 2. 자동 세션 요약
    if (this.messagesSinceSummary >= this.config.sessionSummaryInterval) {
      await this.summarizeSession(sessionId);
      this.messagesSinceSummary = 0;
    }

    // 3. 자동 아카이브
    if (this.config.autoArchive && this.messagesSinceArchive >= this.config.archiveThreshold) {
      await this.archiveOldMessages(sessionId);
      this.messagesSinceArchive = 0;
    }

    return added;
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
  console.log('[MemoryManager] Manager reset');
}

module.exports = {
  ShortTermMemory,
  MiddleTermMemory,
  LongTermMemory,
  MemoryManager,
  getMemoryManager,
  resetMemoryManager,
  MEMORY_STORAGE_PATH
};
