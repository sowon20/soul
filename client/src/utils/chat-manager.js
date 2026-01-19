/**
 * Chat Manager
 * 채팅 메시지 관리 및 렌더링 (Claude Style)
 */

import { marked } from 'marked';

export class ChatManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.messagesArea = document.getElementById('messagesArea');
    this.userMessageTemplate = document.getElementById('userMessageTemplate');
    this.assistantMessageTemplate = document.getElementById('assistantMessageTemplate');
    this.typingIndicatorTemplate = document.getElementById('typingIndicatorTemplate');
    this.messages = [];
    this.conversationId = 'main-conversation';
    this.isLoadingHistory = false;
    this.hasMoreHistory = true;
    this.oldestMessageId = null;

    // Configure marked for markdown rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Setup infinite scroll
    this.setupInfiniteScroll();
  }

  /**
   * 무한 스크롤 설정
   */
  setupInfiniteScroll() {
    this.messagesArea.addEventListener('scroll', () => {
      // 스크롤이 맨 위에 거의 도달했을 때 과거 메시지 로드
      if (this.messagesArea.scrollTop < 100 && !this.isLoadingHistory && this.hasMoreHistory) {
        this.loadOlderMessages();
      }
    });
  }

  /**
   * 과거 메시지 로드 (무한 스크롤)
   */
  async loadOlderMessages() {
    if (this.isLoadingHistory || !this.hasMoreHistory) return;

    this.isLoadingHistory = true;
    const currentScrollHeight = this.messagesArea.scrollHeight;

    try {
      const options = {
        limit: 20,
      };

      if (this.oldestMessageId) {
        options.before = this.oldestMessageId;
      }

      const history = await this.apiClient.getConversationHistory(this.conversationId, options);

      if (history && history.messages && history.messages.length > 0) {
        // 과거 메시지를 배열 앞에 추가
        this.messages.unshift(...history.messages);
        this.oldestMessageId = history.messages[0].id || history.messages[0].timestamp;

        // DOM에 메시지 추가 (맨 위에)
        history.messages.reverse().forEach(message => {
          const messageElement = this.createMessageElement(message);
          this.messagesArea.insertBefore(messageElement, this.messagesArea.firstChild);
        });

        // 스크롤 위치 유지
        const newScrollHeight = this.messagesArea.scrollHeight;
        this.messagesArea.scrollTop = newScrollHeight - currentScrollHeight;

        // 더 이상 메시지가 없으면
        if (history.messages.length < options.limit) {
          this.hasMoreHistory = false;
        }
      } else {
        this.hasMoreHistory = false;
      }
    } catch (error) {
      console.error('과거 메시지 로드 실패:', error);
      // API 실패 시 무한 스크롤 비활성화
      this.hasMoreHistory = false;
    } finally {
      this.isLoadingHistory = false;
    }
  }

  /**
   * 최근 메시지 로드 (초기 로딩, 마지막 대화 위치)
   */
  async loadRecentMessages(limit = 50) {
    try {
      const history = await this.apiClient.getConversationHistory(this.conversationId, { limit });

      if (history && history.messages && history.messages.length > 0) {
        // 메시지 배열에 추가
        this.messages = history.messages;
        this.oldestMessageId = history.messages[0].id || history.messages[0].timestamp;

        // DOM에 렌더링
        history.messages.forEach(message => {
          const messageElement = this.createMessageElement(message);
          this.messagesArea.appendChild(messageElement);
        });

        // 맨 아래로 스크롤
        this.scrollToBottom(false);
      }
    } catch (error) {
      console.error('최근 메시지 로드 실패:', error);
      // 실패하면 환영 메시지 표시
      this.addWelcomeMessage();
    }
  }

  /**
   * 환영 메시지 추가
   */
  addWelcomeMessage() {
    const welcomeText = '안녕하세요! 무엇을 도와드릴까요?';
    this.addMessage({
      role: 'assistant',
      content: welcomeText,
      timestamp: new Date(),
    });
  }

  /**
   * 메시지 추가
   * @param {Object} message - { role, content, timestamp }
   */
  addMessage(message) {
    this.messages.push(message);

    const messageElement = this.createMessageElement(message);
    this.messagesArea.appendChild(messageElement);

    // Scroll to bottom
    this.scrollToBottom();
  }

  /**
   * 메시지 요소 생성 (Claude Style)
   */
  createMessageElement(message) {
    let template;

    if (message.role === 'user') {
      template = this.userMessageTemplate.content.cloneNode(true);
      const messageDiv = template.querySelector('.message-user');

      // Set content
      const text = messageDiv.querySelector('.message-text');
      text.textContent = message.content;

      // Set timestamp
      const timestamp = messageDiv.querySelector('.message-timestamp');
      timestamp.textContent = this.formatDateTime(message.timestamp);

      // Add event listeners for action buttons
      this.attachUserMessageActions(messageDiv, message);

      return messageDiv;
    } else {
      template = this.assistantMessageTemplate.content.cloneNode(true);
      const messageDiv = template.querySelector('.message-assistant');

      // Set content (with markdown support)
      const text = messageDiv.querySelector('.message-text');
      text.innerHTML = marked.parse(message.content);

      // Add event listeners for action buttons
      this.attachAssistantMessageActions(messageDiv, message);

      return messageDiv;
    }
  }

  /**
   * 사용자 메시지 액션 버튼 이벤트 연결
   */
  attachUserMessageActions(messageDiv, message) {
    const copyBtn = messageDiv.querySelector('.copy-btn');
    const editBtn = messageDiv.querySelector('.edit-btn');
    const deleteBtn = messageDiv.querySelector('.delete-btn');

    copyBtn.addEventListener('click', () => this.copyMessage(message.content));
    editBtn.addEventListener('click', () => this.editMessage(message));
    deleteBtn.addEventListener('click', () => this.deleteMessage(messageDiv, message));
  }

  /**
   * AI 메시지 액션 버튼 이벤트 연결
   */
  attachAssistantMessageActions(messageDiv, message) {
    const copyBtn = messageDiv.querySelector('.copy-btn');
    const likeBtn = messageDiv.querySelector('.like-btn');
    const dislikeBtn = messageDiv.querySelector('.dislike-btn');
    const bookmarkBtn = messageDiv.querySelector('.bookmark-btn');
    const retryBtn = messageDiv.querySelector('.retry-btn');

    copyBtn.addEventListener('click', () => this.copyMessage(message.content));
    likeBtn.addEventListener('click', () => this.likeMessage(message));
    dislikeBtn.addEventListener('click', () => this.dislikeMessage(message));
    bookmarkBtn.addEventListener('click', () => this.bookmarkMessage(message));
    retryBtn.addEventListener('click', () => this.retryMessage(message));
  }

  /**
   * 메시지 복사
   */
  async copyMessage(content) {
    try {
      await navigator.clipboard.writeText(content);
      console.log('메시지가 복사되었습니다.');
    } catch (error) {
      console.error('복사 실패:', error);
    }
  }

  /**
   * 메시지 수정
   */
  editMessage(message) {
    const newContent = prompt('메시지를 수정하세요:', message.content);
    if (newContent && newContent !== message.content) {
      // TODO: API 호출하여 메시지 수정
      console.log('메시지 수정:', newContent);
    }
  }

  /**
   * 메시지 삭제
   */
  deleteMessage(messageDiv, message) {
    if (confirm('이 메시지를 삭제하시겠습니까?')) {
      messageDiv.remove();
      const index = this.messages.indexOf(message);
      if (index > -1) {
        this.messages.splice(index, 1);
      }
      // TODO: API 호출하여 메시지 삭제
      console.log('메시지 삭제됨');
    }
  }

  /**
   * 메시지 좋아요
   */
  likeMessage(message) {
    // TODO: API 호출
    console.log('메시지 좋아요:', message.content.substring(0, 20));
  }

  /**
   * 메시지 싫어요
   */
  dislikeMessage(message) {
    // TODO: API 호출
    console.log('메시지 싫어요:', message.content.substring(0, 20));
  }

  /**
   * 메시지 북마크
   */
  bookmarkMessage(message) {
    // TODO: API 호출
    console.log('메시지 북마크:', message.content.substring(0, 20));
  }

  /**
   * 메시지 재시도
   */
  async retryMessage(message) {
    // 이전 사용자 메시지 찾기
    const index = this.messages.indexOf(message);
    if (index > 0) {
      const previousMessage = this.messages[index - 1];
      if (previousMessage.role === 'user') {
        await this.sendMessage(previousMessage.content);
      }
    }
  }

  /**
   * 타이핑 인디케이터 표시
   */
  showTypingIndicator() {
    const indicator = this.typingIndicatorTemplate.content.cloneNode(true);
    const indicatorElement = indicator.querySelector('.message-assistant');
    indicatorElement.id = 'activeTypingIndicator';
    this.messagesArea.appendChild(indicatorElement);
    this.scrollToBottom();
  }

  /**
   * 타이핑 인디케이터 제거
   */
  hideTypingIndicator() {
    const indicator = document.getElementById('activeTypingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }

  /**
   * 메시지 전송
   * @param {string} text - 메시지 내용
   */
  async sendMessage(text) {
    // Add user message
    this.addMessage({
      role: 'user',
      content: text,
      timestamp: new Date(),
    });

    // Show typing indicator
    this.showTypingIndicator();

    try {
      // Call API
      const response = await this.apiClient.sendMessage(text);

      // Hide typing indicator
      this.hideTypingIndicator();

      // Add assistant response
      this.addMessage({
        role: 'assistant',
        content: response.reply || response.message || '응답을 받지 못했습니다.',
        timestamp: new Date(response.timestamp || Date.now()),
      });
    } catch (error) {
      // Hide typing indicator
      this.hideTypingIndicator();

      // Add error message
      this.addMessage({
        role: 'assistant',
        content: `죄송합니다. 오류가 발생했습니다: ${error.message}`,
        timestamp: new Date(),
      });

      console.error('메시지 전송 실패:', error);
    }
  }

  /**
   * 메시지 목록 초기화
   */
  clearMessages() {
    this.messages = [];
    this.messagesArea.innerHTML = '';
  }

  /**
   * 메시지 영역 스크롤
   */
  scrollToBottom(smooth = true) {
    requestAnimationFrame(() => {
      this.messagesArea.scrollTo({
        top: this.messagesArea.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }

  /**
   * 시간 포맷
   * @param {Date|string} date
   * @returns {string}
   */
  formatTime(date) {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * 날짜 + 시간 포맷
   * @param {Date|string} date
   * @returns {string}
   */
  formatDateTime(date) {
    const d = new Date(date);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }

  /**
   * 날짜 포맷 (상대 시간)
   * @param {Date|string} date
   * @returns {string}
   */
  formatRelativeTime(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return '방금 전';
  }

  /**
   * 메시지 검색
   * @param {string} query
   * @returns {Array}
   */
  searchMessages(query) {
    const lowerQuery = query.toLowerCase();
    return this.messages.filter(msg =>
      msg.content.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 대화 내보내기 (텍스트)
   * @returns {string}
   */
  exportToText() {
    return this.messages
      .map(msg => {
        const time = this.formatTime(msg.timestamp);
        const author = msg.role === 'user' ? '나' : 'Soul';
        return `[${time}] ${author}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * 대화 내보내기 (JSON)
   * @returns {string}
   */
  exportToJSON() {
    return JSON.stringify(this.messages, null, 2);
  }

  /**
   * 메시지 수 가져오기
   * @returns {number}
   */
  getMessageCount() {
    return this.messages.length;
  }

  /**
   * 마지막 메시지 가져오기
   * @returns {Object|null}
   */
  getLastMessage() {
    return this.messages[this.messages.length - 1] || null;
  }
}
