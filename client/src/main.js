/**
 * Soul UI - Main JavaScript Entry Point
 * Vanilla JS Implementation
 */

import { ThemeManager } from './utils/theme-manager.js';
import { ChatManager } from './utils/chat-manager.js';
import { PanelManager } from './utils/panel-manager.js';
import { MenuManager } from './utils/menu-manager.js';
import { APIClient } from './utils/api-client.js';

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

      notificationBtn: document.getElementById('notificationBtn'),
      userBtn: document.getElementById('userBtn'),
      settingsBtn: document.getElementById('settingsBtn'),

      chatForm: document.getElementById('chatForm'),
      messageInput: document.getElementById('messageInput'),
      sendBtn: document.getElementById('sendBtn'),
      messagesArea: document.getElementById('messagesArea'),

      rightPanel: document.getElementById('rightPanel'),
      closePanelBtn: document.getElementById('closePanelBtn'),
      panelTitle: document.getElementById('panelTitle'),
      panelContent: document.getElementById('panelContent'),

      chatContainer: document.getElementById('chatContainer'),
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
    this.apiClient = new APIClient();
    this.themeManager = new ThemeManager();
    this.chatManager = new ChatManager(this.apiClient);
    this.panelManager = new PanelManager(this.apiClient);
    this.menuManager = new MenuManager();

    // Load user profile and theme
    await this.loadUserProfile();

    // Setup event listeners
    this.setupEventListeners();

    // Load recent messages (마지막 대화 위치)
    await this.chatManager.loadRecentMessages();

    // Check for unread notifications
    await this.checkNotifications();

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

        // Update user name in header
        if (profile.name) {
          this.elements.userBtn.querySelector('.user-name').textContent = profile.name;
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

  async checkNotifications() {
    try {
      const notifications = await this.apiClient.getNotifications({ unreadOnly: true });
      const unreadCount = notifications.filter(n => !n.read).length;

      if (unreadCount > 0) {
        const badge = this.elements.notificationBtn.querySelector('.badge');
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
      }
    } catch (error) {
      console.warn('알림 확인 실패:', error);
    }
  }

  setupEventListeners() {
    // Hamburger menu
    this.elements.hamburgerBtn.addEventListener('click', () => this.toggleMenu());
    this.elements.closeMenuBtn.addEventListener('click', () => this.closeMenu());
    this.elements.menuOverlay.addEventListener('click', () => this.closeMenu());

    // Main menu items
    this.elements.mainMenuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const menuType = item.dataset.menu;
        if (menuType) {
          this.menuManager.switchMenu(menuType);
        }
      });
    });

    // Header buttons
    this.elements.notificationBtn.addEventListener('click', () => {
      this.openPanel('notifications');
    });

    this.elements.userBtn.addEventListener('click', () => {
      // TODO: User menu dropdown
      console.log('사용자 메뉴 (구현 예정)');
    });

    this.elements.settingsBtn.addEventListener('click', () => {
      this.openPanel('settings');
    });

    // Close panel button
    this.elements.closePanelBtn.addEventListener('click', () => this.closePanel());

    // Chat form submit (handles both button click and Enter key)
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

    // ESC key to close menu/panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.elements.mainMenu.classList.contains('open')) {
          this.closeMenu();
        }
        if (this.elements.rightPanel.classList.contains('open')) {
          this.closePanel();
        }
      }
    });

    // Prevent body scroll when menu is open (mobile)
    this.elements.mainMenu.addEventListener('scroll', (e) => {
      e.stopPropagation();
    });
    this.elements.subMenu.addEventListener('scroll', (e) => {
      e.stopPropagation();
    });
    this.elements.rightPanel.addEventListener('scroll', (e) => {
      e.stopPropagation();
    });

    // Sub-menu resizer
    this.elements.subMenuResizer.addEventListener('mousedown', (e) => {
      this.startResize(e);
    });

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
