/**
 * event-listener.js
 * 이벤트 리스너 시스템
 *
 * Week 2: Proactive Messaging
 *
 * 기능:
 * - 작업 완료 이벤트 감지
 * - 에러 이벤트 감지
 * - 시스템 이벤트 감지
 * - 자동 알림 생성
 */

const { getNotificationManager, NOTIFICATION_TYPE, NOTIFICATION_PRIORITY } = require('./notification-manager');
const { getQueueManager, JOB_STATUS } = require('./job-queue');
const { getWorkerManager } = require('./worker-manager');
const { getGreetingSystem } = require('./greeting-system');

/**
 * 이벤트 타입
 */
const EVENT_TYPE = {
  JOB_COMPLETE: 'job_complete',
  JOB_FAILED: 'job_failed',
  JOB_RETRY: 'job_retry',
  WORKER_ERROR: 'worker_error',
  QUEUE_FULL: 'queue_full',
  SYSTEM_ERROR: 'system_error',
  SESSION_START: 'session_start',
  SESSION_IDLE: 'session_idle',
  MEMORY_LOW: 'memory_low'
};

/**
 * EventListener 클래스
 */
class EventListener {
  constructor() {
    this.notificationManager = getNotificationManager();
    this.isListening = false;
    this.handlers = new Map();
    this.stats = {
      eventsHandled: 0,
      notificationsSent: 0,
      errors: 0
    };

    // 핸들러 등록
    this._registerHandlers();
  }

  /**
   * 리스닝 시작
   */
  start() {
    if (this.isListening) {
      console.log('EventListener is already running');
      return;
    }

    this.isListening = true;
    console.log('👂 EventListener started');

    // 워커 매니저 이벤트 등록
    this._attachToWorkerManager();

    // 큐 매니저 이벤트 등록
    this._attachToQueueManager();

    // 알림 매니저 이벤트 등록
    this._attachToNotificationManager();
  }

  /**
   * 리스닝 중지
   */
  stop() {
    if (!this.isListening) {
      return;
    }

    this.isListening = false;
    console.log('👂 EventListener stopped');
  }

  /**
   * 핸들러 등록
   */
  _registerHandlers() {
    // 작업 완료
    this.registerHandler(EVENT_TYPE.JOB_COMPLETE, async (data) => {
      await this._handleJobComplete(data);
    });

    // 작업 실패
    this.registerHandler(EVENT_TYPE.JOB_FAILED, async (data) => {
      await this._handleJobFailed(data);
    });

    // 작업 재시도
    this.registerHandler(EVENT_TYPE.JOB_RETRY, async (data) => {
      await this._handleJobRetry(data);
    });

    // 워커 에러
    this.registerHandler(EVENT_TYPE.WORKER_ERROR, async (data) => {
      await this._handleWorkerError(data);
    });

    // 큐 가득 참
    this.registerHandler(EVENT_TYPE.QUEUE_FULL, async (data) => {
      await this._handleQueueFull(data);
    });

    // 세션 시작
    this.registerHandler(EVENT_TYPE.SESSION_START, async (data) => {
      await this._handleSessionStart(data);
    });

    // 세션 idle
    this.registerHandler(EVENT_TYPE.SESSION_IDLE, async (data) => {
      await this._handleSessionIdle(data);
    });
  }

  /**
   * 핸들러 등록
   */
  registerHandler(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    this.handlers.get(eventType).push(handler);
  }

