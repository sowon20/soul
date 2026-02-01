/**
 * Local Storage Adapter
 * 로컬 파일 시스템 스토리지
 */

const StorageAdapter = require('./adapter');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class LocalStorageAdapter extends StorageAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'local';
    this.name = '로컬 저장소';
    this.basePath = config.basePath || process.cwd();
  }

  async connect() {
    try {
      await fs.access(this.basePath);
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      throw new Error(`Cannot access path: ${this.basePath}`);
    }
  }

  async disconnect() {
    this.connected = false;
    return true;
  }

  _resolvePath(filePath) {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.basePath, filePath);
  }

  async read(filePath) {
    const fullPath = this._resolvePath(filePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async readBuffer(filePath) {
    const fullPath = this._resolvePath(filePath);
    return await fs.readFile(fullPath);
  }

  async write(filePath, content) {
    const fullPath = this._resolvePath(filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content);
    return true;
  }

  async delete(filePath) {
    const fullPath = this._resolvePath(filePath);
    await fs.unlink(fullPath);
    return true;
  }

  async exists(filePath) {
    try {
      const fullPath = this._resolvePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(dirPath = '.') {
    const fullPath = this._resolvePath(dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    const items = [];
    for (const entry of entries) {
      // 숨김 파일 제외 (선택적)
      if (entry.name.startsWith('.') && this.config.hideHidden !== false) continue;
      
      const itemPath = path.join(fullPath, entry.name);
      let stat = null;
      
      try {
        stat = await fs.stat(itemPath);
      } catch {
        continue;
      }

      items.push({
        name: entry.name,
        path: itemPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        size: stat.size,
        modified: stat.mtime
      });
    }

    // 폴더 먼저, 이름순 정렬
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  async mkdir(dirPath) {
    const fullPath = this._resolvePath(dirPath);
    await fs.mkdir(fullPath, { recursive: true });
    return true;
  }

  async rmdir(dirPath) {
    const fullPath = this._resolvePath(dirPath);
    await fs.rmdir(fullPath, { recursive: true });
    return true;
  }

  async stat(filePath) {
    const fullPath = this._resolvePath(filePath);
    const stat = await fs.stat(fullPath);
    return {
      size: stat.size,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      created: stat.birthtime,
      modified: stat.mtime,
      accessed: stat.atime
    };
  }

  /**
   * 시스템 루트 디렉토리 목록
   */
  static async getRoots() {
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows: 드라이브 문자
      const { execSync } = require('child_process');
      try {
        const result = execSync('wmic logicaldisk get name', { encoding: 'utf-8' });
        const drives = result.split('\n')
          .map(line => line.trim())
          .filter(line => /^[A-Z]:$/.test(line))
          .map(drive => ({ name: drive, path: drive + '\\', isDirectory: true }));
        return drives;
      } catch {
        return [{ name: 'C:', path: 'C:\\', isDirectory: true }];
      }
    } else {
      // macOS/Linux
      const roots = [
        { name: '/', path: '/', isDirectory: true },
        { name: 'Home', path: os.homedir(), isDirectory: true }
      ];
      
      // macOS: /Volumes
      if (platform === 'darwin') {
        try {
          const volumes = await fs.readdir('/Volumes');
          for (const vol of volumes) {
            roots.push({ 
              name: vol, 
              path: `/Volumes/${vol}`, 
              isDirectory: true 
            });
          }
        } catch {}
      }
      
      return roots;
    }
  }
}

module.exports = LocalStorageAdapter;
