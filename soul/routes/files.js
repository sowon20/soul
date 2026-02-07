/**
 * files.js
 * 파일 업로드/다운로드 API
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const os = require('os');

// 업로드 디렉토리 (SOUL_DATA_DIR/uploads)
const DATA_DIR = process.env.SOUL_DATA_DIR || path.join(os.homedir(), '.soul');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// 디렉토리 생성 (없으면)
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // 고유 ID + 원본 확장자
    const ext = path.extname(file.originalname);
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // 최대 5개
  },
  fileFilter: (req, file, cb) => {
    // 허용 타입
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/markdown', 'text/csv',
      'application/json'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`허용되지 않는 파일 타입: ${file.mimetype}`), false);
    }
  }
});

/**
 * POST /api/files/upload
 * 파일 업로드 (단일 또는 다중)
 */
router.post('/upload', upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: '파일이 없습니다'
      });
    }

    const uploaded = req.files.map(file => ({
      id: path.basename(file.filename, path.extname(file.filename)),
      name: file.originalname,
      size: file.size,
      type: file.mimetype,
      url: `/api/files/${file.filename}`
    }));

    res.json({
      success: true,
      files: uploaded
    });
  } catch (error) {
    console.error('[Files] Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/files/:filename
 * 파일 다운로드/조회
 */
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    // 경로 탈출 방지
    if (!filePath.startsWith(UPLOAD_DIR)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 파일 존재 확인
    await fs.access(filePath);

    // 파일 전송
    res.sendFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/files/:id
 * 파일 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 디렉토리 내에서 해당 ID로 시작하는 파일 찾기
    const files = await fs.readdir(UPLOAD_DIR);
    const target = files.find(f => f.startsWith(id));

    if (!target) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다' });
    }

    await fs.unlink(path.join(UPLOAD_DIR, target));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 에러 핸들러 (Multer 에러)
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: '파일 크기가 10MB를 초과합니다'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: '최대 5개까지 업로드 가능합니다'
      });
    }
  }

  res.status(400).json({
    success: false,
    error: error.message
  });
});

module.exports = router;
