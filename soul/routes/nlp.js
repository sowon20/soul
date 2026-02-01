/**
 * nlp.js
 * 자연어 제어 API 라우트
 *
 * Phase: Week 1 - 자연어 제어 기초
 */

const express = require('express');
const router = express.Router();
const intentDetector = require('../utils/intent-detector');

/**
 * POST /api/nlp/detect
 * 의도 감지
 *
 * Body:
 * {
 *   "message": "메모리 패널 열어줘",
 *   "context": {
 *     "currentPanel": "none",
 *     "previousMessageWasQuestion": false
 *   }
 * }
 */
router.post('/detect', async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    const result = await intentDetector.detect(message, context || {});

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[NLP] Intent detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp/execute
 * 의도 감지 + 액션 제안
 *
 * Body:
 * {
 *   "message": "최근 10개 대화 보여줘",
 *   "context": {}
 * }
 */
router.post('/execute', async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    // 1. 의도 감지
    const intentResult = await intentDetector.detect(message, context || {});

    // 2. 액션 제안
    const action = intentDetector.suggestAction(intentResult);

    res.json({
      success: true,
      intent: intentResult,
      action,
      shouldExecute: intentResult.isCommand && intentResult.confidence >= 0.7
    });
  } catch (error) {
    console.error('[NLP] Execute error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp/batch
 * 여러 메시지 일괄 분석
 *
 * Body:
 * {
 *   "messages": ["메모리 보여줘", "설정 변경해줘", "안녕하세요"]
 * }
 */
router.post('/batch', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'messages array is required'
      });
    }

    const results = [];

    for (const message of messages) {
      try {
        const intentResult = await intentDetector.detect(message, {});
        const action = intentDetector.suggestAction(intentResult);

        results.push({
          message,
          intent: intentResult,
          action
        });
      } catch (error) {
        results.push({
          message,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      totalMessages: messages.length,
      results
    });
  } catch (error) {
    console.error('[NLP] Batch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp/patterns
 * 사용 가능한 패턴 목록 조회
 */
router.get('/patterns', (req, res) => {
  try {
    const patterns = intentDetector.patterns;
    const stats = intentDetector.getStats();

    const formattedPatterns = {};

    for (const [intent, patternList] of Object.entries(patterns)) {
      formattedPatterns[intent] = patternList.map(p => ({
        weight: p.weight,
        keywords: p.keywords,
        examples: p.examples
      }));
    }

    res.json({
      success: true,
      patterns: formattedPatterns,
      stats
    });
  } catch (error) {
    console.error('[NLP] Patterns error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp/intents
 * 사용 가능한 의도 목록 조회
 */
router.get('/intents', (req, res) => {
  try {
    const stats = intentDetector.getStats();

    res.json({
      success: true,
      intents: stats.categories,
      totalIntents: stats.totalIntents,
      totalPatterns: stats.totalPatterns
    });
  } catch (error) {
    console.error('[NLP] Intents error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nlp/config
 * NLP 설정 조회
 */
router.get('/config', (req, res) => {
  try {
    const stats = intentDetector.getStats();

    res.json({
      success: true,
      config: stats.config
    });
  } catch (error) {
    console.error('[NLP] Config get error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/nlp/config
 * NLP 설정 업데이트
 *
 * Body:
 * {
 *   "config": {
 *     "minConfidence": 0.8,
 *     "enableFuzzyMatching": false
 *   }
 * }
 */
router.patch('/config', (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'config object is required'
      });
    }

    intentDetector.updateConfig(config);

    res.json({
      success: true,
      message: 'NLP config updated',
      newConfig: intentDetector.config
    });
  } catch (error) {
    console.error('[NLP] Config update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nlp/examples
 * 예제 테스트
 *
 * 미리 정의된 예제들을 테스트
 */
router.post('/examples', async (req, res) => {
  try {
    const examples = [
      'React 대화 찾아줘',
      '메모리 전체 보여줘',
      '이 대화 삭제해',
      '모델 바꿔줘',
      '메모리 패널 열어',
      '탭으로 바꿔',
      '새 대화 시작',
      '도움말',
      '안녕하세요'
    ];

    const results = [];

    for (const message of examples) {
      const intentResult = await intentDetector.detect(message, {});
      const action = intentDetector.suggestAction(intentResult);

      results.push({
        message,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        entities: intentResult.entities,
        suggestedAction: action.action,
        endpoint: action.endpoint
      });
    }

    res.json({
      success: true,
      totalExamples: examples.length,
      results
    });
  } catch (error) {
    console.error('[NLP] Examples error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
