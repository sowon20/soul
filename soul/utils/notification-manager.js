/**
 * notification-manager.js
 * 알림 관리 시스템
 *
 * Week 2: Proactive Messaging
 *
 * 기능:
 * - 작업 완료 알림
 * - 에러 알림
 * - 시스템 이벤트 알림
 * - 알림 우선순위 관리
 */

/**
 * 알림 타입
 */
const NOTIFICATION_TYPE = {
  JOB_COMPLETE: 'job_complete',
  JOB_FAILED: 'job_failed',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  GREETING: 'greeting',
  REMINDER: 'reminder',
  SYSTEM: 'system'
};

/**
 * 알림 우선순위
 */
const NOTIFICATION_PRIORITY = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 8,
  URGENT: 10
};

/**
 * 알림 상태
 */
const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  READ: 'read',
  DISMISSED: 'dismissed',
  FAILED: 'failed'
};

/**
 * Notification 클래스
 */
class Notification {
  constructor(options) {
    this.id = options.id || this._generateId();
    this.type = options.type;
    this.priority = options.priority || NOTIFICATION_PRIORITY.NORMAL;
    this.title = options.title;
    this.message = options.message;
    this.data = options.data || {};
    this.status = NOTIFICATION_STATUS.PENDING;
    this.createdAt = new Date();
    this.sentAt = null;
    this.readAt = null;
    this.expiresAt = options.expiresAt || null;
    this.metadata = {
      sessionId: options.sessionId || null,
      userId: options.userId || null,
      source: options.source || 'system'
    };
  }

  _generateId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  markAsSent() {
    this.status = NOTIFICATION_STATUS.SENT;
    this.sentAt = new Date();
  }

  markAsRead() {
    this.status = NOTIFICATION_STATUS.READ;
    this.readAt = new Date();
  }

  markAsDismissed() {
    this.status = NOTIFICATION_STATUS.DISMISSED;
  }

  markAsFailed(error) {
    this.status = NOTIFICATION_STATUS.FAILED;
    this.data.error = error.message || String(error);
  }

  isExpired() {
    if (!this.expiresAt) return false;
    return new Date() > new Date(this.expiresAt);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      priority: this.priority,
      title: this.title,
      message: this.message,
      data: this.data,
      status: this.status,
      createdAt: this.createdAt,
      sentAt: this.sentAt,
      readAt: this.readAt,
      expiresAt: this.expiresAt,
      metadata: this.metadata
    };
  }
}

/**
 * NotificationManager 클래스
 */
class NotificationManager {
  constructor() {
    this.notifications = new Map();
    this.pending = [];
    this.sent = [];
    this.listeners = new Map();
    this.config = {
      maxPending: 100,
      maxSent: 500,
      defaultExpiry: 24 * 60 * 60 * 1000, // 24시간
      autoCleanup: true,
      cleanupInterval: 60 * 60 * 1000 // 1시간
    };

    if (this.config.autoCleanup) {
      this._startAutoCleanup();
    }
  }

  /**
   * 알림 생성
   */
  create(options) {
    const notification = new Notification(options);

    // 만료 시간이 없으면 기본값 설정
    if (!notification.expiresAt) {
      notification.expiresAt = new Date(
        Date.now() + this.config.defaultExpiry
      );
    }

    this.notifications.set(notification.id, notification);
    this.pending.push(notification);

    // 우선순위 정렬
    this.pending.sort((a, b) => b.priority - a.priority);

    // 큐 크기 제한
    if (this.pending.length > this.config.maxPending) {
      const removed = this.pending.pop();
      this.notifications.delete(removed.id);
    }

    // 이벤트 발생
    this._emit('notification:created', notification);

    return notification;
  }

  /**
   * 알림 전송
   */
  async send(notificationId) {
    const notification = this.notifications.get(notificationId);

    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    if (notification.status !== NOTIFICATION_STATUS.PENDING) {
      throw new Error(`Notification ${notificationId} is not pending`);
    }

    if (notification.isExpired()) {
      notification.markAsDismissed();
      this._emit('notification:expired', notification);
      return false;
    }

    try {
      // 실제 전송 로직 (WebSocket, Push 등)
      await this._deliverNotification(notification);

      notification.markAsSent();

      // pending에서 제거, sent에 추가
      const index = this.pending.findIndex(n => n.id === notificationId);
      if (index !== -1) {
        this.pending.splice(index, 1);
      }

      this.sent.push(notification);

      // sent 크기 제한
      if (this.sent.length > this.config.maxSent) {
        const removed = this.sent.shift();
        this.notifications.delete(removed.id);
      }

      this._emit('notification:sent', notification);

      return true;
    } catch (error) {
      notification.markAsFailed(error);
      this._emit('notification:failed', notification);
      throw error;
    }
  }

