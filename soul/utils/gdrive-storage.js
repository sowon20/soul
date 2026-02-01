/**
 * Google Drive 기반 스토리지 어댑터
 * 대화 메시지를 Google Drive에 JSON 파일로 저장/읽기
 */
const { google } = require('googleapis');
const { Readable } = require('stream');

class GDriveStorage {
  constructor(config = {}) {
    this.config = {
      keyFile: config.keyFile || process.env.GDRIVE_KEY_FILE,
      folderId: config.folderId || process.env.GDRIVE_FOLDER_ID,
      basePath: config.basePath || 'soul-memory'
    };

    if (!this.config.keyFile) {
      throw new Error('[GDriveStorage] keyFile is required');
    }

    // 서비스 계정 인증
    this.auth = new google.auth.GoogleAuth({
      keyFile: this.config.keyFile,
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.folderCache = {}; // 폴더 ID 캐시
  }

  /**
   * 폴더 찾기 또는 생성
   * 서비스 계정은 공유받은 폴더 안에서만 파일 생성 가능
   */
  async _getOrCreateFolder(name, parentId) {
    // 반드시 parentId 필요 (공유 폴더 내에서만 작업)
    if (!parentId) {
      throw new Error('[GDriveStorage] parentId is required - service account cannot create files in root');
    }

    const cacheKey = `${parentId}/${name}`;
    if (this.folderCache[cacheKey]) {
      return this.folderCache[cacheKey];
    }

    // 폴더 검색
    const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const res = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (res.data.files && res.data.files.length > 0) {
      this.folderCache[cacheKey] = res.data.files[0].id;
      return res.data.files[0].id;
    }

    // 폴더 생성 (반드시 공유 폴더 내에서)
    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };

    const folder = await this.drive.files.create({
      resource: fileMetadata,
      fields: 'id'
    });

    this.folderCache[cacheKey] = folder.data.id;
    return folder.data.id;
  }

  /**
   * 파일 경로로 폴더 구조 생성 및 폴더 ID 반환
   */
  async _ensurePath(filePath) {
    if (!this.config.folderId) {
      throw new Error('[GDriveStorage] folderId is required for service account');
    }

    const parts = filePath.split('/').filter(p => p);
    const fileName = parts.pop();

    // 공유받은 폴더에서 시작
    let parentId = this.config.folderId;

    // 나머지 경로 생성 (basePath 제거 - 공유 폴더가 basePath 역할)
    for (const part of parts) {
      parentId = await this._getOrCreateFolder(part, parentId);
    }

    return { folderId: parentId, fileName };
  }

  /**
   * 파일 찾기
   */
  async _findFile(fileName, folderId) {
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const res = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    return res.data.files && res.data.files.length > 0 ? res.data.files[0] : null;
  }

  /**
   * 파일 읽기
   */
  async readFile(filePath) {
    try {
      const { folderId, fileName } = await this._ensurePath(filePath);
      const file = await this._findFile(fileName, folderId);

      if (!file) {
        return null;
      }

      const res = await this.drive.files.get({
        fileId: file.id,
        alt: 'media'
      });

      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (err) {
      if (err.code === 404) {
        return null;
      }
      console.error('[GDriveStorage] readFile error:', err.message);
      throw err;
    }
  }

  /**
   * 파일 쓰기 (덮어쓰기)
   */
  async writeFile(filePath, content) {
    try {
      const { folderId, fileName } = await this._ensurePath(filePath);
      const existingFile = await this._findFile(fileName, folderId);

      const media = {
        mimeType: 'application/json',
        body: Readable.from([content])
      };

      if (existingFile) {
        // 기존 파일 업데이트
        await this.drive.files.update({
          fileId: existingFile.id,
          media: media
        });
        console.log(`[GDriveStorage] Updated: ${filePath}`);
      } else {
        // 새 파일 생성
        await this.drive.files.create({
          resource: {
            name: fileName,
            parents: [folderId]
          },
          media: media,
          fields: 'id'
        });
        console.log(`[GDriveStorage] Created: ${filePath}`);
      }
    } catch (err) {
      console.error('[GDriveStorage] writeFile error:', err.message);
      throw err;
    }
  }

  /**
   * 메시지 저장 (날짜별 JSON 파일에 추가)
   */
  async saveMessage(message) {
    const dateStr = message.date || new Date().toISOString().split('T')[0];
    const [year, month] = dateStr.split('-');
    const filePath = `conversations/${year}-${month}/${dateStr}.json`;

    try {
      // 기존 파일 읽기
      let messages = [];
      const existing = await this.readFile(filePath);
      if (existing) {
        messages = JSON.parse(existing);
      }

      // 메시지 추가
      messages.push({
        role: message.role,
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        tokens: message.tokens || 0,
        meta: message.meta || {}
      });

      // 파일 쓰기
      await this.writeFile(filePath, JSON.stringify(messages, null, 2));
      console.log(`[GDriveStorage] Saved message: ${message.role}`);
    } catch (err) {
      console.error('[GDriveStorage] saveMessage error:', err.message);
      throw err;
    }
  }

  /**
   * 특정 날짜 메시지 가져오기
   */
  async getMessagesForDate(date) {
    const dateStr = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;
    const [year, month] = dateStr.split('-');
    const filePath = `conversations/${year}-${month}/${dateStr}.json`;

    try {
      const content = await this.readFile(filePath);
      return content ? JSON.parse(content) : [];
    } catch (err) {
      console.error('[GDriveStorage] getMessagesForDate error:', err.message);
      return [];
    }
  }

  /**
   * 최근 메시지 가져오기
   */
  async getRecentMessages(limit = 50) {
    const messages = [];
    const today = new Date();
    let daysBack = 0;
    const maxDaysBack = 30;

    while (messages.length < limit && daysBack < maxDaysBack) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().split('T')[0];

      try {
        const dayMessages = await this.getMessagesForDate(dateStr);
        messages.unshift(...dayMessages);
      } catch (err) {
        // 파일 없으면 무시
      }

      daysBack++;
    }

    // 최신 limit개만 반환
    return messages.slice(-limit);
  }

  /**
   * 연결 테스트
   */
  async testConnection() {
    try {
      const res = await this.drive.files.list({
        pageSize: 1,
        fields: 'files(id, name)'
      });
      console.log('[GDriveStorage] Connection test passed');
      return true;
    } catch (err) {
      console.error('[GDriveStorage] Connection test failed:', err.message);
      return false;
    }
  }

  /**
   * 폴더 내 파일 목록
   */
  async listFiles(subPath = '') {
    try {
      const { folderId } = await this._ensurePath(subPath + '/dummy.json');
      // folderId는 subPath의 마지막 폴더
      const parentId = subPath ? folderId : await this._getOrCreateFolder(this.config.basePath);

      const res = await this.drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, modifiedTime)',
        orderBy: 'modifiedTime desc'
      });

      return res.data.files.map(f => ({
        name: f.name,
        type: f.mimeType === 'application/vnd.google-apps.folder' ? 'directory' : 'file',
        size: f.size,
        modifiedAt: f.modifiedTime
      }));
    } catch (err) {
      console.error('[GDriveStorage] listFiles error:', err.message);
      return [];
    }
  }
}

// 싱글톤
let instance = null;

function getGDriveStorage(config) {
  if (!instance) {
    instance = new GDriveStorage(config);
  }
  return instance;
}

function resetGDriveStorage() {
  instance = null;
}

module.exports = { GDriveStorage, getGDriveStorage, resetGDriveStorage };
