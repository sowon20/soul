const express = require('express');
const router = express.Router();
const tokenCounter = require('../utils/token-counter');
const contextCompressor = require('../utils/context-compressor');

/**
 * GET /api/context-mgmt/analyze
 * 현재 컨텍스트 사용량 분석
 *
 * Query:
 * - model: 모델명 (선택)
 *
 * Body:
 * - messages: 메시지 배열
 */
router.post('/analyze', async (req, res) => {
  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'messages (array) is required'
      });
    }

    const modelName = model || req.query.model || 'default';
    const usage = tokenCounter.analyzeUsage(messages, modelName);

    res.json({
      success: true,
      usage
    });
  } catch (error) {
    console.error('Error analyzing context:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context-mgmt/estimate-tokens
 * 텍스트의 토큰 수 추정
 */
router.post('/estimate-tokens', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'text (string) is required'
      });
    }

    const tokens = tokenCounter.estimateTokens(text);

    res.json({
      success: true,
      tokens,
      text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
    });
  } catch (error) {
    console.error('Error estimating tokens:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context-mgmt/compress
 * 메시지 압축 실행
 *
 * Body:
 * - messages: 메시지 배열
 * - model: 모델명 (선택)
 * - options: 압축 옵션 (선택)
 */
router.post('/compress', async (req, res) => {
  try {
    const { messages, model, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'messages (array) is required'
      });
    }

    const modelName = model || 'default';
    const result = await contextCompressor.compressMessages(
      messages,
      modelName,
      options || {}
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error compressing context:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context-mgmt/should-compress
 * 자동 압축 필요 여부 체크
 */
router.post('/should-compress', async (req, res) => {
  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'messages (array) is required'
      });
    }

    const modelName = model || 'default';
    const result = contextCompressor.shouldAutoCompress(messages, modelName);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error checking compression need:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/context-mgmt/session-summary
 * 세션 요약 생성
 */
router.post('/session-summary', async (req, res) => {
  try {
    const { messages, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'messages (array) is required'
      });
    }

    const summary = await contextCompressor.generateSessionSummary(
      messages,
      options || {}
    );

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error generating session summary:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/context-mgmt/restore/:conversationId
 * 압축된 세션 복원
 */
router.get('/restore/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await contextCompressor.restoreCompressedSession(conversationId);

    res.json({
      success: true,
      messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Error restoring session:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/context-mgmt/config
 * 현재 압축 설정 조회
 */
router.get('/config', (req, res) => {
  try {
    const config = contextCompressor.getConfig();

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * PATCH /api/context-mgmt/config
 * 압축 설정 업데이트
 */
router.patch('/config', (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'config (object) is required'
      });
    }

    contextCompressor.updateConfig(config);

    res.json({
      success: true,
      config: contextCompressor.getConfig()
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/context-mgmt/model-limits
 * 모든 모델의 컨텍스트 제한 조회
 */
router.get('/model-limits', (req, res) => {
  try {
    const limits = tokenCounter.MODEL_LIMITS;

    res.json({
      success: true,
      limits
    });
  } catch (error) {
    console.error('Error getting model limits:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
