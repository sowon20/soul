/**
 * Soul UI - Main JavaScript Entry Point
 * Vanilla JS Implementation
 */

import { ThemeManager } from './utils/theme-manager.js';
import { ChatManager } from './components/chat/chat-manager.js';
import { PanelManager } from './components/shared/panel-manager.js';
import { MenuManager } from './components/sidebar/menu-manager.js';
import { APIClient } from './utils/api-client.js';
import { initRoleManager } from './utils/role-manager.js';
import dashboardManager from './utils/dashboard-manager.js';

class SoulApp {
  constructor() {
    this.themeManager = null;
    this.chatManager = null;
    this.panelManager = null;
    this.menuManager = null;
    this.apiClient = null;

    // UI Elements
    this.elements = {
      hamburgerBtn: document.getElementById('hamburgerBtn'),
      closeMenuBtn: document.getElementById('closeMenuBtn'),
      mainMenu: document.getElementById('mainMenu'),
      subMenu: document.getElementById('subMenu'),
      subMenuResizer: document.getElementById('subMenuResizer'),
      menuOverlay: document.getElementById('menuOverlay'),
      mainMenuItems: document.querySelectorAll('.main-menu-item'),

      chatForm: document.getElementById('chatForm'),
      messageInput: document.getElementById('messageInput'),
      sendBtn: document.getElementById('sendBtn'),
      messagesArea: document.getElementById('messagesArea'),

      rightPanel: document.getElementById('rightPanel'),
      closePanelBtn: document.getElementById('closePanelBtn'),
      panelTitle: document.getElementById('panelTitle'),
      panelContent: document.getElementById('panelContent'),

      chatContainer: document.getElementById('chatContainer'),

      // Far right panel
      toggleRightPanelBtn: document.getElementById('toggleRightPanelBtn'),
      canvasPanel: document.getElementById('canvasPanel'),
      closeCanvasPanelBtn: document.getElementById('closeCanvasPanelBtn'),

      // Dock toggle
      testBoxToggleBtn: document.getElementById('testBoxToggleBtn'),
      dockTestArea: document.querySelector('.dock-test-area'),
    };

    // Resizer state
    this.resizerState = {
      isResizing: false,
      startX: 0,
      startWidth: 0,
    };
  }

  async init() {
    console.log('🌟 Soul UI 초기화 시작...');

    // Initialize managers
    // Vite 프록시를 통해 /api 요청이 백엔드로 전달됨
    this.apiClient = new APIClient('/api');
    this.themeManager = new ThemeManager();
    this.chatManager = new ChatManager(this.apiClient);
    this.panelManager = new PanelManager(this.apiClient);
    this.menuManager = new MenuManager();
    this.roleManager = initRoleManager(this.apiClient);

    // Load user profile and theme
    await this.loadUserProfile();

    // Setup event listeners
    this.setupEventListeners();

    // Load recent messages (마지막 대화 위치)
    await this.chatManager.loadRecentMessages();

    // Scroll to bottom after messages are loaded
    this.scrollToBottom();

    console.log('✅ Soul UI 초기화 완료!');
  }

  async loadUserProfile() {
    try {
      // TODO: 실제 사용자 ID 가져오기 (인증 시스템 통합 후)
      const userId = 'sowon'; // 임시

      // Set userId in themeManager for server syncing
      this.themeManager.setUserId(userId);

      const profile = await this.apiClient.getUserProfile(userId);

      if (profile && profile.preferences) {
        // Apply theme settings
        const theme = profile.preferences.theme || {};
        await this.themeManager.applyTheme(theme.skin || 'default');
        await this.themeManager.setFontSize(theme.fontSize || 'md');

        if (theme.glassEnabled !== undefined) {
          await this.themeManager.setGlassEffect(theme.glassEnabled, {
            opacity: theme.glassOpacity,
            blur: theme.glassBlur,
          });
        }

        if (theme.backgroundImage) {
          this.themeManager.setBackgroundImage(theme.backgroundImage, {
            opacity: theme.backgroundOpacity,
            blur: theme.backgroundBlur,
          });
        }
      }
    } catch (error) {
      console.warn('사용자 프로필 로드 실패:', error);
      // Use default theme (but still set userId for future saves)
      const userId = 'sowon'; // 임시
      this.themeManager.setUserId(userId);
      await this.themeManager.applyTheme('default');
    }
  }

