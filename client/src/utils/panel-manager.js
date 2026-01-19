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
    // 설정은 왼쪽 메뉴에서 관리합니다 - 이 공간은 Canvas Workspace로 사용
    this.panelContent.innerHTML = `
      <div class="canvas-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 3rem; text-align: center;">
        <div style="font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.3;">⚙️</div>
        <h3 style="font-size: 1.25rem; font-weight: 500; margin-bottom: 1rem; opacity: 0.8;">
          설정은 왼쪽 메뉴에서
        </h3>
        <p style="font-size: 0.9375rem; opacity: 0.6; line-height: 1.6; max-width: 400px;">
          모든 설정 옵션은 왼쪽 메뉴의 설정 패널에서 관리할 수 있습니다.<br>
          이 공간은 향후 멀티 패널 작업 공간으로 사용될 예정입니다.
        </p>
        <button
          onclick="window.soulApp.menuManager.open(); window.soulApp.menuManager.switchMenu('settings');"
          style="margin-top: 2rem; padding: 0.875rem 1.5rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 10px; cursor: pointer; color: #ffffff; font-size: 0.9375rem; font-weight: 500; transition: all 0.2s;"
          onmouseover="this.style.background='rgba(96, 165, 250, 0.3)'"
          onmouseout="this.style.background='rgba(96, 165, 250, 0.2)'"
        >
          설정 열기
        </button>
      </div>
    `;
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
