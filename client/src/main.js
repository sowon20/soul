/**
 * Soul UI - Main JavaScript Entry Point
 * Vanilla JS Implementation
 */

import { ThemeManager } from './utils/theme-manager.js';
import { ChatManager } from './components/chat/chat-manager.js?v=19';
import { PanelManager } from './components/shared/panel-manager.js';
import { MenuManager } from './components/sidebar/menu-manager.js';
import { APIClient } from './utils/api-client.js';
// role-manager.js 제거됨 — 알바 관리는 ai-settings.js에 통합
import dashboardManager from './utils/dashboard-manager.js';
import { SearchManager } from './utils/search-manager.js';
import { SoulSocketClient } from './utils/socket-client.js';
import { getVoiceInput } from './utils/voice-input.js';
import { SectionPanelRenderer } from './components/panels/section-panels.js';

class SoulApp {
  constructor() {
    this.themeManager = null;
    this.chatManager = null;
    this.panelManager = null;
    this.menuManager = null;
    this.apiClient = null;
    this.searchManager = null;
    this.socketClient = null;
    this.panelRenderer = null;

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
    this.panelRenderer = new SectionPanelRenderer(this);
    // this.roleManager 제거됨 — 알바 관리는 ai-settings.js에서 처리

    // Load user profile and theme
    await this.loadUserProfile();

    // Setup event listeners
    this.setupEventListeners();

    // 모델명 캐시만 먼저 로드 (빠름 — API 1회)
    await dashboardManager._loadModelNameCache();

    // 메시지 로드 + 대시보드 통계를 병렬로
    await Promise.all([
      this.chatManager.loadRecentMessages(),
      dashboardManager.init()
    ]);

    // Bind events to existing hardcoded messages (for demo/fallback)
    this.chatManager.bindExistingMessages();

    // Scroll to bottom after messages are loaded
    this.scrollToBottom();

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
      
      // 프로필 저장 (검색 등에서 사용)
      this.profile = profile;

      // AI 이름 로드
      try {
        const aiSettings = await this.apiClient.get('/ai/settings');
        this.aiName = aiSettings?.settings?.personality?.name || 'Soul';
      } catch (e) {
        this.aiName = 'Soul';
      }

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
          const { SettingsManager } = await import('./settings/settings-manager.js?v=2');
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

    // 프로필 설정 변경 실시간 반영
    window.addEventListener('profile-updated', (e) => {
      console.log('Profile updated:', e.detail);
      // 현재는 로그만 출력 (필요시 UI 업데이트 추가 가능)
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
      const { SettingsManager } = await import('./settings/settings-manager.js?v=2');
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
      const { SettingsManager } = await import('./settings/settings-manager.js?v=2');
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
      const { SettingsManager } = await import('./settings/settings-manager.js?v=2');
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

    // DB에서 독 아이템 + MCP 서버 상태 로드
    try {
      const [dockRes, mcpRes] = await Promise.all([
        fetch('/api/config/dock'),
        fetch('/api/mcp/servers')
      ]);
      if (!dockRes.ok) throw new Error(`HTTP ${dockRes.status}`);
      this.dockItems = await dockRes.json();

      // 내장 섹션 정의 (app-settings.js와 동일)
      const builtinSections = {
        'section_memory': { name: 'A. 메모리 & 프로필', tools: ['recall_memory', 'save_memory', 'update_memory', 'list_memories', 'get_profile', 'update_profile', 'update_tags'] },
        'section_messaging': { name: 'B. 메시징', tools: ['send_message', 'schedule_message', 'cancel_scheduled_message', 'list_scheduled_messages'] },
        'section_calendar': { name: 'C. 캘린더', tools: ['get_events', 'create_event', 'update_event', 'delete_event'] },
        'section_todo': { name: 'D. 할일', tools: ['manage_todo'] },
        'section_note': { name: 'E. 메모', tools: ['manage_note'] },
        'section_browser': { name: 'F. 웹 브라우저', tools: ['search_web', 'read_url', 'browse'] },
        'section_filesystem': { name: 'G. 파일시스템', tools: ['file_read', 'file_write', 'file_list', 'file_info'] },
        'section_cloud': { name: 'H. 클라우드 스토리지', tools: ['cloud_search', 'cloud_read', 'cloud_write', 'cloud_delete', 'cloud_list'] },
        'section_system': { name: 'I. 시스템', tools: ['open_terminal', 'execute_command', 'get_weather'] }
      };

      // 내장 섹션 플래그 및 도구 목록 복원
      for (const item of this.dockItems) {
        const sectionData = builtinSections[item.id];
        if (sectionData) {
          item.isBuiltinSection = true;
          item.tools = sectionData.tools;
        }
      }

      // MCP 서버 정보 병합 (isMcp 마킹)
      if (mcpRes.ok) {
        const mcpData = await mcpRes.json();
        const mcpServers = mcpData.servers || [];
        for (const item of this.dockItems) {
          const srv = mcpServers.find(s => s.id === item.id);
          if (srv) {
            item.isMcp = true;
          }
        }
      }

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

    // order 기준 정렬 (독 표시 여부는 showInDock으로 이미 결정됨)
    const sorted = [...this.dockItems]
      .sort((a, b) => a.order - b.order);

    dock.innerHTML = sorted.map(item => `
      <div class="dock-item ${item.fixed ? 'fixed' : ''}" data-id="${item.id}" data-name="${item.name}" draggable="${!item.fixed && this.dockEditMode}">
        <div class="icon">
          <img src="/assets/${item.icon}" alt="${item.name}" />
        </div>
        ${this.dockEditMode && !item.fixed ? '<div class="dock-item-remove">×</div>' : ''}
      </div>`
    ).join('');

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
        body: JSON.stringify(newOrder)
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
    // 내장 섹션 처리
    if (item.isBuiltinSection) {
      this.openBuiltinSectionPanel(item);
      return;
    }

    // 터미널은 항상 내장 터미널로 열기 (MCP URL 무시)
    if (item.icon === 'terminal-icon.webp' || item.id === 'terminal' || item.name === 'Terminal') {
      this.openTerminalPanel();
      return;
    }

    if (item.url) {
      // MCP UI가 있으면 캔버스에 열기
      this.openCanvasPanel(item.id, item.url, item.name);
    } else {
      // 특수 기능
      switch (item.id) {
        case 'mic':
        case 'voice-input':
          this.openVoiceInputPanel();
          break;
        case 'settings':
          this.openSettingsInCanvas();
          break;
        default:
          // MCP 서버지만 UI URL 없으면 설정에서 관리 안내
          if (item.isMcp) {
            this.showToast(`${item.name} — 설정 > MCP에서 관리`, 2000);
          } else {
            console.log('미구현 독 기능:', item.id);
          }
      }
    }
  }

  /**
   * 내장 섹션 패널 열기
   */
  async openBuiltinSectionPanel(item) {
    const panel = document.getElementById('canvasPanel');
    const tabsContainer = document.getElementById('canvasTabs');
    const content = document.getElementById('canvasContent');

    if (!panel || !tabsContainer || !content) {
      console.log('❌ 캔버스 패널 요소 없음');
      return;
    }

    // 이미 열린 탭인지 확인
    const existingTab = this.canvasTabs.find(t => t.type === item.id);
    if (existingTab) {
      this.activateCanvasTab(item.id);
      panel.classList.remove('hide');
      this.movCanvasPanelForMobile();
      return;
    }

    // 새 탭 추가 (canvasTabs 배열에)
    this.canvasTabs.push({
      type: item.id,
      title: item.name,
      url: null,
      isMcp: false,
      isBuiltinSection: true,
      tools: item.tools || []
    });

    // 컨테이너 생성
    const container = document.createElement('div');
    container.className = 'canvas-content-container builtin-section-container';
    container.id = `canvas-iframe-${item.id}`;
    container.style.padding = '0';
    container.style.overflowY = 'auto';
    container.style.height = '100%';

    // 섹션별 UI 렌더링
    switch (item.id) {
      case 'section_todo':
        await this.renderTodoUI(container);
        break;
      case 'section_note':
        await this.renderNoteUI(container);
        break;
      case 'section_calendar':
        await this.renderCalendarUI(container);
        break;
      case 'section_system':
        await this.renderSystemUI(container);
        break;
      case 'section_memory':
        await this.panelRenderer.renderMemoryUI(container);
        break;
      case 'section_messaging':
        await this.panelRenderer.renderMessagingUI(container);
        break;
      case 'section_browser':
        await this.panelRenderer.renderBrowserUI(container);
        break;
      case 'section_filesystem':
        await this.panelRenderer.renderFilesystemUI(container);
        break;
      case 'section_cloud':
        await this.panelRenderer.renderCloudUI(container);
        break;
      default:
        // 기본 도구 목록 UI
        const hasSearchWeb = (item.tools || []).includes('search_web');
        const hasWeather = (item.tools || []).includes('get_weather');

        container.innerHTML = `
          <div class="builtin-section-panel">
            <div class="section-header">
              <h2>${item.name}</h2>
              <p class="section-desc">이 섹션의 도구를 사용할 수 있습니다</p>
            </div>
            <div class="section-tools">
              ${(item.tools || []).map(toolName => `
                <div class="section-tool-card">
                  <div class="tool-name">${toolName}</div>
                  <button class="tool-action-btn" data-tool="${toolName}">사용하기</button>
                </div>
              `).join('')}
            </div>
            ${hasSearchWeb ? `
              <div style="margin-top: 20px; padding: 16px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);">
                <div style="font-size: 0.9rem; font-weight: 500; color: rgba(255,255,255,0.85); margin-bottom: 8px;">Tavily API 키</div>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-bottom: 12px;">웹 검색 기능을 사용하려면 API 키가 필요합니다</div>
                <input type="password" id="webSearchApiKeyInput" placeholder="tvly-..." style="width: 100%; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background: rgba(0,0,0,0.3); color: white; font-size: 0.85rem; box-sizing: border-box; margin-bottom: 8px;">
                <div style="display: flex; gap: 8px;">
                  <button id="saveWebSearchApiKeyBtn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 6px; background: rgba(66,133,244,0.8); color: white; font-size: 0.8rem; cursor: pointer; font-weight: 500;">저장</button>
                  <button id="deleteWebSearchApiKeyBtn" style="display: none; padding: 8px 12px; border: none; border-radius: 6px; background: rgba(244,67,54,0.8); color: white; font-size: 0.8rem; cursor: pointer; font-weight: 500;">삭제</button>
                </div>
                <div id="webSearchApiKeyStatus" style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 8px;"></div>
              </div>
            ` : ''}
            ${hasWeather ? `
              <div style="margin-top: 16px; padding: 16px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);">
                <div style="font-size: 0.9rem; font-weight: 500; color: rgba(255,255,255,0.85); margin-bottom: 8px;">기상청 API 키</div>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-bottom: 12px;">공공데이터포털 기상청 서비스키 (단기+중기 예보). 없으면 Open-Meteo 사용</div>
                <input type="password" id="weatherApiKeyInput" placeholder="서비스키 입력..." style="width: 100%; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background: rgba(0,0,0,0.3); color: white; font-size: 0.85rem; box-sizing: border-box; margin-bottom: 8px;">
                <div style="display: flex; gap: 8px;">
                  <button id="saveWeatherApiKeyBtn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 6px; background: rgba(66,133,244,0.8); color: white; font-size: 0.8rem; cursor: pointer; font-weight: 500;">저장</button>
                  <button id="deleteWeatherApiKeyBtn" style="display: none; padding: 8px 12px; border: none; border-radius: 6px; background: rgba(244,67,54,0.8); color: white; font-size: 0.8rem; cursor: pointer; font-weight: 500;">삭제</button>
                </div>
                <div id="weatherApiKeyStatus" style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 8px;"></div>
              </div>
            ` : ''}
          </div>
        `;

        // 도구 버튼 이벤트
        container.querySelectorAll('.tool-action-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const toolName = btn.dataset.tool;
            if (toolName === 'open_terminal') {
              this.openTerminalPanel();
            } else {
              console.log('도구 실행:', toolName);
              this.showToast(`${toolName} 도구를 실행합니다`, 2000);
            }
          });
        });

        // 웹 검색 API 키 설정 (search_web이 있을 때만)
        if (hasSearchWeb) {
          setTimeout(async () => {
            const input = document.getElementById('webSearchApiKeyInput');
            const saveBtn = document.getElementById('saveWebSearchApiKeyBtn');
            const deleteBtn = document.getElementById('deleteWebSearchApiKeyBtn');
            const status = document.getElementById('webSearchApiKeyStatus');

            if (!input || !saveBtn || !deleteBtn || !status) return;

            // 현재 상태 로드
            try {
              const res = await fetch('/api/config/web-search');
              const data = await res.json();
              if (data.configured) {
                status.textContent = '✓ API 키 설정됨';
                status.style.color = 'rgba(76,175,80,0.8)';
                deleteBtn.style.display = 'inline-block';
              } else {
                status.textContent = 'API 키 미설정';
              }
            } catch (e) {
              status.textContent = '상태 확인 실패';
            }

            // 저장 버튼
            saveBtn.onclick = async () => {
              if (!input.value.trim()) {
                status.textContent = '⚠ API 키를 입력하세요';
                status.style.color = 'rgba(244,67,54,0.8)';
                return;
              }

              try {
                const res = await fetch('/api/config/web-search', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ apiKey: input.value.trim() })
                });
                const result = await res.json();

                if (result.success) {
                  input.value = '';
                  status.textContent = '✓ 저장 완료';
                  status.style.color = 'rgba(76,175,80,0.8)';
                  deleteBtn.style.display = 'inline-block';
                  this.showToast('웹 검색 API 키가 저장되었습니다', 2000);
                } else {
                  throw new Error(result.error);
                }
              } catch (e) {
                status.textContent = '⚠ 저장 실패: ' + e.message;
                status.style.color = 'rgba(244,67,54,0.8)';
              }
            };

            // 삭제 버튼
            deleteBtn.onclick = async () => {
              if (!confirm('웹 검색 API 키를 삭제하시겠습니까?')) return;

              try {
                const res = await fetch('/api/config/web-search', { method: 'DELETE' });
                const result = await res.json();

                if (result.success) {
                  status.textContent = 'API 키 미설정';
                  status.style.color = 'rgba(255,255,255,0.4)';
                  deleteBtn.style.display = 'none';
                  this.showToast('웹 검색 API 키가 삭제되었습니다', 2000);
                }
              } catch (e) {
                status.textContent = '⚠ 삭제 실패';
                status.style.color = 'rgba(244,67,54,0.8)';
              }
            };
          }, 100);
        }

        // 날씨 API 키 설정 (get_weather가 있을 때만)
        if (hasWeather) {
          setTimeout(async () => {
            const input = document.getElementById('weatherApiKeyInput');
            const saveBtn = document.getElementById('saveWeatherApiKeyBtn');
            const deleteBtn = document.getElementById('deleteWeatherApiKeyBtn');
            const status = document.getElementById('weatherApiKeyStatus');
            if (!input || !saveBtn || !deleteBtn || !status) return;

            // 현재 상태
            try {
              const res = await fetch('/api/config/weather');
              const data = await res.json();
              if (data.configured) {
                status.textContent = '기상청 예보 사용 중';
                status.style.color = 'rgba(76,175,80,0.8)';
                deleteBtn.style.display = 'inline-block';
              } else {
                status.textContent = 'Open-Meteo 사용 중 (기상청 키 미설정)';
              }
            } catch (e) { status.textContent = '상태 확인 실패'; }

            saveBtn.onclick = async () => {
              if (!input.value.trim()) { status.textContent = 'API 키를 입력하세요'; status.style.color = 'rgba(244,67,54,0.8)'; return; }
              try {
                const res = await fetch('/api/config/weather', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: input.value.trim() }) });
                const result = await res.json();
                if (result.success) {
                  input.value = '';
                  status.textContent = '기상청 예보 사용 중';
                  status.style.color = 'rgba(76,175,80,0.8)';
                  deleteBtn.style.display = 'inline-block';
                  this.showToast('기상청 API 키가 저장되었습니다', 2000);
                } else throw new Error(result.error);
              } catch (e) { status.textContent = '저장 실패: ' + e.message; status.style.color = 'rgba(244,67,54,0.8)'; }
            };

            deleteBtn.onclick = async () => {
              if (!confirm('기상청 API 키를 삭제하시겠습니까?')) return;
              try {
                const res = await fetch('/api/config/weather', { method: 'DELETE' });
                if ((await res.json()).success) {
                  status.textContent = 'Open-Meteo 사용 중';
                  status.style.color = 'rgba(255,255,255,0.4)';
                  deleteBtn.style.display = 'none';
                  this.showToast('Open-Meteo로 전환되었습니다', 2000);
                }
              } catch (e) { status.textContent = '삭제 실패'; status.style.color = 'rgba(244,67,54,0.8)'; }
            };
          }, 150);
        }
    }

    content.appendChild(container);

    // 탭 활성화
    this.activateCanvasTab(item.id);
    this.renderCanvasTabs();

    // 패널 열기
    panel.classList.remove('hide');
    this.movCanvasPanelForMobile();

    console.log('✅ 내장 섹션 탭 열림:', item.name);
  }

  /**
   * 설정(MCP) 페이지를 캔버스에 열기
   */
  async openSettingsInCanvas() {
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
    await this.renderDockSettingsInCanvas(settingsContainer);

    this.canvasTabs.push({ type: 'settings', title: 'MCP 설정' });
    this.activateCanvasTab('settings');
    panel.classList.remove('hide');
    this.movCanvasPanelForMobile();
  }

  /**
   * 캔버스에 독 설정 렌더링 (MCP + 연결)
   */
  async renderDockSettingsInCanvas(container) {
    container.innerHTML = '<div style="color: white; padding: 20px;">로딩 중...</div>';

    try {
      const { AppSettings } = await import('./settings/components/app-settings.js');
      const appSettings = new AppSettings();
      await appSettings.render(container, this.apiClient);
      await appSettings.loadSubPage('mcp');
    } catch (e) {
      container.innerHTML = '<div style="color: #ff6b6b; padding: 20px;">설정을 불러오는데 실패했습니다.</div>';
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
    this.canvasTabs.push({ type, title, url, isMcp: !!url });

    // 컨테이너 생성
    const container = document.createElement('div');
    container.className = url ? 'canvas-iframe canvas-mcp-container' : 'canvas-content-container';
    container.id = `canvas-iframe-${type}`;

    if (url) {
      // iframe (MCP UI) — 전체 영역 사용
      const iframe = document.createElement('iframe');
      iframe.className = 'canvas-mcp-iframe';
      iframe.src = url;
      // iframe 로드 후 줄바꿈 스타일 주입 (same-origin만 가능)
      iframe.addEventListener('load', () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const style = iframeDoc.createElement('style');
          style.textContent = `
            * { word-wrap: break-word; overflow-wrap: break-word; }
            body { overflow-x: hidden; }
          `;
          iframeDoc.head.appendChild(style);
        } catch (e) { /* cross-origin — 무시 */ }
      });
      container.appendChild(iframe);
    } else {
      // 일반 HTML 컨텐츠 컨테이너 (검색 결과 등)
      container.style.padding = '20px';
      container.style.overflowY = 'auto';
      container.style.height = '100%';
    }

    // MCP 상태 오버레이 (연결 끊김 시 표시)
    const overlay = document.createElement('div');
    overlay.className = 'mcp-status-overlay';
    overlay.id = `mcp-overlay-${type}`;
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="mcp-status-content">
        <div class="mcp-status-icon">⚡</div>
        <div class="mcp-status-text">서버 연결 끊김</div>
        <button class="mcp-reconnect-btn">재연결</button>
      </div>`;
    overlay.querySelector('.mcp-reconnect-btn').addEventListener('click', () => {
      overlay.style.display = 'none';
      iframe.src = url; // iframe 재로드
      this._checkMcpHealth(type);
    });
    container.appendChild(overlay);

    content.appendChild(container);

    // 탭 활성화
    this.activateCanvasTab(type);
    this.renderCanvasTabs();

    // 패널 열기
    panel.classList.remove('hide');
    this.movCanvasPanelForMobile();

    // MCP 헬스체크 시작
    if (url) this._startMcpHealthCheck(type);
    console.log('✅ 캔버스 탭 열림:', type);
  }

  /**
   * 탭 활성화
   */
  activateCanvasTab(type) {
    this.activeCanvasTab = type;

    // 모든 컨테이너 숨기기 (iframe + content 모두)
    document.querySelectorAll('.canvas-iframe, .canvas-content-container').forEach(container => {
      container.classList.remove('active');
    });
    // 특수 타입은 별도 ID
    let activeContainer;
    if (type === 'settings') {
      activeContainer = document.getElementById('canvas-settings');
    } else if (type === 'voice-input') {
      activeContainer = document.getElementById('canvas-voice-input');
    } else if (type === 'terminal') {
      activeContainer = document.getElementById('canvas-terminal');
      // 터미널 활성화 시 입력창 포커스
      const termInput = activeContainer?.querySelector('#termInput');
      if (termInput) termInput.focus();
    } else {
      activeContainer = document.getElementById(`canvas-iframe-${type}`);
    }
    if (activeContainer) activeContainer.classList.add('active');

    // MCP 탭이면 헬스체크
    const tab = this.canvasTabs.find(t => t.type === type);
    if (tab?.isMcp) this._checkMcpHealth(type);

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
    } else if (type === 'terminal') {
      iframe = document.getElementById('canvas-terminal');
      // 소켓 핸들러 정리 (PTY는 백그라운드 유지)
      this._cleanupTerminalSocket();
      this.socketClient?.socket?.emit('terminal:detach', { sessionId: 'default' });
      if (this._termSocketCheck) { clearInterval(this._termSocketCheck); this._termSocketCheck = null; }
      this._terminalOutput = null;
      this._terminalAddLine = null;
      this._terminalAddCommand = null;
    } else {
      iframe = document.getElementById(`canvas-iframe-${type}`);
    }
    if (iframe) iframe.remove();

    // MCP 헬스체크 인터벌 정리
    this._stopMcpHealthCheck(type);

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

  // === MCP 헬스체크 ===
  _mcpHealthIntervals = {};

  async _checkMcpHealth(type) {
    try {
      const res = await fetch(`/api/mcp/servers/${type}/health`);
      const data = await res.json();
      const overlay = document.getElementById(`mcp-overlay-${type}`);
      if (!overlay) return;

      if (data.status === 'ok') {
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
        const textEl = overlay.querySelector('.mcp-status-text');
        if (textEl) textEl.textContent = data.status === 'unreachable' ? '서버에 연결할 수 없습니다' : '서버 응답 오류';
      }
    } catch {
      // Soul 서버 자체가 죽은 경우 — MCP 오버레이 안 띄움 (서버 복구 시 자동 재체크)
    }
  }

  _startMcpHealthCheck(type) {
    this._stopMcpHealthCheck(type);
    // 즉시 한 번 체크
    this._checkMcpHealth(type);
    // 30초마다 체크
    this._mcpHealthIntervals[type] = setInterval(() => this._checkMcpHealth(type), 30000);
  }

  _stopMcpHealthCheck(type) {
    if (this._mcpHealthIntervals[type]) {
      clearInterval(this._mcpHealthIntervals[type]);
      delete this._mcpHealthIntervals[type];
    }
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
  // Terminal (내장 터미널)
  // ============================================

  /**
   * 터미널 패널 열기
   * - xterm.js로 캔버스에 터미널 화면 표시
   * - Socket.io로 서버 PTY와 실시간 연결
   * - 닫아도 PTY 백그라운드 유지, 다시 열면 버퍼 복원
   */
  openTerminalPanel() {
    const panel = document.getElementById('canvasPanel');
    const content = document.getElementById('canvasContent');
    if (!panel || !content) return;

    // 이미 열려있으면 활성화만
    if (this.canvasTabs.find(t => t.type === 'terminal')) {
      this.activateCanvasTab('terminal');
      panel.classList.remove('hide');
      this.movCanvasPanelForMobile();
      return;
    }

    // Fira Code 폰트 로드
    if (!document.getElementById('firacode-font')) {
      const link = document.createElement('link');
      link.id = 'firacode-font';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/firacode@6.2.0/distr/fira_code.css';
      document.head.appendChild(link);
    }

    // HTML 기반 터미널 UI (SSH Commander 스타일)
    const termContainer = document.createElement('div');
    termContainer.id = 'canvas-terminal';
    termContainer.className = 'canvas-iframe';
    termContainer.style.cssText = 'position: absolute; top: 48px; left: 0; right: 0; bottom: 0; height: auto; overflow: hidden; display: flex; flex-direction: column; padding: 8px;';
    termContainer.innerHTML = `
      <div class="term-status">
        <span><span class="term-status-dot" id="termStatusDot"></span><span id="termStatusText">연결 중...</span></span>
        <span id="termHostInfo"></span>
      </div>
      <div class="term-output" id="termOutput">
        <div class="term-output-line welcome">Hello!</div>
