/**
 * socket-client.js
 * Socket.io 클라이언트 + 알림 관리 (Phase 1.6.3)
 */

class SoulSocketClient {
  constructor() {
    console.log('🔌 SoulSocketClient 생성됨');
    this.socket = null;
    this.connected = false;
    this.notificationPermission = null;
  }

  /**
   * 연결 초기화
   */
  async init() {
    console.log('🔌 SoulSocketClient.init() 시작');
    
    // 알림 권한 요청
    await this._requestNotificationPermission();

    // Socket.io 연결
    this._connect();
  }

  /**
   * Socket.io 연결
   */
  _connect() {
    // 백엔드 서버로 연결 (프론트엔드와 포트 다름)
    // Vite dev(5173), 빌드(3080) 모두 → 백엔드(3001)
    let backendUrl = window.location.origin;
    if (backendUrl.includes(':5173')) {
      backendUrl = backendUrl.replace(':5173', ':3001');
    } else if (backendUrl.includes(':3080')) {
      backendUrl = backendUrl.replace(':3080', ':3001');
    }
    console.log('🔌 Socket.io 연결 시도:', backendUrl);
    
    // io 함수 체크
    if (typeof io === 'undefined') {
      console.error('❌ Socket.io 라이브러리 로드 안됨');
      return;
    }
    
    try {
      this.socket = io(backendUrl, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
    } catch (e) {
      console.error('❌ Socket.io 연결 실패:', e);
      return;
    }

    this.socket.on('connect', () => {
      console.log('🔌 Socket connected');
      this.connected = true;
      this._updateConnectionIndicator(true);
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      this.connected = false;
      this._updateConnectionIndicator(false);
    });

    // 선제 메시지 수신
    this.socket.on('proactive_message', (data) => {
      console.log('📬 Proactive message:', data);
      this._handleProactiveMessage(data);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    // 도구 실행 시작
    this.socket.on('tool_start', (data) => {
      console.log('🔧 Tool start:', data);
      this._handleToolStart(data);
    });

    // 도구 실행 완료
    this.socket.on('tool_end', (data) => {
      console.log('🔧 Tool end:', data);
      this._handleToolEnd(data);
    });
  }

  /**
   * 알림 권한 요청
   */
  async _requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      this.notificationPermission = 'granted';
      return;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
    }
  }

  /**
   * 선제 메시지 처리
   */
  _handleProactiveMessage(data) {
    // 1. 브라우저 알림
    if (this.notificationPermission === 'granted') {
      const notification = new Notification('Soul', {
        body: data.message,
        icon: '/src/assets/soul-icon.webp',
        tag: 'proactive-' + data.conditionId,
        requireInteraction: true
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        this._focusChat();
      };
    }

    // 2. 인앱 알림 표시
    this._showInAppNotification(data);

    // 3. 채팅에 메시지 추가
    this._addToChatHistory(data);
  }

  /**
   * 채팅 히스토리에 메시지 추가
   */
  _addToChatHistory(data) {
    console.log('🔌 Adding to chat:', data.message);
    console.log('🔌 window.soulApp:', window.soulApp);
    console.log('🔌 chatManager:', window.soulApp?.chatManager);
    
    // ChatManager 통해 assistant 메시지로 추가
    if (window.soulApp && window.soulApp.chatManager) {
      window.soulApp.chatManager.addMessage({
        role: 'assistant',
        content: data.message,
        timestamp: data.timestamp || new Date().toISOString()
      });
      console.log('🔌 Message added!');
    } else {
      console.error('🔌 chatManager not found');
    }
  }

  /**
   * 인앱 알림 표시
   */
  _showInAppNotification(data) {
    // 기존 알림 제거
    const existing = document.querySelector('.proactive-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'proactive-notification';
    notification.innerHTML = `
      <div class="proactive-notification-content">
        <div class="proactive-notification-icon">💬</div>
        <div class="proactive-notification-text">
          <div class="proactive-notification-title">Soul</div>
          <div class="proactive-notification-message">${data.message}</div>
        </div>
        <button class="proactive-notification-close">×</button>
      </div>
    `;

    // 닫기 버튼
    notification.querySelector('.proactive-notification-close').onclick = () => {
      notification.classList.add('hiding');
      setTimeout(() => notification.remove(), 300);
    };

    // 클릭 시 채팅 포커스
    notification.querySelector('.proactive-notification-content').onclick = (e) => {
      if (!e.target.classList.contains('proactive-notification-close')) {
        this._focusChat();
        notification.remove();
      }
    };

    document.body.appendChild(notification);

    // 자동 숨김 (10초)
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('hiding');
        setTimeout(() => notification.remove(), 300);
      }
    }, 10000);
  }

