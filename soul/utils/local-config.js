/**
 * 로컬 설정 파일 관리
 *
 * 저장소 설정은 DB 연결 전에 읽어야 하므로 로컬 파일에 저장
 * ~/.soul/storage-config.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 설정 파일 경로
const CONFIG_DIR = process.env.SOUL_CONFIG_DIR || path.join(os.homedir(), '.soul');
const STORAGE_CONFIG_FILE = path.join(CONFIG_DIR, 'storage-config.json');

/**
 * 기본 저장소 설정
 */
const DEFAULT_STORAGE_CONFIG = {
  // 메모리/대화 저장소
  memory: {
    type: 'local',  // 'local' | 'oracle' | 'notion' | 'ftp'
    local: {
      path: path.join(CONFIG_DIR, 'data')
    },
    oracle: {
      user: '',
      connectionString: '',
      walletPath: '',
      password: ''
    },
    notion: {
      token: '',
      databaseId: ''
    },
    ftp: {
      host: '',
      port: 21,
      user: '',
      password: '',
      basePath: '/soul'
    }
  },
  // 파일 저장소
  file: {
    type: 'local',  // 'local' | 'oracle' | 'nas'
    local: {
      path: path.join(CONFIG_DIR, 'files')
    },
    oracle: {
      // Oracle Object Storage 설정 (나중에 구현)
      bucket: '',
      namespace: ''
    },
    nas: {
      // NAS/SMB 설정 (나중에 구현)
      host: '',
      share: '',
      user: '',
      password: ''
    }
  }
};

/**
 * 설정 디렉토리 생성
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 저장소 설정 읽기 (동기)
 * 서버 시작 시 DB 타입 결정에 사용
 */
function readStorageConfigSync() {
  try {
    ensureConfigDir();

    if (fs.existsSync(STORAGE_CONFIG_FILE)) {
      const content = fs.readFileSync(STORAGE_CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content);

      // 기본값과 병합 (저장된 값 우선)
      return {
        memory: { ...DEFAULT_STORAGE_CONFIG.memory, ...config.memory },
        file: { ...DEFAULT_STORAGE_CONFIG.file, ...config.file }
      };
    }

    return DEFAULT_STORAGE_CONFIG;
  } catch (error) {
    console.error('[LocalConfig] Failed to read storage config:', error.message);
    return DEFAULT_STORAGE_CONFIG;
  }
}

/**
 * 저장소 설정 읽기 (비동기)
 */
async function readStorageConfig() {
  return readStorageConfigSync();
}

/**
 * 저장소 설정 쓰기
 */
async function writeStorageConfig(config) {
  try {
    ensureConfigDir();

    // 기존 설정과 병합
    const existing = readStorageConfigSync();
    const merged = {
      memory: { ...existing.memory, ...config.memory },
      file: { ...existing.file, ...config.file }
    };

    fs.writeFileSync(STORAGE_CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    console.log('[LocalConfig] Storage config saved');

    return merged;
  } catch (error) {
    console.error('[LocalConfig] Failed to write storage config:', error.message);
    throw error;
  }
}

/**
 * 메모리 저장소 타입 가져오기
 */
function getMemoryStorageType() {
  const config = readStorageConfigSync();
  return config.memory?.type || 'local';
}

/**
 * 파일 저장소 타입 가져오기
 */
function getFileStorageType() {
  const config = readStorageConfigSync();
  return config.file?.type || 'local';
}

/**
 * 메모리 저장소 설정 가져오기
 */
function getMemoryStorageConfig() {
  const config = readStorageConfigSync();
  const type = config.memory?.type || 'local';
  return {
    type,
    ...config.memory[type]
  };
}

/**
 * 파일 저장소 설정 가져오기
 */
function getFileStorageConfig() {
  const config = readStorageConfigSync();
  const type = config.file?.type || 'local';
  return {
    type,
    ...config.file[type]
  };
}

/**
 * 설정 경로들
 */
const CONFIG_PATHS = {
  configDir: CONFIG_DIR,
  storageConfigFile: STORAGE_CONFIG_FILE
};

module.exports = {
  readStorageConfig,
  readStorageConfigSync,
  writeStorageConfig,
  getMemoryStorageType,
  getFileStorageType,
  getMemoryStorageConfig,
  getFileStorageConfig,
  CONFIG_PATHS,
  DEFAULT_STORAGE_CONFIG
};
