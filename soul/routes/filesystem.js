/**
 * filesystem.js
 * 파일 시스템 탐색 API
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * GET /api/filesystem/browse
 * 디렉토리 목록 조회
 */
router.get('/browse', async (req, res) => {
  try {
    let { dir } = req.query;
    
    // 기본 경로: 홈 디렉토리
    if (!dir) {
      dir = os.homedir();
    }
    
    // 경로 정규화
    dir = path.resolve(dir);
    
    // 디렉토리 존재 확인
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Not a directory' 
      });
    }
    
    // 디렉토리 내용 읽기
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    const items = [];
    for (const entry of entries) {
      // 숨김 파일 제외 (선택적)
      if (entry.name.startsWith('.')) continue;
      
      try {
        const fullPath = path.join(dir, entry.name);
        const entryStat = await fs.stat(fullPath);
        
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: entryStat.size,
          modified: entryStat.mtime
        });
      } catch (e) {
        // 권한 없는 파일은 스킵
      }
    }
    
    // 폴더 먼저, 이름순 정렬
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return b.isDirectory - a.isDirectory;
      }
      return a.name.localeCompare(b.name);
    });
    
    res.json({
      success: true,
      current: dir,
      parent: path.dirname(dir),
      items
    });
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/filesystem/roots
 * 루트 드라이브/마운트 목록
 */
router.get('/roots', async (req, res) => {
  try {
    const roots = [];
    
    // macOS/Linux
    if (process.platform !== 'win32') {
      roots.push({ name: '/', path: '/' });
      roots.push({ name: 'Home', path: os.homedir() });
      
      // Volumes (macOS)
      try {
        const volumes = await fs.readdir('/Volumes');
        for (const vol of volumes) {
          roots.push({ 
            name: vol, 
            path: `/Volumes/${vol}` 
          });
        }
      } catch {}
    } else {
      // Windows
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (const letter of letters) {
        const drive = `${letter}:\\`;
        try {
          await fs.access(drive);
          roots.push({ name: `${letter}:`, path: drive });
        } catch {}
      }
    }
    
    res.json({ success: true, roots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/filesystem/mkdir
 * 디렉토리 생성
 */
router.post('/mkdir', async (req, res) => {
  try {
    const { dir } = req.body;
    
    if (!dir) {
      return res.status(400).json({ 
        success: false, 
        error: 'dir is required' 
      });
    }
    
    await fs.mkdir(dir, { recursive: true });
    
    res.json({ success: true, path: dir });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
