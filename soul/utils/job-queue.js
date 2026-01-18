/**
 * job-queue.js
 * 작업 큐 시스템
 *
 * Week 2: 알바 시스템 (Background Workers)
 *
 * 기능:
 * - 비동기 작업 큐 관리
 * - 우선순위 기반 스케줄링
 * - 재시도 로직
 * - 작업 상태 추적
 */

/**
 * 작업 상태
 */
const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying'
};

/**
 * 작업 우선순위
 */
const JOB_PRIORITY = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 8,
  URGENT: 10
};

/**
 * 작업 유형
 */
const JOB_TYPES = {
  SUMMARIZE: 'summarize',           // 대화 요약
  EXTRACT_ENTITIES: 'extract_entities',  // 엔티티 추출
  GENERATE_TAGS: 'generate_tags',   // 태그 생성
  ANALYZE_SENTIMENT: 'analyze_sentiment',  // 감정 분석
  VISION: 'vision',                 // 이미지 분석
  TTS: 'tts',                       // Text-to-Speech
  STT: 'stt',                       // Speech-to-Text
  ARCHIVE: 'archive',               // 메모리 아카이빙
  CLEANUP: 'cleanup'                // 정리 작업
};

/**
 * Job 클래스
 */
class Job {
  constructor(options) {
    this.id = options.id || this._generateId();
    this.type = options.type;
    this.data = options.data || {};
    this.priority = options.priority || JOB_PRIORITY.NORMAL;
    this.status = JOB_STATUS.PENDING;
    this.retries = 0;
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 60000; // 60초
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
    this.result = null;
  }

  _generateId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      data: this.data,
      priority: this.priority,
      status: this.status,
      retries: this.retries,
      maxRetries: this.maxRetries,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
      result: this.result
    };
  }
}

/**
 * JobQueue 클래스
 * 우선순위 기반 작업 큐
 */
class JobQueue {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.jobs = new Map();
    this.pending = [];
    this.running = new Set();
    this.completed = [];
    this.failed = [];

    this.config = {
      maxConcurrent: options.maxConcurrent || 3,
      enableRetry: options.enableRetry !== false,
      retryDelay: options.retryDelay || 5000,
      maxQueueSize: options.maxQueueSize || 1000
    };

    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      avgProcessingTime: 0
    };
  }

  /**
   * 작업 추가
   */
  async add(jobOptions) {
    if (this.pending.length >= this.config.maxQueueSize) {
      throw new Error('Queue is full');
    }

    const job = new Job(jobOptions);
    this.jobs.set(job.id, job);
    this.pending.push(job);

    // 우선순위 정렬 (높은 우선순위가 앞으로)
    this.pending.sort((a, b) => b.priority - a.priority);

    this.stats.totalJobs++;

    return job;
  }

  /**
   * 다음 작업 가져오기
   */
  getNext() {
    if (this.pending.length === 0) {
      return null;
    }

    if (this.running.size >= this.config.maxConcurrent) {
      return null;
    }

    return this.pending.shift();
  }

  /**
   * 작업 시작
   */
  start(job) {
    job.status = JOB_STATUS.RUNNING;
    job.startedAt = new Date();
    this.running.add(job.id);
  }

  /**
   * 작업 완료
   */
  complete(job, result) {
    job.status = JOB_STATUS.COMPLETED;
    job.completedAt = new Date();
    job.result = result;

    this.running.delete(job.id);
    this.completed.push(job);

    // 최대 100개 보관
    if (this.completed.length > 100) {
      this.completed.shift();
    }

    this.stats.completedJobs++;
    this._updateAvgProcessingTime(job);
  }

  /**
   * 작업 실패
   */
  fail(job, error) {
    job.error = error.message || String(error);

    // 재시도 가능?
    if (this.config.enableRetry && job.retries < job.maxRetries) {
      job.status = JOB_STATUS.RETRYING;
      job.retries++;

      this.running.delete(job.id);

      // 재시도 지연 후 다시 큐에 추가
      setTimeout(() => {
        job.status = JOB_STATUS.PENDING;
        this.pending.push(job);
        this.pending.sort((a, b) => b.priority - a.priority);
      }, this.config.retryDelay);
    } else {
      // 최종 실패
      job.status = JOB_STATUS.FAILED;
      job.completedAt = new Date();

      this.running.delete(job.id);
      this.failed.push(job);

      // 최대 100개 보관
      if (this.failed.length > 100) {
        this.failed.shift();
      }

      this.stats.failedJobs++;
    }
  }

  /**
   * 작업 조회
   */
  get(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * 작업 취소
   */
  cancel(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === JOB_STATUS.PENDING) {
      const index = this.pending.findIndex(j => j.id === jobId);
      if (index !== -1) {
        this.pending.splice(index, 1);
        this.jobs.delete(jobId);
        return true;
      }
    }

    return false;
  }

  /**
   * 큐 상태
   */
  getStatus() {
    return {
      name: this.name,
      pending: this.pending.length,
      running: this.running.size,
      completed: this.completed.length,
      failed: this.failed.length,
      stats: this.stats
    };
  }

  /**
   * 큐 비우기
   */
  clear() {
    this.pending = [];
    this.running.clear();
    // completed와 failed는 유지 (통계용)
  }

  /**
   * 평균 처리 시간 업데이트
   */
  _updateAvgProcessingTime(job) {
    const processingTime = job.completedAt - job.startedAt;
    const n = this.stats.completedJobs;

    this.stats.avgProcessingTime =
      (this.stats.avgProcessingTime * (n - 1) + processingTime) / n;
  }

  /**
   * 큐 직렬화
   */
  toJSON() {
    return {
      name: this.name,
      config: this.config,
      status: this.getStatus(),
      pending: this.pending.map(j => j.toJSON()),
      running: Array.from(this.running).map(id => this.jobs.get(id).toJSON()),
      completed: this.completed.slice(-10).map(j => j.toJSON()),
      failed: this.failed.slice(-10).map(j => j.toJSON())
    };
  }
}

