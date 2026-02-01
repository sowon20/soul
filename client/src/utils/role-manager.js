/**
 * role-manager.js
 * 역할 관리 UI 컴포넌트
 */

export class RoleManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.roles = [];
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
        <h2>👥 역할 관리 (알바 관리)</h2>
        <p class="subtitle">Soul의 전문가 팀을 관리하세요</p>
      </div>

      <div class="role-manager-actions">
        <button class="btn btn-primary" id="createRoleBtn">
          <span class="icon">➕</span>
          새 역할 고용
        </button>
        <button class="btn btn-secondary" id="autoManageBtn">
          <span class="icon">⚡</span>
          자동 최적화
        </button>
        <button class="btn btn-secondary" id="refreshRolesBtn">
          <span class="icon">🔄</span>
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
          <div class="stat-label">활성 역할</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="totalUsage">-</div>
          <div class="stat-label">총 사용 횟수</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="avgSuccessRate">-</div>
          <div class="stat-label">평균 성공률</div>
        </div>
      </div>

      <div class="role-filters">
        <select id="categoryFilter" class="filter-select">
          <option value="all">모든 카테고리</option>
          <option value="content">콘텐츠</option>
          <option value="code">코드</option>
          <option value="data">데이터</option>
          <option value="creative">크리에이티브</option>
          <option value="technical">기술</option>
          <option value="other">기타</option>
        </select>

        <select id="statusFilter" class="filter-select">
          <option value="all">모든 상태</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>

        <select id="sortBy" class="filter-select">
          <option value="usageCount">사용 횟수순</option>
          <option value="lastUsed">최근 사용순</option>
          <option value="successRate">성공률순</option>
          <option value="name">이름순</option>
        </select>
      </div>

      <div class="role-list" id="roleList">
        <div class="loading">역할 로딩 중...</div>
      </div>
    `;

    // 이벤트 리스너
    container.querySelector('#createRoleBtn').addEventListener('click', () => this.showCreateForm());
    container.querySelector('#autoManageBtn').addEventListener('click', () => this.runAutoManage());
    container.querySelector('#refreshRolesBtn').addEventListener('click', () => this.loadRoles());
    container.querySelector('#categoryFilter').addEventListener('change', () => this.loadRoles());
    container.querySelector('#statusFilter').addEventListener('change', () => this.loadRoles());
    container.querySelector('#sortBy').addEventListener('change', () => this.loadRoles());

    // 초기 로드
    await this.loadRoles();

    return container;
  }

  /**
   * 역할 목록 로드
   */
  async loadRoles() {
    const listContainer = document.getElementById('roleList');
    if (listContainer) {
      listContainer.innerHTML = '<div class="loading">역할 로딩 중...</div>';
    }

    const category = document.getElementById('categoryFilter')?.value;
    const status = document.getElementById('statusFilter')?.value;
    const sortBy = document.getElementById('sortBy')?.value;

    let url = '/roles';
    const params = [];

    if (category && category !== 'all') params.push(`category=${category}`);
    if (status === 'active') params.push('active=true');
    if (status === 'inactive') params.push('active=false');
    if (sortBy) params.push(`sortBy=${sortBy}`);

    if (params.length > 0) url += '?' + params.join('&');

    try {
      const response = await this.apiClient.get(url);

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
            <p style="color: #ef4444; margin-bottom: 0.5rem;">❌ 역할을 불러오는데 실패했습니다</p>
            <p style="font-size: 0.875rem; opacity: 0.7; margin-bottom: 1rem;">${error.message}</p>
            <button class="btn btn-primary" onclick="window.roleManager.loadRoles()">다시 시도</button>
          </div>
        `;
      }
      // 빈 배열로라도 초기화
      this.roles = [];
      this.updateStats();
    }
  }

  /**
   * 역할 목록 렌더링
   */
  renderRoleList() {
    const listContainer = document.getElementById('roleList');

    if (this.roles.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">역할이 없습니다.</div>';
      return;
    }

    listContainer.innerHTML = this.roles.map(role => `
      <div class="role-card ${!role.active ? 'inactive' : ''}" data-role-id="${role.roleId}">
        <div class="role-card-header">
          <div class="role-info">
            <h3 class="role-name">${role.name}</h3>
            <span class="role-badge role-badge-${role.category}">${this.getCategoryLabel(role.category)}</span>
            ${role.createdBy === 'auto' ? '<span class="role-badge role-badge-auto">자동생성</span>' : ''}
            ${!role.active ? '<span class="role-badge role-badge-inactive">비활성</span>' : ''}
          </div>
          <div class="role-actions">
            <button class="btn-icon" onclick="roleManager.viewRole('${role.roleId}')" title="상세보기">
              <span class="icon">👁️</span>
            </button>
            <button class="btn-icon" onclick="roleManager.editRole('${role.roleId}')" title="수정">
              <span class="icon">✏️</span>
            </button>
            ${role.active ? `
              <button class="btn-icon" onclick="roleManager.deactivateRole('${role.roleId}')" title="휴직">
                <span class="icon">😴</span>
              </button>
            ` : `
              <button class="btn-icon" onclick="roleManager.activateRole('${role.roleId}')" title="재고용">
                <span class="icon">✅</span>
              </button>
            `}
            <button class="btn-icon btn-danger" onclick="roleManager.deleteRole('${role.roleId}')" title="퇴사">
              <span class="icon">🗑️</span>
            </button>
          </div>
        </div>

        <p class="role-description">${role.description}</p>

        <div class="role-stats">
          <div class="stat-item">
            <span class="stat-label">사용</span>
            <span class="stat-value">${role.stats.usageCount || 0}회</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">성공률</span>
            <span class="stat-value">${(role.stats.successRate || 0).toFixed(1)}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">최근 사용</span>
            <span class="stat-value">${this.formatDate(role.stats.lastUsed)}</span>
          </div>
        </div>

        <div class="role-triggers">
          <span class="triggers-label">트리거:</span>
          ${role.triggers.slice(0, 5).map(t => `<span class="trigger-tag">${t}</span>`).join('')}
          ${role.triggers.length > 5 ? `<span class="trigger-tag">+${role.triggers.length - 5}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  /**
   * 통계 업데이트
   */
  updateStats() {
    const totalRoles = this.roles.length;
    const activeRoles = this.roles.filter(r => r.active).length;
    const totalUsage = this.roles.reduce((sum, r) => sum + (r.stats.usageCount || 0), 0);
    const avgSuccessRate = totalRoles > 0
      ? this.roles.reduce((sum, r) => sum + (r.stats.successRate || 0), 0) / totalRoles
      : 0;

    const totalRolesEl = document.getElementById('totalRoles');
    const activeRolesEl = document.getElementById('activeRoles');
    const totalUsageEl = document.getElementById('totalUsage');
    const avgSuccessRateEl = document.getElementById('avgSuccessRate');

    if (totalRolesEl) totalRolesEl.textContent = totalRoles;
    if (activeRolesEl) activeRolesEl.textContent = activeRoles;
    if (totalUsageEl) totalUsageEl.textContent = totalUsage;
    if (avgSuccessRateEl) avgSuccessRateEl.textContent = avgSuccessRate.toFixed(1) + '%';
  }

  /**
   * 역할 상세보기
   */
  async viewRole(roleId) {
    try {
      const response = await this.apiClient.get(`/roles/${roleId}`);

      if (response.success) {
        this.showRoleDetail(response.role);
      }
    } catch (error) {
      console.error('역할 조회 실패:', error);
      this.showError('역할 정보를 불러오는데 실패했습니다.');
    }
  }

  /**
   * 역할 상세 정보 표시
   */
  showRoleDetail(role) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal role-detail-modal">
        <div class="modal-header">
          <h2>${role.name}</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
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
                <span class="label">생성자:</span>
                <span class="value">${role.createdBy}</span>
              </div>
              <div class="detail-item">
                <span class="label">상태:</span>
                <span class="value">${role.active ? '활성' : '비활성'}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h3>설명</h3>
            <p>${role.description}</p>
          </div>

          <div class="detail-section">
            <h3>AI 설정</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">우선 모델:</span>
                <span class="value">${role.preferredModel}</span>
              </div>
              <div class="detail-item">
                <span class="label">폴백 모델:</span>
                <span class="value">${role.fallbackModel}</span>
              </div>
              <div class="detail-item">
                <span class="label">최대 토큰:</span>
                <span class="value">${role.maxTokens}</span>
              </div>
              <div class="detail-item">
                <span class="label">온도:</span>
                <span class="value">${role.temperature}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h3>시스템 프롬프트</h3>
            <pre class="system-prompt">${role.systemPrompt}</pre>
          </div>

          <div class="detail-section">
            <h3>트리거 키워드</h3>
            <div class="triggers-list">
              ${role.triggers.map(t => `<span class="trigger-tag">${t}</span>`).join('')}
            </div>
          </div>

          <div class="detail-section">
            <h3>성능 통계</h3>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value-large">${role.stats.usageCount || 0}</div>
                <div class="stat-label">사용 횟수</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${role.stats.successCount || 0}</div>
                <div class="stat-label">성공</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${role.stats.failureCount || 0}</div>
                <div class="stat-label">실패</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${(role.stats.successRate || 0).toFixed(1)}%</div>
                <div class="stat-label">성공률</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${(role.stats.averageResponseTime || 0).toFixed(0)}ms</div>
                <div class="stat-label">평균 응답시간</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${role.stats.totalTokensUsed || 0}</div>
                <div class="stat-label">총 토큰</div>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h3>메타데이터</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">생성일:</span>
                <span class="value">${new Date(role.createdAt).toLocaleString('ko-KR')}</span>
              </div>
              <div class="detail-item">
                <span class="label">수정일:</span>
                <span class="value">${new Date(role.updatedAt).toLocaleString('ko-KR')}</span>
              </div>
              <div class="detail-item">
                <span class="label">최근 사용:</span>
                <span class="value">${role.stats.lastUsed ? new Date(role.stats.lastUsed).toLocaleString('ko-KR') : '사용 안됨'}</span>
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
          <h2>➕ 새 역할 고용</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
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
              <select name="preferredModel">
                <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (권장, 가장 저렴)</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
              </select>
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
   * 자동 최적화 실행
   */
  async runAutoManage() {
    try {
      const response = await this.apiClient.post('/roles/auto-manage');

      if (response.success) {
        this.showAutoManageResults(response.results, response.summary);
      }
    } catch (error) {
      console.error('자동 최적화 실패:', error);
      this.showError('자동 최적화에 실패했습니다.');
    }
  }

  /**
   * 자동 최적화 결과 표시
   */
  showAutoManageResults(results, summary) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal auto-manage-modal">
        <div class="modal-header">
          <h2>⚡ 자동 최적화 결과</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-content">
          <div class="summary-stats">
            <div class="summary-item">
              <span class="value">${summary.totalRoles}</span>
              <span class="label">전체 역할</span>
            </div>
            <div class="summary-item">
              <span class="value">${summary.needsOptimization}</span>
              <span class="label">개선 필요</span>
            </div>
            <div class="summary-item">
              <span class="value">${summary.inactiveRoles}</span>
              <span class="label">비활성 고려</span>
            </div>
          </div>

          ${results.optimized.length > 0 ? `
            <div class="result-section">
              <h3>🔧 개선이 필요한 역할</h3>
              ${results.optimized.map(r => `
                <div class="result-card warning">
                  <h4>${r.name}</h4>
                  <p>문제: ${r.issue}</p>
                  <p>성공률: ${r.successRate.toFixed(1)}% (사용: ${r.usageCount}회)</p>
                  <p class="recommendation">💡 ${r.recommendation}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${results.deactivated.length > 0 ? `
            <div class="result-section">
              <h3>😴 비활성화 고려 대상</h3>
              ${results.deactivated.map(r => `
                <div class="result-card info">
                  <h4>${r.name}</h4>
                  <p>${r.daysSinceUse}일 동안 사용 안됨</p>
                  <p class="recommendation">💡 ${r.recommendation}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${results.optimized.length === 0 && results.deactivated.length === 0 ? `
            <div class="empty-state">
              <p>✅ 모든 역할이 정상 상태입니다!</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
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
    return labels[category] || category;
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

  editRole(roleId) {
    // TODO: 역할 수정 폼 구현
    alert('역할 수정 기능은 곧 구현됩니다.');
  }
}

// 전역 인스턴스
let roleManager = null;

export function initRoleManager(apiClient) {
  roleManager = new RoleManager(apiClient);
  window.roleManager = roleManager; // onclick에서 접근 가능하도록
  return roleManager;
}
