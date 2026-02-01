/**
 * workers.js
 * 알바 시스템 API 라우트
 *
 * Week 2: 알바 시스템 (Background Workers)
 *
 * 엔드포인트:
 * - 작업 추가
 * - 작업 상태 조회
 * - 워커 관리
 * - 큐 관리
 */

const express = require('express');
const router = express.Router();
const { getQueueManager, JOB_TYPES, JOB_PRIORITY } = require('../utils/job-queue');
const { getWorkerManager } = require('../utils/worker-manager');

/**
 * POST /api/workers/jobs
 * 작업 추가
 */
router.post('/jobs', async (req, res) => {
  try {
    const { type, data, priority, maxRetries } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Job type is required'
      });
    }

    if (!Object.values(JOB_TYPES).includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid job type. Must be one of: ${Object.values(JOB_TYPES).join(', ')}`
      });
    }

    const queueManager = getQueueManager();
    const job = await queueManager.addJob(type, data || {}, {
      priority: priority || JOB_PRIORITY.NORMAL,
      maxRetries: maxRetries || 3
    });

    res.json({
      success: true,
      job: job.toJSON()
    });
  } catch (error) {
    console.error('Error adding job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/workers/jobs/:jobId
 * 작업 상태 조회
 */
router.get('/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    const queueManager = getQueueManager();
    let job = null;

    // 모든 큐에서 작업 찾기
    queueManager.queues.forEach(queue => {
      if (!job) {
        job = queue.get(jobId);
      }
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job: job.toJSON()
    });
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/workers/jobs/:jobId
 * 작업 취소
 */
router.delete('/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    const queueManager = getQueueManager();
    let cancelled = false;

    // 모든 큐에서 시도
    queueManager.queues.forEach(queue => {
      if (queue.cancel(jobId)) {
        cancelled = true;
      }
    });

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or cannot be cancelled'
      });
    }

    res.json({
      success: true,
      message: 'Job cancelled'
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/workers/status
 * 전체 시스템 상태
 */
router.get('/status', (req, res) => {
  try {
    const workerManager = getWorkerManager();
    const status = workerManager.getStatus();

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/workers/start
 * 워커 매니저 시작
 */
router.post('/start', (req, res) => {
  try {
    const { pollInterval = 1000 } = req.body;

    const workerManager = getWorkerManager();
    workerManager.start(pollInterval);

    res.json({
      success: true,
      message: 'WorkerManager started',
      pollInterval
    });
  } catch (error) {
    console.error('Error starting workers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/workers/stop
 * 워커 매니저 중지
 */
router.post('/stop', (req, res) => {
  try {
    const workerManager = getWorkerManager();
    workerManager.stop();

    res.json({
      success: true,
      message: 'WorkerManager stopped'
    });
  } catch (error) {
    console.error('Error stopping workers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/workers/queues
 * 모든 큐 상태
 */
router.get('/queues', (req, res) => {
  try {
    const queueManager = getQueueManager();
    const status = queueManager.getOverallStatus();

    res.json({
      success: true,
      queues: status
    });
  } catch (error) {
    console.error('Error getting queues:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/workers/queues/:queueName
 * 특정 큐 상세 정보
 */
router.get('/queues/:queueName', (req, res) => {
  try {
    const { queueName } = req.params;

    const queueManager = getQueueManager();
    const queue = queueManager.getQueue(queueName);

    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'Queue not found'
      });
    }

    res.json({
      success: true,
      queue: queue.toJSON()
    });
  } catch (error) {
    console.error('Error getting queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/workers/queues/:queueName
 * 큐 비우기
 */
router.delete('/queues/:queueName', (req, res) => {
  try {
    const { queueName } = req.params;

    const queueManager = getQueueManager();
    const queue = queueManager.getQueue(queueName);

    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'Queue not found'
      });
    }

    queue.clear();

    res.json({
      success: true,
      message: `Queue '${queueName}' cleared`
    });
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/workers/jobs/summarize
 * 편의 메서드: 요약 작업 추가
 */
router.post('/jobs/summarize', async (req, res) => {
  try {
    const { messages, maxLength = 200, priority } = req.body;

    if (!messages) {
      return res.status(400).json({
        success: false,
        error: 'Messages are required'
      });
    }

    const queueManager = getQueueManager();
    const job = await queueManager.addJob(
      JOB_TYPES.SUMMARIZE,
      { messages, maxLength },
      { priority: priority || JOB_PRIORITY.NORMAL }
    );

    res.json({
      success: true,
      job: job.toJSON()
    });
  } catch (error) {
    console.error('Error adding summarization job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/workers/jobs/extract-entities
 * 편의 메서드: 엔티티 추출 작업
 */
router.post('/jobs/extract-entities', async (req, res) => {
  try {
    const { text, priority } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const queueManager = getQueueManager();
    const job = await queueManager.addJob(
      JOB_TYPES.EXTRACT_ENTITIES,
      { text },
      { priority: priority || JOB_PRIORITY.NORMAL }
    );

    res.json({
      success: true,
      job: job.toJSON()
    });
  } catch (error) {
    console.error('Error adding entity extraction job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/workers/jobs/generate-tags
 * 편의 메서드: 태그 생성 작업
 */
router.post('/jobs/generate-tags', async (req, res) => {
  try {
    const { text, maxTags = 5, priority } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const queueManager = getQueueManager();
    const job = await queueManager.addJob(
      JOB_TYPES.GENERATE_TAGS,
      { text, maxTags },
      { priority: priority || JOB_PRIORITY.NORMAL }
    );

    res.json({
      success: true,
      job: job.toJSON()
    });
  } catch (error) {
    console.error('Error adding tag generation job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
