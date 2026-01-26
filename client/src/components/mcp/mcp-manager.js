/**
 * MCP Manager Component
 * MCP 서버 관리 - 깨끗한 카드 기반 UI
 */

import { GoogleHomeManager } from './google-home-manager.js';

export class MCPManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.servers = [];
    this.selectedServer = null;
    this.serverTools = {}; // 서버별 도구 캐시
  }

  /**
   * 컴포넌트 렌더링
   */
  async render(container) {
    this.container = container;

    try {
      await this.loadServers();
      this.renderUI();
      this.attachEventListeners();
    } catch (error) {
      console.error('Failed to render MCP manager:', error);
      container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: #ef4444;">
          <p>MCP 관리자를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * UI 렌더링
   */
  renderUI() {
    this.container.innerHTML = `
      <div class="mcp-manager" style="padding: 0.5rem;">
        <!-- 헤더 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0; font-size: 1.1rem; color: #333;">MCP 허브</h3>
          <button id="mcpRefreshBtn" style="background: none; border: 1px solid #ddd; border-radius: 6px; padding: 0.4rem 0.6rem; cursor: pointer; font-size: 0.8rem;">
            🔄 새로고침
          </button>
        </div>

        <!-- 서버 카드 목록 -->
        <div id="serverCards" style="display: grid; gap: 0.75rem;">
          ${this.renderServerCards()}
        </div>

        <!-- 도구 목록 패널 (선택시 표시) -->
        <div id="toolsPanel" style="display: none; margin-top: 1rem;"></div>
      </div>
    `;
  }

  /**
   * 서버 카드 목록 렌더링
   */
  renderServerCards() {
    if (this.servers.length === 0) {
      return `<div style="padding: 2rem; text-align: center; color: #666;">등록된 MCP 서버가 없습니다.</div>`;
    }

    return this.servers.map(server => this.renderServerCard(server)).join('');
  }

  /**
   * 개별 서버 카드 렌더링
   */
  renderServerCard(server) {
    const icons = {
      'hub-server': '🔧',
      'google-home': '🏠',
      'todo': '📝'
    };
    const icon = icons[server.id] || (server.type === 'built-in' ? '🔧' : '🔌');
    const isEnabled = server.enabled;

    return `
      <div class="server-card" data-server-id="${server.id}"
        style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem;">

        <!-- 헤더: 아이콘, 이름, 토글 -->
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <span style="font-size: 1.5rem;">${icon}</span>
          <div style="flex: 1;">
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: #333;">${server.name}</h4>
            <p style="margin: 0.2rem 0 0 0; font-size: 0.75rem; color: #666;">${server.description}</p>
          </div>
          <label style="position: relative; width: 44px; height: 24px; cursor: pointer;">
            <input type="checkbox" class="server-toggle" data-server-id="${server.id}"
              ${isEnabled ? 'checked' : ''}
              style="opacity: 0; width: 0; height: 0;">
            <span style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${isEnabled ? '#4285f4' : '#ccc'}; border-radius: 24px; transition: 0.3s;">
              <span style="position: absolute; width: 18px; height: 18px; left: ${isEnabled ? '23px' : '3px'}; top: 3px; background: white; border-radius: 50%; transition: 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></span>
            </span>
          </label>
        </div>

        <!-- 메타 정보 -->
        <div style="display: flex; gap: 0.4rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
          <span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: ${server.type === 'built-in' ? '#e8f5e9' : '#fff3e0'}; color: ${server.type === 'built-in' ? '#2e7d32' : '#e65100'}; border-radius: 4px;">
            ${server.type === 'built-in' ? '내장' : '외부'}
          </span>
          <span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: #e3f2fd; color: #1565c0; border-radius: 4px;">
            ${server.tools?.length || 0}개 도구
          </span>
          ${server.port ? `<span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: #fce4ec; color: #c2185b; border-radius: 4px;">포트 ${server.port}</span>` : ''}
        </div>

        <!-- 버튼들 -->
        <div style="display: flex; gap: 0.5rem;">
          ${server.id === 'google-home' ? `
            <button class="btn-settings" data-server-id="${server.id}"
              style="flex: 1; padding: 0.5rem; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">
              ⚙️ 설정 페이지
            </button>
          ` : ''}
          <button class="btn-tools" data-server-id="${server.id}"
            style="flex: 1; padding: 0.5rem; background: ${server.id === 'google-home' ? '#f5f5f5' : '#4285f4'}; color: ${server.id === 'google-home' ? '#333' : 'white'}; border: ${server.id === 'google-home' ? '1px solid #ddd' : 'none'}; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">
            📋 도구 목록
          </button>
          <button class="btn-edit" data-server-id="${server.id}"
            style="padding: 0.5rem; background: #f5f5f5; color: #333; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">
            ✏️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 도구 목록 패널 렌더링
   */
  renderToolsPanel(server, tools) {
    const panel = this.container.querySelector('#toolsPanel');

    panel.innerHTML = `
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h4 style="margin: 0; font-size: 0.95rem; color: #333;">${server.name} 도구</h4>
          <button id="closeToolsPanel" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #666;">✕</button>
        </div>

        ${tools.length === 0 ? `
          <p style="text-align: center; color: #666; font-size: 0.85rem; padding: 1rem;">등록된 도구가 없습니다.</p>
        ` : `
          <div style="display: grid; gap: 0.5rem;">
            ${tools.map(tool => `
              <div style="background: #f9fafb; border: 1px solid #eee; border-radius: 8px; padding: 0.75rem;">
                <div style="font-weight: 600; font-size: 0.85rem; color: #333; margin-bottom: 0.25rem;">🛠️ ${tool.name}</div>
                <div style="font-size: 0.75rem; color: #666;">${tool.description || '설명 없음'}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    panel.style.display = 'block';

    // 닫기 버튼
    panel.querySelector('#closeToolsPanel').addEventListener('click', () => {
      panel.style.display = 'none';
    });
  }

  /**
   * Google Home 관리 페이지 열기
   */
  openGoogleHomeSettings() {
    // 모달 생성
    const modal = document.createElement('div');
    modal.id = 'googleHomeModal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: #f5f5f5; z-index: 2000;
      display: flex; flex-direction: column;
      animation: slideIn 0.3s ease;
    `;

    modal.innerHTML = `
      <style>
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes slideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
      </style>
      <div style="display: flex; align-items: center; padding: 1rem; background: white; border-bottom: 1px solid #e5e7eb;">
        <button id="closeGoogleHome" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: none; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
          ← MCP 허브로 돌아가기
        </button>
      </div>
      <div id="googleHomeContent" style="flex: 1; overflow-y: auto; padding: 1rem;"></div>
    `;

    document.body.appendChild(modal);

    // Google Home Manager 렌더링
    const contentArea = modal.querySelector('#googleHomeContent');
    const googleHomeManager = new GoogleHomeManager(this.apiClient);
    googleHomeManager.render(contentArea);

    // 닫기
    modal.querySelector('#closeGoogleHome').addEventListener('click', () => {
      modal.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => modal.remove(), 300);
    });
  }

  /**
   * MCP 서버 목록 로드
   */
  async loadServers() {
    const response = await this.apiClient.get('/mcp/servers');
    this.servers = response.servers || [];
  }

  /**
   * 서버 도구 목록 로드
   */
  async loadServerTools(serverId) {
    if (this.serverTools[serverId]) {
      return this.serverTools[serverId];
    }

    try {
      const response = await this.apiClient.get(`/mcp/servers/${serverId}/tools`);
      this.serverTools[serverId] = response.tools || [];
      return this.serverTools[serverId];
    } catch (error) {
      console.error(`Failed to load tools for ${serverId}:`, error);
      return [];
    }
  }

  /**
   * 서버 토글
   */
  async toggleServer(serverId, enabled) {
    try {
      await this.apiClient.post(`/mcp/servers/${serverId}/enable`, { enabled });

      // UI 업데이트
      const server = this.servers.find(s => s.id === serverId);
      if (server) {
        server.enabled = enabled;
      }

      // 카드 다시 렌더링
      const cardsContainer = this.container.querySelector('#serverCards');
      if (cardsContainer) {
        cardsContainer.innerHTML = this.renderServerCards();
        this.attachCardListeners();
      }
    } catch (error) {
      console.error('Failed to toggle server:', error);
      alert('서버 상태 변경에 실패했습니다.');
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners() {
    // 새로고침 버튼
    const refreshBtn = this.container.querySelector('#mcpRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.textContent = '⏳ 로딩...';
        await this.loadServers();
        this.serverTools = {}; // 캐시 클리어
        this.renderUI();
        this.attachEventListeners();
      });
    }

    this.attachCardListeners();
  }

  /**
   * 카드 이벤트 리스너
   */
  attachCardListeners() {
    // 토글 스위치
    this.container.querySelectorAll('.server-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const serverId = e.target.dataset.serverId;
        const enabled = e.target.checked;
        this.toggleServer(serverId, enabled);
      });
    });

    // 설정 페이지 버튼 (Google Home)
    this.container.querySelectorAll('.btn-settings').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serverId = e.target.dataset.serverId;
        if (serverId === 'google-home') {
          this.openGoogleHomeSettings();
        }
      });
    });

    // 도구 목록 버튼
    this.container.querySelectorAll('.btn-tools').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const serverId = e.target.dataset.serverId;
        const server = this.servers.find(s => s.id === serverId);

        btn.textContent = '⏳ 로딩...';
        const tools = await this.loadServerTools(serverId);
        btn.textContent = '📋 도구 목록';

        this.renderToolsPanel(server, tools);
      });
    });

    // 편집 버튼
    this.container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serverId = e.target.dataset.serverId;
        const server = this.servers.find(s => s.id === serverId);
        this.openEditModal(server);
      });
    });
  }

  /**
   * MCP 서버 편집 모달
   */
  openEditModal(server) {
    const existingModal = document.getElementById('mcpEditModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'mcpEditModal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
    `;

    // 아이콘 목록 (assets 폴더의 아이콘들)
    const icons = [
      'checklist-icon.webp', 'smarthome-icon.webp', 'cat-icon.webp',
      'terminal-icon.webp', 'mic-icon.webp', 'setup-icom.webp',
      'mcp-icon.webp', 'folder-icon.webp', 'user-icon.webp'
    ];

    modal.innerHTML = `
      <div style="background: white; border-radius: 16px; padding: 1.5rem; width: 90%; max-width: 400px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0; font-size: 1.1rem;">MCP 서버 편집</h3>
          <button id="closeEditModal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">×</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <!-- 이름 -->
          <div>
            <label style="font-size: 0.85rem; color: #666; display: block; margin-bottom: 0.25rem;">이름</label>
            <input type="text" id="editName" value="${server.name}" 
              style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9rem; box-sizing: border-box;">
          </div>

          <!-- URL -->
          <div>
            <label style="font-size: 0.85rem; color: #666; display: block; margin-bottom: 0.25rem;">URL (UI 페이지)</label>
            <input type="text" id="editUrl" value="${server.uiUrl || ''}" placeholder="https://example.com/ui/"
              style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9rem; box-sizing: border-box;">
          </div>

          <!-- 아이콘 선택 -->
          <div>
            <label style="font-size: 0.85rem; color: #666; display: block; margin-bottom: 0.5rem;">아이콘</label>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${icons.map(icon => `
                <div class="icon-option" data-icon="${icon}" 
                  style="width: 48px; height: 48px; border: 2px solid ${server.icon === icon ? '#4285f4' : '#ddd'}; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: ${server.icon === icon ? '#e3f2fd' : '#f9f9f9'};">
                  <img src="./src/assets/${icon}" style="width: 32px; height: 32px;" alt="${icon}">
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 독에 표시 -->
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="editShowInDock" ${server.showInDock ? 'checked' : ''} style="width: 18px; height: 18px;">
            <label for="editShowInDock" style="font-size: 0.9rem;">독(Dock)에 표시</label>
          </div>

          <!-- 저장 버튼 -->
          <button id="saveEdit" style="width: 100%; padding: 0.75rem; background: #4285f4; color: white; border: none; border-radius: 8px; font-size: 0.95rem; cursor: pointer;">
            저장
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 선택된 아이콘 저장
    let selectedIcon = server.icon || icons[0];

    // 아이콘 선택 이벤트
    modal.querySelectorAll('.icon-option').forEach(opt => {
      opt.addEventListener('click', () => {
        modal.querySelectorAll('.icon-option').forEach(o => {
          o.style.border = '2px solid #ddd';
          o.style.background = '#f9f9f9';
        });
        opt.style.border = '2px solid #4285f4';
        opt.style.background = '#e3f2fd';
        selectedIcon = opt.dataset.icon;
      });
    });

    // 닫기
    modal.querySelector('#closeEditModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // 저장
    modal.querySelector('#saveEdit').addEventListener('click', async () => {
      const name = modal.querySelector('#editName').value;
      const uiUrl = modal.querySelector('#editUrl').value;
      const showInDock = modal.querySelector('#editShowInDock').checked;

      await this.updateServer(server.id, { name, uiUrl, icon: selectedIcon, showInDock });
      modal.remove();
      
      // 독에 표시 변경 시 독 업데이트
      if (showInDock !== server.showInDock) {
        await this.updateDock();
      }
    });
  }

  /**
   * 서버 정보 업데이트
   */
  async updateServer(serverId, updates) {
    try {
      await this.apiClient.post(`/api/mcp/servers/${serverId}`, updates);
      await this.loadServers();
      this.renderUI();
      this.attachEventListeners();
    } catch (error) {
      console.error('서버 업데이트 실패:', error);
    }
  }

  /**
   * 독 업데이트 (showInDock 기반)
   */
  async updateDock() {
    try {
      // showInDock이 true인 서버들로 독 구성
      const dockItems = this.servers
        .filter(s => s.showInDock && s.uiUrl)
        .map((s, idx) => ({
          id: s.id,
          name: s.name,
          icon: s.icon || 'mcp-icon.webp',
          url: s.uiUrl,
          order: idx
        }));

      // 고정 아이템 추가 (터미널, 마이크, 설정)
      const fixedItems = [
        { id: 'terminal', name: '터미널', icon: 'terminal-icon.webp', url: null, order: 100 },
        { id: 'mic', name: '마이크', icon: 'mic-icon.webp', url: null, order: 101 },
        { id: 'settings', name: '설정', icon: 'setup-icom.webp', url: null, order: 102 }
      ];

      await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [...dockItems, ...fixedItems] })
      });

      // SoulApp 독 새로고침
      if (window.soulApp) {
        window.soulApp.initMacosDock();
      }
    } catch (error) {
      console.error('독 업데이트 실패:', error);
    }
  }
}
