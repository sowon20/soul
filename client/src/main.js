/**
 * Soul UI - Main JavaScript Entry Point
 * Vanilla JS Implementation
 */

import { ThemeManager } from './utils/theme-manager.js';
import { ChatManager } from './components/chat/chat-manager.js?v=18';
import { PanelManager } from './components/shared/panel-manager.js';
import { MenuManager } from './components/sidebar/menu-manager.js';
import { APIClient } from './utils/api-client.js';
import { initRoleManager } from './utils/role-manager.js';
import dashboardManager from './utils/dashboard-manager.js';
import { SearchManager } from './utils/search-manager.js';
import { SoulSocketClient } from './utils/socket-client.js';
import { getVoiceInput } from './utils/voice-input.js';

class SoulApp {
  constructor() {
    this.themeManager = null;
    this.chatManager = null;
    this.panelManager = null;
    this.menuManager = null;
    this.apiClient = null;
    this.searchManager = null;
    this.socketClient = null;

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

    // 부트스트랩 상태 확인
    const bootstrapComplete = await this.checkBootstrap();
    if (!bootstrapComplete) {
      console.log('🔧 부트스트랩 미완료 - 초기 설정 필요');
      // 초기 설정이 필요하면 설정 페이지로
      this.showBootstrapSetup();
      return;
    }

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

    // Bind events to existing hardcoded messages (for demo/fallback)
    this.chatManager.bindExistingMessages();

    // Scroll to bottom after messages are loaded
    this.scrollToBottom();

    // 대시보드 통계 로드
    await dashboardManager.init();

    // 검색 매니저 초기화
    this.searchManager = new SearchManager(this.apiClient);
    this.searchManager.init();

    // Socket.io 클라이언트 초기화
    this.socketClient = new SoulSocketClient();
    await this.socketClient.init();

    // 입력창 높이에 따른 스크롤 버튼 위치 초기화
    this.updateInputAreaHeight();

    console.log('✅ Soul UI 초기화 완료!');
  }

  /**
   * 부트스트랩 상태 확인
   */
  async checkBootstrap() {
    try {
      const response = await this.apiClient.get('/bootstrap/status');
      return response.completed === true;
    } catch (error) {
      console.error('Bootstrap check failed:', error);
      // API 실패 시 계속 진행 (이전 버전 호환)
      return true;
    }
  }

