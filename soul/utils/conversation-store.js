/**
 * JSONL 기반 대화 저장/로드 유틸리티
 * 로컬 파일 또는 FTP 스토리지 지원
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 스토리지 설정 캐시 (서버 재시작 시 초기화됨)
let storageConfig = null;
let storageConfigLoaded = false;

// 설정 가져오기
async function getStorageConfig() {
  // 이미 로드했으면 캐시 반환
  if (storageConfigLoaded && storageConfig) {
    console.log('[ConversationStore] Using cached config:', storageConfig.type);
    return storageConfig;
  }
  
  console.log('[ConversationStore] Loading config from DB...');
  
  try {
    const SystemConfig = require('../models/SystemConfig');
    const config = await SystemConfig.findOne({ configKey: 'memory' });
    console.log('[ConversationStore] Raw DB config:', JSON.stringify(config?.value));
    
    if (config?.value) {
      storageConfig = {
        type: config.value.storageType || 'local',
        path: config.value.storagePath || path.join(__dirname, '../../memory'),
        ftp: config.value.ftp || null
      };
      storageConfigLoaded = true;
      console.log('[ConversationStore] Storage config:', storageConfig.type, storageConfig.path);
      return storageConfig;
    }
  } catch (e) {
    console.log('[ConversationStore] DB error:', e.message);
  }
  
  storageConfig = {
    type: 'local',
    path: path.join(__dirname, '../../memory')
  };
  storageConfigLoaded = true;
  return storageConfig;
}

class ConversationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.initialized = false;
    this.storageType = 'local';
    this.ftpStorage = null;
  }
  
  async init() {
    if (this.initialized) return;
    
    console.log('[ConversationStore] init() called, getting config...');
    const config = await getStorageConfig();
    console.log('[ConversationStore] Got config, type:', config.type);
    this.storageType = config.type;
    
    if (this.storageType === 'ftp') {
      const { getFTPStorage } = require('./ftp-storage');
      this.ftpStorage = getFTPStorage(config.ftp);
      this.initialized = true;
      console.log('[ConversationStore] Using FTP storage');
      return;
    }
    
    // 로컬 스토리지
    if (!this.filePath) {
      this.filePath = path.join(config.path, 'conversations.jsonl');
    }
    this.ensureFile();
    this.initialized = true;
  }

  ensureFile() {
    if (this.storageType !== 'local') return;
    
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '');
    }
  }

  async saveMessage(message) {
    await this.init();
    
    let timestamp = message.timestamp || new Date().toISOString();
    if (timestamp instanceof Date) {
      timestamp = timestamp.toISOString();
    }
    const id = message.id || `${timestamp.replace(/[:.]/g, '-')}_${message.role}`;
    
    const line = JSON.stringify({
      id,
      role: message.role,
      text: message.content || message.text,
      timestamp,
      tags: message.tags || [],
      thought: message.thought || null,
      emotion: message.emotion || null,
      tokens: message.tokens || 0,
      metadata: message.metadata || {}
    });
    
    if (this.storageType === 'ftp') {
      await this.ftpStorage.appendToFile('conversations.jsonl', line + '\n');
    } else {
      fs.appendFileSync(this.filePath, line + '\n');
    }
    
    return { id, timestamp };
  }

  /**
   * 최근 메시지만 효율적으로 가져오기 (tail 알고리즘)
   * 전체 파일을 읽지 않고 끝에서부터 필요한 만큼만 읽음
   */
  async getRecentMessages(limit = 50) {
    await this.init();

    // FTP는 기존 방식 유지
    if (this.storageType === 'ftp') {
      const lines = await this.readAllLines();
      const lastLines = lines.slice(-limit);
      return lastLines.map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    }

    // 로컬: tail 알고리즘 사용
    return this._tailReadLines(limit);
  }

  /**
   * 파일 끝에서부터 N개 라인만 읽기 (메모리 효율적)
   */
  async _tailReadLines(limit) {
    const CHUNK_SIZE = 8192; // 8KB씩 읽기
    const fd = fs.openSync(this.filePath, 'r');
    const stats = fs.fstatSync(fd);
    const fileSize = stats.size;

    if (fileSize === 0) {
      fs.closeSync(fd);
      return [];
    }

    const lines = [];
    let position = fileSize;
    let buffer = '';

    try {
      while (position > 0 && lines.length < limit) {
        const readSize = Math.min(CHUNK_SIZE, position);
        position -= readSize;

        const chunk = Buffer.alloc(readSize);
        fs.readSync(fd, chunk, 0, readSize, position);
        buffer = chunk.toString('utf-8') + buffer;

        // 줄바꿈으로 분리
        const parts = buffer.split('\n');

        // 마지막 부분은 불완전할 수 있으므로 버퍼에 유지
        buffer = parts[0];

        // 나머지 완전한 라인들 추가 (역순으로)
        for (let i = parts.length - 1; i > 0; i--) {
          const line = parts[i].trim();
          if (line) {
            try {
              lines.unshift(JSON.parse(line));
              if (lines.length >= limit) break;
            } catch { /* 파싱 실패 무시 */ }
          }
        }
      }

      // 마지막 버퍼 처리
      if (lines.length < limit && buffer.trim()) {
        try {
          lines.unshift(JSON.parse(buffer.trim()));
        } catch { /* 파싱 실패 무시 */ }
      }
    } finally {
      fs.closeSync(fd);
    }

    return lines.slice(-limit);
  }

  /**
   * 토큰 제한 내에서 최근 메시지 가져오기
   * @param {number} maxTokens - 최대 토큰 수
   * @returns {{ messages: Array, totalTokens: number }}
   */
  async getMessagesWithinTokenLimit(maxTokens) {
    await this.init();
    const lines = await this.readAllLines();
    
    const result = [];
    let totalTokens = 0;
    
    // 최신 메시지부터 역순으로
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const msg = JSON.parse(lines[i]);
        const msgTokens = msg.tokens || this._estimateTokens(msg.text || msg.content || '');
        
        if (totalTokens + msgTokens > maxTokens) {
          break;
        }
        
        result.unshift(msg);
        totalTokens += msgTokens;
      } catch {
        // 파싱 실패한 라인 무시
      }
    }
    
    return { messages: result, totalTokens };
  }
  
  /**
   * 토큰 수 추정 (한글/영어 고려)
   */
  _estimateTokens(text) {
    if (!text) return 0;
    // 한글은 글자당 약 1.5토큰, 영어는 단어당 약 1토큰
    const koreanChars = (text.match(/[\u3131-\uD79D]/g) || []).length;
    const otherChars = text.length - koreanChars;
    return Math.ceil(koreanChars * 1.5 + otherChars / 4);
  }

  async getMessagesBefore(beforeTimestamp, limit = 20) {
    await this.init();
    const allLines = await this.readAllLines();
    const beforeDate = new Date(beforeTimestamp);
    
    if (isNaN(beforeDate.getTime())) {
      console.error('Invalid beforeTimestamp:', beforeTimestamp);
      return [];
    }
    
    const filtered = [];
    for (let i = allLines.length - 1; i >= 0 && filtered.length < limit; i--) {
      try {
        const msg = JSON.parse(allLines[i]);
        if (new Date(msg.timestamp) < beforeDate) {
          filtered.unshift(msg);
        }
      } catch {}
    }
    
    return filtered;
  }

  async getMessagesAround(messageId, limit = 40) {
    await this.init();
    const allLines = await this.readAllLines();
    const halfLimit = Math.floor(limit / 2);
    
    let targetIndex = -1;
    for (let i = 0; i < allLines.length; i++) {
      try {
        const msg = JSON.parse(allLines[i]);
        if (msg.id === messageId) {
          targetIndex = i;
          break;
        }
      } catch {}
    }
    
    if (targetIndex === -1) {
      return this.getRecentMessages(limit);
    }
    
    const start = Math.max(0, targetIndex - halfLimit);
    const end = Math.min(allLines.length, targetIndex + halfLimit);
    
    return allLines.slice(start, end).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async search(keywords, limit = 20) {
    await this.init();
    const allLines = await this.readAllLines();
    const results = [];
    const keywordsLower = keywords.map(k => k.toLowerCase());
    
    for (let i = allLines.length - 1; i >= 0 && results.length < limit; i--) {
      try {
        const msg = JSON.parse(allLines[i]);
        const text = (msg.text || '').toLowerCase();
        const tags = (msg.tags || []).join(' ').toLowerCase();
        const searchText = text + ' ' + tags;
        
        if (keywordsLower.some(k => searchText.includes(k))) {
          results.push(msg);
        }
      } catch {}
    }
    
    return results;
  }

  async readAllLines() {
    await this.init();
    
    if (this.storageType === 'ftp') {
      const content = await this.ftpStorage.readFile('conversations.jsonl');
      return (content || '').split('\n').filter(line => line.trim());
    }
    
    const content = fs.readFileSync(this.filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim());
  }

  async count() {
    await this.init();
    const lines = await this.readAllLines();
    return lines.length;
  }

  async updateMessage(messageId, updates) {
    await this.init();
    const lines = await this.readAllLines();
    let updated = false;
    
    const newLines = lines.map(line => {
      try {
        const msg = JSON.parse(line);
        if (msg.id === messageId) {
          updated = true;
          return JSON.stringify({
            ...msg,
            ...updates,
            tags: updates.tags || msg.tags || [],
            thought: updates.thought !== undefined ? updates.thought : msg.thought,
            emotion: updates.emotion !== undefined ? updates.emotion : msg.emotion
          });
        }
        return line;
      } catch {
        return line;
      }
    });
    
    if (updated) {
      const content = newLines.join('\n') + '\n';
      if (this.storageType === 'ftp') {
        await this.ftpStorage.writeFile('conversations.jsonl', content);
      } else {
        fs.writeFileSync(this.filePath, content);
      }
      console.log(`[ConversationStore] Updated message ${messageId}`);
    }
    
    return updated;
  }
}

// 설정 캐시 초기화 (설정 변경 시)
function clearStorageConfigCache() {
  storageConfig = null;
}

module.exports = ConversationStore;
module.exports.clearStorageConfigCache = clearStorageConfigCache;
