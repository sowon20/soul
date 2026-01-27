/**
 * Menu Manager
 * 2단 슬라이딩 메뉴 관리
 */

import dashboardManager from '../../utils/dashboard-manager.js';

export class MenuManager {
  constructor() {
    this.mainMenu = document.getElementById('mainMenu');
    this.subMenu = document.getElementById('subMenu');
    this.subMenuContent = document.getElementById('subMenuContent');
    this.menuOverlay = document.getElementById('menuOverlay');
    this.currentMenu = 'dashboard';

    // 메뉴 컨텐츠 정의
    this.menuContents = {
      dashboard: {
        title: '대시보드',
        render: () => this.renderDashboard(),
      },
      conversations: {
        title: '대화 목록',
        render: () => this.renderConversations(),
      },
      search: {
        title: '통합 검색',
        render: () => this.renderSearch(),
      },
      memory: {
        title: '메모리 탐색',
        render: () => this.renderMemory(),
      },
      files: {
        title: '파일 관리',
        render: () => this.renderFiles(),
      },
      profile: {
        title: '프로필',
        render: () => this.renderProfile(),
      },
      roles: {
        title: '역할 관리',
        render: () => this.renderRoles(),
      },
      mcp: {
        title: 'MCP 도구',
        render: () => this.renderMCP(),
      },
      aiSettings: {
        title: 'AI 설정',
        render: () => this.renderAISettings(),
      },
      settings: {
        title: '설정',
        render: () => this.renderSettings(),
      },
    };
  }

  /**
   * 메뉴 열기
   */
  open() {
    this.mainMenu.classList.add('open');
    this.subMenu.classList.add('open');
    this.menuOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';

    // 현재 선택된 메뉴 컨텐츠 렌더링
    this.switchMenu(this.currentMenu);
  }

