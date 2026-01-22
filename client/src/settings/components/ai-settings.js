/**
 * AI Settings Component
 * AI 서비스 설정 UI 컴포넌트
 */

export class AISettings {
  constructor() {
    this.services = [];
    this.agentProfile = null;
    this.apiClient = null;
    this.availableModels = [];
    this.routingConfig = {
      light: 'claude-3-5-haiku-20241022',
      medium: 'claude-3-5-sonnet-20241022',
      heavy: 'claude-3-opus-20240229'
    };
    this.memoryConfig = {
      autoSave: true,
      autoInject: true,
      shortTermSize: 50,
      compressionThreshold: 80
    };
    this.storageConfig = {
      memoryPath: './memory',
      filesPath: './files'
    };
  }

  /**
   * 컴포넌트 렌더링
   */
  async render(container, apiClient) {
    this.apiClient = apiClient;

    try {
      // AI 서비스 목록 로드
      await this.loadServices();

      // 사용 가능한 모델 목록 수집
      this.collectAvailableModels();

      // 에이전트 프로필 로드
      await this.loadAgentProfile();

      // 라우팅 설정 로드
      await this.loadRoutingConfig();

      // 메모리 설정 로드
      await this.loadMemoryConfig();

      // 스토리지 경로 설정 로드
      await this.loadStorageConfig();

      // UI 렌더링
      container.innerHTML = `
        <div class="ai-settings-panel">
          <!-- AI 서비스 관리 -->
          <section class="settings-section">
            <h3 class="settings-section-title">AI 서비스 관리</h3>
            <p class="settings-section-desc">API 키를 설정하고 AI 서비스를 관리하세요.</p>
            <div class="ai-services-grid">
              ${this.renderServiceCards()}
            </div>
          </section>

          <!-- 스마트 라우팅 설정 -->
          <section class="settings-section">
            <h3 class="settings-section-title">스마트 라우팅 설정</h3>
            <p class="settings-section-desc">작업 복잡도에 따라 자동으로 최적 모델을 선택합니다.</p>
            ${this.renderSmartRoutingSettings()}
          </section>

          <!-- 메모리 설정 -->
          <section class="settings-section">
            <h3 class="settings-section-title">메모리 설정</h3>
            <p class="settings-section-desc">대화 메모리 자동 저장 및 컨텍스트 관리 설정</p>
            ${this.renderMemorySettings()}
          </section>

          <!-- 저장소 경로 설정 -->
          <section class="settings-section">
            <h3 class="settings-section-title">저장소 경로 설정</h3>
            <p class="settings-section-desc">메모리와 파일의 저장 위치를 지정합니다</p>
            ${this.renderStorageSettings()}
          </section>

          <!-- 시스템 프롬프트 설정 -->
          <section class="settings-section">
            <h3 class="settings-section-title">시스템 프롬프트 설정</h3>
            <p class="settings-section-desc">AI의 기본 성격과 역할을 정의합니다.</p>
            ${this.renderPromptSettings()}
          </section>
        </div>

        <!-- 저장 상태 표시 -->
        <div class="settings-save-status" id="saveStatus"></div>
      `;

      // 이벤트 리스너 등록
      this.attachEventListeners(container);
    } catch (error) {
      console.error('Failed to load AI services:', error);
      container.innerHTML = `
        <div class="settings-error">
          <p>AI 서비스를 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * AI 서비스 목록 로드
   */
  async loadServices() {
    const response = await this.apiClient.get('/ai-services');
    this.services = response.services || [];
  }

  /**
   * 사용 가능한 모델 목록 수집
   */
  collectAvailableModels() {
    this.availableModels = [];

    this.services.forEach(service => {
      if (service.models && service.models.length > 0) {
        service.models.forEach(model => {
          this.availableModels.push({
            id: model.id,
            name: model.name || model.id,
            service: service.name,
            type: service.type
          });
        });
      }
    });

    // 기본 모델들 추가 (서비스에 없어도)
    const defaultModels = [
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', service: 'Anthropic', type: 'anthropic' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', service: 'Anthropic', type: 'anthropic' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', service: 'Anthropic', type: 'anthropic' },
      { id: 'gpt-4o', name: 'GPT-4o', service: 'OpenAI', type: 'openai' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', service: 'OpenAI', type: 'openai' },
      { id: 'gemini-pro', name: 'Gemini Pro', service: 'Google', type: 'google' }
    ];

    defaultModels.forEach(model => {
      if (!this.availableModels.find(m => m.id === model.id)) {
        this.availableModels.push(model);
      }
    });
  }

  /**
   * 에이전트 프로필 로드
   */
  async loadAgentProfile() {
    try {
      const response = await this.apiClient.get('/profile/agent');
      // 기본 프로필 가져오기
      const profiles = response.profiles || [];
      this.agentProfile = profiles.find(p => p.id === 'default') || profiles[0] || {
        id: 'default',
        name: 'Soul',
        role: 'AI Assistant',
        description: '당신의 AI 동반자'
      };
    } catch (error) {
      console.error('Failed to load agent profile:', error);
      this.agentProfile = {
        id: 'default',
        name: 'Soul',
        role: 'AI Assistant',
        description: '당신의 AI 동반자'
      };
    }
  }

  /**
   * 라우팅 설정 로드
   */
  async loadRoutingConfig() {
    try {
      const saved = localStorage.getItem('smartRoutingConfig');
      if (saved) {
        this.routingConfig = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load routing config:', error);
    }
  }

  /**
   * 메모리 설정 로드
   */
  async loadMemoryConfig() {
    try {
      const saved = localStorage.getItem('memoryConfig');
      if (saved) {
        this.memoryConfig = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load memory config:', error);
    }
  }

  /**
   * 스토리지 경로 설정 로드
   */
  async loadStorageConfig() {
    try {
      const memoryResponse = await this.apiClient.get('/config/memory');
      const filesResponse = await this.apiClient.get('/config/files');

      if (memoryResponse && memoryResponse.storagePath) {
        this.storageConfig.memoryPath = memoryResponse.storagePath;
      }

      if (filesResponse && filesResponse.storagePath) {
        this.storageConfig.filesPath = filesResponse.storagePath;
      }
    } catch (error) {
      console.error('Failed to load storage config:', error);
    }
  }

  /**
   * 스마트 라우팅 설정 렌더링
   */
  renderSmartRoutingSettings() {
    return `
      <div class="routing-settings-container">
        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">경량 작업 (1-2)</span>
            <span class="label-hint">간단한 질문, 번역, 요약</span>
          </label>
          <select class="routing-select" id="routingLight">
            ${this.availableModels.map(model => `
              <option value="${model.id}" ${model.id === this.routingConfig.light ? 'selected' : ''}>
                ${model.name} (${model.service})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">중간 작업 (4-6)</span>
            <span class="label-hint">코드 생성, 리뷰, 분석, 문제 해결</span>
          </label>
          <select class="routing-select" id="routingMedium">
            ${this.availableModels.map(model => `
              <option value="${model.id}" ${model.id === this.routingConfig.medium ? 'selected' : ''}>
                ${model.name} (${model.service})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">고성능 작업 (7-9)</span>
            <span class="label-hint">아키텍처 설계, 복잡한 디버깅, 연구</span>
          </label>
          <select class="routing-select" id="routingHeavy">
            ${this.availableModels.map(model => `
              <option value="${model.id}" ${model.id === this.routingConfig.heavy ? 'selected' : ''}>
                ${model.name} (${model.service})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="routing-actions">
          <button class="settings-btn settings-btn-primary" id="saveRoutingBtn">
            저장
          </button>
          <button class="settings-btn settings-btn-outline" id="resetRoutingBtn">
            기본값으로 초기화
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 메모리 설정 렌더링
   */
  renderMemorySettings() {
    return `
      <div class="memory-settings-container">
        <div class="memory-toggle-group">
          <div class="memory-toggle-item">
            <div class="toggle-info">
              <span class="label-text">자동 메모리 저장</span>
              <span class="label-hint">대화 내용을 자동으로 메모리에 저장합니다</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="memoryAutoSave" ${this.memoryConfig.autoSave ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="memory-toggle-item">
            <div class="toggle-info">
              <span class="label-text">자동 메모리 주입</span>
              <span class="label-hint">관련된 과거 대화를 자동으로 참조합니다</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="memoryAutoInject" ${this.memoryConfig.autoInject ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="memory-field">
          <label class="memory-label">
            <span class="label-text">단기 메모리 크기</span>
            <span class="label-hint">최근 대화를 유지할 메시지 개수 (기본: 50개)</span>
          </label>
          <div class="memory-input-group">
            <input type="number"
                   class="memory-input"
                   id="memoryShortTermSize"
                   value="${this.memoryConfig.shortTermSize}"
                   min="10"
                   max="200"
                   step="10">
            <span class="memory-unit">개</span>
          </div>
        </div>

        <div class="memory-field">
          <label class="memory-label">
            <span class="label-text">컨텍스트 압축 임계값</span>
            <span class="label-hint">이 비율 이상 토큰 사용 시 자동 압축 (기본: 80%)</span>
          </label>
          <div class="memory-slider-group">
            <input type="range"
                   class="memory-slider"
                   id="memoryCompressionThreshold"
                   value="${this.memoryConfig.compressionThreshold}"
                   min="50"
                   max="95"
                   step="5">
            <span class="memory-value" id="compressionValue">${this.memoryConfig.compressionThreshold}%</span>
          </div>
        </div>

        <div class="memory-actions">
          <button class="settings-btn settings-btn-primary" id="saveMemoryBtn">
            저장
          </button>
          <button class="settings-btn settings-btn-outline" id="resetMemoryBtn">
            기본값으로 초기화
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 저장소 경로 설정 렌더링
   */
  renderStorageSettings() {
    return `
      <div class="storage-settings-container">
        <div class="storage-field">
          <label class="storage-label">
            <span class="label-text">메모리 저장 경로</span>
            <span class="label-hint">대화 메모리가 저장될 디렉토리 경로 (절대 또는 상대 경로)</span>
          </label>
          <input type="text"
                 class="storage-input"
                 id="memoryPath"
                 value="${this.storageConfig.memoryPath}"
                 placeholder="./memory">
        </div>

        <div class="storage-field">
          <label class="storage-label">
            <span class="label-text">파일 저장 경로</span>
            <span class="label-hint">업로드 파일이 저장될 디렉토리 경로 (절대 또는 상대 경로)</span>
          </label>
          <input type="text"
                 class="storage-input"
                 id="filesPath"
                 value="${this.storageConfig.filesPath}"
                 placeholder="./files">
        </div>

        <div class="storage-actions">
          <button class="settings-btn settings-btn-primary" id="saveStorageBtn">
            저장
          </button>
          <button class="settings-btn settings-btn-outline" id="resetStorageBtn">
            기본값으로 초기화
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 프롬프트 설정 렌더링
   */
  renderPromptSettings() {
    if (!this.agentProfile) {
      return '<p style="color: rgba(0, 0, 0, 0.5);">프로필을 불러오는 중...</p>';
    }

    return `
      <div class="prompt-settings-container">
        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">에이전트 이름</span>
            <span class="label-hint">AI의 이름을 설정합니다</span>
          </label>
          <input type="text"
                 class="prompt-input"
                 id="agentName"
                 value="${this.agentProfile.name || ''}"
                 placeholder="Soul">
        </div>

        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">역할</span>
            <span class="label-hint">AI의 기본 역할을 정의합니다</span>
          </label>
          <input type="text"
                 class="prompt-input"
                 id="agentRole"
                 value="${this.agentProfile.role || ''}"
                 placeholder="AI Assistant">
        </div>

        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">설명</span>
            <span class="label-hint">AI에 대한 간단한 설명</span>
          </label>
          <textarea class="prompt-textarea"
                    id="agentDescription"
                    rows="2"
                    placeholder="당신의 AI 동반자">${this.agentProfile.description || ''}</textarea>
        </div>

        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">커스텀 시스템 프롬프트 (선택사항)</span>
            <span class="label-hint">추가로 포함할 지침이나 맥락을 입력하세요</span>
          </label>
          <textarea class="prompt-textarea"
                    id="customPrompt"
                    rows="6"
                    placeholder="예: 항상 코드 예시를 포함하세요. 답변은 친절하고 상세하게 작성하세요.">${this.agentProfile.customPrompt || ''}</textarea>
        </div>

        <div class="prompt-actions">
          <button class="settings-btn settings-btn-primary"
                  id="savePromptBtn">
            저장
          </button>
          <button class="settings-btn settings-btn-outline"
                  id="resetPromptBtn">
            초기화
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 서비스 카드 렌더링
   */
  renderServiceCards() {
    return this.services.map(service => `
      <div class="ai-service-card ${service.isActive ? 'active' : 'inactive'}" data-service-id="${service.id}">
        <div class="service-header">
          <div class="service-title">
            <h4>${this.getServiceIcon(service.type)} ${service.name}</h4>
            <span class="service-type">${service.type}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox"
                   data-service-id="${service.id}"
                   data-action="toggle-active"
                   ${service.isActive ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="service-body">
          <!-- API 키 상태 -->
          <div class="service-api-key">
            <div class="api-key-status">
              ${service.hasApiKey
                ? '<span class="status-badge status-success">✓ API 키 설정됨</span>'
                : '<span class="status-badge status-warning">✗ API 키 미설정</span>'
              }
            </div>
            <button class="settings-btn settings-btn-sm settings-btn-secondary"
                    data-service-id="${service.id}"
                    data-action="edit-api-key"
                    style="width: 100%;">
              ${service.hasApiKey ? '키 변경' : '키 설정'}
            </button>
          </div>

          <!-- 모델 정보 -->
          ${service.modelCount > 0 ? `
            <div class="service-models">
              <span class="models-count">사용 가능한 모델: ${service.modelCount}개</span>
              ${service.lastRefresh ? `
                <span class="models-refresh">최근 갱신: ${this.formatDate(service.lastRefresh)}</span>
              ` : ''}
            </div>
          ` : ''}

          <!-- 작업 버튼 -->
          <div class="service-actions">
            ${service.hasApiKey ? `
              <button class="settings-btn settings-btn-sm settings-btn-primary"
                      data-service-id="${service.id}"
                      data-action="test-connection">
                연결 테스트
              </button>
              <button class="settings-btn settings-btn-sm settings-btn-outline"
                      data-service-id="${service.id}"
                      data-action="refresh-models">
                모델 새로고침
              </button>
            ` : `
              <p class="service-hint">API 키를 설정하면 연결 테스트와 모델 갱신이 가능합니다.</p>
            `}
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * 서비스 타입별 아이콘
   */
  getServiceIcon(type) {
    const icons = {
      'anthropic': '🤖',
      'openai': '🧠',
      'google': '🔵',
      'ollama': '🦙',
      'custom': '⚙️'
    };
    return icons[type.toLowerCase()] || '🤖';
  }

  /**
   * 날짜 포맷팅
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;

    return date.toLocaleDateString('ko-KR');
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners(container) {
    // 토글 스위치는 change 이벤트 사용
    container.addEventListener('change', async (e) => {
      if (e.target.dataset.action === 'toggle-active') {
        e.stopPropagation();
        const serviceId = e.target.dataset.serviceId;
        await this.toggleServiceActive(serviceId, e.target.checked);
      }
    });

    // 버튼 클릭은 click 이벤트 사용
    container.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      e.stopPropagation();
      const action = button.dataset.action;
      const serviceId = button.dataset.serviceId;

      switch (action) {
        case 'edit-api-key':
          await this.editApiKey(serviceId);
          break;
        case 'test-connection':
          await this.testConnection(serviceId, button);
          break;
        case 'refresh-models':
          await this.refreshModels(serviceId, button);
          break;
      }
    });

    // 라우팅 설정 버튼
    const saveRoutingBtn = container.querySelector('#saveRoutingBtn');
    const resetRoutingBtn = container.querySelector('#resetRoutingBtn');

    if (saveRoutingBtn) {
      saveRoutingBtn.addEventListener('click', () => this.saveRoutingSettings());
    }

    if (resetRoutingBtn) {
      resetRoutingBtn.addEventListener('click', () => this.resetRoutingSettings());
    }

    // 메모리 설정 버튼
    const saveMemoryBtn = container.querySelector('#saveMemoryBtn');
    const resetMemoryBtn = container.querySelector('#resetMemoryBtn');
    const compressionSlider = container.querySelector('#memoryCompressionThreshold');

    if (saveMemoryBtn) {
      saveMemoryBtn.addEventListener('click', () => this.saveMemorySettings());
    }

    if (resetMemoryBtn) {
      resetMemoryBtn.addEventListener('click', () => this.resetMemorySettings());
    }

    if (compressionSlider) {
      compressionSlider.addEventListener('input', (e) => {
        const valueDisplay = container.querySelector('#compressionValue');
        if (valueDisplay) {
          valueDisplay.textContent = `${e.target.value}%`;
        }
      });
    }

    // 프롬프트 설정 버튼
    const savePromptBtn = container.querySelector('#savePromptBtn');
    const resetPromptBtn = container.querySelector('#resetPromptBtn');

    if (savePromptBtn) {
      savePromptBtn.addEventListener('click', () => this.savePromptSettings());
    }

    if (resetPromptBtn) {
      resetPromptBtn.addEventListener('click', () => this.resetPromptSettings());
    }

    // 스토리지 설정 버튼
    const saveStorageBtn = container.querySelector('#saveStorageBtn');
    const resetStorageBtn = container.querySelector('#resetStorageBtn');

    if (saveStorageBtn) {
      saveStorageBtn.addEventListener('click', () => this.saveStorageSettings());
    }

    if (resetStorageBtn) {
      resetStorageBtn.addEventListener('click', () => this.resetStorageSettings());
    }
  }

  /**
   * 서비스 활성화/비활성화 토글
   */
  async toggleServiceActive(serviceId, isActive) {
    try {
      await this.apiClient.post(`/ai-services/${serviceId}/toggle`);

      // 성공 메시지 표시
      this.showSaveStatus(`서비스가 ${isActive ? '활성화' : '비활성화'}되었습니다.`, 'success');

      // 카드 상태 업데이트
      const card = document.querySelector(`[data-service-id="${serviceId}"]`);
      if (card) {
        card.classList.toggle('active', isActive);
        card.classList.toggle('inactive', !isActive);
      }
    } catch (error) {
      console.error('Failed to toggle service:', error);
      this.showSaveStatus('상태 변경에 실패했습니다.', 'error');

      // 체크박스 원래대로 되돌리기
      const checkbox = document.querySelector(`input[data-service-id="${serviceId}"][data-action="toggle-active"]`);
      if (checkbox) {
        checkbox.checked = !isActive;
      }
    }
  }

  /**
   * API 키 편집
   */
  async editApiKey(serviceId) {
    const service = this.services.find(s => s.id === serviceId);
    if (!service) return;

    const apiKey = prompt(
      `${service.name} API 키를 입력하세요:\n\n` +
      `${service.hasApiKey ? '(비워두면 기존 키가 유지됩니다)' : ''}`,
      ''
    );

    if (apiKey === null) return; // 취소

    try {
      await this.apiClient.patch(`/ai-services/${serviceId}`, {
        apiKey: apiKey.trim() || undefined
      });

      this.showSaveStatus('API 키가 저장되었습니다.', 'success');

      // 서비스 목록 새로고침
      await this.loadServices();
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to update API key:', error);
      this.showSaveStatus('API 키 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection(serviceId, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '테스트 중...';

    try {
      const response = await this.apiClient.post(`/ai-services/${serviceId}/test`);

      if (response.success) {
        alert(`✓ 연결 성공!\n\n${response.message || '정상적으로 연결되었습니다.'}`);
        this.showSaveStatus('연결 테스트 성공', 'success');
      } else {
        throw new Error(response.message || response.error || '연결 실패');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      alert(`✗ 연결 실패\n\n${error.message}`);
      this.showSaveStatus('연결 테스트 실패', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  /**
   * 모델 목록 새로고침
   */
  async refreshModels(serviceId, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '새로고침 중...';

    try {
      const response = await this.apiClient.post(`/ai-services/${serviceId}/refresh-models`);

      if (response.success) {
        this.showSaveStatus(`모델 목록이 갱신되었습니다. (${response.modelCount || 0}개)`, 'success');

        // 서비스 목록 새로고침
        await this.loadServices();
        const container = document.querySelector('.ai-settings-panel').parentElement;
        await this.render(container, this.apiClient);
      } else {
        throw new Error(response.message || response.error || '새로고침 실패');
      }
    } catch (error) {
      console.error('Failed to refresh models:', error);
      this.showSaveStatus('모델 새로고침에 실패했습니다.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  /**
   * 라우팅 설정 저장
   */
  async saveRoutingSettings() {
    try {
      const light = document.getElementById('routingLight')?.value;
      const medium = document.getElementById('routingMedium')?.value;
      const heavy = document.getElementById('routingHeavy')?.value;

      this.routingConfig = { light, medium, heavy };

      // localStorage에 저장
      localStorage.setItem('smartRoutingConfig', JSON.stringify(this.routingConfig));

      this.showSaveStatus('스마트 라우팅 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to save routing settings:', error);
      this.showSaveStatus('라우팅 설정 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 라우팅 설정 초기화
   */
  async resetRoutingSettings() {
    if (!confirm('스마트 라우팅 설정을 기본값으로 되돌리시겠습니까?')) {
      return;
    }

    try {
      this.routingConfig = {
        light: 'claude-3-5-haiku-20241022',
        medium: 'claude-3-5-sonnet-20241022',
        heavy: 'claude-3-opus-20240229'
      };

      localStorage.setItem('smartRoutingConfig', JSON.stringify(this.routingConfig));

      this.showSaveStatus('스마트 라우팅 설정이 초기화되었습니다.', 'success');

      // UI 새로고침
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to reset routing settings:', error);
      this.showSaveStatus('라우팅 설정 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * 메모리 설정 저장
   */
  async saveMemorySettings() {
    try {
      const autoSave = document.getElementById('memoryAutoSave')?.checked;
      const autoInject = document.getElementById('memoryAutoInject')?.checked;
      const shortTermSize = parseInt(document.getElementById('memoryShortTermSize')?.value) || 50;
      const compressionThreshold = parseInt(document.getElementById('memoryCompressionThreshold')?.value) || 80;

      this.memoryConfig = {
        autoSave,
        autoInject,
        shortTermSize,
        compressionThreshold
      };

      // localStorage에 저장
      localStorage.setItem('memoryConfig', JSON.stringify(this.memoryConfig));

      this.showSaveStatus('메모리 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to save memory settings:', error);
      this.showSaveStatus('메모리 설정 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 메모리 설정 초기화
   */
  async resetMemorySettings() {
    if (!confirm('메모리 설정을 기본값으로 되돌리시겠습니까?')) {
      return;
    }

    try {
      this.memoryConfig = {
        autoSave: true,
        autoInject: true,
        shortTermSize: 50,
        compressionThreshold: 80
      };

      localStorage.setItem('memoryConfig', JSON.stringify(this.memoryConfig));

      this.showSaveStatus('메모리 설정이 초기화되었습니다.', 'success');

      // UI 새로고침
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to reset memory settings:', error);
      this.showSaveStatus('메모리 설정 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * 프롬프트 설정 저장
   */
  async savePromptSettings() {
    try {
      const name = document.getElementById('agentName')?.value || 'Soul';
      const role = document.getElementById('agentRole')?.value || 'AI Assistant';
      const description = document.getElementById('agentDescription')?.value || '';
      const customPrompt = document.getElementById('customPrompt')?.value || '';

      const profileId = this.agentProfile?.id || 'default';

      await this.apiClient.put(`/profile/agent/${profileId}`, {
        name,
        role,
        description,
        customPrompt
      });

      this.showSaveStatus('프롬프트 설정이 저장되었습니다.', 'success');

      // 프로필 새로고침
      await this.loadAgentProfile();
    } catch (error) {
      console.error('Failed to save prompt settings:', error);
      this.showSaveStatus('프롬프트 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 프롬프트 설정 초기화
   */
  async resetPromptSettings() {
    if (!confirm('프롬프트 설정을 초기값으로 되돌리시겠습니까?')) {
      return;
    }

    try {
      const profileId = this.agentProfile?.id || 'default';

      await this.apiClient.put(`/profile/agent/${profileId}`, {
        name: 'Soul',
        role: 'AI Assistant',
        description: '당신의 AI 동반자',
        customPrompt: ''
      });

      this.showSaveStatus('프롬프트 설정이 초기화되었습니다.', 'success');

      // UI 새로고침
      await this.loadAgentProfile();
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to reset prompt settings:', error);
      this.showSaveStatus('프롬프트 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * 스토리지 경로 설정 저장
   */
  async saveStorageSettings() {
    try {
      const memoryPath = document.getElementById('memoryPath')?.value;
      const filesPath = document.getElementById('filesPath')?.value;

      if (!memoryPath || !filesPath) {
        this.showSaveStatus('경로를 입력해주세요.', 'error');
        return;
      }

      // 메모리 경로 저장
      await this.apiClient.put('/config/memory', {
        storagePath: memoryPath
      });

      // 파일 경로 저장
      await this.apiClient.put('/config/files', {
        storagePath: filesPath
      });

      this.storageConfig.memoryPath = memoryPath;
      this.storageConfig.filesPath = filesPath;

      this.showSaveStatus('저장소 경로 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to save storage settings:', error);
      this.showSaveStatus('저장소 경로 설정 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 스토리지 경로 설정 초기화
   */
  async resetStorageSettings() {
    if (!confirm('저장소 경로 설정을 기본값으로 되돌리시겠습니까?')) {
      return;
    }

    try {
      // 메모리 경로 초기화
      await this.apiClient.put('/config/memory', {
        storagePath: './memory'
      });

      // 파일 경로 초기화
      await this.apiClient.put('/config/files', {
        storagePath: './files'
      });

      this.storageConfig.memoryPath = './memory';
      this.storageConfig.filesPath = './files';

      this.showSaveStatus('저장소 경로 설정이 초기화되었습니다.', 'success');

      // UI 새로고침
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to reset storage settings:', error);
      this.showSaveStatus('저장소 경로 설정 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * 저장 상태 표시
   */
  showSaveStatus(message, type = 'success') {
    const statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = `settings-save-status ${type}`;
    statusEl.style.display = 'block';

    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}