  /**
   * 이벤트 발생
   */
  async emit(eventType, data) {
    if (!this.isListening) {
      return;
    }

    const handlers = this.handlers.get(eventType);

    if (!handlers || handlers.length === 0) {
      return;
    }

    this.stats.eventsHandled++;

    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
        this.stats.errors++;
      }
    }
  }

  /**
   * 워커 매니저에 연결
   */
  _attachToWorkerManager() {
    const workerManager = getWorkerManager();

    // 워커 매니저 이벤트를 직접 감지할 수 없으므로
    // 폴링으로 상태 확인 (실제로는 워커 매니저에 이벤트 시스템 추가 필요)
    this.workerCheckInterval = setInterval(() => {
      this._checkWorkerStatus();
    }, 5000);
  }

  /**
   * 큐 매니저에 연결
   */
  _attachToQueueManager() {
    const queueManager = getQueueManager();

    // 큐 상태 확인
    this.queueCheckInterval = setInterval(() => {
      this._checkQueueStatus();
    }, 10000);
  }

  /**
   * 알림 매니저에 연결
   */
  _attachToNotificationManager() {
    this.notificationManager.on('notification:failed', (notification) => {
      console.error('Notification delivery failed:', notification.id);
    });

    this.notificationManager.on('notification:sent', (notification) => {
      this.stats.notificationsSent++;
    });
  }

  /**
   * 워커 상태 확인
   */
  _checkWorkerStatus() {
    const workerManager = getWorkerManager();
    const status = workerManager.getStatus();

    // 실패한 작업이 많은지 확인
    Object.values(status.workers).forEach(worker => {
      if (worker.stats.failed > 10) {
        this.emit(EVENT_TYPE.WORKER_ERROR, {
          workerName: worker.name,
          failedCount: worker.stats.failed
        });
      }
    });
  }

  /**
   * 큐 상태 확인
   */
  _checkQueueStatus() {
    const queueManager = getQueueManager();
    const status = queueManager.getOverallStatus();

    Object.entries(status).forEach(([queueName, queueStatus]) => {
      // 큐가 가득 찼는지 확인
      if (queueStatus.pending > 90) {
        this.emit(EVENT_TYPE.QUEUE_FULL, {
          queueName,
          pending: queueStatus.pending
        });
      }
    });
  }

  /**
   * 작업 완료 핸들러
   */
  async _handleJobComplete(data) {
    const { job, result } = data;

    // 중요한 작업만 알림
    if (job.priority >= 8) {
      const notification = this.notificationManager.create({
        type: NOTIFICATION_TYPE.JOB_COMPLETE,
        priority: NOTIFICATION_PRIORITY.NORMAL,
        title: '작업 완료',
        message: `${job.type} 작업이 완료되었습니다.`,
        data: {
          jobId: job.id,
          jobType: job.type,
          result
        },
        sessionId: job.data.sessionId || null
      });

      await this.notificationManager.send(notification.id);
    }
  }

  /**
   * 작업 실패 핸들러
   */
  async _handleJobFailed(data) {
    const { job, error } = data;

    const notification = this.notificationManager.create({
      type: NOTIFICATION_TYPE.JOB_FAILED,
      priority: NOTIFICATION_PRIORITY.HIGH,
      title: '작업 실패',
      message: `${job.type} 작업이 실패했습니다: ${error}`,
      data: {
        jobId: job.id,
        jobType: job.type,
        error
      },
      sessionId: job.data.sessionId || null
    });

    await this.notificationManager.send(notification.id);
  }

  /**
   * 작업 재시도 핸들러
   */
  async _handleJobRetry(data) {
    const { job, retryCount } = data;

    // 3번 이상 재시도 시에만 알림
    if (retryCount >= 3) {
      const notification = this.notificationManager.create({
        type: NOTIFICATION_TYPE.WARNING,
        priority: NOTIFICATION_PRIORITY.NORMAL,
        title: '작업 재시도 중',
        message: `${job.type} 작업이 ${retryCount}번 재시도 중입니다.`,
        data: {
          jobId: job.id,
          jobType: job.type,
          retryCount
        },
        sessionId: job.data.sessionId || null
      });

      await this.notificationManager.send(notification.id);
    }
  }

  /**
   * 워커 에러 핸들러
   */
  async _handleWorkerError(data) {
    const { workerName, failedCount } = data;

    const notification = this.notificationManager.create({
      type: NOTIFICATION_TYPE.ERROR,
      priority: NOTIFICATION_PRIORITY.URGENT,
      title: '워커 에러',
      message: `${workerName} 워커에서 ${failedCount}개의 작업이 실패했습니다.`,
      data: {
        workerName,
        failedCount
      }
    });

    await this.notificationManager.send(notification.id);
  }

  /**
   * 큐 가득 참 핸들러
   */
  async _handleQueueFull(data) {
    const { queueName, pending } = data;

    const notification = this.notificationManager.create({
      type: NOTIFICATION_TYPE.WARNING,
      priority: NOTIFICATION_PRIORITY.HIGH,
      title: '큐 용량 경고',
      message: `${queueName} 큐에 ${pending}개의 작업이 대기 중입니다.`,
      data: {
        queueName,
        pending
      }
    });

    await this.notificationManager.send(notification.id);
  }

  /**
   * 세션 시작 핸들러
   */
  async _handleSessionStart(data) {
    const { sessionId } = data;

    // 안부 시스템 사용
    const greetingSystem = getGreetingSystem();
    await greetingSystem.sendAutoGreeting(sessionId);
  }

  /**
   * 세션 idle 핸들러
   */
  async _handleSessionIdle(data) {
    const { sessionId, idleTime } = data;

    // 1시간 이상 idle
    if (idleTime > 60 * 60 * 1000) {
      const notification = this.notificationManager.create({
        type: NOTIFICATION_TYPE.REMINDER,
        priority: NOTIFICATION_PRIORITY.LOW,
        title: '대화 재개',
        message: '오랜만이에요! 무엇을 도와드릴까요?',
        data: {
          idleTime
        },
        sessionId
      });

      await this.notificationManager.send(notification.id);
    }
  }

  /**
   * 수동 작업 완료 알림
   */
  async notifyJobComplete(job, result) {
    await this.emit(EVENT_TYPE.JOB_COMPLETE, { job, result });
  }

  /**
   * 수동 작업 실패 알림
   */
  async notifyJobFailed(job, error) {
    await this.emit(EVENT_TYPE.JOB_FAILED, { job, error });
  }

  /**
   * 수동 세션 시작 알림
   */
  async notifySessionStart(sessionId) {
    await this.emit(EVENT_TYPE.SESSION_START, { sessionId });
  }

  /**
   * 통계
   */
  getStats() {
    return {
      isListening: this.isListening,
      stats: this.stats,
      handlers: Array.from(this.handlers.keys())
    };
  }
}

/**
 * 전역 인스턴스
 */
let globalEventListener = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getEventListener() {
  if (!globalEventListener) {
    globalEventListener = new EventListener();
  }
  return globalEventListener;
}

module.exports = {
  EventListener,
  getEventListener,
  EVENT_TYPE
};
