/**
 * worker-manager.js
 * 워커 관리 시스템
 *
 * Week 2: 알바 시스템 (Background Workers)
 *
 * 기능:
 * - 워커 풀 관리
 * - 작업 실행
 * - 워커별 전문 작업 처리
 */

const { getQueueManager, JOB_STATUS, JOB_TYPES } = require('./job-queue');
const { getSmartRouter } = require('./smart-router');
const { getMemoryManager } = require('./memory-layers');
const { RelationshipGraph, EntityExtractor } = require('./relationship-graph');

/**
 * BaseWorker 클래스
 * 모든 워커의 기본 클래스
 */
class BaseWorker {
  constructor(name) {
    this.name = name;
    this.isRunning = false;
    this.currentJob = null;
    this.stats = {
      processed: 0,
      failed: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * 작업 처리 (하위 클래스에서 구현)
   */
  async process(job) {
    throw new Error('process() must be implemented by subclass');
  }

  /**
   * 작업 실행
   */
  async execute(job) {
    if (this.isRunning) {
      throw new Error(`Worker ${this.name} is already running`);
    }

    this.isRunning = true;
    this.currentJob = job;

    const startTime = Date.now();

    try {
      const result = await Promise.race([
        this.process(job),
        this._timeout(job.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.stats.processed++;
      this.stats.totalProcessingTime += processingTime;

      return result;
    } catch (error) {
      this.stats.failed++;
      throw error;
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }
  }

  /**
   * 타임아웃
   */
  _timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Job timeout')), ms);
    });
  }

  /**
   * 통계
   */
  getStats() {
    return {
      name: this.name,
      isRunning: this.isRunning,
      currentJob: this.currentJob?.id || null,
      stats: {
        ...this.stats,
        avgProcessingTime: this.stats.processed > 0
          ? this.stats.totalProcessingTime / this.stats.processed
          : 0
      }
    };
  }
}

/**
 * SummarizationWorker
 * 대화 요약 작업
 */
class SummarizationWorker extends BaseWorker {
  constructor() {
    super('summarization');
  }

  async process(job) {
    const { messages, maxLength = 200 } = job.data;

    if (!messages || messages.length === 0) {
      throw new Error('No messages to summarize');
    }

    // 스마트 라우팅으로 저렴한 모델 사용 (Haiku)
    const router = getSmartRouter();
    const routingResult = await router.route('요약 작업', {});

    // 실제로는 AI API 호출
    // 여기서는 간단한 mock
    const summary = this._mockSummarize(messages, maxLength);

    return {
      summary,
      messageCount: messages.length,
      model: routingResult.modelName
    };
  }

  _mockSummarize(messages, maxLength) {
    // 간단한 요약: 처음 N개 단어
    const combined = messages.map(m => m.content).join(' ');
    const words = combined.split(/\s+/);

    if (words.length <= maxLength / 5) {
      return combined;
    }

    return words.slice(0, Math.floor(maxLength / 5)).join(' ') + '...';
  }
}

/**
 * EntityExtractionWorker
 * 엔티티 추출 작업
 */
class EntityExtractionWorker extends BaseWorker {
  constructor() {
    super('entity-extraction');
  }

  async process(job) {
    const { text } = job.data;

    if (!text) {
      throw new Error('No text to extract entities from');
    }

    const extractor = new EntityExtractor();
    const entities = extractor.extractEntities(text);

    return {
      entities,
      count: entities.length
    };
  }
}

/**
 * TagGenerationWorker
 * 태그 생성 작업
 */
class TagGenerationWorker extends BaseWorker {
  constructor() {
    super('tag-generation');
  }

  async process(job) {
    const { text, maxTags = 5 } = job.data;

    if (!text) {
      throw new Error('No text to generate tags from');
    }

    // 간단한 키워드 기반 태그 생성
    const tags = this._extractTags(text, maxTags);

    return {
      tags,
      count: tags.length
    };
  }

  _extractTags(text, maxTags) {
    // 단어 빈도 분석
    const words = text.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3); // 3글자 이상

    const freq = new Map();
    words.forEach(word => {
      freq.set(word, (freq.get(word) || 0) + 1);
    });

    // 빈도순 정렬
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTags)
      .map(([word]) => word);
  }
}

/**
 * SentimentAnalysisWorker
 * 감정 분석 작업
 */
class SentimentAnalysisWorker extends BaseWorker {
  constructor() {
    super('sentiment-analysis');
  }

  async process(job) {
    const { text } = job.data;

    if (!text) {
      throw new Error('No text to analyze sentiment');
    }

    const sentiment = this._analyzeSentiment(text);

    return sentiment;
  }

  _analyzeSentiment(text) {
    // 간단한 키워드 기반 감정 분석
    const positive = ['좋', '훌륭', '멋진', '완벽', '성공', 'good', 'great', 'excellent', '감사'];
    const negative = ['나쁜', '문제', '실패', '오류', 'bad', 'error', 'fail', '죄송'];

    const lowerText = text.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;

    positive.forEach(word => {
      if (lowerText.includes(word)) positiveCount++;
    });

    negative.forEach(word => {
      if (lowerText.includes(word)) negativeCount++;
    });

    const total = positiveCount + negativeCount;
    if (total === 0) {
      return { sentiment: 'neutral', score: 0, confidence: 0.5 };
    }

    const score = (positiveCount - negativeCount) / total;
    let sentiment = 'neutral';

    if (score > 0.2) sentiment = 'positive';
    else if (score < -0.2) sentiment = 'negative';

    return {
      sentiment,
      score,
      confidence: Math.abs(score),
      positiveCount,
      negativeCount
    };
  }
}

