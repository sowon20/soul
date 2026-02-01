/**
 * Notion 기반 스토리지 어댑터
 * 대화 메시지를 Notion DB에 저장/읽기
 */
const { Client } = require('@notionhq/client');

class NotionStorage {
  constructor(config = {}) {
    this.config = {
      token: config.token || process.env.NOTION_TOKEN,
      databaseId: config.databaseId || process.env.NOTION_DATABASE_ID
    };

    if (!this.config.token || !this.config.databaseId) {
      throw new Error('[NotionStorage] token and databaseId are required');
    }

    this.client = new Client({ auth: this.config.token });
  }

  /**
   * 메시지 저장
   */
  async saveMessage(message) {
    try {
      const result = await this.client.pages.create({
        parent: { database_id: this.config.databaseId },
        properties: {
          '이름': {
            title: [{ text: { content: this._truncate(message.content, 100) } }]
          },
          '날짜': {
            date: { start: message.date || new Date().toISOString().split('T')[0] }
          },
          '텍스트': {
            rich_text: [{ text: { content: message.timestamp || new Date().toISOString() } }]
          },
          '숫자': {
            number: message.tokens || 0
          }
        },
        // 본문에 전체 내용 저장
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: `[${message.role}] ${message.content}` }
              }]
            }
          },
          {
            object: 'block',
            type: 'code',
            code: {
              rich_text: [{
                type: 'text',
                text: { content: JSON.stringify(message.meta || {}, null, 2) }
              }],
              language: 'json'
            }
          }
        ]
      });

      console.log('[NotionStorage] Saved:', result.id);
      return result.id;
    } catch (err) {
      console.error('[NotionStorage] Save failed:', err.message);
      throw err;
    }
  }

  /**
   * 최근 메시지 읽기
   */
  async getRecentMessages(limit = 50) {
    try {
      // Search API 사용 (Notion 앱 DB 호환)
      const response = await this.client.search({
        query: '',
        filter: { property: 'object', value: 'page' },
        page_size: 100
      });

      // 이 DB의 페이지만 필터링
      const dbPages = response.results.filter(p =>
        p.parent?.database_id?.replace(/-/g, '') === this.config.databaseId.replace(/-/g, '')
      );

      const messages = [];
      for (const page of dbPages.slice(0, limit)) {
        const msg = await this._pageToMessage(page);
        if (msg) messages.push(msg);
      }

      // 시간순 정렬 (오래된 것 먼저)
      messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return messages;
    } catch (err) {
      console.error('[NotionStorage] Read failed:', err.message);
      return [];
    }
  }

  /**
   * 페이지를 메시지 객체로 변환
   */
  async _pageToMessage(page) {
    try {
      const blocks = await this.client.blocks.children.list({
        block_id: page.id,
        page_size: 10
      });

      let content = '';
      let meta = {};
      let role = 'user';

      for (const block of blocks.results) {
        if (block.type === 'paragraph') {
          const text = block.paragraph?.rich_text?.[0]?.plain_text || '';
          if (text.startsWith('[user]')) {
            role = 'user';
            content = text.replace('[user] ', '');
          } else if (text.startsWith('[assistant]')) {
            role = 'assistant';
            content = text.replace('[assistant] ', '');
          } else if (!content) {
            content = text;
          }
        } else if (block.type === 'code') {
          try {
            const jsonStr = block.code?.rich_text?.[0]?.plain_text || '{}';
            meta = JSON.parse(jsonStr);
          } catch (e) {}
        }
      }

      const props = page.properties || {};
      return {
        role,
        content,
        timestamp: props['텍스트']?.rich_text?.[0]?.plain_text || page.created_time,
        tokens: props['숫자']?.number || 0,
        meta
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * 특정 날짜 메시지 가져오기
   */
  async getMessagesForDate(date) {
    const dateStr = date instanceof Date
      ? date.toISOString().split('T')[0]
      : date;

    try {
      const response = await this.client.databases.query({
        database_id: this.config.databaseId,
        filter: {
          property: '날짜',
          date: { equals: dateStr }
        },
        sorts: [{ property: '텍스트', direction: 'ascending' }]
      });

      const messages = [];
      for (const page of response.results) {
        const blocks = await this.client.blocks.children.list({
          block_id: page.id,
          page_size: 10
        });

        let content = '';
        let meta = {};
        let role = 'user';

        for (const block of blocks.results) {
          if (block.type === 'paragraph') {
            const text = block.paragraph?.rich_text?.[0]?.plain_text || '';
            if (text.startsWith('[user]')) {
              role = 'user';
              content = text.replace('[user] ', '');
            } else if (text.startsWith('[assistant]')) {
              role = 'assistant';
              content = text.replace('[assistant] ', '');
            }
          } else if (block.type === 'code') {
            try {
              meta = JSON.parse(block.code?.rich_text?.[0]?.plain_text || '{}');
            } catch (e) {}
          }
        }

        const props = page.properties || {};
        messages.push({
          role,
          content,
          timestamp: props['텍스트']?.rich_text?.[0]?.plain_text || '',
          tokens: props['숫자']?.number || 0,
          meta
        });
      }

      return messages;
    } catch (err) {
      console.error('[NotionStorage] getMessagesForDate failed:', err.message);
      return [];
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection() {
    try {
      await this.client.users.me();
      return true;
    } catch (err) {
      console.error('[NotionStorage] Connection test failed:', err.message);
      return false;
    }
  }

  _truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }
}

// 싱글톤
let instance = null;

function getNotionStorage(config) {
  if (!instance) {
    instance = new NotionStorage(config);
  }
  return instance;
}

function resetNotionStorage() {
  instance = null;
}

module.exports = { NotionStorage, getNotionStorage, resetNotionStorage };
