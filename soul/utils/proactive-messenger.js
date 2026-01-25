/**
 * proactive-messenger.js
 * 선제 메시지 시스템 (Phase 1.6.3)
 * 
 * 역할:
 * - 조건 기반 트리거 체크
 * - 스토킹 방지 로직
 * - Socket.io로 실시간 발송
 */

const fs = require('fs').promises;
const path = require('path');

class ProactiveMessenger {
  constructor(io, basePath = './memory') {
    this.io = io;
    this.basePath = basePath;
    this.configPath = path.join(basePath, 'proactive-config.json');
    this.historyPath = path.join(basePath, 'proactive-history.json');
    this.config = null;
    this.history = null;
    this.checkInterval = null;
    this.CHECK_INTERVAL_MS = 30 * 60 * 1000;  // 30분마다 체크
  }

  /**
   * 기본 조건들
   */
  getDefaultConditions() {
    return [
      {
        id: 'long_silence_3days',
        name: '3일 연락 없음',
        enabled: true,
        trigger: { silenceDays: 3 },
        messages: [
          '요즘 어떻게 지내?',
          '잘 지내고 있어?',
          '오랜만이다~'
        ],
        cooldownHours: 72,  // 3일
        maxPerWeek: 2
      },
      {
        id: 'long_silence_7days',
        name: '7일 연락 없음',
        enabled: true,
        trigger: { silenceDays: 7 },
        messages: [
          '일주일이나 됐네! 바빴어?',
          '많이 바쁜가보다~ 힘내!',
          '오랜만! 별일 없지?'
        ],
        cooldownHours: 168,  // 7일
        maxPerWeek: 1
      },
      {
        id: 'sick_followup',
        name: '아픈 후 체크',
        enabled: true,
        trigger: { 
          lastEventType: 'sick',
          silenceHours: 24
        },
        messages: [
          '좀 괜찮아졌어?',
          '몸은 좀 어때?',
          '푹 쉬었어?'
        ],
        cooldownHours: 48,
        maxPerWeek: 2
      },
      {
        id: 'trip_return',
        name: '여행 복귀 체크',
        enabled: true,
        trigger: {
          lastEventType: 'trip',
          expectedReturnPassed: true
        },
        messages: [
          '여행 잘 다녀왔어?',
          '여행 어땠어?'
        ],
        cooldownHours: 24,
        maxPerWeek: 1
      }
    ];
  }

  async initialize() {
    // 설정 로드
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
    } catch (e) {
      this.config = {
        enabled: true,
        conditions: this.getDefaultConditions(),
        quietHoursStart: 23,  // 밤 11시
        quietHoursEnd: 8,     // 아침 8시
        createdAt: new Date().toISOString()
      };
      await this._saveConfig();
    }

    // 히스토리 로드
    try {
      const content = await fs.readFile(this.historyPath, 'utf-8');
      this.history = JSON.parse(content);
    } catch (e) {
      this.history = {
        sent: [],  // { conditionId, sentAt, message }
        blocked: []  // 스토킹 방지로 막힌 것들
      };
      await this._saveHistory();
    }

