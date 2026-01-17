const fs = require('fs').promises;
const path = require('path');

/**
 * 메모리 저장소 유틸리티
 */
class MemoryUtils {
  constructor() {
    this.memoryPath = process.env.MEMORY_PATH || path.join(__dirname, '../../memory');
    this.rawPath = path.join(this.memoryPath, 'raw');
    this.processedPath = path.join(this.memoryPath, 'processed');
    this.indexPath = path.join(this.memoryPath, 'index.json');
  }

  /**
   * 파일명 생성: YYYY-MM-DD_HHmmss_주제.md
   */
  generateFilename(topic = '대화') {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const sanitizedTopic = topic
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    return `${date}_${time}_${sanitizedTopic}.md`;
  }

  /**
   * 메타데이터 헤더 생성
   */
  generateMetadataHeader(metadata) {
    const {
      id,
      date = new Date().toISOString(),
      participants = ['user', 'soul'],
      messageCount = 0,
      topics = [],
      tags = [],
      category = '',
      importance = 5
    } = metadata;

    return `---
id: ${id}
date: ${date}
participants: ${JSON.stringify(participants)}
messageCount: ${messageCount}
topics: ${JSON.stringify(topics)}
tags: ${JSON.stringify(tags)}
category: ${category}
importance: ${importance}
---

`;
  }

  /**
   * index.json 읽기
   */
  async readIndex() {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // 파일이 없으면 기본 구조 반환
      return {
        version: '1.0.0',
        lastUpdated: null,
        conversations: []
      };
    }
  }

  /**
   * index.json 쓰기
   */
  async writeIndex(indexData) {
    await fs.writeFile(
      this.indexPath,
      JSON.stringify(indexData, null, 2),
      'utf-8'
    );
  }

  /**
   * index.json에 대화 추가
   */
  async addToIndex(conversationMetadata) {
    const index = await this.readIndex();

    // 기존 항목 제거 (같은 ID)
    index.conversations = index.conversations.filter(
      conv => conv.id !== conversationMetadata.id
    );

    // 새 항목 추가
    index.conversations.push(conversationMetadata);

    // 날짜순 정렬 (최신순)
    index.conversations.sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    index.lastUpdated = new Date().toISOString();

    await this.writeIndex(index);
    return index;
  }

  /**
   * 메시지 배열을 Markdown으로 변환
   */
  messagesToMarkdown(messages, title = '대화') {
    let markdown = `# ${title}\n\n`;

    messages.forEach((msg, index) => {
      const sender = msg.sender || msg.role || 'unknown';
      const content = msg.content || msg.text || '';
      const timestamp = msg.timestamp || msg.createdAt || '';

      markdown += `## 메시지 ${index + 1} - ${sender}\n`;
      if (timestamp) {
        markdown += `*${new Date(timestamp).toLocaleString('ko-KR')}*\n\n`;
      }
      markdown += `${content}\n\n`;
      markdown += '---\n\n';
    });

    return markdown;
  }

  /**
   * 대화를 파일로 저장
   */
  async saveConversation(conversationData) {
    const {
      id,
      messages = [],
      metadata = {}
    } = conversationData;

    // 메타데이터 기본값 설정
    const fullMetadata = {
      id,
      date: metadata.date || new Date().toISOString(),
      participants: metadata.participants || ['user', 'soul'],
      messageCount: messages.length,
      topics: metadata.topics || ['대화'],
      tags: metadata.tags || [],
      category: metadata.category || '',
      importance: metadata.importance || 5
    };

    // 파일명 생성
    const topic = fullMetadata.topics[0] || '대화';
    const filename = this.generateFilename(topic);
    const filepath = path.join(this.rawPath, filename);

    // Markdown 생성
    const header = this.generateMetadataHeader(fullMetadata);
    const title = fullMetadata.topics.join(', ') || '대화';
    const body = this.messagesToMarkdown(messages, title);
    const content = header + body;

    // 파일 저장
    await fs.writeFile(filepath, content, 'utf-8');

    // 파일 정보 가져오기
    const stats = await fs.stat(filepath);

    // index.json 업데이트
    const indexMetadata = {
      ...fullMetadata,
      filename,
      path: `raw/${filename}`,
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString()
    };

    await this.addToIndex(indexMetadata);

    return {
      success: true,
      filename,
      path: filepath,
      metadata: indexMetadata
    };
  }
}

module.exports = new MemoryUtils();
