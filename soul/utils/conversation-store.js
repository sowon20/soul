/**
 * JSONL 기반 대화 저장/로드 유틸리티
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 설정에서 메모리 경로 가져오기
async function getMemoryPath() {
  try {
    const SystemConfig = require('../models/SystemConfig');
    const config = await SystemConfig.findOne({ configKey: 'memory' });
    if (config?.value?.storagePath) {
      console.log('[ConversationStore] Using memory path:', config.value.storagePath);
      return config.value.storagePath;
    }
  } catch (e) {
    console.log('[ConversationStore] DB error, using default path');
  }
  return path.join(__dirname, '../../memory');
}

class ConversationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.initialized = false;
  }
  
  async init() {
    if (this.initialized) return;
    
    if (!this.filePath) {
      const memoryPath = await getMemoryPath();
      this.filePath = path.join(memoryPath, 'conversations.jsonl');
    }
    this.ensureFile();
    this.initialized = true;
  }

  /**
   * 파일 존재 확인 및 생성
   */
  ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '');
    }
  }

  /**
   * 메시지 저장 (append)
   */
  async saveMessage(message) {
    await this.init();
    let timestamp = message.timestamp || new Date().toISOString();
    // Date 객체면 ISO 문자열로 변환
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
    
    fs.appendFileSync(this.filePath, line + '\n');
    return { id, timestamp };
  }

  /**
   * 최근 N개 메시지 로드 (역순)
   */
  async getRecentMessages(limit = 50) {
    await this.init();
    const lines = await this.readLastLines(limit);
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * 특정 시점 이전 메시지 로드 (무한스크롤용)
   * @param {string} beforeTimestamp - ISO timestamp
   */
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

  /**
   * 특정 메시지 주변 로드 (검색 결과 이동용)
   */
  async getMessagesAround(messageId, limit = 40) {
    await this.init();
    const allLines = await this.readAllLines();
    const halfLimit = Math.floor(limit / 2);
    
    // 해당 메시지 인덱스 찾기
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
      // 못 찾으면 최근 메시지 반환
      return this.getRecentMessages(limit);
    }
    
    // 전후 메시지 추출
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

  /**
   * 키워드 검색
   */
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

  /**
   * 전체 라인 읽기
   */
  async readAllLines() {
    await this.init();
    const content = fs.readFileSync(this.filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim());
  }

  /**
   * 마지막 N개 라인 읽기 (효율적)
   */
  async readLastLines(n) {
    await this.init();
    return new Promise((resolve, reject) => {
      const lines = [];
      const fileStream = fs.createReadStream(this.filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: fileStream });
      
      rl.on('line', (line) => {
        if (line.trim()) {
          lines.push(line);
          if (lines.length > n) {
            lines.shift();
          }
        }
      });
      
      rl.on('close', () => resolve(lines));
      rl.on('error', reject);
    });
  }

  /**
   * 총 메시지 수
   */
  async count() {
    await this.init();
    const lines = await this.readAllLines();
    return lines.length;
  }

  /**
   * 메시지 업데이트 (태그, 감정 등 메타데이터)
   */
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
      fs.writeFileSync(this.filePath, newLines.join('\n') + '\n');
      console.log(`[ConversationStore] Updated message ${messageId} with:`, updates);
    } else {
      console.log(`[ConversationStore] Message ${messageId} not found for update`);
    }
    
    return updated;
  }
}

module.exports = ConversationStore;