/**
 * ArchiveWorker
 * 메모리 아카이빙 작업
 */
class ArchiveWorker extends BaseWorker {
  constructor() {
    super('archive');
  }

  async process(job) {
    const { sessionId } = job.data;

    if (!sessionId) {
      throw new Error('No sessionId provided');
    }

    const memoryManager = await getMemoryManager();

    // 메모리 아카이빙
    await memoryManager.archiveOldMessages(sessionId);

    return {
      sessionId,
      archived: true,
      timestamp: new Date()
    };
  }
}

/**
 * CleanupWorker
 * 정리 작업
 */
class CleanupWorker extends BaseWorker {
  constructor() {
    super('cleanup');
  }

  async process(job) {
    const { type, options = {} } = job.data;

    switch (type) {
      case 'expired_sessions':
        return this._cleanExpiredSessions(options);

      case 'old_logs':
        return this._cleanOldLogs(options);

      default:
        throw new Error(`Unknown cleanup type: ${type}`);
    }
  }

  async _cleanExpiredSessions(options) {
    const { maxAge = 30 } = options; // 30일

    // 실제로는 세션 정리
    // Mock
    return {
      type: 'expired_sessions',
      cleaned: 0,
      maxAge
    };
  }

  async _cleanOldLogs(options) {
    const { maxAge = 7 } = options; // 7일

    // 실제로는 로그 정리
    // Mock
    return {
      type: 'old_logs',
      cleaned: 0,
      maxAge
    };
  }
}

/**
 * WorkerManager 클래스
 * 워커 풀 관리 및 작업 분배
 */
class WorkerManager {
  constructor() {
    this.workers = new Map();
    this.isRunning = false;
    this.pollInterval = null;

    // 워커 등록
    this._registerWorkers();
  }

  /**
   * 워커 등록
   */
  _registerWorkers() {
    this.registerWorker(JOB_TYPES.SUMMARIZE, new SummarizationWorker());
    this.registerWorker(JOB_TYPES.EXTRACT_ENTITIES, new EntityExtractionWorker());
    this.registerWorker(JOB_TYPES.GENERATE_TAGS, new TagGenerationWorker());
    this.registerWorker(JOB_TYPES.ANALYZE_SENTIMENT, new SentimentAnalysisWorker());
    this.registerWorker(JOB_TYPES.ARCHIVE, new ArchiveWorker());
    this.registerWorker(JOB_TYPES.CLEANUP, new CleanupWorker());
  }

  /**
   * 워커 등록
   */
  registerWorker(jobType, worker) {
    this.workers.set(jobType, worker);
  }

  /**
   * 워커 조회
   */
  getWorker(jobType) {
    return this.workers.get(jobType);
  }

  /**
   * 워커 매니저 시작
   */
  start(pollIntervalMs = 1000) {
    if (this.isRunning) {
      console.log('WorkerManager is already running');
      return;
    }

    this.isRunning = true;
    console.log('🔧 WorkerManager started');

    // 폴링 시작
    this.pollInterval = setInterval(() => {
      this._poll();
    }, pollIntervalMs);
  }

  /**
   * 워커 매니저 중지
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.log('🔧 WorkerManager stopped');
  }

  /**
   * 폴링 (큐에서 작업 가져와서 실행)
   */
  async _poll() {
    const queueManager = getQueueManager();

    // 각 큐 확인
    queueManager.queues.forEach(async (queue) => {
      const job = queue.getNext();

      if (!job) return;

      const worker = this.getWorker(job.type);

      if (!worker) {
        console.error(`No worker found for job type: ${job.type}`);
        queue.fail(job, new Error(`No worker for type ${job.type}`));
        return;
      }

      // 워커가 이미 실행 중이면 다시 큐에
      if (worker.isRunning) {
        queue.pending.unshift(job);
        return;
      }

      // 작업 시작
      queue.start(job);

      try {
        const result = await worker.execute(job);
        queue.complete(job, result);
      } catch (error) {
        console.error(`Worker ${worker.name} failed:`, error);
        queue.fail(job, error);
      }
    });
  }

  /**
   * 전체 상태
   */
  getStatus() {
    const workers = {};

    this.workers.forEach((worker, type) => {
      workers[type] = worker.getStats();
    });

    return {
      isRunning: this.isRunning,
      workers,
      queues: getQueueManager().getOverallStatus()
    };
  }
}

/**
 * 전역 인스턴스
 */
let globalWorkerManager = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getWorkerManager() {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager();
  }
  return globalWorkerManager;
}

module.exports = {
  BaseWorker,
  SummarizationWorker,
  EntityExtractionWorker,
  TagGenerationWorker,
  SentimentAnalysisWorker,
  ArchiveWorker,
  CleanupWorker,
  WorkerManager,
  getWorkerManager
};
