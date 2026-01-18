/**
 * session-continuity.js
 * 세션 연속성 관리
 *
 * Phase 5.4.5: 세션 연속성
 *
 * 기능:
 * - 세션 상태 저장/복원
 * - 대화 중단/재개 완벽 처리
 * - 시간 인지 재개 메시지 (N시간 전, N일 전)
 */

const path = require('path');
const fs = require('fs').promises;
const { getMemoryManager } = require('./memory-layers');

/**
 * SessionContinuity 클래스
 */
class SessionContinuity {
  constructor(config = {}) {
    this.config = {
      sessionPath: config.sessionPath || path.join(process.cwd(), 'memory', 'sessions', 'active'),
      autoSave: config.autoSave !== false, // 기본 활성화
      saveInterval: config.saveInterval || 60000, // 1분마다 자동 저장
      maxSessionAge: config.maxSessionAge || 30 * 24 * 60 * 60 * 1000 // 30일
    };

    this.memoryManager = null;
    this.activeSessions = new Map(); // sessionId -> sessionData
    this.autoSaveTimers = new Map(); // sessionId -> timer
  }

  /**
   * 초기화
   */
  async initialize() {
    try {
      await fs.mkdir(this.config.sessionPath, { recursive: true });
      this.memoryManager = await getMemoryManager();
    } catch (error) {
      console.error('Error initializing session continuity:', error);
    }
  }

  /**
   * 세션 상태 저장
   */
  async saveSessionState(sessionId, state) {
    try {
      const sessionData = {
        sessionId,
        state,
        savedAt: new Date(),
        messageCount: state.messageCount || 0,
        lastMessage: state.lastMessage || null,
        context: state.context || {},
        metadata: state.metadata || {}
      };

      // 파일 저장
      const sessionFile = path.join(this.config.sessionPath, `${sessionId}.json`);
      await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));

      // 메모리 캐시
      this.activeSessions.set(sessionId, sessionData);

      // 자동 저장 타이머 설정
      if (this.config.autoSave) {
        this._setupAutoSave(sessionId);
      }

