/**
 * nlp-advanced.js
 * 고도화된 NLP API 라우트
 *
 * Week 2: 자연어 설정 고도화
 *
 * 엔드포인트:
 * - 고도화된 의도 감지
 * - 컨텍스트 추적
 * - 패턴 학습
 * - 선호도 관리
 */

const express = require('express');
const router = express.Router();
const { getAdvancedIntentDetector } = require('../utils/intent-detector-advanced');
const { getContextTracker } = require('../utils/context-tracker');
const { getPatternLearner } = require('../utils/pattern-learner');

/**
 * POST /api/nlp-advanced/detect
 * 고도화된 의도 감지
 */
router.post('/detect', async (req, res) => {
  try {
    const {
      message,
      sessionId = 'main-conversation',
      messageId = null,
      includeContext = true,
      includePatterns = true
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const detector = getAdvancedIntentDetector();

    const result = await detector.detect(sessionId, message, {
      messageId,
      includeContext,
      includePatterns
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error detecting intent:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp-advanced/feedback
 * 의도 감지 피드백 (학습)
 */
router.post('/feedback', async (req, res) => {
  try {
    const {
      message,
      sessionId = 'main-conversation',
      detectedIntent,
      correctIntent
    } = req.body;

    if (!message || !detectedIntent) {
      return res.status(400).json({
        success: false,
        error: 'Message and detectedIntent are required'
      });
    }

    const detector = getAdvancedIntentDetector();

    const result = await detector.provideFeedback(
      sessionId,
      message,
      detectedIntent,
      correctIntent
    );

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error providing feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp-advanced/context/:sessionId
 * 현재 컨텍스트 조회
 */
router.get('/context/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const contextTracker = getContextTracker();
    const context = contextTracker.getCurrent(sessionId);

    res.json({
      success: true,
      context
    });
  } catch (error) {
    console.error('Error getting context:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp-advanced/context/extract
 * 메시지에서 컨텍스트 추출
 */
router.post('/context/extract', (req, res) => {
  try {
    const {
      message,
      sessionId = 'main-conversation',
      messageId = Date.now().toString()
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const contextTracker = getContextTracker();
    const extracted = contextTracker.extractFromMessage(
      sessionId,
      message,
      messageId
    );

    res.json({
      success: true,
      extracted: extracted.map(item => item.toJSON())
    });
  } catch (error) {
    console.error('Error extracting context:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp-advanced/context/resolve
 * 대명사 해소
 */
router.post('/context/resolve', (req, res) => {
  try {
    const {
      reference,
      sessionId = 'main-conversation'
    } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Reference is required'
      });
    }

    const contextTracker = getContextTracker();
    const resolved = contextTracker.resolveReference(sessionId, reference);

    res.json({
      success: true,
      resolved: resolved ? resolved.toJSON() : null
    });
  } catch (error) {
    console.error('Error resolving reference:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/nlp-advanced/context/:sessionId
 * 컨텍스트 초기화
 */
router.delete('/context/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const contextTracker = getContextTracker();
    contextTracker.clear(sessionId);

    res.json({
      success: true,
      message: 'Context cleared'
    });
  } catch (error) {
    console.error('Error clearing context:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp-advanced/patterns/:sessionId
 * 학습된 패턴 조회
 */
router.get('/patterns/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const patternLearner = getPatternLearner();
    const stats = patternLearner.getStats(sessionId);

    res.json({
      success: true,
      patterns: stats
    });
  } catch (error) {
    console.error('Error getting patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp-advanced/patterns/apply
 * 학습된 패턴 적용
 */
router.post('/patterns/apply', (req, res) => {
  try {
    const {
      message,
      sessionId = 'main-conversation'
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const patternLearner = getPatternLearner();
    const matches = patternLearner.applyPatterns(sessionId, message);

    res.json({
      success: true,
      matches
    });
  } catch (error) {
    console.error('Error applying patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp-advanced/patterns/:sessionId/analyze
 * 패턴 분석
 */
router.get('/patterns/:sessionId/analyze', (req, res) => {
  try {
    const { sessionId } = req.params;

    const patternLearner = getPatternLearner();
    const analysis = patternLearner.analyzePatterns(sessionId);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Error analyzing patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp-advanced/patterns/:sessionId/history
 * 학습 히스토리
 */
router.get('/patterns/:sessionId/history', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = '20' } = req.query;

    const patternLearner = getPatternLearner();
    const history = patternLearner.getHistory(sessionId, parseInt(limit));

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp-advanced/preferences
 * 선호도 설정
 */
router.post('/preferences', (req, res) => {
  try {
    const {
      sessionId = 'main-conversation',
      key,
      value
    } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required'
      });
    }

    const detector = getAdvancedIntentDetector();
    detector.setPreference(sessionId, key, value);

    res.json({
      success: true,
      message: 'Preference set',
      preference: { key, value }
    });
  } catch (error) {
    console.error('Error setting preference:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp-advanced/preferences/:sessionId/:key
 * 선호도 조회
 */
router.get('/preferences/:sessionId/:key', (req, res) => {
  try {
    const { sessionId, key } = req.params;
    const { defaultValue = null } = req.query;

    const detector = getAdvancedIntentDetector();
    const value = detector.getPreference(sessionId, key, defaultValue);

    res.json({
      success: true,
      preference: {
        key,
        value
      }
    });
  } catch (error) {
    console.error('Error getting preference:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp-advanced/shortcuts
 * 단축 표현 등록
 */
router.post('/shortcuts', (req, res) => {
  try {
    const {
      sessionId = 'main-conversation',
      shortcut,
      fullCommand
    } = req.body;

    if (!shortcut || !fullCommand) {
      return res.status(400).json({
        success: false,
        error: 'Shortcut and fullCommand are required'
      });
    }

    const detector = getAdvancedIntentDetector();
    detector.registerShortcut(sessionId, shortcut, fullCommand);

    res.json({
      success: true,
      message: 'Shortcut registered',
      shortcut: {
        shortcut,
        fullCommand
      }
    });
  } catch (error) {
    console.error('Error registering shortcut:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp-advanced/shortcuts/resolve
 * 단축 표현 해소
 */
router.post('/shortcuts/resolve', (req, res) => {
  try {
    const {
      sessionId = 'main-conversation',
      shortcut
    } = req.body;

    if (!shortcut) {
      return res.status(400).json({
        success: false,
        error: 'Shortcut is required'
      });
    }

    const detector = getAdvancedIntentDetector();
    const fullCommand = detector.resolveShortcut(sessionId, shortcut);

    res.json({
      success: true,
      resolved: fullCommand !== null,
      fullCommand
    });
  } catch (error) {
    console.error('Error resolving shortcut:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp-advanced/stats/:sessionId
 * 통합 통계
 */
router.get('/stats/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const detector = getAdvancedIntentDetector();
    const stats = detector.getStats(sessionId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp-advanced/analyze/:sessionId
 * 종합 분석
 */
router.get('/analyze/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const detector = getAdvancedIntentDetector();
    const analysis = await detector.analyze(sessionId);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Error analyzing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/nlp-advanced/:sessionId
 * 세션 초기화
 */
router.delete('/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const detector = getAdvancedIntentDetector();
    detector.clear(sessionId);

    res.json({
      success: true,
      message: 'Session cleared'
    });
  } catch (error) {
    console.error('Error clearing session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
