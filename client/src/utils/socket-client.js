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
    this._toolExecutions = []; // 도구 실행 데이터 메모리 저장소
    this._streamCallback = null; // 스트리밍 콜백
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
    // Vite dev(5173) → 백엔드(5041)
    let backendUrl = window.location.origin;
    if (backendUrl.includes(':5173')) {
      backendUrl = backendUrl.replace(':5173', ':5041');
    } else if (backendUrl.includes(':3080')) {
      backendUrl = backendUrl.replace(':3080', ':5041');
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

    // 캔버스 패널 실시간 업데이트
    this.socket.on('canvas_update', (data) => {
      console.log('🎨 Canvas update:', data);
      this._handleCanvasUpdate(data);
    });

    // 터미널 열기 요청
    this.socket.on('open_terminal', (data) => {
      console.log('🖥️ Open terminal:', data);
      this._handleOpenTerminal(data);
    });

    // 스트리밍 이벤트
    this.socket.on('stream_start', () => {
      this._streaming = true;
      if (this._streamCallback) this._streamCallback('start', null);
    });

    this.socket.on('stream_chunk', (data) => {
      if (this._streamCallback) this._streamCallback('chunk', data);
    });

    this.socket.on('stream_end', () => {
      this._streaming = false;
      if (this._streamCallback) this._streamCallback('end', null);
    });
  }

  /**
   * 스트리밍 콜백 등록/해제
   */
  setStreamCallback(cb) {
    this._streamCallback = cb;
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
        icon: '/assets/soul-icon.webp',
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
    // 메모리에 저장
    this._toolExecutions.push({
      name: data.name,
      display: data.display,
      input: data.input || {},
      inputSummary: this._summarizeInput(data.name, data.input),
      success: null, // pending
      result: null,
      error: null,
      startTime: Date.now()
    });

    // 타임라인 모드: streamCallback으로 전달 (chat-manager에서 인라인 렌더링)
    if (this._streamCallback) {
      this._streamCallback('tool_start', {
        name: data.name,
        display: data.display,
        koreanAction: this._getKoreanAction(data.name),
        inputSummary: this._summarizeInput(data.name, data.input)
      });
    }
  }

  /**
   * 도구 실행 완료 처리
   */
  _handleToolEnd(data) {
    // 메모리 업데이트
    const exec = this._toolExecutions.find(
      t => t.name === data.name && t.success === null
    );
    if (exec) {
      exec.success = data.success;
      exec.result = data.success ? (data.result || '') : null;
      exec.error = data.success ? null : (data.error || '');
      exec.duration = Date.now() - exec.startTime;
    }

    // 타임라인 모드: streamCallback으로 전달
    if (this._streamCallback) {
      const rawResult = data.success ? (data.result || '') : (data.error || '실패');
      this._streamCallback('tool_end', {
        name: data.name,
        success: data.success,
        koreanAction: this._getKoreanAction(data.name),
        resultPreview: this._formatResultPreview(data.name, rawResult)
      });
    }
  }

  /**
   * 도구 실행 결과 요약 가져오기 (메모리 기반)
   * @returns {Object} { tools }
   */
  getToolStatusItems() {
    const tools = this._toolExecutions.map(t => ({
      name: t.name,
      display: t.display,
      success: t.success === true,
      error: t.success === false,
      inputSummary: t.inputSummary || '',
      resultPreview: t.success ? (t.result || '').substring(0, 200) : (t.error || ''),
      duration: t.duration || 0
    }));

    return { tools };
  }

  /**
   * 도구 실행 기록 초기화 (AI 응답 후 호출)
   */
  clearToolStatus() {
    this._toolExecutions = [];
  }

  /**
   * 도구 한국어 동작명 매핑
   */
  _getKoreanAction(toolName) {
    const map = {
      'recall_memory': '기억 검색',
      'get_profile': '프로필 조회',
      'update_profile': '정보 저장',
      'list_my_rules': '규칙 조회',
      'add_my_rule': '규칙 저장',
      'delete_my_rule': '규칙 삭제',
      'send_message': '메시지 전송',
      'schedule_message': '메시지 예약',
      'cancel_scheduled_message': '예약 취소',
      'list_scheduled_messages': '예약 목록',
      'execute_command': '명령 실행'
    };
    return map[toolName] || toolName;
  }

  /**
   * 도구 입력값 요약
   */
  _summarizeInput(toolName, input) {
    if (!input) return '';
    switch (toolName) {
      case 'recall_memory':
        return input.query ? `'${input.query}'` : '';
      case 'get_profile':
        return input.field || '전체';
      case 'update_profile':
        return `${input.field}: ${String(input.value || '').substring(0, 50)}`;
      case 'list_my_rules':
        return input.category || '전체';
      case 'add_my_rule':
        return String(input.rule || '').substring(0, 80);
      case 'delete_my_rule':
        return input.ruleId || '';
      default: {
        const keys = Object.keys(input);
        if (keys.length === 0) return '';
        const first = keys[0];
        return `${first}: ${String(input[first] || '').substring(0, 60)}`;
      }
    }
  }

  /**
   * 도구 결과를 사람이 읽기 좋게 변환
   */
  _formatResultPreview(toolName, resultText) {
    if (!resultText) return '';
    try {
      const data = typeof resultText === 'string' ? JSON.parse(resultText) : resultText;
      if (typeof data !== 'object') return String(resultText).substring(0, 100);

      switch (toolName) {
        case 'get_profile': {
          if (data.found === false) return data.message || '정보 없음';
          if (data.field && data.value) return `${data.field}: ${data.value}`;
          const parts = [];
          if (data.basicInfo) {
            for (const [k, v] of Object.entries(data.basicInfo)) {
              const val = typeof v === 'object' ? v.value : v;
              if (val) parts.push(`${k}: ${val}`);
            }
          }
          return parts.length > 0 ? parts.join(', ') : '프로필 조회 완료';
        }
        case 'recall_memory':
          if (data.count !== undefined) return `${data.count}건의 기억 발견`;
          if (data.results?.length > 0) return `${data.results.length}건 발견`;
          return data.message || '검색 완료';
        case 'update_profile':
          return data.success ? `${data.field || '정보'} 저장 완료` : (data.message || '저장 실패');
        case 'list_my_rules':
          if (Array.isArray(data.rules)) return `${data.rules.length}개 규칙`;
          return '규칙 조회 완료';
        case 'add_my_rule':
          return data.success ? '규칙 저장 완료' : (data.message || '실패');
        case 'delete_my_rule':
          return data.success ? '규칙 삭제 완료' : (data.message || '실패');
        default: {
          const summary = [];
          for (const [k, v] of Object.entries(data)) {
            if (k === 'success') continue;
            summary.push(`${k}: ${String(typeof v === 'object' ? JSON.stringify(v).substring(0, 40) : v).substring(0, 50)}`);
            if (summary.length >= 2) break;
          }
          return summary.join(', ') || '완료';
        }
      }
    } catch {
      return String(resultText).substring(0, 100);
    }
  }

  /**
   * HTML 이스케이프
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 스크롤 하단 이동
   */
  _scrollToBottom() {
    const scrollContainer = document.querySelector('.right-card-top');
    if (scrollContainer) {
      // 사용자가 위로 스크롤한 상태면 강제 스크롤 안 함
      const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 150;
      if (isNearBottom) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
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
   * 캔버스 패널 실시간 업데이트 처리
   * 도구 실행 결과가 열려있는 패널에 즉시 반영 + 변경 부분 하이라이트
   */
  _handleCanvasUpdate(data) {
    // 캔버스 iframe에 변경 알림 (MCP 도구 실행 후 실시간 반영 + 이펙트)
    // data.panel은 'todo' 같은 단축명이지만, iframe ID는 'canvas-iframe-mcp_xxx' 형태
    // → 모든 MCP iframe을 순회하며 매칭
    let canvasIframe = document.querySelector(`#canvas-iframe-${data.panel} iframe`);
    if (!canvasIframe) {
      // 단축명으로 못 찾으면, canvasTabs에서 이름 매칭으로 찾기
      const tabs = window.soulApp?.canvasTabs || [];
      const matchTab = tabs.find(t =>
        t.title?.toLowerCase().includes(data.panel) ||
        t.type?.toLowerCase().includes(data.panel)
      );
      if (matchTab) {
        canvasIframe = document.querySelector(`#canvas-iframe-${matchTab.type} iframe`);
      }
    }
    if (canvasIframe) {
      try {
        canvasIframe.contentWindow.postMessage({
          type: 'soul_canvas_update',
          tool: data.tool,
          input: data.input,
          result: data.result
        }, '*');
      } catch (e) {
        canvasIframe.contentWindow?.location.reload();
      }
      return;
    }

    // iframe이 없으면 기존 패널 매니저 방식
    const panelManager = window.soulApp?.panelManager;
    if (!panelManager) return;

    if (panelManager.currentPanel === data.panel) {
      const beforeItems = panelManager.panelContent?.querySelectorAll('[data-item-id]') || [];
      const beforeIds = new Set([...beforeItems].map(el => el.dataset.itemId));

      panelManager.openPanel(data.panel).then(() => {
        requestAnimationFrame(() => {
          const afterItems = panelManager.panelContent?.querySelectorAll('[data-item-id]') || [];
          afterItems.forEach(el => {
            if (!beforeIds.has(el.dataset.itemId)) {
              el.classList.add('canvas-item-highlight');
              setTimeout(() => el.classList.remove('canvas-item-highlight'), 2000);
            }
          });

          if (afterItems.length === 0 && panelManager.panelContent) {
            const content = panelManager.panelContent.querySelector('.todo-panel, .memory-panel, .profile-panel');
            if (content) {
              content.classList.add('canvas-content-flash');
              setTimeout(() => content.classList.remove('canvas-content-flash'), 1500);
            }
          }
        });
      });
    }

    if (panelManager.currentPanel !== data.panel) {
      this._showCanvasUpdateBadge(data);
    }
  }

  /**
   * 캔버스 업데이트 알림 배지 (패널이 닫혀있을 때)
   */
  _showCanvasUpdateBadge(data) {
    const panelToggle = document.querySelector('.canvas-toggle-btn, [data-panel-toggle]');
    if (!panelToggle) return;

    let badge = panelToggle.querySelector('.canvas-update-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'canvas-update-badge';
      panelToggle.style.position = 'relative';
      panelToggle.appendChild(badge);
    }
    badge.classList.add('pulse');
    setTimeout(() => badge.classList.remove('pulse'), 3000);
  }

  /**
   * 터미널 열기 처리
   */
  _handleOpenTerminal(data) {
    console.log('🖥️ Opening terminal, command:', data.command);

    // Dock의 시스템 섹션 클릭
    const systemSection = document.querySelector('[data-section="section_system"]');
    if (systemSection) {
      systemSection.click();

      // 명령어가 있으면 터미널에 입력
      if (data.command) {
        setTimeout(() => {
          const termInput = document.querySelector('#termInput');
          const termCursorLine = document.querySelector('#termCursorLine');

          if (termInput) {
            // input 태그 방식
            termInput.value = data.command;
            termInput.focus();
            // Enter 이벤트 시뮬레이션
            const enterEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true
            });
            termInput.dispatchEvent(enterEvent);
          } else if (window.soulApp && window.soulApp._attachTerminalEvents) {
            // 커서 라인 방식 - currentInput에 직접 설정
            // 터미널이 렌더링될 때까지 대기
            const waitForTerminal = setInterval(() => {
              if (document.querySelector('#termCursorLine')) {
                clearInterval(waitForTerminal);
                // 커서에 명령 입력 후 Enter 시뮬레이션
                const container = document.querySelector('#termOutput').closest('div');
                if (container) {
                  container.focus();
                  // 문자 하나씩 입력 이벤트 발생
                  for (const char of data.command) {
                    const charEvent = new KeyboardEvent('keydown', {
                      key: char,
                      code: `Key${char.toUpperCase()}`,
                      bubbles: true
                    });
                    container.dispatchEvent(charEvent);
                  }
                  // Enter 입력
                  const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true
                  });
                  container.dispatchEvent(enterEvent);
                }
              }
            }, 100);

            // 5초 후 타임아웃
            setTimeout(() => clearInterval(waitForTerminal), 5000);
          }
        }, 500);
      }
    } else {
      console.warn('🖥️ System section not found in Dock');
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