  setupEventListeners() {
    // Hamburger menu (optional - 햄버거 메뉴가 있을 경우에만)
    if (this.elements.hamburgerBtn) {
      this.elements.hamburgerBtn.addEventListener('click', () => this.toggleMenu());
    }
    if (this.elements.closeMenuBtn) {
      this.elements.closeMenuBtn.addEventListener('click', () => this.closeMenu());
    }
    if (this.elements.menuOverlay) {
      this.elements.menuOverlay.addEventListener('click', () => this.closeMenu());
    }

    // Main menu items (optional)
    if (this.elements.mainMenuItems && this.elements.mainMenuItems.length > 0) {
      this.elements.mainMenuItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const menuType = item.dataset.menu;
          if (menuType) {
            this.menuManager.switchMenu(menuType);
          }
        });
      });
    }

    // Close panel button (optional)
    if (this.elements.closePanelBtn) {
      this.elements.closePanelBtn.addEventListener('click', () => this.closePanel());
    }

    // Toggle far right panel button
    if (this.elements.toggleRightPanelBtn) {
      console.log('✅ Canvas 토글 버튼 등록');
      this.elements.toggleRightPanelBtn.addEventListener('click', () => {
        console.log('🖱️ Canvas 토글 버튼 클릭');
        this.toggleCanvasPanel();
      });
    } else {
      console.log('❌ Canvas 토글 버튼을 찾을 수 없음');
    }

    // Close far right panel button
    if (this.elements.closeCanvasPanelBtn) {
      console.log('✅ Canvas 닫기 버튼 등록');
      this.elements.closeCanvasPanelBtn.addEventListener('click', () => {
        console.log('🖱️ Canvas 닫기 버튼 클릭');
        this.toggleCanvasPanel();
      });
    } else {
      console.log('❌ Canvas 닫기 버튼을 찾을 수 없음');
    }

    // Toggle dock area button
    if (this.elements.testBoxToggleBtn) {
      console.log('✅ 독 토글 버튼 등록');
      this.elements.testBoxToggleBtn.addEventListener('click', () => {
        console.log('🖱️ 독 토글 버튼 클릭');
        this.toggleDock();
      });
    } else {
      console.log('❌ 독 토글 버튼을 찾을 수 없음');
    }

    // MCP button in input area
    const mcpInputBtn = document.querySelector('.attach-btn[title="MCP"]');
    if (mcpInputBtn) {
      console.log('✅ 입력창 MCP 버튼 등록');
      mcpInputBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log('🖱️ 입력창 MCP 버튼 클릭');
        await this.showMCPManager();
      });
    } else {
      console.log('❌ 입력창 MCP 버튼을 찾을 수 없음');
    }

    // Settings section click - 새로운 설정 프레임워크
    const profileSection = document.getElementById('profileSection');
    if (profileSection) {
      console.log('✅ 설정 섹션 클릭 이벤트 등록 (왼쪽 베이지 레이어)');
      profileSection.addEventListener('click', async () => {
        console.log('🖱️ 설정 섹션 클릭 - 설정 페이지 로드');

        // 왼쪽 카드의 요소들 찾기
        const dashboard = document.querySelector('.dashboard');
        const addPageBtn = document.querySelector('.add-page-btn');
        const profileCard = document.querySelector('.profile-section');

        if (dashboard) {
          // 대시보드, 버튼, 프로필 카드 숨기기
          dashboard.style.display = 'none';
          if (addPageBtn) addPageBtn.style.display = 'none';
          if (profileCard) profileCard.style.display = 'none';

          // 설정 컨테이너 생성 또는 찾기
          let settingsContainer = document.getElementById('settingsContainer');
          if (!settingsContainer) {
            settingsContainer = document.createElement('div');
            settingsContainer.id = 'settingsContainer';
            settingsContainer.className = 'settings-wrapper';
            settingsContainer.style.cssText = 'padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;';
            dashboard.parentElement.appendChild(settingsContainer);
          } else {
            settingsContainer.style.display = 'flex';
          }

          settingsContainer.innerHTML = '';

          // 설정 컨텐츠 영역
          const contentDiv = document.createElement('div');
          contentDiv.style.cssText = 'flex: 1; min-height: 0; overflow-y: auto;';
          contentDiv.classList.add('settings-content-wrapper');
          settingsContainer.appendChild(contentDiv);

          // 뒤로가기 버튼 하단에 추가
          const backBtn = document.createElement('button');
          backBtn.innerHTML = '← 대시보드로';
          backBtn.style.cssText = 'margin: 0; padding: 0.4rem 0.75rem; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 0.375rem; color: white; cursor: pointer; font-size: 0.75rem; width: 100%;';
          backBtn.onclick = () => {
            dashboard.style.display = 'block';
            settingsContainer.style.display = 'none';
            if (addPageBtn) addPageBtn.style.display = 'block';
            if (profileCard) profileCard.style.display = 'flex';
          };
          settingsContainer.appendChild(backBtn);

          // SettingsManager로 렌더링
          const { SettingsManager } = await import('./settings/settings-manager.js');
          const settingsManager = new SettingsManager(this.apiClient);
          await settingsManager.render(contentDiv, 'profile');
        }
      });
    } else {
      console.log('❌ 설정 섹션을 찾을 수 없음');
    }

    // Center menu buttons (neo buttons with sound)
    this.initCenterMenuButtons();

    // Mobile menu toggle (.soul button)
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const leftCard = document.querySelector('.left-card');
    const centerGroup = document.querySelector('.center-group');
    const mobileOverlay = document.getElementById('mobileOverlay');

    if (mobileMenuBtn && leftCard && centerGroup) {
      console.log('✅ 모바일 메뉴 버튼 등록');
      mobileMenuBtn.addEventListener('click', () => {
        console.log('🖱️ 모바일 메뉴 버튼 클릭');
        leftCard.classList.toggle('hide');
        centerGroup.classList.toggle('hide');
      });

      if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
          leftCard.classList.add('hide');
          centerGroup.classList.add('hide');
        });
      }
    } else {
      console.log('❌ 모바일 메뉴 요소를 찾을 수 없음');
    }

    // Scroll to bottom button
    const scrollToBottomBtn = document.getElementById('scrollToBottom');
    const messagesContainer = document.querySelector('.right-card-top');

    if (scrollToBottomBtn && messagesContainer) {
      console.log('✅ 스크롤 버튼 및 컨테이너 등록');

      // Check scroll position
      messagesContainer.addEventListener('scroll', () => {
        const scrollTop = messagesContainer.scrollTop;
        const scrollHeight = messagesContainer.scrollHeight;
        const clientHeight = messagesContainer.clientHeight;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        if (distanceFromBottom > 100) {
          scrollToBottomBtn.classList.add('show');
        } else {
          scrollToBottomBtn.classList.remove('show');
        }
      });

      // Scroll to bottom on click
      scrollToBottomBtn.addEventListener('click', () => {
        console.log('🖱️ 스크롤 하단 버튼 클릭');
        messagesContainer.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: 'smooth'
        });
      });
    } else {
      console.log('❌ 스크롤 버튼 또는 컨테이너를 찾을 수 없음');
    }

    // Far right panel resizer
    const canvasResizer = document.getElementById('canvasResizer');
    if (canvasResizer && this.elements.canvasPanel) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      canvasResizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = this.elements.canvasPanel.offsetWidth;
        canvasResizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = startX - e.clientX;
        let minWidth = 250;
        let maxWidth = 500;

        if (window.innerWidth <= 900) {
          minWidth = 150;
          maxWidth = 400;
        } else if (window.innerWidth <= 1200) {
          minWidth = 200;
          maxWidth = 450;
        }

        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
        this.elements.canvasPanel.style.width = newWidth + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          canvasResizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }

    // Initialize clock widget
    this.initWidgetClock();

    // Initialize responsive behavior
    this.initResponsive();

    // Initialize MacOS Dock effect
    this.initMacosDock();

    // Chat form submit (handles both button click and Enter key)
    if (this.elements.chatForm && this.elements.messageInput) {
      this.elements.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.sendMessage();
      });

      // Track IME composition state
      let isComposing = false;

      // Shift+Enter for new line, Enter alone sends message
      this.elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Auto-resize textarea input
      this.elements.messageInput.addEventListener('input', () => {
        this.autoResizeTextarea();
        this.updateSendButton();
      });

      // 한글 IME 조합 중 스타일 안정화 및 상태 추적
      this.elements.messageInput.addEventListener('compositionstart', (e) => {
        isComposing = true;
        e.target.style.fontWeight = '400';
        e.target.style.fontSize = '1rem';
      });

      this.elements.messageInput.addEventListener('compositionupdate', (e) => {
        e.target.style.fontWeight = '400';
        e.target.style.fontSize = '1rem';
      });

      this.elements.messageInput.addEventListener('compositionend', (e) => {
        isComposing = false;
        e.target.style.fontWeight = '400';
        e.target.style.fontSize = '1rem';
      });
    }

    // ESC key to close menu/panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.elements.mainMenu && this.elements.mainMenu.classList.contains('open')) {
          this.closeMenu();
        }
        if (this.elements.rightPanel && this.elements.rightPanel.classList.contains('open')) {
          this.closePanel();
        }
      }
    });

    // Prevent body scroll when menu is open (mobile)
    if (this.elements.mainMenu) {
      this.elements.mainMenu.addEventListener('scroll', (e) => {
        e.stopPropagation();
      });
    }
    if (this.elements.subMenu) {
      this.elements.subMenu.addEventListener('scroll', (e) => {
        e.stopPropagation();
      });
    }
    if (this.elements.rightPanel) {
      this.elements.rightPanel.addEventListener('scroll', (e) => {
        e.stopPropagation();
      });
    }

    // Sub-menu resizer
    if (this.elements.subMenuResizer) {
      this.elements.subMenuResizer.addEventListener('mousedown', (e) => {
        this.startResize(e);
      });
    }

    document.addEventListener('mousemove', (e) => {
      if (this.resizerState.isResizing) {
        this.doResize(e);
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.resizerState.isResizing) {
        this.stopResize();
      }
    });

  }

  toggleMenu() {
    if (this.elements.mainMenu.classList.contains('open')) {
      this.closeMenu();
    } else {
      this.menuManager.open();
    }
  }

  closeMenu() {
    this.menuManager.close();
  }

  openPanel(panelType) {
    this.panelManager.openPanel(panelType);
    this.elements.rightPanel.classList.add('open');
    this.elements.chatContainer.classList.add('panel-open');
  }

  closePanel() {
    this.elements.rightPanel.classList.remove('open');
    this.elements.chatContainer.classList.remove('panel-open');
    this.panelManager.closePanel();
  }

  toggleCanvasPanel() {
    console.log('🔄 toggleCanvasPanel 호출');
    if (this.elements.canvasPanel) {
      const wasHidden = this.elements.canvasPanel.classList.contains('hide');
      this.elements.canvasPanel.classList.toggle('hide');
      console.log(`Canvas 패널: ${wasHidden ? '열림' : '닫힘'}`);
    } else {
      console.log('❌ canvasPanel 요소 없음');
    }
  }

  closeCanvasPanel() {
    if (this.elements.canvasPanel) {
      this.elements.canvasPanel.classList.add('hide');
    }
  }

  toggleDock() {
    console.log('🔄 toggleDock 호출');
    if (this.elements.dockTestArea) {
      if (this.elements.dockTestArea.style.display === 'none') {
        this.elements.dockTestArea.style.display = 'flex';
        console.log('독 표시');
      } else {
        this.elements.dockTestArea.style.display = 'none';
        console.log('독 숨김');
      }
    } else {
      console.log('❌ dockTestArea 요소 없음');
    }
  }

  initWidgetClock() {
    const hourTens = document.getElementById('hourTens');
    const hourOnes = document.getElementById('hourOnes');
    const minuteTens = document.getElementById('minuteTens');
    const minuteOnes = document.getElementById('minuteOnes');
    const calendarWeekday = document.getElementById('calendarWeekday');
    const calendarMonth = document.getElementById('calendarMonth');
    const calendarDay = document.getElementById('calendarDay');

    if (!hourTens || !hourOnes || !minuteTens || !minuteOnes || !calendarWeekday || !calendarMonth || !calendarDay) {
      console.log('시계 위젯 요소를 찾을 수 없습니다.');
      return;
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const updateWidget = () => {
      const now = new Date();

      // 플립 시간 업데이트
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');

      hourTens.textContent = hours[0];
      hourOnes.textContent = hours[1];
      minuteTens.textContent = minutes[0];
      minuteOnes.textContent = minutes[1];

      // 요일, 월, 일 업데이트
      const weekday = weekdays[now.getDay()];
      const month = months[now.getMonth()];
      const day = now.getDate();

      calendarWeekday.textContent = weekday;
      calendarMonth.textContent = month;
      calendarDay.textContent = day;
    };

    updateWidget();
    setInterval(updateWidget, 1000);
  }

  initResponsive() {
    const leftCard = document.querySelector('.left-card');
    const centerGroup = document.querySelector('.center-group');

    // 초기 상태 설정
    const isMobile = window.innerWidth < 900;
    if (isMobile) {
      leftCard?.classList.add('hide');
      centerGroup?.classList.add('hide');
    } else {
      leftCard?.classList.remove('hide');
      centerGroup?.classList.remove('hide');
    }

    // 화면 크기 변경 감지
    let previousWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      const currentWidth = window.innerWidth;
      const wasMobile = previousWidth < 900;
      const isMobileNow = currentWidth < 900;

      if (wasMobile !== isMobileNow) {
        if (isMobileNow) {
          // 데스크톱 -> 모바일
          leftCard?.classList.add('hide');
          centerGroup?.classList.add('hide');
        } else {
          // 모바일 -> 데스크톱
          leftCard?.classList.remove('hide');
          centerGroup?.classList.remove('hide');
        }
      }

      previousWidth = currentWidth;
    });
  }

  initCenterMenuButtons() {
    const buttons = document.querySelectorAll('.center-btn, .neo-btn');

    if (!buttons.length) {
      console.log('❌ 가운데 메뉴 버튼을 찾을 수 없음');
      return;
    }

    console.log('✅ 가운데 메뉴 버튼 등록:', buttons.length);

    // 사운드 효과
    const inSound = new Audio('http://data.tomazki.com/inSound.mp3');
    const outSound = new Audio('http://data.tomazki.com/outSound.mp3');

    [inSound, outSound].forEach(a => {
      a.preload = 'auto';
      a.volume = 0.03;
    });

    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        // 다른 active 버튼들 찾기
        const otherActiveButtons = [...buttons].filter(b => b !== btn && b.classList.contains('active'));

        if (btn.classList.contains('active')) {
          // 이미 active인 버튼을 다시 클릭 - 비활성화
          btn.classList.remove('active');
          outSound.currentTime = 0;
          outSound.play().catch(() => {});

          // Canvas 닫기
          this.closeCanvasPanel();
        } else {
          // 다른 버튼들 먼저 즉시 비활성화
          otherActiveButtons.forEach(b => b.classList.remove('active'));

          // 새로 활성화
          btn.classList.add('active');
          inSound.currentTime = 0;
          inSound.play().catch(() => {});

          // MCP 버튼인 경우 MCP 관리자 표시
          const btnText = btn.querySelector('span')?.textContent?.trim();
          if (btnText === 'MCP' || btn.classList.contains('neo-btn-3')) {
            await this.showMCPManager();
          }
        }
      });
    });
  }

  async showMCPManager() {
    const canvasPanel = this.elements.canvasPanel;
    if (!canvasPanel) return;

    // Canvas 열기
    canvasPanel.classList.remove('hide');

    // Canvas 내용 변경
    const canvasHeader = canvasPanel.querySelector('.canvas-header h3');
    const canvasContent = canvasPanel.querySelector('.canvas-content');

    if (canvasHeader) {
      canvasHeader.textContent = 'MCP 서버';
    }

    if (canvasContent) {
      // MCP 관리자 로드 및 렌더링
      try {
        const { MCPManager } = await import('./components/mcp/mcp-manager.js');
        const mcpManager = new MCPManager(this.apiClient);
        await mcpManager.render(canvasContent);
      } catch (error) {
        console.error('Failed to load MCP Manager:', error);
        canvasContent.innerHTML = `
          <div style="padding: 2rem; text-align: center; color: rgba(239, 68, 68, 0.9);">
            <p>MCP 관리자를 불러오는데 실패했습니다.</p>
            <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
          </div>
        `;
      }
    }
  }

  async sendMessage() {
    const text = this.elements.messageInput.value.trim();
    if (!text) return;

    // Prevent duplicate sends
    if (this._isSending) {
      console.log('⚠️ 중복 전송 차단');
      return;
    }
    this._isSending = true;

    // Clear input
    this.elements.messageInput.value = '';
    this.autoResizeTextarea();
    this.updateSendButton();

    try {
      // Send message through chat manager
      await this.chatManager.sendMessage(text);
    } finally {
      this._isSending = false;
    }
  }

  /**
   * Textarea 자동 높이 조절 (Claude 스타일)
   */
  autoResizeTextarea() {
    const textarea = this.elements.messageInput;

    // Reset height to minimum
    textarea.style.height = 'auto';

    // Calculate new height (최소 48px, 최대 200px)
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 48), 200);
    textarea.style.height = `${newHeight}px`;

    // 스크롤이 필요한지 확인하여 클래스 추가/제거
    if (textarea.scrollHeight > 200) {
      textarea.classList.add('has-scroll');
    } else {
      textarea.classList.remove('has-scroll');
    }
  }

  updateSendButton() {
    const hasText = this.elements.messageInput.value.trim().length > 0;
    this.elements.sendBtn.disabled = !hasText;
  }

  scrollToBottom() {
    const messagesContainer = document.querySelector('.right-card-top');
    if (messagesContainer) {
      console.log('📜 초기 스크롤 하단 이동 시도');
      // 즉시 스크롤
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // 추가로 안전하게 한번 더
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        console.log('📜 스크롤 완료:', messagesContainer.scrollTop);
      });
    } else {
      console.log('❌ 메시지 컨테이너를 찾을 수 없음');
    }
  }

  startResize(e) {
    this.resizerState.isResizing = true;
    this.resizerState.startX = e.clientX;
    this.resizerState.startWidth = this.elements.subMenu.offsetWidth;

    this.elements.subMenu.classList.add('resizing');
    this.elements.subMenuResizer.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  doResize(e) {
    if (!this.resizerState.isResizing) return;

    const diff = e.clientX - this.resizerState.startX;
    const newWidth = this.resizerState.startWidth + diff;

    // Apply min/max constraints (240px ~ 600px)
    const constrainedWidth = Math.min(Math.max(newWidth, 240), 600);
    this.elements.subMenu.style.width = `${constrainedWidth}px`;

    // Update transform to match new width
    const totalOffset = constrainedWidth + 72; // main menu width
    this.elements.subMenu.style.transform = this.elements.subMenu.classList.contains('open')
      ? 'translateX(0)'
      : `translateX(-${totalOffset}px)`;
  }

  stopResize() {
    this.resizerState.isResizing = false;

    this.elements.subMenu.classList.remove('resizing');
    this.elements.subMenuResizer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  /**
   * MacOS Dock 근접 기반 확대 효과
   */
  initMacosDock() {
    const dock = document.querySelector('.macos-dock');
    const dockItems = document.querySelectorAll('.dock-item');

    if (!dock || !dockItems.length) {
      console.log('❌ MacOS Dock 요소를 찾을 수 없음');
      return;
    }

    console.log('✅ MacOS Dock 효과 등록');

    const baseSize = 22; // 기본 아이콘 크기
    const maxSize = 54; // 최대 아이콘 크기 (22 * 1.6 * 1.5)
    const proximityRange = 120; // 영향 범위 (px)

    dock.addEventListener('mousemove', (e) => {
      const dockRect = dock.getBoundingClientRect();
      const mouseX = e.clientX - dockRect.left;

      dockItems.forEach(item => {
        const itemRect = item.getBoundingClientRect();
        const itemCenterX = itemRect.left + itemRect.width / 2 - dockRect.left;

        // 마우스와 아이콘 중심 사이의 거리 계산
        const distance = Math.abs(mouseX - itemCenterX);

        // 거리 기반 스케일 계산 (가까울수록 크게)
        let scale = 1;
        if (distance < proximityRange) {
          const factor = 1 - (distance / proximityRange);
          // 부드러운 곡선 (ease-out quad)
          const easedFactor = 1 - Math.pow(1 - factor, 2);
          scale = 1 + (easedFactor * 1.45); // 1.0 ~ 2.45 범위
        }

        const translateY = -(scale - 1) * 12; // 스케일에 비례한 상승

        item.style.transform = `translateY(${translateY}px) scale(${scale})`;
      });
    });

    dock.addEventListener('mouseleave', () => {
      dockItems.forEach(item => {
        item.style.transform = 'translateY(0) scale(1)';
      });
    });
  }

}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new SoulApp();
    app.init();

    // Make app globally accessible for debugging
    window.soulApp = app;
  });
} else {
  const app = new SoulApp();
  app.init();
  window.soulApp = app;
}
