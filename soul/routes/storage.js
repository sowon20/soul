/**
 * Storage Routes
 * 스토리지 관리 및 디렉토리 탐색 API
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getStorageManager, LocalStorageAdapter } = require('../storage');

// Wallet 업로드용 multer 설정
const walletUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('zip 파일만 업로드 가능합니다.'));
    }
  }
});

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

    // 모든 캐시 초기화 (스토리지 변경 적용)
    const { clearStorageConfigCache } = require('../utils/conversation-store');
    const { resetArchiver } = require('../utils/conversation-archiver');
    const { resetConversationPipeline } = require('../utils/conversation-pipeline');
    const { resetMemoryManager } = require('../utils/memory-layers');
    clearStorageConfigCache();
    resetArchiver();
    resetMemoryManager();
    resetConversationPipeline();

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

/**
 * POST /api/storage/migrate
 * 저장소 간 데이터 마이그레이션 (전체 데이터 이동)
 */
router.post('/migrate', async (req, res) => {
  try {
    // 클라이언트에서 보내는 파라미터: fromType, toType
    const { fromType, toType, section, from, to } = req.body;

    // 파라미터 호환성 처리 (fromType/toType 또는 from/to)
    const sourceType = fromType || from;
    const targetType = toType || to;

    if (!sourceType || !targetType) {
      return res.status(400).json({
        success: false,
        error: 'fromType, toType 필드가 필요합니다.'
      });
    }

    console.log(`[Storage Migration] 전체 마이그레이션: ${sourceType} → ${targetType}`);

    // 전체 섹션 마이그레이션 (대화, 메모리, 설정 등)
    const sections = section ? [section] : ['conversations', 'memory', 'config'];
    const results = {};

    for (const sec of sections) {
      try {
        console.log(`[Storage Migration] ${sec} 마이그레이션 시작...`);

        // 저장소 어댑터 로드
        const sourceAdapter = await getStorageAdapter(sourceType, sec);
        const targetAdapter = await getStorageAdapter(targetType, sec);

        if (sourceAdapter && targetAdapter) {
          const result = await migrateData(sourceAdapter, targetAdapter, sec);
          results[sec] = result;
          console.log(`[Storage Migration] ${sec} 완료:`, result);
        } else {
          results[sec] = { skipped: true, reason: 'adapter not available' };
        }
      } catch (secError) {
        console.error(`[Storage Migration] ${sec} 실패:`, secError.message);
        results[sec] = { error: secError.message };
      }
    }

    // 중요: 서버의 모든 저장소 인스턴스 리셋하여 새 설정 적용
    console.log('[Storage Migration] 저장소 인스턴스 재초기화...');
    const { resetMemoryManager } = require('../utils/memory-layers');
    const { resetConversationPipeline } = require('../utils/conversation-pipeline');
    const { clearStorageConfigCache } = require('../utils/conversation-store');
    const { resetArchiver } = require('../utils/conversation-archiver');

    clearStorageConfigCache();
    resetArchiver();
    resetMemoryManager();
    resetConversationPipeline();

    // 새 저장소 타입으로 연결 시도
    if (targetType === 'oracle') {
      try {
        const { OracleStorage } = require('../utils/oracle-storage');
        const oracle = new OracleStorage();
        await oracle.initialize();
        console.log('[Storage Migration] Oracle 연결 성공');
      } catch (oracleError) {
        console.warn('[Storage Migration] Oracle 연결 실패 (무시됨):', oracleError.message);
      }
    }

    console.log('[Storage Migration] 마이그레이션 완료!');

    res.json({
      success: true,
      message: '마이그레이션 완료',
      from: sourceType,
      to: targetType,
      results
    });
  } catch (error) {
    console.error('[Storage Migration] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 저장소 타입에 맞는 어댑터 생성
 */
async function getStorageAdapter(type, section) {
  const SystemConfig = require('../models/SystemConfig');
  const config = await SystemConfig.findOne({ configKey: section });
  const settings = config?.value || {};

  switch (type) {
    case 'local': {
      const { LocalStorageAdapter } = require('../storage');
      const basePath = settings.storagePath || `./${section}`;
      const adapter = new LocalStorageAdapter({ basePath });
      await adapter.connect();
      return adapter;
    }

    case 'ftp': {
      const { FTPStorage } = require('../utils/ftp-storage');
      const ftpConfig = settings.ftp || {};
      const adapter = new FTPStorage({
        host: ftpConfig.host,
        port: ftpConfig.port || 21,
        user: ftpConfig.user,
        password: ftpConfig.password,
        basePath: ftpConfig.basePath || `/${section}`
      });
      await adapter.connect();
      return adapter;
    }

    case 'oracle': {
      const { OracleStorage } = require('../utils/oracle-storage');
      const adapter = new OracleStorage();
      await adapter.connect();
      return adapter;
    }

    default:
      return null;
  }
}

/**
 * 데이터 마이그레이션 수행
 */
async function migrateData(source, target, section) {
  const stats = { files: 0, errors: 0 };

  try {
    // 파일 기반 저장소의 경우
    if (typeof source.list === 'function' && typeof source.read === 'function') {
      const files = await source.list('/');

      for (const file of files) {
        if (file.isDirectory) continue;

        try {
          const content = await source.read(file.name);
          await target.write(file.name, content);
          stats.files++;
        } catch (err) {
          console.error(`[Migration] Failed to migrate ${file.name}:`, err.message);
          stats.errors++;
        }
      }
    }

    // Oracle 등 DB 기반 저장소의 경우
    if (typeof source.exportAll === 'function' && typeof target.importAll === 'function') {
      const data = await source.exportAll(section);
      await target.importAll(section, data);
      stats.files = data.length || 1;
    }

    return stats;
  } catch (error) {
    console.error('[Migration] Error:', error);
    throw error;
  }
}

/**
 * POST /api/storage/upload-oracle-wallet
 * Oracle Wallet zip 업로드 및 압축 해제
 */
router.post('/upload-oracle-wallet', walletUpload.single('wallet'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Wallet 파일이 필요합니다.' });
    }

    const AdmZip = require('adm-zip');
    const walletDir = path.join(__dirname, '../config/oracle');

    // 디렉토리 생성
    if (!fs.existsSync(walletDir)) {
      fs.mkdirSync(walletDir, { recursive: true });
    }

    // 기존 파일 백업 (선택적)
    const backupDir = path.join(walletDir, '.backup_' + Date.now());
    const existingFiles = fs.readdirSync(walletDir).filter(f => !f.startsWith('.backup'));
    if (existingFiles.length > 0) {
      fs.mkdirSync(backupDir, { recursive: true });
      existingFiles.forEach(file => {
        const src = path.join(walletDir, file);
        const dest = path.join(backupDir, file);
        if (fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dest);
        }
      });
    }

    // zip 압축 해제
    const zip = new AdmZip(req.file.buffer);
    zip.extractAllTo(walletDir, true);

    // tnsnames.ora에서 TNS 이름 추출
    const tnsNames = [];
    const tnsPath = path.join(walletDir, 'tnsnames.ora');
    if (fs.existsSync(tnsPath)) {
      const tnsContent = fs.readFileSync(tnsPath, 'utf-8');
      const matches = tnsContent.match(/^(\w+)\s*=/gm);
      if (matches) {
        matches.forEach(m => {
          const name = m.replace(/\s*=.*/, '').trim();
          if (name) tnsNames.push(name);
        });
      }
    }

    // wallet 상태 저장
    const configManager = require('../utils/config');
    const currentConfig = await configManager.getStorageConfig();
    await configManager.updateStorageConfig({
      ...currentConfig,
      oracle: {
        ...(currentConfig.oracle || {}),
        walletUploaded: true,
        walletUploadedAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      message: 'Wallet 업로드 성공',
      tnsNames,
      files: fs.readdirSync(walletDir).filter(f => !f.startsWith('.backup'))
    });
  } catch (error) {
    console.error('Wallet upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/storage/oracle/test
 * Oracle 연결 테스트
 */
router.post('/oracle/test', async (req, res) => {
  try {
    const { user, password, connectString, connectionString } = req.body;
    const { OracleStorage } = require('../utils/oracle-storage');
    const connStr = connectString || connectionString;

    // 임시로 환경변수에 비밀번호 설정 (테스트용)
    if (password) {
      process.env.ORACLE_PASSWORD = password;
    }

    const oracle = new OracleStorage({
      user: user || 'ADMIN',
      connectString: connStr || 'database_high'
    });

    await oracle.initialize();
    await oracle.close();

    res.json({ success: true, message: 'Oracle 연결 성공' });
  } catch (error) {
    console.error('Oracle test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/storage/oracle-wallet-status
 * Oracle Wallet 상태 확인
 */
router.get('/oracle-wallet-status', async (req, res) => {
  try {
    const walletDir = path.join(__dirname, '../config/oracle');
    const requiredFiles = ['cwallet.sso', 'tnsnames.ora'];

    const exists = requiredFiles.every(f =>
      fs.existsSync(path.join(walletDir, f))
    );

    let tnsNames = [];
    if (exists) {
      const tnsPath = path.join(walletDir, 'tnsnames.ora');
      const tnsContent = fs.readFileSync(tnsPath, 'utf-8');
      const matches = tnsContent.match(/^(\w+)\s*=/gm);
      if (matches) {
        matches.forEach(m => {
          const name = m.replace(/\s*=.*/, '').trim();
          if (name) tnsNames.push(name);
        });
      }
    }

    res.json({
      success: true,
      uploaded: exists,
      tnsNames
    });
  } catch (error) {
    res.json({ success: true, uploaded: false, tnsNames: [] });
  }
});

module.exports = router;
