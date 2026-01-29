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
      heavy: 'claude-3-opus-20240229',
      lightThinking: false,
      mediumThinking: false,
      heavyThinking: true
    };
    this.routingStats = null;
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
    this.agentChains = [];
    this.availableRoles = [];  // 알바(Role) 목록
    this.expandedRoleId = null;  // 확장된 알바 ID
    this.abortController = null;  // 이벤트 리스너 중복 방지용
    this.toolSearchConfig = {
      enabled: false,
      type: 'regex',
      alwaysLoad: []
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

      // 라우팅 통계 로드
      await this.loadRoutingStats();

      // 알바(Role) 목록 로드
      await this.loadAvailableRoles();

      // 에이전트 체인 설정 로드
      await this.loadAgentChains();

      // Tool Search 설정 로드
      await this.loadToolSearchConfig();

      // UI 렌더링
      container.innerHTML = `
        <div class="ai-settings-panel">
          <!-- API 키 캡슐 버튼 (Gooey 효과) -->
          <div class="api-capsules-wrapper">
            <div class="api-capsules-container">
              ${this.renderApiCapsules()}
              ${this.renderEmptyGuide()}
              <div class="api-dropdown">
                <input type="checkbox" id="api-dropdown-toggle" class="api-dropdown-checkbox">
                <label class="api-capsule-add" for="api-dropdown-toggle" title="서비스 추가">
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </label>
              </div>
            </div>
            <div class="api-dropdown-content">
              <div class="api-service-list">
                ${this.renderServiceList()}
              </div>
            </div>
            <svg class="goo-filter">
              <filter id="goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
                <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
                <feBlend in="SourceGraphic" in2="goo" />
              </filter>
            </svg>
          </div>

          <!-- 온보딩 카드 섹션 -->
          <div class="onboarding-cards">
            <!-- 정체성 카드 -->
            <div class="onboarding-item">
              <div class="onboarding-card" data-target="onboard-identity">
                <div class="onboarding-card-label">정체성</div>
              </div>
              <div class="onboarding-content" id="onboard-identity">
                <div class="soul-form">
                  <div class="neu-field ${this.agentProfile.name ? 'has-value' : ''}">
                    <div class="neu-field-display">
                      <span class="neu-field-title">이름 : </span>
                      <span class="neu-field-value">${this.agentProfile.name || ''}</span>
                    </div>
                    <input type="text" class="neu-field-input" id="soulName" data-label="이름" placeholder="이름" value="${this.agentProfile.name || ''}">
                  </div>
                  <div class="neu-field ${this.agentProfile.role ? 'has-value' : ''}">
                    <div class="neu-field-display">
                      <span class="neu-field-title">역할 : </span>
                      <span class="neu-field-value">${this.agentProfile.role || ''}</span>
                    </div>
                    <input type="text" class="neu-field-input" id="soulRole" data-label="역할" placeholder="역할 (예: 개발 도우미, 글쓰기 파트너)" value="${this.agentProfile.role || ''}">
                  </div>
                </div>
              </div>
            </div>

            <!-- 성격 카드 -->
            <div class="onboarding-item">
              <div class="onboarding-card" data-target="onboard-personality">
                <div class="onboarding-card-label">성격</div>
              </div>
              <div class="onboarding-content" id="onboard-personality">
                <div class="soul-form">
                  <div class="neu-field ${this.agentProfile.description ? 'has-value' : ''}">
                    <div class="neu-field-display">
                      <span class="neu-field-title">설명 : </span>
                      <span class="neu-field-value">${this.agentProfile.description || ''}</span>
                    </div>
                    <textarea class="neu-field-input neu-field-textarea-sm" id="soulDescription" data-label="설명" placeholder="설명" rows="2">${this.agentProfile.description || ''}</textarea>
                  </div>
                  <div class="neu-field ${this.agentProfile.systemPrompt ? 'has-value' : ''}">
                    <div class="neu-field-display">
                      <span class="neu-field-title">시스템 프롬프트 : </span>
                      <span class="neu-field-value">${this.agentProfile.systemPrompt || ''}</span>
                    </div>
                    <textarea class="neu-field-input neu-field-textarea-lg" id="soulSystemPrompt" data-label="시스템 프롬프트" placeholder="시스템 프롬프트" rows="7">${this.agentProfile.systemPrompt || ''}</textarea>
                  </div>
                  <!-- 대화 스타일 -->
                  <div class="soul-style-section">
                    <div class="soul-style-label">대화 스타일</div>
                    <div class="personality-sliders">
                      <div class="personality-slider-item">
                        <div class="slider-header">
                          <span class="slider-label-left">🎉 캐주얼</span>
                          <span class="slider-label-right">🎩 격식</span>
                        </div>
                        <input type="range" class="personality-range" id="soulFormality" min="0" max="1" step="0.1" value="${this.agentProfile.personality?.communication?.formality ?? 0.5}">
                      </div>
                      <div class="personality-slider-item">
                        <div class="slider-header">
                          <span class="slider-label-left">⚡ 간결</span>
                          <span class="slider-label-right">�� 상세</span>
                        </div>
                        <input type="range" class="personality-range" id="soulVerbosity" min="0" max="1" step="0.1" value="${this.agentProfile.personality?.communication?.verbosity ?? 0.5}">
                      </div>
                      <div class="personality-slider-item">
                        <div class="slider-header">
                          <span class="slider-label-left">🌸 완곡</span>
                          <span class="slider-label-right">🎯 직접적</span>
                        </div>
                        <input type="range" class="personality-range" id="soulDirectness" min="0" max="1" step="0.1" value="${this.agentProfile.personality?.communication?.directness ?? 0.7}">
                      </div>
                      <div class="personality-slider-item">
                        <div class="slider-header">
                          <span class="slider-label-left">📝 일반 용어</span>
                          <span class="slider-label-right">🔧 기술 용어</span>
                        </div>
                        <input type="range" class="personality-range" id="soulTechnicality" min="0" max="1" step="0.1" value="${this.agentProfile.personality?.communication?.technicality ?? 0.5}">
                      </div>
                      <div class="personality-slider-item">
                        <div class="slider-header">
                          <span class="slider-label-left">😐 이모지 없음</span>
                          <span class="slider-label-right">😊 이모지 많이</span>
                        </div>
                        <input type="range" class="personality-range" id="soulEmoji" min="0" max="1" step="0.1" value="${this.agentProfile.personality?.communication?.emoji ?? 0.3}">
                      </div>
                      <div class="personality-slider-item">
                        <div class="slider-header">
                          <span class="slider-label-left">🧐 진지</span>
                          <span class="slider-label-right">😄 유머러스</span>
                        </div>
                        <input type="range" class="personality-range" id="soulHumor" min="0" max="1" step="0.1" value="${this.agentProfile.personality?.communication?.humor ?? 0.3}">
                      </div>
                      <div class="personality-slider-item">
                        <div class="slider-header">
                          <span class="slider-label-left">🤖 기계적</span>
                          <span class="slider-label-right">💕 공감적</span>
                        </div>
                        <input type="range" class="personality-range" id="soulEmpathy" min="0" max="1" step="0.1" value="${this.agentProfile.personality?.traits?.empathetic ?? 0.6}">
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 두뇌 카드 -->
            <div class="onboarding-item">
              <div class="onboarding-card" data-target="onboard-brain">
                <div class="onboarding-card-label">두뇌</div>
              </div>
              <div class="onboarding-content" id="onboard-brain">
                <div class="soul-form">
                  <div class="soul-radio-group">
                    <label class="soul-radio">
                      <input type="radio" name="modelMode" value="single" ${this.agentProfile.modelMode !== 'smart' ? 'checked' : ''}>
                      <span>단일 모델</span>
                    </label>
                    <label class="soul-radio">
                      <input type="radio" name="modelMode" value="smart" ${this.agentProfile.modelMode === 'smart' ? 'checked' : ''}>
                      <span>스마트 라우팅</span>
                    </label>
                  </div>
                  <div class="soul-model-options">
                  </div>
                  <div class="soul-slider-row">
                    <label>창의성</label>
                    <input type="range" class="soul-range" id="soulCreativity" min="0" max="1" step="0.1" value="${this.agentProfile.temperature || 0.7}">
                    <input type="text" class="soul-input-mini" id="soulCreativityValue" value="${this.agentProfile.temperature || 0.7}">
                  </div>
                  <div class="soul-slider-row">
                    <label>응답 길이</label>
                    <input type="range" class="soul-range" id="soulLength" min="256" max="32000" step="256" value="${this.agentProfile.maxTokens || 4096}">
                    <input type="text" class="soul-input-mini" id="soulLengthValue" value="${this.agentProfile.maxTokens || 4096}">
                  </div>
                </div>
              </div>
            </div>

            <!-- 알바 카드 -->
            <div class="onboarding-item">
              <div class="onboarding-card" data-target="onboard-alba">
                <div class="onboarding-card-label">알바</div>
                <label class="toggle-switch toggle-switch-sm" onclick="event.stopPropagation()">
                  <input type="checkbox">
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="onboarding-content" id="onboard-alba">
                <p>여기에 알바 설정 내용이 들어갑니다.</p>
              </div>
            </div>
          </div>

          <!-- 기본모델 설정 -->
          <section class="settings-section">
            <h3 class="settings-section-title">기본모델 설정</h3>
            <p class="settings-section-desc">작업 복잡도에 따라 자동으로 최적 모델을 선택합니다.</p>
            ${this.renderSmartRoutingSettings()}
          </section>

          <!-- 알바 설정 -->
          <section class="settings-section">
            <h3 class="settings-section-title">알바</h3>
            <p class="settings-section-desc">전문 AI 알바들이 각자의 역할에 맞게 작업을 수행합니다.</p>
            ${this.renderAgentChainSettings()}
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
   * API 키가 설정되어 있고 활성화된 서비스의 모델만 수집
   */
  collectAvailableModels() {
    this.availableModels = [];

    this.services.forEach(service => {
      // API 키가 있고 활성화된 서비스만 모델 수집
      if (service.hasApiKey && service.isActive && service.models && service.models.length > 0) {
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

    // 사용 가능한 모델이 없는 경우 안내 메시지용 플레이스홀더
    if (this.availableModels.length === 0) {
      this.availableModels.push({
        id: '',
        name: '(API 키를 설정하고 모델 새로고침을 해주세요)',
        service: '-',
        type: 'none',
        disabled: true
      });
    }
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
        name: '',
        role: '',
        description: ''
      };
    } catch (error) {
      console.error('Failed to load agent profile:', error);
      this.agentProfile = {
        id: 'default',
        name: '',
        role: '',
        description: ''
      };
    }
  }

  /**
   * 라우팅 설정 로드 (서버에서)
   */
  async loadRoutingConfig() {
    try {
      // 서버에서 라우팅 설정 로드
      const response = await this.apiClient.get('/config/routing');
      if (response && response.light) {
        // 새 형식 (serviceId + thinking 포함) 또는 이전 형식 (modelId만)
        this.routingConfig = {
          light: response.light?.modelId || response.light,
          medium: response.medium?.modelId || response.medium,
          heavy: response.heavy?.modelId || response.heavy,
          // serviceId 정보
          lightService: response.light?.serviceId || null,
          mediumService: response.medium?.serviceId || null,
          heavyService: response.heavy?.serviceId || null,
          // thinking 설정
          lightThinking: response.light?.thinking || false,
          mediumThinking: response.medium?.thinking || false,
          heavyThinking: response.heavy?.thinking || false
        };
      }
    } catch (error) {
      console.error('Failed to load routing config from server:', error);
      // 폴백: localStorage에서 로드
      try {
        const saved = localStorage.getItem('smartRoutingConfig');
        if (saved) {
          this.routingConfig = JSON.parse(saved);
        }
      } catch (e) {
        console.error('Failed to load routing config from localStorage:', e);
      }
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
   * Tool Search 설정 로드
   */
  async loadToolSearchConfig() {
    try {
      const response = await this.apiClient.get('/config/tool-search');
      if (response) {
        this.toolSearchConfig = {
          enabled: response.enabled ?? false,
          type: response.type ?? 'regex',
          alwaysLoad: response.alwaysLoad ?? []
        };
      }
    } catch (error) {
      console.error('Failed to load tool search config:', error);
    }
  }

  /**
   * 라우팅 통계 로드
   */
  async loadRoutingStats() {
    try {
      const response = await this.apiClient.get('/chat/routing-stats');
      if (response.success) {
        this.routingStats = response.stats;
      }
    } catch (error) {
      console.error('Failed to load routing stats:', error);
      this.routingStats = null;
    }
  }

  /**
   * 알바(Role) 목록 로드
   */
  async loadAvailableRoles() {
    try {
      // 설정 페이지에서는 모든 알바 표시 (비활성 포함)
      const response = await this.apiClient.get('/roles');
      if (response.success) {
        this.availableRoles = response.roles || [];
      }
    } catch (error) {
      console.error('Failed to load roles:', error);
      this.availableRoles = [];
    }
  }

  /**
   * 에이전트 체인 설정 로드
   */
  async loadAgentChains() {
    try {
      const saved = localStorage.getItem('agentChains');
      if (saved) {
        this.agentChains = JSON.parse(saved);
      } else {
        // 기본 체인 설정 (Role 기반)
        this.agentChains = [
          {
            id: 'code-review-chain',
            name: '코드 리뷰 체인',
            description: '코드 생성 후 검토를 수행합니다',
            type: 'sequential',
            enabled: false,
            steps: [
              { roleId: 'coder', customModel: '' },
              { roleId: 'reviewer', customModel: '' }
            ]
          },
          {
            id: 'research-summary-chain',
            name: '연구 요약 체인',
            description: '조사 후 요약을 생성합니다',
            type: 'sequential',
            enabled: false,
            steps: [
              { roleId: 'researcher', customModel: '' },
              { roleId: 'summarizer', customModel: '' }
            ]
          },
          {
            id: 'parallel-analysis',
            name: '병렬 분석',
            description: '여러 관점에서 동시에 분석합니다',
            type: 'parallel',
            enabled: false,
            steps: [
              { roleId: 'analyzer', customModel: '' },
              { roleId: 'coder', customModel: '' }
            ]
          }
        ];
      }
    } catch (error) {
      console.error('Failed to load agent chains:', error);
      this.agentChains = [];
    }
  }

  /**
   * 모델이 생각(thinking) 기능을 지원하는지 확인
   */
  /**
   * 생각 토글 렌더링
   * 모든 모델에 표시, 지원 모델에서만 동작
   */
  renderThinkingToggle(tier, modelId, isEnabled) {
    return `
      <div class="thinking-toggle-wrapper">
        <label class="thinking-toggle">
          <input type="checkbox"
                 id="thinking${tier}"
                 ${isEnabled ? 'checked' : ''}>
          <span class="thinking-toggle-slider"></span>
          <span class="thinking-toggle-label">생각</span>
        </label>
        <span class="thinking-hint">미지원 모델은 생각과정 없이 응답</span>
      </div>
    `;
  }

  /**
   * 스마트 라우팅 설정 렌더링
   */
  renderSmartRoutingSettings() {
    const hasModels = this.availableModels.length > 0 && !this.availableModels[0].disabled;
    
    return `
      <div class="routing-settings-container">
        ${!hasModels ? `
          <div class="routing-notice">
            <div class="routing-notice-icon">💡</div>
            <div class="routing-notice-content">
              <p class="routing-notice-title">API 키를 먼저 설정해주세요</p>
              <p class="routing-notice-desc">위의 AI 서비스 관리에서 API 키를 입력하고 [모델 새로고침]을 클릭하면, 사용 가능한 모델이 자동으로 드롭다운에 표시됩니다.</p>
            </div>
          </div>
        ` : ''}
        
        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">경량 작업 (1-2)</span>
            <span class="label-hint">간단한 질문, 번역, 요약</span>
          </label>
          <div class="routing-field-row">
            <select class="routing-select" id="routingLight" ${!hasModels ? 'disabled' : ''}>
              ${this.renderModelOptions(this.routingConfig.light)}
            </select>
            ${this.renderThinkingToggle('Light', this.routingConfig.light, this.routingConfig.lightThinking)}
          </div>
        </div>

        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">중간 작업 (4-6)</span>
            <span class="label-hint">코드 생성, 리뷰, 분석, 문제 해결</span>
          </label>
          <div class="routing-field-row">
            <select class="routing-select" id="routingMedium" ${!hasModels ? 'disabled' : ''}>
              ${this.renderModelOptions(this.routingConfig.medium)}
            </select>
            ${this.renderThinkingToggle('Medium', this.routingConfig.medium, this.routingConfig.mediumThinking)}
          </div>
        </div>

        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">고성능 작업 (7-9)</span>
            <span class="label-hint">아키텍처 설계, 복잡한 디버깅, 연구</span>
          </label>
          <div class="routing-field-row">
            <select class="routing-select" id="routingHeavy" ${!hasModels ? 'disabled' : ''}>
              ${this.renderModelOptions(this.routingConfig.heavy)}
            </select>
            ${this.renderThinkingToggle('Heavy', this.routingConfig.heavy, this.routingConfig.heavyThinking)}
          </div>
        </div>

        <div class="routing-actions">
          <button class="settings-btn settings-btn-primary" id="saveRoutingBtn" ${!hasModels ? 'disabled' : ''}>
            저장
          </button>
          <button class="settings-btn settings-btn-outline" id="resetRoutingBtn"
            기본값으로 초기화
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 모델 ID로 표시 이름 가져오기
   */
  getModelDisplayName(modelId) {
    if (!modelId) return '미설정';
    const model = this.availableModels.find(m => m.id === modelId);
    if (model) {
      return model.name || modelId;
    }
    // 모델 ID에서 간단한 이름 추출
    return modelId.split('-').slice(0, 2).join(' ');
  }

  /**
   * 라우팅 통계 렌더링
   */
  renderRoutingStats() {
    // 현재 설정된 모델 이름 가져오기
    const lightModel = this.getModelDisplayName(this.routingConfig.light);
    const mediumModel = this.getModelDisplayName(this.routingConfig.medium);
    const heavyModel = this.getModelDisplayName(this.routingConfig.heavy);

    if (!this.routingStats) {
      return `
        <div class="stats-container">
          <p class="stats-empty">통계 데이터가 없습니다. 대화를 시작하면 통계가 수집됩니다.</p>
          <button class="settings-btn settings-btn-outline" id="refreshStatsBtn">
            통계 새로고침
          </button>
        </div>
      `;
    }

    const stats = this.routingStats;
    return `
      <div class="stats-container">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.totalRequests || 0}</div>
            <div class="stat-label">총 요청</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.distribution?.light || stats.distribution?.haiku || '0%'}</div>
            <div class="stat-label" title="${lightModel}">경량</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.distribution?.medium || stats.distribution?.sonnet || '0%'}</div>
            <div class="stat-label" title="${mediumModel}">중간</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.distribution?.heavy || stats.distribution?.opus || '0%'}</div>
            <div class="stat-label" title="${heavyModel}">고성능</div>
          </div>
        </div>

        <div class="stats-details">
          <div class="stats-row">
            <span class="stats-label">예상 비용</span>
            <span class="stats-value">$${(stats.totalCost || 0).toFixed(4)}</span>
          </div>
          <div class="stats-row">
            <span class="stats-label">평균 응답 시간</span>
            <span class="stats-value">${stats.averageLatency ? stats.averageLatency.toFixed(0) + 'ms' : '-'}</span>
          </div>
        </div>

        <div class="stats-actions">
          <button class="settings-btn settings-btn-outline" id="refreshStatsBtn">
            통계 새로고침
          </button>
          <button class="settings-btn settings-btn-secondary" id="resetStatsBtn">
            통계 초기화
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 알바 설정 렌더링 (간소화)
   */
  renderAgentChainSettings() {
    const hasRoles = this.availableRoles.length > 0;

    return `
      <div class="alba-container">
        ${!hasRoles ? `
          <div class="alba-empty">
            <p>등록된 알바가 없습니다.</p>
            <button class="settings-btn settings-btn-primary" id="initRolesBtn">
              기본 알바 초기화
            </button>
          </div>
        ` : `
          <div class="alba-list">
            ${this.availableRoles.map(role => this.renderAlbaItem(role)).join('')}
          </div>
        `}

        <div class="alba-add">
          <button class="settings-btn settings-btn-primary" id="addAlbaBtn">
            + 알바 추가
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 알바 아이템 렌더링
   */
  renderAlbaItem(role) {
    const isExpanded = this.expandedRoleId === role.roleId;

    return `
      <div class="alba-item ${role.active ? '' : 'inactive'}" data-role-id="${role.roleId}">
        <div class="alba-header" data-role-id="${role.roleId}" data-action="toggle-expand">
          <div class="alba-info">
            <span class="alba-icon">${this.getRoleIcon(role.category)}</span>
            <div class="alba-text">
              <span class="alba-name">${role.name}</span>
              <span class="alba-desc">${role.description}</span>
            </div>
          </div>
          <div class="alba-status">
            <span class="alba-mode-badge">${this.getModeLabel(role.mode || 'single')}</span>
            <label class="toggle-switch toggle-switch-sm" onclick="event.stopPropagation()">
              <input type="checkbox"
                     data-role-id="${role.roleId}"
                     data-action="toggle-active"
                     ${role.active ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <span class="alba-expand-icon">${isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>

        <div class="alba-detail ${isExpanded ? 'expanded' : ''}">
          <div class="alba-detail-row">
            <label class="alba-label">작동 방식</label>
            <select class="alba-mode-select" data-role-id="${role.roleId}">
              <option value="single" ${(role.mode || 'single') === 'single' ? 'selected' : ''}>일반 (단일 모델)</option>
              <option value="chain" ${role.mode === 'chain' ? 'selected' : ''}>체인 (순차 실행)</option>
              <option value="parallel" ${role.mode === 'parallel' ? 'selected' : ''}>병렬 (동시 실행)</option>
            </select>
          </div>

          ${this.renderModeConfig(role)}

          ${role.category !== 'background' ? `
          <div class="alba-detail-row alba-prompt-row">
            <label class="alba-label">시스템 프롬프트</label>
            <textarea class="alba-prompt-textarea"
                      data-role-id="${role.roleId}"
                      placeholder="이 알바의 역할과 성격을 정의하세요..."
                      rows="4">${role.systemPrompt || ''}</textarea>
            <button class="settings-btn settings-btn-sm settings-btn-primary alba-save-prompt"
                    data-role-id="${role.roleId}">
              프롬프트 저장
            </button>
          </div>
          ` : ''}

          <div class="alba-detail-row">
            <label class="alba-label">카테고리</label>
            <select class="alba-category-select" data-role-id="${role.roleId}">
              <optgroup label="일반 알바">
                <option value="content" ${role.category === 'content' ? 'selected' : ''}>✍️ 콘텐츠</option>
                <option value="code" ${role.category === 'code' ? 'selected' : ''}>💻 코드</option>
                <option value="data" ${role.category === 'data' ? 'selected' : ''}>📊 데이터</option>
                <option value="creative" ${role.category === 'creative' ? 'selected' : ''}>🎨 크리에이티브</option>
                <option value="technical" ${role.category === 'technical' ? 'selected' : ''}>🔧 기술</option>
                <option value="other" ${role.category === 'other' ? 'selected' : ''}>🤖 기타</option>
              </optgroup>
              <optgroup label="시스템 알바">
                <option value="background" ${role.category === 'background' ? 'selected' : ''}>⚙️ 백그라운드 워커 (24시간)</option>
              </optgroup>
            </select>
          </div>
          
          ${role.category === 'background' ? this.renderBackgroundTasksConfig(role) : ''}

          ${role.category !== 'background' ? `
          <div class="alba-detail-row alba-triggers-row">
            <label class="alba-label">트리거 키워드</label>
            <div class="alba-triggers-container">
              <div class="alba-triggers-list">
                ${(role.triggers || []).map((trigger, idx) => `
                  <span class="alba-trigger-tag">
                    ${trigger}
                    <button class="trigger-remove" data-role-id="${role.roleId}" data-trigger-index="${idx}">×</button>
                  </span>
                `).join('')}
              </div>
              <div class="alba-trigger-input-wrap">
                <input type="text" class="alba-trigger-input"
                       data-role-id="${role.roleId}"
                       placeholder="키워드 입력 후 Enter">
                <button class="settings-btn settings-btn-sm settings-btn-outline alba-add-trigger"
                        data-role-id="${role.roleId}">추가</button>
              </div>
            </div>
          </div>
          ` : ''}

          <div class="alba-detail-row alba-ai-settings">
            <div class="alba-ai-setting">
              <label class="alba-label">Temperature</label>
              <input type="range" class="alba-temperature-range"
                     data-role-id="${role.roleId}"
                     min="0" max="2" step="0.1"
                     value="${role.temperature ?? 0.7}">
              <span class="alba-range-value">${role.temperature ?? 0.7}</span>
            </div>
            <div class="alba-ai-setting">
              <label class="alba-label">Max Tokens</label>
              <input type="number" class="alba-maxTokens-input"
                     data-role-id="${role.roleId}"
                     min="100" max="32000" step="100"
                     value="${role.maxTokens || 4096}">
            </div>
          </div>

          <div class="alba-detail-row alba-tags-row">
            <label class="alba-label">태그</label>
            <div class="alba-tags-container">
              <div class="alba-tags-list">
                ${(role.tags || []).map((tag, idx) => `
                  <span class="alba-tag">
                    #${tag}
                    <button class="tag-remove" data-role-id="${role.roleId}" data-tag-index="${idx}">×</button>
                  </span>
                `).join('')}
              </div>
              <div class="alba-tag-input-wrap">
                <input type="text" class="alba-tag-input"
                       data-role-id="${role.roleId}"
                       placeholder="태그 입력 후 Enter">
                <button class="settings-btn settings-btn-sm settings-btn-outline alba-add-tag"
                        data-role-id="${role.roleId}">추가</button>
              </div>
            </div>
          </div>

          <div class="alba-detail-row alba-actions-row">
            <div class="alba-btns">
              <button class="settings-btn settings-btn-sm settings-btn-outline"
                      data-role-id="${role.roleId}"
                      data-action="edit-alba">
                수정
              </button>
              <button class="settings-btn settings-btn-sm settings-btn-secondary"
                      data-role-id="${role.roleId}"
                      data-action="delete-alba">
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 백그라운드 태스크 설정 렌더링
   */
  renderBackgroundTasksConfig(role) {
    const tasks = role.backgroundTasks || {};
    return `
      <div class="alba-detail-row alba-background-tasks">
        <label class="alba-label">담당 업무 (24시간 자동 실행)</label>
        <div class="background-tasks-list">
          <label class="background-task-item">
            <input type="checkbox" 
                   data-role-id="${role.roleId}" 
                   data-task="tagGeneration"
                   ${tasks.tagGeneration ? 'checked' : ''}>
            <span class="task-icon">🏷️</span>
            <span class="task-name">태그 생성</span>
            <span class="task-desc">메시지마다 검색용 태그 자동 생성</span>
          </label>
          <label class="background-task-item">
            <input type="checkbox" 
                   data-role-id="${role.roleId}" 
                   data-task="compression"
                   ${tasks.compression ? 'checked' : ''}>
            <span class="task-icon">📦</span>
            <span class="task-name">대화 압축</span>
            <span class="task-desc">오래된 대화 자동 압축</span>
          </label>
          <label class="background-task-item">
            <input type="checkbox" 
                   data-role-id="${role.roleId}" 
                   data-task="weeklySummary"
                   ${tasks.weeklySummary ? 'checked' : ''}>
            <span class="task-icon">📊</span>
            <span class="task-name">주간 요약</span>
            <span class="task-desc">매주 대화 내용 요약 생성</span>
          </label>
        </div>
      </div>
    `;
  }

  /**
   * 작동 방식에 따른 설정 폼 렌더링
   */
  renderModeConfig(role) {
    const mode = role.mode || 'single';

    if (mode === 'single') {
      return `
        <div class="alba-detail-row">
          <label class="alba-label">사용 모델</label>
          <select class="alba-model-select" data-role-id="${role.roleId}">
            <option value="">자동 선택</option>
            ${this.renderModelOptions(role.preferredModel)}
          </select>
        </div>
      `;
    }

    if (mode === 'chain') {
      const chainSteps = role.chainSteps || [];
      return `
        <div class="alba-detail-row alba-chain-config">
          <label class="alba-label">체인 순서</label>
          <div class="alba-chain-steps">
            ${chainSteps.map((step, idx) => `
              <div class="alba-chain-step">
                <span class="step-num">${idx + 1}</span>
                <select class="chain-step-select" data-role-id="${role.roleId}" data-step-index="${idx}">
                  <option value="">선택...</option>
                  ${this.availableRoles.filter(r => r.roleId !== role.roleId).map(r => `
                    <option value="${r.roleId}" ${step === r.roleId ? 'selected' : ''}>${r.name}</option>
                  `).join('')}
                </select>
                <button class="step-remove" data-role-id="${role.roleId}" data-step-index="${idx}">×</button>
              </div>
            `).join('<span class="chain-arrow-sm">→</span>')}
            <button class="settings-btn settings-btn-sm settings-btn-outline add-chain-step" data-role-id="${role.roleId}">+</button>
          </div>
        </div>
      `;
    }

    if (mode === 'parallel') {
      const parallelRoles = role.parallelRoles || [];
      return `
        <div class="alba-detail-row alba-parallel-config">
          <label class="alba-label">동시 실행 알바</label>
          <div class="alba-parallel-list">
            ${this.availableRoles.filter(r => r.roleId !== role.roleId).map(r => `
              <label class="alba-parallel-item">
                <input type="checkbox"
                       data-role-id="${role.roleId}"
                       data-target-role="${r.roleId}"
                       ${parallelRoles.includes(r.roleId) ? 'checked' : ''}>
                <span>${r.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    return '';
  }

  /**
   * 모드 라벨
   */
  getModeLabel(mode) {
    const labels = {
      'single': '일반',
      'chain': '체인',
      'parallel': '병렬'
    };
    return labels[mode] || '일반';
  }

  /**
   * Role 카테고리별 아이콘
   */
  getRoleIcon(category) {
    const icons = {
      'content': '✍️',
      'code': '💻',
      'data': '📊',
      'creative': '🎨',
      'technical': '🔧',
      'other': '🤖'
    };
    return icons[category] || icons.other;
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
   * Tool Search 설정 렌더링
   */
  renderToolSearchSettings() {
    return `
      <div class="tool-search-settings-container">
        <div class="memory-toggle-group">
          <div class="memory-toggle-item">
            <div class="toggle-info">
              <span class="label-text">Tool Search 활성화</span>
              <span class="label-hint">도구가 많을 때(10개+) 필요한 도구만 동적으로 로드하여 토큰 절약 (Claude 전용 베타)</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="toolSearchEnabled" ${this.toolSearchConfig.enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="memory-field" style="margin-top: 1rem;">
          <label class="memory-label">
            <span class="label-text">검색 방식</span>
            <span class="label-hint">regex: 정규표현식 기반 빠른 검색 / bm25: 의미 기반 검색</span>
          </label>
          <select id="toolSearchType" class="memory-input" style="width: 100%; padding: 0.5rem;">
            <option value="regex" ${this.toolSearchConfig.type === 'regex' ? 'selected' : ''}>Regex (권장)</option>
            <option value="bm25" ${this.toolSearchConfig.type === 'bm25' ? 'selected' : ''}>BM25</option>
          </select>
        </div>

        <div class="memory-field" style="margin-top: 1rem;">
          <label class="memory-label">
            <span class="label-text">항상 로드할 도구</span>
            <span class="label-hint">쉼표로 구분 (예: send_message, schedule_message)</span>
          </label>
          <input type="text"
                 class="memory-input"
                 id="toolSearchAlwaysLoad"
                 value="${this.toolSearchConfig.alwaysLoad.join(', ')}"
                 placeholder="도구 이름을 쉼표로 구분"
                 style="width: 100%; padding: 0.5rem;">
        </div>

        <div class="memory-actions" style="margin-top: 1rem;">
          <button class="settings-btn settings-btn-primary" id="saveToolSearchBtn">
            저장
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
        <!-- 메모리 저장소 아코디언 -->
        <div class="storage-accordion" id="memoryStorageAccordion">
          <div class="storage-accordion-header" data-target="memoryStorageContent">
            <span class="accordion-icon">▶</span>
            <span class="accordion-title">📦 메모리 저장소</span>
            <span class="accordion-hint" id="memoryStorageHint">로컬</span>
          </div>
          <div class="storage-accordion-content" id="memoryStorageContent" style="display: none;">
            <div class="storage-type-selector" id="memoryStorageTypeSelector">
              <!-- 동적으로 채워짐 -->
            </div>
            
            <!-- FTP 설정 -->
            <div class="ftp-settings" id="memoryFtpSettings" style="display: none;">
              <div class="ftp-config-grid">
                <div class="ftp-field">
                  <label>호스트</label>
                  <input type="text" id="memoryFtpHost" class="storage-input" placeholder="192.168.0.1">
                </div>
                <div class="ftp-field">
                  <label>포트</label>
                  <input type="number" id="memoryFtpPort" class="storage-input" value="21">
                </div>
                <div class="ftp-field">
                  <label>사용자</label>
                  <input type="text" id="memoryFtpUser" class="storage-input" placeholder="username">
                </div>
                <div class="ftp-field">
                  <label>비밀번호</label>
                  <input type="password" id="memoryFtpPassword" class="storage-input" placeholder="********">
                </div>
                <div class="ftp-field ftp-field-full">
                  <label>경로</label>
                  <input type="text" id="memoryFtpBasePath" class="storage-input" placeholder="/memory">
                </div>
              </div>
              <button class="settings-btn settings-btn-outline ftp-test-btn" id="testMemoryFtpBtn">🔌 연결 테스트</button>
              <span class="ftp-test-result" id="memoryFtpTestResult"></span>
            </div>
            
            <!-- 로컬 설정 -->
            <div class="local-settings" id="memoryLocalSettings">
              <div class="storage-path-input">
                <input type="text" class="storage-input" id="memoryPath" value="${this.storageConfig.memoryPath}" placeholder="./memory">
                <button class="browse-btn" id="browseMemoryBtn" title="폴더 선택">📁</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 파일 저장소 아코디언 -->
        <div class="storage-accordion" id="filesStorageAccordion">
          <div class="storage-accordion-header" data-target="filesStorageContent">
            <span class="accordion-icon">▶</span>
            <span class="accordion-title">📁 파일 저장소</span>
            <span class="accordion-hint" id="filesStorageHint">로컬</span>
          </div>
          <div class="storage-accordion-content" id="filesStorageContent" style="display: none;">
            <div class="storage-type-selector" id="filesStorageTypeSelector">
              <!-- 동적으로 채워짐 -->
            </div>
            
            <!-- FTP 설정 -->
            <div class="ftp-settings" id="filesFtpSettings" style="display: none;">
              <div class="ftp-config-grid">
                <div class="ftp-field">
                  <label>호스트</label>
                  <input type="text" id="filesFtpHost" class="storage-input" placeholder="192.168.0.1">
                </div>
                <div class="ftp-field">
                  <label>포트</label>
                  <input type="number" id="filesFtpPort" class="storage-input" value="21">
                </div>
                <div class="ftp-field">
                  <label>사용자</label>
                  <input type="text" id="filesFtpUser" class="storage-input" placeholder="username">
                </div>
                <div class="ftp-field">
                  <label>비밀번호</label>
                  <input type="password" id="filesFtpPassword" class="storage-input" placeholder="********">
                </div>
                <div class="ftp-field ftp-field-full">
                  <label>경로</label>
                  <input type="text" id="filesFtpBasePath" class="storage-input" placeholder="/files">
                </div>
              </div>
              <button class="settings-btn settings-btn-outline ftp-test-btn" id="testFilesFtpBtn">🔌 연결 테스트</button>
              <span class="ftp-test-result" id="filesFtpTestResult"></span>
            </div>
            
            <!-- 로컬 설정 -->
            <div class="local-settings" id="filesLocalSettings">
              <div class="storage-path-input">
                <input type="text" class="storage-input" id="filesPath" value="${this.storageConfig.filesPath}" placeholder="./files">
                <button class="browse-btn" id="browseFilesBtn" title="폴더 선택">📁</button>
              </div>
            </div>
          </div>
        </div>

        <div class="storage-actions">
          <button class="settings-btn settings-btn-primary" id="saveStorageBtn">저장</button>
          <button class="settings-btn settings-btn-outline" id="resetStorageBtn">기본값</button>
        </div>
      </div>

      <!-- 폴더 탐색 모달 - 밀러 컬럼 스타일 -->
      <div class="folder-browser-modal" id="folderBrowserModal" style="display: none;">
        <div class="folder-browser-content miller-columns">
          <div class="folder-browser-header">
            <h3>📁 폴더 선택</h3>
            <button class="close-btn" id="closeFolderBrowser">✕</button>
          </div>
          
          <!-- 현재 선택 경로 -->
          <div class="folder-browser-current">
            <span class="current-path-display" id="currentPathDisplay">/</span>
            <button class="select-current-btn" id="selectCurrentFolder">✓ 여기 선택</button>
          </div>
          
          <!-- 밀러 컬럼 컨테이너 -->
          <div class="miller-columns-container" id="millerColumns">
            <!-- 동적으로 컬럼 추가됨 -->
          </div>
          
          <div class="folder-browser-actions">
            <span class="folder-browser-help">💡 클릭으로 탐색, 선택 후 "여기 선택"</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 스토리지 설정 초기화
   */
  async loadStorageTypes() {
    try {
      const res = await this.apiClient.get('/storage/types');
      if (!res.success) return;
      
      // 아코디언 헤더 클릭 이벤트
      document.querySelectorAll('.storage-accordion-header').forEach(header => {
        header.addEventListener('click', () => {
          const targetId = header.dataset.target;
          const content = document.getElementById(targetId);
          const icon = header.querySelector('.accordion-icon');
          
          if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
          } else {
            content.style.display = 'none';
            icon.textContent = '▶';
          }
        });
      });
      
      // 메모리 저장소 설정 로드
      await this.loadStorageSection('memory', res.types);
      
      // 파일 저장소 설정 로드
      await this.loadStorageSection('files', res.types);
      
    } catch (error) {
      console.error('Failed to load storage types:', error);
    }
  }
  
  /**
   * 저장소 섹션 로드 (memory 또는 files)
   */
  async loadStorageSection(section, types) {
    const selectorId = `${section}StorageTypeSelector`;
    const selector = document.getElementById(selectorId);
    if (!selector) return;
    
    // 현재 설정 가져오기
    const configRes = await this.apiClient.get(`/config/${section}`);
    const config = configRes.config || configRes;
    const currentType = config?.storageType || 'local';
    
    // 힌트 업데이트
    const hint = document.getElementById(`${section}StorageHint`);
    if (hint) {
      hint.textContent = currentType === 'ftp' ? 'FTP/NAS' : '로컬';
    }
    
    // 타입 선택 버튼 렌더링
    selector.innerHTML = types.map(t => `
      <label class="storage-type-option ${t.type === currentType ? 'selected' : ''} ${!t.available ? 'disabled' : ''}">
        <input type="radio" name="${section}StorageType" value="${t.type}" 
               ${t.type === currentType ? 'checked' : ''} 
               ${!t.available ? 'disabled' : ''}>
        <span class="type-icon">${t.icon}</span>
        <span class="type-name">${t.name}</span>
        ${t.comingSoon ? '<span class="coming-soon">준비 중</span>' : ''}
      </label>
    `).join('');
    
    // 타입 변경 이벤트
    selector.querySelectorAll(`input[name="${section}StorageType"]`).forEach(radio => {
      radio.addEventListener('change', (e) => {
        selector.querySelectorAll('.storage-type-option').forEach(opt => opt.classList.remove('selected'));
        e.target.closest('.storage-type-option').classList.add('selected');
        
        const ftpSettings = document.getElementById(`${section}FtpSettings`);
        const localSettings = document.getElementById(`${section}LocalSettings`);
        
        if (e.target.value === 'ftp') {
          if (ftpSettings) ftpSettings.style.display = 'block';
          if (localSettings) localSettings.style.display = 'none';
        } else {
          if (ftpSettings) ftpSettings.style.display = 'none';
          if (localSettings) localSettings.style.display = 'block';
        }
      });
    });
    
    // 현재 타입에 따라 폼 표시
    const ftpSettings = document.getElementById(`${section}FtpSettings`);
    const localSettings = document.getElementById(`${section}LocalSettings`);
    
    if (currentType === 'ftp') {
      if (ftpSettings) ftpSettings.style.display = 'block';
      if (localSettings) localSettings.style.display = 'none';
      
      // FTP 값 채우기
      if (config?.ftp) {
        const prefix = section;
        document.getElementById(`${prefix}FtpHost`).value = config.ftp.host || '';
        document.getElementById(`${prefix}FtpPort`).value = config.ftp.port || 21;
        document.getElementById(`${prefix}FtpUser`).value = config.ftp.user || '';
        document.getElementById(`${prefix}FtpPassword`).value = config.ftp.password || '';
        document.getElementById(`${prefix}FtpBasePath`).value = config.ftp.basePath || '';
      }
    } else {
      if (ftpSettings) ftpSettings.style.display = 'none';
      if (localSettings) localSettings.style.display = 'block';
    }
  }

  /**
   * FTP 설정 로드
   */

  /**
   * FTP 연결 테스트
   */
  async testFtpConnection(section, createIfMissing = false) {
    const prefix = section;
    const resultEl = document.getElementById(`${prefix}FtpTestResult`);
    const btn = document.getElementById(`test${section.charAt(0).toUpperCase() + section.slice(1)}FtpBtn`);
    
    if (!resultEl || !btn) return;
    
    btn.disabled = true;
    
    const ftpConfig = {
      host: document.getElementById(`${prefix}FtpHost`)?.value,
      port: parseInt(document.getElementById(`${prefix}FtpPort`)?.value) || 21,
      user: document.getElementById(`${prefix}FtpUser`)?.value,
      password: document.getElementById(`${prefix}FtpPassword`)?.value,
      basePath: document.getElementById(`${prefix}FtpBasePath`)?.value || `/${section}`,
      createIfMissing
    };
    
    try {
      // 1단계: 연결
      resultEl.innerHTML = '<span class="testing">🔌 서버 연결 중...</span>';
      
      // 2단계: 경로 확인
      await new Promise(r => setTimeout(r, 300));
      resultEl.innerHTML = '<span class="testing">🔌 서버 연결 중...</span> → <span class="testing">📁 경로 확인 중...</span>';
      
      const res = await this.apiClient.post('/storage/ftp/test', ftpConfig);
      
      if (res.success) {
        resultEl.innerHTML = '<span class="success">✅ 서버 연결</span> → <span class="success">✅ 경로 확인</span>';
        if (res.created) {
          resultEl.innerHTML += ' <span class="success">(폴더 생성됨)</span>';
        }
      } else if (res.pathMissing) {
        resultEl.innerHTML = '<span class="success">✅ 서버 연결</span> → <span class="error">❌ 경로 없음</span>';
        
        if (confirm(`경로가 존재하지 않습니다: ${ftpConfig.basePath}\n\n폴더를 생성할까요?`)) {
          btn.disabled = false;
          return this.testFtpConnection(section, true);
        }
      } else {
        resultEl.innerHTML = `<span class="error">❌ ${res.error || '연결 실패'}</span>`;
      }
    } catch (e) {
      resultEl.innerHTML = `<span class="error">❌ ${e.message}</span>`;
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * 폴더 탐색기 열기
   */
  openFolderBrowser(targetInputId) {
    this.folderBrowserTarget = targetInputId;
    this.currentBrowsePath = null;
    this.millerColumns = []; // 컬럼 상태 초기화
    
    const modal = document.getElementById('folderBrowserModal');
    if (modal) {
      // body로 이동 (stacking context 탈출)
      document.body.appendChild(modal);
      modal.style.display = 'flex';
      this.loadMillerColumn(null, 0); // 루트부터 시작
    }
  }

  /**
   * 밀러 컬럼 로드
   */
  async loadMillerColumn(dirPath, columnIndex) {
    try {
      const container = document.getElementById('millerColumns');
      const pathDisplay = document.getElementById('currentPathDisplay');
      
      if (!container) return;

      // 이 컬럼 이후의 컬럼들 제거
      while (container.children.length > columnIndex) {
        container.removeChild(container.lastChild);
      }
      this.millerColumns = this.millerColumns.slice(0, columnIndex);

      // 새 컬럼 생성
      const column = document.createElement('div');
      column.className = 'miller-column';
      column.innerHTML = '<div class="loading">로딩...</div>';
      container.appendChild(column);

      const url = dirPath 
        ? `/storage/browse?path=${encodeURIComponent(dirPath)}&foldersOnly=true`
        : '/storage/browse/roots';
      
      const res = await this.apiClient.get(url);
      
      if (!res.success) {
        column.innerHTML = `<div class="empty">오류</div>`;
        return;
      }

      this.currentBrowsePath = dirPath;
      this.millerColumns.push({ path: dirPath, items: res.items });
      pathDisplay.textContent = dirPath || '/ (루트)';

      // 컬럼 헤더
      const headerText = dirPath ? dirPath.split('/').pop() : '루트';
      
      if (!res.items.length) {
        column.innerHTML = `
          <div class="miller-column-header">${headerText}</div>
          <div class="empty">비어있음</div>
        `;
        return;
      }

      column.innerHTML = `
        <div class="miller-column-header">${headerText}</div>
        ${res.items.map(item => `
          <div class="miller-item" data-path="${item.path}" data-is-dir="${item.isDirectory}">
            <span class="miller-item-icon">${item.isDirectory ? '📁' : '📄'}</span>
            <span class="miller-item-name">${item.name}</span>
            ${item.isDirectory ? '<span class="miller-arrow">›</span>' : ''}
          </div>
        `).join('')}
      `;

      // 아이템 클릭 이벤트
      column.querySelectorAll('.miller-item').forEach(item => {
        item.addEventListener('click', () => {
          // 현재 컬럼의 선택 해제
          column.querySelectorAll('.miller-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          
          const path = item.dataset.path;
          const isDir = item.dataset.isDir === 'true';
          
          this.currentBrowsePath = path;
          pathDisplay.textContent = path;
          
          if (isDir) {
            // 다음 컬럼 로드
            this.loadMillerColumn(path, columnIndex + 1);
          }
          
          // 스크롤 오른쪽으로
          container.scrollLeft = container.scrollWidth;
        });
      });

      // 자동 스크롤
      container.scrollLeft = container.scrollWidth;
      
    } catch (error) {
      console.error('Failed to load miller column:', error);
    }
  }

  /**
   * 폴더 내용 로드 (구버전 - 호환용)
   */
  async loadFolderContents(dirPath) {
    try {
      const folderList = document.getElementById('folderList');
      const pathDisplay = document.getElementById('currentPathDisplay');
      const breadcrumb = document.getElementById('folderBreadcrumb');
      
      if (!folderList) return;
      
      folderList.innerHTML = '<div class="loading">로딩 중...</div>';

      const url = dirPath 
        ? `/storage/browse?path=${encodeURIComponent(dirPath)}&foldersOnly=true`
        : '/storage/browse/roots';
      
      const res = await this.apiClient.get(url);
      
      if (!res.success) {
        folderList.innerHTML = `<div class="error">오류: ${res.error}</div>`;
        return;
      }

      this.currentBrowsePath = dirPath;
      pathDisplay.textContent = dirPath || '/ (루트)';

      // 빵꾸판 네비게이션 렌더링
      this.renderBreadcrumb(dirPath, breadcrumb);

      if (!res.items.length) {
        folderList.innerHTML = '<div class="empty">하위 폴더가 없습니다</div>';
        return;
      }

      folderList.innerHTML = res.items.map(item => `
        <div class="folder-item" data-path="${item.path}">
          <span class="folder-icon">${item.isDirectory ? '📁' : '📄'}</span>
          <span class="folder-name">${item.name}</span>
          <span class="folder-hint">더블클릭</span>
        </div>
      `).join('');

      // 폴더 클릭 이벤트
      folderList.querySelectorAll('.folder-item').forEach(item => {
        item.addEventListener('click', () => {
          folderList.querySelectorAll('.folder-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
        });
        item.addEventListener('dblclick', () => {
          const path = item.dataset.path;
          this.loadFolderContents(path);
        });
      });
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      const folderList = document.getElementById('folderList');
      if (folderList) {
        folderList.innerHTML = `<div class="error">오류: ${error.message}</div>`;
      }
    }
  }

  /**
   * 빵꾸판 네비게이션 렌더링
   */
  renderBreadcrumb(dirPath, container) {
    if (!container) return;
    
    if (!dirPath) {
      container.innerHTML = '<span class="breadcrumb-item current">🏠 루트</span>';
      return;
    }
    
    const parts = dirPath.split('/').filter(p => p);
    let html = '<span class="breadcrumb-item" data-path="">🏠</span>';
    
    let currentPath = '';
    parts.forEach((part, i) => {
      currentPath += '/' + part;
      const isLast = i === parts.length - 1;
      html += `<span class="breadcrumb-separator">›</span>`;
      html += `<span class="breadcrumb-item ${isLast ? 'current' : ''}" data-path="${currentPath}">${part}</span>`;
    });
    
    container.innerHTML = html;
    
    // 빵꾸판 클릭 이벤트
    container.querySelectorAll('.breadcrumb-item:not(.current)').forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path || null;
        this.loadFolderContents(path);
      });
    });
  }

  /**
   * 현재 폴더 선택
   */
  selectCurrentFolder() {
    const path = this.currentBrowsePath;
    
    if (path && this.folderBrowserTarget) {
      const input = document.getElementById(this.folderBrowserTarget);
      if (input) {
        input.value = path;
      }
    }
    
    this.closeFolderBrowser();
  }

  /**
   * 폴더 선택 완료 (하위 폴더 선택시)
   */
  selectFolder() {
    const selected = document.querySelector('.folder-item.selected');
    const path = selected ? selected.dataset.path : this.currentBrowsePath;
    
    if (path && this.folderBrowserTarget) {
      const input = document.getElementById(this.folderBrowserTarget);
      if (input) {
        input.value = path;
      }
    }
    
    this.closeFolderBrowser();
  }

  /**
   * 폴더 탐색기 닫기
   */
  closeFolderBrowser() {
    const modal = document.getElementById('folderBrowserModal');
    if (modal) {
      modal.style.display = 'none';
    }
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

        <div class="prompt-divider">
          <span>AI 동작 설정</span>
        </div>

        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">기본 모델</span>
            <span class="label-hint">대화에 사용할 기본 AI 모델</span>
          </label>
          <select class="prompt-select" id="defaultModel">
            <option value="">자동 선택 (스마트 라우팅)</option>
            ${this.renderModelOptions(this.agentProfile.defaultModel)}
          </select>
        </div>

        <div class="prompt-field-row">
          <div class="prompt-field prompt-field-half">
            <label class="prompt-label">
              <span class="label-text">창의성 (Temperature)</span>
              <span class="label-hint">낮을수록 일관적, 높을수록 창의적</span>
            </label>
            <div class="prompt-range-wrap">
              <input type="range"
                     class="prompt-range"
                     id="soulTemperature"
                     min="0" max="2" step="0.1"
                     value="${this.agentProfile.temperature ?? 0.7}">
              <span class="prompt-range-value" id="soulTempValue">${this.agentProfile.temperature ?? 0.7}</span>
            </div>
            <div class="prompt-range-labels">
              <span>정확함</span>
              <span>창의적</span>
            </div>
          </div>

          <div class="prompt-field prompt-field-half">
            <label class="prompt-label">
              <span class="label-text">응답 길이 (Max Tokens)</span>
              <span class="label-hint">최대 응답 토큰 수</span>
            </label>
            <input type="number"
                   class="prompt-input prompt-input-number"
                   id="soulMaxTokens"
                   min="256" max="32000" step="256"
                   value="${this.agentProfile.maxTokens || 4096}">
          </div>
        </div>

        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">대화 스타일</span>
            <span class="label-hint">각 항목을 슬라이더로 세밀하게 조절하세요</span>
          </label>
          <div class="personality-sliders">
            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🎉 캐주얼</span>
                <span class="slider-label-right">🎩 격식</span>
              </div>
              <input type="range" class="personality-range" id="personalityFormality"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.communication?.formality ?? 0.5}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">⚡ 간결</span>
                <span class="slider-label-right">📚 상세</span>
              </div>
              <input type="range" class="personality-range" id="personalityVerbosity"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.communication?.verbosity ?? 0.5}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🌸 완곡</span>
                <span class="slider-label-right">🎯 직접적</span>
              </div>
              <input type="range" class="personality-range" id="personalityDirectness"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.communication?.directness ?? 0.7}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">📝 일반 용어</span>
                <span class="slider-label-right">🔧 기술 용어</span>
              </div>
              <input type="range" class="personality-range" id="personalityTechnicality"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.communication?.technicality ?? 0.5}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">😐 이모지 없음</span>
                <span class="slider-label-right">😊 이모지 많이</span>
              </div>
              <input type="range" class="personality-range" id="personalityEmoji"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.communication?.emoji ?? 0.3}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🧐 진지</span>
                <span class="slider-label-right">😄 유머러스</span>
              </div>
              <input type="range" class="personality-range" id="personalityHumor"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.communication?.humor ?? 0.3}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🤖 기계적</span>
                <span class="slider-label-right">💕 공감적</span>
              </div>
              <input type="range" class="personality-range" id="personalityEmpathy"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.traits?.empathetic ?? 0.6}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🐢 수동적</span>
                <span class="slider-label-right">🚀 적극적</span>
              </div>
              <input type="range" class="personality-range" id="personalityProactive"
                     min="0" max="1" step="0.1"
                     value="${this.agentProfile.personality?.traits?.proactive ?? 0.7}">
            </div>
          </div>
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
          ${service.type === 'vertex' ? `
            <!-- Vertex AI 전용 설정 -->
            <div class="vertex-config" style="margin-bottom: 0.75rem;">
              <div style="margin-bottom: 0.5rem;">
                <label style="font-size: 0.75rem; color: #666; display: block; margin-bottom: 0.25rem;">
                  Project ID <span style="color: #ef4444;">*</span>
                </label>
                <input type="text"
                       class="vertex-project-input"
                       data-service-id="${service.id}"
                       value="${service.projectId || ''}"
                       placeholder="my-gcp-project"
                       style="width: 100%; padding: 0.4rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.85rem; box-sizing: border-box;">
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <div style="flex: 1;">
                  <label style="font-size: 0.75rem; color: #666; display: block; margin-bottom: 0.25rem;">Region</label>
                  <select class="vertex-region-select"
                          data-service-id="${service.id}"
                          style="width: 100%; padding: 0.4rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.85rem;">
                    <option value="us-east5" ${service.region === 'us-east5' ? 'selected' : ''}>us-east5 (기본)</option>
                    <option value="europe-west1" ${service.region === 'europe-west1' ? 'selected' : ''}>europe-west1</option>
                    <option value="asia-southeast1" ${service.region === 'asia-southeast1' ? 'selected' : ''}>asia-southeast1</option>
                  </select>
                </div>
                <button class="settings-btn settings-btn-sm settings-btn-primary vertex-save-btn"
                        data-service-id="${service.id}"
                        style="align-self: flex-end; padding: 0.4rem 0.75rem;">
                  저장
                </button>
              </div>
              <p style="font-size: 0.7rem; color: #888; margin-top: 0.5rem;">
                ADC(gcloud auth) 또는 서비스 계정 인증 필요
              </p>
            </div>
          ` : `
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
          `}

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
            ${(service.type === 'vertex' ? service.projectId : service.hasApiKey) ? `
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
              <p class="service-hint">${service.type === 'vertex'
                ? 'Project ID를 설정하면 연결 테스트와 모델 갱신이 가능합니다.'
                : 'API 키를 설정하면 연결 테스트와 모델 갱신이 가능합니다.'
              }</p>
            `}
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * 모델 옵션 렌더링 헬퍼
   */
  renderModelOptions(selectedValue) {
    return this.availableModels.map(model => `
      <option value="${model.id}"
              ${model.id === selectedValue ? 'selected' : ''}
              ${model.disabled ? 'disabled' : ''}>
        ${model.name}${model.service && model.service !== '-' ? ` (${model.service})` : ''}
      </option>
    `).join('');
  }

  /**
   * 서비스 타입별 아이콘
   */
  getServiceIcon(type) {
    const icons = {
      'anthropic': '🤖',
      'openai': '🧠',
      'vertex': '☁️',
      'google': '🔵',
      'ollama': '🦙',
      'custom': '⚙️'
    };
    return icons[type.toLowerCase()] || '🤖';
  }

  /**
   * 비활성 서비스 레이어 토글
   */
  toggleInactiveLayer(button) {
    const wrapper = button.closest('.api-capsules-wrapper');
    const dropdown = wrapper?.querySelector('.api-capsules-dropdown');
    const dropdownContent = dropdown?.querySelector('.dropdown-content');
    if (!dropdown) return;

    const isOpen = dropdown.classList.contains('open');

    if (isOpen) {
      // 닫기
      dropdown.classList.remove('open');
      button.textContent = '+';
      button.classList.remove('open');
    } else {
      // 열기
      dropdown.classList.add('open');
      button.textContent = '×';
      button.classList.add('open');

      // 버튼 위치 계산해서 가림막 위치 설정
      requestAnimationFrame(() => {
        if (dropdownContent) {
          const contentRect = dropdownContent.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          const buttonCenter = buttonRect.left + buttonRect.width / 2;
          const offsetRight = contentRect.right - buttonCenter - 12;
          dropdownContent.style.setProperty('--button-offset', `${offsetRight}px`);
        }
      });
    }
  }

  /**
   * 활성 서비스 없을 때 안내 캡슐
   */
  renderEmptyGuide() {
    const hasActiveService = this.services.some(s => s.isActive);
    if (hasActiveService) {
      return '';
    }
    return `<span class="api-empty-guide">사용할 서비스를 추가해주세요</span>`;
  }

  /**
   * 서비스 리스트 렌더링 (드롭다운 내부)
   */
  renderServiceList() {
    // API 키 필요/불필요 서비스 분리
    const keyRequired = this.services.filter(s => s.type !== 'vertex' && s.type !== 'ollama');
    const noKeyRequired = this.services.filter(s => s.type === 'vertex' || s.type === 'ollama');

    const renderKeyService = (service) => {
      const hasKey = service.hasApiKey;
      const maskedKey = service.apiKeyPreview || (hasKey ? '••••••••' : '');

      return `
        <div class="api-service-row" data-service-id="${service.id}">
          <div class="service-row-top">
            <span class="service-name">${service.name}</span>
            <label class="service-toggle">
              <input type="checkbox"
                     ${service.isActive ? 'checked' : ''}
                     data-service-id="${service.id}"
                     data-action="toggle-service">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="service-row-bottom">
            <input type="text"
                   class="service-api-input ${hasKey ? 'has-key' : ''}"
                   value="${hasKey ? maskedKey : ''}"
                   placeholder="${hasKey ? '' : 'API 키 입력'}"
                   ${hasKey ? 'disabled' : ''}
                   data-service-id="${service.id}"
                   data-action="api-key-input">
            <button class="service-key-btn ${hasKey ? 'has-key' : ''}"
                    data-service-id="${service.id}"
                    data-action="${hasKey ? 'edit-api-key-mode' : 'save-api-key'}">
              ${hasKey ? '수정' : '추가'}
            </button>
            ${hasKey ? `<button class="service-delete-btn"
                                data-service-id="${service.id}"
                                data-action="delete-api-key">삭제</button>` : ''}
          </div>
        </div>
      `;
    };

    const renderNoKeyService = (service) => {
      // Vertex AI는 Project ID, Region 설정
      if (service.type === 'vertex') {
        return `
          <div class="api-service-row no-key-service" data-service-id="${service.id}">
            <div class="service-row-top">
              <span class="service-name">${service.name}</span>
              <label class="service-toggle">
                <input type="checkbox"
                       ${service.isActive ? 'checked' : ''}
                       data-service-id="${service.id}"
                       data-action="toggle-service">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="service-row-bottom vertex-row">
              <input type="text"
                     class="service-api-input vertex-project-input"
                     data-service-id="${service.id}"
                     value="${service.projectId || ''}"
                     placeholder="Project ID">
              <select class="vertex-region-select"
                      data-service-id="${service.id}">
                <option value="us-east5" ${service.region === 'us-east5' ? 'selected' : ''}>us-east5</option>
                <option value="europe-west1" ${service.region === 'europe-west1' ? 'selected' : ''}>europe-west1</option>
                <option value="asia-southeast1" ${service.region === 'asia-southeast1' ? 'selected' : ''}>asia-southeast1</option>
              </select>
              <button class="service-key-btn vertex-save-btn"
                      data-service-id="${service.id}">
                저장
              </button>
            </div>
            <span class="vertex-auth-hint">ADC(gcloud auth) 또는 서비스 계정 인증 필요</span>
          </div>
        `;
      }

      // Ollama 등 다른 no-key 서비스
      return `
        <div class="api-service-row no-key-service" data-service-id="${service.id}">
          <div class="service-row-top">
            <span class="service-name">${service.name}</span>
            <label class="service-toggle">
              <input type="checkbox"
                     ${service.isActive ? 'checked' : ''}
                     data-service-id="${service.id}"
                     data-action="toggle-service">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="service-row-bottom">
            <span class="no-key-hint">로컬 서버 (API 키 불필요)</span>
          </div>
        </div>
      `;
    };

    // API 키 필요 서비스 먼저, 그 다음 불필요 서비스
    return keyRequired.map(renderKeyService).join('') + noKeyRequired.map(renderNoKeyService).join('');
  }

  /**
   * API 캡슐 버튼 렌더링 (외부 컨테이너용)
   */
  renderApiCapsules() {
    // 서비스별 배경 그라데이션 및 표시 이름 (채도 낮춤)
    const serviceConfig = {
      'anthropic': {
        bg: 'linear-gradient(135deg, #c4836f 0%, #d4a088 100%)',
        displayName: 'Anthropic'
      },
      'openai': {
        bg: 'linear-gradient(135deg, #5a9a8a 0%, #7ab8a8 100%)',
        displayName: 'OpenAI'
      },
      'google': {
        bg: 'linear-gradient(135deg, #7a9ec7 0%, #8ab89a 50%, #c9b896 100%)',
        displayName: 'Google'
      },
      'vertex': {
        bg: 'linear-gradient(135deg, #7a9ec7 0%, #9a8ac7 100%)',
        displayName: 'Vertex'
      },
      'ollama': {
        bg: 'linear-gradient(135deg, #3a3a4e 0%, #4a5568 100%)',
        displayName: 'Ollama'
      },
      'xai': {
        bg: 'linear-gradient(135deg, #6b7280 0%, #8b95a5 100%)',
        displayName: 'xAI'
      },
      'custom': {
        bg: 'linear-gradient(135deg, #8a9098 0%, #a0a8b0 100%)',
        displayName: null // 원래 이름 사용
      }
    };

    return this.services.map(service => {
      const isActive = service.isActive;
      // Vertex AI는 projectId로, Ollama는 항상 true, 나머지는 apiKey로 판단
      let hasKey;
      if (service.type === 'vertex') {
        hasKey = !!service.projectId;
      } else if (service.type === 'ollama') {
        hasKey = true; // 로컬 서버는 항상 준비됨
      } else {
        hasKey = service.hasApiKey;
      }

      let stateClass = 'inactive';
      if (isActive && hasKey) {
        stateClass = 'active has-key';
      } else if (isActive && !hasKey) {
        stateClass = 'active no-key';
      }

      // 비활성이면 숨김
      const hiddenClass = !isActive ? 'capsule-hidden' : '';

      const config = serviceConfig[service.type.toLowerCase()] || serviceConfig['custom'];
      const displayName = config.displayName || service.name;

      return `
        <button class="api-capsule ${stateClass} ${hiddenClass}"
                data-service-id="${service.id}"
                data-action="capsule-click"
                title="${service.name}${hasKey ? '' : ' (API 키 미설정)'}">
          <div class="capsule-bg" style="background: ${config.bg};"></div>
          <span class="capsule-led"></span>
          <span class="capsule-name">${displayName}</span>
        </button>
      `;
    }).join('');
  }

  /**
   * 캡슐 UI 실시간 업데이트 (숨김 토글 방식)
   */
  updateCapsuleUI() {
    // 각 서비스의 활성 상태에 따라 외부 캡슐 숨김 토글
    this.services.forEach(service => {
      const isActive = service.isActive;
      // Vertex AI는 projectId로, Ollama는 항상 true, 나머지는 apiKey로 판단
      let hasKey;
      if (service.type === 'vertex') {
        hasKey = !!service.projectId;
      } else if (service.type === 'ollama') {
        hasKey = true;
      } else {
        hasKey = service.hasApiKey;
      }

      // 외부 캡슐: 활성이면 보이고, 비활성이면 숨김
      const capsule = document.querySelector(`.api-capsule[data-service-id="${service.id}"]`);
      if (capsule) {
        capsule.classList.toggle('capsule-hidden', !isActive);
        // 상태 클래스 업데이트
        capsule.classList.remove('active', 'inactive', 'has-key', 'no-key');
        if (isActive && hasKey) {
          capsule.classList.add('active', 'has-key');
        } else if (isActive && !hasKey) {
          capsule.classList.add('active', 'no-key');
        } else {
          capsule.classList.add('inactive');
        }
      }
    });

    // 서비스 리스트 UI 업데이트
    this.updateServiceListUI();

    // 안내 캡슐 업데이트
    this.updateEmptyGuide();

    // 꼬리 위치 재계산
    this.updateTailPosition();
  }

  /**
   * 빈 상태 안내 캡슐 업데이트
   */
  updateEmptyGuide() {
    const guide = document.querySelector('.api-empty-guide');
    const hasActiveService = this.services.some(s => s.isActive);

    if (hasActiveService && guide) {
      guide.remove();
    } else if (!hasActiveService && !guide) {
      const dropdown = document.querySelector('.api-dropdown');
      if (dropdown) {
        dropdown.insertAdjacentHTML('beforebegin', `<span class="api-empty-guide">사용할 서비스를 추가해주세요</span>`);
      }
    }
  }

  /**
   * 말풍선 꼬리 위치 업데이트
   */
  updateTailPosition() {
    const wrapper = document.querySelector('.api-capsules-wrapper');
    const addButton = document.querySelector('.api-capsule-add');
    const dropdownContent = document.querySelector('.api-dropdown-content');

    if (wrapper && addButton && dropdownContent) {
      const wrapperRect = wrapper.getBoundingClientRect();
      const buttonRect = addButton.getBoundingClientRect();
      const rightOffset = wrapperRect.right - buttonRect.right;
      dropdownContent.style.setProperty('--button-right', `${rightOffset}px`);
    }
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
    // 이전 이벤트 리스너 정리 (중복 방지)
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // 토글 스위치는 change 이벤트 사용 (AI 서비스 토글)
    container.addEventListener('change', async (e) => {
      // API 드롭다운 토글
      if (e.target.id === 'api-dropdown-toggle') {
        const dropdownContent = container.querySelector('.api-dropdown-content');
        const addButton = container.querySelector('.api-capsule-add');
        if (dropdownContent) {
          dropdownContent.classList.toggle('open', e.target.checked);
          // 버튼 위치 계산해서 연결선 위치 설정
          if (e.target.checked && addButton) {
            const wrapperRect = container.querySelector('.api-capsules-wrapper').getBoundingClientRect();
            const buttonRect = addButton.getBoundingClientRect();
            const rightOffset = wrapperRect.right - buttonRect.right;
            dropdownContent.style.setProperty('--button-right', `${rightOffset}px`);
          }
        }
        return;
      }

      if (e.target.dataset.action === 'toggle-active') {
        e.stopPropagation();
        const serviceId = e.target.dataset.serviceId;
        // serviceId가 있을 때만 서비스 토글 (알바 토글은 role-id만 있음)
        if (serviceId) {
          await this.toggleServiceActive(serviceId, e.target.checked);
        }
      }

      // 서비스 리스트 토글
      if (e.target.dataset.action === 'toggle-service') {
        const serviceId = e.target.dataset.serviceId;
        if (serviceId) {
          await this.toggleServiceActive(serviceId, e.target.checked);
          // 서비스 카드의 체크박스도 동기화
          const cardCheckbox = document.querySelector(`.ai-service-card[data-service-id="${serviceId}"] input[data-action="toggle-active"]`);
          if (cardCheckbox) {
            cardCheckbox.checked = e.target.checked;
          }
        }
      }
    }, { signal });

    // 온보딩 카드 클릭 (아코디언)
    container.addEventListener('click', (e) => {
      const card = e.target.closest('.onboarding-card');
      if (card && !e.target.closest('.toggle-switch')) {
        const targetId = card.dataset.target;
        const content = document.getElementById(targetId);
        const item = card.closest('.onboarding-item');
        if (content) {
          content.classList.toggle('open');
          card.classList.toggle('active');
          item?.classList.toggle('open');
        }
      }
    }, { signal });

    // neu-field 인풋 값 변경 시 has-value 클래스 토글 + 값 표시 업데이트
    container.addEventListener('input', (e) => {
      const input = e.target.closest('.neu-field-input');
      if (input) {
        const field = input.closest('.neu-field');
        const valueDisplay = field?.querySelector('.neu-field-value');
        if (field) {
          if (input.value.trim()) {
            field.classList.add('has-value');
            if (valueDisplay) valueDisplay.textContent = input.value;
          } else {
            field.classList.remove('has-value');
            if (valueDisplay) valueDisplay.textContent = '';
          }
        }
      }
    }, { signal });

    // neu-field 클릭 시 편집 모드
    container.addEventListener('click', (e) => {
      const field = e.target.closest('.neu-field');
      if (field && !field.classList.contains('editing')) {
        field.classList.add('editing');
        const input = field.querySelector('.neu-field-input');
        if (input) {
          input.focus();
        }
      }
    }, { signal });

    // neu-field 포커스 아웃 시 편집 모드 종료
    container.addEventListener('focusout', (e) => {
      const input = e.target.closest('.neu-field-input');
      if (input) {
        const field = input.closest('.neu-field');
        if (field) {
          field.classList.remove('editing');
        }
      }
    }, { signal });

    // 버튼 클릭은 click 이벤트 사용
    container.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      e.stopPropagation();
      const action = button.dataset.action;
      const serviceId = button.dataset.serviceId;

      switch (action) {
        case 'toggle-inactive':
          this.toggleInactiveLayer(button);
          break;
        case 'edit-api-key':
          await this.editApiKey(serviceId);
          break;
        case 'test-connection':
          await this.testConnection(serviceId, button);
          break;
        case 'refresh-models':
          await this.refreshModels(serviceId, button);
          break;
        case 'save-api-key':
          await this.saveApiKeyFromList(serviceId);
          break;
        case 'edit-api-key-mode':
          this.enableApiKeyEditMode(serviceId, button);
          break;
        case 'delete-api-key':
          await this.deleteApiKey(serviceId);
          break;
      }
    }, { signal });

    // Vertex AI 저장 버튼
    container.querySelectorAll('.vertex-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const serviceId = btn.dataset.serviceId;
        await this.saveVertexConfig(serviceId);
      });
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

    // Tool Search 설정 버튼
    const saveToolSearchBtn = container.querySelector('#saveToolSearchBtn');
    if (saveToolSearchBtn) {
      saveToolSearchBtn.addEventListener('click', () => this.saveToolSearchSettings());
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

    // Soul temperature 슬라이더
    const soulTempSlider = container.querySelector('#soulTemperature');
    if (soulTempSlider) {
      soulTempSlider.addEventListener('input', (e) => {
        const valueDisplay = container.querySelector('#soulTempValue');
        if (valueDisplay) valueDisplay.textContent = e.target.value;
      });
    }


    // 스토리지 설정 버튼
    const saveStorageBtn = container.querySelector('#saveStorageBtn');
    const resetStorageBtn = container.querySelector('#resetStorageBtn');
    const browseMemoryBtn = container.querySelector('#browseMemoryBtn');
    const browseFilesBtn = container.querySelector('#browseFilesBtn');
    const closeFolderBrowser = container.querySelector('#closeFolderBrowser');
    const folderBrowserBack = container.querySelector('#folderBrowserBack');
    const folderBrowserSelect = container.querySelector('#folderBrowserSelect');
    const testMemoryFtpBtn = container.querySelector('#testMemoryFtpBtn');
    const testFilesFtpBtn = container.querySelector('#testFilesFtpBtn');

    if (testMemoryFtpBtn) {
      testMemoryFtpBtn.addEventListener('click', () => this.testFtpConnection('memory'));
    }
    
    if (testFilesFtpBtn) {
      testFilesFtpBtn.addEventListener('click', () => this.testFtpConnection('files'));
    }

    if (saveStorageBtn) {
      saveStorageBtn.addEventListener('click', () => this.saveStorageSettings());
    }

    if (resetStorageBtn) {
      resetStorageBtn.addEventListener('click', () => this.resetStorageSettings());
    }

    if (browseMemoryBtn) {
      browseMemoryBtn.addEventListener('click', () => this.openFolderBrowser('memoryPath'));
    }

    if (browseFilesBtn) {
      browseFilesBtn.addEventListener('click', () => this.openFolderBrowser('filesPath'));
    }

    if (closeFolderBrowser) {
      closeFolderBrowser.addEventListener('click', () => this.closeFolderBrowser());
    }

    if (folderBrowserBack) {
      folderBrowserBack.addEventListener('click', () => {
        if (this.currentBrowsePath) {
          const parentPath = this.currentBrowsePath.split('/').slice(0, -1).join('/') || null;
          this.loadFolderContents(parentPath);
        }
      });
    }

    // "여기 선택" 버튼
    const selectCurrentFolder = container.querySelector('#selectCurrentFolder');
    if (selectCurrentFolder) {
      selectCurrentFolder.addEventListener('click', () => this.selectCurrentFolder());
    }

    // 스토리지 타입 로드
    this.loadStorageTypes();

    // 라우팅 통계 버튼
    const refreshStatsBtn = container.querySelector('#refreshStatsBtn');
    const resetStatsBtn = container.querySelector('#resetStatsBtn');

    if (refreshStatsBtn) {
      refreshStatsBtn.addEventListener('click', () => this.refreshRoutingStats());
    }

    if (resetStatsBtn) {
      resetStatsBtn.addEventListener('click', () => this.resetRoutingStats());
    }

    // 에이전트 체인 버튼
    const addChainBtn = container.querySelector('#addChainBtn');

    if (addChainBtn) {
      addChainBtn.addEventListener('click', () => this.addNewChain());
    }

    // 알바 초기화 버튼
    const initRolesBtn = container.querySelector('#initRolesBtn');
    if (initRolesBtn) {
      initRolesBtn.addEventListener('click', () => this.initializeRoles());
    }

    // 알바 추가 버튼
    const addAlbaBtn = container.querySelector('#addAlbaBtn');
    if (addAlbaBtn) {
      addAlbaBtn.addEventListener('click', () => this.addAlba());
    }

    // 알바 헤더 클릭 (확장/축소)
    container.querySelectorAll('.alba-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-switch') || e.target.closest('button')) return;
        const roleId = header.dataset.roleId;
        this.toggleAlbaExpand(roleId);
      });
    });

    // 알바 모드 변경
    container.querySelectorAll('.alba-mode-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const roleId = e.target.dataset.roleId;
        this.updateAlbaMode(roleId, e.target.value);
      });
    });

    // 알바 모델 변경
    container.querySelectorAll('.alba-model-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const roleId = e.target.dataset.roleId;
        this.updateAlbaModel(roleId, e.target.value);
      });
    });

    // 알바 카테고리 변경
    container.querySelectorAll('.alba-category-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const roleId = e.target.dataset.roleId;
        this.expandedRoleId = roleId; // 확장 상태 유지
        await this.updateAlbaField(roleId, 'category', e.target.value);
        // 해당 알바 아이템만 다시 렌더링
        const role = this.availableRoles.find(r => r.roleId === roleId);
        if (role) {
          const albaItem = container.querySelector(`.alba-item[data-role-id="${roleId}"]`);
          if (albaItem) {
            albaItem.outerHTML = this.renderAlbaItem(role);
            this.attachEventListeners(container);
          }
        }
      });
    });

    // 백그라운드 태스크 체크박스 변경
    container.querySelectorAll('.background-task-item input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const roleId = e.target.dataset.roleId;
        const taskName = e.target.dataset.task;
        const role = this.availableRoles.find(r => r.roleId === roleId);
        if (role) {
          const backgroundTasks = role.backgroundTasks || {};
          backgroundTasks[taskName] = e.target.checked;
          await this.updateAlbaField(roleId, 'backgroundTasks', backgroundTasks);
        }
      });
    });

    // 알바 Temperature 변경
    container.querySelectorAll('.alba-temperature-range').forEach(input => {
      input.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        e.target.nextElementSibling.textContent = value;
      });
      input.addEventListener('change', (e) => {
        const roleId = e.target.dataset.roleId;
        this.updateAlbaField(roleId, 'temperature', parseFloat(e.target.value));
      });
    });

    // 알바 MaxTokens 변경
    container.querySelectorAll('.alba-maxTokens-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const roleId = e.target.dataset.roleId;
        this.updateAlbaField(roleId, 'maxTokens', parseInt(e.target.value));
      });
    });

    // 트리거 추가 버튼
    container.querySelectorAll('.alba-add-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const roleId = btn.dataset.roleId;
        const input = container.querySelector(`.alba-trigger-input[data-role-id="${roleId}"]`);
        if (input && input.value.trim()) {
          this.addAlbaTrigger(roleId, input.value.trim());
          input.value = '';
        }
      });
    });

    // 트리거 입력 엔터키
    container.querySelectorAll('.alba-trigger-input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          const roleId = input.dataset.roleId;
          this.addAlbaTrigger(roleId, input.value.trim());
          input.value = '';
        }
      });
    });

    // 트리거 삭제
    container.querySelectorAll('.trigger-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const roleId = btn.dataset.roleId;
        const idx = parseInt(btn.dataset.triggerIndex);
        this.removeAlbaTrigger(roleId, idx);
      });
    });

    // 태그 추가 버튼
    container.querySelectorAll('.alba-add-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const roleId = btn.dataset.roleId;
        const input = container.querySelector(`.alba-tag-input[data-role-id="${roleId}"]`);
        if (input && input.value.trim()) {
          this.addAlbaTag(roleId, input.value.trim());
          input.value = '';
        }
      });
    });

    // 태그 입력 엔터키
    container.querySelectorAll('.alba-tag-input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          const roleId = input.dataset.roleId;
          this.addAlbaTag(roleId, input.value.trim());
          input.value = '';
        }
      });
    });

    // 태그 삭제
    container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const roleId = btn.dataset.roleId;
        const idx = parseInt(btn.dataset.tagIndex);
        this.removeAlbaTag(roleId, idx);
      });
    });

    // 알바 활성화 토글
    container.querySelectorAll('[data-action="toggle-active"][data-role-id]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const roleId = e.target.dataset.roleId;
        this.toggleAlbaActive(roleId, e.target.checked);
      });
    });

    // 알바 편집/삭제 버튼
    container.querySelectorAll('[data-action="edit-alba"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editAlba(btn.dataset.roleId);
      });
    });

    container.querySelectorAll('[data-action="delete-alba"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteAlba(btn.dataset.roleId);
      });
    });

    // 체인 단계 추가
    container.querySelectorAll('.add-chain-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const roleId = btn.dataset.roleId;
        this.addAlbaChainStep(roleId);
      });
    });

    // 체인 단계 제거
    container.querySelectorAll('.step-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const roleId = btn.dataset.roleId;
        const stepIndex = parseInt(btn.dataset.stepIndex);
        this.removeAlbaChainStep(roleId, stepIndex);
      });
    });

    // 체인 단계 선택 변경
    container.querySelectorAll('.chain-step-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const roleId = e.target.dataset.roleId;
        const stepIndex = parseInt(e.target.dataset.stepIndex);
        this.updateAlbaChainStep(roleId, stepIndex, e.target.value);
      });
    });

    // 병렬 실행 알바 선택
    container.querySelectorAll('.alba-parallel-config input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const roleId = e.target.dataset.roleId;
        const targetRole = e.target.dataset.targetRole;
        this.toggleAlbaParallelRole(roleId, targetRole, e.target.checked);
      });
    });

    // 알바 프롬프트 저장
    container.querySelectorAll('.alba-save-prompt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const roleId = btn.dataset.roleId;
        const textarea = container.querySelector(`.alba-prompt-textarea[data-role-id="${roleId}"]`);
        if (textarea) {
          await this.saveAlbaPrompt(roleId, textarea.value);
        }
      });
    });

    // 체인 관련 이벤트
    container.addEventListener('change', async (e) => {
      if (e.target.dataset.action === 'toggle-chain') {
        const chainId = e.target.dataset.chainId;
        await this.toggleChain(chainId, e.target.checked);
      }

      // 알바(Role) 선택
      if (e.target.classList.contains('role-select')) {
        const chainId = e.target.dataset.chainId;
        const stepIndex = parseInt(e.target.dataset.stepIndex);
        await this.updateStepRole(chainId, stepIndex, e.target.value);
      }

      // 모델 오버라이드 선택
      if (e.target.classList.contains('model-override-select')) {
        const chainId = e.target.dataset.chainId;
        const stepIndex = parseInt(e.target.dataset.stepIndex);
        await this.updateStepModel(chainId, stepIndex, e.target.value);
      }
    }, { signal });

    // 체인 편집/삭제 버튼
    container.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const chainId = button.dataset.chainId;
      const stepIndex = button.dataset.stepIndex ? parseInt(button.dataset.stepIndex) : null;

      switch (action) {
        case 'edit-chain':
          await this.editChain(chainId);
          break;
        case 'delete-chain':
          await this.deleteChain(chainId);
          break;
        case 'add-step':
          await this.addChainStep(chainId);
          break;
        case 'remove-step':
          await this.removeChainStep(chainId, stepIndex);
          break;
      }
    }, { signal });
  }

  /**
   * 서비스 활성화/비활성화 토글
   */
  async toggleServiceActive(serviceId, isActive) {
    try {
      await this.apiClient.post(`/ai-services/${serviceId}/toggle`);

      // 성공 메시지 표시
      this.showSaveStatus(`서비스가 ${isActive ? '활성화' : '비활성화'}되었습니다.`, 'success');

      // 로컬 서비스 데이터 업데이트
      const service = this.services.find(s => s.id === serviceId);
      if (service) {
        service.isActive = isActive;
      }

      // 카드 상태 업데이트
      const card = document.querySelector(`.ai-service-card[data-service-id="${serviceId}"]`);
      if (card) {
        card.classList.toggle('active', isActive);
        card.classList.toggle('inactive', !isActive);
      }

      // 캡슐 UI 실시간 업데이트
      this.updateCapsuleUI();

      // 활성화 시 API 키가 있는 서비스면 모델 새로고침
      if (isActive && service) {
        const hasKey = service.type === 'vertex' ? !!service.projectId :
                       service.type === 'ollama' ? true :
                       service.hasApiKey;

        if (hasKey) {
          try {
            await this.apiClient.post(`/ai-services/${serviceId}/refresh-models`);
          } catch (e) {
            console.warn('Model refresh on toggle:', e);
          }
        }
      }

      // 서비스 목록 다시 로드 후 드롭다운 갱신
      await this.loadServices();
      this.collectAvailableModels();
      this.updateRoutingDropdowns();
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

      // 캡슐 UI 실시간 업데이트
      this.updateCapsuleUI();

      // 서비스 카드 UI 업데이트
      this.updateServiceCardUI(serviceId);
    } catch (error) {
      console.error('Failed to update API key:', error);
      this.showSaveStatus('API 키 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 서비스 카드 UI 업데이트
   */
  updateServiceCardUI(serviceId) {
    const service = this.services.find(s => s.id === serviceId);
    if (!service) return;

    const card = document.querySelector(`.ai-service-card[data-service-id="${serviceId}"]`);
    if (!card) return;

    // API 키 상태 업데이트
    const statusEl = card.querySelector('.api-key-status');
    if (statusEl) {
      if (service.hasApiKey) {
        statusEl.classList.remove('no-key');
        statusEl.classList.add('has-key');
        statusEl.innerHTML = '<span class="status-dot"></span>API 키 설정됨';
      } else {
        statusEl.classList.remove('has-key');
        statusEl.classList.add('no-key');
        statusEl.innerHTML = '<span class="status-dot"></span>API 키 미설정';
      }
    }
  }

  /**
   * API 키 수정 모드 활성화
   */
  enableApiKeyEditMode(serviceId, button) {
    const input = document.querySelector(`.service-api-input[data-service-id="${serviceId}"]`);
    if (input) {
      input.disabled = false;
      input.value = '';
      input.placeholder = '새 API 키 입력';
      input.focus();
    }
    if (button) {
      button.textContent = '저장';
      button.dataset.action = 'save-api-key';
    }
  }

  /**
   * 서비스 리스트에서 API 키 저장
   */
  async saveApiKeyFromList(serviceId) {
    const input = document.querySelector(`.service-api-input[data-service-id="${serviceId}"]`);
    const btn = document.querySelector(`.service-key-btn[data-service-id="${serviceId}"]`);
    if (!input || !input.value.trim()) {
      this.showSaveStatus('API 키를 입력하세요.', 'error');
      return;
    }

    const apiKey = input.value.trim();
    const originalBtnText = btn ? btn.textContent : '';

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '검증중...';
      }

      // 키 저장
      await this.apiClient.patch(`/ai-services/${serviceId}`, {
        apiKey: apiKey
      });

      // 연결 테스트
      let isValid = false;
      try {
        const testResponse = await this.apiClient.post(`/ai-services/${serviceId}/test`);
        isValid = testResponse.success;
      } catch (testError) {
        console.warn('API key test failed:', testError);
        isValid = false;
      }

      if (isValid) {
        // 모델 리스트 갱신
        if (btn) {
          btn.textContent = '모델갱신...';
        }
        try {
          await this.apiClient.post(`/ai-services/${serviceId}/refresh-models`);
        } catch (e) {
          console.warn('Model refresh failed:', e);
        }

        this.showSaveStatus('API 키가 확인되었습니다.', 'success');
        input.value = '';
        input.placeholder = '••••••••';

        // 서비스 목록 새로고침
        await this.loadServices();
        this.collectAvailableModels();

        // UI 업데이트
        this.updateCapsuleUI();
        this.updateServiceCardUI(serviceId);
        this.updateServiceListUI();
      } else {
        // 유효하지 않으면 키 삭제
        await this.apiClient.patch(`/ai-services/${serviceId}`, { apiKey: '' });
        this.showSaveStatus('유효하지 않은 API 키입니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      this.showSaveStatus('API 키 저장에 실패했습니다.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalBtnText;
      }
    }
  }

  /**
   * API 키 삭제
   */
  async deleteApiKey(serviceId) {
    if (!confirm('API 키를 삭제하시겠습니까?')) return;

    try {
      await this.apiClient.patch(`/ai-services/${serviceId}`, {
        apiKey: ''
      });

      this.showSaveStatus('API 키가 삭제되었습니다.', 'success');

      // 서비스 목록 새로고침
      await this.loadServices();

      // UI 업데이트
      this.updateCapsuleUI();
      this.updateServiceCardUI(serviceId);
      this.updateServiceListUI();
    } catch (error) {
      console.error('Failed to delete API key:', error);
      this.showSaveStatus('API 키 삭제에 실패했습니다.', 'error');
    }
  }

  /**
   * 서비스 리스트 UI 업데이트
   */
  updateServiceListUI() {
    const listContainer = document.querySelector('.api-service-list');
    if (listContainer) {
      listContainer.innerHTML = this.renderServiceList();
    }
  }

  /**
   * 라우팅 드롭다운 모델 목록 갱신
   */
  updateRoutingDropdowns() {
    const lightSelect = document.getElementById('routingLight');
    const mediumSelect = document.getElementById('routingMedium');
    const heavySelect = document.getElementById('routingHeavy');

    const hasModels = this.availableModels.length > 0 && !this.availableModels[0].disabled;

    [lightSelect, mediumSelect, heavySelect].forEach((select, idx) => {
      if (!select) return;

      const currentValue = select.value;
      const configKey = ['light', 'medium', 'heavy'][idx];
      const savedValue = this.routingConfig[configKey];

      select.innerHTML = this.renderModelOptions(savedValue || currentValue);
      select.disabled = !hasModels;

      // 저장된 값이 있으면 선택 유지
      if (savedValue && select.querySelector(`option[value="${savedValue}"]`)) {
        select.value = savedValue;
      }
    });

    // 저장/초기화 버튼 상태도 업데이트
    const saveBtn = document.getElementById('saveRoutingBtn');
    const resetBtn = document.getElementById('resetRoutingBtn');
    if (saveBtn) saveBtn.disabled = !hasModels;
    if (resetBtn) resetBtn.disabled = !hasModels;
  }

  /**
   * Vertex AI 설정 저장
   */
  async saveVertexConfig(serviceId) {
    const projectInput = document.querySelector(`.vertex-project-input[data-service-id="${serviceId}"]`);
    const regionSelect = document.querySelector(`.vertex-region-select[data-service-id="${serviceId}"]`);

    if (!projectInput || !regionSelect) return;

    const projectId = projectInput.value.trim();
    const region = regionSelect.value;

    if (!projectId) {
      this.showSaveStatus('Project ID를 입력해주세요.', 'error');
      return;
    }

    try {
      await this.apiClient.patch(`/ai-services/${serviceId}`, {
        projectId,
        region
      });

      this.showSaveStatus('Vertex AI 설정이 저장되었습니다.', 'success');

      // 서비스 목록 새로고침
      await this.loadServices();
      this.collectAvailableModels();
    } catch (error) {
      console.error('Failed to save Vertex config:', error);
      this.showSaveStatus('Vertex AI 설정 저장에 실패했습니다.', 'error');
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
   * 모델 ID로 서비스 정보 찾기
   */
  findServiceByModelId(modelId) {
    const model = this.availableModels.find(m => m.id === modelId);
    return model ? { serviceId: model.type, serviceName: model.service } : null;
  }


  /**
   * 라우팅 설정 저장 (서버로)
   */
  async saveRoutingSettings() {
    try {
      const light = document.getElementById('routingLight')?.value;
      const medium = document.getElementById('routingMedium')?.value;
      const heavy = document.getElementById('routingHeavy')?.value;

      // 생각 토글 상태 가져오기
      const lightThinking = document.getElementById('thinkingLight')?.checked || false;
      const mediumThinking = document.getElementById('thinkingMedium')?.checked || false;
      const heavyThinking = document.getElementById('thinkingHeavy')?.checked || false;

      // 각 모델의 서비스 정보 찾기
      const lightService = this.findServiceByModelId(light);
      const mediumService = this.findServiceByModelId(medium);
      const heavyService = this.findServiceByModelId(heavy);

      // 서버에 저장할 데이터 (modelId + serviceId + thinking 형식)
      const routingData = {
        enabled: true,
        light: { modelId: light, serviceId: lightService?.serviceId || null, thinking: lightThinking },
        medium: { modelId: medium, serviceId: mediumService?.serviceId || null, thinking: mediumThinking },
        heavy: { modelId: heavy, serviceId: heavyService?.serviceId || null, thinking: heavyThinking }
      };

      // 서버 API로 저장
      await this.apiClient.put('/config/routing', routingData);

      // 로컬 상태 업데이트
      this.routingConfig = {
        light, medium, heavy,
        lightThinking, mediumThinking, heavyThinking,
        lightService: lightService?.serviceId,
        mediumService: mediumService?.serviceId,
        heavyService: heavyService?.serviceId
      };

      // localStorage에도 백업 저장
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
      // 사용 가능한 모델 중에서 기본값 선택
      const defaultLight = this.availableModels.find(m => m.id.includes('haiku') || m.id.includes('fast'))?.id || this.availableModels[0]?.id;
      const defaultMedium = this.availableModels.find(m => m.id.includes('sonnet') || m.id.includes('4o') || m.id.includes('flash'))?.id || this.availableModels[0]?.id;
      const defaultHeavy = this.availableModels.find(m => m.id.includes('opus') || m.id.includes('pro'))?.id || this.availableModels[0]?.id;

      // 서비스 정보 찾기
      const lightService = this.findServiceByModelId(defaultLight);
      const mediumService = this.findServiceByModelId(defaultMedium);
      const heavyService = this.findServiceByModelId(defaultHeavy);

      const routingData = {
        enabled: true,
        light: { modelId: defaultLight, serviceId: lightService?.serviceId || null },
        medium: { modelId: defaultMedium, serviceId: mediumService?.serviceId || null },
        heavy: { modelId: defaultHeavy, serviceId: heavyService?.serviceId || null }
      };

      // 서버 API로 저장
      await this.apiClient.put('/config/routing', routingData);

      this.routingConfig = {
        light: defaultLight,
        medium: defaultMedium,
        heavy: defaultHeavy,
        lightService: lightService?.serviceId,
        mediumService: mediumService?.serviceId,
        heavyService: heavyService?.serviceId
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

      const memoryConfig = {
        autoSave,
        autoInject,
        shortTermSize,
        compressionThreshold
      };

      // MongoDB에 저장 (API 호출)
      await this.apiClient.put('/config/memory', memoryConfig);

      this.memoryConfig = memoryConfig;

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
      const defaultConfig = {
        autoSave: true,
        autoInject: true,
        shortTermSize: 50,
        compressionThreshold: 80
      };

      // MongoDB에 저장 (API 호출)
      await this.apiClient.put('/config/memory', defaultConfig);

      this.memoryConfig = defaultConfig;

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
   * Tool Search 설정 저장
   */
  async saveToolSearchSettings() {
    try {
      const enabled = document.getElementById('toolSearchEnabled')?.checked || false;
      const type = document.getElementById('toolSearchType')?.value || 'regex';
      const alwaysLoadInput = document.getElementById('toolSearchAlwaysLoad')?.value || '';
      const alwaysLoad = alwaysLoadInput
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const config = { enabled, type, alwaysLoad };

      await this.apiClient.put('/config/tool-search', config);

      this.toolSearchConfig = config;
      this.showSaveStatus('Tool Search 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to save tool search settings:', error);
      this.showSaveStatus('Tool Search 설정 저장에 실패했습니다.', 'error');
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

      // AI 동작 설정
      const defaultModel = document.getElementById('defaultModel')?.value || '';
      const temperature = parseFloat(document.getElementById('soulTemperature')?.value) || 0.7;
      const maxTokens = parseInt(document.getElementById('soulMaxTokens')?.value) || 4096;

      // 대화 스타일 (personality)
      const personality = {
        traits: {
          helpful: 1.0,
          professional: 0.9,
          friendly: 0.8,
          precise: 0.9,
          proactive: parseFloat(document.getElementById('personalityProactive')?.value) || 0.7,
          empathetic: parseFloat(document.getElementById('personalityEmpathy')?.value) || 0.6
        },
        communication: {
          formality: parseFloat(document.getElementById('personalityFormality')?.value) || 0.5,
          verbosity: parseFloat(document.getElementById('personalityVerbosity')?.value) || 0.5,
          technicality: parseFloat(document.getElementById('personalityTechnicality')?.value) || 0.5,
          directness: parseFloat(document.getElementById('personalityDirectness')?.value) || 0.7,
          emoji: parseFloat(document.getElementById('personalityEmoji')?.value) || 0.3,
          humor: parseFloat(document.getElementById('personalityHumor')?.value) || 0.3
        }
      };

      const profileId = this.agentProfile?.id || 'default';

      await this.apiClient.put(`/profile/agent/${profileId}`, {
        name,
        role,
        description,
        customPrompt,
        defaultModel,
        temperature,
        maxTokens,
        personality
      });

      this.showSaveStatus('설정이 저장되었습니다.', 'success');

      // 프로필 새로고침
      await this.loadAgentProfile();
    } catch (error) {
      console.error('Failed to save prompt settings:', error);
      this.showSaveStatus('설정 저장에 실패했습니다.', 'error');
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
        customPrompt: '',
        defaultModel: '',
        temperature: 0.7,
        maxTokens: 4096,
        personality: {
          traits: {
            helpful: 1.0,
            professional: 0.9,
            friendly: 0.8,
            precise: 0.9,
            proactive: 0.7,
            empathetic: 0.6
          },
          communication: {
            formality: 0.5,
            verbosity: 0.5,
            technicality: 0.5,
            directness: 0.7,
            emoji: 0.3,
            humor: 0.3
          }
        }
      });

      this.showSaveStatus('설정이 초기화되었습니다.', 'success');

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
      // 메모리 저장소 저장
      await this.saveStorageSection('memory');
      
      // 파일 저장소 저장
      await this.saveStorageSection('files');
      
      this.showSaveStatus('저장소 설정 저장됨. 서버 재시작 중...', 'success');
      await this.restartServer();
    } catch (error) {
      console.error('Failed to save storage settings:', error);
      this.showSaveStatus('저장소 설정 저장에 실패했습니다.', 'error');
    }
  }
  
  /**
   * 저장소 섹션 저장
   */
  async saveStorageSection(section) {
    const selectedType = document.querySelector(`input[name="${section}StorageType"]:checked`)?.value || 'local';
    
    if (selectedType === 'ftp') {
      const prefix = section;
      const ftpConfig = {
        host: document.getElementById(`${prefix}FtpHost`)?.value,
        port: parseInt(document.getElementById(`${prefix}FtpPort`)?.value) || 21,
        user: document.getElementById(`${prefix}FtpUser`)?.value,
        password: document.getElementById(`${prefix}FtpPassword`)?.value,
        basePath: document.getElementById(`${prefix}FtpBasePath`)?.value || `/${section}`
      };
      
      if (!ftpConfig.host || !ftpConfig.user) {
        throw new Error(`${section} FTP 호스트와 사용자를 입력해주세요.`);
      }
      
      await this.apiClient.put(`/config/${section}`, {
        storageType: 'ftp',
        ftp: ftpConfig
      });
    } else {
      const pathInput = document.getElementById(`${section}Path`);
      const path = pathInput?.value || `./${section}`;
      
      await this.apiClient.put(`/config/${section}`, {
        storageType: 'local',
        storagePath: path
      });
    }
  }

  /**
   * 서버 재시작
   */
  async restartServer() {
    try {
      await this.apiClient.post('/config/restart');
      // 3초 후 페이지 새로고침 (서버 재시작 대기)
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (e) {
      console.error('Server restart failed:', e);
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
   * 라우팅 통계 새로고침
   */
  async refreshRoutingStats() {
    try {
      await this.loadRoutingStats();
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('통계가 갱신되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to refresh routing stats:', error);
      this.showSaveStatus('통계 갱신에 실패했습니다.', 'error');
    }
  }

  /**
   * 라우팅 통계 초기화
   */
  async resetRoutingStats() {
    if (!confirm('라우팅 통계를 초기화하시겠습니까?')) {
      return;
    }

    try {
      // 서버에 통계 초기화 요청 (API가 있는 경우)
      // await this.apiClient.post('/chat/routing-stats/reset');

      this.routingStats = null;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('통계가 초기화되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to reset routing stats:', error);
      this.showSaveStatus('통계 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * 체인 활성화/비활성화 토글
   */
  async toggleChain(chainId, enabled) {
    try {
      const chain = this.agentChains.find(c => c.id === chainId);
      if (chain) {
        chain.enabled = enabled;
        localStorage.setItem('agentChains', JSON.stringify(this.agentChains));
        this.showSaveStatus(`체인이 ${enabled ? '활성화' : '비활성화'}되었습니다.`, 'success');
      }
    } catch (error) {
      console.error('Failed to toggle chain:', error);
      this.showSaveStatus('체인 상태 변경에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 초기화
   */
  async initializeRoles() {
    try {
      const response = await this.apiClient.post('/roles/initialize');
      if (response.success) {
        await this.loadAvailableRoles();
        const container = document.querySelector('.ai-settings-panel').parentElement;
        await this.render(container, this.apiClient);
        this.showSaveStatus(`기본 알바 ${response.count}명이 초기화되었습니다.`, 'success');
      }
    } catch (error) {
      console.error('Failed to initialize roles:', error);
      this.showSaveStatus('알바 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * 단계의 알바(Role) 업데이트
   */
  async updateStepRole(chainId, stepIndex, roleId) {
    try {
      const chain = this.agentChains.find(c => c.id === chainId);
      if (chain && chain.steps[stepIndex]) {
        chain.steps[stepIndex].roleId = roleId;
        localStorage.setItem('agentChains', JSON.stringify(this.agentChains));

        // UI 새로고침 (알바 정보 표시 업데이트)
        const container = document.querySelector('.ai-settings-panel').parentElement;
        await this.render(container, this.apiClient);
        this.showSaveStatus('알바가 배정되었습니다.', 'success');
      }
    } catch (error) {
      console.error('Failed to update step role:', error);
      this.showSaveStatus('알바 배정에 실패했습니다.', 'error');
    }
  }

  /**
   * 단계의 모델 오버라이드 업데이트
   */
  async updateStepModel(chainId, stepIndex, model) {
    try {
      const chain = this.agentChains.find(c => c.id === chainId);
      if (chain && chain.steps[stepIndex]) {
        chain.steps[stepIndex].customModel = model;
        localStorage.setItem('agentChains', JSON.stringify(this.agentChains));
        this.showSaveStatus('모델이 저장되었습니다.', 'success');
      }
    } catch (error) {
      console.error('Failed to update step model:', error);
      this.showSaveStatus('모델 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 체인에 단계 추가
   */
  async addChainStep(chainId) {
    try {
      const chain = this.agentChains.find(c => c.id === chainId);
      if (chain) {
        chain.steps.push({ roleId: '', customModel: '' });
        localStorage.setItem('agentChains', JSON.stringify(this.agentChains));

        const container = document.querySelector('.ai-settings-panel').parentElement;
        await this.render(container, this.apiClient);
        this.showSaveStatus('단계가 추가되었습니다.', 'success');
      }
    } catch (error) {
      console.error('Failed to add chain step:', error);
      this.showSaveStatus('단계 추가에 실패했습니다.', 'error');
    }
  }

  /**
   * 체인에서 단계 제거
   */
  async removeChainStep(chainId, stepIndex) {
    try {
      const chain = this.agentChains.find(c => c.id === chainId);
      if (chain && chain.steps.length > 1) {
        chain.steps.splice(stepIndex, 1);
        localStorage.setItem('agentChains', JSON.stringify(this.agentChains));

        const container = document.querySelector('.ai-settings-panel').parentElement;
        await this.render(container, this.apiClient);
        this.showSaveStatus('단계가 제거되었습니다.', 'success');
      } else if (chain && chain.steps.length <= 1) {
        this.showSaveStatus('최소 1개의 단계가 필요합니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to remove chain step:', error);
      this.showSaveStatus('단계 제거에 실패했습니다.', 'error');
    }
  }

  /**
   * 새 체인 추가
   */
  async addNewChain() {
    if (this.availableRoles.length === 0) {
      this.showSaveStatus('먼저 알바를 초기화해주세요.', 'error');
      return;
    }

    const name = prompt('새 체인 이름을 입력하세요:');
    if (!name) return;

    const description = prompt('체인 설명을 입력하세요 (선택사항):') || '';

    const type = confirm('순차 실행 체인을 만드시겠습니까?\n(취소를 누르면 병렬 실행 체인이 생성됩니다)') ? 'sequential' : 'parallel';

    const newChain = {
      id: `chain-${Date.now()}`,
      name,
      description,
      type,
      enabled: false,
      steps: [
        { roleId: '', customModel: '' },
        { roleId: '', customModel: '' }
      ]
    };

    this.agentChains.push(newChain);
    localStorage.setItem('agentChains', JSON.stringify(this.agentChains));

    const container = document.querySelector('.ai-settings-panel').parentElement;
    await this.render(container, this.apiClient);
    this.showSaveStatus('새 체인이 추가되었습니다. 알바를 배정해주세요.', 'success');
  }

  /**
   * 체인 편집
   */
  async editChain(chainId) {
    const chain = this.agentChains.find(c => c.id === chainId);
    if (!chain) return;

    const newName = prompt('체인 이름:', chain.name);
    if (newName === null) return;

    chain.name = newName;
    localStorage.setItem('agentChains', JSON.stringify(this.agentChains));

    const container = document.querySelector('.ai-settings-panel').parentElement;
    await this.render(container, this.apiClient);
    this.showSaveStatus('체인이 수정되었습니다.', 'success');
  }

  /**
   * 체인 삭제
   */
  async deleteChain(chainId) {
    if (!confirm('이 체인을 삭제하시겠습니까?')) {
      return;
    }

    this.agentChains = this.agentChains.filter(c => c.id !== chainId);
    localStorage.setItem('agentChains', JSON.stringify(this.agentChains));

    const container = document.querySelector('.ai-settings-panel').parentElement;
    await this.render(container, this.apiClient);
    this.showSaveStatus('체인이 삭제되었습니다.', 'success');
  }

  /**
   * 알바 확장/축소 토글
   */
  async toggleAlbaExpand(roleId) {
    this.expandedRoleId = this.expandedRoleId === roleId ? null : roleId;
    const container = document.querySelector('.ai-settings-panel').parentElement;
    await this.render(container, this.apiClient);
  }

  /**
   * 알바 활성화 토글
   */
  async toggleAlbaActive(roleId, active) {
    try {
      await this.apiClient.patch(`/roles/${roleId}`, { active });
      await this.loadAvailableRoles();
      this.showSaveStatus(`알바가 ${active ? '활성화' : '비활성화'}되었습니다.`, 'success');
    } catch (error) {
      console.error('Failed to toggle alba:', error);
      this.showSaveStatus('상태 변경에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 모드 변경
   */
  async updateAlbaMode(roleId, mode) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role) return;

      // 모드에 따른 기본값 설정
      const updates = { mode };
      if (mode === 'chain' && !role.chainSteps) {
        updates.chainSteps = [];
      }
      if (mode === 'parallel' && !role.parallelRoles) {
        updates.parallelRoles = [];
      }

      await this.apiClient.patch(`/roles/${roleId}`, updates);
      await this.loadAvailableRoles();

      // UI 새로고침 (확장 상태 유지)
      this.expandedRoleId = roleId;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('작동 방식이 변경되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to update alba mode:', error);
      this.showSaveStatus('방식 변경에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 모델 변경
   */
  async updateAlbaModel(roleId, model) {
    try {
      await this.apiClient.patch(`/roles/${roleId}`, { preferredModel: model });
      await this.loadAvailableRoles();
      this.showSaveStatus('모델이 변경되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to update alba model:', error);
      this.showSaveStatus('모델 변경에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 프롬프트 저장
   */
  async saveAlbaPrompt(roleId, systemPrompt) {
    try {
      await this.apiClient.patch(`/roles/${roleId}`, { systemPrompt });
      await this.loadAvailableRoles();
      this.showSaveStatus('프롬프트가 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to save alba prompt:', error);
      this.showSaveStatus('프롬프트 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 필드 업데이트 (범용)
   */
  async updateAlbaField(roleId, field, value) {
    try {
      await this.apiClient.patch(`/roles/${roleId}`, { [field]: value });
      await this.loadAvailableRoles();
      this.showSaveStatus('설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error(`Failed to update alba ${field}:`, error);
      this.showSaveStatus('저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 트리거 추가
   */
  async addAlbaTrigger(roleId, trigger) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role) return;

      const triggers = [...(role.triggers || []), trigger];
      await this.apiClient.patch(`/roles/${roleId}`, { triggers });
      await this.loadAvailableRoles();

      this.expandedRoleId = roleId;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('트리거가 추가되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to add trigger:', error);
      this.showSaveStatus('트리거 추가에 실패했습니다.', 'error');
    }
  }

  /**
   * 트리거 삭제
   */
  async removeAlbaTrigger(roleId, index) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role || !role.triggers) return;

      const triggers = role.triggers.filter((_, i) => i !== index);
      await this.apiClient.patch(`/roles/${roleId}`, { triggers });
      await this.loadAvailableRoles();

      this.expandedRoleId = roleId;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('트리거가 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to remove trigger:', error);
      this.showSaveStatus('트리거 삭제에 실패했습니다.', 'error');
    }
  }

  /**
   * 태그 추가
   */
  async addAlbaTag(roleId, tag) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role) return;

      const tags = [...(role.tags || []), tag];
      await this.apiClient.patch(`/roles/${roleId}`, { tags });
      await this.loadAvailableRoles();

      this.expandedRoleId = roleId;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('태그가 추가되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to add tag:', error);
      this.showSaveStatus('태그 추가에 실패했습니다.', 'error');
    }
  }

  /**
   * 태그 삭제
   */
  async removeAlbaTag(roleId, index) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role || !role.tags) return;

      const tags = role.tags.filter((_, i) => i !== index);
      await this.apiClient.patch(`/roles/${roleId}`, { tags });
      await this.loadAvailableRoles();

      this.expandedRoleId = roleId;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('태그가 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to remove tag:', error);
      this.showSaveStatus('태그 삭제에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 편집
   */
  async editAlba(roleId) {
    const role = this.availableRoles.find(r => r.roleId === roleId);
    if (!role) return;

    const name = prompt('알바 이름:', role.name);
    if (name === null) return;

    const description = prompt('설명:', role.description);
    if (description === null) return;

    try {
      await this.apiClient.patch(`/roles/${roleId}`, { name, description });
      await this.loadAvailableRoles();
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('알바 정보가 수정되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to edit alba:', error);
      this.showSaveStatus('수정에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 삭제
   */
  async deleteAlba(roleId) {
    const role = this.availableRoles.find(r => r.roleId === roleId);
    if (!role) return;

    if (!confirm(`"${role.name}" 알바를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await this.apiClient.delete(`/roles/${roleId}`);
      await this.loadAvailableRoles();
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('알바가 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to delete alba:', error);
      this.showSaveStatus('삭제에 실패했습니다.', 'error');
    }
  }

  /**
   * 알바 추가
   */
  async addAlba() {
    const name = prompt('새 알바 이름을 입력하세요:');
    if (!name) return;

    const description = prompt('알바 설명을 입력하세요:');
    if (description === null) return;

    const roleId = `custom-${Date.now()}`;

    try {
      await this.apiClient.post('/roles', {
        roleId,
        name,
        description,
        systemPrompt: `당신은 ${name}입니다.\n${description}`,
        triggers: [name.toLowerCase()],
        createdBy: 'user',
        category: 'other'
      });

      await this.loadAvailableRoles();
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
      this.showSaveStatus('새 알바가 추가되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to add alba:', error);
      this.showSaveStatus('알바 추가에 실패했습니다.', 'error');
    }
  }

  /**
   * 체인 단계 추가
   */
  async addAlbaChainStep(roleId) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role) return;

      const chainSteps = role.chainSteps || [];
      chainSteps.push('');

      await this.apiClient.patch(`/roles/${roleId}`, { chainSteps });
      await this.loadAvailableRoles();

      this.expandedRoleId = roleId;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to add chain step:', error);
      this.showSaveStatus('단계 추가에 실패했습니다.', 'error');
    }
  }

  /**
   * 체인 단계 제거
   */
  async removeAlbaChainStep(roleId, stepIndex) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role || !role.chainSteps) return;

      role.chainSteps.splice(stepIndex, 1);
      await this.apiClient.patch(`/roles/${roleId}`, { chainSteps: role.chainSteps });
      await this.loadAvailableRoles();

      this.expandedRoleId = roleId;
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to remove chain step:', error);
      this.showSaveStatus('단계 제거에 실패했습니다.', 'error');
    }
  }

  /**
   * 체인 단계 업데이트
   */
  async updateAlbaChainStep(roleId, stepIndex, targetRoleId) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role) return;

      const chainSteps = role.chainSteps || [];
      chainSteps[stepIndex] = targetRoleId;

      await this.apiClient.patch(`/roles/${roleId}`, { chainSteps });
      await this.loadAvailableRoles();
      this.showSaveStatus('체인 단계가 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to update chain step:', error);
      this.showSaveStatus('단계 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 병렬 실행 알바 토글
   */
  async toggleAlbaParallelRole(roleId, targetRoleId, checked) {
    try {
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (!role) return;

      const parallelRoles = role.parallelRoles || [];

      if (checked && !parallelRoles.includes(targetRoleId)) {
        parallelRoles.push(targetRoleId);
      } else if (!checked) {
        const idx = parallelRoles.indexOf(targetRoleId);
        if (idx > -1) parallelRoles.splice(idx, 1);
      }

      await this.apiClient.patch(`/roles/${roleId}`, { parallelRoles });
      await this.loadAvailableRoles();
      this.showSaveStatus('병렬 실행 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to toggle parallel role:', error);
      this.showSaveStatus('설정 저장에 실패했습니다.', 'error');
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
