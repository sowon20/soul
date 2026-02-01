/**
 * Bootstrap Configuration
 *
 * 앱 초기 실행 시 필수 설정이 완료되었는지 확인하고,
 * 설정되지 않았으면 설정 페이지로 리다이렉트하는 역할
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 부트스트랩 상태 파일 경로
const BOOTSTRAP_FILE = path.join(os.homedir(), '.soul', '.bootstrap');

/**
 * 부트스트랩 완료 여부 확인
 */
function isBootstrapComplete() {
  try {
    if (!fs.existsSync(BOOTSTRAP_FILE)) {
      return false;
    }
    const data = JSON.parse(fs.readFileSync(BOOTSTRAP_FILE, 'utf-8'));
    return data.completed === true;
  } catch (error) {
    return false;
  }
}

/**
 * 부트스트랩 완료 표시
 */
function markBootstrapComplete(storageConfig = {}) {
  try {
    const soulDir = path.join(os.homedir(), '.soul');
    if (!fs.existsSync(soulDir)) {
      fs.mkdirSync(soulDir, { recursive: true });
    }

    const data = {
      completed: true,
      completedAt: new Date().toISOString(),
      version: '1.0.0',
      storage: {
        type: storageConfig.type || 'local',
        path: storageConfig.path || path.join(os.homedir(), '.soul')
      }
    };

    fs.writeFileSync(BOOTSTRAP_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to mark bootstrap complete:', error);
    return false;
  }
}

/**
 * 부트스트랩 상태 가져오기
 */
function getBootstrapStatus() {
  try {
    if (!fs.existsSync(BOOTSTRAP_FILE)) {
      return {
        completed: false,
        needsSetup: true
      };
    }
    const data = JSON.parse(fs.readFileSync(BOOTSTRAP_FILE, 'utf-8'));
    return {
      completed: data.completed,
      completedAt: data.completedAt,
      version: data.version,
      storage: data.storage,
      needsSetup: !data.completed
    };
  } catch (error) {
    return {
      completed: false,
      needsSetup: true,
      error: error.message
    };
  }
}

/**
 * 부트스트랩 리셋 (재설정 필요 시)
 */
function resetBootstrap() {
  try {
    if (fs.existsSync(BOOTSTRAP_FILE)) {
      fs.unlinkSync(BOOTSTRAP_FILE);
    }
    return true;
  } catch (error) {
    console.error('Failed to reset bootstrap:', error);
    return false;
  }
}

/**
 * 저장소 경로 해석 (~ 확장)
 */
function resolveStoragePath(inputPath) {
  if (!inputPath) return path.join(os.homedir(), '.soul');

  // ~ 를 홈 디렉토리로 확장
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }

  return path.resolve(inputPath);
}

/**
 * 저장소 경로 유효성 검사 및 생성
 */
function validateAndCreateStoragePath(storagePath) {
  const resolved = resolveStoragePath(storagePath);

  try {
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }

    // 쓰기 권한 테스트
    const testFile = path.join(resolved, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    return {
      valid: true,
      resolved
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      resolved
    };
  }
}

module.exports = {
  isBootstrapComplete,
  markBootstrapComplete,
  getBootstrapStatus,
  resetBootstrap,
  resolveStoragePath,
  validateAndCreateStoragePath
};