  /**
   * 모든 대기 중인 알림 전송
   */
  async sendAll() {
    const results = {
      sent: 0,
      failed: 0,
      expired: 0
    };

    const pendingCopy = [...this.pending];

    for (const notification of pendingCopy) {
      try {
        const success = await this.send(notification.id);
        if (success) {
          results.sent++;
        } else {
          results.expired++;
        }
      } catch (error) {
        results.failed++;
      }
    }

    return results;
  }

  /**
   * 알림 조회
   */
  get(notificationId) {
    return this.notifications.get(notificationId);
  }

  /**
   * 알림 목록 조회
   */
  getAll(options = {}) {
    const {
      status = null,
      type = null,
      sessionId = null,
      limit = 50,
      offset = 0
    } = options;

    let notifications = Array.from(this.notifications.values());

    // 필터링
    if (status) {
      notifications = notifications.filter(n => n.status === status);
    }

    if (type) {
      notifications = notifications.filter(n => n.type === type);
    }

    if (sessionId) {
      notifications = notifications.filter(
        n => n.metadata.sessionId === sessionId
      );
    }

    // 정렬 (최신순)
    notifications.sort((a, b) => b.createdAt - a.createdAt);

    // 페이지네이션
    const total = notifications.length;
    notifications = notifications.slice(offset, offset + limit);

    return {
      notifications: notifications.map(n => n.toJSON()),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * 알림 읽음 처리
   */
  markAsRead(notificationId) {
    const notification = this.notifications.get(notificationId);

    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    notification.markAsRead();
    this._emit('notification:read', notification);

    return notification;
  }

  /**
   * 알림 무시
   */
  dismiss(notificationId) {
    const notification = this.notifications.get(notificationId);

    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    notification.markAsDismissed();

    // pending에서 제거
    const index = this.pending.findIndex(n => n.id === notificationId);
    if (index !== -1) {
      this.pending.splice(index, 1);
    }

    this._emit('notification:dismissed', notification);

    return notification;
  }

  /**
   * 알림 삭제
   */
  delete(notificationId) {
    const notification = this.notifications.get(notificationId);

    if (!notification) {
      return false;
    }

    // pending에서 제거
    const pendingIndex = this.pending.findIndex(n => n.id === notificationId);
    if (pendingIndex !== -1) {
      this.pending.splice(pendingIndex, 1);
    }

    // sent에서 제거
    const sentIndex = this.sent.findIndex(n => n.id === notificationId);
    if (sentIndex !== -1) {
      this.sent.splice(sentIndex, 1);
    }

    this.notifications.delete(notificationId);
    this._emit('notification:deleted', notification);

    return true;
  }

  /**
   * 이벤트 리스너 등록
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event).push(callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  off(event, callback) {
    if (!this.listeners.has(event)) {
      return;
    }

    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);

    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * 이벤트 발생
   */
  _emit(event, data) {
    if (!this.listeners.has(event)) {
      return;
    }

    const callbacks = this.listeners.get(event);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * 알림 전달 (실제 전송 로직)
   */
  async _deliverNotification(notification) {
    // 실제로는 WebSocket, Push API 등 사용
    // 여기서는 로그만
    console.log(`📬 Notification: [${notification.type}] ${notification.title}`);

    // 시뮬레이션: 10% 실패율
    if (Math.random() < 0.1) {
      throw new Error('Delivery failed');
    }

    return true;
  }

  /**
   * 자동 정리 시작
   */
  _startAutoCleanup() {
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * 정리 작업
   */
  _cleanup() {
    let cleaned = 0;

    // 만료된 알림 제거
    this.notifications.forEach((notification, id) => {
      if (notification.isExpired() &&
          notification.status !== NOTIFICATION_STATUS.READ) {
        this.delete(id);
        cleaned++;
      }
    });

    // 읽은 알림 중 오래된 것 제거 (7일)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    this.notifications.forEach((notification, id) => {
      if (notification.status === NOTIFICATION_STATUS.READ &&
          notification.readAt < sevenDaysAgo) {
        this.delete(id);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} notifications`);
    }
  }

  /**
   * 통계
   */
  getStats() {
    const stats = {
      total: this.notifications.size,
      pending: this.pending.length,
      sent: this.sent.length,
      byType: {},
      byStatus: {},
      byPriority: {}
    };

    this.notifications.forEach(notification => {
      // 타입별
      stats.byType[notification.type] =
        (stats.byType[notification.type] || 0) + 1;

      // 상태별
      stats.byStatus[notification.status] =
        (stats.byStatus[notification.status] || 0) + 1;

      // 우선순위별
      stats.byPriority[notification.priority] =
        (stats.byPriority[notification.priority] || 0) + 1;
    });

    return stats;
  }

  /**
   * 정리 중지
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * 전역 인스턴스
 */
let globalNotificationManager = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getNotificationManager() {
  if (!globalNotificationManager) {
    globalNotificationManager = new NotificationManager();
  }
  return globalNotificationManager;
}

module.exports = {
  Notification,
  NotificationManager,
  getNotificationManager,
  NOTIFICATION_TYPE,
  NOTIFICATION_PRIORITY,
  NOTIFICATION_STATUS
};