  /**
   * 메뉴 닫기
   */
  close() {
    this.mainMenu.classList.remove('open');
    this.subMenu.classList.remove('open');
    this.menuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /**
   * 메뉴 전환
   * @param {string} menuType
   */
  switchMenu(menuType) {
    if (!this.menuContents[menuType]) {
      console.warn(`알 수 없는 메뉴: ${menuType}`);
      return;
    }

    this.currentMenu = menuType;

    // Active 상태 업데이트
    document.querySelectorAll('.main-menu-item').forEach(item => {
      if (item.dataset.menu === menuType) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 서브 메뉴 컨텐츠 렌더링
    const content = this.menuContents[menuType];
    content.render();
  }

  /* ===================================
     메뉴 컨텐츠 렌더링
     =================================== */

  renderDashboard() {
    this.subMenuContent.innerHTML = `
      <div class="dashboard">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          대시보드
        </h2>

        <div class="dashboard-grid" style="display: grid; gap: 1rem;">
          <!-- 토큰 통계 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              토큰 사용량
            </h3>
            <div style="font-size: var(--font-size-sm); line-height: 1.8; opacity: 0.9;">
              <p>현재 세션: <span id="stat-tokens">-</span></p>
            </div>
          </div>

          <!-- 최근 활동 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              최근 활동
            </h3>
            <p style="font-size: var(--font-size-sm); opacity: 0.8;">
              활동 기록이 없습니다.
            </p>
          </div>

          <!-- 빠른 액션 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              빠른 액션
            </h3>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button class="action-btn" style="padding: 0.75rem; background: rgba(255, 255, 255, 0.2); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; font-size: var(--font-size-sm); font-weight: 400; transition: all 0.2s;">
                새 대화 시작
              </button>
              <button class="action-btn" style="padding: 0.75rem; background: rgba(255, 255, 255, 0.12); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; font-size: var(--font-size-sm); font-weight: 400; transition: all 0.2s;">
                메모리 검색
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 대시보드를 열 때만 토큰 통계 로드
    dashboardManager.loadTokenStats();
  }

  renderConversations() {
    this.subMenuContent.innerHTML = `
      <div class="conversations">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          대화 목록
        </h2>
        <div class="conversation-list">
          <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
            저장된 대화가 없습니다.
          </p>
        </div>
      </div>
    `;
  }

  renderSearch() {
    this.subMenuContent.innerHTML = `
      <div class="search">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          통합 검색
        </h2>
        <input
          type="text"
          placeholder="검색어 입력..."
          style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: var(--font-size-base); margin-bottom: 1rem;"
        >
        <div style="margin-top: 1rem;">
          <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center;">
            검색 결과가 여기에 표시됩니다.
          </p>
        </div>
      </div>
    `;
  }

  async renderMemory() {
    this.subMenuContent.innerHTML = '<div class="loading" style="padding: 2rem; text-align: center;">메모리 관리자 로딩 중...</div>';

    try {
      const { MemoryManager } = await import('../memory/memory-manager.js');
      await import('../memory/memory-manager.css', { assert: { type: 'css' } }).catch(() => {
        // CSS import fallback - link tag로 추가
        if (!document.querySelector('link[href*="memory-manager.css"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = '/src/components/memory/memory-manager.css';
          document.head.appendChild(link);
        }
      });
      
      const memoryManager = new MemoryManager(window.soulApp.apiClient);
      await memoryManager.render(this.subMenuContent);
    } catch (error) {
      console.error('Memory Manager 로드 실패:', error);
      this.subMenuContent.innerHTML = `
        <div style="padding: 2rem; text-align: center;">
          <p style="color: #ef4444; margin-bottom: 1rem;">메모리 관리자를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
        </div>
      `;
    }
  }

  renderFiles() {
    this.subMenuContent.innerHTML = `
      <div class="files">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          파일 관리
        </h2>
        <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
          파일이 없습니다.
        </p>
      </div>
    `;
  }

  async renderRoles() {
    // 역할 관리 UI 렌더링
    this.subMenuContent.innerHTML = '<div class="loading">역할 관리 로딩 중...</div>';

    try {
      const roleManager = window.roleManager;
      if (roleManager) {
        const roleUI = await roleManager.render();
        this.subMenuContent.innerHTML = '';
        this.subMenuContent.appendChild(roleUI);
      } else {
        this.subMenuContent.innerHTML = `
          <div class="error">
            <p>역할 관리자를 초기화할 수 없습니다.</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('역할 UI 렌더링 실패:', error);
      this.subMenuContent.innerHTML = `
        <div class="error">
          <p>역할 관리 UI를 불러오는데 실패했습니다.</p>
          <p style="font-size: var(--font-size-sm); opacity: 0.7;">${error.message}</p>
        </div>
      `;
    }
  }

  async renderMCP() {
    // MCP Manager 로드
    this.subMenuContent.innerHTML = '<div class="loading" style="padding: 2rem; text-align: center;">MCP 관리자 로딩 중...</div>';

    try {
      const { MCPManager } = await import('../mcp/mcp-manager.js');
      const mcpManager = new MCPManager(window.soulApp.apiClient);

      // MCP Manager 렌더링
      await mcpManager.render(this.subMenuContent);
    } catch (error) {
      console.error('MCP Manager 로드 실패:', error);
      this.subMenuContent.innerHTML = `
        <div style="padding: 2rem; text-align: center;">
          <p style="color: #ef4444; margin-bottom: 1rem;">MCP 관리자를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
        </div>
      `;
    }
  }

  renderSettings() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'default';
    const currentFontSize = document.documentElement.getAttribute('data-font-size') || 'md';

    // Get current glass intensity and background image from localStorage
    const savedGlassIntensity = window.soulApp.themeManager.getFromLocalStorage('glassIntensity', 'medium');
    const savedBackgroundImage = window.soulApp.themeManager.getFromLocalStorage('backgroundImage', '');

    this.subMenuContent.innerHTML = `
      <div class="settings">
        <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem;">
          설정
        </h2>

        <!-- 테마 설정 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            테마
          </h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
            ${['default', 'basic', 'dark', 'ocean', 'forest', 'sunset']
              .map(
                (theme) => `
              <button
                class="theme-btn"
                data-theme="${theme}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${
                  theme === currentTheme ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${theme}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- 글씨 크기 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            글씨 크기
          </h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${['xs', 'sm', 'md', 'lg', 'xl']
              .map(
                (size) => `
              <button
                class="font-size-btn"
                data-size="${size}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${
                  size === currentFontSize ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${size.toUpperCase()}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- 유리 효과 강도 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            유리 효과 강도
          </h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${['low', 'medium', 'high']
              .map(
                (intensity) => `
              <button
                class="glass-intensity-btn"
                data-intensity="${intensity}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${
                  intensity === savedGlassIntensity ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${intensity === 'low' ? '낮음' : intensity === 'medium' ? '중간' : '높음'}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- 배경 이미지 -->
        <div>
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            배경 이미지
          </h3>
          <input
            type="text"
            id="backgroundImageInput"
            placeholder="이미지 URL 입력..."
            value="${savedBackgroundImage}"
            style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.9375rem; margin-bottom: 0.75rem;"
          >
          <button
            id="applyBackgroundBtn"
            style="width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.15); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
          >
            배경 적용
          </button>
          ${savedBackgroundImage ? `
            <button
              id="removeBackgroundBtn"
              style="width: 100%; padding: 0.75rem; background: rgba(220, 104, 104, 0.2); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s; margin-top: 0.5rem;"
            >
              배경 제거
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // 이벤트 리스너 추가
    this.attachSettingsListeners();
  }

  /**
   * 설정 패널 이벤트 리스너
   */
  attachSettingsListeners() {
    // API Key save button
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiKeyInput = document.getElementById('anthropicApiKeyInput');
    const apiKeyStatus = document.getElementById('apiKeyStatus');

    if (saveApiKeyBtn && apiKeyInput) {
      saveApiKeyBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
          apiKeyStatus.innerHTML = '<span style="color: #fbbf24;">⚠️ API 키를 입력해주세요</span>';
          return;
        }

        if (!apiKey.startsWith('sk-ant-')) {
          apiKeyStatus.innerHTML = '<span style="color: #fbbf24;">⚠️ Anthropic API 키 형식이 아닙니다</span>';
          return;
        }

        try {
          apiKeyStatus.innerHTML = '<span style="opacity: 0.7;">⏳ 저장 중...</span>';
          saveApiKeyBtn.disabled = true;

          // Save to backend
          const response = await fetch('/api/config/api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service: 'anthropic',
              apiKey: apiKey
            })
          });

          if (!response.ok) {
            throw new Error('API 키 저장 실패');
          }

          apiKeyStatus.innerHTML = '<span style="color: #10b981;">✅ API 키가 저장되었습니다 (즉시 적용)</span>';
          apiKeyInput.value = '';

          // 성공 메시지 유지
          setTimeout(() => {
            apiKeyStatus.innerHTML = '<span style="color: #60a5fa;">💡 재시작 없이 바로 사용 가능합니다</span>';
          }, 2000);

        } catch (error) {
          apiKeyStatus.innerHTML = `<span style="color: #ef4444;">❌ ${error.message}</span>`;
        } finally {
          saveApiKeyBtn.disabled = false;
        }
      });

      // Enter key to save
      apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveApiKeyBtn.click();
        }
      });
    }

    // 테마 버튼
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        window.soulApp.themeManager.applyTheme(theme);
        this.renderSettings(); // 다시 렌더링하여 active 상태 업데이트
      });
    });

    // 글씨 크기 버튼
    document.querySelectorAll('.font-size-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const size = btn.dataset.size;
        window.soulApp.themeManager.setFontSize(size);
        this.renderSettings();
      });
    });

    // 유리 효과 강도 버튼
    document.querySelectorAll('.glass-intensity-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const intensity = btn.dataset.intensity;
        window.soulApp.themeManager.setGlassIntensity(intensity);
        this.renderSettings();
      });
    });

    // 배경 이미지 적용 버튼
    const applyBackgroundBtn = document.getElementById('applyBackgroundBtn');
    if (applyBackgroundBtn) {
      applyBackgroundBtn.addEventListener('click', () => {
        const url = document.getElementById('backgroundImageInput').value.trim();
        if (url) {
          window.soulApp.themeManager.setBackgroundImage(url);
          this.renderSettings();
        }
      });
    }

    // 배경 이미지 제거 버튼
    const removeBackgroundBtn = document.getElementById('removeBackgroundBtn');
    if (removeBackgroundBtn) {
      removeBackgroundBtn.addEventListener('click', () => {
        window.soulApp.themeManager.removeBackgroundImage();
        this.renderSettings();
      });
    }

    // Enter 키로 배경 적용
    const backgroundInput = document.getElementById('backgroundImageInput');
    if (backgroundInput) {
      backgroundInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const url = e.target.value.trim();
          if (url) {
            window.soulApp.themeManager.setBackgroundImage(url);
            this.renderSettings();
          }
        }
      });
    }
  }

  /**
   * AI 설정 렌더링 - SettingsManager 사용
   */
  async renderAISettings() {
    // Settings 프레임워크 로드
    this.subMenuContent.innerHTML = '<div class="loading">AI 설정 로딩 중...</div>';

    try {
      const { SettingsManager } = await import('../../settings/settings-manager.js');
      const settingsManager = new SettingsManager(window.soulApp.apiClient);

      // Settings 프레임워크를 subMenuContent에 렌더링하고 'ai' 페이지 표시
      await settingsManager.render(this.subMenuContent, 'ai');
    } catch (error) {
      console.error('AI 설정 로드 실패:', error);
      this.subMenuContent.innerHTML = `
        <div style="padding: 2rem; text-align: center;">
          <p style="color: #ef4444; margin-bottom: 1rem;">AI 설정을 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
        </div>
      `;
    }
  }

  // 기존 하드코딩 UI 백업 (필요시 복구)
  renderAISettingsOld() {
    this.subMenuContent.innerHTML = `
      <div style="padding: 1.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 2rem;">
          🤖 AI 설정
        </h2>

        <!-- API 키 설정 -->
        <div style="margin-bottom: 3rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: rgba(255, 255, 255, 0.95);">
            🔑 API 키 관리
          </h3>

          <!-- Anthropic -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>Anthropic Claude</span>
              <span id="anthropicStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="anthropicApiKeyInput"
              placeholder="sk-ant-api03-..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveAnthropicKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteAnthropicKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="anthropicKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <!-- OpenAI -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>OpenAI GPT</span>
              <span id="openaiStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="openaiApiKeyInput"
              placeholder="sk-..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveOpenaiKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteOpenaiKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="openaiKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <!-- Google -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>Google Gemini</span>
              <span id="googleStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="googleApiKeyInput"
              placeholder="AIza..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveGoogleKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteGoogleKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="googleKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://makersuite.google.com/app/apikey" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <!-- xAI -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>xAI Grok</span>
              <span id="xaiStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="xaiApiKeyInput"
              placeholder="xai-..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveXaiKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteXaiKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="xaiKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://console.x.ai/" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <div style="padding: 1rem; background: rgba(96, 165, 250, 0.1); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.2);">
            <p style="font-size: 0.8125rem; opacity: 0.9; line-height: 1.6;">
              💡 API 키는 서버에 AES-256-CBC 암호화되어 저장됩니다.<br>
              서버 재시작 없이 즉시 적용되며, 안전하게 관리됩니다.
            </p>
          </div>
        </div>

        <!-- 모델 설정 -->
        <div style="margin-bottom: 3rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: rgba(255, 255, 255, 0.95);">
            🎯 모델 설정
          </h3>

          <div style="padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <label style="display: block; margin-bottom: 0.75rem; font-size: 0.875rem; opacity: 0.9;">
              AI 서비스 선택
            </label>
            <select
              id="defaultServiceSelect"
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 1rem;"
            >
              <option value="">-- 서비스를 선택하세요 --</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">OpenAI GPT</option>
              <option value="google">Google Gemini</option>
              <option value="xai">xAI Grok</option>
            </select>

            <label style="display: block; margin-bottom: 0.75rem; font-size: 0.875rem; opacity: 0.9;">
              모델 선택
            </label>
            <select
              id="defaultModelSelect"
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem;"
              disabled
            >
              <option value="">-- 먼저 서비스를 선택하세요 --</option>
            </select>

            <div id="modelSelectStatus" style="margin-top: 1rem; font-size: 0.8125rem; text-align: center;"></div>

            <button
              id="saveDefaultModelBtn"
              style="width: 100%; padding: 0.875rem; margin-top: 1rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              disabled
            >
              기본 모델 저장
            </button>

            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              일반 대화에 사용할 기본 모델을 선택하세요. 서비스별로 사용 가능한 최신 모델만 표시됩니다.
            </p>
          </div>
        </div>

        <!-- AI 서비스 관리 -->
        <div style="margin-bottom: 3rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.25rem; font-weight: 600; margin: 0; color: rgba(255, 255, 255, 0.95);">
              🔌 AI 서비스 관리
            </h3>
            <button
              id="addServiceBtn"
              style="padding: 0.5rem 1rem; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
            >
              + 서비스 추가
            </button>
          </div>

          <div id="servicesContainer" style="display: grid; gap: 1rem;">
            <!-- 서비스 카드들이 여기 렌더링됨 -->
          </div>
        </div>

        <!-- 시스템 프롬프트 -->
        <div style="margin-bottom: 3rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: rgba(255, 255, 255, 0.95);">
            📝 시스템 프롬프트
          </h3>

          <div style="padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <textarea
              id="systemPromptTextarea"
              placeholder="AI의 기본 성격과 역할을 정의하세요..."
              style="width: 100%; min-height: 200px; padding: 1rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; resize: vertical; font-family: 'Courier New', monospace; line-height: 1.6;"
            >당신은 친절하고 도움이 되는 AI 어시스턴트입니다.</textarea>
            <button
              id="saveSystemPromptBtn"
              style="width: 100%; padding: 0.875rem; margin-top: 1rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
            >
              시스템 프롬프트 저장
            </button>
            <div id="systemPromptStatus" style="margin-top: 0.75rem; font-size: 0.8125rem; text-align: center;"></div>
          </div>
        </div>
      </div>
    `;

    // 이벤트 리스너 추가
    this.attachAISettingsListeners();
  }

  /**
   * AI 설정 이벤트 리스너
   */
  attachAISettingsListeners() {
    // API 키 저장/삭제 핸들러
    const setupAPIKeyButtons = (service, inputId, saveBtnId, deleteBtnId, statusId, statusSpanId) => {
      const saveBtn = document.getElementById(saveBtnId);
      const deleteBtn = document.getElementById(deleteBtnId);
      const input = document.getElementById(inputId);
      const status = document.getElementById(statusId);
      const statusSpan = document.getElementById(statusSpanId);

      // API 키 상태 확인
      fetch(`/api/config/api-key/${service}`)
        .then(res => res.json())
        .then(data => {
          if (data.configured) {
            statusSpan.textContent = '설정됨';
            statusSpan.style.background = 'rgba(16, 185, 129, 0.2)';
            statusSpan.style.color = '#10b981';
          }
        })
        .catch(() => {});

      // 저장 버튼
      if (saveBtn && input) {
        saveBtn.addEventListener('click', async () => {
          const apiKey = input.value.trim();

          if (!apiKey) {
            status.innerHTML = '<span style="color: #fbbf24;">⚠️ API 키를 입력해주세요</span>';
            return;
          }

          try {
            // 1단계: API 키 검증
            status.innerHTML = '<span style="opacity: 0.7;">⏳ API 키 검증 중...</span>';
            saveBtn.disabled = true;

            const validateResponse = await fetch('/api/config/api-key/validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ service, apiKey })
            });

            const validateResult = await validateResponse.json();

            if (!validateResult.success) {
              throw new Error(validateResult.message || 'API 키가 유효하지 않습니다');
            }

            // 2단계: 검증 성공 시 저장
            status.innerHTML = '<span style="opacity: 0.7;">⏳ 저장 중...</span>';

            const response = await fetch('/api/config/api-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ service, apiKey })
            });

            if (!response.ok) throw new Error('저장 실패');

            status.innerHTML = '<span style="color: #10b981;">✅ 저장되었습니다</span>';
            input.value = '';
            statusSpan.textContent = '설정됨';
            statusSpan.style.background = 'rgba(16, 185, 129, 0.2)';
            statusSpan.style.color = '#10b981';

            setTimeout(() => {
              status.innerHTML = '<span style="color: #60a5fa;">💡 재시작 없이 바로 사용 가능</span>';
            }, 2000);
          } catch (error) {
            status.innerHTML = `<span style="color: #ef4444;">❌ ${error.message}</span>`;
          } finally {
            saveBtn.disabled = false;
          }
        });
      }

      // 삭제 버튼
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(`${service} API 키를 삭제하시겠습니까?`)) return;

          try {
            status.innerHTML = '<span style="opacity: 0.7;">⏳ 삭제 중...</span>';
            deleteBtn.disabled = true;

            const response = await fetch(`/api/config/api-key/${service}`, {
              method: 'DELETE'
            });

            if (!response.ok) throw new Error('삭제 실패');

            status.innerHTML = '<span style="color: #10b981;">✅ 삭제되었습니다</span>';
            statusSpan.textContent = '미설정';
            statusSpan.style.background = 'rgba(96, 165, 250, 0.2)';
            statusSpan.style.color = 'rgba(255, 255, 255, 0.9)';

            setTimeout(() => { status.innerHTML = ''; }, 3000);
          } catch (error) {
            status.innerHTML = `<span style="color: #ef4444;">❌ ${error.message}</span>`;
          } finally {
            deleteBtn.disabled = false;
          }
        });
      }
    };

    // 각 서비스별 버튼 설정
    setupAPIKeyButtons('anthropic', 'anthropicApiKeyInput', 'saveAnthropicKeyBtn', 'deleteAnthropicKeyBtn', 'anthropicKeyStatus', 'anthropicStatus');
    setupAPIKeyButtons('openai', 'openaiApiKeyInput', 'saveOpenaiKeyBtn', 'deleteOpenaiKeyBtn', 'openaiKeyStatus', 'openaiStatus');
    setupAPIKeyButtons('google', 'googleApiKeyInput', 'saveGoogleKeyBtn', 'deleteGoogleKeyBtn', 'googleKeyStatus', 'googleStatus');
    setupAPIKeyButtons('xai', 'xaiApiKeyInput', 'saveXaiKeyBtn', 'deleteXaiKeyBtn', 'xaiKeyStatus', 'xaiStatus');

    // 기본 모델 선택 - 서비스 선택 시 모델 목록 로드
    const defaultServiceSelect = document.getElementById('defaultServiceSelect');
    const defaultModelSelect = document.getElementById('defaultModelSelect');
    const saveDefaultModelBtn = document.getElementById('saveDefaultModelBtn');
    const modelSelectStatus = document.getElementById('modelSelectStatus');

    if (defaultServiceSelect && defaultModelSelect) {
      defaultServiceSelect.addEventListener('change', async (e) => {
        const service = e.target.value;

        if (!service) {
          defaultModelSelect.disabled = true;
          defaultModelSelect.innerHTML = '<option value="">-- 먼저 서비스를 선택하세요 --</option>';
          saveDefaultModelBtn.disabled = true;
          modelSelectStatus.innerHTML = '';
          return;
        }

        try {
          modelSelectStatus.innerHTML = '<span style="opacity: 0.7;">⏳ 모델 목록 불러오는 중...</span>';
          defaultModelSelect.disabled = true;

          const response = await fetch(`/api/config/models/${service}`);
          const result = await response.json();

          if (!result.success || !result.models || result.models.length === 0) {
            throw new Error(result.error || '모델 목록을 불러올 수 없습니다');
          }

          // 모델 드롭다운 업데이트
          defaultModelSelect.innerHTML = result.models
            .map(m => `<option value="${m.id}">${m.name}${m.description ? ' - ' + m.description : ''}</option>`)
            .join('');

          defaultModelSelect.disabled = false;
          saveDefaultModelBtn.disabled = false;
          modelSelectStatus.innerHTML = `<span style="color: #10b981;">✅ ${result.models.length}개 모델 로드됨</span>`;

          setTimeout(() => {
            modelSelectStatus.innerHTML = '';
          }, 3000);
        } catch (error) {
          defaultModelSelect.innerHTML = '<option value="">모델을 불러올 수 없습니다</option>';
          defaultModelSelect.disabled = true;
          saveDefaultModelBtn.disabled = true;
          modelSelectStatus.innerHTML = `<span style="color: #ef4444;">❌ ${error.message}</span>`;
        }
      });
    }

    // 기본 모델 저장
    if (saveDefaultModelBtn && defaultServiceSelect && defaultModelSelect) {
      saveDefaultModelBtn.addEventListener('click', async () => {
        const service = defaultServiceSelect.value;
        const model = defaultModelSelect.value;

        if (!service || !model) {
          modelSelectStatus.innerHTML = '<span style="color: #fbbf24;">⚠️ 서비스와 모델을 선택해주세요</span>';
          return;
        }

        try {
          modelSelectStatus.innerHTML = '<span style="opacity: 0.7;">⏳ 저장 중...</span>';
          saveDefaultModelBtn.disabled = true;

          const response = await fetch('/api/config/ai/default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service, model })
          });

          if (!response.ok) throw new Error('저장 실패');

          modelSelectStatus.innerHTML = '<span style="color: #10b981;">✅ 기본 모델이 저장되었습니다</span>';

          setTimeout(() => {
            modelSelectStatus.innerHTML = '';
          }, 3000);
        } catch (error) {
          modelSelectStatus.innerHTML = `<span style="color: #ef4444;">❌ ${error.message}</span>`;
        } finally {
          saveDefaultModelBtn.disabled = false;
        }
      });
    }

    // 시스템 프롬프트 저장
    const saveSystemPromptBtn = document.getElementById('saveSystemPromptBtn');
    const systemPromptTextarea = document.getElementById('systemPromptTextarea');
    const systemPromptStatus = document.getElementById('systemPromptStatus');

    if (saveSystemPromptBtn && systemPromptTextarea) {
      saveSystemPromptBtn.addEventListener('click', async () => {
        const prompt = systemPromptTextarea.value.trim();

        if (!prompt) {
          systemPromptStatus.innerHTML = '<span style="color: #fbbf24;">⚠️ 프롬프트를 입력해주세요</span>';
          return;
        }

        try {
          systemPromptStatus.innerHTML = '<span style="opacity: 0.7;">⏳ 저장 중...</span>';
          saveSystemPromptBtn.disabled = true;

          // TODO: 시스템 프롬프트 저장 API 호출

          systemPromptStatus.innerHTML = '<span style="color: #10b981;">✅ 저장되었습니다</span>';
          setTimeout(() => {
            systemPromptStatus.innerHTML = '';
          }, 3000);
        } catch (error) {
          systemPromptStatus.innerHTML = `<span style="color: #ef4444;">❌ ${error.message}</span>`;
        } finally {
          saveSystemPromptBtn.disabled = false;
        }
      });
    }

    // AI 서비스 관리
    this.loadAIServices();

    // 서비스 추가 버튼
    const addServiceBtn = document.getElementById('addServiceBtn');
    if (addServiceBtn) {
      addServiceBtn.addEventListener('click', () => {
        this.showAddServiceModal();
      });
    }
  }

  /**
   * AI 서비스 목록 로드
   */
  async loadAIServices() {
    const container = document.getElementById('servicesContainer');
    if (!container) return;

    try {
      const response = await fetch('/api/ai-services');
      const data = await response.json();

      if (!data.success || !data.services) {
        throw new Error('서비스 목록을 불러올 수 없습니다');
      }

      container.innerHTML = data.services.map(service => this.renderServiceCard(service)).join('');

      // 각 서비스 카드에 이벤트 리스너 추가
      data.services.forEach(service => {
        this.attachServiceCardListeners(service);
      });
    } catch (error) {
      container.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 2rem;">❌ ${error.message}</p>`;
    }
  }

  /**
   * 서비스 카드 렌더링
   */
  renderServiceCard(service) {
    const statusColor = service.isActive ? '#10b981' : '#6b7280';
    const statusText = service.isActive ? '활성' : '비활성';
    const builtInBadge = service.isBuiltIn
      ? '<span style="padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 4px; font-size: 0.75rem; color: #60a5fa;">기본</span>'
      : '';

    return `
      <div class="service-card" data-service-id="${service.id}" style="padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
              <h4 style="margin: 0; font-size: 1rem; font-weight: 600;">${service.name}</h4>
              ${builtInBadge}
              <span style="padding: 0.25rem 0.5rem; background: rgba(${statusColor === '#10b981' ? '16, 185, 129' : '107, 114, 128'}, 0.2); border: 1px solid ${statusColor}; border-radius: 4px; font-size: 0.75rem; color: ${statusColor};">${statusText}</span>
            </div>
            <p style="margin: 0; font-size: 0.8125rem; opacity: 0.7;">${service.baseUrl}</p>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.75rem; opacity: 0.6;">
              타입: ${service.type} |
              API 키: ${service.hasApiKey ? '✓ 설정됨' : '✗ 미설정'} |
              모델: ${service.modelCount}개
            </p>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button
            class="toggle-service-btn"
            data-service-id="${service.id}"
            style="padding: 0.5rem 1rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            ${service.isActive ? '비활성화' : '활성화'}
          </button>
          <button
            class="refresh-models-btn"
            data-service-id="${service.id}"
            style="padding: 0.5rem 1rem; background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            모델 갱신
          </button>
          <button
            class="test-service-btn"
            data-service-id="${service.id}"
            style="padding: 0.5rem 1rem; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            연결 테스트
          </button>
          ${!service.isBuiltIn ? `
          <button
            class="edit-service-btn"
            data-service-id="${service.id}"
            style="padding: 0.5rem 1rem; background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            수정
          </button>
          <button
            class="delete-service-btn"
            data-service-id="${service.id}"
            style="padding: 0.5rem 1rem; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            삭제
          </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 서비스 카드 이벤트 리스너
   */
  attachServiceCardListeners(service) {
    // 토글 버튼
    const toggleBtn = document.querySelector(`.toggle-service-btn[data-service-id="${service.id}"]`);
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        try {
          const response = await fetch(`/api/ai-services/${service.id}/toggle`, { method: 'POST' });
          const data = await response.json();

          if (data.success) {
            this.loadAIServices();
          } else {
            alert(data.error || '토글 실패');
          }
        } catch (error) {
          alert('오류: ' + error.message);
        }
      });
    }

    // 모델 갱신 버튼
    const refreshBtn = document.querySelector(`.refresh-models-btn[data-service-id="${service.id}"]`);
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        try {
          refreshBtn.disabled = true;
          refreshBtn.textContent = '갱신 중...';

          const response = await fetch(`/api/ai-services/${service.id}/refresh-models`, { method: 'POST' });
          const data = await response.json();

          if (data.success) {
            alert(`✓ ${data.message}`);
            this.loadAIServices();
          } else {
            alert(data.error || '모델 갱신 실패');
          }
        } catch (error) {
          alert('오류: ' + error.message);
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent = '모델 갱신';
        }
      });
    }

    // 연결 테스트 버튼
    const testBtn = document.querySelector(`.test-service-btn[data-service-id="${service.id}"]`);
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        try {
          testBtn.disabled = true;
          testBtn.textContent = '테스트 중...';

          const response = await fetch(`/api/ai-services/${service.id}/test`, { method: 'POST' });
          const data = await response.json();

          alert(data.success ? `✓ ${data.message}` : `✗ ${data.message}`);
        } catch (error) {
          alert('오류: ' + error.message);
        } finally {
          testBtn.disabled = false;
          testBtn.textContent = '연결 테스트';
        }
      });
    }

    // 삭제 버튼
    const deleteBtn = document.querySelector(`.delete-service-btn[data-service-id="${service.id}"]`);
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`"${service.name}" 서비스를 삭제하시겠습니까?`)) return;

        try {
          const response = await fetch(`/api/ai-services/${service.id}`, { method: 'DELETE' });
          const data = await response.json();

          if (data.success) {
            alert('✓ ' + data.message);
            this.loadAIServices();
          } else {
            alert(data.error || '삭제 실패');
          }
        } catch (error) {
          alert('오류: ' + error.message);
        }
      });
    }
  }

  /**
   * 서비스 추가 모달
   */
  showAddServiceModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div class="modal-content" style="background: #ffffff; padding: 2rem; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">
        <h3 style="margin: 0 0 1.5rem 0; font-size: 1.25rem; color: #1a1a2e; font-weight: 600;">AI 서비스 추가</h3>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">서비스 ID</label>
          <input
            id="modalServiceId"
            type="text"
            placeholder="예: my-custom-ai"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">서비스 이름</label>
          <input
            id="modalServiceName"
            type="text"
            placeholder="예: My Custom AI"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">타입</label>
          <select
            id="modalServiceType"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          >
            <option value="openai-compatible">OpenAI 호환</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">Base URL</label>
          <input
            id="modalServiceUrl"
            type="text"
            placeholder="예: https://api.example.com/v1"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">API Key (선택)</label>
          <input
            id="modalServiceApiKey"
            type="password"
            placeholder="API 키가 필요한 경우 입력"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <button
            id="modalCancelBtn"
            style="flex: 1; padding: 0.75rem; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; color: #374151; font-size: 0.875rem; font-weight: 500;"
          >
            취소
          </button>
          <button
            id="modalSaveBtn"
            style="flex: 1; padding: 0.75rem; background: #10b981; border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 600;"
          >
            저장
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 모달 내용 클릭 시 이벤트 전파 중지
    const modalContent = modal.querySelector('.modal-content');
    modalContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 취소 버튼
    document.getElementById('modalCancelBtn').addEventListener('click', () => {
      modal.remove();
    });

    // 저장 버튼
    document.getElementById('modalSaveBtn').addEventListener('click', async () => {
      const serviceId = document.getElementById('modalServiceId').value.trim();
      const name = document.getElementById('modalServiceName').value.trim();
      const type = document.getElementById('modalServiceType').value;
      const baseUrl = document.getElementById('modalServiceUrl').value.trim();
      const apiKey = document.getElementById('modalServiceApiKey').value.trim();

      if (!serviceId || !name || !baseUrl) {
        alert('필수 항목을 모두 입력해주세요');
        return;
      }

      try {
        const response = await fetch('/api/ai-services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceId, name, type, baseUrl, apiKey })
        });

        const data = await response.json();

        if (data.success) {
          alert('✓ ' + data.message);
          modal.remove();
          this.loadAIServices();
        } else {
          alert(data.error || '저장 실패');
        }
      } catch (error) {
        alert('오류: ' + error.message);
      }
    });

    // 배경(오버레이) 클릭 시 닫기
    modal.addEventListener('click', () => {
      modal.remove();
    });
  }

  /**
   * 프로필 메뉴 렌더링 - Phase P
   */
  renderProfile() {
    this.subMenuContent.innerHTML = `
      <div class="profile-menu">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          프로필 관리
        </h2>

        <div class="menu-description" style="background: rgba(255, 255, 255, 0.08); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: var(--font-size-sm); line-height: 1.6; opacity: 0.9;">
          <p>개인 정보를 관리하고, Soul이 참조할 수 있는 프로필을 설정합니다.</p>
          <p style="margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.8;">
            필드를 자유롭게 추가/수정하고, Soul의 접근 권한을 설정할 수 있습니다.
          </p>
        </div>

        <div class="menu-actions" style="display: flex; flex-direction: column; gap: 0.75rem;">
          <button
            class="menu-action-btn"
            onclick="window.soulApp.panelManager.openPanel('profile')"
            style="padding: 1rem; background: rgba(96, 165, 250, 0.2); color: #ffffff; border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; font-size: var(--font-size-base); font-weight: 400; transition: all 0.2s; text-align: left;"
          >
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 1.5rem;">👤</span>
              <div>
                <div style="font-weight: 500; margin-bottom: 0.25rem;">프로필 관리</div>
                <div style="font-size: 0.875rem; opacity: 0.8;">개인 정보 및 커스텀 필드 편집</div>
              </div>
            </div>
          </button>

          <div style="background: rgba(255, 255, 255, 0.06); padding: 1rem; border-radius: 8px;">
            <h3 style="font-size: var(--font-size-base); font-weight: 500; margin-bottom: 0.75rem;">
              프로필 구성 요소
            </h3>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: var(--font-size-sm); line-height: 2; opacity: 0.9;">
              <li>✓ 기본 정보 (이름, 닉네임, 위치, 타임존)</li>
              <li>✓ 커스텀 필드 (자유롭게 추가 가능)</li>
              <li>✓ 권한 설정 (소울의 접근 범위 제어)</li>
              <li>✓ 자동 컨텍스트 포함 (대화 시 자동 참조)</li>
            </ul>
          </div>

          <div style="background: rgba(139, 92, 246, 0.15); padding: 1rem; border-radius: 8px; border: 1px solid rgba(139, 92, 246, 0.3);">
            <h3 style="font-size: var(--font-size-base); font-weight: 500; margin-bottom: 0.5rem;">
              💡 사용 팁
            </h3>
            <p style="font-size: var(--font-size-sm); line-height: 1.6; opacity: 0.9; margin: 0;">
              프로필 정보는 대화 시 소울이 자동으로 참조합니다.
              취향, 관심사, 중요한 날짜 등을 추가하면 더 개인화된 대화가 가능합니다.
            </p>
          </div>
        </div>
      </div>
    `;

    // 호버 효과
    const actionBtns = this.subMenuContent.querySelectorAll('.menu-action-btn');
    actionBtns.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(96, 165, 250, 0.3)';
        btn.style.transform = 'translateX(4px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(96, 165, 250, 0.2)';
        btn.style.transform = 'translateX(0)';
      });
    });
  }
}