  /**
   * 도구 실행 시작 처리
   */
  _handleToolStart(data) {
    // 실행 중인 도구 표시 영역 찾기/생성
    let toolStatus = document.querySelector('.tool-execution-status');
    if (!toolStatus) {
      toolStatus = document.createElement('div');
      toolStatus.className = 'tool-execution-status';
      
      // typing indicator 위에 삽입
      const typingIndicator = document.querySelector('.typing-indicator');
      if (typingIndicator) {
        typingIndicator.parentNode.insertBefore(toolStatus, typingIndicator);
      } else {
        // 메시지 영역 맨 아래에 추가
        const messagesArea = document.getElementById('messagesArea');
        if (messagesArea) {
          messagesArea.appendChild(toolStatus);
        }
      }
    }
    
    // 도구 실행 표시 추가
    const toolItem = document.createElement('div');
    toolItem.className = 'tool-status-item running';
    toolItem.dataset.toolName = data.name;
    toolItem.innerHTML = `
      <span class="tool-spinner"></span>
      <span class="tool-display">${data.display || data.name}</span>
      <span class="tool-status-text">실행 중...</span>
    `;
    toolStatus.appendChild(toolItem);
    
    // 스크롤
    this._scrollToBottom();
  }

  /**
   * 도구 실행 완료 처리
   */
  _handleToolEnd(data) {
    const toolItem = document.querySelector(`.tool-status-item[data-tool-name="${data.name}"]`);
    if (toolItem) {
      toolItem.classList.remove('running');
      toolItem.classList.add(data.success ? 'success' : 'error');
      toolItem.innerHTML = `
        <span class="tool-icon">${data.success ? '✓' : '✗'}</span>
        <span class="tool-display">${data.display || data.name}</span>
        <span class="tool-status-text">${data.success ? '완료' : '실패'}</span>
      `;
    }
  }

  /**
   * 도구 상태 영역 제거 (AI 응답 후 호출)
   */
  clearToolStatus() {
    const toolStatus = document.querySelector('.tool-execution-status');
    if (toolStatus) {
      toolStatus.remove();
    }
  }

  /**
   * 스크롤 하단 이동
   */
  _scrollToBottom() {
    const scrollContainer = document.querySelector('.right-card-top');
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  /**
   * 연결 상태 인디케이터 업데이트
   */
  _updateConnectionIndicator(connected) {
    // 기존 .socket-indicator
    let indicator = document.querySelector('.socket-indicator');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'socket-indicator';
      document.body.appendChild(indicator);
    }

    indicator.classList.toggle('connected', connected);
    indicator.title = connected ? '실시간 연결됨' : '연결 끊김';

    // 대시보드의 websocket 서버 상태 인디케이터도 업데이트
    const dashboardWsItem = document.querySelector('[data-service="websocket"] .server-indicator');
    if (dashboardWsItem) {
      dashboardWsItem.className = `server-indicator ${connected ? 'online' : 'offline'}`;
    }
  }

  /**
   * 채팅 입력창 포커스
   */
  _focusChat() {
    const chatInput = document.querySelector('.chat-input textarea, .chat-input input');
    if (chatInput) {
      chatInput.focus();
    }
  }

  /**
   * 연결 해제
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// ES Module export
export { SoulSocketClient };
