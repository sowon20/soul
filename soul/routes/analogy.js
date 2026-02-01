const express = require('express');
const router = express.Router();
const analogyFinder = require('../utils/analogy-finder');

/**
 * POST /api/analogy/analyze
 * 비유 분석 - 전체 파이프라인
 *
 * Body:
 * - message: 분석할 메시지 (required)
 * - options: 옵션 (선택)
 *   - limit: 최대 비유 개수 (기본 3)
 *   - minScore: 최소 점수 (기본 15)
 *   - includeContext: 컨텍스트 프롬프트 생성 여부 (기본 true)
 *   - forceActivate: 강제 활성화 (기본 false)
 */
router.post('/analyze', async (req, res) => {
  try {
    const { message, options } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const result = await analogyFinder.analyze(message, options || {});

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error analyzing analogies:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/analogy/find
 * 비유 검색만 실행 (활성화 체크 없이)
 *
 * Body:
 * - message: 메시지
 * - options: 옵션
 */
router.post('/find', async (req, res) => {
  try {
    const { message, options } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const result = await analogyFinder.findAnalogies(message, options || {});

    res.json(result);
  } catch (error) {
    console.error('Error finding analogies:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/analogy/detect-patterns
 * 패턴 감지 (문제/해결/결과)
 *
 * Body:
 * - message: 메시지
 */
router.post('/detect-patterns', (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const patterns = analogyFinder.detectPatterns(message);

    res.json({
      success: true,
      patterns
    });
  } catch (error) {
    console.error('Error detecting patterns:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/analogy/should-activate
 * 선택적 활성화 체크
 *
 * Body:
 * - message: 메시지
 * - options: 옵션
 */
router.post('/should-activate', (req, res) => {
  try {
    const { message, options } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'message (string) is required'
      });
    }

    const activation = analogyFinder.shouldActivate(message, options || {});

    res.json({
      success: true,
      ...activation
    });
  } catch (error) {
    console.error('Error checking activation:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/analogy/config
 * 현재 비유 설정 조회
 */
router.get('/config', (req, res) => {
  try {
    const config = analogyFinder.getConfig();

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
 * PATCH /api/analogy/config
 * 비유 설정 업데이트
 *
 * Body:
 * - config: 설정 객체
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

    analogyFinder.updateConfig(config);

    res.json({
      success: true,
      config: analogyFinder.getConfig()
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
