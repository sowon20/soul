/**
 * socket-client.js
 * Socket.io 클라이언트 + 알림 관리 (Phase 1.6.3)
 */

class SoulSocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.notificationPermission = null;
  }

  /**
   * 연결 초기화
   */
  async init() {
    // 알림 권한 요청
    await this._requestNotificationPermission();

    // Socket.io 연결
    this._connect();
  }

  /**
   * Socket.io 연결
   */
  _connect() {
    // 같은 호스트로 연결
    this.socket = io({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

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

    // 3. 채팅에 메시지 추가 (선택적)
    // this._addToChatHistory(data);
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
   * 연결 상태 인디케이터 업데이트
   */
  _updateConnectionIndicator(connected) {
    let indicator = document.querySelector('.socket-indicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'socket-indicator';
      document.body.appendChild(indicator);
    }

    indicator.classList.toggle('connected', connected);
    indicator.title = connected ? '실시간 연결됨' : '연결 끊김';
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

// 글로벌 인스턴스
window.soulSocket = new SoulSocketClient();

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', () => {
  window.soulSocket.init();
});
