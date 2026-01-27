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
router.get('/types', async (req, res) => {
  try {
    const manager = getStorageManager();
    const SystemConfig = require('../models/SystemConfig');
    
    // DB에서 현재 설정 읽기
    const config = await SystemConfig.findOne({ configKey: 'memory' });
    const currentType = config?.value?.storageType || 'local';
    
    res.json({
      success: true,
      types: manager.getAvailableTypes(),
      current: currentType
    });
  } catch (e) {
    res.json({
      success: true,
      types: getStorageManager().getAvailableTypes(),
      current: 'local'
    });
  }
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
 * POST /api/storage/ftp/test
 * FTP 연결 테스트 + 경로 확인
 */
router.post('/ftp/test', async (req, res) => {
  try {
    const { host, port, user, password, basePath, createIfMissing } = req.body;
    
    if (!host || !user) {
      return res.status(400).json({ success: false, error: '호스트와 사용자를 입력해주세요.' });
    }
    
    const { FTPStorage } = require('../utils/ftp-storage');
    const ftp = new FTPStorage({ host, port, user, password, basePath: '/' });
    
    await ftp.connect();
    
    // 경로 존재 확인
    let pathExists = false;
    let files = [];
    try {
      await ftp.client.cd(basePath || '/');
      files = await ftp.client.list();
      pathExists = true;
    } catch (e) {
      pathExists = false;
    }
    
    if (!pathExists) {
      if (createIfMissing) {
        // 폴더 생성
        try {
          await ftp.client.ensureDir(basePath);
          await ftp.disconnect();
          res.json({ 
            success: true, 
            message: `폴더 생성됨: ${basePath}`,
            created: true
          });
        } catch (mkdirErr) {
          await ftp.disconnect();
          res.json({ 
            success: false, 
            error: `폴더 생성 실패: ${mkdirErr.message}`
          });
        }
      } else {
        await ftp.disconnect();
        res.json({ 
          success: false, 
          pathMissing: true,
          error: `경로가 존재하지 않음: ${basePath}`
        });
      }
      return;
    }
    
    await ftp.disconnect();
    
    res.json({ 
      success: true, 
      message: '연결 성공',
      files: files.length 
    });
  } catch (error) {
    console.error('FTP test error:', error);
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
