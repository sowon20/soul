/**
 * Storage Routes
 * 스토리지 관리 및 디렉토리 탐색 API
 */

const express = require('express');
const router = express.Router();
const { getStorageManager, LocalStorageAdapter } = require('../storage');

/**
 * GET /api/storage/types
 * 사용 가능한 스토리지 타입 목록
 */
router.get('/types', (req, res) => {
  const manager = getStorageManager();
  res.json({
    success: true,
    types: manager.getAvailableTypes(),
    current: manager.currentType
  });
});

/**
 * GET /api/storage/info
 * 현재 스토리지 정보
 */
router.get('/info', (req, res) => {
  const manager = getStorageManager();
  res.json({
    success: true,
    storage: manager.getInfo()
  });
});

/**
 * POST /api/storage/set
 * 스토리지 타입 변경
 */
router.post('/set', async (req, res) => {
  try {
    const { type, config } = req.body;
    const manager = getStorageManager();
    const info = await manager.setStorage(type, config);
    
    res.json({ success: true, storage: info });
  } catch (error) {
    console.error('Storage set error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/storage/browse/roots
 * 루트 디렉토리 목록 (드라이브, 볼륨 등)
 */
router.get('/browse/roots', async (req, res) => {
  try {
    const roots = await LocalStorageAdapter.getRoots();
    res.json({ success: true, items: roots });
  } catch (error) {
    console.error('Browse roots error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/storage/browse
 * 디렉토리 내용 조회
 */
router.get('/browse', async (req, res) => {
  try {
    const { path: dirPath } = req.query;
    
    if (!dirPath) {
      // 경로 없으면 루트 목록
      const roots = await LocalStorageAdapter.getRoots();
      return res.json({ success: true, items: roots, path: null });
    }

    const adapter = new LocalStorageAdapter({ basePath: '/', hideHidden: true });
    await adapter.connect();
    
    const items = await adapter.list(dirPath);
    
    // 디렉토리만 필터 (폴더 선택용)
    const foldersOnly = req.query.foldersOnly === 'true';
    const filteredItems = foldersOnly 
      ? items.filter(item => item.isDirectory)
      : items;

    res.json({
      success: true,
      path: dirPath,
      items: filteredItems
    });
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/storage/browse/mkdir
 * 디렉토리 생성
 */
router.post('/browse/mkdir', async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    
    if (!dirPath) {
      return res.status(400).json({ success: false, error: 'Path required' });
    }

    const adapter = new LocalStorageAdapter({ basePath: '/' });
    await adapter.connect();
    await adapter.mkdir(dirPath);

    res.json({ success: true, path: dirPath });
  } catch (error) {
    console.error('Mkdir error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/storage/browse/check
 * 경로 유효성 검사
 */
router.get('/browse/check', async (req, res) => {
  try {
    const { path: checkPath } = req.query;
    
    if (!checkPath) {
      return res.json({ success: true, valid: false, error: 'Path required' });
    }

    const adapter = new LocalStorageAdapter({ basePath: '/' });
    const exists = await adapter.exists(checkPath);
    
    if (!exists) {
      return res.json({ success: true, valid: false, error: 'Path not found' });
    }

    const stat = await adapter.stat(checkPath);
    
    res.json({
      success: true,
      valid: true,
      isDirectory: stat.isDirectory,
      path: checkPath
    });
  } catch (error) {
    res.json({ success: true, valid: false, error: error.message });
  }
});

module.exports = router;
