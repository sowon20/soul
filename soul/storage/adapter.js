/**
 * Storage Adapter Interface
 * 스토리지 플러그인 추상 인터페이스
 */

class StorageAdapter {
  constructor(config = {}) {
    this.config = config;
    this.type = 'base';
    this.name = 'Base Storage';
    this.connected = false;
  }

  // 연결/인증
  async connect() { throw new Error('Not implemented'); }
  async disconnect() { throw new Error('Not implemented'); }
  async isConnected() { return this.connected; }

  // 파일 작업
  async read(filePath) { throw new Error('Not implemented'); }
  async write(filePath, content) { throw new Error('Not implemented'); }
  async delete(filePath) { throw new Error('Not implemented'); }
  async exists(filePath) { throw new Error('Not implemented'); }

  // 디렉토리 작업
  async list(dirPath) { throw new Error('Not implemented'); }
  async mkdir(dirPath) { throw new Error('Not implemented'); }
  async rmdir(dirPath) { throw new Error('Not implemented'); }

  // 메타데이터
  async stat(filePath) { throw new Error('Not implemented'); }

  // 설정 정보
  getInfo() {
    return {
      type: this.type,
      name: this.name,
      connected: this.connected,
      config: this.config
    };
  }
}

module.exports = StorageAdapter;