/**
 * QueueManager 클래스
 * 여러 큐 관리
 */
class QueueManager {
  constructor() {
    this.queues = new Map();

    // 기본 큐 생성
    this.createQueue('default', { maxConcurrent: 3 });
    this.createQueue('summarization', { maxConcurrent: 2 });
    this.createQueue('analysis', { maxConcurrent: 2 });
    this.createQueue('media', { maxConcurrent: 1 }); // Vision, TTS, STT
    this.createQueue('maintenance', { maxConcurrent: 1 });
  }

  /**
   * 큐 생성
   */
  createQueue(name, options = {}) {
    if (this.queues.has(name)) {
      throw new Error(`Queue '${name}' already exists`);
    }

    const queue = new JobQueue({ ...options, name });
    this.queues.set(name, queue);

    return queue;
  }

  /**
   * 큐 조회
   */
  getQueue(name) {
    return this.queues.get(name);
  }

  /**
   * 작업 추가 (적절한 큐에)
   */
  async addJob(type, data, options = {}) {
    let queueName = 'default';

    // 작업 유형별 큐 선택
    switch (type) {
      case JOB_TYPES.SUMMARIZE:
      case JOB_TYPES.GENERATE_TAGS:
        queueName = 'summarization';
        break;

      case JOB_TYPES.EXTRACT_ENTITIES:
      case JOB_TYPES.ANALYZE_SENTIMENT:
        queueName = 'analysis';
        break;

      case JOB_TYPES.VISION:
      case JOB_TYPES.TTS:
      case JOB_TYPES.STT:
        queueName = 'media';
        break;

      case JOB_TYPES.ARCHIVE:
      case JOB_TYPES.CLEANUP:
        queueName = 'maintenance';
        break;
    }

    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    return queue.add({
      type,
      data,
      ...options
    });
  }

  /**
   * 전체 상태
   */
  getOverallStatus() {
    const status = {};

    this.queues.forEach((queue, name) => {
      status[name] = queue.getStatus();
    });

    return status;
  }

  /**
   * 모든 큐 비우기
   */
  clearAll() {
    this.queues.forEach(queue => queue.clear());
  }
}

/**
 * 전역 인스턴스
 */
let globalQueueManager = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getQueueManager() {
  if (!globalQueueManager) {
    globalQueueManager = new QueueManager();
  }
  return globalQueueManager;
}

module.exports = {
  Job,
  JobQueue,
  QueueManager,
  getQueueManager,
  JOB_STATUS,
  JOB_PRIORITY,
  JOB_TYPES
};
