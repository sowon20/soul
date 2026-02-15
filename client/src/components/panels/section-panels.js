/**
 * section-panels.js
 *
 * 독(Dock) 섹션별 패널 UI 렌더러
 * - Memory, Messaging, Browser, Filesystem, Cloud 패널
 * - 양방향 실시간 동기화 지원
 */

export class SectionPanelRenderer {
  constructor(app) {
    this.app = app;
    this.apiClient = app.apiClient;
  }

  /** 범용 도구 호출 */
  async callTool(toolName, params = {}) {
    try {
      return await this.apiClient.post(`/tools/builtin/${toolName}`, params);
    } catch (error) {
      console.error(`[Panel] ${toolName} 호출 실패:`, error);
      throw error;
    }
  }

  /** 토스트 메시지 */
  toast(msg, duration = 2000) {
    this.app.showToast?.(msg, duration);
  }

  /** HTML 이스케이프 */
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** 날짜 포맷 (상대 시간) */
  _relativeTime(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }

  /** 날짜 포맷 (짧은 형식) */
  _shortDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }

  /**
   * canvas_update 소켓 이벤트 수신 시 호출
   * panelType: 'section_memory' | 'section_messaging' 등
   */
  async handleCanvasUpdate(panelType, data) {
    const container = document.getElementById(`canvas-iframe-${panelType}`);
    if (!container) return;

    switch (panelType) {
      case 'section_memory':
        await this.renderMemoryUI(container);
        break;
      case 'section_messaging':
        await this.renderMessagingUI(container);
        break;
      case 'section_browser':
        // 브라우저는 결과를 append
        if (data?.result) this._appendBrowserResult(container, data.result);
        break;
      case 'section_filesystem':
        await this.renderFilesystemUI(container);
        break;
      case 'section_cloud':
        await this.renderCloudUI(container);
        break;
    }
  }

  // ═══════════════════════════════════════
  // 1. MEMORY 패널
  // ═══════════════════════════════════════

  async renderMemoryUI(container) {
    try {
      const [memoriesRes, profileRes] = await Promise.all([
        this.callTool('list_memories', { limit: 100 }),
        this.callTool('get_profile', {})
      ]);

      const memories = memoriesRes.memories || [];
      const profile = profileRes.profile || {};

      container.innerHTML = `
        <div class="memory-panel">
          <div class="memory-tabs">
            <button class="memory-tab active" data-tab="memories">💭 기억</button>
            <button class="memory-tab" data-tab="profile">👤 프로필</button>
          </div>

          <div class="memory-tab-content" id="memoriesTab">
            <div class="memory-search-bar">
              <input type="text" class="memory-search-input" placeholder="기억 검색..." id="memorySearchInput">
              <button class="memory-search-btn" id="memorySearchBtn">🔍</button>
            </div>
            <div class="memory-list" id="memoryList">
              ${memories.length === 0
                ? '<div class="memory-empty">저장된 기억이 없습니다</div>'
                : memories.map(m => this._renderMemoryItem(m)).join('')
              }
            </div>
          </div>

          <div class="memory-tab-content" id="profileTab" style="display:none;">
            <div class="profile-fields">
              ${this._renderProfileFields(profile)}
            </div>
          </div>
        </div>
      `;

      this._attachMemoryEvents(container, memories);
    } catch (error) {
      console.error('Memory 패널 에러:', error);
      container.innerHTML = `<div class="panel-error">기억을 불러올 수 없습니다<br><small>${error.message}</small></div>`;
    }
  }

  _renderMemoryItem(memory) {
    const tags = (memory.tags || []).map(t => `<span class="memory-tag">#${this._escapeHtml(t)}</span>`).join('');
    return `
      <div class="memory-item" data-memory-id="${memory.id || memory.memoryId}">
        <div class="memory-item-content">${this._escapeHtml(memory.content || memory.text || '')}</div>
        <div class="memory-item-meta">
          <span class="memory-item-date">${this._relativeTime(memory.createdAt || memory.timestamp)}</span>
          ${tags}
        </div>
        <div class="memory-item-actions">
          <button class="memory-delete-btn" data-id="${memory.id || memory.memoryId}" title="삭제">🗑️</button>
        </div>
      </div>
    `;
  }

  _renderProfileFields(profile) {
    const fields = [
      { key: 'name', label: '이름', icon: '👤' },
      { key: 'location', label: '위치', icon: '📍' },
      { key: 'timezone', label: '시간대', icon: '🕐' },
      { key: 'language', label: '언어', icon: '🌐' },
      { key: 'occupation', label: '직업', icon: '💼' },
      { key: 'interests', label: '관심사', icon: '⭐' }
    ];

    return fields.map(f => `
      <div class="profile-field">
        <label class="profile-label">${f.icon} ${f.label}</label>
        <input type="text" class="profile-input" data-field="${f.key}"
               value="${this._escapeHtml(profile[f.key] || '')}"
               placeholder="${f.label}을 입력하세요">
      </div>
    `).join('');
  }

  _attachMemoryEvents(container, memories) {
    // 탭 전환
    container.querySelectorAll('.memory-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.memory-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        container.querySelector('#memoriesTab').style.display = tabName === 'memories' ? '' : 'none';
        container.querySelector('#profileTab').style.display = tabName === 'profile' ? '' : 'none';
      });
    });

    // 기억 검색
    const searchInput = container.querySelector('#memorySearchInput');
    const searchBtn = container.querySelector('#memorySearchBtn');
    const doSearch = async () => {
      const query = searchInput?.value?.trim();
      if (!query) {
        // 빈 검색 → 전체 목록 복원
        container.querySelector('#memoryList').innerHTML =
          memories.map(m => this._renderMemoryItem(m)).join('') ||
          '<div class="memory-empty">저장된 기억이 없습니다</div>';
        return;
      }
      try {
        const res = await this.callTool('recall_memory', { query, limit: 20 });
        const results = res.memories || [];
        container.querySelector('#memoryList').innerHTML =
          results.length === 0
            ? '<div class="memory-empty">검색 결과가 없습니다</div>'
            : results.map(m => this._renderMemoryItem(m)).join('');
        this._attachMemoryDeleteEvents(container);
      } catch (e) {
        this.toast('검색 실패: ' + e.message);
      }
    };

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    // 기억 삭제
    this._attachMemoryDeleteEvents(container);

    // 프로필 저장 (blur 시)
    container.querySelectorAll('.profile-input').forEach(input => {
      input.addEventListener('change', async () => {
        const field = input.dataset.field;
        const value = input.value.trim();
        try {
          await this.callTool('update_profile', { [field]: value });
          this.toast('프로필 업데이트됨');
        } catch (e) {
          this.toast('프로필 저장 실패');
        }
      });
    });
  }

  _attachMemoryDeleteEvents(container) {
    container.querySelectorAll('.memory-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('이 기억을 삭제하시겠습니까?')) return;
        try {
          await this.callTool('update_memory', { action: 'delete', memory_id: id });
          btn.closest('.memory-item')?.remove();
          this.toast('기억이 삭제되었습니다');
        } catch (e) {
          this.toast('삭제 실패');
        }
      });
    });
  }

  // ═══════════════════════════════════════
  // 2. MESSAGING 패널
  // ═══════════════════════════════════════

  async renderMessagingUI(container) {
    // 선제 메시지 상태 확인
    let proactiveEnabled = false;
    try {
      const res = await fetch('/api/notifications/proactive/status');
      const data = await res.json();
      proactiveEnabled = data.enabled;
    } catch { /* ignore */ }

    try {
      const schedRes = await this.callTool('list_scheduled_messages', {});
      const schedules = schedRes.messages || schedRes.scheduled_messages || [];

      container.innerHTML = `
        <div class="messaging-panel">
          <div class="conn-section" style="margin:0 0 0.75rem 0; padding:0.75rem 1rem;">
            <label class="conn-toggle">
              <span style="flex:1;">🔔 선제 메시지</span>
              <input type="checkbox" id="proactiveToggle" ${proactiveEnabled ? 'checked' : ''}>
              <span class="conn-toggle-slider"></span>
            </label>
            <div class="conn-hint" style="margin-top:0.25rem; font-size:0.75rem;">
              소울이 리마인더·날씨 등을 먼저 보낼 수 있습니다
            </div>
          </div>

          <div class="messaging-compose">
            <h3 class="messaging-section-title">💬 즉시 메시지</h3>
            <div class="messaging-input-row">
              <input type="text" class="messaging-input" id="instantMsgInput" placeholder="메시지를 입력하세요...">
              <button class="messaging-send-btn" id="instantMsgBtn">보내기</button>
            </div>
          </div>

          <div class="messaging-schedule">
            <h3 class="messaging-section-title">⏰ 예약 메시지</h3>
            <div class="messaging-input-row">
              <input type="text" class="messaging-input" id="scheduleMsgInput" placeholder="예약할 메시지...">
              <input type="datetime-local" class="messaging-datetime" id="scheduleMsgTime">
              <button class="messaging-schedule-btn" id="scheduleMsgBtn">예약</button>
            </div>
          </div>

          <div class="messaging-list">
            <h3 class="messaging-section-title">📋 예약 목록 (${schedules.length})</h3>
            <div id="scheduleList">
              ${schedules.length === 0
                ? '<div class="messaging-empty">예약된 메시지가 없습니다</div>'
                : schedules.map(s => this._renderScheduleItem(s)).join('')
              }
            </div>
          </div>
        </div>
      `;

      this._attachMessagingEvents(container);
    } catch (error) {
      console.error('Messaging 패널 에러:', error);
      container.innerHTML = `<div class="panel-error">메시지 정보를 불러올 수 없습니다<br><small>${error.message}</small></div>`;
    }
  }

  _renderScheduleItem(schedule) {
    const time = schedule.scheduledTime || schedule.scheduled_time || '';
    const msg = schedule.message || schedule.content || '';
    const id = schedule.id || schedule.scheduleId || '';

    return `
      <div class="schedule-item" data-schedule-id="${id}">
        <div class="schedule-item-content">${this._escapeHtml(msg)}</div>
        <div class="schedule-item-meta">
          <span class="schedule-time">${this._formatScheduleTime(time)}</span>
          <button class="schedule-cancel-btn" data-id="${id}" title="취소">✕</button>
        </div>
      </div>
    `;
  }

  _formatScheduleTime(timeStr) {
    if (!timeStr) return '';
    try {
      const d = new Date(timeStr);
      return d.toLocaleString('ko-KR', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return timeStr;
    }
  }

  _attachMessagingEvents(container) {
    // 선제 메시지 토글
    container.querySelector('#proactiveToggle')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        await fetch('/api/notifications/proactive/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        this.toast(enabled ? '선제 메시지 활성화됨' : '선제 메시지 비활성화됨');
      } catch (err) {
        e.target.checked = !enabled; // 롤백
        this.toast('설정 변경 실패');
      }
    });

    // 즉시 메시지
    const instantInput = container.querySelector('#instantMsgInput');
    const instantBtn = container.querySelector('#instantMsgBtn');
    instantBtn?.addEventListener('click', async () => {
      const message = instantInput?.value?.trim();
      if (!message) return;
      try {
        await this.callTool('send_message', { message });
        instantInput.value = '';
        this.toast('메시지 전송됨');
      } catch (e) {
        this.toast('전송 실패: ' + e.message);
      }
    });
    instantInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') instantBtn?.click();
    });

    // 예약 메시지
    const schedInput = container.querySelector('#scheduleMsgInput');
    const schedTime = container.querySelector('#scheduleMsgTime');
    const schedBtn = container.querySelector('#scheduleMsgBtn');

    // 기본값: 1시간 후
    if (schedTime) {
      const d = new Date(Date.now() + 3600000);
      schedTime.value = d.toISOString().slice(0, 16);
    }

    schedBtn?.addEventListener('click', async () => {
      const message = schedInput?.value?.trim();
      const time = schedTime?.value;
      if (!message || !time) {
        this.toast('메시지와 시간을 입력하세요');
        return;
      }
      try {
        await this.callTool('schedule_message', {
          message,
          scheduled_time: new Date(time).toISOString()
        });
        schedInput.value = '';
        this.toast('메시지가 예약되었습니다');
        await this.renderMessagingUI(container);
      } catch (e) {
        this.toast('예약 실패: ' + e.message);
      }
    });

    // 예약 취소
    container.querySelectorAll('.schedule-cancel-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await this.callTool('cancel_scheduled_message', { schedule_id: id });
          btn.closest('.schedule-item')?.remove();
          this.toast('예약이 취소되었습니다');
        } catch (e) {
          this.toast('취소 실패');
        }
      });
    });
  }

  // ═══════════════════════════════════════
  // 3. BROWSER 패널
  // ═══════════════════════════════════════

  async renderBrowserUI(container) {
    // API 키 상태 확인
    let webSearchConfigured = false;
    try {
      const res = await fetch('/api/config/web-search');
      const data = await res.json();
      webSearchConfigured = data.configured;
    } catch { /* ignore */ }

    container.innerHTML = `
      <div class="browser-panel">
        <div class="browser-search-bar">
          <input type="text" class="browser-url-input" id="browserInput"
                 placeholder="${webSearchConfigured ? '검색어 또는 URL 입력...' : 'URL 입력... (웹검색은 API키 필요)'}">
          <button class="browser-action-btn" id="browserSearchBtn" ${!webSearchConfigured ? 'disabled' : ''}>🔍 검색</button>
          <button class="browser-action-btn" id="browserReadBtn">📖 읽기</button>
        </div>

        ${!webSearchConfigured ? `
          <div class="browser-api-notice">
            <span>⚠️ 웹 검색을 사용하려면 Tavily API 키를 설정하세요</span>
            <div class="browser-api-setup">
              <input type="password" id="browserApiKeyInput" placeholder="tvly-..." class="browser-api-input">
              <button id="browserApiKeySaveBtn" class="browser-api-save-btn">저장</button>
            </div>
          </div>
        ` : ''}

        <div class="browser-results" id="browserResults">
          <div class="browser-placeholder">검색어를 입력하거나 URL을 읽어보세요</div>
        </div>
      </div>
    `;

    this._attachBrowserEvents(container, webSearchConfigured);
  }

  _attachBrowserEvents(container, webSearchConfigured) {
    const input = container.querySelector('#browserInput');
    const searchBtn = container.querySelector('#browserSearchBtn');
    const readBtn = container.querySelector('#browserReadBtn');
    const results = container.querySelector('#browserResults');

    // 웹 검색
    searchBtn?.addEventListener('click', async () => {
      const query = input?.value?.trim();
      if (!query) return;
      results.innerHTML = '<div class="browser-loading">🔍 검색 중...</div>';
      try {
        const res = await this.callTool('search_web', { query });
        const items = res.results || [];
        const answer = res.answer || '';
        results.innerHTML = `
          ${answer ? `<div class="browser-answer"><strong>AI 답변:</strong> ${this._escapeHtml(answer)}</div>` : ''}
          <div class="browser-result-list">
            ${items.map(r => `
              <div class="browser-result-item">
                <a class="browser-result-title" href="${r.url}" target="_blank">${this._escapeHtml(r.title || r.url)}</a>
                <div class="browser-result-url">${this._escapeHtml(r.url || '')}</div>
                <div class="browser-result-snippet">${this._escapeHtml(r.content || r.snippet || '')}</div>
                <button class="browser-read-link" data-url="${r.url}">📖 읽기</button>
              </div>
            `).join('')}
          </div>
        `;
        // 결과 내 읽기 버튼
        results.querySelectorAll('.browser-read-link').forEach(btn => {
          btn.addEventListener('click', () => {
            input.value = btn.dataset.url;
            readBtn?.click();
          });
        });
      } catch (e) {
        results.innerHTML = `<div class="browser-error">검색 실패: ${this._escapeHtml(e.message)}</div>`;
      }
    });

    // URL 읽기
    readBtn?.addEventListener('click', async () => {
      const url = input?.value?.trim();
      if (!url) return;
      results.innerHTML = '<div class="browser-loading">📖 페이지 로딩 중...</div>';
      try {
        const res = await this.callTool('browse', { url });
        const content = res.content || res.text || '내용 없음';
        const title = res.title || url;
        results.innerHTML = `
          <div class="browser-page">
            <div class="browser-page-title">${this._escapeHtml(title)}</div>
            <div class="browser-page-url">${this._escapeHtml(url)}</div>
            <div class="browser-page-content">${this._renderMarkdown(content)}</div>
          </div>
        `;
      } catch (e) {
        results.innerHTML = `<div class="browser-error">페이지 로딩 실패: ${this._escapeHtml(e.message)}</div>`;
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val.startsWith('http://') || val.startsWith('https://')) {
          readBtn?.click();
        } else {
          searchBtn?.click();
        }
      }
    });

    // API 키 저장
    const apiKeyInput = container.querySelector('#browserApiKeyInput');
    const apiKeySaveBtn = container.querySelector('#browserApiKeySaveBtn');
    apiKeySaveBtn?.addEventListener('click', async () => {
      const key = apiKeyInput?.value?.trim();
      if (!key) return;
      try {
        const res = await fetch('/api/config/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: key })
        });
        const result = await res.json();
        if (result.success) {
          this.toast('Tavily API 키 저장됨');
          await this.renderBrowserUI(container);
        }
      } catch (e) {
        this.toast('API 키 저장 실패');
      }
    });
  }

  _appendBrowserResult(container, result) {
    const results = container?.querySelector('#browserResults');
    if (!results) return;
    const placeholder = results.querySelector('.browser-placeholder');
    if (placeholder) placeholder.remove();

    const div = document.createElement('div');
    div.className = 'browser-result-item';
    div.innerHTML = `<div class="browser-result-snippet">${this._escapeHtml(JSON.stringify(result).slice(0, 200))}</div>`;
    results.appendChild(div);
  }

  _renderMarkdown(text) {
    // 기본 마크다운 → HTML 변환 (간단)
    if (!text) return '';
    return this._escapeHtml(text)
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  // ═══════════════════════════════════════
  // 4. FILESYSTEM 패널
  // ═══════════════════════════════════════

  async renderFilesystemUI(container) {
    const currentPath = container.dataset?.currentPath || '~';

    try {
      const res = await this.callTool('file_list', { path: currentPath });
      const files = res.files || res.entries || [];
      const resolvedPath = res.path || currentPath;

      container.dataset.currentPath = resolvedPath;

      container.innerHTML = `
        <div class="fs-panel">
          <div class="fs-toolbar">
            <button class="fs-up-btn" id="fsUpBtn" title="상위 폴더">⬆️</button>
            <input type="text" class="fs-path-input" id="fsPathInput" value="${this._escapeHtml(resolvedPath)}">
            <button class="fs-go-btn" id="fsGoBtn">이동</button>
          </div>

          <div class="fs-file-list" id="fsFileList">
            ${files.length === 0
              ? '<div class="fs-empty">빈 폴더입니다</div>'
              : files.map(f => this._renderFileItem(f)).join('')
            }
          </div>

          <div class="fs-viewer" id="fsViewer" style="display:none;">
            <div class="fs-viewer-header">
              <span class="fs-viewer-name" id="fsViewerName"></span>
              <button class="fs-viewer-close" id="fsViewerClose">✕</button>
            </div>
            <pre class="fs-viewer-content" id="fsViewerContent"></pre>
            <div class="fs-viewer-pagination" id="fsViewerPagination"></div>
          </div>
        </div>
      `;

      this._attachFsEvents(container);
    } catch (error) {
      console.error('Filesystem 패널 에러:', error);
      container.innerHTML = `<div class="panel-error">파일 목록을 불러올 수 없습니다<br><small>${error.message}</small></div>`;
    }
  }

  _renderFileItem(file) {
    const isDir = file.type === 'directory' || file.isDirectory;
    const icon = isDir ? '📁' : this._fileIcon(file.name || '');
    const size = file.size ? this._formatSize(file.size) : '';
    const name = file.name || '';

    return `
      <div class="fs-item ${isDir ? 'fs-dir' : 'fs-file'}" data-path="${this._escapeHtml(file.path || name)}" data-is-dir="${isDir}">
        <span class="fs-item-icon">${icon}</span>
        <span class="fs-item-name">${this._escapeHtml(name)}</span>
        <span class="fs-item-size">${size}</span>
      </div>
    `;
  }

  _fileIcon(name) {
    const ext = name.split('.').pop()?.toLowerCase();
    const icons = {
      js: '📜', ts: '📜', py: '🐍', json: '📋', md: '📝',
      html: '🌐', css: '🎨', txt: '📄', jpg: '🖼️', png: '🖼️',
      pdf: '📕', zip: '📦', mp3: '🎵', mp4: '🎬'
    };
    return icons[ext] || '📄';
  }

  _formatSize(bytes) {
    if (!bytes || bytes === 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
  }

  _attachFsEvents(container) {
    const pathInput = container.querySelector('#fsPathInput');
    const goBtn = container.querySelector('#fsGoBtn');
    const upBtn = container.querySelector('#fsUpBtn');

    // 경로 이동
    const navigate = async (path) => {
      container.dataset.currentPath = path;
      await this.renderFilesystemUI(container);
    };

    goBtn?.addEventListener('click', () => {
      const path = pathInput?.value?.trim();
      if (path) navigate(path);
    });

    pathInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goBtn?.click();
    });

    // 상위 폴더
    upBtn?.addEventListener('click', () => {
      const current = container.dataset.currentPath || '~';
      const parent = current.replace(/\/[^/]+\/?$/, '') || '/';
      navigate(parent);
    });

    // 파일/폴더 클릭
    container.querySelectorAll('.fs-item').forEach(item => {
      item.addEventListener('click', async () => {
        const path = item.dataset.path;
        const isDir = item.dataset.isDir === 'true';

        if (isDir) {
          navigate(path);
        } else {
          // 파일 읽기
          const viewer = container.querySelector('#fsViewer');
          const viewerName = container.querySelector('#fsViewerName');
          const viewerContent = container.querySelector('#fsViewerContent');

          if (!viewer) return;
          viewer.style.display = '';
          viewerName.textContent = path.split('/').pop();
          viewerContent.textContent = '로딩 중...';

          try {
            const res = await this.callTool('file_read', { path, start_line: 1, end_line: 100 });
            viewerContent.textContent = res.content || '(빈 파일)';

            // 페이지네이션
            const total = res.total_lines || 0;
            const pagination = container.querySelector('#fsViewerPagination');
            if (pagination && total > 100) {
              pagination.innerHTML = `<span>1-100 / ${total}줄</span>
                <button class="fs-viewer-next" data-path="${this._escapeHtml(path)}" data-start="101">다음 →</button>`;
              pagination.querySelector('.fs-viewer-next')?.addEventListener('click', async (e) => {
                const start = parseInt(e.target.dataset.start);
                const r = await this.callTool('file_read', { path, start_line: start, end_line: start + 99 });
                viewerContent.textContent = r.content || '';
                e.target.dataset.start = start + 100;
                pagination.querySelector('span').textContent = `${start}-${start + 99} / ${total}줄`;
              });
            }
          } catch (e) {
            viewerContent.textContent = '파일을 읽을 수 없습니다: ' + e.message;
          }
        }
      });
    });

    // 뷰어 닫기
    container.querySelector('#fsViewerClose')?.addEventListener('click', () => {
      container.querySelector('#fsViewer').style.display = 'none';
    });
  }

  // ═══════════════════════════════════════
  // 5. CLOUD 패널
  // ═══════════════════════════════════════

  async renderCloudUI(container) {
    // 연결 상태 확인
    let gdriveStatus;
    try {
      const res = await fetch('/api/config/gdrive');
      gdriveStatus = await res.json();
    } catch {
      gdriveStatus = { configured: false };
    }

    // 미연결 → 인라인 연결 폼
    if (!gdriveStatus.configured) {
      container.innerHTML = `
        <div class="conn-section" style="margin:1rem;">
          <div class="conn-header">
            <span class="conn-icon">☁️</span>
            <div class="conn-header-text">
              <h3 class="conn-title">Google Drive 연결</h3>
              <p class="conn-desc">서비스 계정으로 Drive 폴더를 연결합니다</p>
            </div>
          </div>
          <div class="conn-form">
            <div class="conn-form-field">
              <label class="conn-label">서비스 계정 키 (JSON)</label>
              <div class="conn-hint">Google Cloud Console → IAM → 서비스 계정 → 키 생성</div>
              <textarea class="conn-textarea" id="gdriveKeyInput" rows="3"
                        placeholder='{"type":"service_account","project_id":...}'></textarea>
            </div>
            <div class="conn-form-field">
              <label class="conn-label">Drive 폴더 ID</label>
              <div class="conn-hint">폴더를 서비스 계정 이메일로 공유 후 URL에서 ID 복사</div>
              <input type="text" class="conn-input" id="gdriveFolderInput" placeholder="1A2B3C4D...">
            </div>
            <div class="conn-form-actions">
              <button class="conn-btn conn-btn-primary" id="gdriveConnectBtn">🔗 연결</button>
            </div>
            <div class="conn-form-msg" id="gdriveMsg"></div>
          </div>
        </div>
      `;
      this._bindGDriveConnectForm(container);
      return;
    }

    // 연결됨 → 파일 탐색기
    const currentPath = container.dataset?.cloudPath || '/';

    try {
      const res = await this.callTool('cloud_list', { path: currentPath });
      const files = res.files || res.entries || [];
      const resolvedPath = res.path || currentPath;

      container.dataset.cloudPath = resolvedPath;

      container.innerHTML = `
        <div class="cloud-panel">
          <div class="cloud-toolbar">
            <button class="cloud-up-btn" id="cloudUpBtn" title="상위 폴더">⬆️</button>
            <div class="cloud-breadcrumb" id="cloudBreadcrumb">
              ☁️ ${this._escapeHtml(resolvedPath)}
            </div>
            <div class="cloud-actions">
              <input type="text" class="cloud-search-input" id="cloudSearchInput" placeholder="검색...">
              <button class="cloud-search-btn" id="cloudSearchBtn">🔍</button>
              <button class="cloud-disconnect-btn" id="cloudDisconnectBtn" title="연결 해제">🔌</button>
            </div>
          </div>

          <div class="cloud-file-list" id="cloudFileList">
            ${files.length === 0
              ? '<div class="cloud-empty">파일이 없습니다</div>'
              : files.map(f => this._renderCloudItem(f)).join('')
            }
          </div>

          <div class="cloud-viewer" id="cloudViewer" style="display:none;">
            <div class="cloud-viewer-header">
              <span class="cloud-viewer-name" id="cloudViewerName"></span>
              <div class="cloud-viewer-actions">
                <button class="cloud-viewer-close" id="cloudViewerClose">✕</button>
              </div>
            </div>
            <div class="cloud-viewer-content" id="cloudViewerContent"></div>
          </div>
        </div>
      `;

      this._attachCloudEvents(container);
    } catch (error) {
      console.error('Cloud 패널 에러:', error);
      container.innerHTML = `
        <div class="panel-error">
          <div>☁️ Google Drive 접근 실패</div>
          <small>${this._escapeHtml(error.message)}</small>
          <button class="conn-btn conn-btn-primary" id="cloudRetryBtn"
                  style="margin-top:1rem;">
            🔄 다시 시도
          </button>
        </div>
      `;
      container.querySelector('#cloudRetryBtn')?.addEventListener('click', () => {
        this.renderCloudUI(container);
      });
    }
  }

  _bindGDriveConnectForm(container) {
    const keyInput = container.querySelector('#gdriveKeyInput');
    const folderInput = container.querySelector('#gdriveFolderInput');
    const connectBtn = container.querySelector('#gdriveConnectBtn');
    const msgEl = container.querySelector('#gdriveMsg');

    connectBtn?.addEventListener('click', async () => {
      const keyRaw = keyInput?.value?.trim();
      const folderId = folderInput?.value?.trim();
      if (!keyRaw || !folderId) {
        msgEl.textContent = '서비스 계정 키와 폴더 ID를 모두 입력하세요';
        msgEl.className = 'conn-form-msg conn-msg-error';
        return;
      }

      // JSON 파싱 검증
      let keyData;
      try {
        keyData = JSON.parse(keyRaw);
      } catch {
        msgEl.textContent = '서비스 계정 키가 올바른 JSON 형식이 아닙니다';
        msgEl.className = 'conn-form-msg conn-msg-error';
        return;
      }

      connectBtn.disabled = true;
      connectBtn.textContent = '연결 중...';
      msgEl.textContent = '';

      try {
        const res = await fetch('/api/config/gdrive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceAccountKey: keyData, folderId })
        });
        const result = await res.json();
        if (result.success) {
          msgEl.textContent = '✅ 연결 성공!';
          msgEl.className = 'conn-form-msg conn-msg-ok';
          // 잠시 후 Cloud 파일 탐색기로 전환
          setTimeout(() => this.renderCloudUI(container), 800);
        } else {
          throw new Error(result.message || '연결 실패');
        }
      } catch (e) {
        msgEl.textContent = '❌ ' + e.message;
        msgEl.className = 'conn-form-msg conn-msg-error';
        connectBtn.disabled = false;
        connectBtn.textContent = '🔗 연결';
      }
    });
  }

  _renderCloudItem(file) {
    const isDir = file.type === 'folder' || file.mimeType?.includes('folder');
    const icon = isDir ? '📁' : this._fileIcon(file.name || '');
    const date = this._shortDate(file.modifiedTime || file.modified);

    return `
      <div class="cloud-item ${isDir ? 'cloud-dir' : 'cloud-file'}"
           data-id="${this._escapeHtml(file.id || '')}"
           data-path="${this._escapeHtml(file.path || file.name || '')}"
           data-is-dir="${isDir}">
        <span class="cloud-item-icon">${icon}</span>
        <span class="cloud-item-name">${this._escapeHtml(file.name || '')}</span>
        <span class="cloud-item-date">${date}</span>
      </div>
    `;
  }

  _attachCloudEvents(container) {
    // 연결 해제
    container.querySelector('#cloudDisconnectBtn')?.addEventListener('click', async () => {
      if (!confirm('Google Drive 연결을 해제하시겠습니까?')) return;
      try {
        await fetch('/api/config/gdrive', { method: 'DELETE' });
        this.toast('연결이 해제되었습니다');
        delete container.dataset.cloudPath;
        this.renderCloudUI(container);
      } catch {
        this.toast('연결 해제 실패');
      }
    });

    // 상위 폴더
    container.querySelector('#cloudUpBtn')?.addEventListener('click', () => {
      const current = container.dataset.cloudPath || '/';
      const parent = current.replace(/\/[^/]+\/?$/, '') || '/';
      container.dataset.cloudPath = parent;
      this.renderCloudUI(container);
    });

    // 검색
    const searchInput = container.querySelector('#cloudSearchInput');
    const searchBtn = container.querySelector('#cloudSearchBtn');
    searchBtn?.addEventListener('click', async () => {
      const query = searchInput?.value?.trim();
      if (!query) return;
      try {
        const res = await this.callTool('cloud_search', { query });
        const files = res.files || [];
        container.querySelector('#cloudFileList').innerHTML =
          files.length === 0
            ? '<div class="cloud-empty">검색 결과 없음</div>'
            : files.map(f => this._renderCloudItem(f)).join('');
        this._attachCloudItemEvents(container);
      } catch (e) {
        this.toast('검색 실패');
      }
    });
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchBtn?.click();
    });

    // 파일/폴더 클릭
    this._attachCloudItemEvents(container);

    // 뷰어 닫기
    container.querySelector('#cloudViewerClose')?.addEventListener('click', () => {
      container.querySelector('#cloudViewer').style.display = 'none';
    });
  }

  _attachCloudItemEvents(container) {
    container.querySelectorAll('.cloud-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const path = item.dataset.path;
        const isDir = item.dataset.isDir === 'true';

        if (isDir) {
          container.dataset.cloudPath = path || id;
          this.renderCloudUI(container);
        } else {
          // 파일 읽기
          const viewer = container.querySelector('#cloudViewer');
          const viewerName = container.querySelector('#cloudViewerName');
          const viewerContent = container.querySelector('#cloudViewerContent');
          if (!viewer) return;

          viewer.style.display = '';
          viewerName.textContent = item.querySelector('.cloud-item-name')?.textContent || '';
          viewerContent.textContent = '로딩 중...';

          try {
            const res = await this.callTool('cloud_read', { file_id: id, path });
            viewerContent.innerHTML = `<pre>${this._escapeHtml(res.content || '(빈 파일)')}</pre>`;
          } catch (e) {
            viewerContent.textContent = '파일을 읽을 수 없습니다: ' + e.message;
          }
        }
      });
    });
  }
}
