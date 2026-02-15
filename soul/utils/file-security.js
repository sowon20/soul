/**
 * file-security.js
 * 파일시스템 접근 경로 검증 유틸리티
 *
 * 기본 허용: SOUL_DATA_DIR (~/.soul)
 * 추가 허용: DB system_configs.allowed_file_paths
 * 심볼릭 링크 해제 후 검증
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 기본 허용 경로
const DEFAULT_DATA_DIR = path.join(os.homedir(), '.soul');

/**
 * 허용된 경로 목록 가져오기 (DB + env 조합)
 * @returns {Promise<string[]>}
 */
async function getAllowedPaths() {
  const paths = [];

  // 1. SOUL_DATA_DIR (환경변수 또는 기본값)
  const dataDir = process.env.SOUL_DATA_DIR || DEFAULT_DATA_DIR;
  paths.push(path.resolve(dataDir));

  // 2. 홈 디렉토리 (사용자 파일 접근)
  paths.push(os.homedir());

  // 3. DB에서 추가 허용 경로 가져오기
  try {
    const SystemConfig = require('../models/SystemConfig');
    const config = await SystemConfig.findOne({ configKey: 'allowed_file_paths' });
    if (config?.value && Array.isArray(config.value)) {
      for (const p of config.value) {
        if (typeof p === 'string' && p.trim()) {
          paths.push(path.resolve(p.trim()));
        }
      }
    }
  } catch (err) {
    // DB 미연결 시 기본값만 사용
    console.warn('[file-security] DB 조회 실패, 기본 경로만 허용:', err.message);
  }

  // 4. 환경변수 추가 경로
  if (process.env.ALLOWED_FILE_PATHS) {
    const envPaths = process.env.ALLOWED_FILE_PATHS.split(',');
    for (const p of envPaths) {
      if (p.trim()) {
        paths.push(path.resolve(p.trim()));
      }
    }
  }

  return [...new Set(paths)]; // 중복 제거
}

/**
 * 경로를 안전하게 해석 (심볼릭 링크 해제)
 * @param {string} filePath - 입력 경로
 * @returns {Promise<string>} - 해석된 절대 경로
 */
async function sanitizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('경로가 비어있습니다.');
  }

  // ~ 확장
  let resolved = filePath;
  if (resolved.startsWith('~')) {
    resolved = path.join(os.homedir(), resolved.slice(1));
  }

  // 절대 경로 변환
  resolved = path.resolve(resolved);

  // 심볼릭 링크 해제 (파일이 존재하는 경우)
  try {
    resolved = await fs.promises.realpath(resolved);
  } catch (err) {
    // 파일이 아직 없으면 (file_write에서 새 파일 생성 시)
    // 부모 디렉토리까지만 해석
    if (err.code === 'ENOENT') {
      const dir = path.dirname(resolved);
      try {
        const realDir = await fs.promises.realpath(dir);
        resolved = path.join(realDir, path.basename(resolved));
      } catch {
        // 부모 디렉토리도 없으면 그대로 사용
      }
    }
  }

  return resolved;
}

/**
 * 경로가 허용되었는지 확인
 * @param {string} filePath - 확인할 경로
 * @returns {Promise<{allowed: boolean, resolvedPath: string, reason?: string}>}
 */
async function isPathAllowed(filePath) {
  try {
    const resolved = await sanitizePath(filePath);
    const allowedPaths = await getAllowedPaths();

    for (const allowed of allowedPaths) {
      if (resolved.startsWith(allowed + path.sep) || resolved === allowed) {
        return { allowed: true, resolvedPath: resolved };
      }
    }

    return {
      allowed: false,
      resolvedPath: resolved,
      reason: `허용되지 않은 경로입니다. 허용 경로: ${allowedPaths.join(', ')}`
    };
  } catch (err) {
    return {
      allowed: false,
      resolvedPath: filePath,
      reason: err.message
    };
  }
}

/**
 * 경로 검증 후 해석된 경로 반환 (실패 시 throw)
 * @param {string} filePath
 * @returns {Promise<string>} - 검증된 절대 경로
 */
async function validatePath(filePath) {
  const result = await isPathAllowed(filePath);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
  return result.resolvedPath;
}

module.exports = {
  getAllowedPaths,
  sanitizePath,
  isPathAllowed,
  validatePath,
  DEFAULT_DATA_DIR
};
