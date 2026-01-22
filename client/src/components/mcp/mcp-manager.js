/**
 * MCP Manager Component
 * MCP 서버 관리 및 도구 목록 표시
 */

export class MCPManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.servers = [];
    this.selectedServer = null;
  }

  /**
   * 컴포넌트 렌더링
   */
  async render(container) {
    try {
      // MCP 서버 목록 로드
      await this.loadServers();

      // UI 렌더링 (Canvas 헤더가 이미 제목을 표시하므로 중복 제거)
      container.innerHTML = `
        <div class="mcp-manager-panel">
          <div class="mcp-header" style="justify-content: flex-end; padding-bottom: 0.5rem;">
            <button class="mcp-refresh-btn" id="mcpRefreshBtn" title="새로고침">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
            </button>
          </div>

          <div class="mcp-content">
            ${this.renderServerList()}
          </div>

          ${this.selectedServer ? this.renderToolsList() : ''}
        </div>
      `;

      // 이벤트 리스너 등록
      this.attachEventListeners(container);
    } catch (error) {
      console.error('Failed to render MCP manager:', error);
      container.innerHTML = `
        <div class="mcp-error">
          <p>MCP 서버를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * MCP 서버 목록 로드
   */
  async loadServers() {
    const response = await this.apiClient.get('/mcp/servers');
    this.servers = response.servers || [];
  }

  /**
   * 서버 리스트 렌더링
   */
  renderServerList() {
    if (this.servers.length === 0) {
      return `
        <div class="mcp-empty">
          <p>등록된 MCP 서버가 없습니다.</p>
        </div>
      `;
    }

    return `
      <div class="mcp-servers-list">
        ${this.servers.map(server => this.renderServerCard(server)).join('')}
      </div>
    `;
  }

  /**
   * 서버 카드 렌더링
   */
  renderServerCard(server) {
    const isSelected = this.selectedServer?.id === server.id;

    return `
      <div class="mcp-server-card ${isSelected ? 'selected' : ''}" data-server-id="${server.id}">
        <div class="mcp-server-header">
          <div class="mcp-server-icon">
            ${server.type === 'built-in' ? '🔧' : '🔌'}
          </div>
          <div class="mcp-server-info">
            <h4 class="mcp-server-name">${server.name}</h4>
            <p class="mcp-server-description">${server.description}</p>
          </div>
          <label class="mcp-toggle-switch">
            <input type="checkbox" ${server.enabled ? 'checked' : ''} data-action="toggle-server" data-server-id="${server.id}">
            <span class="mcp-toggle-slider"></span>
          </label>
        </div>

        <div class="mcp-server-meta">
          <span class="mcp-server-type">${server.type === 'built-in' ? '내장' : '외부'}</span>
          <span class="mcp-server-tools-count">${server.tools?.length || 0}개 도구</span>
          ${server.webUI ? `<span class="mcp-server-port">포트: ${server.port}</span>` : ''}
        </div>

        <div style="display: flex; gap: 0.5rem;">
          ${server.webUI ? `
            <button class="mcp-server-details-btn" data-action="open-webui" data-url="${server.webUI}" style="flex: 1;">
              ⚙️ 설정 페이지
            </button>
          ` : ''}
          <button class="mcp-server-details-btn" data-action="show-tools" data-server-id="${server.id}" style="flex: 1;">
            도구 목록 보기
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 도구 리스트 렌더링
   */
  renderToolsList() {
    if (!this.selectedServer) return '';

    return `
      <div class="mcp-tools-panel">
        <div class="mcp-tools-header">
          <h4>${this.selectedServer.name} 도구</h4>
          <button class="mcp-close-btn" data-action="close-tools">✕</button>
        </div>
        <div class="mcp-tools-list" id="mcpToolsList">
          <div class="mcp-loading">도구 목록 로딩 중...</div>
        </div>
      </div>
    `;
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners(container) {
    // 새로고침 버튼
    const refreshBtn = container.querySelector('#mcpRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await this.render(container);
      });
    }

    // 서버 토글
    container.addEventListener('change', async (e) => {
      if (e.target.dataset.action === 'toggle-server') {
        const serverId = e.target.dataset.serverId;
        const enabled = e.target.checked;
        await this.toggleServer(serverId, enabled);
      }
    });

    // 버튼 클릭
    container.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const serverId = button.dataset.serverId;

      switch (action) {
        case 'show-tools':
          await this.showTools(serverId);
          await this.render(container);
          await this.loadToolsForServer(serverId);
          break;
        case 'close-tools':
          this.selectedServer = null;
          await this.render(container);
          break;
        case 'open-webui':
          const url = button.dataset.url;
          if (url) {
            window.open(url, '_blank', 'width=1200,height=800');
          }
          break;
      }
    });
  }

  /**
   * 서버 활성화/비활성화
   */
  async toggleServer(serverId, enabled) {
    try {
      await this.apiClient.post(`/mcp/servers/${serverId}/enable`, { enabled });
    } catch (error) {
      console.error('Failed to toggle server:', error);
    }
  }

  /**
   * 도구 보기
   */
  async showTools(serverId) {
    this.selectedServer = this.servers.find(s => s.id === serverId);
  }

  /**
   * 서버의 도구 목록 로드
   */
  async loadToolsForServer(serverId) {
    try {
      const toolsListEl = document.getElementById('mcpToolsList');
      if (!toolsListEl) return;

      const response = await this.apiClient.get(`/mcp/servers/${serverId}/tools`);
      const tools = response.tools || [];

      if (tools.length === 0) {
        toolsListEl.innerHTML = `
          <div class="mcp-empty">
            <p>등록된 도구가 없습니다.</p>
          </div>
        `;
        return;
      }

      toolsListEl.innerHTML = `
        <div class="mcp-tools-grid">
          ${tools.map(tool => this.renderToolCard(tool)).join('')}
        </div>
      `;
    } catch (error) {
      console.error('Failed to load tools:', error);
      const toolsListEl = document.getElementById('mcpToolsList');
      if (toolsListEl) {
        toolsListEl.innerHTML = `
          <div class="mcp-error">
            <p>도구 목록을 불러오는데 실패했습니다.</p>
          </div>
        `;
      }
    }
  }

  /**
   * 도구 카드 렌더링
   */
  renderToolCard(tool) {
    return `
      <div class="mcp-tool-card">
        <div class="mcp-tool-icon">🛠️</div>
        <div class="mcp-tool-info">
          <h5 class="mcp-tool-name">${tool.name}</h5>
          <p class="mcp-tool-description">${tool.description}</p>
          <span class="mcp-tool-module">${tool.module}</span>
        </div>
      </div>
    `;
  }
}
