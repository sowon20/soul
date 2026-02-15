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

      <!-- 네트워크 -->
      <div class="network-settings-section" style="margin-top: 24px;">
        <h3>네트워크</h3>
        <p style="font-size: 13px; color: var(--text-secondary, #888); margin: 4px 0 0;">같은 Wi-Fi에서 <strong>soul.local:5041</strong> 으로 접속</p>

        <!-- DDNS -->
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color, #e0e0e0);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-size: 14px; font-weight: 500;">외부 접속 (DDNS)</span>
            <label class="mcp-toggle">
              <input type="checkbox" id="ddnsToggle">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div id="ddnsSettings" style="display: none;">
            <div style="margin-bottom: 10px;">
              <label style="font-size: 12px; color: var(--text-secondary, #888);">프로바이더</label>
              <select id="ddnsProvider" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px; margin-top: 4px;">
                <option value="">선택</option>
                <option value="duckdns">DuckDNS</option>
                <option value="freedns">FreeDNS (afraid.org)</option>
                <option value="noip">No-IP</option>
              </select>
            </div>

            <!-- DuckDNS 필드 -->
            <div id="ddnsFields-duckdns" class="ddns-fields" style="display: none;">
              <div style="margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--text-secondary, #888);">서브도메인</label>
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                  <input type="text" id="ddns-duckdns-subdomain" placeholder="mysoul" style="flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px;">
                  <span style="font-size: 12px; color: var(--text-secondary, #888);">.duckdns.org</span>
                </div>
              </div>
              <div style="margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--text-secondary, #888);">Token</label>
                <input type="password" id="ddns-duckdns-token" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px; margin-top: 4px;">
              </div>
            </div>

            <!-- FreeDNS 필드 -->
            <div id="ddnsFields-freedns" class="ddns-fields" style="display: none;">
              <div style="margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--text-secondary, #888);">Update Token</label>
                <input type="password" id="ddns-freedns-token" placeholder="Direct URL의 해시값" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px; margin-top: 4px;">
                <p style="font-size: 11px; color: var(--text-secondary, #888); margin: 4px 0 0;">freedns.afraid.org > Dynamic DNS 페이지에서 Direct URL 끝부분의 해시</p>
              </div>
              <div style="margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--text-secondary, #888);">도메인 (표시용)</label>
                <input type="text" id="ddns-freedns-domain" placeholder="mysoul.mooo.com" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px; margin-top: 4px;">
              </div>
            </div>

            <!-- No-IP 필드 -->
            <div id="ddnsFields-noip" class="ddns-fields" style="display: none;">
              <div style="margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--text-secondary, #888);">호스트명</label>
                <input type="text" id="ddns-noip-hostname" placeholder="mysoul.ddns.net" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px; margin-top: 4px;">
              </div>
              <div style="margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--text-secondary, #888);">사용자명</label>
                <input type="text" id="ddns-noip-username" placeholder="이메일 또는 사용자명" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px; margin-top: 4px;">
              </div>
              <div style="margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--text-secondary, #888);">비밀번호</label>
                <input type="password" id="ddns-noip-password" placeholder="비밀번호" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--input-bg, #fff); color: var(--text-primary, #333); font-size: 13px; margin-top: 4px;">
              </div>
            </div>

            <button id="ddnsSaveBtn" style="width: 100%; padding: 8px; border-radius: 8px; border: none; background: var(--accent-color, #007aff); color: white; font-size: 13px; cursor: pointer; margin-top: 8px;">저장 및 테스트</button>
            <div id="ddnsStatus" style="margin-top: 8px; font-size: 12px; color: var(--text-secondary, #888);"></div>
          </div>
        </div>
      </div>
    `;

    // 선제메시지/웹검색은 독 설정에서 관리

    // 도구 라우팅 토글 초기화


    // DDNS 초기화
    this.initDDNS();
  }

  /**
   * 프로액티브 토글 초기화
   */
  async initProactiveToggle() {
    const toggle = document.getElementById('proactiveToggle');
    const status = document.getElementById('proactiveStatus');
    if (!toggle) return;

    // 현재 상태 로드
    try {
      const res = await this.apiClient.get('/notifications/proactive/status');
      toggle.checked = res.enabled;
      status.textContent = res.enabled ? '활성 - 선제 메시지 도구 4개 포함 중' : '비활성 - 토큰 절약 중';
    } catch (e) {
      status.textContent = '상태 확인 실패';
    }

    // 토글 이벤트
    toggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      status.textContent = '변경 중...';
      try {
        const res = await this.apiClient.post('/notifications/proactive/toggle', { enabled });
        status.textContent = res.enabled ? '활성 - 선제 메시지 도구 4개 포함 중' : '비활성 - 토큰 절약 중';
      } catch (err) {
        console.error('프로액티브 토글 실패:', err);
        e.target.checked = !enabled; // 롤백
        status.textContent = '변경 실패';
      }
    });
  }

  /**
   * 웹검색 토글 초기화
   */
  async initWebSearchToggle() {
    const toggle = document.getElementById('webSearchToggle');
    const status = document.getElementById('webSearchStatus');
    if (!toggle) return;

    // 현재 상태 로드
    try {
      const res = await fetch('/api/config/web-search');
      const data = await res.json();

      // API 키가 설정되지 않았으면 토글 비활성화
      if (!data.configured) {
        toggle.disabled = true;
        toggle.checked = false;
        status.textContent = 'API 키 미설정 - AI 설정에서 먼저 키를 입력하세요';
        status.style.color = 'var(--error-color, #f44336)';
      } else {
        toggle.disabled = false;
        toggle.checked = data.enabled;
        status.textContent = data.enabled ? '활성 - 웹검색 도구 포함 중' : '비활성 - 토큰 절약 중';
        status.style.color = 'var(--text-secondary, #888)';
      }
    } catch (e) {
      status.textContent = '상태 확인 실패';
    }

    // 토글 이벤트
    toggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      status.textContent = '변경 중...';
      try {
        const res = await fetch('/api/config/web-search/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const result = await res.json();

        if (!result.success) {
          throw new Error(result.error || '변경 실패');
        }

        status.textContent = result.enabled ? '활성 - 웹검색 도구 포함 중' : '비활성 - 토큰 절약 중';
        status.style.color = 'var(--text-secondary, #888)';
      } catch (err) {
        console.error('웹검색 토글 실패:', err);
        e.target.checked = !enabled; // 롤백
        status.textContent = err.message || '변경 실패';
        status.style.color = 'var(--error-color, #f44336)';
      }
    });
  }

  /**
   * DDNS 설정 초기화
   */
  async initDDNS() {
    const toggle = document.getElementById('ddnsToggle');
    const settings = document.getElementById('ddnsSettings');
    const provider = document.getElementById('ddnsProvider');
    const saveBtn = document.getElementById('ddnsSaveBtn');
    const statusEl = document.getElementById('ddnsStatus');

    if (!toggle) return;

    // 기존 설정 로드
    try {
      const res = await fetch('/api/config/ddns');
      const data = await res.json();
      const config = data.config || {};

      toggle.checked = config.enabled || false;
      settings.style.display = config.enabled ? 'block' : 'none';

      if (config.provider) {
        provider.value = config.provider;
        this._showDDNSFields(config.provider);
        this._fillDDNSFields(config);
      }

      if (data.publicIP) {
        statusEl.textContent = `공인 IP: ${data.publicIP}`;
      }
    } catch (err) {
      console.warn('DDNS 설정 로드 실패:', err);
    }

    // 토글
    toggle.addEventListener('change', () => {
      settings.style.display = toggle.checked ? 'block' : 'none';
      if (!toggle.checked) {
        // 비활성화 저장
        this._saveDDNS({ enabled: false, provider: '' });
      }
    });

    // 프로바이더 변경
    provider.addEventListener('change', () => {
      this._showDDNSFields(provider.value);
    });

    // 저장
    saveBtn.addEventListener('click', async () => {
      const config = this._collectDDNSConfig();
      if (!config) return;

      saveBtn.disabled = true;
      saveBtn.textContent = '테스트 중...';
      statusEl.textContent = '';

      try {
        const result = await this._saveDDNS(config);
        if (result.success) {
          statusEl.style.color = '#34c759';
          statusEl.textContent = result.result
            ? `${result.result.domain} → ${result.result.ip} (${result.result.changed ? '갱신됨' : '확인됨'})`
            : 'DDNS 비활성화됨';
        } else {
          statusEl.style.color = '#ff3b30';
          statusEl.textContent = `실패: ${result.error}`;
        }
      } catch (err) {
        statusEl.style.color = '#ff3b30';
        statusEl.textContent = `오류: ${err.message}`;
      }

      saveBtn.disabled = false;
      saveBtn.textContent = '저장 및 테스트';
    });
  }

  _showDDNSFields(provider) {
    document.querySelectorAll('.ddns-fields').forEach(el => el.style.display = 'none');
    if (provider) {
      const fields = document.getElementById(`ddnsFields-${provider}`);
      if (fields) fields.style.display = 'block';
    }
  }

  _fillDDNSFields(config) {
    switch (config.provider) {
      case 'duckdns':
        document.getElementById('ddns-duckdns-subdomain').value = config.subdomain || '';
        document.getElementById('ddns-duckdns-token').value = config.token || '';
        break;
      case 'freedns':
        document.getElementById('ddns-freedns-token').value = config.updateToken || '';
        document.getElementById('ddns-freedns-domain').value = config.domain || '';
        break;
      case 'noip':
        document.getElementById('ddns-noip-hostname').value = config.hostname || '';
        document.getElementById('ddns-noip-username').value = config.username || '';
        document.getElementById('ddns-noip-password').value = config.password || '';
        break;
    }
  }

  _collectDDNSConfig() {
    const provider = document.getElementById('ddnsProvider').value;
    if (!provider) return null;

    const base = { enabled: true, provider };

    switch (provider) {
      case 'duckdns':
        return { ...base,
          subdomain: document.getElementById('ddns-duckdns-subdomain').value.trim(),
          token: document.getElementById('ddns-duckdns-token').value.trim()
        };
      case 'freedns':
        return { ...base,
          updateToken: document.getElementById('ddns-freedns-token').value.trim(),
          domain: document.getElementById('ddns-freedns-domain').value.trim()
        };
      case 'noip':
        return { ...base,
          hostname: document.getElementById('ddns-noip-hostname').value.trim(),
          username: document.getElementById('ddns-noip-username').value.trim(),
          password: document.getElementById('ddns-noip-password').value.trim()
        };
      default:
        return null;
    }
  }

  async _saveDDNS(config) {
    const res = await fetch('/api/config/ddns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return await res.json();
  }

  /**
   * MCP 서버 관리 렌더링
   */
  async renderMCPSettings(container) {
    container.innerHTML = `
      <div class="mcp-settings-section">
        <!-- 내장 도구 섹션 -->
        <div class="builtin-tools-section">
          <div class="mcp-header">
            <h3>🔧 내장 도구 (31개)</h3>
            <p style="font-size: 12px; color: var(--text-secondary); margin: 4px 0 0;">독에 표시할 도구를 선택하세요</p>
          </div>
          <div class="builtin-tools-list" id="builtinToolsList">
            <div class="mcp-loading">도구 목록 로딩 중...</div>
          </div>
        </div>

        <!-- 구분선 -->
        <div style="border-top: 1px solid var(--border-color); margin: 32px 0;"></div>

        <!-- MCP 서버 섹션 -->
        <div class="mcp-header">
          <h3>🔌 외부 MCP 서버</h3>
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

    // 내장 도구 + 서버 목록 로드
    await Promise.all([
      this.loadBuiltinTools(),
      this.loadMCPServers()
    ]);
  }

  /**
   * 내장 도구 목록 로드
   */
  async loadBuiltinTools() {
    const listContainer = document.getElementById('builtinToolsList');

    try {
      // 31개 내장 도구 + 현재 독 설정 가져오기
      const [toolsRes, dockRes] = await Promise.all([
        fetch('/api/tools/builtin/list'),
        fetch('/api/config/dock')
      ]);

      const toolsData = await toolsRes.json();
      const dockItems = await dockRes.json();

      const allTools = toolsData.tools || [];

      // 섹션 정의 (독에 들어갈 단위)
      const sections = {
        'A. 메모리 & 프로필': {
          id: 'section_memory',
          icon: 'mcp-icon.webp', // TODO: 전용 아이콘
          tools: ['recall_memory', 'save_memory', 'update_memory', 'list_memories', 'get_profile', 'update_profile', 'update_tags']
        },
        'B. 메시징': {
          id: 'section_messaging',
          icon: 'mic-icon.webp',
          tools: ['send_message', 'schedule_message', 'cancel_scheduled_message', 'list_scheduled_messages']
        },
        'C. 캘린더': {
          id: 'section_calendar',
          icon: 'checklist-icon.webp',
          tools: ['get_events', 'create_event', 'update_event', 'delete_event']
        },
        'D. 할일': {
          id: 'section_todo',
          icon: 'checklist-icon.webp',
          tools: ['manage_todo']
        },
        'E. 메모': {
          id: 'section_note',
          icon: 'folder-icon.webp',
          tools: ['manage_note']
        },
        'F. 웹 브라우저': {
          id: 'section_browser',
          icon: 'terminal-icon.webp',
          tools: ['search_web', 'read_url', 'browse']
        },
        'G. 파일시스템': {
          id: 'section_filesystem',
          icon: 'folder-icon.webp',
          tools: ['file_read', 'file_write', 'file_list', 'file_info']
        },
        'H. 클라우드 스토리지': {
          id: 'section_cloud',
          icon: 'smarthome-icon.webp',
          tools: ['cloud_search', 'cloud_read', 'cloud_write', 'cloud_delete', 'cloud_list']
        },
        'I. 시스템': {
          id: 'section_system',
          icon: 'terminal-icon.webp',
          tools: ['open_terminal', 'execute_command', 'get_weather']
        }
      };

      let html = '';
      for (const [sectionName, sectionData] of Object.entries(sections)) {
        // 이 섹션이 독에 표시되는지 확인
        const inDock = dockItems.find(d => d.id === sectionData.id);

        html += `
          <div class="builtin-tool-category">
            <h4 class="builtin-category-title" data-section-id="${sectionData.id}">
              <span>${sectionName}</span>
              <div style="display: flex; align-items: center; gap: 12px;">
                <button class="icon-select-btn" data-section-id="${sectionData.id}" title="아이콘 선택">
                  <img src="/assets/${inDock?.icon || sectionData.icon}" style="width: 24px; height: 24px;" alt="icon">
                </button>
                <label class="mcp-toggle category-dock-toggle" title="독에 표시/숨김">
                  <input type="checkbox" ${inDock ? 'checked' : ''} data-section-id="${sectionData.id}" data-section-name="${sectionName}">
                  <span class="toggle-slider"></span>
                </label>
                <span class="category-arrow">▼</span>
              </div>
            </h4>
            <div class="builtin-tool-list" data-category-content="${sectionName}">
              ${sectionData.tools.map(toolName => {
                const tool = allTools.find(t => t.name === toolName);
                if (!tool) return '';

                return `
                  <div class="builtin-tool-item">
                    <div>
                      <div style="font-weight: 500; font-size: 0.875rem; color: rgba(255,255,255,0.9);">${toolName}</div>
                      <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">${tool.description}</div>
                    </div>
                  </div>
                `;
              }).join('')}
              ${sectionData.tools.includes('search_web') ? `
                <div style="margin-top: 12px; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);">
                  <div style="font-size: 0.85rem; font-weight: 500; color: rgba(255,255,255,0.85); margin-bottom: 4px;">Tavily API 키</div>
                  <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); margin-bottom: 8px;">웹 검색 기능 사용에 필요</div>
                  <input type="password" id="webSearchApiKeyInput_${sectionData.id}" placeholder="tvly-..." style="width: 100%; padding: 8px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background: rgba(0,0,0,0.3); color: white; font-size: 0.8rem; box-sizing: border-box; margin-bottom: 8px;">
                  <div style="display: flex; gap: 6px;">
                    <button class="web-search-save-btn" data-section-id="${sectionData.id}" style="flex: 1; padding: 8px; border: none; border-radius: 6px; background: rgba(66,133,244,0.8); color: white; font-size: 0.75rem; cursor: pointer; font-weight: 500;">저장</button>
                    <button class="web-search-delete-btn" data-section-id="${sectionData.id}" style="display: none; padding: 8px; border: none; border-radius: 6px; background: rgba(244,67,54,0.8); color: white; font-size: 0.75rem; cursor: pointer; font-weight: 500;">삭제</button>
                  </div>
                  <div class="web-search-status" data-section-id="${sectionData.id}" style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 6px;"></div>
                </div>
              ` : ''}
              ${sectionData.tools.includes('get_weather') ? `
                <div style="margin-top: 12px; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);">
                  <div style="font-size: 0.85rem; font-weight: 500; color: rgba(255,255,255,0.85); margin-bottom: 4px;">기상청 API 키</div>
                  <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); margin-bottom: 8px;">공공데이터포털 기상청 서비스키 (단기+중기 예보). 없으면 Open-Meteo 사용</div>
                  <input type="password" id="weatherApiKeyInput_${sectionData.id}" placeholder="서비스키 입력..." style="width: 100%; padding: 8px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background: rgba(0,0,0,0.3); color: white; font-size: 0.8rem; box-sizing: border-box; margin-bottom: 8px;">
                  <div style="display: flex; gap: 6px;">
                    <button class="weather-save-btn" data-section-id="${sectionData.id}" style="flex: 1; padding: 8px; border: none; border-radius: 6px; background: rgba(66,133,244,0.8); color: white; font-size: 0.75rem; cursor: pointer; font-weight: 500;">저장</button>
                    <button class="weather-delete-btn" data-section-id="${sectionData.id}" style="display: none; padding: 8px; border: none; border-radius: 6px; background: rgba(244,67,54,0.8); color: white; font-size: 0.75rem; cursor: pointer; font-weight: 500;">삭제</button>
                  </div>
                  <div class="weather-status" data-section-id="${sectionData.id}" style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 6px;"></div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }

      listContainer.innerHTML = html;

      // 카테고리 접기/펼치기 이벤트 (화살표 클릭 시만)
      listContainer.querySelectorAll('.category-arrow').forEach(arrow => {
        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          const title = e.target.closest('.builtin-category-title');
          const sectionName = Object.keys(sections).find(name =>
            sections[name].id === title.dataset.sectionId
          );
          const content = listContainer.querySelector(`[data-category-content="${sectionName}"]`);
          const isCollapsed = title.classList.toggle('collapsed');
          if (isCollapsed) {
            content.style.display = 'none';
          } else {
            content.style.display = 'flex';
          }
        });
      });

      // 아이콘 선택 버튼
      listContainer.querySelectorAll('.icon-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sectionId = e.currentTarget.dataset.sectionId;
          const sectionName = Object.keys(sections).find(name => sections[name].id === sectionId);
          this.showIconSelectorModal(sectionId, sectionName, sections[sectionName], dockItems);
        });
      });

      // 섹션 독 토글
      listContainer.querySelectorAll('.category-dock-toggle input').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
          e.stopPropagation();
          const sectionId = e.target.dataset.sectionId;
          const sectionName = e.target.dataset.sectionName;
          const isChecked = e.target.checked;
          const sectionData = sections[sectionName];
          await this.toggleSectionDock(sectionId, sectionName, sectionData, isChecked, dockItems);
        });
      });

      // 웹 검색 API 키 설정
      this.setupWebSearchApiKeyUI(listContainer);

      // 날씨 API 키 설정
      this.setupWeatherApiKeyUI(listContainer);
    } catch (error) {
      console.error('내장 도구 목록 로드 실패:', error);
      listContainer.innerHTML = `
        <div class="mcp-error">
          <p>❌ 도구 목록을 불러올 수 없습니다</p>
          <p class="error-detail">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 섹션 독 토글 (섹션 단위로 독에 추가/제거)
   */
  async toggleSectionDock(sectionId, sectionName, sectionData, enabled, currentDockItems) {
    try {
      let newDockItems = [...currentDockItems];

      if (enabled) {
        // 섹션을 독에 추가
        const alreadyExists = newDockItems.find(item => item.id === sectionId);
        if (!alreadyExists) {
          // 설정 아이콘(fixed) 찾기
          const settingsIdx = newDockItems.findIndex(item => item.fixed && item.id === 'settings');

          const newItem = {
            id: sectionId,
            name: sectionName,
            icon: sectionData.icon,
            order: 0, // 임시값, 아래에서 재정렬됨
            fixed: false,
            isBuiltinSection: true, // 섹션임을 표시
            tools: sectionData.tools // 포함된 도구 목록
          };

          // 설정 아이콘이 있으면 그 앞에 삽입, 없으면 맨 끝에 추가
          if (settingsIdx !== -1) {
            newDockItems.splice(settingsIdx, 0, newItem);
          } else {
            newDockItems.push(newItem);
          }
        }
      } else {
        // 섹션을 독에서 제거
        newDockItems = newDockItems.filter(item => item.id !== sectionId);
      }

      // order 재정렬 (설정은 항상 맨 끝으로)
      newDockItems.sort((a, b) => {
        if (a.id === 'settings') return 1;
        if (b.id === 'settings') return -1;
        return 0;
      });
      newDockItems.forEach((item, idx) => {
        item.order = idx;
      });

      // 저장
      console.log('💾 섹션 토글 - 독 저장 중:', newDockItems);
      const res = await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDockItems)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`저장 실패: ${res.status} ${errorText}`);
      }

      // UI 새로고침
      await this.loadBuiltinTools();

      // 독 새로고침 (즉시 반영)
      if (window.soulApp && typeof window.soulApp.initMacosDock === 'function') {
        window.soulApp.initMacosDock();
      }

      console.log('✅ 섹션 토글 성공:', sectionName, enabled ? '추가' : '제거');
    } catch (error) {
      console.error('섹션 토글 실패:', error);
      alert('설정을 저장할 수 없습니다');
      // 체크박스 원상복구
      const toggle = document.querySelector(`.category-dock-toggle input[data-section-id="${sectionId}"]`);
      if (toggle) {
        toggle.checked = !enabled;
      }
    }
  }

  /**
   * 웹 검색 API 키 UI 설정
   */
  async setupWebSearchApiKeyUI(container) {
    // 저장 버튼
    container.querySelectorAll('.web-search-save-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const sectionId = e.currentTarget.dataset.sectionId;
        const input = container.querySelector(`#webSearchApiKeyInput_${sectionId}`);
        const status = container.querySelector(`.web-search-status[data-section-id="${sectionId}"]`);
        const deleteBtn = container.querySelector(`.web-search-delete-btn[data-section-id="${sectionId}"]`);

        if (!input || !status) return;

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
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
          } else {
            throw new Error(result.error);
          }
        } catch (e) {
          status.textContent = '⚠ 저장 실패: ' + e.message;
          status.style.color = 'rgba(244,67,54,0.8)';
        }
      });
    });

    // 삭제 버튼
    container.querySelectorAll('.web-search-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('웹 검색 API 키를 삭제하시겠습니까?')) return;

        const sectionId = e.currentTarget.dataset.sectionId;
        const status = container.querySelector(`.web-search-status[data-section-id="${sectionId}"]`);
        const deleteBtn = e.currentTarget;

        try {
          const res = await fetch('/api/config/web-search', { method: 'DELETE' });
          const result = await res.json();

          if (result.success) {
            status.textContent = 'API 키 미설정';
            status.style.color = 'rgba(255,255,255,0.4)';
            deleteBtn.style.display = 'none';
          }
        } catch (e) {
          status.textContent = '⚠ 삭제 실패';
          status.style.color = 'rgba(244,67,54,0.8)';
        }
      });
    });

    // 현재 상태 로드
    setTimeout(async () => {
      try {
        const res = await fetch('/api/config/web-search');
        const data = await res.json();

        container.querySelectorAll('.web-search-status').forEach(status => {
          const sectionId = status.dataset.sectionId;
          const deleteBtn = container.querySelector(`.web-search-delete-btn[data-section-id="${sectionId}"]`);

          if (data.configured) {
            status.textContent = '✓ API 키 설정됨';
            status.style.color = 'rgba(76,175,80,0.8)';
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
          } else {
            status.textContent = 'API 키 미설정';
          }
        });
      } catch (e) {
        console.error('웹 검색 API 키 상태 확인 실패:', e);
      }
    }, 100);
  }

  /**
   * 날씨 API 키 UI 설정
   */
  async setupWeatherApiKeyUI(container) {
    // 저장 버튼
    container.querySelectorAll('.weather-save-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const sectionId = e.currentTarget.dataset.sectionId;
        const input = container.querySelector(`#weatherApiKeyInput_${sectionId}`);
        const status = container.querySelector(`.weather-status[data-section-id="${sectionId}"]`);
        const deleteBtn = container.querySelector(`.weather-delete-btn[data-section-id="${sectionId}"]`);
        if (!input || !status) return;

        if (!input.value.trim()) {
          status.textContent = 'API 키를 입력하세요';
          status.style.color = 'rgba(244,67,54,0.8)';
          return;
        }

        try {
          const res = await fetch('/api/config/weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: input.value.trim() })
          });
          const result = await res.json();
          if (result.success) {
            input.value = '';
            status.textContent = '저장 완료 (기상청 예보 사용)';
            status.style.color = 'rgba(76,175,80,0.8)';
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
          } else throw new Error(result.error);
        } catch (e) {
          status.textContent = '저장 실패: ' + e.message;
          status.style.color = 'rgba(244,67,54,0.8)';
        }
      });
    });

    // 삭제 버튼
    container.querySelectorAll('.weather-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('기상청 API 키를 삭제하시겠습니까? Open-Meteo로 전환됩니다.')) return;
        const sectionId = e.currentTarget.dataset.sectionId;
        const status = container.querySelector(`.weather-status[data-section-id="${sectionId}"]`);
        try {
          const res = await fetch('/api/config/weather', { method: 'DELETE' });
          const result = await res.json();
          if (result.success) {
            status.textContent = 'Open-Meteo 사용 중';
            status.style.color = 'rgba(255,255,255,0.4)';
            e.currentTarget.style.display = 'none';
          }
        } catch (e) {
          status.textContent = '삭제 실패';
          status.style.color = 'rgba(244,67,54,0.8)';
        }
      });
    });

    // 현재 상태 로드
    setTimeout(async () => {
      try {
        const res = await fetch('/api/config/weather');
        const data = await res.json();
        container.querySelectorAll('.weather-status').forEach(status => {
          const sectionId = status.dataset.sectionId;
          const deleteBtn = container.querySelector(`.weather-delete-btn[data-section-id="${sectionId}"]`);
          if (data.configured) {
            status.textContent = '기상청 예보 사용 중';
            status.style.color = 'rgba(76,175,80,0.8)';
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
          } else {
            status.textContent = 'Open-Meteo 사용 중 (기상청 키 미설정)';
          }
        });
      } catch (e) {
        console.error('날씨 API 키 상태 확인 실패:', e);
      }
    }, 100);
  }

  /**
   * 아이콘 선택 모달
   */
  showIconSelectorModal(sectionId, sectionName, sectionData, currentDockItems) {
    const icons = [
      'checklist-icon.webp', 'smarthome-icon.webp', 'cat-icon.webp',
      'terminal-icon.webp', 'mic-icon.webp', 'setup-icom.webp',
      'mcp-icon.webp', 'folder-icon.webp', 'user-icon.webp', 'tool-icon.webp'
    ];

    const dockItem = currentDockItems.find(item => item.id === sectionId);
    const currentIcon = dockItem?.icon || sectionData.icon;

    const modal = document.createElement('div');
    modal.className = 'mcp-modal';
    modal.innerHTML = `
      <div class="mcp-modal-content">
        <div class="mcp-modal-header">
          <h3>${sectionName} - 아이콘 선택</h3>
          <button class="mcp-modal-close">✕</button>
        </div>
        <div class="mcp-modal-body">
          <div class="form-group">
            <label>아이콘</label>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
              ${icons.map(icon => `
                <div class="icon-option" data-icon="${icon}"
                  style="width: 40px; height: 40px; border: 2px solid ${currentIcon === icon ? '#4285f4' : '#ddd'};
                  border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
                  background: ${currentIcon === icon ? '#e3f2fd' : '#f9f9f9'};">
                  <img src="/assets/${icon}" style="width: 28px; height: 28px;" alt="${icon}">
                </div>
              `).join('')}
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-cancel">취소</button>
            <button type="button" class="btn-save">저장</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let selectedIcon = currentIcon;

    // 아이콘 선택
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
    modal.querySelector('.mcp-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // 저장
    modal.querySelector('.btn-save').addEventListener('click', async () => {
      await this.updateSectionIcon(sectionId, selectedIcon, currentDockItems);
      modal.remove();
    });
  }

  /**
   * 섹션 아이콘 업데이트
   */
  async updateSectionIcon(sectionId, newIcon, currentDockItems) {
    try {
      const newDockItems = currentDockItems.map(item => {
        if (item.id === sectionId) {
          return { ...item, icon: newIcon };
        }
        return item;
      });

      const res = await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDockItems)
      });

      if (!res.ok) {
        throw new Error('저장 실패');
      }

      await this.loadBuiltinTools();

      // 독 새로고침 (즉시 반영)
      if (window.soulApp && typeof window.soulApp.initMacosDock === 'function') {
        window.soulApp.initMacosDock();
      }

      console.log('✅ 아이콘 업데이트 성공:', sectionId, newIcon);
    } catch (error) {
      console.error('아이콘 업데이트 실패:', error);
      alert('아이콘을 저장할 수 없습니다');
    }
  }

  /**
   * === 레거시 메서드 (사용 안 함) ===
   */

  /**
   * MCP 서버 목록 로드
   */
  async loadMCPServers_LEGACY() {
    if (!tool) return;

    // 아이콘 목록 (외부 MCP와 동일)
    const icons = [
      'checklist-icon.webp', 'smarthome-icon.webp', 'cat-icon.webp',
      'terminal-icon.webp', 'mic-icon.webp', 'setup-icom.webp',
      'mcp-icon.webp', 'folder-icon.webp', 'user-icon.webp', 'tool-icon.webp'
    ];

    const modal = document.createElement('div');
    modal.className = 'mcp-modal';
    modal.innerHTML = `
      <div class="mcp-modal-content">
        <div class="mcp-modal-header">
          <h3>내장 도구 설정</h3>
          <button class="mcp-modal-close">✕</button>
        </div>
        <div class="mcp-modal-body">
          <form id="builtinToolForm" class="mcp-form">
            <div class="form-group">
              <label>도구 이름</label>
              <input type="text" value="${toolName}" disabled style="background: #f5f5f5; color: #888;">
            </div>
            <div class="form-group">
              <label>설명</label>
              <input type="text" value="${tool.description}" disabled style="background: #f5f5f5; color: #888;">
            </div>
            <div class="form-group">
              <label>아이콘</label>
              <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                ${icons.map(icon => `
                  <div class="icon-option" data-icon="${icon}"
                    style="width: 40px; height: 40px; border: 2px solid ${(currentDockItem?.icon || 'tool-icon.webp') === icon ? '#4285f4' : '#ddd'};
                    border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
                    background: ${(currentDockItem?.icon || 'tool-icon.webp') === icon ? '#e3f2fd' : '#f9f9f9'};">
                    <img src="/assets/${icon}" style="width: 28px; height: 28px;" alt="${icon}">
                  </div>
                `).join('')}
              </div>
              <input type="hidden" name="icon" value="${currentDockItem?.icon || 'tool-icon.webp'}">
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" name="showInDock" id="showInDock" ${currentDockItem ? 'checked' : ''}>
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
    modal.querySelector('#builtinToolForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const showInDock = formData.get('showInDock') === 'on';
      const icon = formData.get('icon');

      await this.saveBuiltinToolConfig(toolName, tool, showInDock, icon, allDockItems);
      modal.remove();
    });
  }

  /**
   * 내장 도구 설정 저장
   */
  async saveBuiltinToolConfig(toolName, tool, showInDock, icon, currentDockItems) {
    try {
      let newDockItems = [...currentDockItems];

      if (showInDock) {
        // 독에 추가 또는 업데이트
        const existingIndex = newDockItems.findIndex(item => item.id === toolName);
        const dockItem = {
          id: toolName,
          name: tool.description || toolName,
          icon: icon || 'tool-icon.webp',
          order: existingIndex >= 0 ? newDockItems[existingIndex].order : newDockItems.length,
          fixed: false,
          isBuiltin: true
        };

        if (existingIndex >= 0) {
          newDockItems[existingIndex] = dockItem;
        } else {
          newDockItems.push(dockItem);
        }
      } else {
        // 독에서 제거
        newDockItems = newDockItems.filter(item => item.id !== toolName);
        // order 재정렬
        newDockItems.forEach((item, idx) => {
          item.order = idx;
        });
      }

      // 저장 (배열을 직접 전송)
      console.log('💾 독 저장 중:', newDockItems);
      const res = await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDockItems)
      });

      console.log('✅ 저장 응답:', res.status, res.statusText);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ 저장 실패:', errorText);
        throw new Error(`저장 실패: ${res.status} ${errorText}`);
      }

      const result = await res.json();
      console.log('✅ 저장 성공:', result);

      // UI 새로고침
      await this.loadBuiltinTools();

      // 성공 메시지 (showToast 없으면 console로 대체)
      const message = showInDock ? `"${tool.description}" 독에 추가됨` : `"${tool.description}" 독에서 제거됨`;
      if (window.soulApp && typeof window.soulApp.showToast === 'function') {
        window.soulApp.showToast(message, 2000);
      } else {
        console.log('✅', message);
      }
    } catch (error) {
      console.error('도구 설정 저장 실패:', error);
      alert('설정을 저장할 수 없습니다: ' + error.message);
    }
  }

  /**
   * 내장 도구 독에 추가/제거 (레거시 메서드 - 제거 예정)
   */
  async toggleBuiltinTool(toolName, enabled, currentDockItems) {
    try {
      const toolsRes = await fetch('/api/tools/builtin/list');
      const toolsData = await toolsRes.json();
      const tool = toolsData.tools.find(t => t.name === toolName);

      if (!tool) {
        alert('도구를 찾을 수 없습니다');
        return;
      }

      let newDockItems = [...currentDockItems];

      if (enabled) {
        // 독에 추가
        const alreadyExists = newDockItems.find(item => item.id === toolName);
        if (!alreadyExists) {
          newDockItems.push({
            id: toolName,
            name: tool.description || toolName,
            icon: 'tool-icon.webp', // 기본 도구 아이콘
            order: newDockItems.length,
            fixed: false,
            isBuiltin: true // 내장 도구 표시
          });
        }
      } else {
        // 독에서 제거
        newDockItems = newDockItems.filter(item => item.id !== toolName);
        // order 재정렬
        newDockItems.forEach((item, idx) => {
          item.order = idx;
        });
      }

      // 저장
      const res = await fetch('/api/config/dock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDockItems)
      });

      if (res.ok) {
        // UI 업데이트
        const card = document.querySelector(`.builtin-tool-card[data-tool="${toolName}"]`);
        if (card) {
          if (enabled) {
            card.classList.add('in-dock');
          } else {
            card.classList.remove('in-dock');
          }
        }

        // 토스트 메시지 (main.js의 showToast 사용)
        if (window.soulApp) {
          window.soulApp.showToast(
            enabled ? `"${tool.description}" 독에 추가됨` : `"${tool.description}" 독에서 제거됨`,
            2000
          );
        }
      } else {
        throw new Error('저장 실패');
      }
    } catch (error) {
      console.error('도구 토글 실패:', error);
      alert('도구 설정을 저장할 수 없습니다');
      // 체크박스 원상복구
      const toggle = document.querySelector(`.builtin-tool-toggle input[data-tool="${toolName}"]`);
      if (toggle) {
        toggle.checked = !enabled;
      }
    }
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
              <input type="text" name="name" placeholder="예: Jina AI" required>
            </div>
            <div class="form-group">
              <label>서버 URL</label>
              <input type="url" name="url" placeholder="예: https://mcp.jina.ai/v1" required>
            </div>
            <div class="form-group">
              <label>API Key <span style="font-size:0.75rem;color:#999;">(선택)</span></label>
              <input type="password" name="apiKey" placeholder="Bearer 토큰 (없으면 비워두세요)">
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
      const apiKey = formData.get('apiKey')?.trim();
      if (apiKey) newServer.apiKey = apiKey;
      
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
                    <img src="/assets/${icon}" style="width: 28px; height: 28px;" alt="${icon}">
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