    console.log('[ProactiveMessenger] Initialized');
  }

  /**
   * 스케줄러 시작
   */
  start() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // 초기 체크 (1분 후)
    setTimeout(() => this._checkAndSend(), 60 * 1000);

    // 주기적 체크
    this.checkInterval = setInterval(
      () => this._checkAndSend(),
      this.CHECK_INTERVAL_MS
    );

    console.log('[ProactiveMessenger] Scheduler started');
  }

  /**
   * 스케줄러 중지
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[ProactiveMessenger] Scheduler stopped');
  }

  /**
   * 조건 체크 및 발송
   */
  async _checkAndSend() {
    if (!this.config?.enabled) return;
    if (!this.io) return;

    // 접속한 클라이언트 없으면 스킵
    const clients = this.io.sockets?.sockets;
    if (!clients || clients.size === 0) {
      return;
    }

    // 조용한 시간 체크
    if (this._isQuietHours()) {
      return;
    }

    // 각 조건 체크
    for (const condition of this.config.conditions) {
      if (!condition.enabled) continue;

      try {
        const shouldTrigger = await this._evaluateCondition(condition);
        if (shouldTrigger && !this._isBlocked(condition)) {
          await this._sendProactiveMessage(condition);
          break;  // 한 번에 하나만
        }
      } catch (e) {
        console.error(`[ProactiveMessenger] Condition ${condition.id} error:`, e.message);
      }
    }
  }

  /**
   * 조건 평가
   */
  async _evaluateCondition(condition) {
    const trigger = condition.trigger;

    // 마지막 메시지 시간 가져오기
    const lastMessageTime = await this._getLastMessageTime();
    if (!lastMessageTime) return false;

    const now = Date.now();
    const silenceMs = now - new Date(lastMessageTime).getTime();
    const silenceHours = silenceMs / (1000 * 60 * 60);
    const silenceDays = silenceHours / 24;

    // silenceDays 조건
    if (trigger.silenceDays && silenceDays < trigger.silenceDays) {
      return false;
    }

    // silenceHours 조건
    if (trigger.silenceHours && silenceHours < trigger.silenceHours) {
      return false;
    }

    // lastEventType 조건
    if (trigger.lastEventType) {
      const lastEvent = await this._getLastEvent();
      if (!lastEvent || lastEvent.type !== trigger.lastEventType) {
        return false;
      }
    }

    // expectedReturnPassed 조건
    if (trigger.expectedReturnPassed) {
      const pendingEvent = await this._getPendingEvent();
      if (!pendingEvent) return false;
      
      const expectedEnd = new Date(pendingEvent.startedAt).getTime() + 
                          (pendingEvent.expectedDuration * 1000);
      if (now < expectedEnd) return false;
    }

    return true;
  }

  /**
   * 스토킹 방지 체크
   */
  _isBlocked(condition) {
    const now = Date.now();

    // 쿨다운 체크
    const lastSent = this.history.sent
      .filter(s => s.conditionId === condition.id)
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))[0];

    if (lastSent) {
      const cooldownMs = (condition.cooldownHours || 24) * 60 * 60 * 1000;
      if (now - new Date(lastSent.sentAt).getTime() < cooldownMs) {
        return true;
      }
    }

    // 주간 한도 체크
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const weekCount = this.history.sent
      .filter(s => s.conditionId === condition.id && new Date(s.sentAt).getTime() > weekAgo)
      .length;

    if (weekCount >= (condition.maxPerWeek || 3)) {
      return true;
    }

    // 전체 선제 메시지 일일 한도 (3개)
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const dayCount = this.history.sent
      .filter(s => new Date(s.sentAt).getTime() > dayAgo)
      .length;

    if (dayCount >= 3) {
      return true;
    }

    return false;
  }

  /**
   * 조용한 시간 체크
   */
  _isQuietHours() {
    const hour = new Date().getHours();
    const start = this.config.quietHoursStart;
    const end = this.config.quietHoursEnd;

    if (start > end) {
      // 예: 23시~8시
      return hour >= start || hour < end;
    } else {
      // 예: 1시~6시
      return hour >= start && hour < end;
    }
  }

  /**
   * 선제 메시지 발송
   */
  async _sendProactiveMessage(condition) {
    // 랜덤 메시지 선택
    const messages = condition.messages || ['안녕!'];
    const message = messages[Math.floor(Math.random() * messages.length)];

    // Socket.io로 발송
    this.io.emit('proactive_message', {
      type: 'proactive',
      conditionId: condition.id,
      conditionName: condition.name,
      message: message,
      timestamp: new Date().toISOString()
    });

    // 히스토리 기록
    this.history.sent.push({
      conditionId: condition.id,
      message: message,
      sentAt: new Date().toISOString()
    });

    // 히스토리 정리 (최근 100개만)
    if (this.history.sent.length > 100) {
      this.history.sent = this.history.sent.slice(-100);
    }

    await this._saveHistory();

    console.log(`[ProactiveMessenger] Sent: "${message}" (${condition.id})`);
  }

  /**
   * 마지막 메시지 시간 가져오기
   */
  async _getLastMessageTime() {
    try {
      // 아카이브에서 가장 최근 파일 확인
      const archivePath = path.join(this.basePath, 'archive');
      const files = await fs.readdir(archivePath);
      const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
      
      if (jsonFiles.length === 0) return null;

      // 최신 파일
      const latestFile = jsonFiles.sort().pop();
      const content = await fs.readFile(path.join(archivePath, latestFile), 'utf-8');
      const data = JSON.parse(content);
      
      // 마지막 메시지의 timestamp
      const messages = data.messages || [];
      if (messages.length === 0) return null;
      
      return messages[messages.length - 1].timestamp;
    } catch (e) {
      return null;
    }
  }

  /**
   * 마지막 이벤트 가져오기
   */
  async _getLastEvent() {
    try {
      const eventPath = path.join(this.basePath, 'pending-events', 'history.json');
      const content = await fs.readFile(eventPath, 'utf-8');
      const events = JSON.parse(content);
      return events[events.length - 1] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 진행 중인 이벤트 가져오기
   */
  async _getPendingEvent() {
    try {
      const eventPath = path.join(this.basePath, 'pending-events', 'current.json');
      const content = await fs.readFile(eventPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }

  async _saveConfig() {
    this.config.updatedAt = new Date().toISOString();
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  async _saveHistory() {
    await fs.writeFile(this.historyPath, JSON.stringify(this.history, null, 2), 'utf-8');
  }

  /**
   * 설정 조회
   */
  getConfig() {
    return this.config;
  }

  /**
   * 설정 업데이트
   */
  async updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    await this._saveConfig();
    return this.config;
  }

  /**
   * 조건 활성화/비활성화
   */
  async toggleCondition(conditionId, enabled) {
    const condition = this.config.conditions.find(c => c.id === conditionId);
    if (condition) {
      condition.enabled = enabled;
      await this._saveConfig();
    }
    return this.config;
  }
}

// 싱글톤
let globalMessenger = null;

async function getProactiveMessenger(io, basePath = './memory') {
  if (!globalMessenger) {
    globalMessenger = new ProactiveMessenger(io, basePath);
    await globalMessenger.initialize();
  }
  return globalMessenger;
}

function resetProactiveMessenger() {
  if (globalMessenger) {
    globalMessenger.stop();
  }
  globalMessenger = null;
}

module.exports = {
  ProactiveMessenger,
  getProactiveMessenger,
  resetProactiveMessenger
};
