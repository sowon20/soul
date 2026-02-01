const express = require('express');
const router = express.Router();
const contextDetector = require('../utils/context-detector');

/**
 * POST /api/context/detect
 * 메시지에서 맥락 감지 및 관련 메모리 검색
 *
 * Body:
 * {
 *   message: string,
 *   options: {
 *     triggerConfig: {
 *       minKeywords: number,
 *       requireTimeRef: boolean,
 *       requireTopicRef: boolean,
 *       minConfidence: number
 *     },
 *     searchOptions: {
 *       limit: number,
 *       minRelevance: number,
 *       timeWindow: 'recent' | 'week' | 'month' | null
 *     },
 *     autoTrigger: boolean
 *   }
 * }
 */
router.post('/detect', async (req, res) => {
  try {
    const { message, options } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const result = await contextDetector.detectAndRetrieve(message, options || {});

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error detecting context:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context/extract-keywords
 * 메시지에서 키워드만 추출
 */
router.post('/extract-keywords', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const extracted = contextDetector.extractKeywords(message);

    res.json({
      success: true,
      extracted
    });
  } catch (error) {
    console.error('Error extracting keywords:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context/evaluate-trigger
 * 트리거 조건 평가
 */
router.post('/evaluate-trigger', async (req, res) => {
  try {
    const { message, triggerConfig } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const extracted = contextDetector.extractKeywords(message);
    const triggerResult = contextDetector.evaluateTrigger(extracted, triggerConfig || {});

    res.json({
      success: true,
      extracted,
      trigger: triggerResult
    });
  } catch (error) {
    console.error('Error evaluating trigger:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context/find-memories
 * 추출된 키워드로 관련 메모리 검색
 */
router.post('/find-memories', async (req, res) => {
  try {
    const { message, searchOptions } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const extracted = contextDetector.extractKeywords(message);
    const memories = await contextDetector.findRelatedMemories(extracted, searchOptions || {});

    res.json({
      success: true,
      extracted,
      memories
    });
  } catch (error) {
    console.error('Error finding memories:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context/generate-prompt
 * 시스템 프롬프트 생성
 */
router.post('/generate-prompt', async (req, res) => {
  try {
    const { message, options } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const result = await contextDetector.detectAndRetrieve(message, options || {});
    const prompt = contextDetector.generateContextPrompt(result);

    res.json({
      success: true,
      prompt,
      shouldInject: result.shouldInject,
      detectionResult: result
    });
  } catch (error) {
    console.error('Error generating prompt:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context/check-spam
 * 스팸 방지 체크
 */
router.post('/check-spam', async (req, res) => {
  try {
    const { recentInjections, config } = req.body;

    if (!Array.isArray(recentInjections)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'recentInjections must be an array'
      });
    }

    const spamCheck = contextDetector.checkSpamPrevention(recentInjections, config || {});

    res.json({
      success: true,
      ...spamCheck
    });
  } catch (error) {
    console.error('Error checking spam prevention:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
