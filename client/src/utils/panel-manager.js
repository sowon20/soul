/**
 * Panel Manager
 * 오른쪽 패널 관리
 */

export class PanelManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.currentPanel = null;
    this.panelTitle = document.getElementById('panelTitle');
    this.panelContent = document.getElementById('panelContent');

    // Panel configuration
    this.panels = {
      search: {
        title: '통합 검색',
        render: () => this.renderSearchPanel(),
      },
      files: {
        title: '파일 매니저',
        render: () => this.renderFilesPanel(),
      },
      memory: {
        title: '메모리 탐색',
        render: () => this.renderMemoryPanel(),
      },
      mcp: {
        title: 'MCP 관리',
        render: () => this.renderMCPPanel(),
      },
      archive: {
        title: '대화 아카이브',
        render: () => this.renderArchivePanel(),
      },
      notifications: {
        title: '알림',
        render: () => this.renderNotificationsPanel(),
      },
      settings: {
        title: '설정',
        render: () => this.renderSettingsPanel(),
      },
      context: {
        title: '컨텍스트',
        render: () => this.renderContextPanel(),
      },
      todo: {
        title: 'TODO',
        render: () => this.renderTodoPanel(),
      },
      terminal: {
        title: '터미널',
        render: () => this.renderTerminalPanel(),
      },
    };
  }

  /**
   * 패널 열기
   * @param {string} panelType
   */
  async openPanel(panelType) {
    const panel = this.panels[panelType];
    if (!panel) {
      console.warn(`알 수 없는 패널: ${panelType}`);
      return;
    }

    this.currentPanel = panelType;
    this.panelTitle.textContent = panel.title;
    this.panelContent.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

    try {
      // Render panel content
      await panel.render();

      // Call backend API (ignore errors - frontend works independently)
      try {
        await this.apiClient.openPanel(panelType);
      } catch (apiError) {
        console.warn(`백엔드 패널 API 실패 (무시):`, apiError.message);
      }
    } catch (error) {
      console.error(`패널 렌더링 실패 [${panelType}]:`, error);
      this.panelContent.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--destructive);">
          <p>패널을 로드하는 중 오류가 발생했습니다.</p>
          <p style="font-size: var(--font-size-sm); margin-top: 0.5rem;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 패널 닫기
   */
  async closePanel() {
    if (this.currentPanel) {
      try {
        await this.apiClient.closePanel(this.currentPanel);
      } catch (apiError) {
        console.warn(`백엔드 패널 닫기 API 실패 (무시):`, apiError.message);
      }
      this.currentPanel = null;
    }
    this.panelContent.innerHTML = '';
  }

  /* ===================================
     Panel Renderers
     =================================== */

  async renderSearchPanel() {
    this.panelContent.innerHTML = `
      <div class="search-panel">
        <input
          type="text"
          id="searchInput"
          placeholder="검색어를 입력하세요..."
          style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.9375rem; margin-bottom: 1rem;"
        >
        <div id="searchResults" style="margin-top: 1rem;">
          <p style="opacity: 0.7; text-align: center;">
            검색어를 입력하세요
          </p>
        </div>
      </div>
    `;

    // Add search functionality
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', async (e) => {
      const query = e.target.value.trim();
      if (!query) {
        searchResults.innerHTML = '<p style="opacity: 0.7; text-align: center;">검색어를 입력하세요</p>';
        return;
      }

      searchResults.innerHTML = '<div class="spinner"></div>';

      try {
        const results = await this.apiClient.smartSearch(query);
        if (results.length === 0) {
          searchResults.innerHTML = '<p style="opacity: 0.7;">검색 결과가 없습니다.</p>';
        } else {
          searchResults.innerHTML = results
            .map(
              (r) => `
            <div style="padding: 1rem; background: rgba(255, 255, 255, 0.08); border-radius: 8px; margin-bottom: 0.75rem;">
              <h4 style="margin-bottom: 0.5rem; color: #ffffff;">${r.title || r.id}</h4>
              <p style="font-size: 0.875rem; opacity: 0.8;">
                ${r.summary || ''}
              </p>
            </div>
          `
            )
            .join('');
        }
      } catch (error) {
        searchResults.innerHTML = `<p style="color: #ff6b6b;">검색 실패: ${error.message}</p>`;
      }
    });
  }

  async renderFilesPanel() {
    this.panelContent.innerHTML = `
      <div class="files-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          파일 매니저 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderMemoryPanel() {
    this.panelContent.innerHTML = `
      <div class="memory-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          메모리 탐색 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderMCPPanel() {
    this.panelContent.innerHTML = `
      <div class="mcp-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          MCP 관리 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderArchivePanel() {
    this.panelContent.innerHTML = `
      <div class="archive-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          대화 아카이브 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderNotificationsPanel() {
    try {
      const notifications = await this.apiClient.getNotifications();

      if (notifications.length === 0) {
        this.panelContent.innerHTML = `
          <p style="opacity: 0.7; text-align: center; padding: 2rem;">
            알림이 없습니다.
          </p>
        `;
        return;
      }

      this.panelContent.innerHTML = notifications
        .map(
          (n) => `
        <div style="padding: 1rem; background: ${n.read ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)'}; border-radius: 8px; margin-bottom: 0.75rem; border-left: 3px solid rgba(255, 255, 255, 0.4);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <strong style="color: #ffffff;">${n.title}</strong>
            <span style="font-size: 0.75rem; opacity: 0.7;">
              ${new Date(n.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p style="font-size: 0.875rem; opacity: 0.9;">
            ${n.message}
          </p>
        </div>
      `
        )
        .join('');
    } catch (error) {
      this.panelContent.innerHTML = `
        <p style="color: #ff6b6b; text-align: center; padding: 2rem;">
          알림을 불러오는데 실패했습니다.
        </p>
      `;
    }
  }

  async renderSettingsPanel() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'default';
    const currentFontSize = document.documentElement.getAttribute('data-font-size') || 'md';

    // Get current glass intensity and background image from localStorage
    const savedGlassIntensity = window.soulApp.themeManager.getFromLocalStorage('glassIntensity', 'medium');
    const savedBackgroundImage = window.soulApp.themeManager.getFromLocalStorage('backgroundImage', '');

    this.panelContent.innerHTML = `
      <div class="settings-panel">
        <div style="margin-bottom: 2rem;">
          <h3 style="margin-bottom: 1rem; font-size: 1.125rem;">테마</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
            ${['default', 'basic', 'dark', 'ocean', 'forest', 'sunset']
              .map(
                (theme) => `
              <button
                class="theme-btn"
                data-theme="${theme}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); border: 2px solid ${
                  theme === currentTheme ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff;"
              >
                ${theme}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div style="margin-bottom: 2rem;">
          <h3 style="margin-bottom: 1rem; font-size: 1.125rem;">글씨 크기</h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${['xs', 'sm', 'md', 'lg', 'xl']
              .map(
                (size) => `
              <button
                class="font-size-btn"
                data-size="${size}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); border: 2px solid ${
                  size === currentFontSize ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff;"
              >
                ${size.toUpperCase()}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div style="margin-bottom: 2rem;">
          <h3 style="margin-bottom: 1rem; font-size: 1.125rem;">유리 효과 강도</h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${['low', 'medium', 'high']
              .map(
                (intensity) => `
              <button
                class="glass-intensity-btn"
                data-intensity="${intensity}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); border: 2px solid ${
                  intensity === savedGlassIntensity ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff;"
              >
                ${intensity === 'low' ? '낮음' : intensity === 'medium' ? '중간' : '높음'}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div>
          <h3 style="margin-bottom: 1rem; font-size: 1.125rem;">배경 이미지</h3>
          <input
            type="text"
            id="backgroundImageInput"
            placeholder="이미지 URL 입력..."
            value="${savedBackgroundImage}"
            style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.9375rem; margin-bottom: 0.75rem;"
          >
          <button
            id="applyBackgroundBtn"
            style="width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.15); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.9375rem; font-weight: 500; transition: all 0.2s;"
          >
            배경 적용
          </button>
          ${savedBackgroundImage ? `
            <button
              id="removeBackgroundBtn"
              style="width: 100%; padding: 0.75rem; background: rgba(220, 104, 104, 0.2); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.9375rem; font-weight: 500; transition: all 0.2s; margin-top: 0.5rem;"
            >
              배경 제거
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Add event listeners
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        window.soulApp.themeManager.applyTheme(theme);

        // Update button styles
        document.querySelectorAll('.theme-btn').forEach((b) => {
          b.style.borderColor = b.dataset.theme === theme ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
        });
      });
    });

    document.querySelectorAll('.font-size-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const size = btn.dataset.size;
        window.soulApp.themeManager.setFontSize(size);

        // Update button styles
        document.querySelectorAll('.font-size-btn').forEach((b) => {
          b.style.borderColor = b.dataset.size === size ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
        });
      });
    });

    document.querySelectorAll('.glass-intensity-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const intensity = btn.dataset.intensity;
        window.soulApp.themeManager.setGlassIntensity(intensity);

        // Update button styles
        document.querySelectorAll('.glass-intensity-btn').forEach((b) => {
          b.style.borderColor = b.dataset.intensity === intensity ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
        });
      });
    });

    // Background image apply button
    const applyBackgroundBtn = document.getElementById('applyBackgroundBtn');
    if (applyBackgroundBtn) {
      applyBackgroundBtn.addEventListener('click', () => {
        const url = document.getElementById('backgroundImageInput').value.trim();
        if (url) {
          window.soulApp.themeManager.setBackgroundImage(url);
          this.renderSettingsPanel(); // Re-render to show remove button
        }
      });
    }

    // Background image remove button
    const removeBackgroundBtn = document.getElementById('removeBackgroundBtn');
    if (removeBackgroundBtn) {
      removeBackgroundBtn.addEventListener('click', () => {
        window.soulApp.themeManager.removeBackgroundImage();
        this.renderSettingsPanel(); // Re-render to hide remove button
      });
    }

    // Enter key to apply background
    const backgroundInput = document.getElementById('backgroundImageInput');
    if (backgroundInput) {
      backgroundInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const url = e.target.value.trim();
          if (url) {
            window.soulApp.themeManager.setBackgroundImage(url);
            this.renderSettingsPanel();
          }
        }
      });
    }
  }

  async renderContextPanel() {
    try {
      const stats = await this.apiClient.getTokenStatus();

      this.panelContent.innerHTML = `
        <div class="context-panel">
          <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.5rem; color: #ffffff;">토큰 사용량</h4>
            <div style="background: rgba(255, 255, 255, 0.1); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: rgba(255, 255, 255, 0.4); height: 100%; width: ${stats.percentage || 0}%;"></div>
            </div>
            <p style="font-size: 0.875rem; opacity: 0.8; margin-top: 0.5rem;">
              ${stats.used || 0} / ${stats.total || 0} 토큰 (${stats.percentage || 0}%)
            </p>
          </div>

          <p style="opacity: 0.7; text-align: center;">
            컨텍스트 관리 기능 (구현 예정)
          </p>
        </div>
      `;
    } catch (error) {
      this.panelContent.innerHTML = `
        <p style="color: #ff6b6b; text-align: center; padding: 2rem;">
          컨텍스트 정보를 불러오는데 실패했습니다.
        </p>
      `;
    }
  }

  async renderTodoPanel() {
    this.panelContent.innerHTML = `
      <div class="todo-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          TODO 관리 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderTerminalPanel() {
    this.panelContent.innerHTML = `
      <div class="terminal-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          터미널 (구현 예정)
        </p>
      </div>
    `;
  }
}
