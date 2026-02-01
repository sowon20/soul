/**
 * Bootstrap Routes
 * 앱 초기 설정 관련 API
 */

const express = require('express');
const router = express.Router();
const bootstrap = require('../utils/bootstrap');
const configManager = require('../utils/config');

/**
 * GET /api/bootstrap/status
 * 부트스트랩 상태 확인
 */
router.get('/status', async (req, res) => {
  try {
    const status = bootstrap.getBootstrapStatus();

    // DB에서 저장소 설정도 확인
    const storageConfig = await configManager.getStorageConfig();

    res.json({
      ...status,
      currentStorage: storageConfig
    });
  } catch (error) {
    console.error('Error getting bootstrap status:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/bootstrap/complete
 * 부트스트랩 완료 처리
 */
router.post('/complete', async (req, res) => {
  try {
    const { storageType, storagePath, ftp, oracle, notion } = req.body;

    // 저장소 경로 유효성 검사 (로컬인 경우)
    if (storageType === 'local') {
      const validation = bootstrap.validateAndCreateStoragePath(storagePath);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid storage path',
          message: validation.error
        });
      }
    }

    // DB에 저장소 설정 저장
    await configManager.updateStorageConfig({
      type: storageType || 'local',
      path: storagePath || '~/.soul',
      ftp: ftp || null,
      oracle: oracle || null,
      notion: notion || null
    });

    // 부트스트랩 완료 표시
    bootstrap.markBootstrapComplete({
      type: storageType || 'local',
      path: storagePath || '~/.soul'
    });

    res.json({
      success: true,
      message: 'Bootstrap complete'
    });
  } catch (error) {
    console.error('Error completing bootstrap:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/bootstrap/validate-path
 * 저장소 경로 유효성 검사
 */
router.post('/validate-path', (req, res) => {
  try {
    const { path: inputPath } = req.body;

    if (!inputPath) {
      return res.status(400).json({
        error: 'Path is required'
      });
    }

    const validation = bootstrap.validateAndCreateStoragePath(inputPath);

    res.json({
      valid: validation.valid,
      resolved: validation.resolved,
      error: validation.error
    });
  } catch (error) {
    console.error('Error validating path:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/bootstrap/reset
 * 부트스트랩 리셋 (재설정)
 */
router.post('/reset', (req, res) => {
  try {
    bootstrap.resetBootstrap();
    res.json({
      success: true,
      message: 'Bootstrap reset'
    });
  } catch (error) {
    console.error('Error resetting bootstrap:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