  /**
   * 부트스트랩 초기 설정 화면 표시
   */
  showBootstrapSetup() {
    const mainContent = document.getElementById('main-content') || document.body;
    mainContent.innerHTML = `
      <div class="bootstrap-setup">
        <div class="bootstrap-container">
          <div class="bootstrap-header">
            <h1>✨ Soul AI 초기 설정</h1>
            <p>처음 사용하시네요! 몇 가지 설정이 필요합니다.</p>
          </div>

          <div class="bootstrap-form">
            <div class="bootstrap-field">
              <label>저장소 타입</label>
              <select id="bootstrapStorageType">
                <option value="local" selected>💾 로컬 저장소</option>
                <option value="ftp">🌐 FTP/NAS</option>
                <option value="oracle">☁️ Oracle</option>
                <option value="notion">📝 Notion</option>
              </select>
            </div>

            <div class="bootstrap-field" id="localPathField">
              <label>저장 경로</label>
              <input type="text" id="bootstrapPath" value="~/.soul" placeholder="~/.soul">
              <small>대화 기록, 기억, 파일이 저장될 위치</small>
            </div>

            <div class="bootstrap-actions">
              <button class="bootstrap-btn primary" id="completeBootstrap">
                설정 완료
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 이벤트 리스너
    document.getElementById('completeBootstrap').addEventListener('click', async () => {
      const storageType = document.getElementById('bootstrapStorageType').value;
      const storagePath = document.getElementById('bootstrapPath').value || '~/.soul';

      try {
        await this.apiClient.post('/bootstrap/complete', {
          storageType,
          storagePath
        });

        // 페이지 새로고침
        window.location.reload();
      } catch (error) {
        alert('설정 저장에 실패했습니다: ' + error.message);
      }
    });

    // 저장소 타입 변경 시 경로 필드 표시/숨김
    document.getElementById('bootstrapStorageType').addEventListener('change', (e) => {
      const localPathField = document.getElementById('localPathField');
      localPathField.style.display = e.target.value === 'local' ? 'block' : 'none';
    });
  }

  async loadUserProfile() {
    try {
      // 사용자 ID: 인증 시스템 통합 전까지 localStorage 또는 기본값 사용
      const userId = localStorage.getItem('userId') || 'default';

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

      // Phase P 프로필 사진 로드
      await this.loadProfileImage(userId);

    } catch (error) {
      console.warn('사용자 프로필 로드 실패:', error);
      // Use default theme (but still set userId for future saves)
      const userId = localStorage.getItem('userId') || 'default';
      this.themeManager.setUserId(userId);
      await this.themeManager.applyTheme('default');
      // 프로필 API 실패해도 프로필 이미지는 별도 시도
      this.loadProfileImage(userId);
    }
  }

  /**
   * Phase P 프로필 정보 로드 및 표시 (center-card 프로필 버튼)
   */
  async loadProfileImage(userId, retryCount = 0) {
    const MAX_RETRIES = 5;
    try {
      // 프로필 전체 정보 로드
      const response = await fetch(`/api/profile/p?userId=${userId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.success && data.profile) {
        const profile = data.profile;

        // center-card 프로필 버튼에 사진 업데이트
        if (profile.profileImage) {
          const avatar = document.querySelector('.profile-btn .profile-avatar');
          if (avatar) {
            avatar.style.backgroundImage = `url(${profile.profileImage})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
          }
        }

        // 닉네임 표시
        const nicknameEl = document.getElementById('profileNickname');
        const nickname = profile.basicInfo?.nickname?.value;
        if (nicknameEl && nickname) {
          nicknameEl.textContent = nickname;
        }

        console.log('✅ 프로필 정보 로드 완료');
      } else if (retryCount < MAX_RETRIES) {
        setTimeout(() => this.loadProfileImage(userId, retryCount + 1), (retryCount + 1) * 1000);
      }
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => this.loadProfileImage(userId, retryCount + 1), (retryCount + 1) * 1000);
      } else {
        console.warn('프로필 정보 로드 실패:', error);
      }
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
        await this.showAppSettings();
        // MCP 탭 자동 선택 (약간의 딜레이 후)
        setTimeout(() => {
          const mcpTab = document.querySelector('.app-tab[data-tab="mcp"]');
          if (mcpTab) mcpTab.click();
        }, 100);
      });
    } else {
      console.log('❌ 입력창 MCP 버튼을 찾을 수 없음');
    }

    // 첨부 버튼 이벤트
    this.initAttachmentHandler();

    // 프로필 버튼 클릭 - 설정 프레임워크 (center-card 하단)
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
      console.log('✅ 프로필 버튼 클릭 이벤트 등록 (center-card)');
      profileBtn.addEventListener('click', async () => {
        console.log('🖱️ 프로필 버튼 클릭 - 설정 페이지 로드');

        // 왼쪽 카드의 요소들 찾기
        const dashboard = document.querySelector('.dashboard');
        const addPageBtn = document.querySelector('.add-page-btn');

        if (dashboard) {
          // 대시보드, 버튼 숨기기
          dashboard.style.display = 'none';
          if (addPageBtn) addPageBtn.style.display = 'none';

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

          // SettingsManager로 렌더링
          const { SettingsManager } = await import('./settings/settings-manager.js');
          const settingsManager = new SettingsManager(this.apiClient);
          await settingsManager.render(contentDiv, 'profile');

          // 프로필 버튼 활성화
          this.setActiveNavButton(0);
        }
      });
    } else {
      console.log('❌ 프로필 버튼을 찾을 수 없음');
    }

    // Center menu buttons (neo buttons with sound)
    this.initCenterMenuButtons();

    // 초기 상태: 대시보드 버튼 활성화
    this.setActiveNavButton(1);

    // Mobile menu toggle (.soul button)
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const leftCard = document.querySelector('.left-card');
    const centerGroup = document.querySelector('.center-group');
    const mobileOverlay = document.getElementById('mobileOverlay');

    if (mobileMenuBtn && leftCard && centerGroup) {
      console.log('✅ 모바일 메뉴 버튼 등록');
      mobileMenuBtn.addEventListener('click', () => {
        console.log('🖱️ 모바일 메뉴 버튼 클릭');
        if (leftCard.classList.contains('hide')) {
          this.showMobileSidebar();
        } else {
          this.hideMobileSidebar();
        }
      });

      if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => this.hideMobileSidebar());
      }
    } else {
      console.log('❌ 모바일 메뉴 요소를 찾을 수 없음');
    }

    // 바깥 클릭 시 사이드바 숨김 (모바일만)
    const rightArea = document.querySelector('.right-area');
    if (rightArea && leftCard && centerGroup) {
      rightArea.addEventListener('click', () => {
        if (window.innerWidth < 900 && !leftCard.classList.contains('hide')) {
          this.hideMobileSidebar();
        }
      });
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
    this.initSwipeGesture();

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
      });

      this.elements.messageInput.addEventListener('compositionupdate', (e) => {
        e.target.style.fontWeight = '400';
      });

      this.elements.messageInput.addEventListener('compositionend', (e) => {
        isComposing = false;
        e.target.style.fontWeight = '400';
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
      if (wasHidden) {
        this.elements.canvasPanel.classList.remove('hide');
        this.movCanvasPanelForMobile();
      } else {
        this.restoreCanvasPanelFromMobile();
        this.elements.canvasPanel.classList.add('hide');
      }
      console.log(`Canvas 패널: ${wasHidden ? '열림' : '닫힘'}`);
      // 스크롤 버튼 위치 업데이트 (DOM 배치 완료 후)
      setTimeout(() => this.updateInputAreaHeight(), 100);
    } else {
      console.log('❌ canvasPanel 요소 없음');
    }
  }

  closeCanvasPanel() {
    if (this.elements.canvasPanel) {
      this.restoreCanvasPanelFromMobile();
      this.elements.canvasPanel.classList.add('hide');
    }
  }

  /** 모바일: 캔버스 패널을 right-container 안으로 이동 (채팅 아래, 독 위) */
  movCanvasPanelForMobile() {
    if (window.innerWidth >= 900) return;
    const panel = this.elements.canvasPanel;
    if (!panel) return;
    const rightContainer = document.querySelector('.right-container');
    const dockArea = document.querySelector('.dock-test-area');
    const rightCardTop = document.querySelector('.right-card-top');
    if (!rightContainer) return;

    // dock-test-area 앞에 삽입, 없으면 right-card-bottom 앞에
    const insertBefore = dockArea || document.querySelector('.right-card-bottom');
    if (insertBefore) {
      rightContainer.insertBefore(panel, insertBefore);
    } else {
      rightContainer.appendChild(panel);
    }

    // 비율 설정
    if (rightCardTop) rightCardTop.style.flex = '0.65';
    panel.style.flex = '0.35';
    panel.style.width = '100%';
    panel.style.minWidth = '0';
    panel.style.maxWidth = 'none';

    // 리사이저 추가
    this.addCanvasResizer(rightCardTop, panel);

    // 스크롤 버튼 위치 업데이트 (레이아웃 완료 후)
    setTimeout(() => this.updateInputAreaHeight(), 150);
  }

  /** 모바일: 캔버스/채팅 경계선 드래그 리사이저 */
  addCanvasResizer(chatArea, canvasPanel) {
    // 기존 리사이저 제거
    const existing = document.getElementById('mobileCanvasResizer');
    if (existing) existing.remove();

    const resizer = document.createElement('div');
    resizer.id = 'mobileCanvasResizer';
    resizer.style.cssText = 'height: 16px; margin: -8px 0; cursor: row-resize; display: flex; align-items: center; justify-content: center; flex-shrink: 0; touch-action: none; position: relative; z-index: 5;';

    // 경계 라인
    const handle = document.createElement('div');
    handle.style.cssText = 'width: 40px; height: 3px; border-radius: 1.5px; background: rgba(255,255,255,0.3);';
    resizer.appendChild(handle);

    // 캔버스 패널 바로 앞에 삽입
    canvasPanel.parentNode.insertBefore(resizer, canvasPanel);

    let startY = 0;
    let startChatFlex = 0;
    let startCanvasFlex = 0;

    const onStart = (e) => {
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      startY = touch.clientY;
      startChatFlex = parseFloat(chatArea.style.flex) || 0.65;
      startCanvasFlex = parseFloat(canvasPanel.style.flex) || 0.35;
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      handle.style.background = 'rgba(255,255,255,0.6)';
    };

    const onMove = (e) => {
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const container = chatArea.parentNode;
      const containerHeight = container.clientHeight;
      const diff = touch.clientY - startY;
      const diffRatio = diff / containerHeight;

      let newChatFlex = startChatFlex + diffRatio;
      let newCanvasFlex = startCanvasFlex - diffRatio;

      // 최소/최대 제한
      if (newChatFlex < 0.3) newChatFlex = 0.3;
      if (newCanvasFlex < 0.15) newCanvasFlex = 0.15;
      if (newChatFlex > 0.85) newChatFlex = 0.85;
      if (newCanvasFlex > 0.7) newCanvasFlex = 0.7;

      chatArea.style.flex = newChatFlex.toString();
      canvasPanel.style.flex = newCanvasFlex.toString();
    };

    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      handle.style.background = 'rgba(255,255,255,0.3)';
      // 스크롤 버튼 위치 업데이트
      this.updateInputAreaHeight();
    };

    resizer.addEventListener('touchstart', onStart, { passive: false });
    resizer.addEventListener('mousedown', onStart);
  }

  /** 모바일: 캔버스 패널을 원래 위치(right-area)로 복원 */
  restoreCanvasPanelFromMobile() {
    if (window.innerWidth >= 900) return;
    const panel = this.elements.canvasPanel;
    if (!panel) return;
    const rightArea = document.querySelector('.right-area');
    const rightCardTop = document.querySelector('.right-card-top');
    if (!rightArea) return;

    // 리사이저 제거
    const resizer = document.getElementById('mobileCanvasResizer');
    if (resizer) resizer.remove();

    rightArea.appendChild(panel);
    if (rightCardTop) rightCardTop.style.flex = '';
    panel.style.flex = '';
    panel.style.width = '';
    panel.style.minWidth = '';
    panel.style.maxWidth = '';
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
    // 초기 상태 설정
    const isMobile = window.innerWidth < 900;
    if (isMobile) {
      this.hideMobileSidebar();
    }

    // 화면 크기 변경 감지
    let previousWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      const currentWidth = window.innerWidth;
      const wasMobile = previousWidth < 900;
      const isMobileNow = currentWidth < 900;

      if (wasMobile !== isMobileNow) {
        if (isMobileNow) {
          this.hideMobileSidebar();
        } else {
          this.showMobileSidebar();
        }
      }

      previousWidth = currentWidth;
    });
  }

  showMobileSidebar() {
    const leftCard = document.querySelector('.left-card');
    const centerGroup = document.querySelector('.center-group');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (!leftCard || !centerGroup) return;
    // 키보드 내리기
    if (document.activeElement) document.activeElement.blur();
    leftCard.classList.remove('hide');
    centerGroup.classList.remove('hide');
    // 토글 버튼을 center-group으로 복귀
    if (mobileMenuBtn && mobileMenuBtn.classList.contains('mobile-menu-btn-floating')) {
      centerGroup.appendChild(mobileMenuBtn);
      mobileMenuBtn.classList.remove('mobile-menu-btn-floating');
    }
  }

  hideMobileSidebar() {
    const leftCard = document.querySelector('.left-card');
    const centerGroup = document.querySelector('.center-group');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (!leftCard || !centerGroup) return;
    leftCard.classList.add('hide');
    centerGroup.classList.add('hide');
    // 모바일에서 토글 버튼을 body로 이동 (transform 영향 회피)
    if (window.innerWidth < 900 && mobileMenuBtn) {
      document.body.appendChild(mobileMenuBtn);
      mobileMenuBtn.classList.add('mobile-menu-btn-floating');
    }
  }

  initSwipeGesture() {
    const leftCard = document.querySelector('.left-card');
    const centerGroup = document.querySelector('.center-group');
    if (!leftCard || !centerGroup) return;

    let startX = 0;
    let startY = 0;
    let swiping = false;

    document.addEventListener('touchstart', (e) => {
      if (window.innerWidth >= 900) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      const isHidden = leftCard.classList.contains('hide');
      swiping = isHidden ? startX < 25 : true;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!swiping || window.innerWidth >= 900) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = Math.abs(endY - startY);

      if (diffY > Math.abs(diffX)) return;

      const isHidden = leftCard.classList.contains('hide');

      if (isHidden && diffX > 50) {
        this.showMobileSidebar();
      } else if (!isHidden && diffX < -50) {
        this.hideMobileSidebar();
      }

      swiping = false;
    }, { passive: true });

    // 풀업 새로고침: 대화창 맨 아래에서 위로 끌어올리기
    this.initPullUpRefresh();
  }

  initPullUpRefresh() {
    const scrollContainer = document.querySelector('.right-card-top');
    const messagesArea = document.getElementById('messagesArea');
    if (!scrollContainer || !messagesArea) return;

    let pullStartY = 0;
    let pulling = false;
    let indicator = null;

    const createIndicator = () => {
      if (indicator) return indicator;
      indicator = document.createElement('div');
      indicator.id = 'pullUpIndicator';
      indicator.style.cssText = 'position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%); z-index: 200; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 18px; opacity: 0; transition: opacity 0.2s, transform 0.2s; pointer-events: none;';
      indicator.textContent = '↻';
      document.body.appendChild(indicator);
      return indicator;
    };

    const removeIndicator = () => {
      if (indicator) {
        indicator.remove();
        indicator = null;
      }
    };

    scrollContainer.addEventListener('touchstart', (e) => {
      if (window.innerWidth >= 900) return;
      // 스크롤이 맨 아래인지 확인
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const atBottom = scrollHeight - scrollTop - clientHeight < 10;
      if (atBottom) {
        pullStartY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    scrollContainer.addEventListener('touchmove', (e) => {
      if (!pulling || window.innerWidth >= 900) return;
      const diffY = pullStartY - e.touches[0].clientY;
      if (diffY > 10) {
        // 쭈욱 따라오되, 고무줄처럼 점점 늘어나기 힘들게
        const raw = diffY - 10;
        const pullAmount = 100 * Math.log10(1 + raw / 30);
        const progress = Math.min(raw / 100, 1);
        // 대화 메시지를 위로 쭈욱 밀어올리기
        messagesArea.style.transform = `translateY(-${pullAmount}px)`;
        messagesArea.style.transition = 'none';
        // 새로고침 아이콘
        const ind = createIndicator();
        ind.style.opacity = progress.toString();
        ind.style.transform = `translateX(-50%) rotate(${raw * 3}deg)`;
      }
    }, { passive: true });

    scrollContainer.addEventListener('touchend', (e) => {
      if (!pulling || window.innerWidth >= 900) return;
      const diffY = pullStartY - e.changedTouches[0].clientY;
      if (diffY > 100) {
        // 새로고침 - 쭈욱 올라가고 reload
        const raw = diffY - 10;
        const currentY = 100 * Math.log10(1 + raw / 30);
        // 고무줄 놓듯이 탕 하고 원위치로 튕김
        messagesArea.style.transition = 'transform 0.3s cubic-bezier(0.6, 0, 0.5, 1)';
        messagesArea.style.transform = 'translateY(0)';
        if (indicator) {
          indicator.style.transition = 'opacity 0.2s';
          indicator.style.opacity = '0';
        }
        setTimeout(() => window.location.reload(), 350);
      } else {
        // 취소 - 부드럽게 원위치
        messagesArea.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)';
        messagesArea.style.transform = '';
        removeIndicator();
      }
      pulling = false;
    }, { passive: true });
  }

  initCenterMenuButtons() {
    const buttons = document.querySelectorAll('.center-btn, .neo-btn');

    if (!buttons.length) {
      console.log('❌ 가운데 메뉴 버튼을 찾을 수 없음');
      return;
    }

    console.log('✅ 가운데 메뉴 버튼 등록:', buttons.length);

    // 사운드 효과 (로컬)
    const inSound = new Audio('/assets/sounds/in.mp3');
    const outSound = new Audio('/assets/sounds/out.mp3');

    [inSound, outSound].forEach(a => {
      a.preload = 'auto';
      a.volume = 0.03;
    });

    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        // 다른 active 버튼들 찾기
        const otherActiveButtons = [...buttons].filter(b => b !== btn && b.classList.contains('active'));

        if (btn.classList.contains('active') && !btn.classList.contains('neo-btn-1')) {
          // 대시보드가 아닌 버튼을 다시 클릭 - 대시보드로 돌아가기
          outSound.currentTime = 0;
          outSound.play().catch(() => {});

          this.showDashboard();
          this.setActiveNavButton(1);
        } else if (!btn.classList.contains('active')) {
          // 다른 버튼들 먼저 즉시 비활성화
          otherActiveButtons.forEach(b => b.classList.remove('active'));

          // 새로 활성화
          btn.classList.add('active');
          inSound.currentTime = 0;
          inSound.play().catch(() => {});

          // 버튼별 동작
          const btnText = btn.querySelector('span')?.textContent?.trim();

          if (btnText === '대시보드' || btn.classList.contains('neo-btn-1')) {
            // 대시보드 표시 (설정 닫고 대시보드 보이기)
            this.showDashboard();
            this.setActiveNavButton(1);
          } else if (btnText === 'AI' || btn.classList.contains('neo-btn-2')) {
            // AI 설정 페이지 표시
            await this.showAISettings();
            this.setActiveNavButton(2);
          } else if (btnText === '저장소' || btn.classList.contains('neo-btn-storage')) {
            // 저장소 설정 페이지 표시
            await this.showStorageSettings();
            this.setActiveNavButton('storage');
          } else if (btnText === 'APP' || btn.classList.contains('neo-btn-3')) {
            await this.showAppSettings();
            this.setActiveNavButton(3);
          } else if (btnText === '서버' || btn.classList.contains('neo-btn-4')) {
            await this.showServerStatus();
            this.setActiveNavButton(4);
          }
        }
      });
    });
  }

  /**
   * 대시보드 표시 (왼쪽 카드)
   */
  showDashboard() {
    const dashboard = document.querySelector('.dashboard');
    const addPageBtn = document.querySelector('.add-page-btn');
    const settingsContainer = document.getElementById('settingsContainer');

    // 설정 컨테이너 숨기고 대시보드 표시
    if (settingsContainer) {
      settingsContainer.style.display = 'none';
    }
    if (dashboard) {
      dashboard.style.display = 'block';
    }
    if (addPageBtn) {
      addPageBtn.style.display = 'block';
    }

    console.log('📊 대시보드 표시');
  }

  /**
   * 네비게이션 버튼 활성화 상태 설정
   * @param {number} buttonNum - 버튼 번호 (1: 대시보드, 2: AI, 3: APP, 4: 서버, 0: 프로필)
   */
  setActiveNavButton(buttonNum) {
    // 모든 neo-btn에서 active 제거
    document.querySelectorAll('.neo-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    // 프로필 버튼 active 제거
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
      profileBtn.classList.remove('active');
    }

    // 해당 버튼에 active 추가
    if (buttonNum === 'storage') {
      const storageBtn = document.querySelector('.neo-btn-storage');
      if (storageBtn) {
        storageBtn.classList.add('active');
      }
    } else if (buttonNum > 0) {
      const activeBtn = document.querySelector(`.neo-btn-${buttonNum}`);
      if (activeBtn) {
        activeBtn.classList.add('active');
      }
    } else if (buttonNum === 0 && profileBtn) {
      profileBtn.classList.add('active');
    }
  }

  /**
   * AI 설정 페이지 표시 (.soul 버튼)
   */
  async showAISettings() {
    console.log('🤖 AI 설정 페이지 표시');

    const dashboard = document.querySelector('.dashboard');
    const addPageBtn = document.querySelector('.add-page-btn');

    if (dashboard) {
      dashboard.style.display = 'none';
      if (addPageBtn) addPageBtn.style.display = 'none';

      let settingsContainer = document.getElementById('settingsContainer');
      if (!settingsContainer) {
        settingsContainer = document.createElement('div');
        settingsContainer.id = 'settingsContainer';
        settingsContainer.className = 'settings-wrapper';
        settingsContainer.style.cssText = 'padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;';
        dashboard.parentElement.appendChild(settingsContainer);
      }

      settingsContainer.style.display = 'flex';

      // 설정 매니저로 AI 설정 페이지 렌더링
      const { SettingsManager } = await import('./settings/settings-manager.js');
      const settingsManager = new SettingsManager(this.apiClient);
      await settingsManager.render(settingsContainer, 'ai');
    }
  }

  /**
   * 저장소 설정 페이지 표시
   */
  async showStorageSettings() {
    console.log('💾 저장소 설정 페이지 표시');

    const dashboard = document.querySelector('.dashboard');
    const addPageBtn = document.querySelector('.add-page-btn');

    if (dashboard) {
      dashboard.style.display = 'none';
      if (addPageBtn) addPageBtn.style.display = 'none';

      let settingsContainer = document.getElementById('settingsContainer');
      if (!settingsContainer) {
        settingsContainer = document.createElement('div');
        settingsContainer.id = 'settingsContainer';
        settingsContainer.className = 'settings-wrapper';
        settingsContainer.style.cssText = 'padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;';
        dashboard.parentElement.appendChild(settingsContainer);
      }

      settingsContainer.style.display = 'flex';

      // 설정 매니저로 저장소 설정 페이지 렌더링
      const { SettingsManager } = await import('./settings/settings-manager.js');
      const settingsManager = new SettingsManager(this.apiClient);
      await settingsManager.render(settingsContainer, 'storage');
    }
  }

  /**
   * 서버 상태 페이지 표시
   */
  async showServerStatus() {
    console.log('🖥️ 서버 상태 페이지 표시');

    const dashboard = document.querySelector('.dashboard');
    const addPageBtn = document.querySelector('.add-page-btn');

    if (dashboard) {
      dashboard.style.display = 'none';
      if (addPageBtn) addPageBtn.style.display = 'none';

      let settingsContainer = document.getElementById('settingsContainer');
      if (!settingsContainer) {
        settingsContainer = document.createElement('div');
        settingsContainer.id = 'settingsContainer';
        settingsContainer.className = 'settings-wrapper';
        settingsContainer.style.cssText = 'padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;';
        dashboard.parentElement.appendChild(settingsContainer);
      }

      settingsContainer.style.display = 'flex';
      settingsContainer.innerHTML = `
        <div class="server-status-page" style="padding: 20px; width: 100%; overflow-y: auto;">
          <h2 style="margin-bottom: 20px; font-size: 18px; font-weight: 600;">🖥️ 서버 상태</h2>
          <div class="server-status-grid" id="serverStatusGrid">
            <div class="server-item" data-service="backend">
              <span class="server-indicator checking"></span>
              <span class="server-name">Backend</span>
              <span class="server-port">:5041</span>
            </div>
            <div class="server-item" data-service="sqlite">
              <span class="server-indicator checking"></span>
              <span class="server-name">SQLite</span>
              <span class="server-port">설정 DB</span>
            </div>
            <div class="server-item" data-service="storage">
              <span class="server-indicator checking"></span>
              <span class="server-name" id="storageTypeName">저장소</span>
              <span class="server-port" id="storageTypeLabel">확인중...</span>
            </div>
            <div class="server-item" data-service="websocket">
              <span class="server-indicator" id="socketIndicator"></span>
              <span class="server-name">WebSocket</span>
              <span class="server-port">실시간</span>
            </div>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #888;">※ 개발자용 페이지입니다.</p>
        </div>
      `;

      // 서버 상태 업데이트
      const dashboardManager = (await import('./utils/dashboard-manager.js')).default;
      await dashboardManager.loadServerStatus();

      // 웹소켓 상태 반영
      if (this.socketClient && this.socketClient.connected) {
        const wsIndicator = document.querySelector('[data-service="websocket"] .server-indicator');
        if (wsIndicator) {
          wsIndicator.className = 'server-indicator online';
        }
      }
    }
  }

  async showAppSettings() {
    // 앱설정 페이지로 이동
    console.log('⚙️ 앱설정 페이지 표시');

    const dashboard = document.querySelector('.dashboard');
    const addPageBtn = document.querySelector('.add-page-btn');

    if (dashboard) {
      dashboard.style.display = 'none';
      if (addPageBtn) addPageBtn.style.display = 'none';

      let settingsContainer = document.getElementById('settingsContainer');
      if (!settingsContainer) {
        settingsContainer = document.createElement('div');
        settingsContainer.id = 'settingsContainer';
        settingsContainer.className = 'settings-wrapper';
        settingsContainer.style.cssText = 'padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;';
        dashboard.parentElement.appendChild(settingsContainer);
      }

      settingsContainer.style.display = 'flex';

      // 설정 매니저로 앱설정 페이지 렌더링
      const { SettingsManager } = await import('./settings/settings-manager.js');
      const settingsManager = new SettingsManager(this.apiClient);
      await settingsManager.render(settingsContainer, 'app');
    }
  }

  async sendMessage() {
    const text = this.elements.messageInput.value.trim();
    const attachments = this.pendingAttachments.slice(); // 복사본

    if (!text && attachments.length === 0) return;

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
    this.clearAttachments(); // 첨부 파일 미리보기 제거

    try {
      let uploadedFiles = [];

      // 첨부 파일이 있으면 먼저 업로드
      if (attachments.length > 0) {
        uploadedFiles = await this.uploadAttachments(attachments);
      }

      // Send message through chat manager (첨부 정보 포함)
      await this.chatManager.sendMessage(text, { attachments: uploadedFiles });
    } finally {
      this._isSending = false;
    }
  }

  /**
   * 첨부 파일 서버 업로드
   */
  async uploadAttachments(files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '업로드 실패');
      }

      console.log('📎 첨부 파일 업로드:', data.files);
      return data.files;
    } catch (err) {
      console.error('❌ 첨부 파일 업로드 실패:', err);
      alert('파일 업로드에 실패했습니다: ' + err.message);
      return [];
    }
  }

  /**
   * Textarea 자동 높이 조절 (Claude 스타일)
   */
  autoResizeTextarea() {
    const textarea = this.elements.messageInput;

    // Reset height to minimum
    textarea.style.height = 'auto';

    // Calculate new height (최소 42px, 최대 200px)
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 42), 200);
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
   * MacOS 스타일 Dock 초기화 - DB에서 아이템 로드
   */
  async initMacosDock(retryCount = 0) {
    const MAX_RETRIES = 5;
    const dock = document.querySelector('.dock');
    if (!dock) {
      console.log('❌ MacOS Dock 요소를 찾을 수 없음');
      return;
    }

    // DB에서 독 아이템 로드
    try {
      const response = await fetch('/api/config/dock');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.dockItems = await response.json();
      this.renderDock();
      console.log('✅ MacOS Dock 초기화 완료');
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => this.initMacosDock(retryCount + 1), (retryCount + 1) * 1000);
      } else {
        console.error('독 설정 로드 실패:', error);
      }
    }
  }

  /**
   * 독 렌더링
   */
  renderDock() {
    const dock = document.querySelector('.dock');
    if (!dock || !this.dockItems) return;

    // order 기준 정렬
    const sorted = [...this.dockItems].sort((a, b) => a.order - b.order);
    
    dock.innerHTML = sorted.map(item => `
      <div class="dock-item ${item.fixed ? 'fixed' : ''}" data-id="${item.id}" data-name="${item.name}" draggable="${!item.fixed && this.dockEditMode}">
        <div class="icon">
          <img src="/assets/${item.icon}" alt="${item.name}" />
        </div>
        ${this.dockEditMode && !item.fixed ? '<div class="dock-item-remove">×</div>' : ''}
      </div>
    `).join('');

    // 이미지 로드 실패 시 자동 재시도 (서버 시작 타이밍 문제 대응)
    dock.querySelectorAll('.dock-item img').forEach(img => {
      img.addEventListener('error', function retry() {
        const attempt = (parseInt(this.dataset.retry) || 0) + 1;
        if (attempt > 5) { this.removeEventListener('error', retry); return; }
        this.dataset.retry = attempt;
        setTimeout(() => { this.src = this.src.split('?')[0] + '?t=' + Date.now(); }, attempt * 1000);
      });
    });

    // 클릭/롱프레스 이벤트 등록
    dock.querySelectorAll('.dock-item').forEach(el => {
      let pressTimer = null;
      
      // 롱프레스 시작
      el.addEventListener('mousedown', (e) => {
        if (this.dockEditMode) return;
        pressTimer = setTimeout(() => {
          this.enterDockEditMode();
        }, 600);
      });
      
      el.addEventListener('mouseup', () => clearTimeout(pressTimer));
      el.addEventListener('mouseleave', () => clearTimeout(pressTimer));
      
      // 터치 지원
      el.addEventListener('touchstart', (e) => {
        if (this.dockEditMode) return;
        pressTimer = setTimeout(() => {
          this.enterDockEditMode();
        }, 600);
      });
      el.addEventListener('touchend', () => clearTimeout(pressTimer));
      
      // 클릭
      el.addEventListener('click', (e) => {
        if (this.dockEditMode) return;
        const id = el.dataset.id;
        const item = this.dockItems.find(d => d.id === id);
        if (item) this.handleDockClick(item);
      });
      
      // 삭제 버튼
      const removeBtn = el.querySelector('.dock-item-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeDockItem(el.dataset.id);
        });
      }
    });

    // 편집 모드일 때 드래그앤드롭
    if (this.dockEditMode) {
      this.setupDockDragDrop(dock);
    }

    // 마이크 아이콘 TTS 상태 반영
    this.updateMicDockStatus();
  }

  // 독 편집 모드 상태
  dockEditMode = false;

  /**
   * 독 편집 모드 진입
   */
  enterDockEditMode() {
    this.dockEditMode = true;
    document.querySelector('.dock')?.classList.add('edit-mode');
    this.renderDock();
    
    // 아이콘 외 영역 클릭하면 편집 모드 종료
    const exitHandler = (e) => {
      if (!e.target.closest('.dock-item')) {
        this.exitDockEditMode();
        document.removeEventListener('click', exitHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', exitHandler), 100);
  }

  /**
   * 독 편집 모드 종료
   */
  exitDockEditMode() {
    this.dockEditMode = false;
    document.querySelector('.dock')?.classList.remove('edit-mode');
    this.renderDock();
    this.saveDockOrder();
  }

  /**
   * 독 드래그앤드롭 설정
   */
  setupDockDragDrop(dock) {
    let draggedEl = null;

    dock.querySelectorAll('.dock-item:not(.fixed)').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        draggedEl = el;
        el.classList.add('dragging');
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        draggedEl = null;
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedEl || draggedEl === el || el.classList.contains('fixed')) return;
        
        const rect = el.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        
        if (e.clientX < midX) {
          el.parentNode.insertBefore(draggedEl, el);
        } else {
          el.parentNode.insertBefore(draggedEl, el.nextSibling);
        }
      });
    });
  }

  /**
   * 독 아이템 삭제
   */
  removeDockItem(id) {
    this.dockItems = this.dockItems.filter(item => item.id !== id);
    this.renderDock();
    this.saveDockOrder();
  }

  /**
   * 독 순서 저장
   */
  async saveDockOrder() {
    const dock = document.querySelector('.dock');
    if (!dock) return;

    const newOrder = [];
    dock.querySelectorAll('.dock-item').forEach((el, idx) => {
      const item = this.dockItems.find(d => d.id === el.dataset.id);
      if (item) {
        item.order = idx;
        newOrder.push(item);
      }
    });

    try {
      await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newOrder })
      });
    } catch (e) {
      console.error('독 순서 저장 실패:', e);
    }
  }

  /**
   * 독 마이크 아이콘에 TTS/실시간 상태 반영
   */
  updateMicDockStatus(realtime) {
    const micItem = document.querySelector('.dock-item[data-id="mic"], .dock-item[data-id="voice-input"]');
    if (!micItem) return;

    const ttsEnabled = this.chatManager?.tts?.enabled;
    // realtime 인자가 없으면 기존 클래스 상태 유지
    const isRealtime = realtime !== undefined ? realtime : micItem.classList.contains('dock-mic-realtime');

    micItem.classList.remove('dock-mic-tts', 'dock-mic-realtime');
    if (isRealtime) {
      micItem.classList.add('dock-mic-realtime');
    } else if (ttsEnabled) {
      micItem.classList.add('dock-mic-tts');
    }
  }

  /**
   * 독 아이템 클릭 핸들러
   */
  handleDockClick(item) {
    if (item.url) {
      // MCP UI가 있으면 캔버스에 열기
      this.openCanvasPanel(item.id, item.url, item.name);
    } else {
      // 특수 기능
      switch (item.id) {
        case 'terminal':
          console.log('터미널 열기 (미구현)');
          break;
        case 'mic':
        case 'voice-input':
          this.openVoiceInputPanel();
          break;
        case 'settings':
          this.openSettingsInCanvas();
          break;
        default:
          console.log('미구현 독 기능:', item.id);
      }
    }
  }

  /**
   * 설정 페이지를 캔버스에 열기
   */
  openSettingsInCanvas() {
    const panel = document.getElementById('canvasPanel');
    const tabsContainer = document.getElementById('canvasTabs');
    const content = document.getElementById('canvasContent');
    
    if (!panel || !tabsContainer || !content) return;

    // 이미 열려있으면 활성화만
    if (this.canvasTabs.find(t => t.type === 'settings')) {
      this.activateCanvasTab('settings');
      panel.classList.remove('hide');
      this.movCanvasPanelForMobile();
      return;
    }

    // 설정 컨테이너 생성
    const settingsContainer = document.createElement('div');
    settingsContainer.id = 'canvas-settings';
    settingsContainer.className = 'canvas-iframe active';
    settingsContainer.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; padding: 0; box-sizing: border-box; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.3) transparent;';
    
    content.appendChild(settingsContainer);
    
    // MCP 설정 렌더링
    this.renderMcpSettingsInCanvas(settingsContainer);

    this.canvasTabs.push({ type: 'settings', title: 'MCP 설정' });
    this.activateCanvasTab('settings');
    panel.classList.remove('hide');
    this.movCanvasPanelForMobile();
  }

  /**
   * 캔버스에 MCP 설정 렌더링
   */
  async renderMcpSettingsInCanvas(container) {
    container.innerHTML = '<div style="color: white; padding: 20px;">로딩 중...</div>';

    try {
      // MCP 서버 및 Tool Search 설정 동시 로드
      const [mcpResponse, toolSearchResponse] = await Promise.all([
        fetch('/api/mcp/servers'),
        fetch('/api/config/tool-search').catch(() => ({ ok: false }))
      ]);

      const data = await mcpResponse.json();
      const servers = data.servers || [];

      // Tool Search 설정 로드 (백엔드 필드명: enabled, type, alwaysLoad)
      let toolSearchConfig = { enabled: false, type: 'auto', alwaysLoad: [] };
      if (toolSearchResponse.ok) {
        const tsData = await toolSearchResponse.json();
        if (tsData) {
          toolSearchConfig = {
            enabled: tsData.enabled || false,
            type: tsData.type || 'auto',
            alwaysLoad: tsData.alwaysLoad || []
          };
        }
      }

      container.innerHTML = `
        <div style="color: white; padding-right: 8px;">
          <h2 style="margin: 0 0 16px 0; font-size: 1.2rem;">MCP 서버 설정</h2>

          <!-- Tool Search 설정 카드 -->
          <div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2)); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              <span style="font-size: 1.2rem;">🔍</span>
              <span style="font-weight: 600; font-size: 1rem;">Tool Search</span>
              <span style="font-size: 0.7rem; background: rgba(139, 92, 246, 0.3); padding: 2px 6px; border-radius: 4px; color: #c4b5fd;">Beta</span>
            </div>
            <p style="font-size: 0.8rem; opacity: 0.8; margin: 0 0 12px 0;">
              Claude가 필요한 도구를 동적으로 검색하고 로드합니다. 많은 MCP 도구가 있을 때 성능을 향상시킵니다.
            </p>

            <div style="display: flex; flex-direction: column; gap: 12px;">
              <!-- 활성화 토글 -->
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.9rem;">Tool Search 사용</span>
                <label style="position: relative; width: 44px; height: 24px; cursor: pointer;">
                  <input type="checkbox" id="toolSearchEnabled" ${toolSearchConfig.enabled ? 'checked' : ''}
                         style="opacity: 0; width: 0; height: 0;">
                  <span style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${toolSearchConfig.enabled ? '#8b5cf6' : '#4b5563'}; border-radius: 24px; transition: 0.3s;"></span>
                  <span style="position: absolute; top: 2px; left: ${toolSearchConfig.enabled ? '22px' : '2px'}; width: 20px; height: 20px; background: white; border-radius: 50%; transition: 0.3s;"></span>
                </label>
              </div>

              <!-- 검색 타입 -->
              <div id="toolSearchOptions" style="display: ${toolSearchConfig.enabled ? 'flex' : 'none'}; flex-direction: column; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div>
                  <label style="font-size: 0.8rem; opacity: 0.7; display: block; margin-bottom: 4px;">검색 방식</label>
                  <select id="toolSearchType" style="width: 100%; padding: 8px; border: 1px solid #4b5563; border-radius: 8px; background: rgba(0,0,0,0.3); color: white;">
                    <option value="regex" ${toolSearchConfig.type === 'regex' || toolSearchConfig.type === 'auto' ? 'selected' : ''}>정규식 (권장)</option>
                    <option value="bm25" ${toolSearchConfig.type === 'bm25' || toolSearchConfig.type === 'semantic' ? 'selected' : ''}>BM25</option>
                  </select>
                </div>

                <!-- 항상 로드할 도구 -->
                <div>
                  <label style="font-size: 0.8rem; opacity: 0.7; display: block; margin-bottom: 4px;">항상 로드할 도구 (쉼표 구분)</label>
                  <input type="text" id="alwaysLoadTools" value="${(toolSearchConfig.alwaysLoad || []).join(', ')}"
                         placeholder="예: read_file, write_file"
                         style="width: 100%; padding: 8px; border: 1px solid #4b5563; border-radius: 8px; background: rgba(0,0,0,0.3); color: white; box-sizing: border-box;">
                </div>

                <button id="saveToolSearchBtn" style="padding: 8px 16px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.85rem; margin-top: 4px;">
                  저장
                </button>
              </div>
            </div>
          </div>

          <!-- MCP 서버 목록 -->
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${servers.map(s => `
              <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    ${s.type !== 'built-in' ? `
                    <!-- 활성화 토글 (외부 MCP만) -->
                    <label style="position: relative; width: 40px; height: 22px; cursor: pointer; flex-shrink: 0;">
                      <input type="checkbox" class="mcp-enable-toggle" data-id="${s.id}" ${s.enabled !== false ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                      <span style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${s.enabled !== false ? '#8b5cf6' : '#4b5563'}; border-radius: 22px; transition: 0.3s;"></span>
                      <span style="position: absolute; top: 2px; left: ${s.enabled !== false ? '20px' : '2px'}; width: 18px; height: 18px; background: white; border-radius: 50%; transition: 0.3s;"></span>
                    </label>
                    ` : ''}
                    <div>
                      <div style="font-weight: 600; opacity: ${s.type === 'built-in' || s.enabled !== false ? '1' : '0.5'};">${s.type === 'built-in' ? 'Soul MCP' : s.name}</div>
                      <div style="font-size: 0.8rem; opacity: 0.7;">${s.description || ''}</div>
                      <span style="display: inline-block; margin-top: 6px; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: ${s.type === 'built-in' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 191, 36, 0.2)'}; color: ${s.type === 'built-in' ? '#4ade80' : '#fbbf24'};">
                        ${s.type === 'built-in' ? '기본 내장' : '외부'}
                      </span>
                    </div>
                  </div>
                  ${s.type !== 'built-in' ? `
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-size: 0.75rem; background: ${s.showInDock ? '#4ade80' : '#666'}; padding: 2px 8px; border-radius: 4px;">
                      ${s.showInDock ? '독 표시' : '숨김'}
                    </span>
                    <button class="canvas-mcp-edit" data-id="${s.id}" style="background: #4285f4; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 0.8rem;">
                      편집
                    </button>
                  </div>
                  ` : ''}
                </div>
                <!-- 도구 목록 토글 -->
                <div class="canvas-mcp-tools-toggle" data-id="${s.id}" style="margin-top: 8px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: rgba(255,255,255,0.5);">
                  <span class="tools-arrow" style="transition: transform 0.2s;">▶</span>
                  <span>도구 목록</span>
                </div>
                <div class="canvas-mcp-tools-list" data-id="${s.id}" style="display: none; margin-top: 8px;"></div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // 활성화 토글 이벤트
      container.querySelectorAll('.mcp-enable-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
          const serverId = toggle.dataset.id;
          const enabled = toggle.checked;
          const card = toggle.closest('div[style*="background: rgba"]');
          const slider = toggle.nextElementSibling;
          const circle = slider?.nextElementSibling;
          const nameDiv = card?.querySelector('div[style*="font-weight: 600"]');

          // UI 즉시 업데이트
          if (slider) slider.style.background = enabled ? '#8b5cf6' : '#4b5563';
          if (circle) circle.style.left = enabled ? '20px' : '2px';
          if (nameDiv) nameDiv.style.opacity = enabled ? '1' : '0.5';

          // API 호출
          try {
            await fetch(`/api/mcp/servers/${serverId}/enable`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled })
            });
          } catch (err) {
            console.error('MCP enable toggle failed:', err);
            // 실패시 롤백
            toggle.checked = !enabled;
          }
        });
      });

      // 편집 버튼 이벤트
      container.querySelectorAll('.canvas-mcp-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const serverId = btn.dataset.id;
          const server = servers.find(s => s.id === serverId);
          if (server) {
            this.showMcpEditModal(server, container);
          }
        });
      });

      // 도구 목록 토글 이벤트
      container.querySelectorAll('.canvas-mcp-tools-toggle').forEach(toggle => {
        toggle.addEventListener('click', async () => {
          const serverId = toggle.dataset.id;
          const listEl = container.querySelector(`.canvas-mcp-tools-list[data-id="${serverId}"]`);
          const arrow = toggle.querySelector('.tools-arrow');
          if (!listEl) return;

          const isOpen = listEl.style.display !== 'none';
          if (isOpen) {
            listEl.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
            return;
          }

          // 열기
          listEl.style.display = 'block';
          if (arrow) arrow.style.transform = 'rotate(90deg)';

          // 이미 로드됨?
          if (listEl.dataset.loaded) return;

          listEl.innerHTML = '<div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); padding: 4px 0;">불러오는 중...</div>';
          try {
            const res = await fetch(`/api/mcp/servers/${serverId}/tools`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const tools = data.tools || [];

            if (tools.length === 0) {
              listEl.innerHTML = '<div style="font-size: 0.75rem; color: rgba(255,255,255,0.35); padding: 4px 0;">도구 없음</div>';
            } else {
              // 도구 설명 한글 매핑
              const koDesc = {
                show_api_key: 'API 키 확인 (디버그용)',
                primer: '현재 세션 정보 (시간, 위치, 네트워크)',
                guess_datetime_url: '웹페이지 게시/수정 날짜 추정',
                capture_screenshot_url: '웹페이지 스크린샷 캡처',
                read_url: '웹페이지를 마크다운으로 추출',
                search_web: '웹 검색',
                expand_query: '검색어 확장 및 재작성',
                search_arxiv: 'arXiv 논문 검색',
                search_ssrn: 'SSRN 사회과학 논문 검색',
                search_jina_blog: 'Jina AI 블로그/뉴스 검색',
                search_images: '이미지 검색',
                parallel_search_web: '병렬 웹 검색',
                parallel_search_arxiv: '병렬 arXiv 논문 검색',
                parallel_search_ssrn: '병렬 SSRN 논문 검색',
                parallel_read_url: '여러 웹페이지 동시 읽기',
                sort_by_relevance: '문서 관련성 재정렬 (리랭커)',
                deduplicate_strings: '텍스트 중복 제거',
                deduplicate_images: '이미지 중복 제거',
                search_bibtex: '학술 논문 BibTeX 인용 검색',
                extract_pdf: 'PDF에서 그림/표/수식 추출',
                // 내장 도구
                recall_memory: '과거 대화/기억 검색',
                get_profile: '사용자 프로필 조회',
                update_profile: '사용자 정보 저장',
                list_my_rules: '규칙/메모 조회',
                add_my_rule: '규칙 저장',
                delete_my_rule: '규칙 삭제',
                send_message: '즉시 메시지 전송',
                schedule_message: '예약 메시지',
                cancel_scheduled_message: '예약 취소',
                list_scheduled_messages: '예약 목록',
              };
              // 토글 텍스트에 개수 표시
              toggle.querySelector('span:last-child').textContent = `도구 ${tools.length}개`;
              listEl.innerHTML = tools.map(t => {
                const desc = koDesc[t.name] || t.description || '';
                return `
                <div style="padding: 5px 8px; margin-bottom: 3px; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);">
                  <div style="font-size: 0.78rem; font-weight: 500; color: rgba(255,255,255,0.85); font-family: 'SF Mono', 'Fira Code', monospace;">${t.name}</div>
                  ${desc ? `<div style="font-size: 0.7rem; color: rgba(255,255,255,0.45); margin-top: 2px; line-height: 1.4;">${desc}</div>` : ''}
                </div>`;
              }).join('');
            }
            listEl.dataset.loaded = 'true';
          } catch (e) {
            listEl.innerHTML = `<div style="font-size: 0.75rem; color: rgba(255,100,100,0.6); padding: 4px 0;">로드 실패: ${e.message}</div>`;
          }
        });
      });

      // Tool Search 이벤트 핸들러
      const toolSearchToggle = container.querySelector('#toolSearchEnabled');
      const toolSearchOptions = container.querySelector('#toolSearchOptions');
      const saveToolSearchBtn = container.querySelector('#saveToolSearchBtn');

      if (toolSearchToggle) {
        toolSearchToggle.addEventListener('change', () => {
          const isEnabled = toolSearchToggle.checked;
          if (toolSearchOptions) {
            toolSearchOptions.style.display = isEnabled ? 'flex' : 'none';
          }
          // 토글 스타일 업데이트
          const slider = toolSearchToggle.nextElementSibling;
          const circle = slider?.nextElementSibling;
          if (slider) slider.style.background = isEnabled ? '#8b5cf6' : '#4b5563';
          if (circle) circle.style.left = isEnabled ? '22px' : '2px';
        });
      }

      if (saveToolSearchBtn) {
        saveToolSearchBtn.addEventListener('click', async () => {
          const enabled = container.querySelector('#toolSearchEnabled')?.checked || false;
          const type = container.querySelector('#toolSearchType')?.value || 'auto';
          const alwaysLoadInput = container.querySelector('#alwaysLoadTools')?.value || '';
          const alwaysLoad = alwaysLoadInput.split(',').map(s => s.trim()).filter(s => s);

          try {
            const response = await fetch('/api/config/tool-search', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled, type, alwaysLoad })
            });

            if (response.ok) {
              saveToolSearchBtn.textContent = '저장됨 ✓';
              saveToolSearchBtn.style.background = '#22c55e';
              setTimeout(() => {
                saveToolSearchBtn.textContent = '저장';
                saveToolSearchBtn.style.background = '#8b5cf6';
              }, 2000);
            } else {
              throw new Error('저장 실패');
            }
          } catch (err) {
            console.error('Tool Search 설정 저장 실패:', err);
            saveToolSearchBtn.textContent = '오류!';
            saveToolSearchBtn.style.background = '#ef4444';
            setTimeout(() => {
              saveToolSearchBtn.textContent = '저장';
              saveToolSearchBtn.style.background = '#8b5cf6';
            }, 2000);
          }
        });
      }
    } catch (e) {
      container.innerHTML = `<div style="color: #ff6b6b; padding: 20px;">설정을 불러오는데 실패했습니다.</div>`;
    }
  }

  /**
   * MCP 편집 모달 (캔버스용)
   */
  showMcpEditModal(server, container) {
    const icons = [
      'checklist-icon.webp', 'smarthome-icon.webp', 'cat-icon.webp',
      'terminal-icon.webp', 'mic-icon.webp', 'setup-icom.webp',
      'mcp-icon.webp', 'folder-icon.webp', 'user-icon.webp'
    ];

    const modal = document.createElement('div');
    modal.className = 'mcp-edit-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
      <div style="background: #2a2a3e; border-radius: 16px; padding: 20px; width: 90%; max-width: 400px; max-height: 80vh; overflow-y: auto; color: white;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 1.1rem;">MCP 서버 편집</h3>
          <button class="modal-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: white;">×</button>
        </div>
        <form id="mcpEditForm" style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: 0.85rem; opacity: 0.7;">이름</label>
            <input type="text" name="name" value="${server.name}" style="width: 100%; padding: 8px; border: 1px solid #444; border-radius: 8px; background: #1a1a2e; color: white; box-sizing: border-box;">
          </div>
          <div>
            <label style="font-size: 0.85rem; opacity: 0.7;">설명</label>
            <input type="text" name="description" value="${server.description || ''}" placeholder="서버 설명" style="width: 100%; padding: 8px; border: 1px solid #444; border-radius: 8px; background: #1a1a2e; color: white; box-sizing: border-box;">
          </div>
          <div>
            <label style="font-size: 0.85rem; opacity: 0.7;">UI 페이지 URL</label>
            <input type="text" name="uiUrl" value="${server.uiUrl || ''}" placeholder="https://..." style="width: 100%; padding: 8px; border: 1px solid #444; border-radius: 8px; background: #1a1a2e; color: white; box-sizing: border-box;">
          </div>
          <div>
            <label style="font-size: 0.85rem; opacity: 0.7;">아이콘</label>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
              ${icons.map(icon => `
                <div class="icon-option" data-icon="${icon}" style="width: 40px; height: 40px; border: 2px solid ${server.icon === icon ? '#4285f4' : '#444'}; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: ${server.icon === icon ? 'rgba(66,133,244,0.2)' : '#1a1a2e'};">
                  <img src="/assets/${icon}" style="width: 28px; height: 28px;">
                </div>
              `).join('')}
            </div>
            <input type="hidden" name="icon" value="${server.icon || ''}">
          </div>
          <div>
            <label style="font-size: 0.85rem; opacity: 0.7;">API Key <span style="font-size: 0.75rem; opacity: 0.5;">(선택)</span></label>
            <input type="password" name="apiKey" value="" placeholder="${server.hasApiKey ? '••••••••(설정됨)' : '없음'}" style="width: 100%; padding: 8px; border: 1px solid #444; border-radius: 8px; background: #1a1a2e; color: white; box-sizing: border-box;">
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" name="showInDock" id="showInDock" ${server.showInDock ? 'checked' : ''}>
            <label for="showInDock">독(Dock)에 표시</label>
          </div>
          <button type="submit" style="padding: 10px; background: #4285f4; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.95rem;">저장</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // 아이콘 선택
    modal.querySelectorAll('.icon-option').forEach(opt => {
      opt.addEventListener('click', () => {
        modal.querySelectorAll('.icon-option').forEach(o => {
          o.style.border = '2px solid #444';
          o.style.background = '#1a1a2e';
        });
        opt.style.border = '2px solid #4285f4';
        opt.style.background = 'rgba(66,133,244,0.2)';
        modal.querySelector('input[name="icon"]').value = opt.dataset.icon;
      });
    });

    // 닫기
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });

    // 저장
    modal.querySelector('#mcpEditForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const updates = {
        name: formData.get('name'),
        description: formData.get('description'),
        uiUrl: formData.get('uiUrl'),
        icon: formData.get('icon'),
        showInDock: formData.get('showInDock') === 'on'
      };
      const apiKeyVal = formData.get('apiKey')?.trim();
      if (apiKeyVal) updates.apiKey = apiKeyVal;

      if (updates.showInDock && !updates.uiUrl) {
        alert('독에 표시하려면 UI 페이지 URL을 입력해주세요.');
        return;
      }

      try {
        await fetch(`/api/mcp/servers/${server.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        modal.remove();
        // 목록 새로고침
        this.renderMcpSettingsInCanvas(container);
        // 독 업데이트
        await this.updateDockFromMcp();
      } catch (err) {
        alert('저장 실패: ' + err.message);
      }
    });
  }

  /**
   * 독 새로고침
   */
  async refreshDock() {
    try {
      const response = await fetch('/api/config/dock');
      if (response.ok) {
        this.dockItems = await response.json();
        this.renderDock();
      }
    } catch (e) {
      console.error('독 새로고침 실패:', e);
    }
  }

  /**
   * MCP 설정 기반 독 업데이트
   */
  async updateDockFromMcp() {
    try {
      // MCP 서버 목록 가져오기
      const mcpRes = await fetch('/api/mcp/servers');
      const mcpData = await mcpRes.json();
      const mcpServers = mcpData.servers || [];

      // showInDock && uiUrl 있는 서버만 독에 추가
      const mcpDockItems = mcpServers
        .filter(s => s.showInDock && s.uiUrl)
        .map((s, i) => ({
          id: s.id,
          name: s.name,
          icon: s.icon || 'mcp-icon.webp',
          url: s.uiUrl,
          order: i
        }));

      // 설정은 항상 마지막에 고정
      const settingsItem = {
        id: 'settings',
        name: '설정',
        icon: 'setup-icom.webp',
        url: null,
        order: 999,
        fixed: true
      };

      const newDockItems = [...mcpDockItems, settingsItem];

      // DB에 저장
      await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newDockItems })
      });

