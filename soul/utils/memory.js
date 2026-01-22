const fs = require('fs').promises;
const path = require('path');
const { AIServiceFactory } = require('./ai-service');
const configManager = require('./config');

/**
 * 메모리 저장소 유틸리티
 */
class MemoryUtils {
  constructor() {
    // 기본 경로 (동기적 fallback)
    this.memoryPath = process.env.MEMORY_PATH || path.join(__dirname, '../../memory');
    this.rawPath = path.join(this.memoryPath, 'raw');
    this.processedPath = path.join(this.memoryPath, 'processed');
    this.indexPath = path.join(this.memoryPath, 'index.json');
    this._configLoaded = false;
  }

  /**
   * ConfigManager에서 메모리 경로 로드
   * (비동기 메서드에서 자동 호출)
   */
  async _loadConfigPath() {
    if (this._configLoaded) return;

    try {
      const memoryConfig = await configManager.getMemoryConfig();
      if (memoryConfig && memoryConfig.storagePath) {
        // 상대 경로면 절대 경로로 변환
        this.memoryPath = path.isAbsolute(memoryConfig.storagePath)
          ? memoryConfig.storagePath
          : path.join(process.cwd(), memoryConfig.storagePath);

        this.rawPath = path.join(this.memoryPath, 'raw');
        this.processedPath = path.join(this.memoryPath, 'processed');
        this.indexPath = path.join(this.memoryPath, 'index.json');
      }
      this._configLoaded = true;
    } catch (error) {
      console.error('Failed to load memory config, using default path:', error);
      this._configLoaded = true;
    }
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
    await this._loadConfigPath();

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
   * AI를 사용하여 대화 자동 분석
   */
  async analyzeConversation(messages) {
    try {
      // AI 서비스 생성
      const aiService = AIServiceFactory.createService();

      // 메시지 포맷 변환
      const formattedMessages = messages.map(msg => ({
        sender: msg.sender || msg.role || 'user',
        text: msg.content || msg.text || ''
      }));

      // AI 분석 실행
      const analysis = await aiService.analyzeConversation(formattedMessages);

      return {
        topics: analysis.topics || [],
        tags: analysis.tags || [],
        category: analysis.category || '기타',
        importance: analysis.importance || 5
      };
    } catch (error) {
      console.error('AI analysis failed:', error);
      // AI 분석 실패 시 기본값 반환
      return {
        topics: ['대화'],
        tags: [],
        category: '기타',
        importance: 5
      };
    }
  }

  /**
   * 대화를 파일로 저장 (AI 자동 분석 포함)
   */
  async saveConversation(conversationData) {
    // Config 경로 로드
    await this._loadConfigPath();

    // 디렉토리 존재 확인 및 생성
    await this._ensureDirectories();

    const {
      id,
      messages = [],
      metadata = {},
      autoAnalyze = true  // 자동 분석 활성화 여부
    } = conversationData;

    // AI 자동 분석 실행
    let aiAnalysis = {};
    if (autoAnalyze && messages.length > 0) {
      aiAnalysis = await this.analyzeConversation(messages);
    }

    // 메타데이터 병합 (사용자 제공 메타데이터가 우선)
    const fullMetadata = {
      id,
      date: metadata.date || new Date().toISOString(),
      participants: metadata.participants || ['user', 'soul'],
      messageCount: messages.length,
      topics: metadata.topics || aiAnalysis.topics || ['대화'],
      tags: metadata.tags || aiAnalysis.tags || [],
      category: metadata.category || aiAnalysis.category || '기타',
      importance: metadata.importance || aiAnalysis.importance || 5
    };

    // 파일명 생성 (첫 번째 주제 사용)
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
      metadata: indexMetadata,
      aiAnalysis: autoAnalyze ? aiAnalysis : null
    };
  }

  /**
   * 필요한 디렉토리 생성
   */
  async _ensureDirectories() {
    try {
      await fs.mkdir(this.rawPath, { recursive: true });
      await fs.mkdir(this.processedPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create directories:', error);
      throw error;
    }
  }
}

module.exports = new MemoryUtils();
