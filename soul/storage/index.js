/**
 * Storage Manager
 * 스토리지 어댑터 관리 및 선택
 */

const LocalStorageAdapter = require('./local-adapter');
// 향후 추가
// const GoogleDriveAdapter = require('./google-drive-adapter');
// const NotionAdapter = require('./notion-adapter');
// const NASAdapter = require('./nas-adapter');

class StorageManager {
  constructor() {
    this.adapters = new Map();
    this.currentAdapter = null;
    this.currentType = 'local';
    
    // 기본 어댑터 등록
    this.registerAdapter('local', LocalStorageAdapter);
  }

  /**
   * 어댑터 타입 등록
   */
  registerAdapter(type, AdapterClass) {
    this.adapters.set(type, AdapterClass);
  }

  /**
   * 사용 가능한 스토리지 타입 목록
   */
  getAvailableTypes() {
    return [
      { type: 'local', name: '로컬 저장소', icon: '💻', available: true },
      { type: 'ftp', name: 'FTP/NAS', icon: '🗄️', available: true },
      { type: 'notion', name: 'Notion', icon: '📝', available: true },
      { type: 'oracle', name: 'Oracle DB', icon: '🔶', available: true }
    ];
  }

  /**
   * 현재 스토리지 설정
   */
  async setStorage(type, config = {}) {
    const AdapterClass = this.adapters.get(type);
    if (!AdapterClass) {
      throw new Error(`Unknown storage type: ${type}`);
    }

    // 기존 연결 해제
    if (this.currentAdapter) {
      await this.currentAdapter.disconnect();
    }

    // 새 어댑터 생성 및 연결
    this.currentAdapter = new AdapterClass(config);
    this.currentType = type;
    await this.currentAdapter.connect();

    return this.currentAdapter.getInfo();
  }

  /**
   * 현재 어댑터 반환
   */
  getAdapter() {
    return this.currentAdapter;
  }

  /**
   * 현재 스토리지 정보
   */
  getInfo() {
    if (!this.currentAdapter) {
      return { type: null, connected: false };
    }
    return this.currentAdapter.getInfo();
  }
}

// 싱글톤
let instance = null;

function getStorageManager() {
  if (!instance) {
    instance = new StorageManager();
  }
  return instance;
}

module.exports = {
  StorageManager,
  getStorageManager,
  LocalStorageAdapter
};
