/**
 * conversation-archiver.js
 * 대화 실시간 저장 시스템 (Phase 1.5)
 * 
 * 역할:
 * - 메시지 올 때마다 실시간으로 JSON 파일에 저장
 * - 장기 메모리 = 영구 원문 보관 (절대 삭제/압축 안 함)
 * - 월별 폴더 / 일별 파일 구조
 * - 알바 연동: aiMemo, 태그 자동 생성
 */

const fs = require('fs').promises;
const path = require('path');
const { getAlbaWorker } = require('./alba-worker');

class ConversationArchiver {
  constructor(basePath = './memory') {
    this.basePath = basePath;
    this.conversationsPath = path.join(basePath, 'conversations');
    this.initialized = false;
  }

  /**
   * 초기화 - 폴더 구조 확인/생성
   */
  async initialize() {
    try {
      await fs.mkdir(this.conversationsPath, { recursive: true });
      this.initialized = true;
      console.log(`[Archiver] Initialized at ${this.conversationsPath}`);
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
    
    // 로컬 날짜 (YYYY-MM-DD)
    const localDateStr = localDate.toLocaleDateString('ko-KR', { 
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\. /g, '-').replace('.', '');
    
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
    
    const monthDir = path.join(this.conversationsPath, `${year}-${month}`);
    const fileName = `${year}-${month}-${day}.json`;
    
    return {
      monthDir,
      filePath: path.join(monthDir, fileName)
    };
  }

  /**
   * 메시지 실시간 저장 (핵심 함수)
   */
  async archiveMessage(message, lastMessageTime = null, timezone = 'Asia/Seoul') {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const timestamp = message.timestamp || new Date();
      const { monthDir, filePath } = this.getFilePath(timestamp);
      
      // 월별 폴더 생성
      await fs.mkdir(monthDir, { recursive: true });
      
      // 메타 정보 계산 (타임존 반영)
      const meta = this.calculateMeta(timestamp, lastMessageTime, timezone);
      
      // 세션 메타 병합
      if (message.sessionMeta) {
        meta.sessionId = message.sessionMeta.sessionId;
        meta.sessionDuration = message.sessionMeta.sessionDuration;
        meta.sessionDurationFormatted = this._formatDuration(message.sessionMeta.sessionDuration);
        meta.messageIndex = message.sessionMeta.messageIndex;
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
        metadata: message.metadata || {}
      };

      // 기존 파일 읽기 또는 새로 생성
      let dayMessages = [];
      try {
        const existing = await fs.readFile(filePath, 'utf-8');
        dayMessages = JSON.parse(existing);
      } catch (e) {
        // 파일 없으면 새로 시작
      }
      
      // 메시지 추가
      dayMessages.push(archiveEntry);
      
      // 파일 저장
      await fs.writeFile(filePath, JSON.stringify(dayMessages, null, 2), 'utf-8');
      
      console.log(`[Archiver] Saved to ${filePath} (${dayMessages.length} messages)`);
      
      // 알바 작업: assistant 메시지일 때 aiMemo, 태그 생성 (비동기)
      if (message.role === 'assistant' && dayMessages.length >= 2) {
        this._scheduleAlbaWork(filePath, dayMessages);
      }
      
      return archiveEntry;
    } catch (error) {
      console.error('[Archiver] Save failed:', error.message);
      throw error;
    }
  }

  /**
   * 특정 날짜 메시지 읽기
   */
  async getMessagesForDate(date) {
    const { filePath } = this.getFilePath(date);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return [];
    }
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
    // 비동기로 실행 (응답 블로킹 안 함)
    setImmediate(async () => {
      try {
        const alba = await getAlbaWorker();
        
        // 최근 2개 메시지 (user + assistant)
        const recentPair = dayMessages.slice(-2);
        const lastIndex = dayMessages.length - 1;
        
        // 시간 맥락 문자열
        const lastMsg = dayMessages[lastIndex];
        const timeContext = lastMsg.meta 
          ? `${lastMsg.meta.timeOfDay}, ${lastMsg.meta.dayOfWeek}` 
          : '';
        
        // aiMemo 생성
        const aiMemo = await alba.generateAiMemo(recentPair, { timeContext });
        
        // 태그 생성 (user 메시지 기준)
        const userMsg = recentPair.find(m => m.role === 'user');
        const tags = userMsg ? await alba.generateTags(userMsg.content) : [];
        
        // 파일 업데이트 (마지막 메시지에 aiMemo, 태그 추가)
        if (aiMemo || tags.length > 0) {
          const content = await fs.readFile(filePath, 'utf-8');
          const messages = JSON.parse(content);
          
          if (aiMemo) messages[lastIndex].aiMemo = aiMemo;
          if (tags.length > 0) messages[lastIndex].tags = tags;
          
          await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf-8');
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

function getArchiver(basePath) {
  if (!archiverInstance || (basePath && archiverInstance.basePath !== basePath)) {
    archiverInstance = new ConversationArchiver(basePath);
  }
  return archiverInstance;
}

function resetArchiver() {
  archiverInstance = null;
}

module.exports = {
  ConversationArchiver,
  getArchiver,
  resetArchiver
};
