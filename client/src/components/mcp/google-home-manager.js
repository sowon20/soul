/**
 * Google Home Manager Component
 * 스마트홈 기기 전체 관리 UI
 */

export class GoogleHomeManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.structures = [];
    this.rooms = [];
    this.devices = [];
    this.stats = null;
    this.currentView = 'overview'; // overview, structures, rooms, devices, appletv, airplay, network
    this.selectedStructure = null;
    this.selectedRoom = null;
    this.showHidden = false;
    // 스마트홈 확장 기능
    this.appleTVDevices = [];
    this.airplayDevices = [];
    this.networkDevices = [];
    this.networkInfo = null;
  }

  /**
   * 컴포넌트 렌더링
   */
  async render(container) {
    try {
      // 데이터 로드
      await this.loadAllData();

      container.innerHTML = `
        <div class="google-home-manager">
          ${this.renderHeader()}
          ${this.renderTabs()}
          <div class="ghm-content">
            ${this.renderCurrentView()}
          </div>
        </div>
      `;

      this.attachEventListeners(container);
    } catch (error) {
      console.error('Failed to render Google Home Manager:', error);
      container.innerHTML = `
        <div class="ghm-error">
          <p>Google Home 데이터를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 모든 데이터 로드
   */
  async loadAllData() {
    const [structuresRes, roomsRes, devicesRes, statsRes] = await Promise.all([
      this.apiClient.get('/google-home/structures'),
      this.apiClient.get('/google-home/rooms'),
      this.apiClient.get(`/google-home/devices?showHidden=${this.showHidden}`),
      this.apiClient.get('/google-home/stats')
    ]);

    this.structures = structuresRes.structures || [];
    this.rooms = roomsRes.rooms || [];
    this.devices = devicesRes.devices || [];
    this.stats = statsRes.stats || null;
  }

  /**
   * 헤더 렌더링
   */
  renderHeader() {
    return `
      <div class="ghm-header">
        <div class="ghm-title">
          <span style="font-size: 1.5rem;">🏠</span>
          <h2>Google Home 관리</h2>
        </div>
        <div class="ghm-actions">
          <label class="ghm-checkbox">
            <input type="checkbox" id="showHiddenToggle" ${this.showHidden ? 'checked' : ''}>
            <span>숨긴 항목 표시</span>
          </label>
          <button class="ghm-btn ghm-btn-refresh" id="ghmRefresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            새로고침
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 탭 렌더링
   */
  renderTabs() {
    const tabs = [
      { id: 'overview', label: '개요', icon: '📊' },
      { id: 'structures', label: '장소', icon: '🏢', count: this.structures.length },
      { id: 'rooms', label: '방', icon: '🚪', count: this.rooms.length },
      { id: 'devices', label: '기기', icon: '📱', count: this.devices.length },
      { id: 'appletv', label: 'Apple TV', icon: '📺' },
      { id: 'airplay', label: 'AirPlay', icon: '📡' },
      { id: 'network', label: '네트워크', icon: '🌐' }
    ];

    return `
      <div class="ghm-tabs">
        ${tabs.map(tab => `
          <button class="ghm-tab ${this.currentView === tab.id ? 'active' : ''}" data-view="${tab.id}">
            <span>${tab.icon}</span>
            <span>${tab.label}</span>
            ${tab.count !== undefined ? `<span class="ghm-badge">${tab.count}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * 현재 뷰 렌더링
   */
  renderCurrentView() {
    switch (this.currentView) {
      case 'overview':
        return this.renderOverview();
      case 'structures':
        return this.renderStructures();
      case 'rooms':
        return this.renderRooms();
      case 'devices':
        return this.renderDevices();
      case 'appletv':
        return this.renderAppleTV();
      case 'airplay':
        return this.renderAirPlay();
      case 'network':
        return this.renderNetwork();
      default:
        return this.renderOverview();
    }
  }

  /**
   * 개요 렌더링
   */
  renderOverview() {
    if (!this.stats) return '<div class="ghm-loading">로딩 중...</div>';

    const { totalDevices, onlineDevices, structures, rooms, deviceTypes, hiddenDevices, disabledDevices, typeBreakdown } = this.stats;

    return `
      <div class="ghm-overview">
        <div class="ghm-stats-grid">
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">📱</div>
            <div class="ghm-stat-value">${totalDevices}</div>
            <div class="ghm-stat-label">전체 기기</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">💡</div>
            <div class="ghm-stat-value">${onlineDevices}</div>
            <div class="ghm-stat-label">켜진 기기</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">🏢</div>
            <div class="ghm-stat-value">${structures}</div>
            <div class="ghm-stat-label">장소</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">🚪</div>
            <div class="ghm-stat-value">${rooms}</div>
            <div class="ghm-stat-label">방</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">🔌</div>
            <div class="ghm-stat-value">${deviceTypes}</div>
            <div class="ghm-stat-label">기기 종류</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">👁️</div>
            <div class="ghm-stat-value">${hiddenDevices}</div>
            <div class="ghm-stat-label">숨긴 기기</div>
          </div>
        </div>

        <div class="ghm-section">
          <h3>기기 종류별 현황</h3>
          <div class="ghm-type-list">
            ${typeBreakdown.map(t => `
              <div class="ghm-type-item">
                <span class="ghm-type-icon">${this.getTypeIcon(t.type)}</span>
                <span class="ghm-type-name">${this.getTypeName(t.type)}</span>
                <span class="ghm-type-count">${t.count}개</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="ghm-section">
          <h3>빠른 제어</h3>
          <div class="ghm-quick-actions">
            <button class="ghm-btn ghm-btn-action" data-action="all-off">
              <span>🌙</span> 모든 조명 끄기
            </button>
            <button class="ghm-btn ghm-btn-action" data-action="all-on">
              <span>☀️</span> 모든 조명 켜기
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 장소 목록 렌더링
   */
  renderStructures() {
    if (this.structures.length === 0) {
      return '<div class="ghm-empty">등록된 장소가 없습니다.</div>';
    }

    return `
      <div class="ghm-structures">
        <div class="ghm-list">
          ${this.structures.map(s => `
            <div class="ghm-list-item ${s.hidden ? 'ghm-hidden' : ''}" data-structure="${s.name}">
              <div class="ghm-item-icon">
                ${s.type === 'store' ? '🏪' : s.type === 'office' ? '🏢' : '🏠'}
              </div>
              <div class="ghm-item-info">
                <div class="ghm-item-name">${s.name}</div>
                <div class="ghm-item-meta">
                  ${s.deviceCount}개 기기 · ${s.hidden ? '숨김' : s.enabled ? '활성' : '비활성'}
                </div>
              </div>
              <div class="ghm-item-actions">
                <button class="ghm-btn-icon" data-action="edit-structure" data-name="${s.name}" title="편집">
                  ✏️
                </button>
                <button class="ghm-btn-icon" data-action="toggle-hide-structure" data-name="${s.name}" data-hidden="${s.hidden}" title="${s.hidden ? '표시' : '숨기기'}">
                  ${s.hidden ? '👁️' : '🙈'}
                </button>
                <label class="ghm-switch">
                  <input type="checkbox" ${s.enabled ? 'checked' : ''} data-action="toggle-structure" data-name="${s.name}">
                  <span class="ghm-slider"></span>
                </label>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * 방 목록 렌더링
   */
  renderRooms() {
    // 구조물별로 그룹화
    const roomsByStructure = {};
    this.rooms.forEach(r => {
      if (!roomsByStructure[r.structure]) {
        roomsByStructure[r.structure] = [];
      }
      roomsByStructure[r.structure].push(r);
    });

    if (Object.keys(roomsByStructure).length === 0) {
      return '<div class="ghm-empty">등록된 방이 없습니다.</div>';
    }

    return `
      <div class="ghm-rooms">
        ${Object.entries(roomsByStructure).map(([structure, rooms]) => `
          <div class="ghm-group">
            <div class="ghm-group-header">
              <span>🏠 ${structure}</span>
              <span class="ghm-badge">${rooms.length}</span>
            </div>
            <div class="ghm-list">
              ${rooms.map(r => `
                <div class="ghm-list-item ${r.hidden ? 'ghm-hidden' : ''}" data-room="${r.name}" data-structure="${r.structure}">
                  <div class="ghm-item-icon">🚪</div>
                  <div class="ghm-item-info">
                    <div class="ghm-item-name">${r.name}</div>
                    <div class="ghm-item-meta">
                      ${r.deviceCount}개 기기 · ${r.hidden ? '숨김' : r.enabled ? '활성' : '비활성'}
                    </div>
                  </div>
                  <div class="ghm-item-actions">
                    <button class="ghm-btn-icon" data-action="edit-room" data-name="${r.name}" data-structure="${r.structure}" title="편집">
                      ✏️
                    </button>
                    <button class="ghm-btn-icon" data-action="toggle-hide-room" data-name="${r.name}" data-structure="${r.structure}" data-hidden="${r.hidden}" title="${r.hidden ? '표시' : '숨기기'}">
                      ${r.hidden ? '👁️' : '🙈'}
                    </button>
                    <label class="ghm-switch">
                      <input type="checkbox" ${r.enabled ? 'checked' : ''} data-action="toggle-room" data-name="${r.name}" data-structure="${r.structure}">
                      <span class="ghm-slider"></span>
                    </label>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * 기기 목록 렌더링
   */
  renderDevices() {
    // 방별로 그룹화
    const devicesByRoom = {};
    this.devices.forEach(d => {
      const key = `${d.structure}:${d.room || '미지정'}`;
      if (!devicesByRoom[key]) {
        devicesByRoom[key] = { structure: d.structure, room: d.room || '미지정', devices: [] };
      }
      devicesByRoom[key].devices.push(d);
    });

    if (Object.keys(devicesByRoom).length === 0) {
      return '<div class="ghm-empty">등록된 기기가 없습니다.</div>';
    }

    return `
      <div class="ghm-devices">
        <div class="ghm-toolbar">
          <select id="filterStructure" class="ghm-select">
            <option value="">모든 장소</option>
            ${this.structures.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
          <select id="filterType" class="ghm-select">
            <option value="">모든 종류</option>
            ${[...new Set(this.devices.map(d => d.type))].map(t =>
              `<option value="${t}">${this.getTypeName(t)}</option>`
            ).join('')}
          </select>
        </div>

        ${Object.values(devicesByRoom).map(group => `
          <div class="ghm-group">
            <div class="ghm-group-header">
              <span>📍 ${group.structure} > ${group.room}</span>
              <span class="ghm-badge">${group.devices.length}</span>
            </div>
            <div class="ghm-device-grid">
              ${group.devices.map(d => this.renderDeviceCard(d)).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * 기기 카드 렌더링
   */
  renderDeviceCard(device) {
    const isOn = device.state?.on === true;
    const typeIcon = this.getTypeIcon(device.type);
    const typeName = this.getTypeName(device.type);

    return `
      <div class="ghm-device-card ${device.hidden ? 'ghm-hidden' : ''} ${isOn ? 'ghm-device-on' : ''}"
           data-device-id="${device.id}">
        <div class="ghm-device-header">
          <span class="ghm-device-icon">${typeIcon}</span>
          <div class="ghm-device-status ${isOn ? 'on' : 'off'}"></div>
        </div>
        <div class="ghm-device-name">${device.customName || device.name}</div>
        <div class="ghm-device-type">${typeName}</div>
        <div class="ghm-device-actions">
          <button class="ghm-btn-sm ${isOn ? 'active' : ''}" data-action="control" data-id="${device.id}" data-cmd="toggle">
            ${isOn ? '끄기' : '켜기'}
          </button>
          <button class="ghm-btn-icon-sm" data-action="edit-device" data-id="${device.id}" title="설정">
            ⚙️
          </button>
          <button class="ghm-btn-icon-sm" data-action="toggle-hide-device" data-id="${device.id}" data-hidden="${device.hidden}" title="${device.hidden ? '표시' : '숨기기'}">
            ${device.hidden ? '👁️' : '🙈'}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 기기 편집 모달 렌더링
   */
  renderDeviceEditModal(device) {
    return `
      <div class="ghm-modal-overlay" id="deviceEditModal">
        <div class="ghm-modal">
          <div class="ghm-modal-header">
            <h3>기기 설정</h3>
            <button class="ghm-modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="ghm-modal-body">
            <div class="ghm-form-group">
              <label>표시 이름</label>
              <input type="text" id="deviceCustomName" value="${device.customName || device.name}" placeholder="${device.name}">
            </div>
            <div class="ghm-form-group">
              <label>장소</label>
              <select id="deviceStructure">
                ${this.structures.map(s => `
                  <option value="${s.name}" ${s.name === device.structure ? 'selected' : ''}>${s.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="ghm-form-group">
              <label>방</label>
              <select id="deviceRoom">
                ${this.rooms.filter(r => r.structure === device.structure).map(r => `
                  <option value="${r.name}" ${r.name === device.room ? 'selected' : ''}>${r.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="ghm-form-group">
              <label class="ghm-checkbox">
                <input type="checkbox" id="deviceEnabled" ${device.enabled ? 'checked' : ''}>
                <span>AI 제어 활성화</span>
              </label>
            </div>
            <div class="ghm-form-group">
              <label class="ghm-checkbox">
                <input type="checkbox" id="deviceHidden" ${device.hidden ? 'checked' : ''}>
                <span>목록에서 숨기기</span>
              </label>
            </div>
          </div>
          <div class="ghm-modal-footer">
            <button class="ghm-btn" data-action="close-modal">취소</button>
            <button class="ghm-btn ghm-btn-primary" data-action="save-device" data-id="${device.id}">저장</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners(container) {
    // 탭 전환
    container.querySelectorAll('.ghm-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        this.currentView = tab.dataset.view;
        await this.render(container);
      });
    });

    // 새로고침
    const refreshBtn = container.querySelector('#ghmRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await this.render(container);
      });
    }

    // 숨김 토글
    const showHiddenToggle = container.querySelector('#showHiddenToggle');
    if (showHiddenToggle) {
      showHiddenToggle.addEventListener('change', async (e) => {
        this.showHidden = e.target.checked;
        await this.render(container);
      });
    }

    // 장소 토글
    container.querySelectorAll('[data-action="toggle-structure"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const name = e.target.dataset.name;
        await this.apiClient.put(`/google-home/structures/${encodeURIComponent(name)}`, {
          enabled: e.target.checked
        });
        await this.render(container);
      });
    });

    // 장소 숨기기 토글
    container.querySelectorAll('[data-action="toggle-hide-structure"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const hidden = btn.dataset.hidden === 'true';
        await this.apiClient.put(`/google-home/structures/${encodeURIComponent(name)}`, {
          hidden: !hidden
        });
        await this.render(container);
      });
    });

    // 방 토글
    container.querySelectorAll('[data-action="toggle-room"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const name = e.target.dataset.name;
        const structure = e.target.dataset.structure;
        await this.apiClient.put(`/google-home/rooms/${encodeURIComponent(structure)}/${encodeURIComponent(name)}`, {
          enabled: e.target.checked
        });
        await this.render(container);
      });
    });

    // 방 숨기기 토글
    container.querySelectorAll('[data-action="toggle-hide-room"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const structure = btn.dataset.structure;
        const hidden = btn.dataset.hidden === 'true';
        await this.apiClient.put(`/google-home/rooms/${encodeURIComponent(structure)}/${encodeURIComponent(name)}`, {
          hidden: !hidden
        });
        await this.render(container);
      });
    });

    // 기기 제어
    container.querySelectorAll('[data-action="control"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const cmd = btn.dataset.cmd;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await this.apiClient.post(`/google-home/devices/${id}/control`, { action: cmd });
          setTimeout(() => this.render(container), 1000);
        } catch (error) {
          alert(`제어 실패: ${error.message}`);
          await this.render(container);
        }
      });
    });

    // 기기 숨기기 토글
    container.querySelectorAll('[data-action="toggle-hide-device"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const hidden = btn.dataset.hidden === 'true';
        await this.apiClient.put(`/google-home/devices/${id}`, { hidden: !hidden });
        await this.render(container);
      });
    });

    // 기기 편집
    container.querySelectorAll('[data-action="edit-device"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const device = this.devices.find(d => d.id === id);
        if (device) {
          container.insertAdjacentHTML('beforeend', this.renderDeviceEditModal(device));
          this.attachModalListeners(container, device);
        }
      });
    });

    // 빠른 제어
    container.querySelectorAll('[data-action="all-off"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('모든 조명을 끄시겠습니까?')) {
          try {
            await this.apiClient.post('/mcp/google-home/control', { command: '모든 조명 꺼줘' });
            setTimeout(() => this.render(container), 2000);
          } catch (error) {
            alert(`실패: ${error.message}`);
          }
        }
      });
    });

    container.querySelectorAll('[data-action="all-on"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('모든 조명을 켜시겠습니까?')) {
          try {
            await this.apiClient.post('/mcp/google-home/control', { command: '모든 조명 켜줘' });
            setTimeout(() => this.render(container), 2000);
          } catch (error) {
            alert(`실패: ${error.message}`);
          }
        }
      });
    });

    // ========== Apple TV 이벤트 ==========
    const scanAppleTVBtn = container.querySelector('#scanAppleTV');
    if (scanAppleTVBtn) {
      scanAppleTVBtn.addEventListener('click', async () => {
        scanAppleTVBtn.disabled = true;
        scanAppleTVBtn.textContent = '검색 중...';
        try {
          const result = await this.apiClient.get('/mcp/google-home/appletv/devices');
          this.appleTVDevices = result.devices || [];
          await this.render(container);
        } catch (error) {
          alert(`Apple TV 검색 실패: ${error.message}\n(로컬 네트워크에서만 작동합니다)`);
          scanAppleTVBtn.disabled = false;
          scanAppleTVBtn.textContent = '🔍 기기 검색';
        }
      });
    }

    // ========== AirPlay 이벤트 ==========
    const scanAirPlayBtn = container.querySelector('#scanAirPlay');
    if (scanAirPlayBtn) {
      scanAirPlayBtn.addEventListener('click', async () => {
        scanAirPlayBtn.disabled = true;
        scanAirPlayBtn.textContent = '검색 중...';
        try {
          const result = await this.apiClient.get('/mcp/google-home/airplay/devices');
          this.airplayDevices = result.devices || [];
          await this.render(container);
        } catch (error) {
          alert(`AirPlay 검색 실패: ${error.message}\n(로컬 네트워크에서만 작동합니다)`);
          scanAirPlayBtn.disabled = false;
          scanAirPlayBtn.textContent = '🔍 기기 검색';
        }
      });
    }

    // ========== 네트워크 이벤트 ==========
    const scanNetworkBtn = container.querySelector('#scanNetwork');
    if (scanNetworkBtn) {
      scanNetworkBtn.addEventListener('click', async () => {
        scanNetworkBtn.disabled = true;
        scanNetworkBtn.textContent = '스캔 중...';
        try {
          const [devicesResult, infoResult] = await Promise.all([
            this.apiClient.get('/mcp/google-home/network/scan'),
            this.apiClient.get('/mcp/google-home/network/info')
          ]);
          this.networkDevices = devicesResult.devices || [];
          this.networkInfo = infoResult;
          await this.render(container);
        } catch (error) {
          alert(`네트워크 스캔 실패: ${error.message}\n(로컬 네트워크에서만 작동합니다)`);
          scanNetworkBtn.disabled = false;
          scanNetworkBtn.textContent = '🔍 기기 스캔';
        }
      });
    }

    // Wake-on-LAN
    const sendWolBtn = container.querySelector('#sendWol');
    if (sendWolBtn) {
      sendWolBtn.addEventListener('click', async () => {
        const macInput = container.querySelector('#wolMac');
        const mac = macInput?.value?.trim();
        if (!mac) {
          alert('MAC 주소를 입력하세요');
          return;
        }
        try {
          await this.apiClient.post('/mcp/google-home/network/wol', { mac });
          alert(`WoL 패킷 전송됨: ${mac}`);
        } catch (error) {
          alert(`WoL 전송 실패: ${error.message}`);
        }
      });
    }
  }

  /**
   * 모달 이벤트 리스너
   */
  attachModalListeners(container, device) {
    const modal = container.querySelector('#deviceEditModal');
    if (!modal) return;

    // 닫기
    modal.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
      btn.addEventListener('click', () => modal.remove());
    });

    // 장소 변경 시 방 목록 업데이트
    const structureSelect = modal.querySelector('#deviceStructure');
    const roomSelect = modal.querySelector('#deviceRoom');
    if (structureSelect && roomSelect) {
      structureSelect.addEventListener('change', () => {
        const selectedStructure = structureSelect.value;
        const rooms = this.rooms.filter(r => r.structure === selectedStructure);
        roomSelect.innerHTML = rooms.map(r =>
          `<option value="${r.name}">${r.name}</option>`
        ).join('');
      });
    }

    // 저장
    modal.querySelector('[data-action="save-device"]')?.addEventListener('click', async () => {
      const id = device.id;
      const customName = modal.querySelector('#deviceCustomName').value;
      const structure = modal.querySelector('#deviceStructure').value;
      const room = modal.querySelector('#deviceRoom').value;
      const enabled = modal.querySelector('#deviceEnabled').checked;
      const hidden = modal.querySelector('#deviceHidden').checked;

      try {
        await this.apiClient.put(`/google-home/devices/${id}`, {
          customName: customName !== device.name ? customName : null,
          structure,
          room,
          enabled,
          hidden
        });
        modal.remove();
        await this.render(container);
      } catch (error) {
        alert(`저장 실패: ${error.message}`);
      }
    });
  }

  /**
   * 기기 타입 아이콘
   */
  getTypeIcon(type) {
    const icons = {
      'OUTLET': '🔌',
      'SWITCH': '🎚️',
      'LIGHT': '💡',
      'AC_UNIT': '❄️',
      'TV': '📺',
      'FAN': '🌀',
      'SPEAKER': '🔊',
      'VACUUM': '🧹',
      'CAMERA': '📷',
      'THERMOSTAT': '🌡️',
      'HEATER': '🔥',
      'HUMIDIFIER': '💨',
      'AIRPURIFIER': '🌬️',
      'WASHER': '🧺',
      'BOILER': '♨️',
      'LOCK': '🔒'
    };
    return icons[type] || '📦';
  }

  /**
   * 기기 타입 이름
   */
  getTypeName(type) {
    const names = {
      'OUTLET': '콘센트',
      'SWITCH': '스위치',
      'LIGHT': '조명',
      'AC_UNIT': '에어컨',
      'TV': 'TV',
      'FAN': '선풍기',
      'SPEAKER': '스피커',
      'VACUUM': '청소기',
      'CAMERA': '카메라',
      'THERMOSTAT': '온도조절기',
      'HEATER': '히터',
      'HUMIDIFIER': '가습기',
      'AIRPURIFIER': '공기청정기',
      'WASHER': '세탁기',
      'BOILER': '보일러',
      'LOCK': '도어락'
    };
    return names[type] || type;
  }

  // ========== Apple TV 섹션 ==========
  renderAppleTV() {
    return `
      <div class="ghm-section">
        <div class="ghm-section-header">
          <h3>📺 Apple TV</h3>
          <button class="ghm-btn ghm-btn-scan" id="scanAppleTV">
            🔍 기기 검색
          </button>
        </div>
        <p class="ghm-note">Apple TV 기기를 검색하고 제어합니다. (로컬 네트워크 필요)</p>

        <div id="appleTVList" class="ghm-device-list">
          ${this.appleTVDevices.length === 0 ? `
            <div class="ghm-empty">
              <span style="font-size: 3rem;">📺</span>
              <p>검색된 Apple TV가 없습니다</p>
              <p class="ghm-note">같은 네트워크에서 검색 버튼을 눌러주세요</p>
            </div>
          ` : this.appleTVDevices.map(device => `
            <div class="ghm-device-card" data-id="${device.identifier}">
              <div class="ghm-device-icon">📺</div>
              <div class="ghm-device-info">
                <div class="ghm-device-name">${device.name}</div>
                <div class="ghm-device-meta">${device.address}</div>
                <div class="ghm-device-meta">${device.paired ? '✅ 페어링됨' : '🔗 페어링 필요'}</div>
              </div>
              <div class="ghm-device-actions">
                ${device.paired ? `
                  <button class="ghm-btn ghm-btn-sm" data-action="atv-playpause" data-id="${device.identifier}">⏯️</button>
                  <button class="ghm-btn ghm-btn-sm" data-action="atv-menu" data-id="${device.identifier}">📋</button>
                ` : `
                  <button class="ghm-btn ghm-btn-sm" data-action="atv-pair" data-id="${device.identifier}">🔗 페어링</button>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ========== AirPlay 섹션 ==========
  renderAirPlay() {
    return `
      <div class="ghm-section">
        <div class="ghm-section-header">
          <h3>📡 AirPlay</h3>
          <button class="ghm-btn ghm-btn-scan" id="scanAirPlay">
            🔍 기기 검색
          </button>
        </div>
        <p class="ghm-note">AirPlay 기기로 오디오/비디오를 스트리밍합니다.</p>

        <div id="airplayList" class="ghm-device-list">
          ${this.airplayDevices.length === 0 ? `
            <div class="ghm-empty">
              <span style="font-size: 3rem;">📡</span>
              <p>검색된 AirPlay 기기가 없습니다</p>
              <p class="ghm-note">같은 네트워크에서 검색 버튼을 눌러주세요</p>
            </div>
          ` : this.airplayDevices.map(device => `
            <div class="ghm-device-card">
              <div class="ghm-device-icon">🔊</div>
              <div class="ghm-device-info">
                <div class="ghm-device-name">${device.friendly_name || device.name}</div>
                <div class="ghm-device-meta">${device.addresses?.[0] || 'Unknown IP'}</div>
                <div class="ghm-device-meta">${device.model || device.type}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ========== 네트워크 섹션 ==========
  renderNetwork() {
    return `
      <div class="ghm-section">
        <div class="ghm-section-header">
          <h3>🌐 네트워크</h3>
          <button class="ghm-btn ghm-btn-scan" id="scanNetwork">
            🔍 기기 스캔
          </button>
        </div>
        <p class="ghm-note">로컬 네트워크의 스마트홈 기기를 검색합니다.</p>

        ${this.networkInfo ? `
          <div class="ghm-info-box">
            <div><strong>로컬 IP:</strong> ${this.networkInfo.local_ip}</div>
            <div><strong>서브넷:</strong> ${this.networkInfo.subnet}</div>
            <div><strong>호스트:</strong> ${this.networkInfo.hostname}</div>
          </div>
        ` : ''}

        <div id="networkList" class="ghm-device-list">
          ${this.networkDevices.length === 0 ? `
            <div class="ghm-empty">
              <span style="font-size: 3rem;">🌐</span>
              <p>검색된 기기가 없습니다</p>
              <p class="ghm-note">검색 버튼을 눌러 네트워크를 스캔하세요</p>
            </div>
          ` : this.networkDevices.map(device => `
            <div class="ghm-device-card">
              <div class="ghm-device-icon">${this.getNetworkDeviceIcon(device.type)}</div>
              <div class="ghm-device-info">
                <div class="ghm-device-name">${device.friendly_name || device.name.split('.')[0]}</div>
                <div class="ghm-device-meta">${device.addresses?.[0] || 'Unknown'}</div>
                <div class="ghm-device-meta">${device.type.replace('._tcp.local.', '').replace('_', '')}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="ghm-section" style="margin-top: 1.5rem;">
          <h4>🔋 Wake-on-LAN</h4>
          <div class="ghm-wol-form">
            <input type="text" id="wolMac" placeholder="MAC 주소 (AA:BB:CC:DD:EE:FF)" class="ghm-input">
            <button class="ghm-btn" id="sendWol">⚡ WoL 전송</button>
          </div>
        </div>
      </div>
    `;
  }

  getNetworkDeviceIcon(type) {
    if (type.includes('airplay')) return '📡';
    if (type.includes('googlecast')) return '🏠';
    if (type.includes('hap')) return '🍎';
    if (type.includes('matter')) return '🔗';
    if (type.includes('raop')) return '🔊';
    return '📦';
  }
}
