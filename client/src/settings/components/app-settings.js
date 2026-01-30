/**
 * 앱설정 UI 컴포넌트
 * - 테마 설정
 * - MCP 서버 관리
 */

export class AppSettings {
  constructor() {
    this.mcpServers = [];
    this.currentSubPage = 'theme';
  }

  async render(container, apiClient) {
    this.apiClient = apiClient;
    this.container = container;

    container.innerHTML = `
      <div class="app-settings">
        <h2>⚙️ 앱설정</h2>

        <!-- 컨텐츠 -->
        <div class="app-settings-content" id="appSettingsContent">
          <!-- 동적 로드 -->
        </div>
      </div>
    `;

    // 바로 테마 설정 로드
    this.renderThemeSettings(document.getElementById('appSettingsContent'));
  }

  attachEvents() {
    const tabs = this.container.querySelectorAll('.app-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        await this.loadSubPage(tab.dataset.tab);
      });
    });
  }

  async loadSubPage(tabName) {
    this.currentSubPage = tabName;
    const content = document.getElementById('appSettingsContent');

    if (tabName === 'theme') {
      this.renderThemeSettings(content);
    } else if (tabName === 'mcp') {
      await this.renderMCPSettings(content);
    }
  }

  /**
   * 테마 설정 렌더링
   */
  async renderThemeSettings(container) {
    // 현재 설정 로드
    let currentSettings = {
      language: 'ko',
      timezone: 'Asia/Seoul'
    };

    try {
      const response = await this.apiClient.get('/config/locale');
      if (response.success) {
        currentSettings = { ...currentSettings, ...response.settings };
      }
    } catch (e) {
      console.log('로케일 설정 로드 실패, 기본값 사용');
    }

    container.innerHTML = `
      <div class="theme-settings-section">
        <h3>테마 선택</h3>
        <div class="theme-options">
          <label class="theme-option">
            <input type="radio" name="theme" value="light" checked>
            <span class="theme-preview light">☀️ 라이트</span>
          </label>
          <label class="theme-option">
            <input type="radio" name="theme" value="dark">
            <span class="theme-preview dark">🌙 다크</span>
          </label>
        </div>
        <p class="theme-note">* 테마 기능은 준비 중입니다</p>
      </div>

      <!-- 언어/시간대 설정 -->
      <div class="locale-settings-section" style="margin-top: 24px;">
        <h3>🌐 언어 및 시간대</h3>

        <div class="setting-row" style="margin-top: 16px;">
          <label for="languageSelect">언어</label>
          <select id="languageSelect" class="setting-select">
            <option value="ko" ${currentSettings.language === 'ko' ? 'selected' : ''}>한국어</option>
            <option value="en" ${currentSettings.language === 'en' ? 'selected' : ''}>English</option>
            <option value="ja" ${currentSettings.language === 'ja' ? 'selected' : ''}>日本語</option>
          </select>
        </div>

        <div class="setting-row" style="margin-top: 12px;">
          <label for="timezoneSelect">시간대</label>
          <select id="timezoneSelect" class="setting-select">
            <option value="Asia/Seoul" ${currentSettings.timezone === 'Asia/Seoul' ? 'selected' : ''}>한국 표준시 (KST, UTC+9)</option>
            <option value="Asia/Tokyo" ${currentSettings.timezone === 'Asia/Tokyo' ? 'selected' : ''}>일본 표준시 (JST, UTC+9)</option>
            <option value="America/Los_Angeles" ${currentSettings.timezone === 'America/Los_Angeles' ? 'selected' : ''}>태평양 시간 (PST, UTC-8)</option>
            <option value="America/New_York" ${currentSettings.timezone === 'America/New_York' ? 'selected' : ''}>동부 시간 (EST, UTC-5)</option>
            <option value="Europe/London" ${currentSettings.timezone === 'Europe/London' ? 'selected' : ''}>영국 시간 (GMT, UTC+0)</option>
            <option value="UTC" ${currentSettings.timezone === 'UTC' ? 'selected' : ''}>협정 세계시 (UTC)</option>
          </select>
        </div>

        <button id="saveLocaleBtn" class="save-btn" style="margin-top: 16px;">저장</button>
        <span id="localeSaveStatus" style="margin-left: 12px; color: #4caf50; font-size: 13px;"></span>
      </div>

      <!-- TODO 메모 -->
      <div class="todo-memo-section" style="margin-top: 20px; padding: 15px; background: rgba(255, 200, 100, 0.2); border: 1px dashed rgba(200, 150, 50, 0.5); border-radius: 8px;">
        <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #8b7355;">📝 TODO</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #6b5a47; line-height: 1.8;">
          <li>기본 호스트명 home.soul 로 하기</li>
          <li>도메인 설정 폼 만들기</li>
        </ul>
      </div>
    `;

    // 저장 버튼 이벤트
    document.getElementById('saveLocaleBtn')?.addEventListener('click', async () => {
      const language = document.getElementById('languageSelect').value;
      const timezone = document.getElementById('timezoneSelect').value;

      try {
        await this.apiClient.put('/config/locale', { language, timezone });
        document.getElementById('localeSaveStatus').textContent = '✓ 저장됨';
        setTimeout(() => {
          document.getElementById('localeSaveStatus').textContent = '';
        }, 2000);
      } catch (e) {
        console.error('로케일 저장 실패:', e);
        document.getElementById('localeSaveStatus').textContent = '❌ 저장 실패';
        document.getElementById('localeSaveStatus').style.color = '#f44336';
      }
    });
  }

  /**
   * MCP 서버 관리 렌더링
   */
  async renderMCPSettings(container) {
    container.innerHTML = `
      <div class="mcp-settings-section">
        <div class="mcp-header">
          <h3>MCP 서버 관리</h3>
          <button class="mcp-add-btn" id="mcpAddBtn">+ 서버 추가</button>
        </div>
        
        <div class="mcp-server-list" id="mcpServerList">
          <div class="mcp-loading">서버 목록 로딩 중...</div>
        </div>
      </div>
    `;

    // 서버 추가 버튼 이벤트
    document.getElementById('mcpAddBtn')?.addEventListener('click', () => {
      this.showAddServerModal();
    });

    // 서버 목록 로드
    await this.loadMCPServers();
  }

  /**
   * MCP 서버 목록 로드
   */
  async loadMCPServers() {
    const listContainer = document.getElementById('mcpServerList');
    
    try {
      // API에서 서버 목록 가져오기
      const response = await this.apiClient.get('/mcp/servers');
      this.mcpServers = response?.servers || [];
      this.renderServerList(listContainer);
    } catch (error) {
      console.error('MCP 서버 목록 로드 실패:', error);
      listContainer.innerHTML = `
        <div class="mcp-error">
          <p>❌ 서버 목록을 불러올 수 없습니다</p>
          <p class="error-detail">${error.message}</p>
          <button class="mcp-retry-btn" onclick="location.reload()">🔄 새로고침</button>
        </div>
      `;
    }
  }

  /**
   * 서버 목록 렌더링
   */
  renderServerList(container) {
    if (this.mcpServers.length === 0) {
      container.innerHTML = `
        <div class="mcp-empty">
          <p>등록된 MCP 서버가 없습니다</p>
          <button class="mcp-add-btn">+ 서버 추가</button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.mcpServers.map(server => {
      // 서버 타입에 따른 아이콘
      const icon = server.type === 'built-in' ? '🔧' : '🔌';
      // URL 표시 (port가 있으면 포트, 없으면 type 표시)
      const urlDisplay = server.port ? `포트 ${server.port}` : (server.url || server.type);
      // 도구 개수
      const toolCount = server.tools?.length || 0;

      return `
        <div class="mcp-server-item ${server.enabled ? 'enabled' : 'disabled'}" data-id="${server.id}">
          <div class="mcp-server-status">
            <span class="status-dot ${server.enabled ? 'online' : 'offline'}"></span>
          </div>
          <div class="mcp-server-info">
            <div class="mcp-server-name">${icon} ${server.name}</div>
            <div class="mcp-server-meta">
              <span class="mcp-badge ${server.type === 'built-in' ? 'builtin' : 'external'}">${server.type === 'built-in' ? '내장' : '외부'}</span>
              <span class="mcp-badge tools">${toolCount}개 도구</span>
              ${server.port ? `<span class="mcp-badge port">:${server.port}</span>` : ''}
            </div>
            <div class="mcp-server-desc">${server.description || ''}</div>
          </div>
          <div class="mcp-server-actions">
            <label class="mcp-toggle">
              <input type="checkbox" ${server.enabled ? 'checked' : ''} data-server-id="${server.id}">
              <span class="toggle-slider"></span>
            </label>
            <button class="mcp-tools-btn" data-server-id="${server.id}" title="도구 목록">🔧</button>
            ${server.type !== 'built-in' ? `<button class="mcp-edit-btn" data-server-id="${server.id}" title="수정">✏️</button>` : ''}
            ${server.type !== 'built-in' ? `<button class="mcp-delete-btn" data-server-id="${server.id}" title="삭제">🗑️</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // 토글 이벤트
    container.querySelectorAll('.mcp-toggle input').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        this.toggleServer(e.target.dataset.serverId, e.target.checked);
      });
    });

    // 도구 목록 버튼 이벤트
    container.querySelectorAll('.mcp-tools-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showToolsList(btn.dataset.serverId);
      });
    });

    // 수정 버튼 이벤트
    container.querySelectorAll('.mcp-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showEditServerModal(btn.dataset.serverId);
      });
    });

    // 삭제 버튼 이벤트
    container.querySelectorAll('.mcp-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteServer(btn.dataset.serverId);
      });
    });
  }

  /**
   * 서버 ON/OFF 토글
   */
  async toggleServer(serverId, enabled) {
    const server = this.mcpServers.find(s => s.id === serverId);
    if (server) {
      server.enabled = enabled;
      // API 호출로 저장
      try {
        await this.apiClient.put('/mcp/servers/' + serverId, { enabled });
      } catch (e) {
        console.error('서버 상태 저장 실패:', e);
      }
    }
  }

  /**
   * 도구 목록 보기
   */
  async showToolsList(serverId) {
    const server = this.mcpServers.find(s => s.id === serverId);
    if (!server) return;

    // 모달로 도구 목록 표시
    const modal = document.createElement('div');
    modal.className = 'mcp-modal';
    modal.innerHTML = `
      <div class="mcp-modal-content">
        <div class="mcp-modal-header">
          <h3>${server.name} 도구 목록</h3>
          <button class="mcp-modal-close">✕</button>
        </div>
        <div class="mcp-modal-body">
          <div class="mcp-tools-loading">도구 목록 로딩 중...</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 닫기 버튼
    modal.querySelector('.mcp-modal-close').addEventListener('click', () => {
      modal.remove();
    });

    // 바깥 클릭 시 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove(); // 바깥 클릭시 닫힘
    });

    // 도구 목록 로드 (백엔드 API 사용)
    try {
      const response = await this.apiClient.get(`/mcp/servers/${serverId}/tools`);
      const tools = response?.tools || [];

      if (tools.length === 0) {
        modal.querySelector('.mcp-modal-body').innerHTML = `
          <div class="mcp-tools-empty">
            <p>등록된 도구가 없습니다</p>
          </div>
        `;
      } else {
        modal.querySelector('.mcp-modal-body').innerHTML = `
          <div class="mcp-tools-grid">
            ${tools.map(tool => `
              <div class="mcp-tool-item">
                <div class="mcp-tool-name">🛠️ ${tool.name}</div>
                <div class="mcp-tool-desc">${tool.description || '설명 없음'}</div>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (error) {
      modal.querySelector('.mcp-modal-body').innerHTML = `
        <div class="mcp-tools-error">
          <p>❌ 도구 목록 로드 실패</p>
          <p class="error-detail">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 서버 추가 모달
   */
  showAddServerModal() {
    const modal = document.createElement('div');
    modal.className = 'mcp-modal';
    modal.innerHTML = `
      <div class="mcp-modal-content">
        <div class="mcp-modal-header">
          <h3>MCP 서버 추가</h3>
          <button class="mcp-modal-close">✕</button>
        </div>
        <div class="mcp-modal-body">
          <form id="mcpAddForm" class="mcp-form">
            <div class="form-group">
              <label>서버 이름</label>
              <input type="text" name="name" placeholder="예: Smart Home" required>
            </div>
            <div class="form-group">
              <label>SSE URL</label>
              <input type="url" name="url" placeholder="예: https://mcp.example.com/smarthome/sse" required>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel">취소</button>
              <button type="submit" class="btn-save">추가</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 닫기
    modal.querySelector('.mcp-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // 폼 제출
    modal.querySelector('#mcpAddForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const newServer = {
        id: 'mcp_' + Date.now(),
        name: formData.get('name'),
        url: formData.get('url'),
        enabled: true
      };
      
      try {
        await this.apiClient.post('/mcp/servers', newServer);
        // 서버 목록 다시 로드 (도구 개수 포함)
        await this.loadMCPServers();
      } catch (e) {
        console.error('서버 추가 실패:', e);
      }

      modal.remove();
      this.renderServerList(document.getElementById('mcpServerList'));
    });
  }

  /**
   * 서버 삭제
   */
  async deleteServer(serverId) {
    console.log('🗑️ 삭제 요청:', serverId);
    if (!confirm('이 MCP 서버를 삭제하시겠습니까?')) return;

    this.mcpServers = this.mcpServers.filter(s => s.id !== serverId);
    
    try {
      await this.apiClient.delete('/mcp/servers/' + serverId);
    } catch (e) {
      console.error('서버 삭제 실패:', e);
    }

    this.renderServerList(document.getElementById('mcpServerList'));
  }

  /**
   * 서버 수정 모달
   */
  showEditServerModal(serverId) {
    const server = this.mcpServers.find(s => s.id === serverId);
    if (!server) return;

    // 아이콘 목록
    const icons = [
      'checklist-icon.webp', 'smarthome-icon.webp', 'cat-icon.webp',
      'terminal-icon.webp', 'mic-icon.webp', 'setup-icom.webp',
      'mcp-icon.webp', 'folder-icon.webp', 'user-icon.webp'
    ];

    const modal = document.createElement('div');
    modal.className = 'mcp-modal';
    modal.innerHTML = `
      <div class="mcp-modal-content">
        <div class="mcp-modal-header">
          <h3>MCP 서버 수정</h3>
          <button class="mcp-modal-close">✕</button>
        </div>
        <div class="mcp-modal-body">
          <form id="mcpEditForm" class="mcp-form">
            <div class="form-group">
              <label>서버 이름</label>
              <input type="text" name="name" value="${server.name || ''}" required>
            </div>
            <div class="form-group">
              <label>SSE URL</label>
              <input type="url" name="url" value="${server.url || ''}" required>
            </div>
            <div class="form-group">
              <label>UI 페이지 URL (독 클릭 시 열림)</label>
              <input type="url" name="uiUrl" value="${server.uiUrl || ''}" placeholder="https://example.com/ui/">
            </div>
            <div class="form-group">
              <label>아이콘</label>
              <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                ${icons.map(icon => `
                  <div class="icon-option" data-icon="${icon}" 
                    style="width: 40px; height: 40px; border: 2px solid ${server.icon === icon ? '#4285f4' : '#ddd'}; 
                    border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
                    background: ${server.icon === icon ? '#e3f2fd' : '#f9f9f9'};">
                    <img src="./src/assets/${icon}" style="width: 28px; height: 28px;" alt="${icon}">
                  </div>
                `).join('')}
              </div>
              <input type="hidden" name="icon" value="${server.icon || ''}">
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" name="showInDock" id="showInDock" ${server.showInDock ? 'checked' : ''}>
              <label for="showInDock" style="margin: 0;">독(Dock)에 표시</label>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel">취소</button>
              <button type="submit" class="btn-save">저장</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 아이콘 선택 이벤트
    modal.querySelectorAll('.icon-option').forEach(opt => {
      opt.addEventListener('click', () => {
        modal.querySelectorAll('.icon-option').forEach(o => {
          o.style.border = '2px solid #ddd';
          o.style.background = '#f9f9f9';
        });
        opt.style.border = '2px solid #4285f4';
        opt.style.background = '#e3f2fd';
        modal.querySelector('input[name="icon"]').value = opt.dataset.icon;
      });
    });

    // 닫기
    modal.querySelector('.mcp-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // 폼 제출
    modal.querySelector('#mcpEditForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const updates = {
        name: formData.get('name'),
        url: formData.get('url'),
        uiUrl: formData.get('uiUrl'),
        icon: formData.get('icon'),
        showInDock: formData.get('showInDock') === 'on'
      };

      // 독에 표시하려면 UI URL 필수
      if (updates.showInDock && !updates.uiUrl) {
        alert('독에 표시하려면 UI 페이지 URL을 입력해주세요.');
        return;
      }

      try {
        await this.apiClient.post('/mcp/servers/' + serverId, updates);
        // 로컬 데이터 업데이트
        Object.assign(server, updates);
        modal.remove();
        this.renderServerList(document.getElementById('mcpServerList'));
        
        // 독 업데이트
        await this.updateDock();
      } catch (e) {
        console.error('서버 수정 실패:', e);
        alert('서버 수정에 실패했습니다: ' + e.message);
      }
    });
  }

  /**
   * 독 업데이트
   */
  async updateDock() {
    try {
      const dockItems = this.mcpServers
        .filter(s => s.showInDock && s.uiUrl)
        .map((s, idx) => ({
          id: s.id,
          name: s.name,
          icon: s.icon || 'mcp-icon.webp',
          url: s.uiUrl,
          order: idx
        }));

      // 설정은 항상 마지막에 고정
      dockItems.push({ id: 'settings', name: '설정', icon: 'setup-icom.webp', url: null, order: 999, fixed: true });

      await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: dockItems })
      });

      if (window.soulApp) {
        window.soulApp.initMacosDock();
      }
    } catch (error) {
      console.error('독 업데이트 실패:', error);
    }
  }
}