      return sessionData;
    } catch (error) {
      console.error('Error saving session state:', error);
      throw error;
    }
  }

  /**
   * 세션 복원
   */
  async restoreSession(sessionId) {
    try {
      // 1. 메모리 캐시 확인
      if (this.activeSessions.has(sessionId)) {
        const cached = this.activeSessions.get(sessionId);
        return this._buildRestoreResult(cached);
      }

      // 2. 파일에서 로드
      const sessionFile = path.join(this.config.sessionPath, `${sessionId}.json`);
      const content = await fs.readFile(sessionFile, 'utf-8');
      const sessionData = JSON.parse(content);

      // 3. 세션 만료 체크
      const age = Date.now() - new Date(sessionData.savedAt).getTime();
      if (age > this.config.maxSessionAge) {
        console.warn(`Session ${sessionId} is too old (${Math.floor(age / (24 * 60 * 60 * 1000))} days)`);
        return {
          success: false,
          reason: 'Session expired',
          sessionData
        };
      }

      // 4. 메모리 매니저에서 히스토리 로드
      let historyMessages = [];
      if (this.memoryManager) {
        const sessionSummary = await this.memoryManager.middleTerm.loadSessionSummary(sessionId);
        if (sessionSummary) {
          sessionData.summary = sessionSummary;
        }
      }

      // 5. 캐시 업데이트
      this.activeSessions.set(sessionId, sessionData);

      return this._buildRestoreResult(sessionData);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          success: false,
          reason: 'Session not found',
          sessionId
        };
      }
      console.error('Error restoring session:', error);
      throw error;
    }
  }

  /**
   * 재개 프롬프트 생성
   */
  generateResumePrompt(sessionData) {
    const { savedAt, messageCount, lastMessage, summary } = sessionData;

    // 시간 계산
    const timeSince = this._getTimeSince(new Date(savedAt));
    const timeDetail = this._getTimeDetail(new Date(savedAt));

    // 기본 프롬프트
    let prompt = `\n\n=== 대화 재개 ===\n`;
    prompt += `마지막 대화: ${timeSince} 전 (${timeDetail})\n`;
    prompt += `메시지 수: ${messageCount}개\n`;

    // 요약 정보
    if (summary) {
      if (summary.topics && summary.topics.length > 0) {
        prompt += `주요 주제: ${summary.topics.join(', ')}\n`;
      }

      if (summary.keywords && summary.keywords.length > 0) {
        prompt += `키워드: ${summary.keywords.slice(0, 5).join(', ')}\n`;
      }

      if (summary.decisions && summary.decisions.length > 0) {
        prompt += `\n결정사항:\n`;
        summary.decisions.forEach((decision, i) => {
          prompt += `  ${i + 1}. ${decision}\n`;
        });
      }

      if (summary.todos && summary.todos.length > 0) {
        prompt += `\nTODO:\n`;
        summary.todos.forEach((todo, i) => {
          prompt += `  ${i + 1}. ${todo}\n`;
        });
      }
    }

    // 마지막 메시지
    if (lastMessage) {
      prompt += `\n마지막 메시지:\n`;
      prompt += `  ${lastMessage.role}: ${lastMessage.content.substring(0, 100)}`;
      if (lastMessage.content.length > 100) {
        prompt += '...';
      }
      prompt += `\n`;
    }

    prompt += `\n대화를 계속 이어갑니다.\n`;
    prompt += `======================\n\n`;

    return prompt;
  }

  /**
   * 세션 종료
   */
  async endSession(sessionId) {
    try {
      // 1. 세션 상태 최종 저장
      const sessionData = this.activeSessions.get(sessionId);
      if (sessionData) {
        await this.saveSessionState(sessionId, sessionData.state);
      }

      // 2. 자동 저장 타이머 정리
      if (this.autoSaveTimers.has(sessionId)) {
        clearInterval(this.autoSaveTimers.get(sessionId));
        this.autoSaveTimers.delete(sessionId);
      }

      // 3. 메모리에서 제거 (파일은 유지)
      this.activeSessions.delete(sessionId);

      return {
        success: true,
        sessionId
      };
    } catch (error) {
      console.error('Error ending session:', error);
      throw error;
    }
  }

  /**
   * 세션 삭제
   */
  async deleteSession(sessionId) {
    try {
      // 1. 세션 종료
      await this.endSession(sessionId);

      // 2. 파일 삭제
      const sessionFile = path.join(this.config.sessionPath, `${sessionId}.json`);
      await fs.unlink(sessionFile);

      return {
        success: true,
        sessionId
      };
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  /**
   * 활성 세션 목록
   */
  async getActiveSessions() {
    try {
      const files = await fs.readdir(this.config.sessionPath);
      const sessions = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const sessionId = file.replace('.json', '');
        const sessionFile = path.join(this.config.sessionPath, file);
        const stats = await fs.stat(sessionFile);
        const content = await fs.readFile(sessionFile, 'utf-8');
        const data = JSON.parse(content);

        sessions.push({
          sessionId,
          savedAt: data.savedAt,
          messageCount: data.messageCount || 0,
          lastModified: stats.mtime,
          age: this._getTimeSince(new Date(data.savedAt)),
          isActive: this.activeSessions.has(sessionId)
        });
      }

      // 최신순 정렬
      sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

      return sessions;
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * 세션 정리 (오래된 세션 삭제)
   */
  async cleanupOldSessions() {
    try {
      const sessions = await this.getActiveSessions();
      const deleted = [];

      for (const session of sessions) {
        const age = Date.now() - new Date(session.savedAt).getTime();
        if (age > this.config.maxSessionAge) {
          await this.deleteSession(session.sessionId);
          deleted.push(session.sessionId);
        }
      }

      return {
        success: true,
        deletedCount: deleted.length,
        deletedSessions: deleted
      };
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
      throw error;
    }
  }

  /**
   * 통계
   */
  async getStats() {
    try {
      const sessions = await this.getActiveSessions();

      return {
        totalSessions: sessions.length,
        activeSessions: Array.from(this.activeSessions.keys()).length,
        autoSaveActive: this.autoSaveTimers.size,
        oldestSession: sessions.length > 0 ? sessions[sessions.length - 1].savedAt : null,
        newestSession: sessions.length > 0 ? sessions[0].savedAt : null
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        autoSaveActive: 0
      };
    }
  }

  /**
   * 자동 저장 설정
   */
  _setupAutoSave(sessionId) {
    // 기존 타이머 정리
    if (this.autoSaveTimers.has(sessionId)) {
      clearInterval(this.autoSaveTimers.get(sessionId));
    }

    // 새 타이머 설정
    const timer = setInterval(async () => {
      const sessionData = this.activeSessions.get(sessionId);
      if (sessionData) {
        try {
          await this.saveSessionState(sessionId, sessionData.state);
          console.log(`Auto-saved session ${sessionId}`);
        } catch (error) {
          console.error(`Error auto-saving session ${sessionId}:`, error);
        }
      }
    }, this.config.saveInterval);

    this.autoSaveTimers.set(sessionId, timer);
  }

  /**
   * 복원 결과 구성
   */
  _buildRestoreResult(sessionData) {
    return {
      success: true,
      sessionId: sessionData.sessionId,
      state: sessionData.state,
      savedAt: sessionData.savedAt,
      messageCount: sessionData.messageCount,
      resumePrompt: this.generateResumePrompt(sessionData),
      summary: sessionData.summary || null,
      timeSince: this._getTimeSince(new Date(sessionData.savedAt))
    };
  }

  /**
   * 시간 차이 계산 (간결)
   */
  _getTimeSince(date) {
    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일`;
    if (hours > 0) return `${hours}시간`;
    if (minutes > 0) return `${minutes}분`;
    return '방금';
  }

  /**
   * 시간 상세 정보
   */
  _getTimeDetail(date) {
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    });
  }
}

/**
 * 전역 인스턴스
 */
let globalSessionContinuity = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
async function getSessionContinuity(config = {}) {
  if (!globalSessionContinuity) {
    globalSessionContinuity = new SessionContinuity(config);
    await globalSessionContinuity.initialize();
  }
  return globalSessionContinuity;
}

module.exports = {
  SessionContinuity,
  getSessionContinuity
};
