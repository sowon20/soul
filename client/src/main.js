/**
 * Soul UI - Main JavaScript Entry Point
 * Vanilla JS Implementation
 */

import './styles/chat.css';
import './styles/app-settings.css';
import { ThemeManager } from './utils/theme-manager.js';
import { ChatManager } from './components/chat/chat-manager.js?v=18';
import { PanelManager } from './components/shared/panel-manager.js';
import { MenuManager } from './components/sidebar/menu-manager.js';
import { APIClient } from './utils/api-client.js';
import { initRoleManager } from './utils/role-manager.js';
import dashboardManager from './utils/dashboard-manager.js';
import { SearchManager } from './utils/search-manager.js';
import { SoulSocketClient } from './utils/socket-client.js';

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

    console.log('✅ Soul UI 초기화 완료!');
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
    }
  }

  /**
   * Phase P 프로필 정보 로드 및 표시 (center-card 프로필 버튼)
   */
  async loadProfileImage(userId) {
    try {
      // 프로필 전체 정보 로드
      const response = await fetch(`/api/profile/p?userId=${userId}`);
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
      }
    } catch (error) {
      console.warn('프로필 정보 로드 실패:', error);
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

    // 사운드 효과 (로컬)
    const inSound = new Audio('./src/assets/sounds/in.mp3');
    const outSound = new Audio('./src/assets/sounds/out.mp3');

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
    if (buttonNum > 0) {
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
              <span class="server-indicator"></span>
              <span class="server-name">Backend</span>
              <span class="server-port">:3001</span>
            </div>
            <div class="server-item" data-service="mongodb">
              <span class="server-indicator"></span>
              <span class="server-name">MongoDB</span>
              <span class="server-port">:27017</span>
            </div>
            <div class="server-item" data-service="chroma">
              <span class="server-indicator"></span>
              <span class="server-name">ChromaDB</span>
              <span class="server-port">:8000</span>
            </div>
            <div class="server-item" data-service="ftp">
              <span class="server-indicator"></span>
              <span class="server-name">FTP</span>
              <span class="server-port">:21</span>
            </div>
            <div class="server-item" data-service="websocket">
              <span class="server-indicator" id="socketIndicator"></span>
              <span class="server-name">WebSocket</span>
              <span class="server-port">실시간</span>
            </div>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #888;">※ 개발자용 페이지입니다. 프로덕션 빌드 시 제거됩니다.</p>
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
  async initMacosDock() {
    const dock = document.querySelector('.dock');
    if (!dock) {
      console.log('❌ MacOS Dock 요소를 찾을 수 없음');
      return;
    }

    // DB에서 독 아이템 로드
    try {
      const response = await fetch('/api/config/dock');
      if (response.ok) {
        this.dockItems = await response.json();
        this.renderDock();
      }
    } catch (error) {
      console.error('독 설정 로드 실패:', error);
    }

    console.log('✅ MacOS Dock 초기화 완료');
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
          <img src="./src/assets/${item.icon}" alt="${item.name}" />
        </div>
        ${this.dockEditMode && !item.fixed ? '<div class="dock-item-remove">×</div>' : ''}
      </div>
    `).join('');

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
          console.log('마이크 열기 (미구현)');
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
                  <div>
                    <div style="font-weight: 600;">${s.type === 'built-in' ? 'Soul MCP' : s.name}</div>
                    <div style="font-size: 0.8rem; opacity: 0.7;">${s.description || ''}</div>
                    <span style="display: inline-block; margin-top: 6px; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: ${s.type === 'built-in' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 191, 36, 0.2)'}; color: ${s.type === 'built-in' ? '#4ade80' : '#fbbf24'};">
                      ${s.type === 'built-in' ? '기본 내장' : '외부'}
                    </span>
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
              </div>
            `).join('')}
          </div>
        </div>
      `;

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
                  <img src="./src/assets/${icon}" style="width: 28px; height: 28px;">
                </div>
              `).join('')}
            </div>
            <input type="hidden" name="icon" value="${server.icon || ''}">
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
      return;
    }

    // 새 탭 추가
    this.canvasTabs.push({ type, title, url });
    
    // iframe 생성
    const iframe = document.createElement('iframe');
    iframe.className = 'canvas-iframe';
    iframe.id = `canvas-iframe-${type}`;
    iframe.src = url;
    content.appendChild(iframe);

    // 탭 활성화
    this.activateCanvasTab(type);
    this.renderCanvasTabs();
    
    // 패널 열기
    panel.classList.remove('hide');
    console.log('✅ 캔버스 탭 열림:', type);
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
    // 설정은 별도 ID
    const activeIframe = type === 'settings' 
      ? document.getElementById('canvas-settings')
      : document.getElementById(`canvas-iframe-${type}`);
    if (activeIframe) activeIframe.classList.add('active');
    
    this.renderCanvasTabs();
  }

  /**
   * 탭 닫기
   */
  closeCanvasTab(type) {
    const idx = this.canvasTabs.findIndex(t => t.type === type);
    if (idx === -1) return;

    // iframe 제거 (설정은 별도 ID)
    const iframe = type === 'settings'
      ? document.getElementById('canvas-settings')
      : document.getElementById(`canvas-iframe-${type}`);
    if (iframe) iframe.remove();

    // 탭 배열에서 제거
    this.canvasTabs.splice(idx, 1);

    // 탭이 없으면 패널 닫기
    if (this.canvasTabs.length === 0) {
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
