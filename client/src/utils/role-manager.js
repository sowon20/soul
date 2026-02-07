/**
 * role-manager.js
 * 역할 관리 UI 컴포넌트
 * - 시스템 역할 (isSystem): 간소화 UI (이름 + 모델만)
 * - 일반 역할: 풀 폼 (이름, 설명, 프롬프트, 모델, 트리거 등)
 */

export class RoleManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.roles = [];
    this.aiServices = [];
    this.selectedRole = null;
  }

  /**
   * 역할 관리 메인 UI 렌더링
   */
  async render() {
    const container = document.createElement('div');
    container.className = 'role-manager';
    container.innerHTML = `
      <div class="role-manager-header">
        <h2>역할 관리</h2>
        <p class="subtitle">Soul의 전문가 팀을 관리하세요</p>
      </div>

      <div class="role-manager-actions">
        <button class="btn btn-primary" id="createRoleBtn">
          <span class="icon">+</span>
          새 역할 고용
        </button>
        <button class="btn btn-secondary" id="refreshRolesBtn">
          <span class="icon">~</span>
          새로고침
        </button>
      </div>

      <div class="role-stats-summary" id="roleStatsSummary">
        <div class="stat-card">
          <div class="stat-value" id="totalRoles">-</div>
          <div class="stat-label">전체 역할</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="activeRoles">-</div>
          <div class="stat-label">활성</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="systemRoles">-</div>
          <div class="stat-label">시스템</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="userRoles">-</div>
          <div class="stat-label">사용자</div>
        </div>
      </div>

      <div class="role-list" id="roleList">
        <div class="loading">역할 로딩 중...</div>
      </div>
    `;

    // 이벤트 리스너
    container.querySelector('#createRoleBtn').addEventListener('click', () => this.showCreateForm());
    container.querySelector('#refreshRolesBtn').addEventListener('click', () => this.loadRoles());

    // AI 서비스 목록 로드 + 역할 로드
    await Promise.all([
      this.loadAIServices(),
      this.loadRoles()
    ]);

    return container;
  }

  /**
   * AI 서비스 목록 로드 (모델 선택용)
   */
  async loadAIServices() {
    try {
      const response = await this.apiClient.get('/ai-services');
      if (response.success) {
        this.aiServices = (response.services || []).filter(s => s.isActive);
      }
    } catch (error) {
      console.error('AI 서비스 로드 실패:', error);
      this.aiServices = [];
    }
  }

  /**
   * 역할 목록 로드
   */
  async loadRoles() {
    const listContainer = document.getElementById('roleList');
    if (listContainer) {
      listContainer.innerHTML = '<div class="loading">역할 로딩 중...</div>';
    }

    try {
      const response = await this.apiClient.get('/roles');

      if (response.success) {
        this.roles = response.roles;
        this.renderRoleList();
        this.updateStats();
      } else {
        throw new Error(response.error || '역할 로드 실패');
      }
    } catch (error) {
      console.error('역할 로드 실패:', error);
      const listContainer = document.getElementById('roleList');
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="error-state">
            <p style="color: #ef4444; margin-bottom: 0.5rem;">역할을 불러오는데 실패했습니다</p>
            <p style="font-size: 0.875rem; opacity: 0.7; margin-bottom: 1rem;">${error.message}</p>
            <button class="btn btn-primary" onclick="window.roleManager.loadRoles()">다시 시도</button>
          </div>
        `;
      }
      this.roles = [];
      this.updateStats();
    }
  }

  /**
   * 역할 목록 렌더링 - 시스템/일반 분리
   */
  renderRoleList() {
    const listContainer = document.getElementById('roleList');
    if (!listContainer) return;

    const systemRoles = this.roles.filter(r => r.isSystem);
    const userRoles = this.roles.filter(r => !r.isSystem);

    let html = '';

    // 시스템 역할 섹션
    if (systemRoles.length > 0) {
      html += `
        <div class="role-section">
          <div class="role-section-header">
            <h3 class="role-section-title">시스템 역할</h3>
            <span class="role-section-desc">자동으로 동작하는 내장 역할입니다. 모델만 변경할 수 있습니다.</span>
          </div>
          <div class="role-section-list">
            ${systemRoles.map(role => this.renderSystemRoleCard(role)).join('')}
          </div>
        </div>
      `;
    }

    // 일반 역할 섹션
    html += `
      <div class="role-section">
        <div class="role-section-header">
          <h3 class="role-section-title">사용자 역할</h3>
          <span class="role-section-desc">직접 만든 전문가 역할입니다.</span>
        </div>
        <div class="role-section-list">
          ${userRoles.length > 0
            ? userRoles.map(role => this.renderUserRoleCard(role)).join('')
            : '<div class="empty-state">아직 만든 역할이 없습니다. "새 역할 고용" 버튼으로 추가하세요.</div>'
          }
        </div>
      </div>
    `;

    listContainer.innerHTML = html;
  }

  /**
   * 시스템 역할 카드 - 간소화 UI
   */
  renderSystemRoleCard(role) {
    const config = role.config || {};
    const serviceId = config.serviceId || '';
    const serviceName = this.getServiceDisplayName(serviceId);
    const modelName = this.getModelDisplayName(role.preferredModel);

    return `
      <div class="role-card role-card-system ${!role.active ? 'inactive' : ''}" data-role-id="${role.roleId}">
        <div class="role-card-header">
          <div class="role-info">
            <div class="role-name-row">
              <span class="role-system-icon" title="시스템 역할">S</span>
              <h3 class="role-name">${role.name}</h3>
              <span class="role-badge role-badge-system">시스템</span>
              ${!role.active ? '<span class="role-badge role-badge-inactive">비활성</span>' : ''}
            </div>
            <p class="role-description">${role.description || ''}</p>
          </div>
          <div class="role-actions">
            <button class="btn-icon" onclick="roleManager.editSystemRole('${role.roleId}')" title="모델 변경">
              <span class="icon">설정</span>
            </button>
          </div>
        </div>
        <div class="role-model-info">
          <div class="model-badge">
            <span class="model-service">${serviceName}</span>
            <span class="model-separator">/</span>
            <span class="model-name">${modelName}</span>
          </div>
          ${role.active
            ? '<span class="role-status-dot active" title="활성"></span>'
            : '<span class="role-status-dot inactive" title="비활성"></span>'
          }
        </div>
      </div>
    `;
  }

  /**
   * 일반 역할 카드 - 풀 UI
   */
  renderUserRoleCard(role) {
    const triggers = role.triggers || [];

    return `
      <div class="role-card role-card-user ${!role.active ? 'inactive' : ''}" data-role-id="${role.roleId}">
        <div class="role-card-header">
          <div class="role-info">
            <h3 class="role-name">${role.name}</h3>
            <span class="role-badge role-badge-${role.category || 'other'}">${this.getCategoryLabel(role.category)}</span>
            ${role.createdBy === 'auto' ? '<span class="role-badge role-badge-auto">자동생성</span>' : ''}
            ${!role.active ? '<span class="role-badge role-badge-inactive">비활성</span>' : ''}
          </div>
          <div class="role-actions">
            <button class="btn-icon" onclick="roleManager.viewRole('${role.roleId}')" title="상세보기">
              <span class="icon">i</span>
            </button>
            <button class="btn-icon" onclick="roleManager.editRole('${role.roleId}')" title="수정">
              <span class="icon">E</span>
            </button>
            ${role.active ? `
              <button class="btn-icon" onclick="roleManager.deactivateRole('${role.roleId}')" title="휴직">
                <span class="icon">Z</span>
              </button>
            ` : `
              <button class="btn-icon" onclick="roleManager.activateRole('${role.roleId}')" title="재고용">
                <span class="icon">O</span>
              </button>
            `}
            <button class="btn-icon btn-danger" onclick="roleManager.deleteRole('${role.roleId}')" title="삭제">
              <span class="icon">X</span>
            </button>
          </div>
        </div>

        <p class="role-description">${role.description || ''}</p>

        <div class="role-stats">
          <div class="stat-item">
            <span class="stat-label">사용</span>
            <span class="stat-value">${role.stats?.usageCount || 0}회</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">성공률</span>
            <span class="stat-value">${(role.stats?.successRate || 0).toFixed(1)}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">최근</span>
            <span class="stat-value">${this.formatDate(role.stats?.lastUsed)}</span>
          </div>
        </div>

        ${triggers.length > 0 ? `
          <div class="role-triggers">
            <span class="triggers-label">트리거:</span>
            ${triggers.slice(0, 5).map(t => `<span class="trigger-tag">${t}</span>`).join('')}
            ${triggers.length > 5 ? `<span class="trigger-tag">+${triggers.length - 5}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 통계 업데이트
   */
  updateStats() {
    const totalRoles = this.roles.length;
    const activeRoles = this.roles.filter(r => r.active).length;
    const systemCount = this.roles.filter(r => r.isSystem).length;
    const userCount = this.roles.filter(r => !r.isSystem).length;

    const totalRolesEl = document.getElementById('totalRoles');
    const activeRolesEl = document.getElementById('activeRoles');
    const systemRolesEl = document.getElementById('systemRoles');
    const userRolesEl = document.getElementById('userRoles');

    if (totalRolesEl) totalRolesEl.textContent = totalRoles;
    if (activeRolesEl) activeRolesEl.textContent = activeRoles;
    if (systemRolesEl) systemRolesEl.textContent = systemCount;
    if (userRolesEl) userRolesEl.textContent = userCount;
  }

  /**
   * 시스템 역할 수정 (모델 + 이름만)
   */
  async editSystemRole(roleId) {
    const role = this.roles.find(r => r.roleId === roleId);
    if (!role) return;

    const rawConfig = role.config || {};
    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    const currentServiceId = config.serviceId || '';
    const isToolWorker = config.purpose === 'tool-routing';
    console.log('[RoleManager] editSystemRole', roleId, 'config:', config, 'isToolWorker:', isToolWorker);

    // tool-worker면 현재 도구 라우팅 상태 로드
    let toolRoutingEnabled = false;
    let toolRoutingMode = 'single';
    if (isToolWorker) {
      try {
        const res = await this.apiClient.get('/notifications/tool-routing/status');
        toolRoutingEnabled = res.enabled;
        toolRoutingMode = res.mode || 'single';
      } catch (e) { /* 기본값 사용 */ }
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal role-form-modal role-form-system">
        <div class="modal-header">
          <h2>${role.name} 설정</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">X</button>
        </div>
        <form class="modal-content role-form" id="editSystemRoleForm">
          <div class="system-role-info">
            <p class="system-role-desc">${role.description || ''}</p>
            <span class="role-badge role-badge-system">시스템 역할</span>
          </div>

          ${isToolWorker ? `
          <div class="form-group" style="padding: 12px; background: var(--bg-secondary, #f5f5f5); border-radius: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <label style="margin: 0; font-weight: 600;">활성화</label>
              <label class="mcp-toggle">
                <input type="checkbox" id="toolRoutingToggle" ${toolRoutingEnabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <small style="color: var(--text-secondary, #888);">ON: 메인 AI에 도구를 보내지 않고 이 알바가 대신 실행 (토큰 절약)</small>

            <div id="toolRoutingModeSection" style="margin-top: 12px; ${toolRoutingEnabled ? '' : 'display: none;'}">
              <label style="font-size: 13px; margin-bottom: 6px; display: block;">실행 방식</label>
              <div style="display: flex; gap: 16px;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px;">
                  <input type="radio" name="toolRoutingMode" value="single" ${toolRoutingMode === 'single' ? 'checked' : ''}>
                  단일
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px;">
                  <input type="radio" name="toolRoutingMode" value="chain" ${toolRoutingMode === 'chain' ? 'checked' : ''}>
                  체인
                </label>
              </div>
              <small style="color: var(--text-secondary, #888); margin-top: 4px; display: block;">단일: 선택한 모델만 사용 / 체인: 실패 시 다음 모델로 자동 전환</small>
            </div>
          </div>
          ` : ''}

          <div class="form-group">
            <label>이름</label>
            <input type="text" name="name" value="${role.name}" placeholder="역할 이름">
          </div>

          <div class="form-group">
            <label>AI 서비스</label>
            <select name="serviceId" id="systemRoleService">
              ${this.renderServiceOptions(currentServiceId)}
            </select>
          </div>

          <div class="form-group">
            <label>모델</label>
            <select name="preferredModel" id="systemRoleModel">
              ${this.renderModelOptions(currentServiceId, role.preferredModel)}
            </select>
            <small>이 역할이 사용할 AI 모델을 선택하세요</small>
          </div>

          <div class="form-group">
            <label>메모</label>
            <textarea name="description" rows="3" placeholder="이 알바에 대한 메모 (모델 선택 이유, 설정 참고사항 등)">${role.description || ''}</textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
            <button type="submit" class="btn btn-primary">저장</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // 서비스 변경 시 모델 목록 업데이트
    const serviceSelect = document.getElementById('systemRoleService');
    const modelSelect = document.getElementById('systemRoleModel');
    serviceSelect.addEventListener('change', () => {
      modelSelect.innerHTML = this.renderModelOptions(serviceSelect.value, '');
    });

    // tool-worker: 토글 변경 시 모드 섹션 표시/숨김
    if (isToolWorker) {
      const toggle = document.getElementById('toolRoutingToggle');
      const modeSection = document.getElementById('toolRoutingModeSection');
      if (toggle && modeSection) {
        toggle.addEventListener('change', () => {
          modeSection.style.display = toggle.checked ? '' : 'none';
        });
      }
    }

    // 폼 제출
    document.getElementById('editSystemRoleForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const newServiceId = formData.get('serviceId');
      const newModel = formData.get('preferredModel');
      const newName = formData.get('name');

      // config 업데이트
      const updatedConfig = { ...config, serviceId: newServiceId };

      try {
        // tool-worker면 도구 라우팅 설정도 저장
        if (isToolWorker) {
          const enabled = document.getElementById('toolRoutingToggle')?.checked || false;
          const mode = formData.get('toolRoutingMode') || 'single';
          await this.apiClient.post('/notifications/tool-routing/toggle', { enabled, mode });
        }

        const response = await this.apiClient.patch(`/roles/${roleId}`, {
          name: newName,
          preferredModel: newModel,
          description: formData.get('description') || '',
          config: JSON.stringify(updatedConfig)
        });

        if (response.success) {
          this.showSuccess(`${newName} 설정이 저장되었습니다.`);
          modal.remove();
          await this.loadRoles();
        }
      } catch (error) {
        console.error('시스템 역할 수정 실패:', error);
        this.showError('설정 저장에 실패했습니다.');
      }
    });
  }

  /**
   * 일반 역할 수정 폼
   */
  async editRole(roleId) {
    const role = this.roles.find(r => r.roleId === roleId);
    if (!role) return;

    // 시스템 역할이면 간소화 폼으로
    if (role.isSystem) {
      return this.editSystemRole(roleId);
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal role-form-modal">
        <div class="modal-header">
          <h2>${role.name} 수정</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">X</button>
        </div>
        <form class="modal-content role-form" id="editRoleForm">
          <div class="form-group">
            <label>이름 *</label>
            <input type="text" name="name" required value="${role.name}" placeholder="역할 이름">
          </div>

          <div class="form-group">
            <label>설명</label>
            <textarea name="description" placeholder="이 역할이 하는 일을 설명하세요">${role.description || ''}</textarea>
          </div>

          <div class="form-group">
            <label>카테고리</label>
            <select name="category">
              ${['content', 'code', 'data', 'creative', 'technical', 'other'].map(c =>
                `<option value="${c}" ${role.category === c ? 'selected' : ''}>${this.getCategoryLabel(c)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>트리거 키워드</label>
            <input type="text" name="triggers" value="${(role.triggers || []).join(', ')}" placeholder="쉼표로 구분: 작성, 글쓰기, 콘텐츠">
            <small>이 키워드가 포함되면 역할이 감지됩니다</small>
          </div>

          <div class="form-group">
            <label>시스템 프롬프트</label>
            <textarea name="systemPrompt" rows="5" placeholder="당신은 전문 콘텐츠 작가입니다...">${role.systemPrompt || ''}</textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>우선 모델</label>
              <input type="text" name="preferredModel" value="${role.preferredModel || ''}" placeholder="모델 ID">
            </div>

            <div class="form-group">
              <label>온도 (0-2)</label>
              <input type="number" name="temperature" step="0.1" min="0" max="2" value="${role.temperature || 0.7}">
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
            <button type="submit" class="btn btn-primary">저장</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('editRoleForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        category: formData.get('category'),
        systemPrompt: formData.get('systemPrompt'),
        preferredModel: formData.get('preferredModel'),
        temperature: parseFloat(formData.get('temperature')),
        triggers: formData.get('triggers').split(',').map(t => t.trim()).filter(t => t)
      };

      try {
        const response = await this.apiClient.patch(`/roles/${roleId}`, data);

        if (response.success) {
          this.showSuccess(`${data.name} 역할이 수정되었습니다.`);
          modal.remove();
          await this.loadRoles();
        }
      } catch (error) {
        console.error('역할 수정 실패:', error);
        this.showError('역할 수정에 실패했습니다.');
      }
    });
  }

  /**
   * 역할 상세보기
   */
  async viewRole(roleId) {
    const role = this.roles.find(r => r.roleId === roleId);
    if (!role) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal role-detail-modal">
        <div class="modal-header">
          <h2>${role.name}</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">X</button>
        </div>
        <div class="modal-content">
          <div class="detail-section">
            <h3>기본 정보</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">역할 ID:</span>
                <span class="value">${role.roleId}</span>
              </div>
              <div class="detail-item">
                <span class="label">카테고리:</span>
                <span class="value">${this.getCategoryLabel(role.category)}</span>
              </div>
              <div class="detail-item">
                <span class="label">타입:</span>
                <span class="value">${role.isSystem ? '시스템' : '사용자'}</span>
              </div>
              <div class="detail-item">
                <span class="label">상태:</span>
                <span class="value">${role.active ? '활성' : '비활성'}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h3>설명</h3>
            <p>${role.description || '(없음)'}</p>
          </div>

          <div class="detail-section">
            <h3>AI 설정</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">모델:</span>
                <span class="value">${role.preferredModel || '(미설정)'}</span>
              </div>
              <div class="detail-item">
                <span class="label">온도:</span>
                <span class="value">${role.temperature || '-'}</span>
              </div>
            </div>
          </div>

          ${role.systemPrompt ? `
            <div class="detail-section">
              <h3>시스템 프롬프트</h3>
              <pre class="system-prompt">${role.systemPrompt}</pre>
            </div>
          ` : ''}

          <div class="detail-section">
            <h3>성능 통계</h3>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value-large">${role.stats?.usageCount || 0}</div>
                <div class="stat-label">사용 횟수</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${(role.stats?.successRate || 0).toFixed(1)}%</div>
                <div class="stat-label">성공률</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${this.formatDate(role.stats?.lastUsed)}</div>
                <div class="stat-label">최근 사용</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * 새 역할 생성 폼
   */
  showCreateForm() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal role-form-modal">
        <div class="modal-header">
          <h2>새 역할 고용</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">X</button>
        </div>
        <form class="modal-content role-form" id="createRoleForm">
          <div class="form-group">
            <label>역할 ID *</label>
            <input type="text" name="roleId" required placeholder="예: content_writer">
            <small>영문 소문자, 숫자, 언더스코어만 사용</small>
          </div>

          <div class="form-group">
            <label>이름 *</label>
            <input type="text" name="name" required placeholder="예: 콘텐츠 작가">
          </div>

          <div class="form-group">
            <label>설명 *</label>
            <textarea name="description" required placeholder="이 역할이 하는 일을 설명하세요"></textarea>
          </div>

          <div class="form-group">
            <label>카테고리 *</label>
            <select name="category" required>
              <option value="content">콘텐츠</option>
              <option value="code">코드</option>
              <option value="data">데이터</option>
              <option value="creative">크리에이티브</option>
              <option value="technical">기술</option>
              <option value="other">기타</option>
            </select>
          </div>

          <div class="form-group">
            <label>트리거 키워드 *</label>
            <input type="text" name="triggers" required placeholder="쉼표로 구분: 작성, 글쓰기, 콘텐츠">
            <small>이 키워드가 포함되면 역할이 감지됩니다</small>
          </div>

          <div class="form-group">
            <label>시스템 프롬프트 *</label>
            <textarea name="systemPrompt" required rows="5" placeholder="당신은 전문 콘텐츠 작가입니다..."></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>우선 모델</label>
              <input type="text" name="preferredModel" placeholder="모델 ID (예: gpt-4o)">
            </div>

            <div class="form-group">
              <label>온도 (0-2)</label>
              <input type="number" name="temperature" step="0.1" min="0" max="2" value="0.7">
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
            <button type="submit" class="btn btn-primary">고용하기</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('createRoleForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.createRole(new FormData(e.target));
      modal.remove();
    });
  }

  /**
   * 역할 생성
   */
  async createRole(formData) {
    const data = {
      roleId: formData.get('roleId'),
      name: formData.get('name'),
      description: formData.get('description'),
      category: formData.get('category'),
      systemPrompt: formData.get('systemPrompt'),
      preferredModel: formData.get('preferredModel'),
      temperature: parseFloat(formData.get('temperature')),
      triggers: formData.get('triggers').split(',').map(t => t.trim()).filter(t => t),
      createdBy: 'user'
    };

    try {
      const response = await this.apiClient.post('/roles', data);

      if (response.success) {
        this.showSuccess(`${data.name} 역할을 성공적으로 고용했습니다!`);
        await this.loadRoles();
      }
    } catch (error) {
      console.error('역할 생성 실패:', error);
      this.showError('역할 생성에 실패했습니다.');
    }
  }

  /**
   * 역할 비활성화 (휴직)
   */
  async deactivateRole(roleId) {
    if (!confirm('이 역할을 휴직 처리하시겠습니까?')) return;

    try {
      const response = await this.apiClient.delete(`/roles/${roleId}`);

      if (response.success) {
        this.showSuccess(response.message);
        await this.loadRoles();
      }
    } catch (error) {
      console.error('역할 비활성화 실패:', error);
      this.showError('역할 비활성화에 실패했습니다.');
    }
  }

  /**
   * 역할 재활성화 (재고용)
   */
  async activateRole(roleId) {
    try {
      const response = await this.apiClient.post(`/roles/${roleId}/activate`);

      if (response.success) {
        this.showSuccess(response.message);
        await this.loadRoles();
      }
    } catch (error) {
      console.error('역할 활성화 실패:', error);
      this.showError('역할 활성화에 실패했습니다.');
    }
  }

  /**
   * 역할 삭제 (완전 퇴사)
   */
  async deleteRole(roleId) {
    const role = this.roles.find(r => r.roleId === roleId);
    if (role?.isSystem) {
      this.showError('시스템 역할은 삭제할 수 없습니다.');
      return;
    }

    if (!confirm('이 역할을 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    try {
      const response = await this.apiClient.delete(`/roles/${roleId}?permanent=true`);

      if (response.success) {
        this.showSuccess(response.message);
        await this.loadRoles();
      }
    } catch (error) {
      console.error('역할 삭제 실패:', error);
      this.showError('역할 삭제에 실패했습니다.');
    }
  }

  /**
   * 서비스 옵션 렌더링
   */
  renderServiceOptions(currentServiceId) {
    if (this.aiServices.length === 0) {
      return '<option value="">활성 서비스 없음</option>';
    }

    return this.aiServices.map(s =>
      `<option value="${s.serviceId}" ${s.serviceId === currentServiceId ? 'selected' : ''}>${s.name}</option>`
    ).join('');
  }

  /**
   * 모델 옵션 렌더링
   */
  renderModelOptions(serviceId, currentModel) {
    const service = this.aiServices.find(s => s.serviceId === serviceId);
    if (!service || !service.models || service.models.length === 0) {
      return currentModel
        ? `<option value="${currentModel}" selected>${currentModel}</option>`
        : '<option value="">모델 없음</option>';
    }

    const models = typeof service.models === 'string'
      ? JSON.parse(service.models)
      : service.models;

    return models.map(m => {
      const modelId = m.id || m;
      const modelName = m.name || modelId;
      return `<option value="${modelId}" ${modelId === currentModel ? 'selected' : ''}>${modelName}</option>`;
    }).join('');
  }

  /**
   * 서비스 표시 이름
   */
  getServiceDisplayName(serviceId) {
    const names = {
      'anthropic': 'Claude',
      'openai': 'OpenAI',
      'google': 'Google',
      'xai': 'xAI',
      'ollama': 'Ollama',
      'huggingface': 'HuggingFace',
      'openrouter': 'OpenRouter'
    };
    return names[serviceId] || serviceId || '미설정';
  }

  /**
   * 모델 표시 이름
   */
  getModelDisplayName(modelId) {
    if (!modelId) return '미설정';
    // 긴 모델명은 마지막 부분만
    const parts = modelId.split('/');
    return parts[parts.length - 1];
  }

  /**
   * 헬퍼 함수들
   */
  getCategoryLabel(category) {
    const labels = {
      content: '콘텐츠',
      code: '코드',
      data: '데이터',
      creative: '크리에이티브',
      technical: '기술',
      other: '기타'
    };
    return labels[category] || category || '기타';
  }

  formatDate(dateStr) {
    if (!dateStr) return '사용 안됨';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    if (days < 30) return `${Math.floor(days / 7)}주 전`;
    return `${Math.floor(days / 30)}개월 전`;
  }

  showSuccess(message) {
    // TODO: 토스트 메시지 구현
    alert(message);
  }

  showError(message) {
    // TODO: 토스트 메시지 구현
    alert(message);
  }
}

// 전역 인스턴스
let roleManager = null;

export function initRoleManager(apiClient) {
  roleManager = new RoleManager(apiClient);
  window.roleManager = roleManager; // onclick에서 접근 가능하도록
  return roleManager;
}