<div class="term-cursor-line" id="termCursorLine"><span class="term-prompt">$</span> <span class="term-cursor"></span></div>
      </div>
    `;
    content.appendChild(termContainer);

    const outputEl = termContainer.querySelector('#termOutput');
    const cursorLine = termContainer.querySelector('#termCursorLine');
    const statusDot = termContainer.querySelector('#termStatusDot');
    const statusText = termContainer.querySelector('#termStatusText');
    const hostInfo = termContainer.querySelector('#termHostInfo');

    // 컨테이너에서 직접 키보드 입력 받기
    termContainer.setAttribute('tabindex', '0');
    termContainer.style.outline = 'none';
    let currentInput = '';

    const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

    const addLine = (text, type = 'success') => {
      const clean = stripAnsi(text);
      if (!clean.trim()) return;
      const div = document.createElement('div');
      div.className = `term-output-line ${type}`;
      div.textContent = clean;
      outputEl.insertBefore(div, cursorLine);
      outputEl.scrollTop = outputEl.scrollHeight;
    };

    const addCommand = (cmd, fromAI = false) => {
      const div = document.createElement('div');
      div.className = 'term-output-line command';
      div.innerHTML = `<span class="term-prompt">${this._escapeHtml(currentPrompt)}</span> ${this._escapeHtml(cmd)}${fromAI ? '<span class="term-ai-badge">AI</span>' : ''}`;
      outputEl.insertBefore(div, cursorLine);
      outputEl.scrollTop = outputEl.scrollHeight;
    };

    let currentPrompt = '$';
    const updateCursorLine = () => {
      cursorLine.innerHTML = `<span class="term-prompt">${this._escapeHtml(currentPrompt)}</span> ${this._escapeHtml(currentInput)}<span class="term-cursor"></span>`;
    };

    this._terminalOutput = outputEl;
    this._terminalAddLine = addLine;
    this._terminalAddCommand = addCommand;

    // 탭 등록 + 활성화
    this.canvasTabs.push({ type: 'terminal', title: '터미널' });
    this.activateCanvasTab('terminal');
    panel.classList.remove('hide');
    this.movCanvasPanelForMobile();

    // 소켓 연결 (없으면 대기)
    const connectTerminal = (socket) => {
      console.log('🖥️ Terminal: emitting terminal:start');
      socket.emit('terminal:start', { sessionId: 'default', cols: 80, rows: 24 });

      const parsePrompt = (text) => {
        const clean = stripAnsi(text).replace(/\r/g, '').trim();
        const m = clean.match(/(\w+@\w+)\s+(.*?)\s*[%$#>]\s*$/);
        if (m) {
          hostInfo.textContent = m[1];
          currentPrompt = `${m[1]} ${m[2] || '~'} $`;
          updateCursorLine();
          return true;
        }
        return false;
      };

      const startHandler = ({ sessionId, buffer, alive }) => {
        statusDot.classList.add('online');
        statusText.textContent = '연결됨';
        hostInfo.textContent = 'local shell';
        console.log('🖥️ Terminal buffer:', JSON.stringify(buffer));
        if (buffer) parsePrompt(buffer);
        // buffer가 비어있으면 쉘 프롬프트가 아직 안 나온 것 — output 이벤트에서 잡힘
      };
      socket.on('terminal:started', startHandler);

      let outputBuffer = '';
      const outputHandler = ({ data }) => {
        outputBuffer += data;
        clearTimeout(this._termOutputTimer);
        this._termOutputTimer = setTimeout(() => {
          const lines = stripAnsi(outputBuffer).split('\n');
          for (const line of lines) {
            const trimmed = line.replace(/\r/g, '').trim();
            if (!trimmed) continue;
            // 프롬프트 패턴 감지 → 현재 위치 업데이트
            if (/^(%\s+)?\w+@\w+.*[%$#>]\s*$/.test(trimmed)) {
              parsePrompt(trimmed);
              continue;
            }
            addLine(trimmed);
          }
          outputBuffer = '';
        }, 50);
      };
      socket.on('terminal:output', outputHandler);

      const exitHandler = ({ exitCode }) => {
        addLine(`[프로세스 종료: ${exitCode}]`, 'info');
        statusDot.classList.remove('online');
        statusText.textContent = '종료됨';
      };
      socket.on('terminal:exit', exitHandler);

      this._terminalSocketHandlers = { started: startHandler, output: outputHandler, exit: exitHandler };

      // 키보드 입력 (컨테이너에서 직접)
      termContainer.addEventListener('click', () => termContainer.focus());
      termContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const cmd = currentInput;
          currentInput = '';
          updateCursorLine();
          if (cmd.trim()) {
            addCommand(cmd);
            socket.emit('terminal:input', { sessionId: 'default', data: cmd + '\n' });
          }
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          currentInput = currentInput.slice(0, -1);
          updateCursorLine();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          currentInput += e.key;
          updateCursorLine();
        }
      });

      termContainer.focus();
    };

    const socket = this.socketClient?.socket;
    console.log('🖥️ Terminal: socket check', { exists: !!socket, connected: socket?.connected, id: socket?.id });
    if (socket?.connected) {
      connectTerminal(socket);
    } else {
      statusText.textContent = '소켓 대기 중...';
      const checkSocket = setInterval(() => {
        const s = this.socketClient?.socket;
        if (s?.connected) {
          clearInterval(checkSocket);
          console.log('🖥️ Terminal: socket ready', s.id);
          connectTerminal(s);
        }
      }, 500);
      this._termSocketCheck = checkSocket;
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 터미널 소켓 핸들러 정리
   */
  _cleanupTerminalSocket() {
    const socket = this.socketClient?.socket;
    if (socket && this._terminalSocketHandlers) {
      if (this._terminalSocketHandlers.started) {
        socket.off('terminal:started', this._terminalSocketHandlers.started);
      }
      if (this._terminalSocketHandlers.output) {
        socket.off('terminal:output', this._terminalSocketHandlers.output);
      }
      if (this._terminalSocketHandlers.exit) {
        socket.off('terminal:exit', this._terminalSocketHandlers.exit);
      }
      this._terminalSocketHandlers = null;
    }
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
              <div class="orb-waves">
                <div class="orb-wave"></div>
                <div class="orb-wave"></div>
                <div class="orb-wave"></div>
              </div>
              <div class="glow"></div>
              <div class="particles">
                <div class="rotate">
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                </div>
              </div>
              <div class="particles particles-outer">
                <div class="rotate">
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                  <div class="angle"><div class="size"><div class="position"><div class="pulse"><div class="particle"></div></div></div></div></div>
                </div>
              </div>
            </div>
            <img class="capsule-image" src="/assets/capsule.png" alt=".soul" />

            <!-- .soul SVG 로고 (캡슐 내부) -->
            <svg class="soul-logo-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="259px" height="141px" viewBox="0 0 259 141">
              <image class="soul-svg-inner" x="0px" y="0px" width="259px" height="141px" xlink:href="data:img/png;base64,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" />
            </svg>
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

    // 드래그 앤 드롭 — 대화 영역 + 입력창 전체
    const chatContainer = document.getElementById('chatContainer');
    const chatForm = document.getElementById('chatForm');
    const dropTargets = [chatContainer, chatForm].filter(Boolean);

    for (const target of dropTargets) {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this._showDropOverlay();
      });
      target.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget || !target.contains(e.relatedTarget)) {
          this._hideDropOverlay();
        }
      });
      target.addEventListener('drop', (e) => {
        e.preventDefault();
        this._hideDropOverlay();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) this.addAttachments(files);
      });
    }

    // 클립보드 붙여넣기 (Cmd+V로 이미지 첨부)
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.addEventListener('paste', (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const files = items
          .filter(item => item.kind === 'file')
          .map(item => item.getAsFile())
          .filter(Boolean);
        if (files.length > 0) {
          e.preventDefault();
          this.addAttachments(files);
        }
      });
    }

    console.log('✅ 첨부 핸들러 초기화 완료');
  }

  _showDropOverlay() {
    let overlay = document.getElementById('dropOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dropOverlay';
      overlay.className = 'drag-overlay';
      overlay.innerHTML = '<span class="drag-overlay-text">파일을 놓으세요</span>';
      const container = document.getElementById('chatContainer');
      if (container) container.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  }

  _hideDropOverlay() {
    const overlay = document.getElementById('dropOverlay');
    if (overlay) overlay.style.display = 'none';
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

  // ========== 내장 섹션 UI 렌더링 ==========

  /**
   * Todo 관리 UI (오라클 MCP 스타일)
   */
  async renderTodoUI(container) {
    try {
      const response = await this.apiClient.post('/tools/builtin/manage_todo', { action: 'list' });
      const todos = response.todos || [];

      // Phase별로 그룹화 (tags에서 Phase 추출)
      const phases = this._groupTodosByPhase(todos);

      // 전체 진행률 계산
      let totalTasks = 0, completedTasks = 0;
      Object.values(phases).forEach(phase => {
        totalTasks += phase.tasks.length;
        completedTasks += phase.tasks.filter(t => t.status === 'completed').length;
      });
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      container.innerHTML = `
        <div class="oracle-todo-container">
          <div class="oracle-todo-header">
            <div class="oracle-todo-header-top">
              <div style="display: flex; align-items: center; gap: 14px; margin-left: auto;">
                <button class="oracle-save-btn">저장</button>
                <span class="oracle-prog-text">${progress}%</span>
              </div>
            </div>
          </div>
          <div class="oracle-content-area"></div>
        </div>
      `;

      this._renderPhases(container, phases);
      this._attachOracleTodoEvents(container);
    } catch (error) {
      console.error('Todo UI 렌더링 실패:', error);
      container.innerHTML = `<div class="error-state"><p>할일 목록을 불러오는데 실패했습니다: ${error.message}</p></div>`;
    }
  }

  _groupTodosByPhase(todos) {
    const phases = {};

    todos.forEach(todo => {
      // tags에서 Phase 추출 (예: ["Phase 1"] → "Phase 1")
      let phaseName = 'Tasks';
      if (todo.tags) {
        const tags = typeof todo.tags === 'string' ? JSON.parse(todo.tags) : todo.tags;
        const phaseTag = tags.find(t => t.startsWith('Phase '));
        if (phaseTag) phaseName = phaseTag;
      }

      if (!phases[phaseName]) {
        phases[phaseName] = {
          name: phaseName,
          tasks: [],
          memos: [],
          open: this.todoOpenSections?.[phaseName] !== false
        };
      }

      phases[phaseName].tasks.push(todo);
    });

    return phases;
  }

  _renderPhases(container, phases) {
    const contentArea = container.querySelector('.oracle-content-area');
    const phaseEntries = Object.entries(phases);

    contentArea.innerHTML = phaseEntries.map(([phaseName, phase], phaseIdx) => {
      const doneTasks = phase.tasks.filter(t => t.status === 'completed').length;
      const totalTasks = phase.tasks.length;
      const statusBadge = totalTasks === 0 ? '' :
        doneTasks === totalTasks ? '<span class="oracle-status-badge oracle-status-done">Complete</span>' :
        doneTasks > 0 ? `<span class="oracle-status-badge oracle-status-doing">${doneTasks}/${totalTasks}</span>` :
        '<span class="oracle-status-badge oracle-status-todo">Waiting</span>';

      return `
        <div class="oracle-phase-card" data-phase="${this._escapeHtml(phaseName)}">
          <div class="oracle-phase-header" data-phase-idx="${phaseIdx}">
            <div class="oracle-phase-info">
              <span class="oracle-phase-title oracle-editable" contenteditable="true" data-field="phase-title">${this._escapeHtml(phaseName)}</span>
              ${statusBadge}
            </div>
            <span class="oracle-btn-del" data-action="delete-phase">×</span>
          </div>
          <div class="oracle-phase-body ${phase.open ? 'open' : ''}">
            ${phase.tasks.map((task, taskIdx) => {
              // 메모인지 확인 (tags에 'memo'가 있거나, priority가 'memo'인 경우)
              const isMemo = (task.tags && (typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags).includes('memo')) || task.priority === 'memo';

              if (isMemo) {
                return `
                  <div class="oracle-item-row oracle-memo-row" data-task-id="${task.todoId}" style="padding-left: 30px;">
                    <span class="oracle-editable oracle-memo-text" contenteditable="true" data-field="memo">${this._escapeHtml(task.title)}</span>
                    <span class="oracle-btn-del" data-action="delete-task">×</span>
                  </div>
                `;
              } else {
                return `
                  <div class="oracle-item-row" data-task-id="${task.todoId}">
                    <div class="oracle-checkbox ${task.status === 'completed' ? 'done' : ''}" data-task-idx="${taskIdx}">
                      ${task.status === 'completed' ? '✓' : ''}
                    </div>
                    <span class="oracle-editable" contenteditable="true" data-field="title">${this._escapeHtml(task.title)}</span>
                    <span class="oracle-btn-del" data-action="delete-task">×</span>
                  </div>
                `;
              }
            }).join('')}
            <div style="display:flex; gap:10px; margin-top:10px;">
              <button class="oracle-add-btn" data-action="add-task">+ Task</button>
              <button class="oracle-add-btn" data-action="add-memo">+ Memo</button>
            </div>
          </div>
        </div>
      `;
    }).join('') + '<button class="oracle-add-btn" style="margin-top:10px;" data-action="add-phase">+ 섹션 추가</button>';
  }

  _attachOracleTodoEvents(container) {
    if (!this.todoOpenSections) this.todoOpenSections = {};

    // Phase 토글
    container.querySelectorAll('.oracle-phase-header').forEach(header => {
      header.addEventListener('click', (e) => {
        // editable 요소나 삭제 버튼 클릭 시 토글 안 함
        if (e.target.classList.contains('oracle-btn-del') ||
            e.target.classList.contains('oracle-editable') ||
            e.target.getAttribute('contenteditable') === 'true') return;
        const body = header.nextElementSibling;
        body.classList.toggle('open');
        const phaseName = header.closest('.oracle-phase-card').dataset.phase;
        this.todoOpenSections[phaseName] = body.classList.contains('open');
      });
    });

    // 체크박스 토글
    container.querySelectorAll('.oracle-checkbox').forEach(checkbox => {
      checkbox.addEventListener('click', async (e) => {
        const row = e.target.closest('.oracle-item-row');
        const todoId = row.dataset.taskId;
        const isDone = e.target.classList.contains('done');
        const newStatus = isDone ? 'pending' : 'completed';

        try {
          await this.apiClient.post('/tools/builtin/manage_todo', {
            action: 'update',
            todo_id: todoId,
            status: newStatus
          });
          await this.renderTodoUI(container);
        } catch (error) {
          console.error('Todo 상태 업데이트 실패:', error);
          alert('상태 변경에 실패했습니다');
        }
      });
    });

    // 인라인 편집 (할일 제목 + Phase 제목)
    container.querySelectorAll('.oracle-editable').forEach(editable => {
      editable.addEventListener('blur', async (e) => {
        const field = e.target.dataset.field;
        const newValue = e.target.textContent.trim();

        if (!newValue) {
          e.target.textContent = field === 'phase-title' ? 'Untitled' : '제목 없음';
          return;
        }

        // Phase 제목 수정
        if (field === 'phase-title') {
          const card = e.target.closest('.oracle-phase-card');
          const oldPhaseName = card.dataset.phase;

          // 해당 Phase의 모든 할일의 태그를 업데이트해야 함
          const phaseBody = card.querySelector('.oracle-phase-body');
          const taskRows = phaseBody.querySelectorAll('.oracle-item-row');

          try {
            // 각 할일의 태그를 새 Phase 이름으로 업데이트
            for (const row of taskRows) {
              const todoId = row.dataset.taskId;
              const response = await this.apiClient.post('/tools/builtin/manage_todo', { action: 'list' });
              const todo = response.todos.find(t => t.todoId === todoId);

              if (todo) {
                let tags = todo.tags ? (typeof todo.tags === 'string' ? JSON.parse(todo.tags) : todo.tags) : [];
                // 기존 Phase 태그 제거하고 새 Phase 태그 추가
                tags = tags.filter(t => !t.startsWith('Phase '));
                tags.push(newValue);

                await this.apiClient.post('/tools/builtin/manage_todo', {
                  action: 'update',
                  todo_id: todoId,
                  tags: tags
                });
              }
            }
            await this.renderTodoUI(container);
          } catch (error) {
            console.error('Phase 제목 수정 실패:', error);
            e.target.textContent = oldPhaseName;
          }
          return;
        }

        // 할일/메모 제목 수정
        const row = e.target.closest('.oracle-item-row');
        if (!row) return;

        const todoId = row.dataset.taskId;
        try {
          await this.apiClient.post('/tools/builtin/manage_todo', {
            action: 'update',
            todo_id: todoId,
            title: newValue
          });
        } catch (error) {
          console.error('Todo/Memo 수정 실패:', error);
        }
      });
    });

    // 삭제 버튼
    container.querySelectorAll('[data-action="delete-task"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.oracle-item-row');
        const todoId = row.dataset.taskId;

        if (!confirm('정말 삭제하시겠습니까?')) return;

        try {
          await this.apiClient.post('/tools/builtin/manage_todo', {
            action: 'delete',
            todo_id: todoId
          });
          await this.renderTodoUI(container);
        } catch (error) {
          console.error('Todo 삭제 실패:', error);
          alert('삭제에 실패했습니다');
        }
      });
    });

    // Task 추가
    container.querySelectorAll('[data-action="add-task"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('.oracle-phase-card');
        const phaseName = card.dataset.phase;

        try {
          await this.apiClient.post('/tools/builtin/manage_todo', {
            action: 'create',
            title: '새 할일',
            tags: [phaseName]
          });
          await this.renderTodoUI(container);
        } catch (error) {
          console.error('Todo 추가 실패:', error);
          alert('추가에 실패했습니다');
        }
      });
    });

    // Memo 추가
    container.querySelectorAll('[data-action="add-memo"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('.oracle-phase-card');
        const phaseName = card.dataset.phase;

        try {
          await this.apiClient.post('/tools/builtin/manage_todo', {
            action: 'create',
            title: '새 메모',
            priority: 'memo',  // 메모로 표시
            tags: [phaseName, 'memo']
          });
          await this.renderTodoUI(container);
        } catch (error) {
          console.error('Memo 추가 실패:', error);
          alert('추가에 실패했습니다');
        }
      });
    });

    // Phase 추가
    const addPhaseBtn = container.querySelector('[data-action="add-phase"]');
    if (addPhaseBtn) {
      addPhaseBtn.addEventListener('click', async (e) => {
        const phaseName = prompt('Phase 이름을 입력하세요:', `Phase ${Object.keys(this.todoOpenSections || {}).length + 1}`);
        if (!phaseName) return;

        try {
          await this.apiClient.post('/tools/builtin/manage_todo', {
            action: 'create',
            title: '새 할일',
            tags: [phaseName]
          });
          await this.renderTodoUI(container);
        } catch (error) {
          console.error('Phase 추가 실패:', error);
          alert('추가에 실패했습니다');
        }
      });
    }
  }

  /**
   * System 도구 UI (Canvas 터미널 스타일 - 깜빡이는 커서)
   */
  async renderSystemUI(container) {
    container.style.padding = '0';

    // Fira Code 폰트 로드
    if (!document.getElementById('firacode-font')) {
      const link = document.createElement('link');
      link.id = 'firacode-font';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/firacode@6.2.0/distr/fira_code.css';
      document.head.appendChild(link);
    }

    container.innerHTML = `
      <div style="height: 100%; display: flex; flex-direction: column; padding: 8px;">
        <div class="term-status">
          <span>
            <span class="term-status-dot online" id="statusDot"></span>
            <span id="statusText">연결됨</span>
          </span>
          <span id="hostInfo">localhost</span>
        </div>
        <div class="term-output" id="termOutput">
          <div class="term-output-line welcome">Hello!</div>
          <div class="term-cursor-line" id="termCursorLine"><span class="term-prompt">$</span> <span class="term-cursor"></span></div>
        </div>
      </div>
    `;

    this._attachTerminalEvents(container);
  }

  _attachTerminalEvents(container) {
    const output = container.querySelector('#termOutput');
    const cursorLine = container.querySelector('#termCursorLine');
    const statusDot = container.querySelector('#statusDot');
    const statusText = container.querySelector('#statusText');

    let currentInput = '';
    let history = [];
    let historyIndex = -1;

    // 컨테이너에서 직접 키보드 입력 받기
    container.setAttribute('tabindex', '0');
    container.style.outline = 'none';

    const updateCursorLine = () => {
      cursorLine.innerHTML = `<span class="term-prompt">$</span> ${this._escapeHtml(currentInput)}<span class="term-cursor"></span>`;
    };

    const addLine = (text, type = 'success') => {
      if (!text.trim()) return;
      const div = document.createElement('div');
      div.className = `term-output-line ${type}`;
      div.textContent = text;
      output.insertBefore(div, cursorLine);
      output.scrollTop = output.scrollHeight;
    };

    const addCommand = (cmd) => {
      const div = document.createElement('div');
      div.className = 'term-output-line command';
      div.innerHTML = `<span class="term-prompt">$</span> ${this._escapeHtml(cmd)}`;
      output.insertBefore(div, cursorLine);
      output.scrollTop = output.scrollHeight;
    };

    // Socket 이벤트 리스너
    this.socketClient.socket.on('terminal:output', ({ data }) => {
      const lines = data.split('\n');
      lines.forEach(line => {
        if (line.trim()) addLine(line);
      });
    });

    // 키보드 입력
    container.addEventListener('click', () => container.focus());
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = currentInput.trim();
        currentInput = '';
        updateCursorLine();

        if (!cmd) return;

        history.push(cmd);
        historyIndex = history.length;
        addCommand(cmd);

        // 로컬 명령 처리
        if (cmd === 'clear') {
          while (output.firstChild !== cursorLine) {
            output.removeChild(output.firstChild);
          }
          return;
        }
        if (cmd === 'help') {
          addLine('Available commands:', 'info');
          addLine('  clear - 화면 지우기', 'info');
          addLine('  help - 도움말', 'info');
          return;
        }

        // 서버로 명령 전송
        this.socketClient.socket.emit('terminal:command', { command: cmd });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        currentInput = currentInput.slice(0, -1);
        updateCursorLine();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex > 0) {
          historyIndex--;
          currentInput = history[historyIndex];
          updateCursorLine();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          historyIndex++;
          currentInput = history[historyIndex];
          updateCursorLine();
        } else {
          historyIndex = history.length;
          currentInput = '';
          updateCursorLine();
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        currentInput += e.key;
        updateCursorLine();
      }
    });

    container.focus();
  }

  /**
   * Note 관리 UI
   */
  async renderNoteUI(container) {
    try {
      const response = await this.apiClient.post('/tools/builtin/manage_note', {
        action: 'list', limit: 100
      });

      const notes = response.notes || [];

      container.innerHTML = `
        <div class="note-panel">
          <div class="note-header">
            <button class="note-add-btn" id="addNoteBtn">
              <span>📝</span> 새 메모
            </button>
            <div class="note-search">
              <input type="text" id="noteSearchInput" class="note-search-input" placeholder="메모 검색...">
            </div>
          </div>

          <div class="note-container">
            <div class="note-list" id="noteList">
              ${notes.length === 0 ? `
                <div class="note-empty">
                  <p>메모가 없습니다</p>
                  <p style="font-size: 0.85rem; opacity: 0.7; margin-top: 0.5rem;">
                    새 메모 버튼을 눌러 추가하세요
                  </p>
                </div>
              ` : notes.map(note => this._renderNoteListItem(note)).join('')}
            </div>

            <div class="note-viewer" id="noteViewer">
              <div class="note-viewer-empty">
                <p>왼쪽에서 메모를 선택하세요</p>
              </div>
            </div>
          </div>
        </div>
      `;

      container.querySelector('#addNoteBtn')?.addEventListener('click', () => this._createNewNote(container));
      container.querySelector('#noteSearchInput')?.addEventListener('input', (e) => {
        this._searchNotes(container, e.target.value);
      });

      this._attachNoteListEvents(container);

    } catch (error) {
      console.error('Note UI 렌더링 실패:', error);
      container.innerHTML = `<div class="note-panel"><p style="color: var(--destructive); text-align: center; padding: 2rem;">메모 목록을 불러오는데 실패했습니다</p></div>`;
    }
  }

  _renderNoteListItem(note) {
    const preview = (note.content || '').substring(0, 80);
    const date = new Date(note.updatedAt || note.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    return `
      <div class="note-list-item" data-note-id="${note.noteId}">
        <div class="note-item-header">
          <h4 class="note-item-title">${this._escapeHtml(note.title)}</h4>
          <button class="note-item-delete" data-action="delete" title="삭제">🗑️</button>
        </div>
        <p class="note-item-preview">${this._escapeHtml(preview)}${preview.length >= 80 ? '...' : ''}</p>
        <div class="note-item-footer">
          <span class="note-item-date">${date}</span>
          ${note.tags ? `<div class="note-item-tags">${JSON.parse(note.tags).slice(0, 2).map(tag => `#${tag}`).join(' ')}</div>` : ''}
        </div>
      </div>
    `;
  }

  _attachNoteListEvents(container) {
    container.querySelectorAll('.note-list-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.note-item-delete')) {
          const noteId = item.dataset.noteId;
          if (confirm('정말 삭제하시겠습니까?')) await this._deleteNote(noteId, container);
          return;
        }
        container.querySelectorAll('.note-list-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        await this._viewNote(item.dataset.noteId, container);
      });
    });
  }

  async _viewNote(noteId, container) {
    try {
      const response = await this.apiClient.post('/tools/builtin/manage_note', {
        action: 'read', note_id: noteId
      });
      const note = response.note;
      if (!note) return;

      const viewer = container.querySelector('#noteViewer');
      viewer.innerHTML = `
        <div class="note-viewer-content">
          <div class="note-viewer-header">
            <input type="text" class="note-title-input" value="${this._escapeHtml(note.title)}" data-note-id="${note.noteId}">
            <button class="note-save-btn" data-note-id="${note.noteId}">💾 저장</button>
          </div>
          <textarea class="note-content-input" data-note-id="${note.noteId}">${this._escapeHtml(note.content || '')}</textarea>
          <div class="note-meta">
            <input type="text" class="note-tags-input" placeholder="태그 (쉼표로 구분)" value="${note.tags ? JSON.parse(note.tags).join(', ') : ''}" data-note-id="${note.noteId}">
            <div class="note-dates">
              <span>생성: ${new Date(note.createdAt).toLocaleString('ko-KR')}</span>
              <span>수정: ${new Date(note.updatedAt).toLocaleString('ko-KR')}</span>
            </div>
          </div>
        </div>
      `;

      viewer.querySelector('.note-save-btn')?.addEventListener('click', () => this._saveNote(noteId, container));

      let saveTimeout;
      [viewer.querySelector('.note-title-input'), viewer.querySelector('.note-content-input'), viewer.querySelector('.note-tags-input')].forEach(input => {
        input?.addEventListener('input', () => {
          clearTimeout(saveTimeout);
          saveTimeout = setTimeout(() => this._saveNote(noteId, container, true), 3000);
        });
      });
    } catch (error) {
      console.error('Note 조회 실패:', error);
    }
  }

  async _saveNote(noteId, container, isAutoSave = false) {
    try {
      const title = container.querySelector('.note-title-input')?.value || '제목 없음';
      const content = container.querySelector('.note-content-input')?.value || '';
      const tagsInput = container.querySelector('.note-tags-input')?.value || '';
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

      await this.apiClient.post('/tools/builtin/manage_note', {
        action: 'update', note_id: noteId, title, content, tags
      });

      if (!isAutoSave) this.showToast('메모가 저장되었습니다', 1500);

      await this.renderNoteUI(container);
      setTimeout(() => {
        const item = container.querySelector(`[data-note-id="${noteId}"]`);
        if (item) {
          item.classList.add('active');
          this._viewNote(noteId, container);
        }
      }, 100);
    } catch (error) {
      console.error('Note 저장 실패:', error);
      alert('저장에 실패했습니다');
    }
  }

  async _createNewNote(container) {
    try {
      const response = await this.apiClient.post('/tools/builtin/manage_note', {
        action: 'create', title: '새 메모', content: ''
      });
      if (response.success) {
        await this.renderNoteUI(container);
        setTimeout(() => container.querySelector(`[data-note-id="${response.note_id}"]`)?.click(), 100);
      }
    } catch (error) {
      console.error('Note 생성 실패:', error);
      alert('메모 생성에 실패했습니다');
    }
  }

  async _deleteNote(noteId, container) {
    try {
      await this.apiClient.post('/tools/builtin/manage_note', {
        action: 'delete', note_id: noteId
      });
      await this.renderNoteUI(container);
    } catch (error) {
      console.error('Note 삭제 실패:', error);
      alert('삭제에 실패했습니다');
    }
  }

  _searchNotes(container, query) {
    const lowerQuery = query.toLowerCase();
    container.querySelectorAll('.note-list-item').forEach(item => {
      const title = item.querySelector('.note-item-title').textContent.toLowerCase();
      const preview = item.querySelector('.note-item-preview').textContent.toLowerCase();
      item.style.display = (title.includes(lowerQuery) || preview.includes(lowerQuery)) ? 'block' : 'none';
    });
  }

  /**
   * 캘린더 UI
   */
  async renderCalendarUI(container) {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();

      // 이번 달 일정 가져오기
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const response = await this.apiClient.post('/tools/builtin/get_events', {
        start_date: startDate, end_date: endDate
      });

      const events = response.events || [];

      container.innerHTML = `
        <div class="calendar-panel">
          <div class="calendar-header">
            <button class="calendar-nav-btn" id="calendarPrevMonth">◀</button>
            <div class="calendar-current-month" id="calendarCurrentMonth">
              ${year}년 ${month + 1}월
            </div>
            <button class="calendar-nav-btn" id="calendarNextMonth">▶</button>
            <button class="calendar-add-btn" id="addEventBtn">➕ 일정 추가</button>
          </div>

          <div class="calendar-grid" id="calendarGrid">
            ${this._renderCalendarGrid(year, month, events)}
          </div>

          <div class="calendar-event-list" id="calendarEventList">
            <h3>이번 달 일정</h3>
            ${events.length === 0 ? `
              <div class="calendar-empty">
                <p>일정이 없습니다</p>
              </div>
            ` : events.map(event => this._renderEventItem(event)).join('')}
          </div>
        </div>
      `;

      // 저장된 연도/월을 컨테이너에 저장
      container.dataset.currentYear = year;
      container.dataset.currentMonth = month;

      // 이벤트 리스너
      container.querySelector('#calendarPrevMonth')?.addEventListener('click', () => this._changeMonth(container, -1));
      container.querySelector('#calendarNextMonth')?.addEventListener('click', () => this._changeMonth(container, 1));
      container.querySelector('#addEventBtn')?.addEventListener('click', () => this._createNewEvent(container));

      this._attachEventListeners(container);

    } catch (error) {
      console.error('Calendar UI 렌더링 실패:', error);
      container.innerHTML = `<div class="calendar-panel"><p style="color: var(--destructive); text-align: center; padding: 2rem;">캘린더를 불러오는데 실패했습니다</p></div>`;
    }
  }

  _renderCalendarGrid(year, month, events) {
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
    let html = '<div class="calendar-weekdays">';
    daysOfWeek.forEach(day => {
      html += `<div class="calendar-weekday">${day}</div>`;
    });
    html += '</div><div class="calendar-days">';

    // 이전 달 날짜 (회색)
    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month">${prevLastDate - i}</div>`;
    }

    // 이번 달 날짜
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    for (let date = 1; date <= lastDate; date++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.startTime.startsWith(dateStr));
      const isToday = isCurrentMonth && today.getDate() === date;

      html += `
        <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <span class="calendar-date-num">${date}</span>
          ${dayEvents.length > 0 ? `<div class="calendar-day-events">${dayEvents.slice(0, 2).map(e => `<div class="calendar-day-event" title="${this._escapeHtml(e.title)}">${this._escapeHtml(e.title.length > 8 ? e.title.substring(0, 8) + '...' : e.title)}</div>`).join('')}${dayEvents.length > 2 ? `<div class="calendar-day-more">+${dayEvents.length - 2}</div>` : ''}</div>` : ''}
        </div>
      `;
    }

    // 다음 달 날짜 (회색)
    const totalCells = firstDay + lastDate;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainingCells; i++) {
      html += `<div class="calendar-day other-month">${i}</div>`;
    }

    html += '</div>';
    return html;
  }

  _renderEventItem(event) {
    const start = new Date(event.startTime);
    const end = event.endTime ? new Date(event.endTime) : null;
    const dateStr = start.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    const timeStr = start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="calendar-event-item" data-event-id="${event.eventId}">
        <div class="event-item-header">
          <h4 class="event-item-title">${this._escapeHtml(event.title)}</h4>
          <div class="event-item-actions">
            <button class="event-item-btn" data-action="edit" title="수정">✏️</button>
            <button class="event-item-btn" data-action="delete" title="삭제">🗑️</button>
          </div>
        </div>
        <div class="event-item-time">
          📅 ${dateStr} ${timeStr}${end ? ' ~ ' + end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
        ${event.description ? `<div class="event-item-desc">${this._escapeHtml(event.description)}</div>` : ''}
        ${event.location ? `<div class="event-item-location">📍 ${this._escapeHtml(event.location)}</div>` : ''}
      </div>
    `;
  }

  _attachEventListeners(container) {
    // 날짜 클릭 - 해당 날짜에 일정 추가
    container.querySelectorAll('.calendar-day:not(.other-month)').forEach(day => {
      day.addEventListener('click', (e) => {
        const date = day.dataset.date;
        if (date) this._createNewEvent(container, date);
      });
    });

    // 일정 항목 클릭
    container.querySelectorAll('.calendar-event-item').forEach(item => {
      const editBtn = item.querySelector('[data-action="edit"]');
      const deleteBtn = item.querySelector('[data-action="delete"]');

      editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._editEvent(item.dataset.eventId, container);
      });

      deleteBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('이 일정을 삭제하시겠습니까?')) {
          await this._deleteEvent(item.dataset.eventId, container);
        }
      });
    });
  }

  async _changeMonth(container, delta) {
    const currentYear = parseInt(container.dataset.currentYear);
    const currentMonth = parseInt(container.dataset.currentMonth);

    const newDate = new Date(currentYear, currentMonth + delta, 1);
    const newYear = newDate.getFullYear();
    const newMonth = newDate.getMonth();

    container.dataset.currentYear = newYear;
    container.dataset.currentMonth = newMonth;

    await this._refreshCalendar(container, newYear, newMonth);
  }

  async _refreshCalendar(container, year, month) {
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const response = await this.apiClient.post('/tools/builtin/get_events', {
      start_date: startDate, end_date: endDate
    });

    const events = response.events || [];

    container.querySelector('#calendarCurrentMonth').textContent = `${year}년 ${month + 1}월`;
    container.querySelector('#calendarGrid').innerHTML = this._renderCalendarGrid(year, month, events);

    const eventList = container.querySelector('#calendarEventList');
    eventList.innerHTML = `
      <h3>이번 달 일정</h3>
      ${events.length === 0 ? `<div class="calendar-empty"><p>일정이 없습니다</p></div>` : events.map(event => this._renderEventItem(event)).join('')}
    `;

    this._attachEventListeners(container);
  }

  async _createNewEvent(container, defaultDate = null) {
    const date = defaultDate || new Date().toISOString().split('T')[0];

    // 인라인 폼 표시
    const eventList = container.querySelector('#calendarEventList');
    if (!eventList) return;

    // 기존 폼이 있으면 제거
    const existingForm = container.querySelector('.calendar-inline-form');
    if (existingForm) existingForm.remove();

    const form = document.createElement('div');
    form.className = 'calendar-inline-form';
    form.innerHTML = `
      <input type="text" class="calendar-form-input" id="calEventTitle" placeholder="일정 제목" autofocus>
      <input type="datetime-local" class="calendar-form-datetime" id="calEventStart" value="${date}T09:00">
      <div class="calendar-form-actions">
        <button class="calendar-form-save" id="calEventSave">추가</button>
        <button class="calendar-form-cancel" id="calEventCancel">취소</button>
      </div>
    `;
    eventList.prepend(form);

    const titleInput = form.querySelector('#calEventTitle');
    const startInput = form.querySelector('#calEventStart');
    titleInput?.focus();

    form.querySelector('#calEventSave')?.addEventListener('click', async () => {
      const title = titleInput?.value?.trim();
      if (!title) { titleInput?.focus(); return; }
      const start = startInput?.value?.replace('T', ' ') || `${date} 09:00`;
      try {
        const response = await this.apiClient.post('/tools/builtin/create_event', {
          title, start, description: '', location: ''
        });
        if (response.success) {
          this.showToast('일정이 추가되었습니다', 1500);
          const year = parseInt(container.dataset.currentYear);
          const month = parseInt(container.dataset.currentMonth);
          await this._refreshCalendar(container, year, month);
        }
      } catch (error) {
        console.error('일정 추가 실패:', error);
        this.showToast('일정 추가에 실패했습니다');
      }
    });

    form.querySelector('#calEventCancel')?.addEventListener('click', () => form.remove());
    titleInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') form.querySelector('#calEventSave')?.click();
      if (e.key === 'Escape') form.remove();
    });
  }

  async _editEvent(eventId, container) {
    // 인라인 편집: 이벤트 카드를 편집 모드로 전환
    const eventEl = container.querySelector(`[data-event-id="${eventId}"]`);
    if (!eventEl) return;

    const currentTitle = eventEl.querySelector('.event-title')?.textContent || '';
    const originalContent = eventEl.innerHTML;

    eventEl.innerHTML = `
      <input type="text" class="calendar-form-input calendar-edit-input" value="${this._escapeHtml(currentTitle)}" autofocus>
      <div class="calendar-form-actions" style="margin-top:0.5rem;">
        <button class="calendar-form-save cal-edit-save">저장</button>
        <button class="calendar-form-cancel cal-edit-cancel">취소</button>
      </div>
    `;

    const input = eventEl.querySelector('.calendar-edit-input');
    input?.focus();
    input?.select();

    eventEl.querySelector('.cal-edit-save')?.addEventListener('click', async () => {
      const title = input?.value?.trim();
      if (!title) { input?.focus(); return; }
      try {
        await this.apiClient.post('/tools/builtin/update_event', {
          event_id: eventId, title
        });
        this.showToast('일정이 수정되었습니다', 1500);
        const year = parseInt(container.dataset.currentYear);
        const month = parseInt(container.dataset.currentMonth);
        await this._refreshCalendar(container, year, month);
      } catch (error) {
        console.error('일정 수정 실패:', error);
        this.showToast('수정에 실패했습니다');
        eventEl.innerHTML = originalContent;
      }
    });

    eventEl.querySelector('.cal-edit-cancel')?.addEventListener('click', () => {
      eventEl.innerHTML = originalContent;
      this._attachEventListeners(container);
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') eventEl.querySelector('.cal-edit-save')?.click();
      if (e.key === 'Escape') eventEl.querySelector('.cal-edit-cancel')?.click();
    });
  }

  async _deleteEvent(eventId, container) {
    try {
      await this.apiClient.post('/tools/builtin/delete_event', {
        event_id: eventId
      });

      this.showToast('일정이 삭제되었습니다', 1500);
      const year = parseInt(container.dataset.currentYear);
      const month = parseInt(container.dataset.currentMonth);
      await this._refreshCalendar(container, year, month);
    } catch (error) {
      console.error('일정 삭제 실패:', error);
      alert('일정 삭제에 실패했습니다');
    }
  }

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