      // 로컬 상태 업데이트 및 렌더링
      this.dockItems = newDockItems;
      this.renderDock();
    } catch (e) {
      console.error('독 업데이트 실패:', e);
    }
  }

  // 캔버스 탭 상태
  canvasTabs = [];
  activeCanvasTab = null;

  /**
   * 캔버스 패널에 MCP UI 열기 (탭 시스템)
   */
  openCanvasPanel(type, url, name) {
    const panel = document.getElementById('canvasPanel');
    const tabsContainer = document.getElementById('canvasTabs');
    const content = document.getElementById('canvasContent');

    if (!panel || !tabsContainer || !content) {
      console.log('❌ 캔버스 패널 없음');
      return;
    }

    // 이름 우선, 없으면 기본 매핑, 없으면 type
    const title = name || type;

    // 이미 열린 탭인지 확인
    const existingTab = this.canvasTabs.find(t => t.type === type);
    if (existingTab) {
      this.activateCanvasTab(type);
      panel.classList.remove('hide');
      this.movCanvasPanelForMobile();
      return;
    }

    // 새 탭 추가
    this.canvasTabs.push({ type, title, url });

    // 컨테이너 생성 (도구 목록 + iframe)
    const container = document.createElement('div');
    container.className = 'canvas-iframe canvas-mcp-container';
    container.id = `canvas-iframe-${type}`;

    // 도구 목록 영역
    const toolsSection = document.createElement('div');
    toolsSection.className = 'canvas-tools-section';
    toolsSection.innerHTML = '<div class="canvas-tools-loading">도구 불러오는 중...</div>';
    container.appendChild(toolsSection);

    // iframe (MCP UI)
    const iframe = document.createElement('iframe');
    iframe.className = 'canvas-mcp-iframe';
    iframe.src = url;
    container.appendChild(iframe);

    content.appendChild(container);

    // 도구 목록 비동기 로드
    this.loadCanvasTools(type, toolsSection);

    // 탭 활성화
    this.activateCanvasTab(type);
    this.renderCanvasTabs();

    // 패널 열기
    panel.classList.remove('hide');
    this.movCanvasPanelForMobile();
    console.log('✅ 캔버스 탭 열림:', type);
  }

  /**
   * 캔버스 패널에 MCP 도구 목록 로드
   */
  async loadCanvasTools(serverId, container) {
    try {
      console.log('🔧 도구 로드 시도:', serverId);
      const res = await fetch(`/api/mcp/servers/${serverId}/tools`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      const tools = data.tools || [];
      console.log('🔧 도구 로드 결과:', tools.length, '개');

      if (tools.length === 0) {
        container.innerHTML = '<div class="canvas-tools-empty">등록된 도구가 없습니다</div>';
        return;
      }

      container.innerHTML = `
        <div class="canvas-tools-header">
          <span class="canvas-tools-title">도구 ${tools.length}개</span>
        </div>
        <div class="canvas-tools-list">
          ${tools.map(t => `
            <div class="canvas-tool-item">
              <div class="canvas-tool-name">${t.name}</div>
              ${t.description ? `<div class="canvas-tool-desc">${t.description}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      console.warn('도구 목록 로드 실패:', e.message);
      container.innerHTML = '<div class="canvas-tools-empty">도구 목록을 불러올 수 없습니다</div>';
    }
  }

  /**
   * 탭 활성화
   */
  activateCanvasTab(type) {
    this.activeCanvasTab = type;

    // 모든 iframe 숨기고 선택된 것만 표시
    document.querySelectorAll('.canvas-iframe').forEach(iframe => {
      iframe.classList.remove('active');
    });
    // 특수 타입은 별도 ID
    let activeIframe;
    if (type === 'settings') {
      activeIframe = document.getElementById('canvas-settings');
    } else if (type === 'voice-input') {
      activeIframe = document.getElementById('canvas-voice-input');
    } else {
      activeIframe = document.getElementById(`canvas-iframe-${type}`);
    }
    if (activeIframe) activeIframe.classList.add('active');

    this.renderCanvasTabs();
  }

  /**
   * 탭 닫기
   */
  closeCanvasTab(type) {
    const idx = this.canvasTabs.findIndex(t => t.type === type);
    if (idx === -1) return;

    // iframe 제거 (특수 타입은 별도 ID)
    let iframe;
    if (type === 'settings') {
      iframe = document.getElementById('canvas-settings');
    } else if (type === 'voice-input') {
      iframe = document.getElementById('canvas-voice-input');
    } else {
      iframe = document.getElementById(`canvas-iframe-${type}`);
    }
    if (iframe) iframe.remove();

    // 탭 배열에서 제거
    this.canvasTabs.splice(idx, 1);

    // 탭이 없으면 패널 닫기
    if (this.canvasTabs.length === 0) {
      this.restoreCanvasPanelFromMobile();
      document.getElementById('canvasPanel')?.classList.add('hide');
      this.activeCanvasTab = null;
    } else if (this.activeCanvasTab === type) {
      // 닫은 탭이 활성탭이었으면 다른 탭 활성화
      const newActive = this.canvasTabs[Math.max(0, idx - 1)];
      this.activateCanvasTab(newActive.type);
    }
    
    this.renderCanvasTabs();
  }

  /**
   * 탭 바 렌더링
   */
  renderCanvasTabs() {
    const tabsContainer = document.getElementById('canvasTabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = this.canvasTabs.map(tab => `
      <div class="canvas-tab ${tab.type === this.activeCanvasTab ? 'active' : ''}" 
           onclick="soulApp.activateCanvasTab('${tab.type}')">
        <span>${tab.title}</span>
        <span class="canvas-tab-close" onclick="event.stopPropagation(); soulApp.closeCanvasTab('${tab.type}')">×</span>
      </div>
    `).join('');
  }

  // ============================================
  // Voice Input (음성 입력)
  // ============================================

  /**
   * 음성 입력 패널 열기
   */
  openVoiceInputPanel() {
    const panel = document.getElementById('canvasPanel');
    const content = document.getElementById('canvasContent');

    if (!panel || !content) return;

    // 이미 열려있으면 활성화만
    if (this.canvasTabs.find(t => t.type === 'voice-input')) {
      this.activateCanvasTab('voice-input');
      panel.classList.remove('hide');
      this.movCanvasPanelForMobile();
      return;
    }

    // 음성 입력 컨테이너 생성
    const voiceContainer = document.createElement('div');
    voiceContainer.id = 'canvas-voice-input';
    voiceContainer.className = 'canvas-iframe';
    voiceContainer.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; padding: 20px; box-sizing: border-box;';

    content.appendChild(voiceContainer);

    // 음성 입력 UI 렌더링
    this.renderVoiceInputPanel(voiceContainer);

    this.canvasTabs.push({ type: 'voice-input', title: '음성 대화' });
    this.activateCanvasTab('voice-input');
    panel.classList.remove('hide');
    this.movCanvasPanelForMobile();
  }

  /**
   * 음성 입력 패널 렌더링
   */
  renderVoiceInputPanel(container) {
    const voiceInput = getVoiceInput();
    const isSupported = voiceInput.isSupported();

    container.innerHTML = `
      <div class="voice-input-panel">

        ${!isSupported ? `
          <div class="voice-not-supported">
            <p>이 브라우저는 음성 인식을 지원하지 않습니다.</p>
            <p>Chrome, Edge, Safari를 사용해주세요.</p>
          </div>
        ` : `
          <!-- Soul 캡슐 + 오브 -->
          <div class="soul-capsule" id="soulCapsule">
            <div class="soul-orb" id="voiceRecordBtn">
              <div class="glow"></div>
              <div class="particles">
                <div class="rotate">
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                </div>
              </div>
            </div>
            <div class="capsule-soul">
              <div class="capsule-dust dust-1"></div>
              <div class="capsule-dust dust-2"></div>
              <div class="capsule-dust dust-3"></div>
              <div class="capsule-dust dust-4"></div>
              <div class="capsule-dust dust-5"></div>
              <div class="capsule-dust dust-6"></div>
              <div class="capsule-dust dust-7"></div>
              <div class="capsule-dust dust-8"></div>
              <div class="capsule-dust dust-9"></div>
              <div class="capsule-dust dust-10"></div>
              <div class="capsule-dust dust-11"></div>
              <div class="capsule-dust dust-12"></div>
            </div>
            <img class="capsule-glass" src="/assets/glasscapsule.png" alt="" />
          </div>

          <!-- 실시간 텍스트 -->
          <div class="voice-transcript" id="voiceTranscript"></div>

          <!-- 액션 버튼 -->
          <div class="voice-actions" id="voiceActions" style="display: none;">
            <button class="voice-action-btn voice-cancel-btn" id="voiceCancelBtn">취소</button>
            <button class="voice-action-btn voice-send-btn" id="voiceSendBtn">전송</button>
          </div>

          <!-- 설정 -->
          <div class="voice-settings">
            <h4 class="voice-settings-title">설정</h4>
            <div class="voice-setting-item voice-realtime-toggle">
              <label>실시간 대화</label>
              <input type="checkbox" id="voiceRealtimeMode">
              <span class="voice-realtime-hint">말 끝나면 자동 전송 + TTS 응답</span>
            </div>
            <div class="voice-setting-item">
              <label>언어</label>
              <select id="voiceLanguage" class="voice-select">
                <option value="ko-KR" selected>한국어</option>
                <option value="en-US">English (US)</option>
                <option value="ja-JP">日本語</option>
                <option value="zh-CN">中文</option>
              </select>
            </div>
            <div class="voice-setting-item">
              <label>연속 인식</label>
              <input type="checkbox" id="voiceContinuous" checked>
            </div>
            <div class="voice-setting-item voice-tts-toggle">
              <label>음성 응답 (TTS)</label>
              <input type="checkbox" id="voiceTTSEnabled">
              <span class="voice-tts-status" id="voiceTTSStatus"></span>
            </div>
          </div>
        `}
      </div>
    `;

    if (isSupported) {
      this.initVoiceInputEvents(container);
    }
  }

  /**
   * 음성 입력 이벤트 초기화
   */
  initVoiceInputEvents(container) {
    const voiceInput = getVoiceInput();
    const recordBtn = container.querySelector('#voiceRecordBtn');
    const hint = container.querySelector('#voiceRecordHint');
    const transcript = container.querySelector('#voiceTranscript');
    const actions = container.querySelector('#voiceActions');
    const cancelBtn = container.querySelector('#voiceCancelBtn');
    const sendBtn = container.querySelector('#voiceSendBtn');
    const languageSelect = container.querySelector('#voiceLanguage');
    const continuousCheck = container.querySelector('#voiceContinuous');
    const realtimeCheck = container.querySelector('#voiceRealtimeMode');

    let currentText = '';
    let realtimeMode = false;
    let pendingSend = null; // 실시간 모드에서 자동 전송 타이머

    // 상태 변경 콜백
    voiceInput.setOnStateChange((state, error) => {
      if (state === 'listening') {
        recordBtn.classList.add('recording');
        hint.textContent = realtimeMode ? '말하세요...' : '듣고 있어요...';
      } else {
        recordBtn.classList.remove('recording');
        hint.textContent = '';

        if (error) {
          hint.textContent = `오류: ${error}`;
        }
      }
    });

    // 결과 콜백
    voiceInput.setOnResult((text, isFinal) => {
      if (isFinal) {
        currentText += (currentText ? ' ' : '') + text;
        transcript.innerHTML = `<span class="voice-final">${currentText}</span>`;

        // 실시간 모드: 말 끝나면 잠시 후 자동 전송
        if (realtimeMode) {
          if (pendingSend) clearTimeout(pendingSend);
          pendingSend = setTimeout(() => {
            this.sendRealtimeVoice(currentText.trim(), transcript);
            currentText = '';
          }, 1000); // 1초 후 전송
        } else {
          actions.style.display = 'flex';
        }
      } else {
        // 중간 결과 - 자동 전송 타이머 리셋
        if (pendingSend) {
          clearTimeout(pendingSend);
          pendingSend = null;
        }
        transcript.innerHTML = `
          ${currentText ? `<span class="voice-final">${currentText}</span> ` : ''}
          <span class="voice-interim">${text}</span>
        `;
      }
    });

    // 녹음 버튼 클릭
    recordBtn.addEventListener('click', () => {
      voiceInput.toggle();
    });

    // 취소 버튼
    cancelBtn.addEventListener('click', () => {
      voiceInput.stop();
      if (pendingSend) clearTimeout(pendingSend);
      currentText = '';
      transcript.innerHTML = '';
      actions.style.display = 'none';
    });

    // 전송 버튼
    sendBtn.addEventListener('click', () => {
      voiceInput.stop();
      if (currentText.trim()) {
        // 채팅 입력창에 텍스트 삽입
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
          messageInput.value = currentText.trim();
          messageInput.dispatchEvent(new Event('input'));
          messageInput.focus();
        }
        // 패널 닫기
        this.closeCanvasTab('voice-input');
      }
      currentText = '';
      transcript.innerHTML = '';
      actions.style.display = 'none';
    });

    // 언어 변경
    languageSelect.addEventListener('change', (e) => {
      voiceInput.recognition.lang = e.target.value;
    });

    // 연속 인식 토글
    continuousCheck.addEventListener('change', (e) => {
      voiceInput.recognition.continuous = e.target.checked;
    });

    // 실시간 대화 모드 토글
    realtimeCheck.addEventListener('change', (e) => {
      realtimeMode = e.target.checked;
      actions.style.display = 'none';
      if (realtimeMode) {
        continuousCheck.checked = true;
        voiceInput.recognition.continuous = true;
        if (!voiceInput.isListening) {
          voiceInput.start();
        }
      } else {
        if (voiceInput.isListening) {
          voiceInput.stop();
        }
      }
      this.updateMicDockStatus(realtimeMode);
    });

    // TTS 토글
    const ttsCheck = container.querySelector('#voiceTTSEnabled');
    const ttsStatus = container.querySelector('#voiceTTSStatus');
    if (ttsCheck && this.chatManager?.tts) {
      const tts = this.chatManager.tts;
      ttsCheck.checked = tts.enabled;
      // 서버 상태 표시
      ttsStatus.textContent = tts.available ? '서버 연결됨' : '서버 없음';
      ttsStatus.style.color = tts.available ? 'var(--accent-color, #4CAF50)' : 'var(--text-secondary, #888)';

      ttsCheck.addEventListener('change', async (e) => {
        tts.enabled = e.target.checked;
        localStorage.setItem('tts-enabled', tts.enabled);
        if (tts.enabled) {
          const ok = await tts._checkServer();
          ttsStatus.textContent = ok ? '서버 연결됨' : '서버 연결 실패';
          ttsStatus.style.color = ok ? 'var(--accent-color, #4CAF50)' : '#e74c3c';
          if (!ok) {
            tts.enabled = false;
            ttsCheck.checked = false;
            localStorage.setItem('tts-enabled', 'false');
          }
        } else {
          tts.stop();
          ttsStatus.textContent = '';
        }
        this.updateMicDockStatus();
      });
    }
  }

  /**
   * 실시간 음성 전송 + TTS 응답
   */
  async sendRealtimeVoice(text, transcriptEl) {
    if (!text) return;

    const voiceInput = getVoiceInput();
    voiceInput.stop(); // 전송 중엔 잠시 멈춤

    transcriptEl.innerHTML = `<span class="voice-sending">전송 중: ${text}</span>`;

    try {
      // 채팅 전송 (chatManager 사용)
      if (this.chatManager) {
        await this.chatManager.sendMessage(text, { enableTTS: true });
      }

      transcriptEl.innerHTML = '<span class="voice-placeholder">응답 완료 - 다시 말하세요</span>';

      // TTS 끝나면 다시 STT 시작 (약간의 딜레이)
      setTimeout(() => {
        voiceInput.start();
      }, 500);
    } catch (err) {
      console.error('[RealtimeVoice] Error:', err);
      transcriptEl.innerHTML = '<span class="voice-error">전송 실패 - 다시 시도하세요</span>';
    }
  }

  // ============================================
  // File Attachment (파일 첨부)
  // ============================================

  pendingAttachments = []; // 첨부 대기 파일들

  /**
   * 첨부 버튼 이벤트 핸들러 초기화
   */
  initAttachmentHandler() {
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    const preview = document.getElementById('attachmentPreview');

    if (!attachBtn || !fileInput || !preview) {
      console.log('❌ 첨부 관련 요소 없음');
      return;
    }

    // 첨부 버튼 클릭 → 파일 선택 다이얼로그
    attachBtn.addEventListener('click', (e) => {
      e.preventDefault();
      fileInput.click();
    });

    // 파일 선택 시
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        this.addAttachments(files);
      }
      fileInput.value = ''; // 같은 파일 다시 선택 가능하게
    });

    // 드래그 앤 드롭
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
      chatForm.addEventListener('dragover', (e) => {
        e.preventDefault();
        chatForm.classList.add('drag-over');
      });

      chatForm.addEventListener('dragleave', (e) => {
        e.preventDefault();
        chatForm.classList.remove('drag-over');
      });

      chatForm.addEventListener('drop', (e) => {
        e.preventDefault();
        chatForm.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          this.addAttachments(files);
        }
      });
    }

    console.log('✅ 첨부 핸들러 초기화 완료');
  }

  /**
   * 첨부 파일 추가
   */
  addAttachments(files) {
    const preview = document.getElementById('attachmentPreview');
    if (!preview) return;

    for (const file of files) {
      // 크기 제한 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`파일이 너무 큽니다: ${file.name} (최대 10MB)`);
        continue;
      }

      // 중복 체크
      if (this.pendingAttachments.find(f => f.name === file.name && f.size === file.size)) {
        continue;
      }

      this.pendingAttachments.push(file);
    }

    this.renderAttachmentPreview();
  }

  /**
   * 첨부 파일 미리보기 렌더링
   */
  renderAttachmentPreview() {
    const preview = document.getElementById('attachmentPreview');
    if (!preview) return;

    if (this.pendingAttachments.length === 0) {
      preview.style.display = 'none';
      preview.innerHTML = '';
      this.updateInputAreaHeight();
      return;
    }

    preview.style.display = 'flex';
    preview.innerHTML = this.pendingAttachments.map((file, idx) => {
      const isImage = file.type.startsWith('image/');
      const sizeKB = (file.size / 1024).toFixed(1);

      if (isImage) {
        const url = URL.createObjectURL(file);
        return `
          <div class="attachment-item" data-idx="${idx}" onclick="soulApp.openAttachmentLightbox(${idx})">
            <img src="${url}" alt="${file.name}" class="attachment-thumb">
            <button class="attachment-remove" onclick="event.stopPropagation(); soulApp.removeAttachment(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>
        `;
      } else {
        const ext = file.name.split('.').pop().toUpperCase();
        return `
          <div class="attachment-item file" data-idx="${idx}" onclick="soulApp.openAttachmentLightbox(${idx})">
            <div class="attachment-file-icon">
              <span>${ext}</span>
              <span class="attachment-file-name">${file.name}</span>
            </div>
            <button class="attachment-remove" onclick="event.stopPropagation(); soulApp.removeAttachment(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>
        `;
      }
    }).join('');

    // 입력창 높이 변경 후 스크롤 버튼 위치 업데이트
    requestAnimationFrame(() => this.updateInputAreaHeight());
  }

  /**
   * 입력창 높이에 따라 스크롤 버튼 위치 업데이트
   */
  updateInputAreaHeight() {
    const inputArea = document.querySelector('.right-card-bottom');
    const dock = document.querySelector('.dock-test-area');
    const canvas = document.querySelector('.canvas-panel');
    const scrollBtn = document.querySelector('.scroll-to-bottom');
    if (inputArea && scrollBtn) {
      let bottomOffset = inputArea.offsetHeight + 24;
      // dock이 표시 중이면 높이 추가
      if (dock && dock.style.display !== 'none') {
        bottomOffset += dock.offsetHeight;
      }
      // 모바일에서 캔버스가 아래에 표시될 때 높이 추가
      if (canvas && !canvas.classList.contains('hide') && window.innerWidth < 900) {
        bottomOffset += canvas.offsetHeight + 12;
      }
      scrollBtn.style.bottom = `${bottomOffset}px`;
    }
  }

  /**
   * 라이트박스 열기
   */
  openAttachmentLightbox(idx) {
    if (this.pendingAttachments.length === 0) return;

    this.lightboxIndex = idx;
    let lightbox = document.querySelector('.attachment-lightbox');

    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'attachment-lightbox';
      lightbox.innerHTML = `
        <div class="attachment-lightbox-content">
          <button class="attachment-lightbox-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          <button class="attachment-lightbox-nav prev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
          <div class="attachment-lightbox-media"></div>
          <button class="attachment-lightbox-nav next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
          <div class="attachment-lightbox-counter"></div>
        </div>
      `;
      document.body.appendChild(lightbox);

      // 이벤트 바인딩
      lightbox.querySelector('.attachment-lightbox-close').onclick = () => this.closeLightbox();
      lightbox.querySelector('.attachment-lightbox-nav.prev').onclick = () => this.lightboxNav(-1);
      lightbox.querySelector('.attachment-lightbox-nav.next').onclick = () => this.lightboxNav(1);
      lightbox.onclick = (e) => { if (e.target === lightbox) this.closeLightbox(); };

      // 키보드 네비게이션
      this._lightboxKeyHandler = (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') this.closeLightbox();
        if (e.key === 'ArrowLeft') this.lightboxNav(-1);
        if (e.key === 'ArrowRight') this.lightboxNav(1);
      };
      document.addEventListener('keydown', this._lightboxKeyHandler);
    }

    this.updateLightboxContent();
    lightbox.classList.add('active');
  }

  /**
   * 라이트박스 콘텐츠 업데이트
   */
  updateLightboxContent() {
    const lightbox = document.querySelector('.attachment-lightbox');
    if (!lightbox) return;

    const file = this.pendingAttachments[this.lightboxIndex];
    if (!file) return;

    const mediaContainer = lightbox.querySelector('.attachment-lightbox-media');
    const counter = lightbox.querySelector('.attachment-lightbox-counter');
    const isImage = file.type.startsWith('image/');
    const sizeKB = (file.size / 1024).toFixed(1);

    if (isImage) {
      const url = URL.createObjectURL(file);
      mediaContainer.innerHTML = `<img src="${url}" alt="${file.name}">`;
    } else {
      const ext = file.name.split('.').pop().toUpperCase();
      mediaContainer.innerHTML = `
        <div class="attachment-lightbox-file">
          <div class="attachment-lightbox-file-icon">${ext}</div>
          <div class="attachment-lightbox-file-name">${file.name}</div>
          <div class="attachment-lightbox-file-size">${sizeKB} KB</div>
        </div>
      `;
    }

    // 카운터 및 네비게이션 표시
    const total = this.pendingAttachments.length;
    counter.textContent = total > 1 ? `${this.lightboxIndex + 1} / ${total}` : '';

    const prevBtn = lightbox.querySelector('.attachment-lightbox-nav.prev');
    const nextBtn = lightbox.querySelector('.attachment-lightbox-nav.next');
    prevBtn.style.display = total > 1 ? '' : 'none';
    nextBtn.style.display = total > 1 ? '' : 'none';
  }

  /**
   * 라이트박스 네비게이션
   */
  lightboxNav(dir) {
    const total = this.pendingAttachments.length;
    if (total <= 1) return;

    this.lightboxIndex = (this.lightboxIndex + dir + total) % total;
    this.updateLightboxContent();
  }

  /**
   * 라이트박스 닫기
   */
  closeLightbox() {
    const lightbox = document.querySelector('.attachment-lightbox');
    if (lightbox) lightbox.classList.remove('active');
  }

  /**
   * 첨부 파일 제거
   */
  removeAttachment(idx) {
    this.pendingAttachments.splice(idx, 1);
    this.renderAttachmentPreview();
  }

  /**
   * 첨부 파일 모두 제거
   */
  clearAttachments() {
    this.pendingAttachments = [];
    this.renderAttachmentPreview();
  }

  /**
   * 현재 첨부 파일 가져오기
   */
  getAttachments() {
    return this.pendingAttachments;
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
