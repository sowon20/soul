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
      mode: '',  // '', 'single', 또는 'auto' (빈 문자열 = 미선택)
      singleModel: null,
      singleThinking: false,
      manager: 'server',
      managerModel: null,
      light: '',
      medium: '',
      heavy: '',
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
    // 통합 저장소 설정 (메모리/파일 분리 폐기)
    this.storageConfig = {
      type: 'local',  // local, ftp, oracle, notion
      path: '~/.soul',
      ftp: null,
      oracle: null,
      notion: null
    };
    // 저장소 변경 추적용 (초기 설정 저장)
    this.originalStorageType = null;
    this.agentChains = [];
    this.availableRoles = [];  // 알바(Role) 목록
    this.expandedRoleId = null;  // 확장된 알바 ID
    this.abortController = null;  // 이벤트 리스너 중복 방지용
    this.voiceConfig = {
      model: ''
    };
    this.voiceModels = null; // 음성 모델 목록 (API에서 로드)
  }

  /**
   * 컴포넌트 렌더링
   */
  async render(container, apiClient) {
    this.apiClient = apiClient;

    // 디버깅을 위해 전역 변수로 노출
    window.aiSettings = this;

    // 로딩 애니메이션 표시
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;padding:60px 0;gap:10px;color:var(--text-tertiary);font-size:13px;">
        <div class="os1-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
        모델 목록 불러오는 중...
      </div>`;

    try {
      // 사용자 프로필 로드 (언어 정보 필요)
      await this.loadUserProfile();

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

      // TTS 모델 목록 로드
      await this.loadTTSModels();

      // 음성 설정 로드
      await this.loadVoiceConfig();

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

          <!-- 타임라인 섹션 (테스트) -->
          <div class="soul-timeline">
            <!-- 정체성 -->
            <div class="timeline-item expanded" data-section="identity" style="--timeline-color-from: #a8998a; --timeline-color-to: #8a9a9a;">
              <div class="timeline-icon" style="background: linear-gradient(145deg, #aa9a8a, #9a8a7a);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a4a3a" stroke-width="2">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
                </svg>
              </div>
              <div class="timeline-main">
                <div class="timeline-header">
                  <div class="timeline-content">
                    <div class="timeline-title">정체성 <span class="timeline-subtitle">이름과 역할</span></div>
                  </div>
                  <div class="timeline-progress">
                    <svg width="24" height="24" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(120,110,100,0.15)" stroke-width="2"/>
                      <circle class="progress-ring" cx="12" cy="12" r="10" fill="none" stroke="#5cb85c" stroke-width="2"
                        stroke-dasharray="62.83" stroke-dashoffset="62.83" stroke-linecap="round"
                        transform="rotate(-90 12 12)"/>
                      <path class="check-icon" d="M8 12l3 3 5-6" fill="none" stroke="#5cb85c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
                    </svg>
                  </div>
                </div>
                <div class="section-empty-hint">AI의 이름과 역할을 설정해보세요</div>
                <div class="timeline-body">
                  <div class="neu-field-group">
                    <div class="neu-field">
                      <input type="text" class="neu-field-input timeline-field" data-section="identity" data-field="name" placeholder="이름" value="${this.agentProfile?.name && this.agentProfile.name !== 'Soul' ? this.agentProfile.name : ''}" />
                    </div>
                    <div class="neu-field">
                      <input type="text" class="neu-field-input timeline-field" data-section="identity" data-field="role" placeholder="역할 (예: 비서, 친구, 선생님)" value="${this.agentProfile?.role && this.agentProfile.role !== 'AI 어시스턴트' ? this.agentProfile.role : ''}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 성격 -->
            <div class="timeline-item" data-section="personality" style="--timeline-color-from: #8a9a9a; --timeline-color-to: #9a8a7a;">
              <div class="timeline-icon" style="background: linear-gradient(145deg, #aa9a8a, #9a8a7a);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a4a3a" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div class="timeline-main">
                <div class="timeline-header">
                  <div class="timeline-content">
                    <div class="timeline-title">성격 <span class="timeline-subtitle">시스템 프롬프트</span></div>
                    <div class="timeline-summary timeline-summary--personality">
                      <div><span class="summary-label">프롬프트</span><span class="summary-text">${this.agentProfile?.description ? (this.agentProfile.description.length > 20 ? this.agentProfile.description.substring(0, 20) + '...' : this.agentProfile.description) : '-'}</span></div>
                    </div>
                  </div>
                  <div class="timeline-progress">
                    <svg width="24" height="24" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(120,110,100,0.15)" stroke-width="2"/>
                      <circle class="progress-ring" cx="12" cy="12" r="10" fill="none" stroke="#5cb85c" stroke-width="2"
                        stroke-dasharray="62.83" stroke-dashoffset="62.83" stroke-linecap="round"
                        transform="rotate(-90 12 12)"/>
                      <path class="check-icon" d="M8 12l3 3 5-6" fill="none" stroke="#5cb85c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
                    </svg>
                  </div>
                </div>
                <div class="section-empty-hint">AI의 성격과 말투를 설정해보세요</div>
                <div class="timeline-body">
                  <div class="neu-field-group">
                    <div class="neu-field">
                      <textarea class="neu-field-input neu-field-textarea timeline-field" data-section="personality" data-field="description" placeholder="AI의 성격과 말투를 정의하는 시스템 프롬프트를 입력하세요">${this.agentProfile?.description && !this.agentProfile.description.includes('당신은') ? this.agentProfile.description : ''}</textarea>
                    </div>
                  </div>
                  <!-- 대화 스타일 슬라이더 -->
                  <div class="timeline-sliders">
                    <div class="timeline-slider-item">
                      <div class="slider-labels">
                        <span>캐주얼</span>
                        <span>격식</span>
                      </div>
                      <input type="range" class="timeline-range${this.agentProfile?.personality?.communication?.formality == null ? ' unset' : ''}" data-field="formality" min="0" max="1" step="0.1" value="${this.agentProfile?.personality?.communication?.formality ?? 0.5}">
                    </div>
                    <div class="timeline-slider-item">
                      <div class="slider-labels">
                        <span>간결</span>
                        <span>상세</span>
                      </div>
                      <input type="range" class="timeline-range${this.agentProfile?.personality?.communication?.verbosity == null ? ' unset' : ''}" data-field="verbosity" min="0" max="1" step="0.1" value="${this.agentProfile?.personality?.communication?.verbosity ?? 0.5}">
                    </div>
                    <div class="timeline-slider-item">
                      <div class="slider-labels">
                        <span>진지</span>
                        <span>유머</span>
                      </div>
                      <input type="range" class="timeline-range${this.agentProfile?.personality?.communication?.humor == null ? ' unset' : ''}" data-field="humor" min="0" max="1" step="0.1" value="${this.agentProfile?.personality?.communication?.humor ?? 0.5}">
                    </div>
                    <div class="timeline-slider-item">
                      <div class="slider-labels">
                        <span>기계적</span>
                        <span>공감적</span>
                      </div>
                      <input type="range" class="timeline-range${this.agentProfile?.personality?.traits?.empathetic == null ? ' unset' : ''}" data-field="empathy" min="0" max="1" step="0.1" value="${this.agentProfile?.personality?.traits?.empathetic ?? 0.5}">
                    </div>
                    <div class="timeline-slider-item">
                      <div class="slider-labels">
                        <span>정확</span>
                        <span>창의</span>
                      </div>
                      <input type="range" class="timeline-range${this.agentProfile?.temperature == null ? ' unset' : ''}" data-field="temperature" min="0" max="1" step="0.1" value="${this.agentProfile?.temperature ?? 0.5}">
                    </div>
                    <div class="timeline-slider-item">
                      <div class="slider-labels">
                        <span>짧게</span>
                        <span>길게</span>
                      </div>
                      <input type="range" class="timeline-range${this.agentProfile?.maxTokens == null ? ' unset' : ''}" data-field="maxTokens" min="256" max="32000" step="256" value="${this.agentProfile?.maxTokens || 4096}">
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 두뇌 -->
            <div class="timeline-item" data-section="brain">
              <div class="timeline-icon" style="background: linear-gradient(145deg, #aa9a8a, #9a8a7a);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a4a3a" stroke-width="2">
                  <circle cx="12" cy="6" r="4"/>
                  <path d="M12 10v6"/>
                  <path d="M8 22h8"/>
                  <path d="M12 16v2"/>
                </svg>
              </div>
              <div class="timeline-main">
                <div class="timeline-header">
                  <div class="timeline-content">
                    <div class="timeline-title">두뇌 <span class="timeline-subtitle">AI 모델 & 라우팅</span></div>
                    <div class="timeline-summary timeline-summary--brain"></div>
                  </div>
                  <div class="timeline-progress">
                    <svg width="24" height="24" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(120,110,100,0.15)" stroke-width="2"/>
                      <circle class="progress-ring" cx="12" cy="12" r="10" fill="none" stroke="#5cb85c" stroke-width="2"
                        stroke-dasharray="62.83" stroke-dashoffset="62.83" stroke-linecap="round"
                        transform="rotate(-90 12 12)"/>
                      <path class="check-icon" d="M8 12l3 3 5-6" fill="none" stroke="#5cb85c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
                    </svg>
                  </div>
                </div>
                <div class="section-empty-hint">AI 모델과 라우팅을 설정해보세요</div>
                <div class="timeline-body">
                  <!-- 브레인 위자드 (가로 스텝) -->
                  <div class="brain-wizard" data-mode="${this.routingConfig.mode || ''}" data-router="${this.routingConfig.manager || 'server'}" data-confirmed="${this.routingConfig.confirmed ? 'true' : 'false'}">

                    <!-- 가로 스텝 인디케이터 -->
                    <div class="brain-wizard-steps">
                      <div class="brain-wizard-step" data-step="1">
                        <div class="brain-wizard-dot"><span>1</span></div>
                        <span class="brain-wizard-label">모드</span>
                      </div>
                      <div class="brain-wizard-line"></div>
                      <div class="brain-wizard-step brain-wizard-step--step2" data-step="2">
                        <div class="brain-wizard-dot"><span>2</span></div>
                        <span class="brain-wizard-label brain-wizard-label--single">모델</span>
                        <span class="brain-wizard-label brain-wizard-label--auto">라우팅</span>
                        <span class="brain-wizard-label brain-wizard-label--none">설정</span>
                      </div>
                      <div class="brain-wizard-line brain-wizard-line--step3"></div>
                      <div class="brain-wizard-step brain-wizard-step--step3" data-step="3">
                        <div class="brain-wizard-dot"><span>3</span></div>
                        <span class="brain-wizard-label brain-wizard-label--router">라우터</span>
                        <span class="brain-wizard-label brain-wizard-label--tiers">티어별</span>
                      </div>
                      <div class="brain-wizard-line brain-wizard-line--step4"></div>
                      <div class="brain-wizard-step brain-wizard-step--step4" data-step="4">
                        <div class="brain-wizard-dot"><span>4</span></div>
                        <span class="brain-wizard-label">티어별</span>
                      </div>
                      <div class="brain-wizard-line brain-wizard-line--final"></div>
                      <div class="brain-wizard-step brain-wizard-step--final" data-step="final">
                        <div class="brain-wizard-dot"><span>✓</span></div>
                        <span class="brain-wizard-label">완성</span>
                      </div>
                    </div>

                    <!-- 완성 후 수정 버튼 -->
                    <button type="button" class="brain-wizard-edit">수정하기</button>

                    <!-- 스텝 컨텐츠 -->
                    <div class="brain-wizard-body">

                      <!-- Step 1: 모드 선택 -->
                      <div class="brain-wizard-panel" data-panel="1">
                        <div class="brain-wizard-options">
                          <label class="brain-wizard-card ${this.routingConfig.mode === 'single' ? 'selected' : ''}">
                            <input type="radio" name="brainMode" value="single" ${this.routingConfig.mode === 'single' ? 'checked' : ''}>
                            <span class="card-title">단일 모델</span>
                            <span class="card-desc">하나의 모델 사용</span>
                          </label>
                          <label class="brain-wizard-card ${this.routingConfig.mode === 'auto' ? 'selected' : ''}">
                            <input type="radio" name="brainMode" value="auto" ${this.routingConfig.mode === 'auto' ? 'checked' : ''}>
                            <span class="card-title">자동 라우팅</span>
                            <span class="card-desc">복잡도별 자동 선택</span>
                          </label>
                        </div>
                        <div class="brain-wizard-hint">모드를 선택해주세요</div>
                      </div>

                      <!-- Step 2a: 단일 모델 선택 -->
                      <div class="brain-wizard-panel brain-wizard-panel--single" data-panel="2a">
                        <div class="brain-single-model-row">
                          <select class="brain-routing-select" id="routingSingleModel">
                            ${this.renderModelOptions(this.routingConfig.singleModel || this.routingConfig.medium)}
                          </select>
                          ${this.renderThinkingToggle('Single', this.routingConfig.singleThinking)}
                        </div>
                        <button type="button" class="brain-wizard-confirm" data-confirm="single">확인</button>
                      </div>

                      <!-- Step 2b: 라우팅 담당 선택 -->
                      <div class="brain-wizard-panel brain-wizard-panel--auto" data-panel="2b">
                        <div class="brain-wizard-options">
                          <label class="brain-wizard-card ${!this.routingConfig.manager || this.routingConfig.manager === 'server' ? 'selected' : ''}">
                            <input type="radio" name="routerType" value="server" ${!this.routingConfig.manager || this.routingConfig.manager === 'server' ? 'checked' : ''}>
                            <span class="card-title">서버</span>
                            <span class="card-desc">Smart Router</span>
                          </label>
                          <label class="brain-wizard-card ${this.routingConfig.manager === 'ai' ? 'selected' : ''}">
                            <input type="radio" name="routerType" value="ai" ${this.routingConfig.manager === 'ai' ? 'checked' : ''}>
                            <span class="card-title">라우터 AI</span>
                            <span class="card-desc">AI가 라우팅 결정</span>
                          </label>
                        </div>
                      </div>

                      <!-- Step 3a: 라우터 모델 선택 (AI 선택 시만) -->
                      <div class="brain-wizard-panel brain-wizard-panel--router" data-panel="3a">
                        <div class="brain-wizard-form">
                          <span class="form-label">라우터 모델</span>
                          <select class="brain-routing-select" id="routingRouter">
                            ${this.renderModelOptions(this.routingConfig.managerModel)}
                          </select>
                        </div>
                      </div>

                      <!-- Step 3/4: 티어별 모델 -->
                      <div class="brain-wizard-panel brain-wizard-panel--tiers" data-panel="tiers">
                        <div class="brain-tier-list">
                          <div class="brain-tier-row">
                            <span class="tier-badge tier-badge--light">경량</span>
                            <select class="brain-routing-select" id="routingLight">
                              ${this.renderModelOptions(this.routingConfig.light)}
                            </select>
                            ${this.renderThinkingToggle('Light', this.routingConfig.lightThinking)}
                          </div>
                          <div class="brain-tier-row">
                            <span class="tier-badge tier-badge--medium">중간</span>
                            <select class="brain-routing-select" id="routingMedium">
                              ${this.renderModelOptions(this.routingConfig.medium)}
                            </select>
                            ${this.renderThinkingToggle('Medium', this.routingConfig.mediumThinking)}
                          </div>
                          <div class="brain-tier-row">
                            <span class="tier-badge tier-badge--heavy">고성능</span>
                            <select class="brain-routing-select" id="routingHeavy">
                              ${this.renderModelOptions(this.routingConfig.heavy)}
                            </select>
                            ${this.renderThinkingToggle('Heavy', this.routingConfig.heavyThinking)}
                          </div>
                        </div>
                        <div class="brain-wizard-note">생각 기능은 모델별로 지원 여부가 다를 수 있습니다</div>
                        <button type="button" class="brain-wizard-confirm" data-confirm="tiers">확인</button>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 알바 -->
            <div class="timeline-item" data-section="alba">
              <div class="timeline-icon" style="background: linear-gradient(145deg, #8a9aaa, #7a8a9a);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a5a6a" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div class="timeline-main">
                <div class="timeline-header">
                  <div class="timeline-content">
                    <div class="timeline-title">알바 <span class="timeline-subtitle">전문 AI 워커</span></div>
                    <div class="alba-status">${this.renderAlbaStatus()}</div>
                  </div>
                </div>
                <div class="timeline-body">
                  <div class="alba-list">
                    ${this.renderAlbaList()}
                  </div>
                  <button type="button" class="alba-add-btn" id="addAlbaBtn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    알바 추가
                  </button>
                </div>
              </div>
            </div>

            <!-- 목소리 -->
            <div class="timeline-item" data-section="voice">
              <div class="timeline-icon" style="background: linear-gradient(145deg, #8a9aaa, #7a8a9a);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a6a7a" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </div>
              <div class="timeline-main">
                <div class="timeline-header">
                  <div class="timeline-content">
                    <div class="timeline-title">목소리 <span class="timeline-subtitle">대화, 음성</span></div>
                    <div class="timeline-summary timeline-summary--voice"></div>
                  </div>
                </div>
                <div class="section-empty-hint">음성을 선택해보세요</div>
                <div class="timeline-body">
                  <div class="neu-field-group">
                    <!-- 통합 목소리 선택 -->
                    <div class="neu-field">
                      <select class="neu-field-input" id="voiceSelect">
                        ${this.renderVoiceOptions()}
                      </select>
                    </div>

                    <!-- Cartesia WebSocket 설정 (Cartesia 선택 시에만 표시) -->
                    <div id="cartesiaDetailFields" style="display: none; margin-top: 12px;">
                      <div class="soul-form" id="cartesiaSoulForm"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 웹검색 설정: 독 설정 → 연결 탭에서 관리 -->

          </div>

          <!-- 온보딩 카드 섹션 제거됨 (타임라인 뷰로 통합) -->

          <!-- 메모리 설정: 시스템 자동 관리 (UI 노출 제거) -->

        </div>

        <!-- 저장 상태 표시 -->
        <div class="settings-save-status" id="saveStatus"></div>
      `;

      // 이벤트 리스너 등록
      this.attachEventListeners(container);

      // Cartesia 필드 복원 (DOM 생성 후 has-value 클래스 추가)
      this.restoreCartesiaFields();

      // 음성 요약 업데이트 (DOM 생성 후 실행)
      console.log('[render] 음성 요약 업데이트 호출 직전');
      this.updateVoiceSummary();
      console.log('[render] 음성 요약 업데이트 호출 완료');
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

    // 활성 서비스 모델 항상 새로고침 (파인튜닝 등 신규 모델 반영, 병렬)
    const refreshPromises = [];
    for (const service of this.services) {
      const hasKey = service.type === 'vertex' ? !!service.projectId :
                     service.type === 'ollama' ? true :
                     service.hasApiKey;

      if (service.isActive && hasKey) {
        refreshPromises.push(
          this.apiClient.post(`/ai-services/${service.id}/refresh-models`)
            .catch(e => console.warn(`Failed to refresh models for ${service.name}:`, e))
        );
      }
    }
    if (refreshPromises.length > 0) {
      console.log(`[AI Settings] Refreshing models for ${refreshPromises.length} services...`);
      await Promise.all(refreshPromises);
    }

    // 모델 새로고침 후 서비스 목록 다시 가져오기
    const refreshedResponse = await this.apiClient.get('/ai-services');
    this.services = refreshedResponse.services || [];
  }

  /**
   * 사용 가능한 모델 목록 수집
   * API 키가 설정되어 있고 활성화된 서비스의 모델만 수집
   */
  collectAvailableModels() {
    this.availableModels = [];
    this.modelsByService = {}; // 서비스별 그룹화

    console.log('[collectAvailableModels] services:', this.services.map(s => ({
      name: s.name,
      isActive: s.isActive,
      hasApiKey: s.hasApiKey,
      modelsCount: s.models?.length
    })));

    this.services.forEach(service => {
      // TTS 전용 서비스 제외 (채팅 모델 드롭다운에는 표시 안 함)
      if (service.serviceId === 'cartesia') return;

      // Vertex AI는 projectId로, Ollama는 API 키 선택적(있으면 사용, 없어도 OK), 나머지는 apiKey 필수
      let hasKey;
      if (service.type === 'vertex' || service.serviceId === 'vertex') {
        hasKey = !!service.projectId;
      } else if (service.type === 'ollama' || service.serviceId === 'ollama') {
        hasKey = true; // 로컬 서버는 API 키 선택적 (없어도 연결 시도)
      } else {
        hasKey = service.hasApiKey;
      }

      // 활성화된 서비스만 모델 수집 (Ollama는 키 없어도 OK)
      if (hasKey && service.isActive && service.models && service.models.length > 0) {
        const serviceName = service.name;
        if (!this.modelsByService[serviceName]) {
          this.modelsByService[serviceName] = [];
        }

        service.models.forEach(model => {
          const modelId = model.id.toLowerCase();
          const modelName = (model.name || '').toLowerCase();
          const modelDesc = (model.description || '').toLowerCase();

          // TTS/음성 모델 제외 (채팅 모델만)
          const isTTSModel =
            modelId.includes('tts') ||
            modelId.includes('whisper') ||
            modelId.includes('realtime') ||
            modelId.includes('audio') ||
            modelId.includes('speech') ||
            modelId.includes('sonic') ||
            modelName.includes('voice') ||
            modelDesc.includes('text-to-speech');

          if (isTTSModel) return;

          const modelData = {
            id: model.id,
            name: model.name || model.id,
            service: serviceName,
            serviceId: service.serviceId,
            type: service.type
          };
          this.availableModels.push(modelData);
          this.modelsByService[serviceName].push(modelData);
        });

        // 모델명 알파벳순 정렬
        this.modelsByService[serviceName].sort((a, b) => a.name.localeCompare(b.name));
      }
    });

    // 사용 가능한 모델이 없는 경우 안내 메시지용 플레이스홀더
    if (this.availableModels.length === 0) {
      this.availableModels.push({
        id: '',
        name: '(위에서 API 서비스를 추가해주세요)',
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
      if (response && (response.light || response.singleModel)) {
        // 새 형식 (mode + serviceId + thinking 포함) 또는 이전 형식
        this.routingConfig = {
          // 모드 (단일/자동)
          mode: response.mode || '',
          // 단일 모델 설정
          singleModel: response.singleModel?.modelId || null,
          singleThinking: response.singleModel?.thinking || false,
          // 라우팅 담당
          manager: response.manager || 'server',
          managerModel: response.managerModel?.modelId || null,
          // 티어별 모델
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
          heavyThinking: response.heavy?.thinking || false,
          // 완성 상태
          confirmed: response.confirmed || false
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
   * 통합 스토리지 설정 로드
   */
  async loadStorageConfig() {
    try {
      const response = await this.apiClient.get('/config/storage');
      if (response) {
        this.storageConfig = {
          type: response.type || 'local',
          path: response.path || '~/.soul',
          ftp: response.ftp || null,
          oracle: response.oracle || null,
          notion: response.notion || null
        };
        this.originalStorageType = this.storageConfig.type;
      }
    } catch (error) {
      console.error('Failed to load storage config:', error);
      // 기본값 유지
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
      const [rolesRes, statsRes] = await Promise.all([
        this.apiClient.get('/roles'),
        this.apiClient.get('/roles/stats/live').catch(() => null)
      ]);
      if (rolesRes.success) {
        this.availableRoles = rolesRes.roles || [];
      }
      // 실시간 통계 캐시
      this._albaLiveStats = statsRes?.stats?.roles || {};
      // DB 마지막 호출 캐시 (영구)
      this._albaLastCalls = statsRes?.lastCalls || {};
    } catch (error) {
      console.error('Failed to load roles:', error);
      this.availableRoles = [];
      this._albaLiveStats = {};
      this._albaLastCalls = {};
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
  renderThinkingToggle(tier, isEnabled) {
    return `
      <div class="thinking-toggle-wrapper">
        <label class="thinking-toggle">
          <input type="checkbox"
                 id="thinking${tier}"
                 ${isEnabled ? 'checked' : ''}>
          <span class="thinking-toggle-slider"></span>
          <span class="thinking-toggle-label">생각</span>
        </label>
      </div>
    `;
  }

  /**
   * 모델 ID로 표시 이름 가져오기
   */
  getModelDisplayName(modelId) {
    if (!modelId) return '미설정';
    const model = this.availableModels.find(m => m.id === modelId);
    return model?.name || modelId;
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
   * 알바 리스트 렌더링 (타임라인용)
   */
  renderAlbaList() {
    if (this.availableRoles.length === 0) {
      return '<div class="alba-empty-hint">등록된 알바가 없습니다</div>';
    }
    return this.availableRoles.map(role => this.renderAlbaCompactItem(role)).join('');
  }

  /**
   * 알바 현황 렌더링
   */
  renderAlbaStatus() {
    const total = this.availableRoles.length;
    const active = this.availableRoles.filter(r => r.active).length;
    const inactive = total - active;

    if (total === 0) {
      return '';
    }

    return `
      <span class="alba-status-item"><span class="alba-status-box">알바 수</span><span class="alba-status-num">${total}</span></span>
      <span class="alba-status-item"><span class="alba-status-box">고용</span><span class="alba-status-num">${active}</span></span>
      <span class="alba-status-item"><span class="alba-status-box">휴직</span><span class="alba-status-num">${inactive}</span></span>
    `;
  }

  /**
   * 알바 간략 아이템 렌더링 (타임라인용)
   */
  renderAlbaCompactItem(role) {
    // 시스템 역할: OFF일 때 뭐가 달라지는지 힌트
    const hint = role.isSystem && !role.active ? '<span class="alba-compact-hint">OFF: 간단 규칙으로 동작</span>' : '';

    // 마지막 호출 뱃지 (DB 영구 저장 기반 — 서버 재시작 후에도 유지)
    const lastCall = this._albaLastCalls?.[role.roleId];
    const liveStats = this._albaLiveStats?.[role.roleId];
    let statsBadge = '';
    if (lastCall?.at) {
      const ago = this._timeAgo(lastCall.at);
      const statusIcon = lastCall.success ? '✓' : '✗';
      statsBadge = `<span class="alba-compact-stats">${statusIcon} ${ago}</span>`;
    } else if (liveStats && liveStats.totalCalls > 0) {
      statsBadge = `<span class="alba-compact-stats">${liveStats.totalCalls}회</span>`;
    }

    // 모델 체인 정보
    const modelChain = this._renderModelChainLabel(role);

    return `
      <div class="alba-compact-item ${role.active ? '' : 'inactive'}" data-role-id="${role.roleId}" data-action="edit-alba">
        <div class="alba-compact-info">
          <span class="alba-compact-name">${role.name}${role.isSystem ? ' <span class="alba-system-tag">시스템</span>' : ''}${this._isCallableByAI(role) ? ' <span class="alba-system-tag" style="background:#7c5cff;color:#fff;">AI호출</span>' : ''} ${statsBadge}</span>
          <span class="alba-compact-desc">${role.description || '설명 없음'}${hint}</span>
          ${modelChain}
        </div>
        <label class="toggle-switch toggle-switch-xs" onclick="event.stopPropagation()">
          <input type="checkbox"
                 data-role-id="${role.roleId}"
                 data-action="toggle-alba-active"
                 ${role.active ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }

  /**
   * 모델 체인 라벨 생성
   * [단일] 모델명  or  [체인] 모델명 → 1번 → 2번
   */
  _renderModelChainLabel(role) {
    const cfg = typeof role.config === 'string' ? (() => { try { return JSON.parse(role.config); } catch { return {}; } })() : (role.config || {});
    const mainModel = this._shortModelName(role.preferredModel);

    // 시스템 알바: config.fallbackModels 체크
    if (role.isSystem && cfg.fallbackModels?.length > 0) {
      const steps = [mainModel, ...cfg.fallbackModels.map(fb => this._shortModelName(fb.modelId))];
      const chain = steps.join(' → ');
      return `<span class="alba-compact-model alba-chain-label" title="${chain}"><span class="alba-mode-tag chain">체인</span>${chain}</span>`;
    }

    // 사용자 알바: mode === 'chain' && chainSteps
    if (role.mode === 'chain' && role.chainSteps?.length > 0) {
      const stepNames = role.chainSteps.map(sid => {
        const r = this.availableRoles.find(ar => ar.roleId === sid);
        return r ? r.name : sid;
      });
      const chain = [mainModel || role.name, ...stepNames].join(' → ');
      return `<span class="alba-compact-model alba-chain-label" title="${chain}"><span class="alba-mode-tag chain">체인</span>${chain}</span>`;
    }

    // 단일 모델
    if (mainModel && mainModel !== '미설정') {
      return `<span class="alba-compact-model"><span class="alba-mode-tag single">단일</span>${mainModel}</span>`;
    }

    return '';
  }

  /**
   * callableByAI 여부 확인
   */
  _isCallableByAI(role) {
    const cfg = typeof role.config === 'string' ? (() => { try { return JSON.parse(role.config); } catch { return {}; } })() : (role.config || {});
    return cfg.callableByAI === true;
  }

  /**
   * 모델 ID → 짧은 표시명
   */
  _shortModelName(modelId) {
    if (!modelId) return '미설정';
    const model = this.availableModels.find(m => m.id === modelId);
    const name = model?.name || modelId;
    // 30자 넘으면 ... 처리
    return name.length > 30 ? name.slice(0, 28) + '...' : name;
  }

  /**
   * 알바 설정 렌더링 (간소화) - 기존 섹션용
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
          <div class="alba-item-status">
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
            <option value="" ${!role.preferredModel ? 'selected' : ''}>자동 선택</option>
            ${this.renderModelOptions(role.preferredModel, false)}
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
   * @deprecated 저장소 설정은 storage-settings.js로 이동됨
   */
  renderStorageSettings() {
    return '';
  }

  /**
   * @deprecated 저장소 설정은 storage-settings.js로 이동됨
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

    // 초기 저장소 타입 저장 (변경 감지용)
    this.originalStorageTypes[section] = currentType;

    // 힌트 업데이트
    const hint = document.getElementById(`${section}StorageHint`);
    if (hint) {
      const hintMap = { ftp: 'FTP/NAS', oracle: 'Oracle DB', local: '로컬' };
      hint.textContent = hintMap[currentType] || '로컬';
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
        const oracleSettings = document.getElementById(`${section}OracleSettings`);

        // 모두 숨기기
        if (ftpSettings) ftpSettings.style.display = 'none';
        if (localSettings) localSettings.style.display = 'none';
        if (oracleSettings) oracleSettings.style.display = 'none';

        // 선택한 타입만 표시
        if (e.target.value === 'ftp') {
          if (ftpSettings) ftpSettings.style.display = 'block';
        } else if (e.target.value === 'oracle') {
          if (oracleSettings) oracleSettings.style.display = 'block';
        } else {
          if (localSettings) localSettings.style.display = 'block';
        }
      });
    });
    
    // 현재 타입에 따라 폼 표시
    const ftpSettings = document.getElementById(`${section}FtpSettings`);
    const localSettings = document.getElementById(`${section}LocalSettings`);
    const oracleSettings = document.getElementById(`${section}OracleSettings`);

    // 모두 숨기기
    if (ftpSettings) ftpSettings.style.display = 'none';
    if (localSettings) localSettings.style.display = 'none';
    if (oracleSettings) oracleSettings.style.display = 'none';

    if (currentType === 'ftp') {
      if (ftpSettings) ftpSettings.style.display = 'block';

      // FTP 값 채우기
      if (config?.ftp) {
        const prefix = section;
        document.getElementById(`${prefix}FtpHost`).value = config.ftp.host || '';
        document.getElementById(`${prefix}FtpPort`).value = config.ftp.port || 21;
        document.getElementById(`${prefix}FtpUser`).value = config.ftp.user || '';
        document.getElementById(`${prefix}FtpPassword`).value = config.ftp.password || '';
        document.getElementById(`${prefix}FtpBasePath`).value = config.ftp.basePath || '';
      }
    } else if (currentType === 'oracle') {
      if (oracleSettings) oracleSettings.style.display = 'block';

      // Oracle 설정 상태 로드
      this.loadOracleStatus(section);
    } else {
      if (localSettings) localSettings.style.display = 'block';
    }
  }

  /**
   * Oracle 설정 상태 로드
   */
  async loadOracleStatus(section) {
    try {
      const res = await this.apiClient.get('/config/storage/oracle');
      if (res.success && res.configured) {
        const resultEl = document.getElementById(`${section}OracleTestResult`);
        if (resultEl) {
          resultEl.textContent = '✅ 키체인에 설정됨' + (res.encrypted ? ' (암호화 활성)' : '');
          resultEl.style.color = '#4CAF50';
        }
      }
    } catch (e) {
      console.error('Failed to load Oracle status:', e);
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
   * Oracle 연결 테스트
   */
  async testOracleConnection(section) {
    const resultEl = document.getElementById(`${section}OracleTestResult`);
    const btn = document.getElementById(`test${section.charAt(0).toUpperCase() + section.slice(1)}OracleBtn`);
    const passwordEl = document.getElementById(`${section}OraclePassword`);
    const encryptionKeyEl = document.getElementById(`${section}OracleEncryptionKey`);

    if (!resultEl || !btn) return;

    btn.disabled = true;
    resultEl.innerHTML = '<span class="testing">🔌 연결 테스트 중...</span>';

    try {
      // 비밀번호가 입력되었으면 먼저 키체인에 저장
      const password = passwordEl?.value;
      const encryptionKey = encryptionKeyEl?.value;

      if (password) {
        await this.apiClient.post('/config/storage/oracle/credentials', {
          password,
          encryptionKey: encryptionKey || undefined
        });
      }

      // 연결 테스트
      const res = await this.apiClient.post('/config/storage/oracle/test');

      if (res.success) {
        resultEl.innerHTML = '<span class="success">✅ Oracle 연결 성공!</span>';
        // 비밀번호 필드 초기화
        if (passwordEl) passwordEl.value = '';
        if (encryptionKeyEl) encryptionKeyEl.value = '';
      } else {
        resultEl.innerHTML = `<span class="error">❌ ${res.error || res.message || '연결 실패'}</span>`;
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
   * 모델 옵션 렌더링 헬퍼 (서비스별 그룹화)
   */
  renderModelOptions(selectedValue, includePlaceholder = true) {
    // 기본 placeholder 옵션
    const placeholder = includePlaceholder
      ? `<option value="" ${!selectedValue ? 'selected' : ''} disabled>모델을 선택해주세요</option>`
      : '';

    // 모델이 없거나 플레이스홀더만 있는 경우
    if (!this.modelsByService || Object.keys(this.modelsByService).length === 0) {
      return placeholder + this.availableModels.map(model => `
        <option value="${model.id}"
                ${model.id === selectedValue ? 'selected' : ''}
                ${model.disabled ? 'disabled' : ''}>
          ${model.name}
        </option>
      `).join('');
    }

    // 서비스명 알파벳순 정렬
    const sortedServices = Object.keys(this.modelsByService).sort((a, b) => a.localeCompare(b));

    // 선택된 값이 목록에 있는지 확인
    let selectedFound = false;
    if (selectedValue) {
      for (const models of Object.values(this.modelsByService)) {
        if (models.some(m => m.id === selectedValue)) {
          selectedFound = true;
          break;
        }
      }
    }

    // 목록에 없는 커스텀 모델 (임베딩 등)은 별도 옵션으로 추가
    const customOption = (selectedValue && !selectedFound)
      ? `<option value="${selectedValue}" selected>${selectedValue}</option>`
      : '';

    return placeholder + customOption + sortedServices.map(serviceName => {
      const models = this.modelsByService[serviceName];
      return `
        <optgroup label="${serviceName}">
          ${models.map(model => `
            <option value="${model.id}" ${model.id === selectedValue ? 'selected' : ''}>
              ${model.name}
            </option>
          `).join('')}
        </optgroup>
      `;
    }).join('');
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
      'fireworks': '🎆',
      'deepseek': '🐋',
      'qwen': '☁️',
      'custom': '⚙️'
    };
    return icons[(type || 'custom').toLowerCase()] || '🤖';
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
    const keyRequired = this.services.filter(s => {
      const type = s.type || s.serviceId;
      return type !== 'vertex' && type !== 'ollama';
    });
    const noKeyRequired = this.services.filter(s => {
      const type = s.type || s.serviceId;
      return type === 'vertex' || type === 'ollama';
    });

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
      'openrouter': {
        bg: 'linear-gradient(135deg, #8a6fbf 0%, #a88fd4 100%)',
        displayName: 'OpenRouter'
      },
      'fireworks': {
        bg: 'linear-gradient(135deg, #c48a5a 0%, #b89a6a 50%, #c4a870 100%)',
        displayName: 'Fireworks'
      },
      'deepseek': {
        bg: 'linear-gradient(135deg, #4a7ab5 0%, #5a8ac5 100%)',
        displayName: 'DeepSeek'
      },
      'qwen': {
        bg: 'linear-gradient(135deg, #ff6b35 0%, #f7a837 100%)',
        displayName: 'Qwen'
      },
      'together': {
        bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        displayName: 'Together AI'
      },
      'cartesia': {
        bg: 'linear-gradient(135deg, #7a9ab0 0%, #6a9aa8 100%)',
        displayName: 'Cartesia'
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
      if (service.type === 'vertex' || service.serviceId === 'vertex') {
        hasKey = !!service.projectId;
      } else if (service.type === 'ollama' || service.serviceId === 'ollama') {
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

      const config = serviceConfig[(service.serviceId || service.type || 'custom').toLowerCase()] || serviceConfig['custom'];
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
      if (service.type === 'vertex' || service.serviceId === 'vertex') {
        hasKey = !!service.projectId;
      } else if (service.type === 'ollama' || service.serviceId === 'ollama') {
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

    // 타임라인 슬라이더(range) 변경 이벤트
    container.addEventListener('input', (e) => {
      if (e.target.classList.contains('timeline-range')) {
        const field = e.target.dataset.field;
        const value = parseFloat(e.target.value);
        const section = e.target.closest('.timeline-item')?.dataset.section;

        // 실시간 UI 피드백 - 슬라이더 라벨 표시
        const sliderLabels = {
          formality: { left: '캐주얼', right: '격식' },
          verbosity: { left: '간결', right: '상세' },
          humor: { left: '진지', right: '유머' },
          empathy: { left: '기계적', right: '공감적' },
          temperature: { left: '정확', right: '창의' },
          maxTokens: { left: '짧게', right: '길게' }
        };
        const labels = sliderLabels[field];
        if (labels) {
          if (field === 'maxTokens') {
            this.showSaveStatus(`${Math.round(value)} tokens`, 'info');
          } else {
            const percent = Math.round(value * 100);
            const label = value < 0.4 ? labels.left : value > 0.6 ? labels.right : '균형';
            this.showSaveStatus(`${label} (${percent}%)`, 'info');
          }
        }
      }
    }, { signal });

    container.addEventListener('change', async (e) => {
      // 타임라인 슬라이더 변경 저장
      if (e.target.classList.contains('timeline-range')) {
        // 미설정 상태 해제
        e.target.classList.remove('unset');
        const field = e.target.dataset.field;
        const value = parseFloat(e.target.value);
        const section = e.target.closest('.timeline-item')?.dataset.section;
        await this.saveTimelineSliderValue(section, field, value);
        this.updateTimelineProgress(section);
        // 성격 섹션: 슬라이더 조절 시 요약에 "세밀조절" 표시
        if (section === 'personality') {
          this.updatePersonalitySummary();
        }
        this.showSaveStatus('조절 완료', 'success');
        return;
      }

      // 타임라인 셀렉트(모델 선택) 변경 저장
      if (e.target.classList.contains('timeline-select')) {
        const field = e.target.dataset.field;
        const value = e.target.value;
        const section = e.target.dataset.section;
        await this.saveTimelineSelectValue(section, field, value);
        this.updateTimelineProgress(section);
        return;
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

        // 타임라인 프로그레스 업데이트
        if (input.classList.contains('timeline-field')) {
          const section = input.dataset.section;
          this.updateTimelineProgress(section);
          // 성격 섹션: 프롬프트 입력 시 요약 업데이트
          if (section === 'personality') {
            const desc = input.value.trim();
            this.agentProfile.description = desc;
            this.updatePersonalitySummary();
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

    // 타임라인 필드 엔터키 처리 (한글 조합 중 무시)
    let isComposing = false;
    container.addEventListener('compositionstart', () => { isComposing = true; }, { signal });
    container.addEventListener('compositionend', () => { isComposing = false; }, { signal });

    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || isComposing) return;
      const input = e.target.closest('.timeline-field');
      if (!input || input.tagName === 'TEXTAREA') return;

      e.preventDefault();
      const item = input.closest('.timeline-item');
      const section = input.dataset.section;
      const fields = Array.from(item.querySelectorAll('.timeline-field'));
      const currentIndex = fields.indexOf(input);

      // 엔터 시 현재 값 저장 (어느 필드에서든)
      this.updateTimelineProgress(section);
      this.saveTimelineSectionDirect(section);

      // 같은 섹션 내 다음 필드가 있으면 이동
      if (currentIndex < fields.length - 1) {
        fields[currentIndex + 1].focus();
      } else {
        // 마지막 필드면 완료 처리 후 다음 섹션으로
        const allFilled = fields.every(f => f.value.trim());
        if (allFilled) {
          item.classList.remove('expanded');

          // 다음 섹션 찾아서 펼치기
          const nextItem = item.nextElementSibling?.closest('.timeline-item') ||
                          item.parentElement.querySelector(`.timeline-item:not([data-section="${section}"])`);
          if (nextItem && !nextItem.classList.contains('expanded')) {
            nextItem.dataset.expanding = 'true';
            nextItem.classList.add('expanded');
            setTimeout(() => {
              const firstField = nextItem.querySelector('.timeline-field');
              if (firstField) firstField.focus();
              setTimeout(() => delete nextItem.dataset.expanding, 200);
            }, 100);
          }
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

        // 타임라인 필드인 경우, 포커스 아웃 시 완료 체크 후 접기
        if (input.classList.contains('timeline-field')) {
          const section = input.dataset.section;
          setTimeout(() => {
            // 같은 섹션 내 다른 필드로 포커스 이동했는지 확인
            const item = document.querySelector(`.timeline-item[data-section="${section}"]`);
            // 편집 모드 전환 중이면 무시
            if (item?.dataset.expanding) return;
            const stillFocused = item?.querySelector('.timeline-field:focus');
            if (!stillFocused && item) {
              // focusout 시 항상 저장
              this.updateTimelineProgress(section);
              this.saveTimelineSectionDirect(section);

              // 모든 필드 채워졌으면 접기
              const fields = item.querySelectorAll('.timeline-field');
              const allFilled = Array.from(fields).every(f => f.value.trim());
              if (allFilled) {
                setTimeout(() => {
                  item.classList.remove('expanded');
                }, 200);
              }
            }
          }, 100);
        }
      }
    }, { signal });

    // 타임라인 프로그레스(체크버튼) 클릭 시 접기/펼치기 토글
    container.addEventListener('click', (e) => {
      const progress = e.target.closest('.timeline-progress');
      if (progress) {
        e.stopPropagation(); // 헤더 클릭 이벤트 방지
        const item = progress.closest('.timeline-item');
        if (!item) return;

        if (item.classList.contains('expanded')) {
          // 접기
          item.classList.remove('expanded');
          this.adjustCapsuleHeight(item, false);
        } else {
          // 펼치기
          item.dataset.expanding = 'true';
          item.classList.add('expanded');
          setTimeout(() => {
            const firstField = item.querySelector('.timeline-field');
            if (firstField) firstField.focus();
            this.adjustCapsuleHeight(item, true);
            setTimeout(() => delete item.dataset.expanding, 200);
          }, 100);
        }
      }
    }, { signal });

    // 타임라인 헤더 클릭 시 펼치기/접기
    container.addEventListener('click', (e) => {
      const header = e.target.closest('.timeline-header');
      if (!header) return;
      // 프로그레스 버튼 클릭은 위에서 처리
      if (e.target.closest('.timeline-progress')) return;

      const item = header.closest('.timeline-item');
      if (!item) return;

      if (item.classList.contains('expanded')) {
        item.classList.remove('expanded');
        this.adjustCapsuleHeight(item, false);
      } else {
        item.dataset.expanding = 'true';
        item.classList.add('expanded');
        setTimeout(() => {
          this.adjustCapsuleHeight(item, true);
          setTimeout(() => delete item.dataset.expanding, 200);
        }, 100);
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

    // 라우팅 설정 - 드롭다운 변경 시 자동 저장
    const routingManagerModelSelect = container.querySelector('#routingManagerModel');
    const routingSelects = container.querySelectorAll('.brain-routing-select');
    const thinkingToggles = container.querySelectorAll('[id^="thinking"]');

    // 모든 라우팅 드롭다운에 change 이벤트 추가
    routingSelects.forEach(select => {
      select.addEventListener('change', () => {
        this.saveRoutingSettings({ silent: true });
        this.updateTimelineProgress('brain');
        // 두뇌 요약 업데이트
        updateBrainWizard();
      });
    });

    // 생각 토글에도 change 이벤트 추가
    thinkingToggles.forEach(toggle => {
      toggle.addEventListener('change', () => {
        this.saveRoutingSettings({ silent: true });
        this.updateTimelineProgress('brain');
      });
    });

    // 브레인 위자드 관리
    const brainWizard = container.querySelector('.brain-wizard');
    const brainModeRadios = container.querySelectorAll('input[name="brainMode"]');
    const routerTypeRadios = container.querySelectorAll('input[name="routerType"]');
    const brainCards = container.querySelectorAll('.brain-wizard-card');

    // 카드 선택 시 UI 업데이트
    brainCards.forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio) {
        radio.addEventListener('change', () => {
          // 같은 그룹의 다른 카드들 선택 해제
          const name = radio.name;
          container.querySelectorAll(`input[name="${name}"]`).forEach(r => {
            r.closest('.brain-wizard-card')?.classList.remove('selected');
          });
          // 현재 카드 선택
          card.classList.add('selected');
        });
      }
    });

    // 위자드 상태 업데이트 함수
    const updateBrainWizard = () => {
      const modeRadio = container.querySelector('input[name="brainMode"]:checked');
      const mode = modeRadio?.value || '';  // 미선택 시 빈 문자열
      const routerType = container.querySelector('input[name="routerType"]:checked')?.value || 'server';

      // data-mode, data-router 속성 업데이트 (CSS에서 패널 표시 제어)
      if (brainWizard) {
        brainWizard.dataset.mode = mode;
        brainWizard.dataset.router = routerType;
      }

      // 두뇌 요약 업데이트
      const brainSummary = container.querySelector('.timeline-summary--brain');
      const brainHint = container.querySelector('.timeline-item[data-section="brain"] .section-empty-hint');
      if (brainSummary) {
        let summaryHtml = '';
        if (mode === 'single') {
          const singleSelect = container.querySelector('#routingSingleModel');
          const modelName = singleSelect?.selectedOptions[0]?.text || '';
          summaryHtml = `<div><span class="summary-label">단일</span><span class="summary-text">${modelName || '-'}</span></div>`;
        } else if (mode === 'auto') {
          if (routerType === 'server') {
            summaryHtml = `<div><span class="summary-label">자동</span><span class="summary-text">서버</span></div>`;
          } else if (routerType === 'ai') {
            const routerSelect = container.querySelector('#routingRouter');
            const routerModelName = routerSelect?.selectedOptions[0]?.text || '';
            const displayName = routerModelName ? `라우터 AI ${routerModelName}` : '라우터 AI';
            summaryHtml = `<div><span class="summary-label">자동</span><span class="summary-text">${displayName}</span></div>`;
          }
        }
        brainSummary.innerHTML = summaryHtml;

        // 모드가 선택되면 힌트 숨김
        if (brainHint) {
          brainHint.style.display = mode ? 'none' : '';
        }
      }

      // 스텝 인디케이터 상태 업데이트
      const steps = container.querySelectorAll('.brain-wizard-step');
      const lines = container.querySelectorAll('.brain-wizard-line');

      steps.forEach(step => {
        const stepNum = step.dataset.step;
        step.removeAttribute('data-done');
        step.removeAttribute('data-active');

        if (stepNum === '1') {
          // 모드 선택 전: active, 선택 후: done
          if (!mode) {
            step.dataset.active = 'true';
          } else {
            step.dataset.done = 'true';
          }
        } else if (stepNum === '2') {
          if (!mode) {
            // 모드 미선택 시 비활성
          } else if (mode === 'single') {
            // 단일 모델: step 2가 마지막
            step.dataset.done = 'true';
          } else {
            // 자동 라우팅: step 2 완료 (서버든 AI든)
            step.dataset.done = 'true';
          }
        } else if (stepNum === '3') {
          if (mode === 'auto' && routerType === 'server') {
            // 자동+서버: step 3가 마지막 (티어별)
            step.dataset.done = 'true';
          } else if (mode === 'auto' && routerType === 'ai') {
            // 자동+AI: step 3 완료 (라우터 모델)
            step.dataset.done = 'true';
          }
        } else if (stepNum === '4') {
          if (mode === 'auto' && routerType === 'ai') {
            // 자동+AI: step 4 완료 (티어별)
            step.dataset.done = 'true';
          }
        } else if (stepNum === 'final') {
          // 완성 단계는 confirmed일 때만 done
          // CSS에서 처리하므로 여기서는 패스
        }
      });

      // 라인 활성화
      lines.forEach((line, idx) => {
        line.removeAttribute('data-active');
        if (mode && idx === 0) {
          // step 1 -> step 2 라인
          line.dataset.active = 'true';
        }
        if (mode === 'single' && idx === 1) {
          // 단일모델: step 2 -> final 라인
          line.dataset.active = 'true';
        }
        if (mode === 'auto' && idx === 1) {
          // step 2 -> step 3 라인
          line.dataset.active = 'true';
        }
        if (mode === 'auto' && routerType === 'server' && idx === 2) {
          // 자동+서버: step 3 -> final 라인
          line.dataset.active = 'true';
        }
        if (mode === 'auto' && routerType === 'ai' && idx === 2) {
          // step 3 -> step 4 라인
          line.dataset.active = 'true';
        }
        if (mode === 'auto' && routerType === 'ai' && idx === 3) {
          // 자동+AI: step 4 -> final 라인
          line.dataset.active = 'true';
        }
      });
    };

    // 초기 상태 설정
    updateBrainWizard();
    this.updatePersonalitySummary();

    // 모드 변경 시
    brainModeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        updateBrainWizard();
        this.saveRoutingSettings({ silent: true });
        this.updateTimelineProgress('brain');
      });
    });

    // 라우팅 담당 변경 시
    routerTypeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        updateBrainWizard();
        this.saveRoutingSettings({ silent: true });
        this.updateTimelineProgress('brain');
      });
    });

    // 확인 버튼 클릭 시
    const confirmBtns = container.querySelectorAll('.brain-wizard-confirm');
    confirmBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (brainWizard) {
          // 모드별 필수 모델 검증 (DOM에서 직접 값 읽기)
          const mode = this.routingConfig.mode;
          const manager = this.routingConfig.manager;

          if (mode === 'single') {
            // 단일 모델: DOM에서 직접 확인
            const singleModelValue = document.getElementById('routingSingleModel')?.value;
            if (!singleModelValue) {
              this.showSaveStatus('모델을 선택해주세요', 'error');
              return;
            }
          } else if (mode === 'auto') {
            // 라우터 AI: 라우터 모델 필수 (먼저 체크)
            const isRouterAI = manager === 'ai' || manager === 'router';
            const routerModelValue = document.getElementById('routingRouter')?.value;
            if (isRouterAI && !routerModelValue) {
              this.showSaveStatus('라우터 모델을 선택해주세요', 'error');
              return;
            }
            // 자동 라우팅: 티어별 모델 전부 필수
            const missingTiers = [];
            if (!document.getElementById('routingLight')?.value) missingTiers.push('경량');
            if (!document.getElementById('routingMedium')?.value) missingTiers.push('중간');
            if (!document.getElementById('routingHeavy')?.value) missingTiers.push('고성능');
            if (missingTiers.length > 0) {
              this.showSaveStatus(`${missingTiers.join(', ')} 모델을 선택해주세요`, 'error');
              return;
            }
          }

          brainWizard.dataset.confirmed = 'true';
          this.routingConfig.confirmed = true;
          this.saveRoutingSettings();
          this.updateTimelineProgress('brain');
        }
      });
    });

    // 수정하기 버튼 클릭 시
    const editBtn = container.querySelector('.brain-wizard-edit');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        if (brainWizard) {
          brainWizard.dataset.confirmed = 'false';
          this.routingConfig.confirmed = false;
          this.saveRoutingSettings({ silent: true });
        }
      });
    }

    // 모드나 라우터 변경 시 confirmed 리셋
    const resetConfirmed = () => {
      if (brainWizard) {
        brainWizard.dataset.confirmed = 'false';
        this.routingConfig.confirmed = false;
      }
    };
    brainModeRadios.forEach(radio => {
      radio.addEventListener('change', resetConfirmed);
    });
    routerTypeRadios.forEach(radio => {
      radio.addEventListener('change', resetConfirmed);
    });

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

    // 온보딩 카드 슬라이더 제거됨 (타임라인 뷰로 통합)


    // 통합 스토리지 설정 버튼
    const saveStorageBtn = container.querySelector('#saveStorageBtn');
    const resetStorageBtn = container.querySelector('#resetStorageBtn');
    const browseStorageBtn = container.querySelector('#browseStorageBtn');
    const closeFolderBrowser = container.querySelector('#closeFolderBrowser');
    const folderBrowserBack = container.querySelector('#folderBrowserBack');
    const folderBrowserSelect = container.querySelector('#folderBrowserSelect');

    // 저장소 타입 탭 이벤트
    const storageTypeTabs = container.querySelectorAll('.storage-type-tab');
    storageTypeTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const type = e.currentTarget.dataset.type;
        this.switchStorageType(type);
      });
    });

    // 연결 테스트 버튼들
    const testFtpBtn = container.querySelector('#testFtpBtn');
    const testOracleBtn = container.querySelector('#testOracleBtn');
    const testNotionBtn = container.querySelector('#testNotionBtn');
    const uploadWalletBtn = container.querySelector('#uploadWalletBtn');
    const oracleWalletFile = container.querySelector('#oracleWalletFile');

    if (testFtpBtn) {
      testFtpBtn.addEventListener('click', () => this.testFtpConnection());
    }
    if (testOracleBtn) {
      testOracleBtn.addEventListener('click', () => this.testOracleConnection());
    }
    if (testNotionBtn) {
      testNotionBtn.addEventListener('click', () => this.testNotionConnection());
    }
    if (uploadWalletBtn && oracleWalletFile) {
      uploadWalletBtn.addEventListener('click', () => oracleWalletFile.click());
      oracleWalletFile.addEventListener('change', (e) => this.uploadOracleWallet(e.target.files[0]));
    }

    if (saveStorageBtn) {
      saveStorageBtn.addEventListener('click', () => this.saveStorageSettings());
    }

    if (resetStorageBtn) {
      resetStorageBtn.addEventListener('click', () => this.resetStorageSettings());
    }

    if (browseStorageBtn) {
      browseStorageBtn.addEventListener('click', () => this.openFolderBrowser('storagePath'));
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

    // Oracle Wallet 상태 로드
    this.loadOracleWalletStatus();

    // 초기 타임라인 상태 설정 (저장된 값 반영)
    setTimeout(() => {
      container.querySelectorAll('.timeline-item').forEach(item => {
        const section = item.dataset.section;
        this.updateTimelineProgress(section);

        // 값이 모두 채워진 섹션은 접기
        const fields = item.querySelectorAll('.timeline-field');
        const allFilled = Array.from(fields).every(f => f.value.trim());
        if (allFilled && fields.length > 0) {
          item.classList.remove('expanded');
        }

        this.adjustCapsuleHeight(item, item.classList.contains('expanded'));
      });

      // 음성 요약 초기화
      this.updateVoiceSummary();
    }, 100);

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

    // 통합 목소리 선택
    const voiceSelect = container.querySelector('#voiceSelect');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => this.handleVoiceSelect(e.target.value));
    }

    // 알바 활성화 토글 (타임라인용)
    container.querySelectorAll('[data-action="toggle-alba-active"]').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const roleId = e.target.dataset.roleId;
        await this.toggleAlbaActive(roleId, e.target.checked);
      });
    });

    // 알바 수정 버튼 (타임라인용)
    container.querySelectorAll('[data-action="edit-alba"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const roleId = e.target.closest('[data-role-id]').dataset.roleId;
        this.editAlba(roleId);
      });
    });

    // 알바 삭제 버튼 (타임라인용)
    container.querySelectorAll('[data-action="delete-alba"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const roleId = e.target.closest('[data-role-id]').dataset.roleId;
        const role = this.availableRoles.find(r => r.roleId === roleId);
        if (role && confirm(`"${role.name}" 알바를 삭제하시겠습니까?`)) {
          await this.deleteAlba(roleId);
        }
      });
    });

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
    // serviceId를 숫자로 변환 (dataset에서 문자열로 오기 때문)
    const numericId = parseInt(serviceId, 10);

    try {
      const response = await this.apiClient.post(`/ai-services/${serviceId}/toggle`);

      // 서버 응답에서 실제 상태 가져오기
      const actualIsActive = response.isActive;

      // 성공 메시지 표시
      this.showSaveStatus(`서비스가 ${actualIsActive ? '활성화' : '비활성화'}되었습니다.`, 'success');

      // 로컬 서비스 데이터 업데이트
      const service = this.services.find(s => s.id === numericId || s.id === serviceId);
      if (service) {
        service.isActive = actualIsActive;
      }

      // 카드 상태 업데이트
      const card = document.querySelector(`.ai-service-card[data-service-id="${serviceId}"]`);
      if (card) {
        card.classList.toggle('active', actualIsActive);
        card.classList.toggle('inactive', !actualIsActive);

        // 카드 내 체크박스도 동기화
        const cardCheckbox = card.querySelector('input[data-action="toggle-active"]');
        if (cardCheckbox) {
          cardCheckbox.checked = actualIsActive;
        }
      }

      // 드롭다운의 체크박스도 동기화
      const dropdownCheckbox = document.querySelector(`.api-dropdown-content input[data-service-id="${serviceId}"][data-action="toggle-service"]`);
      if (dropdownCheckbox) {
        dropdownCheckbox.checked = actualIsActive;
      }

      // 캡슐 UI 실시간 업데이트
      this.updateCapsuleUI();

      // 활성화 시 API 키가 있는 서비스면 모델 새로고침
      if (actualIsActive && service) {
        const hasKey = service.type === 'vertex' ? !!service.projectId :
                       (service.serviceId === 'ollama' || service.type === 'ollama') ? true :
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
      const dropdownCheckbox = document.querySelector(`.api-dropdown-content input[data-service-id="${serviceId}"][data-action="toggle-service"]`);
      if (dropdownCheckbox) {
        dropdownCheckbox.checked = !isActive;
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

      // 모델 드롭다운 갱신
      this.collectAvailableModels();
      this.updateRoutingDropdowns();

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
        this.updateRoutingDropdowns();

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
    const singleSelect = document.getElementById('routingSingleModel');
    const routerSelect = document.getElementById('routingRouter');
    const lightSelect = document.getElementById('routingLight');
    const mediumSelect = document.getElementById('routingMedium');
    const heavySelect = document.getElementById('routingHeavy');

    const hasModels = this.availableModels.length > 0 && !this.availableModels[0].disabled;

    // 단일 모델 드롭다운 갱신
    if (singleSelect) {
      const savedValue = this.routingConfig.singleModel;
      singleSelect.innerHTML = this.renderModelOptions(savedValue);
      singleSelect.disabled = !hasModels;
      if (savedValue && singleSelect.querySelector(`option[value="${savedValue}"]`)) {
        singleSelect.value = savedValue;
      }
    }

    // 라우터 모델 드롭다운 갱신
    if (routerSelect) {
      const savedValue = this.routingConfig.managerModel;
      routerSelect.innerHTML = this.renderModelOptions(savedValue);
      routerSelect.disabled = !hasModels;
      if (savedValue && routerSelect.querySelector(`option[value="${savedValue}"]`)) {
        routerSelect.value = savedValue;
      }
    }

    // 티어별 모델 드롭다운 갱신
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
    return model ? { serviceId: model.serviceId, serviceName: model.service } : null;
  }


  /**
   * 라우팅 설정 저장 (서버로)
   */
  async saveRoutingSettings({ silent = false } = {}) {
    try {
      // 모드 확인 (단일/자동)
      const modeRadio = document.querySelector('input[name="brainMode"]:checked');
      const mode = modeRadio?.value || 'auto';

      // 단일 모델 설정 (빈 문자열은 null로)
      const singleModel = document.getElementById('routingSingleModel')?.value || null;
      const singleThinking = document.getElementById('thinkingSingle')?.checked || false;

      // 자동 라우팅 설정 (빈 문자열은 null로)
      const light = document.getElementById('routingLight')?.value || null;
      const medium = document.getElementById('routingMedium')?.value || null;
      const heavy = document.getElementById('routingHeavy')?.value || null;

      // 라우팅 담당 가져오기 (라디오 방식)
      const routerTypeRadio = document.querySelector('input[name="routerType"]:checked');
      const manager = routerTypeRadio?.value || 'server';

      // 라우터 모델 (AI 선택 시, 빈 문자열은 null로)
      const managerModel = document.getElementById('routingRouter')?.value || null;

      // 생각 토글 상태 가져오기
      const lightThinking = document.getElementById('thinkingLight')?.checked || false;
      const mediumThinking = document.getElementById('thinkingMedium')?.checked || false;
      const heavyThinking = document.getElementById('thinkingHeavy')?.checked || false;

      // 각 모델의 서비스 정보 찾기
      const singleService = singleModel ? this.findServiceByModelId(singleModel) : null;
      const lightService = this.findServiceByModelId(light);
      const mediumService = this.findServiceByModelId(medium);
      const heavyService = this.findServiceByModelId(heavy);
      const managerService = managerModel ? this.findServiceByModelId(managerModel) : null;

      // 서버에 저장할 데이터
      const routingData = {
        enabled: true,
        mode,  // 'single' 또는 'auto'
        // 단일 모델 설정
        singleModel: mode === 'single' ? { modelId: singleModel, serviceId: singleService?.serviceId || null, thinking: singleThinking, name: this.getModelDisplayName(singleModel) } : null,
        // 자동 라우팅 설정
        manager: mode === 'auto' ? manager : null,  // 라우팅 담당: server, ai
        managerModel: mode === 'auto' && manager === 'ai' ? { modelId: managerModel, serviceId: managerService?.serviceId || null } : null,
        light: light ? { modelId: light, serviceId: lightService?.serviceId || null, thinking: lightThinking } : null,
        medium: medium ? { modelId: medium, serviceId: mediumService?.serviceId || null, thinking: mediumThinking } : null,
        heavy: heavy ? { modelId: heavy, serviceId: heavyService?.serviceId || null, thinking: heavyThinking } : null,
        // 완성 상태
        confirmed: this.routingConfig.confirmed || false
      };

      // 서버 API로 저장
      await this.apiClient.put('/config/routing', routingData);

      // 로컬 상태 업데이트
      this.routingConfig = {
        mode,
        singleModel,
        singleThinking,
        manager,
        managerModel,
        light, medium, heavy,
        lightThinking, mediumThinking, heavyThinking,
        lightService: lightService?.serviceId,
        mediumService: mediumService?.serviceId,
        heavyService: heavyService?.serviceId,
        confirmed: this.routingConfig.confirmed || false
      };

      // localStorage에도 백업 저장
      localStorage.setItem('smartRoutingConfig', JSON.stringify(this.routingConfig));

      if (!silent) this.showSaveStatus('라우팅 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to save routing settings:', error);
      if (!silent) this.showSaveStatus('라우팅 설정 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 타임라인 프로그레스 업데이트
   */
  updateTimelineProgress(section) {
    const item = document.querySelector(`.timeline-item[data-section="${section}"]`);
    if (!item) return;

    // 두뇌 섹션은 별도 처리 (단계별 진행률)
    if (section === 'brain') {
      const mode = this.routingConfig.mode || '';
      // manager 값: 'server' 또는 'ai' (HTML radio value와 일치)
      const manager = this.routingConfig.manager || 'server';
      const isRouterAI = manager === 'ai' || manager === 'router'; // 둘 다 지원
      const isConfirmed = this.routingConfig.confirmed === true;

      let currentStep = 0;
      let totalSteps = 3; // 기본: 단일모델 (모드 → 모델선택 → 확인)

      if (mode === 'single') {
        // 단일모델: 모드선택(1) → 모델선택(2) → 확인(3)
        totalSteps = 3;
        currentStep = 1; // 모드 선택됨
        if (this.routingConfig.defaultModel) {
          currentStep = 2; // 모델 선택됨
        }
        if (isConfirmed) {
          currentStep = 3; // 확인됨
        }
      } else if (mode === 'auto') {
        // 티어 모델 개수 카운트 (전부 채워야 완료)
        let tierCount = 0;
        if (this.routingConfig.light) tierCount++;
        if (this.routingConfig.medium) tierCount++;
        if (this.routingConfig.heavy) tierCount++;
        const allTiersFilled = tierCount === 3;

        if (!isRouterAI) {
          // 자동+서버: 모드선택(1) → 라우팅방식(2) → 티어별모델(3) → 확인(4)
          totalSteps = 4;
          currentStep = 2; // 모드 + 라우팅방식 선택됨
          if (allTiersFilled) {
            currentStep = 3; // 티어별 모델 전부 선택됨
          }
          if (isConfirmed) {
            currentStep = 4; // 확인됨
          }
        } else {
          // 자동+라우터AI: 모드선택(1) → 라우팅방식(2) → 라우터모델(3) → 티어별모델(4) → 확인(5)
          totalSteps = 5;
          currentStep = 2; // 모드 + 라우팅방식 선택됨

          const hasRouter = !!this.routingConfig.managerModel;

          if (hasRouter) {
            currentStep = 3; // 라우터 모델 선택됨
          }
          if (hasRouter && allTiersFilled) {
            currentStep = 4; // 라우터 + 티어 전부 선택됨
          }
          if (isConfirmed) {
            currentStep = 5; // 확인됨
          }
        }
      } else {
        // 모드 미선택 상태
        totalSteps = 1;
        currentStep = 0;
      }

      const circumference = 62.83;
      const progress = totalSteps > 0 ? currentStep / totalSteps : 0;
      const offset = circumference * (1 - progress);

      const progressRing = item.querySelector('.progress-ring');
      const checkIcon = item.querySelector('.check-icon');

      if (progressRing) {
        progressRing.style.strokeDashoffset = offset;
      }
      if (checkIcon) {
        // 체크 아이콘은 확인 완료 시에만 표시
        checkIcon.style.opacity = isConfirmed ? '1' : '0';
      }

      return;
    }

    const fields = item.querySelectorAll('.timeline-field');
    const sliders = item.querySelectorAll('.timeline-range');

    // 텍스트 필드 + 슬라이더 모두 카운트
    const totalFields = fields.length + (sliders.length > 0 ? 1 : 0); // 슬라이더는 그룹으로 1개 취급
    let filledFields = 0;

    fields.forEach(field => {
      if (field.value.trim()) filledFields++;
    });

    // 슬라이더 중 unset이 아닌 것이 있으면 완료 처리
    const setSliders = Array.from(sliders).filter(s => !s.classList.contains('unset'));
    if (setSliders.length > 0) filledFields++;

    const progress = totalFields > 0 ? filledFields / totalFields : 0;
    const circumference = 62.83; // 2 * PI * r (r=10)
    const offset = circumference * (1 - progress);

    const progressRing = item.querySelector('.progress-ring');
    const checkIcon = item.querySelector('.check-icon');

    if (progressRing) {
      progressRing.style.strokeDashoffset = offset;
    }

    if (checkIcon) {
      checkIcon.style.opacity = progress >= 1 ? '1' : '0';
    }

    // 섹션 힌트 표시/숨김
    let hasTextValue = false;
    fields.forEach(field => {
      if (field.value.trim()) hasTextValue = true;
    });
    const sectionHint = item.querySelector('.section-empty-hint');

    // 성격 섹션은 별도 처리 (updatePersonalitySummary에서 관리)
    if (section === 'personality') {
      // 프롬프트 입력 또는 슬라이더 변경 시 힌트 숨김
      const hasSliderChanged = this.hasPersonalitySliderChanged();
      if (sectionHint) {
        sectionHint.style.display = (hasTextValue || hasSliderChanged) ? 'none' : '';
      }
      return;
    }

    if (sectionHint) {
      sectionHint.style.display = hasTextValue ? 'none' : '';
    }

    // 값들 수집 (입력 중에도 실시간 표시 - 모든 필드 포함)
    const summaryEl = item.querySelector('.timeline-summary:not(.timeline-summary--personality):not(.timeline-summary--brain):not(.timeline-summary--voice)');
    const allFieldValues = [];
    let hasAnyValue = false;
    fields.forEach(field => {
      const placeholder = field.getAttribute('placeholder') || '';
      const label = placeholder.split(' ')[0].replace(/[()]/g, '');
      const value = field.value.trim();
      allFieldValues.push({ label, value: value || '-' });
      if (value) hasAnyValue = true;
    });

    // summary 업데이트 또는 생성 - 하나라도 값이 있으면 모든 필드 표시
    if (hasAnyValue) {
      const summaryHtml = allFieldValues.map(v =>
        `<div><span class="summary-label">${v.label}</span><span class="summary-text">${v.value}</span></div>`
      ).join('');
      if (summaryEl) {
        summaryEl.innerHTML = summaryHtml;
      } else {
        const newSummary = document.createElement('div');
        newSummary.className = 'timeline-summary';
        newSummary.innerHTML = summaryHtml;
        item.querySelector('.timeline-content').appendChild(newSummary);
      }
    } else if (summaryEl) {
      summaryEl.innerHTML = '';
    }

    // DB 저장용 값 (빈 값 제외) - 저장은 별도 이벤트에서 처리
    item._timelineValues = allFieldValues.filter(v => v.value !== '-');
    item._timelineProgress = progress;

    // 100% 완료 시 캡슐 높이 조절
    if (progress >= 1) {
      setTimeout(() => {
        this.adjustCapsuleHeight(item);
      }, 50);
    }
  }

  /**
   * 타임라인 섹션 저장 트리거 (focusout 시 호출 - 100% 완료 시에만)
   */
  triggerTimelineSave(section) {
    const item = document.querySelector(`.timeline-item[data-section="${section}"]`);
    if (!item) return;

    // 100% 완료이고 값이 있을 때만 저장
    if (item._timelineProgress >= 1 && item._timelineValues?.length > 0) {
      this.saveTimelineSection(section, item._timelineValues);
    }
  }

  /**
   * 타임라인 섹션 직접 저장 (엔터 시 호출 - 빈 값도 저장)
   */
  saveTimelineSectionDirect(section) {
    const item = document.querySelector(`.timeline-item[data-section="${section}"]`);
    if (!item) return;

    // 필드에서 직접 값 수집 (빈 값도 포함)
    const fields = item.querySelectorAll('.timeline-field');
    const values = [];
    fields.forEach(field => {
      const placeholder = field.getAttribute('placeholder') || '';
      const label = placeholder.split(' ')[0].replace(/[()]/g, '');
      const value = field.value.trim();
      values.push({ label, value });
    });

    this.saveTimelineSection(section, values);
  }

  /**
   * 타임라인 섹션 DB 저장
   */
  async saveTimelineSection(section, values) {
    try {
      const profileId = this.agentProfile?.id || 'default';
      const updateData = {};

      if (section === 'identity') {
        values.forEach(v => {
          if (v.label === '이름') {
            updateData.name = v.value;
            // 아래 폼 동기화
            const soulName = document.getElementById('soulName');
            if (soulName) soulName.value = v.value;
          }
          if (v.label === '역할') {
            updateData.role = v.value;
            const soulRole = document.getElementById('soulRole');
            if (soulRole) soulRole.value = v.value;
          }
        });
      } else if (section === 'personality') {
        values.forEach(v => {
          // placeholder가 "성격과 말투를 설명해주세요"라서 label이 "성격과"
          updateData.description = v.value;
          const soulDesc = document.getElementById('soulDescription');
          if (soulDesc) soulDesc.value = v.value;
        });
      } else if (section === 'brain') {
        values.forEach(v => {
          updateData.defaultModel = v.value;
        });
      }

      if (Object.keys(updateData).length > 0) {
        await this.apiClient.put(`/profile/agent/${profileId}`, updateData);
        // 로컬 프로필 데이터도 업데이트
        Object.assign(this.agentProfile, updateData);
      } else {
        console.log('No data to save');
      }
    } catch (error) {
      console.error('Failed to save timeline section:', error);
    }
  }

  /**
   * 타임라인 슬라이더 값 저장
   */
  async saveTimelineSliderValue(section, field, value) {
    console.log('saveTimelineSliderValue:', { section, field, value });
    try {
      const profileId = this.agentProfile?.id || 'default';
      const updateData = {};

      if (section === 'personality') {
        // personality.communication 필드
        if (!this.agentProfile.personality) {
          this.agentProfile.personality = { communication: {}, traits: {} };
        }
        if (!this.agentProfile.personality.communication) {
          this.agentProfile.personality.communication = {};
        }
        if (!this.agentProfile.personality.traits) {
          this.agentProfile.personality.traits = {};
        }

        if (field === 'empathy') {
          this.agentProfile.personality.traits.empathetic = value;
          updateData.personality = this.agentProfile.personality;
        } else if (field === 'temperature') {
          // temperature는 personality 섹션에 있지만 별도 필드로 저장
          updateData.temperature = value;
          this.agentProfile.temperature = value;
        } else if (field === 'maxTokens') {
          // maxTokens도 personality 섹션에 있지만 별도 필드로 저장
          updateData.maxTokens = parseInt(value);
          this.agentProfile.maxTokens = parseInt(value);
        } else {
          this.agentProfile.personality.communication[field] = value;
          updateData.personality = this.agentProfile.personality;
        }

        // 기존 폼 슬라이더 동기화
        const sliderMap = {
          formality: 'soulFormality',
          verbosity: 'soulVerbosity',
          humor: 'soulHumor',
          empathy: 'soulEmpathy',
          temperature: 'soulCreativity'
        };
        const oldSlider = document.getElementById(sliderMap[field]);
        if (oldSlider) oldSlider.value = value;
      } else if (section === 'brain') {
        if (field === 'temperature') {
          updateData.temperature = value;
          this.agentProfile.temperature = value;
          const oldSlider = document.getElementById('soulCreativity');
          if (oldSlider) oldSlider.value = value;
        } else if (field === 'maxTokens') {
          updateData.maxTokens = value;
          this.agentProfile.maxTokens = value;
          const oldSlider = document.getElementById('soulMaxTokens');
          if (oldSlider) oldSlider.value = value;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await this.apiClient.put(`/profile/agent/${profileId}`, updateData);

        // 설정 변경 이벤트 발생 (즉시 반영)
        window.dispatchEvent(new CustomEvent('profile-updated', {
          detail: { section, field, value, profileId }
        }));
      }
    } catch (error) {
      console.error('Failed to save timeline slider value:', error);
    }
  }

  /**
   * 성격 요약 업데이트
   */
  updatePersonalitySummary() {
    const summary = document.querySelector('.timeline-summary--personality');
    if (!summary) return;

    const description = this.agentProfile?.description || '';
    const hasSliderChanged = this.hasPersonalitySliderChanged();

    let html = '';
    // 프롬프트 행 (값이 있을 때만)
    if (description) {
      const shortDesc = description.length > 20 ? description.substring(0, 20) + '...' : description;
      html += `<div><span class="summary-label">프롬프트</span><span class="summary-text">${shortDesc}</span></div>`;
    }

    // 세밀조절 행 (값이 있을 때만)
    if (hasSliderChanged) {
      html += `<div><span class="summary-label">세밀조절</span><span class="summary-text">확인</span></div>`;
    }

    summary.innerHTML = html;
  }

  /**
   * 성격 슬라이더가 기본값에서 변경되었는지 확인
   * unset 클래스가 없는 슬라이더만 "설정됨"으로 판단
   */
  hasPersonalitySliderChanged() {
    const sliders = document.querySelectorAll('.timeline-item[data-section="personality"] .timeline-range');
    for (const slider of sliders) {
      // unset 클래스가 없으면 사용자가 값을 설정한 것
      if (!slider.classList.contains('unset')) {
        return true;
      }
    }
    return false;
  }

  /**
   * 타임라인 셀렉트 값 저장
   */
  async saveTimelineSelectValue(section, field, value) {
    try {
      const profileId = this.agentProfile?.id || 'default';
      const updateData = {};

      if (section === 'brain' && field === 'defaultModel') {
        updateData.defaultModel = value;
        this.agentProfile.defaultModel = value;
      }

      if (Object.keys(updateData).length > 0) {
        await this.apiClient.put(`/profile/agent/${profileId}`, updateData);
      }
    } catch (error) {
      console.error('Failed to save timeline select value:', error);
    }
  }

  /**
   * 캡슐 높이 조절 (CSS align-self: stretch로 자동 처리됨)
   */
  adjustCapsuleHeight(item, expanded = false) {
    // CSS로 자동 처리
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

      // SQLite에 저장 (API 호출)
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

      // SQLite에 저장 (API 호출)
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
   * 저장소 타입 탭 전환
   */
  switchStorageType(type) {
    // 탭 활성화
    document.querySelectorAll('.storage-type-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.type === type);
    });

    // 패널 표시/숨김
    const panels = ['local', 'ftp', 'oracle', 'notion'];
    panels.forEach(panelType => {
      const panel = document.getElementById(`${panelType}StoragePanel`);
      if (panel) {
        panel.style.display = panelType === type ? 'block' : 'none';
      }
    });

    // 현재 선택된 타입 저장
    this.storageConfig.type = type;
  }

  /**
   * 마이그레이션 모달 표시
   */
  showMigrationModal(fromType, toType, onConfirm, onCancel) {
    const typeNames = { local: '로컬', ftp: 'FTP/NAS', oracle: 'Oracle', notion: 'Notion' };

    // 기존 모달 제거
    const existing = document.getElementById('migrationModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'migrationModal';
    modal.innerHTML = `
      <div class="migration-modal-overlay">
        <div class="migration-modal">
          <h3>📦 저장소 변경</h3>
          <p>모든 데이터(대화, 기억, 파일)를<br><strong>${typeNames[toType]}</strong>(으)로 이동하시겠습니까?</p>
          <p class="migration-info">현재: ${typeNames[fromType]} → 변경: ${typeNames[toType]}</p>
          <div class="migration-buttons">
            <button class="migration-btn migration-btn-cancel">취소</button>
            <button class="migration-btn migration-btn-confirm">확인</button>
          </div>
        </div>
      </div>
    `;

    // 스타일 추가
    const style = document.createElement('style');
    style.textContent = `
      .migration-modal-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
      }
      .migration-modal {
        background: var(--bg-secondary, #1e1e1e); border-radius: 12px;
        padding: 24px; max-width: 400px; text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      .migration-modal h3 { margin: 0 0 16px; font-size: 1.3em; }
      .migration-modal p { margin: 8px 0; color: var(--text-secondary, #aaa); }
      .migration-modal strong { color: var(--primary, #007aff); }
      .migration-info { font-size: 0.9em; opacity: 0.7; }
      .migration-buttons { margin-top: 20px; display: flex; gap: 12px; justify-content: center; }
      .migration-btn { padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 1em; }
      .migration-btn-cancel { background: var(--bg-tertiary, #333); color: var(--text-primary, #fff); }
      .migration-btn-confirm { background: var(--primary, #007aff); color: white; }
      .migration-progress { margin-top: 16px; }
      .migration-progress-bar { height: 6px; background: var(--bg-tertiary, #333); border-radius: 3px; overflow: hidden; }
      .migration-progress-fill { height: 100%; background: var(--primary, #007aff); transition: width 0.3s; }
      .migration-status { margin-top: 8px; font-size: 0.9em; color: var(--text-secondary, #aaa); }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);

    modal.querySelector('.migration-btn-cancel').onclick = () => {
      modal.remove();
      onCancel?.();
    };
    modal.querySelector('.migration-btn-confirm').onclick = () => {
      onConfirm?.(modal);
    };
  }

  /**
   * 마이그레이션 진행상황 표시
   */
  showMigrationProgress(modal, status, percent) {
    const content = modal.querySelector('.migration-modal');
    if (!content.querySelector('.migration-progress')) {
      content.querySelector('.migration-buttons').style.display = 'none';
      content.innerHTML += `
        <div class="migration-progress">
          <div class="migration-progress-bar"><div class="migration-progress-fill" style="width: 0%"></div></div>
          <div class="migration-status">준비 중...</div>
        </div>
      `;
    }
    content.querySelector('.migration-progress-fill').style.width = `${percent}%`;
    content.querySelector('.migration-status').textContent = status;
  }

  /**
   * 통합 스토리지 설정 저장
   */
  async saveStorageSettings() {
    try {
      const currentType = this.storageConfig.type;
      const typeNames = { local: '로컬', ftp: 'FTP/NAS', oracle: 'Oracle', notion: 'Notion' };

      // 저장소 타입이 변경되었는지 확인
      if (this.originalStorageType && currentType !== this.originalStorageType) {
        return new Promise((resolve) => {
          this.showMigrationModal(this.originalStorageType, currentType,
            async (modal) => {
              await this._performStorageMigration(currentType, modal);
              resolve();
            },
            () => resolve()
          );
        });
      }

      // 타입 변경 없으면 바로 저장
      await this._saveStorageConfig(currentType);
    } catch (error) {
      console.error('Failed to save storage settings:', error);
      this.showSaveStatus('저장소 설정 저장에 실패했습니다: ' + error.message, 'error');
    }
  }

  /**
   * 저장소 마이그레이션 수행
   */
  async _performStorageMigration(currentType, modal) {
    try {
      this.showMigrationProgress(modal, '설정 저장 중...', 10);
      await this._saveStorageConfig(currentType);

      this.showMigrationProgress(modal, '데이터 마이그레이션 중...', 30);

      // 서버에 마이그레이션 요청
      const response = await this.apiClient.post('/storage/migrate', {
        fromType: this.originalStorageType,
        toType: currentType
      });

      this.showMigrationProgress(modal, '연결 재설정 중...', 70);

      // 서버 재연결 대기
      await new Promise(r => setTimeout(r, 1000));

      this.showMigrationProgress(modal, '완료!', 100);

      await new Promise(r => setTimeout(r, 500));
      modal.remove();

      this.originalStorageType = currentType;
      this.showSaveStatus('✅ 저장소가 변경되었습니다. 페이지를 새로고침합니다...', 'success');

      // 페이지 새로고침
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      modal.remove();
      throw error;
    }
  }

  /**
   * 저장소 설정 저장 (내부)
   */
  async _saveStorageConfig(currentType) {
    try {

      // 저장소 설정 구성
      const config = { type: currentType };

      if (currentType === 'local') {
        config.path = document.getElementById('storagePath')?.value || '~/.soul';
      } else if (currentType === 'ftp') {
        const ftpConfig = {
          host: document.getElementById('ftpHost')?.value,
          port: parseInt(document.getElementById('ftpPort')?.value) || 21,
          user: document.getElementById('ftpUser')?.value,
          password: document.getElementById('ftpPassword')?.value,
          basePath: document.getElementById('ftpBasePath')?.value || '/soul'
        };
        if (!ftpConfig.host || !ftpConfig.user) {
          throw new Error('FTP 호스트와 사용자를 입력해주세요.');
        }
        config.ftp = ftpConfig;
      } else if (currentType === 'oracle') {
        const oracleConfig = {
          connectionString: document.getElementById('oracleConnectionString')?.value,
          user: document.getElementById('oracleUser')?.value,
          password: document.getElementById('oraclePassword')?.value,
          encryptionKey: document.getElementById('oracleEncryptionKey')?.value
        };
        if (!oracleConfig.connectionString || !oracleConfig.user) {
          throw new Error('Oracle 연결 문자열과 사용자를 입력해주세요.');
        }
        config.oracle = oracleConfig;
      } else if (currentType === 'notion') {
        const notionConfig = {
          token: document.getElementById('notionToken')?.value,
          databaseId: document.getElementById('notionDatabaseId')?.value
        };
        if (!notionConfig.token || !notionConfig.databaseId) {
          throw new Error('Notion 토큰과 Database ID를 입력해주세요.');
        }
        config.notion = notionConfig;
      }

      // API 호출
      await this.apiClient.put('/config/storage', config);

      // 원본 타입 업데이트
      this.originalStorageType = currentType;
      this.storageConfig = { ...this.storageConfig, ...config };

      this.showSaveStatus('✅ 저장소 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to save storage settings:', error);
      throw error;
    }
  }

  /**
   * FTP 연결 테스트
   */
  async testFtpConnection() {
    const resultEl = document.getElementById('ftpTestResult');
    if (resultEl) resultEl.textContent = '테스트 중...';

    try {
      const ftpConfig = {
        host: document.getElementById('ftpHost')?.value,
        port: parseInt(document.getElementById('ftpPort')?.value) || 21,
        user: document.getElementById('ftpUser')?.value,
        password: document.getElementById('ftpPassword')?.value,
        basePath: document.getElementById('ftpBasePath')?.value || '/soul'
      };

      const response = await this.apiClient.post('/storage/test-ftp', ftpConfig);
      if (resultEl) {
        resultEl.textContent = response.success ? '✅ 연결 성공' : '❌ 연결 실패';
        resultEl.className = 'test-result ' + (response.success ? 'success' : 'error');
      }
    } catch (error) {
      if (resultEl) {
        resultEl.textContent = '❌ ' + error.message;
        resultEl.className = 'test-result error';
      }
    }
  }

  /**
   * Oracle Wallet 업로드
   */
  async uploadOracleWallet(file) {
    if (!file) return;

    const statusEl = document.getElementById('walletStatus');
    if (statusEl) statusEl.textContent = '⏳ 업로드 중...';

    try {
      const formData = new FormData();
      formData.append('wallet', file);

      const response = await fetch('/api/storage/upload-oracle-wallet', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        if (statusEl) statusEl.textContent = '✅ 업로드됨';
        this.storageConfig.oracle = {
          ...this.storageConfig.oracle,
          walletUploaded: true
        };

        // TNS 드롭다운 업데이트
        this.updateTnsDropdown(result.tnsNames || []);

        // 팝업 없이 상태만 표시 (statusEl에 이미 ✅ 업로드됨 표시됨)
      } else {
        throw new Error(result.message || '업로드 실패');
      }
    } catch (error) {
      console.error('Wallet upload failed:', error);
      if (statusEl) statusEl.textContent = '❌ 실패';
      this.showSaveStatus('Wallet 업로드 실패: ' + error.message, 'error');
    }

    // 파일 입력 초기화
    const fileInput = document.getElementById('oracleWalletFile');
    if (fileInput) fileInput.value = '';
  }

  /**
   * TNS 드롭다운 업데이트
   */
  updateTnsDropdown(tnsNames, selectedValue = null) {
    const select = document.getElementById('oracleConnectionString');
    if (!select) return;

    const currentValue = selectedValue || this.storageConfig.oracle?.connectionString || '';

    select.innerHTML = tnsNames.length === 0
      ? '<option value="">-- Wallet 업로드 후 선택 --</option>'
      : '<option value="">-- 선택하세요 --</option>' +
        tnsNames.map(name => {
          const label = name.includes('_high') ? `${name} (고성능)` :
                        name.includes('_medium') ? `${name} (일반)` :
                        name.includes('_low') ? `${name} (저비용)` :
                        name.includes('_tp') ? `${name} (트랜잭션)` : name;
          return `<option value="${name}" ${name === currentValue ? 'selected' : ''}>${label}</option>`;
        }).join('');
  }

  /**
   * Oracle Wallet 상태 로드
   */
  async loadOracleWalletStatus() {
    try {
      const response = await fetch('/api/storage/oracle-wallet-status');
      const result = await response.json();

      if (result.success && result.uploaded) {
        const statusEl = document.getElementById('walletStatus');
        if (statusEl) statusEl.textContent = '✅ 업로드됨';

        this.updateTnsDropdown(result.tnsNames || [], this.storageConfig.oracle?.connectionString);
      }
    } catch (error) {
      console.error('Failed to load wallet status:', error);
    }
  }

  /**
   * Oracle 연결 테스트
   */
  async testOracleConnection() {
    const resultEl = document.getElementById('oracleTestResult');
    if (resultEl) resultEl.textContent = '테스트 중...';

    try {
      const oracleConfig = {
        connectionString: document.getElementById('oracleConnectionString')?.value,
        user: document.getElementById('oracleUser')?.value,
        password: document.getElementById('oraclePassword')?.value
      };

      const response = await this.apiClient.post('/storage/oracle/test', oracleConfig);
      if (resultEl) {
        resultEl.textContent = response.success ? '✅ 연결 성공' : '❌ 연결 실패';
        resultEl.className = 'test-result ' + (response.success ? 'success' : 'error');
      }
    } catch (error) {
      if (resultEl) {
        resultEl.textContent = '❌ ' + error.message;
        resultEl.className = 'test-result error';
      }
    }
  }

  /**
   * Notion 연결 테스트
   */
  async testNotionConnection() {
    const resultEl = document.getElementById('notionTestResult');
    if (resultEl) resultEl.textContent = '테스트 중...';

    try {
      const notionConfig = {
        token: document.getElementById('notionToken')?.value,
        databaseId: document.getElementById('notionDatabaseId')?.value
      };

      const response = await this.apiClient.post('/storage/test-notion', notionConfig);
      if (resultEl) {
        resultEl.textContent = response.success ? '✅ 연결 성공' : '❌ 연결 실패';
        resultEl.className = 'test-result ' + (response.success ? 'success' : 'error');
      }
    } catch (error) {
      if (resultEl) {
        resultEl.textContent = '❌ ' + error.message;
        resultEl.className = 'test-result error';
      }
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
   * 통합 저장소 설정 초기화
   */
  async resetStorageSettings() {
    if (!confirm('저장소 설정을 기본값(로컬 ~/.soul)으로 되돌리시겠습니까?')) {
      return;
    }

    try {
      // 기본값으로 초기화
      await this.apiClient.put('/config/storage', {
        type: 'local',
        path: '~/.soul'
      });

      this.storageConfig = {
        type: 'local',
        path: '~/.soul',
        ftp: null,
        oracle: null,
        notion: null
      };
      this.originalStorageType = 'local';

      this.showSaveStatus('저장소 설정이 초기화되었습니다.', 'success');

      // UI 새로고침
      const container = document.querySelector('.ai-settings-panel').parentElement;
      await this.render(container, this.apiClient);
    } catch (error) {
      console.error('Failed to reset storage settings:', error);
      this.showSaveStatus('저장소 설정 초기화에 실패했습니다.', 'error');
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

      // 로컬 데이터 즉시 업데이트
      const role = this.availableRoles.find(r => r.roleId === roleId);
      if (role) {
        role.preferredModel = model;
        // 해당 알바 아이템의 모델 라벨만 업데이트
        const albaItem = document.querySelector(`.alba-item[data-role-id="${roleId}"]`);
        if (albaItem) {
          const modelLabel = albaItem.querySelector('.alba-model-label');
          if (modelLabel) {
            const shortName = this._shortModelName(model) || '자동 선택';
            modelLabel.textContent = shortName;
          }
        }
      }

      // 역할 변경 이벤트 발생 (즉시 반영)
      window.dispatchEvent(new CustomEvent('role-updated', {
        detail: { roleId, field: 'preferredModel', value: model }
      }));

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
   * 시스템 알바 편집 (간소화: 이름 + 모델만)
   */
  async editSystemAlba(roleId, role) {
    const existingModal = document.querySelector('.alba-modal-overlay');
    if (existingModal) existingModal.remove();

    const rawConfig = role.config || {};
    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    const currentServiceId = config.serviceId || '';
    const isEmbedding = config.purpose === 'embedding';
    const hasChainSupport = false;

    // 임베딩 알바는 임베딩 모델 전용 드롭다운
    const modelFieldHtml = isEmbedding
      ? `<div class="alba-modal-field">
              <label>사용 모델</label>
              <select id="albaEmbeddingModel" class="alba-modal-select">
                <option value="${role.preferredModel || ''}" selected>${role.preferredModel || '로딩중...'}</option>
              </select>
              <div style="font-size:10px;color:rgba(0,0,0,0.4);margin-top:4px;">OpenRouter 임베딩 모델 목록</div>
            </div>`
      : `<div class="alba-modal-field">
              <label>사용 모델</label>
              <select id="albaModel" class="alba-modal-select">
                ${this.renderModelOptions(role.preferredModel, true)}
              </select>
            </div>`;

    const modalHtml = `
      <div class="alba-modal-overlay">
        <div class="alba-modal">
          <div class="alba-modal-header">
            <h3>${role.name} 설정</h3>
            <button type="button" class="alba-modal-close">&times;</button>
          </div>
          <div class="alba-modal-body">
            <div class="alba-system-badge">ON: AI 모델이 처리 &nbsp;|&nbsp; OFF: 간단 규칙으로 동작</div>
            <div class="alba-modal-field">
              <label>이름</label>
              <input type="text" id="albaName" value="${role.name || ''}" />
            </div>
            ${modelFieldHtml}
            ${hasChainSupport ? `
            <div class="alba-modal-field" id="albaFallbackSection">
              <label>체인 단계 <span class="field-hint">(실패 시 순서대로 시도)</span></label>
              <div class="alba-chain-steps" id="albaFallbackSteps">
                ${(config.fallbackModels || []).map((fb, idx) => `
                  <div class="alba-chain-step">
                    <div class="step-header">
                      <span class="step-num">${idx + 1}</span>
                      <select class="alba-modal-select alba-fallback-model">${this.renderModelOptions(fb.modelId, true)}</select>
                      <button type="button" class="alba-fallback-remove">&times;</button>
                    </div>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="alba-chain-add-btn" id="addFallbackStep">+ 모델 추가</button>
            </div>
            ` : ''}
            ${role.description ? `
            <div class="alba-modal-field">
              <label>설명</label>
              <div style="font-size:13px;color:rgba(0,0,0,0.55);padding:4px 0;line-height:1.5;">${role.description}</div>
            </div>` : ''}
            <div class="alba-modal-field">
              <label class="alba-toggle-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;">
                <input type="checkbox" id="albaCallableByAI" ${config.callableByAI ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                <span style="font-size:13px;">소울이가 대화 중 이 알바를 호출할 수 있음</span>
              </label>
              <div style="font-size:11px;color:rgba(0,0,0,0.4);margin-left:24px;">활성화하면 소울이가 call_worker 도구로 이 알바를 직접 호출합니다</div>
            </div>
            <div class="alba-modal-field">
              <label>메모</label>
              <textarea id="albaMemo" rows="3" placeholder="모델 선택 이유, 설정 참고사항 등" style="width:100%;resize:vertical;font-size:13px;padding:8px;border:1px solid rgba(0,0,0,0.15);border-radius:6px;font-family:inherit;">${(role.memo || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            </div>
            <div class="alba-modal-field alba-stats-section" id="albaStatsSection">
              <label>실시간 통계 <span class="field-hint">(서버 시작 이후)</span></label>
              <div class="alba-stats-loading" style="font-size:12px;color:rgba(0,0,0,0.4);padding:8px 0;">로딩 중...</div>
            </div>
          </div>
          <div class="alba-modal-footer">
            <div class="alba-modal-footer-right">
              <button type="button" class="alba-modal-btn alba-modal-cancel">취소</button>
              <button type="button" class="alba-modal-btn alba-modal-confirm">저장</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 실시간 통계 로드
    this._loadAlbaLiveStats(roleId);

    const overlay = document.querySelector('.alba-modal-overlay');
    const closeBtn = overlay.querySelector('.alba-modal-close');
    const cancelBtn = overlay.querySelector('.alba-modal-cancel');
    const confirmBtn = overlay.querySelector('.alba-modal-confirm');

    // 임베딩 모델 목록 비동기 로드
    if (isEmbedding) {
      this.loadEmbeddingModels(role.preferredModel);
    }

    // 체인 지원 알바: fallback 모델 추가/삭제
    if (hasChainSupport) {
      const addFallbackBtn = overlay.querySelector('#addFallbackStep');
      if (addFallbackBtn) {
        addFallbackBtn.addEventListener('click', () => {
          const stepsContainer = overlay.querySelector('#albaFallbackSteps');
          const count = stepsContainer.querySelectorAll('.alba-chain-step').length;
          const stepHtml = `
            <div class="alba-chain-step">
              <div class="step-header">
                <span class="step-num">${count + 1}</span>
                <select class="alba-modal-select alba-fallback-model">${this.renderModelOptions(null, true)}</select>
                <button type="button" class="alba-fallback-remove">&times;</button>
              </div>
            </div>`;
          stepsContainer.insertAdjacentHTML('beforeend', stepHtml);
        });
      }

      // fallback 모델 삭제 (이벤트 위임)
      const fallbackSteps = overlay.querySelector('#albaFallbackSteps');
      if (fallbackSteps) {
        fallbackSteps.addEventListener('click', (e) => {
          if (e.target.classList.contains('alba-fallback-remove')) {
            e.target.closest('.alba-chain-step').remove();
            // 번호 재정렬
            fallbackSteps.querySelectorAll('.step-num').forEach((num, i) => { num.textContent = i + 1; });
          }
        });
      }
    }

    const closeModal = () => overlay.remove();
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    confirmBtn.addEventListener('click', async () => {
      const name = document.getElementById('albaName').value.trim();
      let preferredModel;
      let serviceId = currentServiceId;

      if (isEmbedding) {
        // 임베딩: 드롭다운에서 모델명 + serviceId 추출
        const embSelect = document.getElementById('albaEmbeddingModel');
        preferredModel = embSelect ? embSelect.value : '';
        const embOption = embSelect?.options[embSelect.selectedIndex];
        const embOptgroup = embOption?.closest('optgroup');
        if (embOptgroup) {
          const label = embOptgroup.label.toLowerCase();
          if (label.includes('openrouter')) serviceId = 'openrouter';
          else if (label.includes('openai')) serviceId = 'openai';
          else if (label.includes('google')) serviceId = 'google';
        }
      } else {
        // 일반: 드롭다운에서 모델 + serviceId 추출
        const modelSelect = document.getElementById('albaModel');
        preferredModel = modelSelect.value;

        const selectedOption = modelSelect.options[modelSelect.selectedIndex];
        const optgroup = selectedOption?.closest('optgroup');
        if (optgroup) {
          const groupLabel = optgroup.label.toLowerCase();
          if (groupLabel.includes('openrouter')) serviceId = 'openrouter';
          else if (groupLabel.includes('claude') || groupLabel.includes('anthropic')) serviceId = 'anthropic';
          else if (groupLabel.includes('openai')) serviceId = 'openai';
          else if (groupLabel.includes('google') || groupLabel.includes('gemini')) serviceId = 'google';
          else if (groupLabel.includes('xai') || groupLabel.includes('grok')) serviceId = 'xai';
          else if (groupLabel.includes('ollama')) serviceId = 'ollama';
          else if (groupLabel.includes('hugging')) serviceId = 'huggingface';
          else if (groupLabel.includes('fireworks')) serviceId = 'fireworks';
          else if (groupLabel.includes('deepseek')) serviceId = 'deepseek';
          else if (groupLabel.includes('qwen') || groupLabel.includes('alibaba')) serviceId = 'qwen';
        }
      }

      const callableByAI = document.getElementById('albaCallableByAI')?.checked || false;
      const updatedConfig = { ...config, serviceId, callableByAI };

      try {
        // 체인 지원 알바: fallback 모델 수집
        if (hasChainSupport) {
          const fallbackModels = Array.from(overlay.querySelectorAll('.alba-fallback-model')).map(select => {
            const opt = select.options[select.selectedIndex];
            const optgroup = opt?.closest('optgroup');
            let fbServiceId = 'openrouter';
            if (optgroup) {
              const gl = optgroup.label.toLowerCase();
              if (gl.includes('openrouter')) fbServiceId = 'openrouter';
              else if (gl.includes('claude') || gl.includes('anthropic')) fbServiceId = 'anthropic';
              else if (gl.includes('openai')) fbServiceId = 'openai';
              else if (gl.includes('google') || gl.includes('gemini')) fbServiceId = 'google';
              else if (gl.includes('xai') || gl.includes('grok')) fbServiceId = 'xai';
              else if (gl.includes('ollama')) fbServiceId = 'ollama';
              else if (gl.includes('hugging')) fbServiceId = 'huggingface';
              else if (gl.includes('fireworks')) fbServiceId = 'fireworks';
              else if (gl.includes('deepseek')) fbServiceId = 'deepseek';
              else if (gl.includes('qwen') || gl.includes('alibaba')) fbServiceId = 'qwen';
            }
            return { modelId: select.value, serviceId: fbServiceId };
          }).filter(fb => fb.modelId);
          updatedConfig.fallbackModels = fallbackModels;
        }

        const memo = document.getElementById('albaMemo')?.value?.trim() || '';
        await this.apiClient.patch(`/roles/${roleId}`, {
          name,
          preferredModel,
          memo,
          config: JSON.stringify(updatedConfig)
        });
        this.showSaveStatus('저장되었습니다.', 'success');
        overlay.remove();
        await this.loadAvailableRoles();
      } catch (error) {
        console.error('시스템 역할 수정 실패:', error);
        this.showSaveStatus('저장에 실패했습니다.', 'error');
      }
    });
  }

  /**
   * 알바 실시간 통계 로드 (모달 내)
   */
  async _loadAlbaLiveStats(roleId) {
    const section = document.getElementById('albaStatsSection');
    if (!section) return;

    try {
      const res = await this.apiClient.get(`/roles/${roleId}/stats/live`);
      const stats = res?.stats;
      const embedStats = res?.embedStats;
      const lastCall = res?.lastCall;

      if ((!stats || stats.totalCalls === 0) && !lastCall) {
        section.querySelector('.alba-stats-loading').innerHTML =
          '<div style="font-size:12px;color:rgba(0,0,0,0.35);padding:6px 0;">호출 기록 없음</div>';
        return;
      }

      // 실시간 통계 없지만 DB 마지막 호출은 있는 경우
      if ((!stats || stats.totalCalls === 0) && lastCall) {
        const statusIcon = lastCall.success ? '✓' : '✗';
        const statusColor = lastCall.success ? '#4caf50' : '#f44336';
        const timeStr = lastCall.at ? this._timeAgo(lastCall.at) : '';
        section.querySelector('.alba-stats-loading').innerHTML = `
          <div style="font-size:12px;padding:6px 0;">
            <div style="color:rgba(0,0,0,0.5);margin-bottom:4px;">마지막 호출</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="color:${statusColor};font-weight:600;">${statusIcon}</span>
              <span>${timeStr}</span>
              ${lastCall.model ? `<span style="color:rgba(0,0,0,0.4)">${this._shortModelName(lastCall.model)}</span>` : ''}
              ${lastCall.latencyMs ? `<span style="color:rgba(0,0,0,0.35)">${lastCall.latencyMs}ms</span>` : ''}
            </div>
            ${lastCall.detail ? `<div style="color:rgba(0,0,0,0.35);font-size:11px;margin-top:2px;">${lastCall.detail}</div>` : ''}
          </div>
        `;
        return;
      }

      // 작업별 통계
      const actionRows = Object.entries(stats.actions || {}).map(([action, data]) =>
        `<div class="alba-stat-row">
          <span class="alba-stat-label">${this._formatActionName(action)}</span>
          <span class="alba-stat-value">${data.calls}회 / ~${this._formatTokens(data.tokens)}</span>
        </div>`
      ).join('');

      // 최근 호출 (최대 5건)
      const recentRows = (stats.recentCalls || []).slice(-5).reverse().map(call => {
        const time = new Date(call.at);
        const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}`;
        const statusIcon = call.success ? '✓' : '✗';
        const statusColor = call.success ? '#4caf50' : '#f44336';
        return `<div class="alba-stat-recent">
          <span style="color:${statusColor};font-weight:600;">${statusIcon}</span>
          <span>${timeStr}</span>
          <span>${this._formatActionName(call.action)}</span>
          ${call.latencyMs ? `<span style="color:rgba(0,0,0,0.4)">${call.latencyMs}ms</span>` : ''}
        </div>`;
      }).join('');

      section.querySelector('.alba-stats-loading').innerHTML = `
        <div class="alba-stats-grid">
          <div class="alba-stat-card">
            <div class="alba-stat-num">${stats.totalCalls}</div>
            <div class="alba-stat-desc">총 호출</div>
          </div>
          <div class="alba-stat-card">
            <div class="alba-stat-num">${this._formatTokens(stats.totalTokens)}</div>
            <div class="alba-stat-desc">추정 토큰</div>
          </div>
          <div class="alba-stat-card">
            <div class="alba-stat-num">${stats.avgLatencyMs}ms</div>
            <div class="alba-stat-desc">평균 속도</div>
          </div>
          <div class="alba-stat-card">
            <div class="alba-stat-num">${stats.successRate}%</div>
            <div class="alba-stat-desc">성공률</div>
          </div>
        </div>
        ${actionRows ? `<div class="alba-stat-actions"><div style="font-size:11px;color:rgba(0,0,0,0.4);margin-bottom:4px;">작업별</div>${actionRows}</div>` : ''}
        ${recentRows ? `<div class="alba-stat-recent-list"><div style="font-size:11px;color:rgba(0,0,0,0.4);margin-bottom:4px;">최근 호출</div>${recentRows}</div>` : ''}
      `;
    } catch (e) {
      section.querySelector('.alba-stats-loading').innerHTML =
        '<div style="font-size:12px;color:rgba(0,0,0,0.35);">통계 로드 실패</div>';
    }
  }

  _formatActionName(action) {
    const map = {
      'chunk-analyze': '청크 분석',
      'summary-merge': '요약 통합',
      'digest-embed': '다이제스트 임베딩',
      'digest-dedup': '중복 체크',
      'recall-search': '기억 검색',
      'ingest-jsonl': 'JSONL 적재',
      'ingest-day': '일간 적재',
      'tool-select': '도구 선별',
      'unknown': '기타'
    };
    return map[action] || action;
  }

  _formatTokens(n) {
    if (!n || n === 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  _timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return '방금';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }

  /**
   * 임베딩 모델 목록 로드 (활성 서비스별)
   */
  async loadEmbeddingModels(currentModel) {
    try {
      const response = await this.apiClient.get('/chat/embedding-models');
      const groups = response?.groups || [];
      const select = document.getElementById('albaEmbeddingModel');
      if (!select) return;

      select.innerHTML = '';
      let totalModels = 0;
      let foundCurrent = false;

      // 서비스별 optgroup으로 모델 표시
      for (const group of groups) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.service;

        for (const m of group.models) {
          const option = document.createElement('option');
          option.value = m.id;
          const ctxInfo = m.context_length ? ` (${(m.context_length / 1000).toFixed(0)}k)` : '';
          option.textContent = `${m.name}${ctxInfo}`;
          if (m.id === currentModel) {
            option.selected = true;
            foundCurrent = true;
          }
          optgroup.appendChild(option);
          totalModels++;
        }

        select.appendChild(optgroup);
      }

      // 현재 모델이 목록에 없으면 맨 위에 추가
      if (currentModel && !foundCurrent) {
        const customOpt = document.createElement('option');
        customOpt.value = currentModel;
        customOpt.textContent = `${currentModel} (커스텀)`;
        customOpt.selected = true;
        select.insertBefore(customOpt, select.firstChild);
      }

      // 모델이 하나도 없으면
      if (totalModels === 0 && !currentModel) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '활성 서비스에 임베딩 모델이 없습니다';
        select.appendChild(emptyOpt);
      }
    } catch (error) {
      console.warn('임베딩 모델 로드 실패:', error);
    }
  }

  /**
   * 알바 편집
   */
  async editAlba(roleId) {
    const role = this.availableRoles.find(r => r.roleId === roleId);
    if (!role) return;

    // 시스템 역할이면 간소화 모달
    if (role.isSystem) {
      return this.editSystemAlba(roleId, role);
    }

    // 기존 모달 제거
    const existingModal = document.querySelector('.alba-modal-overlay');
    if (existingModal) existingModal.remove();

    // 체인/병렬 데이터 파싱
    let chainSteps = [];
    let parallelModels = [];
    try {
      if (role.chainSteps) chainSteps = typeof role.chainSteps === 'string' ? JSON.parse(role.chainSteps) : role.chainSteps;
      if (role.parallelModels) parallelModels = typeof role.parallelModels === 'string' ? JSON.parse(role.parallelModels) : role.parallelModels;
    } catch (e) {}

    const mode = role.mode || 'single';

    const modalHtml = `
      <div class="alba-modal-overlay">
        <div class="alba-modal">
          <div class="alba-modal-header">
            <h3>알바 수정</h3>
            <button type="button" class="alba-modal-close">&times;</button>
          </div>
          <div class="alba-modal-body">
            <div class="alba-modal-field">
              <label>이름</label>
              <input type="text" id="albaName" value="${role.name || ''}" placeholder="예: 문서 요약가, 코드 리뷰어" />
            </div>
            <div class="alba-modal-field">
              <label>설명</label>
              <input type="text" id="albaDesc" value="${role.description || ''}" placeholder="예: 긴 문서를 핵심만 간결하게 요약" />
            </div>
            <div class="alba-modal-field">
              <label>작동 방식</label>
              <div class="alba-modal-radios">
                <label class="alba-modal-radio">
                  <input type="radio" name="albaMode" value="single" ${mode === 'single' ? 'checked' : ''} />
                  <span>단일 모델</span>
                </label>
                <label class="alba-modal-radio">
                  <input type="radio" name="albaMode" value="chain" ${mode === 'chain' ? 'checked' : ''} />
                  <span>체인 (순차 진행)</span>
                </label>
                <label class="alba-modal-radio">
                  <input type="radio" name="albaMode" value="parallel" ${mode === 'parallel' ? 'checked' : ''} />
                  <span>병렬 (동시 진행)</span>
                </label>
              </div>
            </div>
            <div class="alba-modal-field alba-mode-single-field" style="${mode !== 'single' ? 'display:none' : ''}">
              <label>사용 모델</label>
              <select id="albaModel" class="alba-modal-select">
                ${this.renderModelOptions(role.preferredModel, true)}
              </select>
            </div>
            <div class="alba-modal-field alba-mode-single-prompt" style="${mode !== 'single' ? 'display:none' : ''}">
              <label>업무 (시스템 프롬프트)</label>
              <textarea id="albaPrompt" rows="4" placeholder="예: 당신은 문서 요약 전문가입니다.">${role.systemPrompt || ''}</textarea>
            </div>
            <div class="alba-modal-field alba-mode-chain-field" style="${mode !== 'chain' ? 'display:none' : ''}">
              <label>체인 단계 <span class="field-hint">(순서대로 실행)</span></label>
              <div class="alba-chain-steps" id="albaChainSteps">
                ${chainSteps.length > 0 ? chainSteps.map((step, idx) => `
                  <div class="alba-chain-step">
                    <div class="step-header">
                      <span class="step-num">${idx + 1}</span>
                      <select class="alba-modal-select alba-chain-model">${this.renderModelOptions(step.model, true)}</select>
                      <button type="button" class="alba-chain-remove" ${chainSteps.length <= 1 ? 'disabled' : ''}>&times;</button>
                    </div>
                    <input type="text" class="alba-chain-role" value="${step.role || ''}" placeholder="예: 초안 작성자" />
                    <textarea class="alba-chain-prompt" rows="2" placeholder="예: 주어진 주제로 초안을 작성하세요">${step.prompt || ''}</textarea>
                  </div>
                `).join('') : `
                  <div class="alba-chain-step">
                    <div class="step-header">
                      <span class="step-num">1</span>
                      <select class="alba-modal-select alba-chain-model">${this.renderModelOptions(null, true)}</select>
                      <button type="button" class="alba-chain-remove" disabled>&times;</button>
                    </div>
                    <input type="text" class="alba-chain-role" placeholder="예: 초안 작성자" />
                    <textarea class="alba-chain-prompt" rows="2" placeholder="예: 주어진 주제로 초안을 작성하세요"></textarea>
                  </div>
                `}
              </div>
              <button type="button" class="alba-chain-add-btn" id="addChainStep">+ 단계 추가</button>
            </div>
            <div class="alba-modal-field alba-mode-parallel-field" style="${mode !== 'parallel' ? 'display:none' : ''}">
              <label>병렬 모델 <span class="field-hint">(동시에 실행 후 결과 종합)</span></label>
              <div class="alba-parallel-models" id="albaParallelModels">
                ${parallelModels.length > 0 ? parallelModels.map(pm => `
                  <div class="alba-parallel-item">
                    <div class="parallel-header">
                      <span class="parallel-icon">+</span>
                      <select class="alba-modal-select alba-parallel-model">${this.renderModelOptions(pm.model, true)}</select>
                      <button type="button" class="alba-parallel-remove" ${parallelModels.length <= 1 ? 'disabled' : ''}>&times;</button>
                    </div>
                    <input type="text" class="alba-parallel-role" value="${pm.role || ''}" placeholder="예: 창의적 관점" />
                    <textarea class="alba-parallel-prompt" rows="2" placeholder="예: 창의적이고 독창적인 아이디어를 제시하세요">${pm.prompt || ''}</textarea>
                  </div>
                `).join('') : `
                  <div class="alba-parallel-item">
                    <div class="parallel-header">
                      <span class="parallel-icon">+</span>
                      <select class="alba-modal-select alba-parallel-model">${this.renderModelOptions(null, true)}</select>
                      <button type="button" class="alba-parallel-remove" disabled>&times;</button>
                    </div>
                    <input type="text" class="alba-parallel-role" placeholder="예: 창의적 관점" />
                    <textarea class="alba-parallel-prompt" rows="2" placeholder="예: 창의적이고 독창적인 아이디어를 제시하세요"></textarea>
                  </div>
                `}
              </div>
              <button type="button" class="alba-parallel-add-btn" id="addParallelModel">+ 모델 추가</button>
            </div>
            <div class="alba-modal-row">
              <div class="alba-modal-field alba-trigger-field">
                <label>트리거 키워드 <span class="field-hint">(쉼표/엔터)</span></label>
                <input type="text" id="albaTriggers" value="${(role.triggers || []).join(', ')}" placeholder="예: 요약, summarize, 정리" />
              </div>
              <div class="alba-modal-field alba-tokens-field">
                <label>Max Tokens</label>
                <input type="number" id="albaMaxTokens" value="${role.maxTokens || 4096}" min="256" max="32000" />
              </div>
            </div>
          </div>
          <div class="alba-modal-footer alba-modal-footer-edit">
            <button type="button" class="alba-modal-btn alba-modal-delete" data-role-id="${roleId}">삭제</button>
            <div class="alba-modal-footer-right">
              <button type="button" class="alba-modal-btn alba-modal-cancel">취소</button>
              <button type="button" class="alba-modal-btn alba-modal-confirm">확인</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.attachEditAlbaModalEvents(roleId);
  }

  /**
   * 수정 모달 이벤트 연결
   */
  attachEditAlbaModalEvents(roleId) {
    const overlay = document.querySelector('.alba-modal-overlay');
    const closeBtn = overlay.querySelector('.alba-modal-close');
    const cancelBtn = overlay.querySelector('.alba-modal-cancel');
    const confirmBtn = overlay.querySelector('.alba-modal-confirm');
    const deleteBtn = overlay.querySelector('.alba-modal-delete');
    const modeRadios = overlay.querySelectorAll('input[name="albaMode"]');
    const addChainBtn = overlay.querySelector('#addChainStep');
    const addParallelBtn = overlay.querySelector('#addParallelModel');

    // 닫기
    const closeModal = () => overlay.remove();
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // 삭제
    deleteBtn.addEventListener('click', async () => {
      if (confirm('이 알바를 삭제하시겠습니까?')) {
        await this.deleteAlba(roleId);
        overlay.remove();
      }
    });

    // 모드 변경
    modeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const mode = radio.value;
        overlay.querySelector('.alba-mode-single-field').style.display = mode === 'single' ? '' : 'none';
        overlay.querySelector('.alba-mode-single-prompt').style.display = mode === 'single' ? '' : 'none';
        overlay.querySelector('.alba-mode-chain-field').style.display = mode === 'chain' ? '' : 'none';
        overlay.querySelector('.alba-mode-parallel-field').style.display = mode === 'parallel' ? '' : 'none';
      });
    });

    // 체인 단계 추가
    addChainBtn.addEventListener('click', () => {
      const container = overlay.querySelector('#albaChainSteps');
      const stepNum = container.children.length + 1;
      const stepHtml = `
        <div class="alba-chain-step">
          <div class="step-header">
            <span class="step-num">${stepNum}</span>
            <select class="alba-modal-select alba-chain-model">${this.renderModelOptions(null, true)}</select>
            <button type="button" class="alba-chain-remove">&times;</button>
          </div>
          <input type="text" class="alba-chain-role" placeholder="예: 검토자" />
          <textarea class="alba-chain-prompt" rows="2" placeholder="이 단계의 업무를 설명하세요..."></textarea>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', stepHtml);
      this.updateChainRemoveButtons(container);
    });

    // 병렬 모델 추가
    addParallelBtn.addEventListener('click', () => {
      const container = overlay.querySelector('#albaParallelModels');
      const itemHtml = `
        <div class="alba-parallel-item">
          <div class="parallel-header">
            <span class="parallel-icon">+</span>
            <select class="alba-modal-select alba-parallel-model">${this.renderModelOptions(null, true)}</select>
            <button type="button" class="alba-parallel-remove">&times;</button>
          </div>
          <input type="text" class="alba-parallel-role" placeholder="예: 비판적 관점" />
          <textarea class="alba-parallel-prompt" rows="2" placeholder="이 모델의 업무를 설명하세요..."></textarea>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', itemHtml);
      this.updateParallelRemoveButtons(container);
    });

    // 삭제 버튼 위임
    overlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('alba-chain-remove')) {
        const step = e.target.closest('.alba-chain-step');
        const container = step.parentElement;
        step.remove();
        this.renumberChainSteps(container);
        this.updateChainRemoveButtons(container);
      }
      if (e.target.classList.contains('alba-parallel-remove')) {
        const item = e.target.closest('.alba-parallel-item');
        const container = item.parentElement;
        item.remove();
        this.updateParallelRemoveButtons(container);
      }
    });

    // 확인 (수정 저장)
    confirmBtn.addEventListener('click', () => this.submitEditAlbaModal(overlay, roleId));
  }

  /**
   * 수정 모달 제출
   */
  async submitEditAlbaModal(overlay, roleId) {
    const name = overlay.querySelector('#albaName').value.trim();
    const description = overlay.querySelector('#albaDesc').value.trim();
    const mode = overlay.querySelector('input[name="albaMode"]:checked').value;
    const systemPrompt = overlay.querySelector('#albaPrompt').value.trim();
    const maxTokens = parseInt(overlay.querySelector('#albaMaxTokens').value) || 4096;
    const triggersRaw = overlay.querySelector('#albaTriggers').value;
    const triggers = triggersRaw.split(/[,\n]/).map(t => t.trim()).filter(t => t);

    if (!name) {
      this.showSaveStatus('이름을 입력해주세요.', 'error');
      return;
    }

    const updateData = {
      name,
      description,
      mode,
      systemPrompt: mode === 'single' ? systemPrompt : null,
      maxTokens,
      triggers
    };

    // 모드별 추가 데이터
    if (mode === 'single') {
      updateData.preferredModel = overlay.querySelector('#albaModel').value;
    } else if (mode === 'chain') {
      const chainSteps = Array.from(overlay.querySelectorAll('.alba-chain-step')).map(step => ({
        model: step.querySelector('.alba-chain-model').value,
        role: step.querySelector('.alba-chain-role').value.trim(),
        prompt: step.querySelector('.alba-chain-prompt').value.trim()
      })).filter(s => s.model);
      updateData.chainSteps = JSON.stringify(chainSteps);
    } else if (mode === 'parallel') {
      const parallelModels = Array.from(overlay.querySelectorAll('.alba-parallel-item')).map(item => ({
        model: item.querySelector('.alba-parallel-model').value,
        role: item.querySelector('.alba-parallel-role').value.trim(),
        prompt: item.querySelector('.alba-parallel-prompt').value.trim()
      })).filter(p => p.model);
      updateData.parallelModels = JSON.stringify(parallelModels);
    }

    try {
      await this.apiClient.patch(`/roles/${roleId}`, updateData);
      overlay.remove();
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
   * 알바 추가 모달 열기
   */
  addAlba() {
    // 기존 모달 제거
    const existingModal = document.querySelector('.alba-modal-overlay');
    if (existingModal) existingModal.remove();

    const modalHtml = `
      <div class="alba-modal-overlay">
        <div class="alba-modal">
          <div class="alba-modal-header">
            <h3>새 알바 추가</h3>
            <button type="button" class="alba-modal-close">&times;</button>
          </div>
          <div class="alba-modal-body">
            <div class="alba-modal-field">
              <label>이름</label>
              <input type="text" id="albaName" placeholder="예: 문서 요약가, 코드 리뷰어" />
            </div>
            <div class="alba-modal-field">
              <label>설명</label>
              <input type="text" id="albaDesc" placeholder="예: 긴 문서를 핵심만 간결하게 요약" />
            </div>
            <div class="alba-modal-field">
              <label>작동 방식</label>
              <div class="alba-modal-radios">
                <label class="alba-modal-radio">
                  <input type="radio" name="albaMode" value="single" checked />
                  <span>단일 모델</span>
                </label>
                <label class="alba-modal-radio">
                  <input type="radio" name="albaMode" value="chain" />
                  <span>체인 (순차 진행)</span>
                </label>
                <label class="alba-modal-radio">
                  <input type="radio" name="albaMode" value="parallel" />
                  <span>병렬 (동시 진행)</span>
                </label>
              </div>
            </div>
            <div class="alba-modal-field alba-mode-single-field">
              <label>사용 모델</label>
              <select id="albaModel" class="alba-modal-select">
                ${this.renderModelOptions(null, true)}
              </select>
            </div>
            <div class="alba-modal-field alba-mode-single-prompt">
              <label>업무 (시스템 프롬프트)</label>
              <textarea id="albaPrompt" rows="4" placeholder="예: 당신은 문서 요약 전문가입니다.&#10;- 핵심 포인트 3-5개로 정리&#10;- 불필요한 세부사항 제거&#10;- 명확하고 이해하기 쉽게"></textarea>
            </div>
            <div class="alba-modal-field alba-mode-chain-field" style="display:none;">
              <label>체인 단계 <span class="field-hint">(순서대로 실행)</span></label>
              <div class="alba-chain-steps" id="albaChainSteps">
                <div class="alba-chain-step">
                  <div class="step-header">
                    <span class="step-num">1</span>
                    <select class="alba-modal-select alba-chain-model">${this.renderModelOptions(null, true)}</select>
                    <button type="button" class="alba-chain-remove" disabled>&times;</button>
                  </div>
                  <input type="text" class="alba-chain-role" placeholder="예: 초안 작성자" />
                  <textarea class="alba-chain-prompt" rows="2" placeholder="예: 주어진 주제로 초안을 작성하세요"></textarea>
                </div>
              </div>
              <button type="button" class="alba-chain-add-btn" id="addChainStep">+ 단계 추가</button>
            </div>
            <div class="alba-modal-field alba-mode-parallel-field" style="display:none;">
              <label>병렬 모델 <span class="field-hint">(동시에 실행 후 결과 종합)</span></label>
              <div class="alba-parallel-models" id="albaParallelModels">
                <div class="alba-parallel-item">
                  <div class="parallel-header">
                    <span class="parallel-icon">+</span>
                    <select class="alba-modal-select alba-parallel-model">${this.renderModelOptions(null, true)}</select>
                    <button type="button" class="alba-parallel-remove" disabled>&times;</button>
                  </div>
                  <input type="text" class="alba-parallel-role" placeholder="예: 창의적 관점" />
                  <textarea class="alba-parallel-prompt" rows="2" placeholder="예: 창의적이고 독창적인 아이디어를 제시하세요"></textarea>
                </div>
              </div>
              <button type="button" class="alba-parallel-add-btn" id="addParallelModel">+ 모델 추가</button>
            </div>
            <div class="alba-modal-row">
              <div class="alba-modal-field alba-trigger-field">
                <label>트리거 키워드 <span class="field-hint">(쉼표/엔터)</span></label>
                <input type="text" id="albaTriggers" placeholder="예: 요약, summarize, 정리" />
              </div>
              <div class="alba-modal-field alba-tokens-field">
                <label>Max Tokens</label>
                <input type="number" id="albaMaxTokens" value="4096" min="256" max="32000" />
              </div>
            </div>
          </div>
          <div class="alba-modal-footer">
            <button type="button" class="alba-modal-btn alba-modal-cancel">취소</button>
            <button type="button" class="alba-modal-btn alba-modal-confirm">확인</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.attachAlbaModalEvents();
  }

  /**
   * 알바 모달 이벤트 연결
   */
  attachAlbaModalEvents() {
    const overlay = document.querySelector('.alba-modal-overlay');
    const closeBtn = overlay.querySelector('.alba-modal-close');
    const cancelBtn = overlay.querySelector('.alba-modal-cancel');
    const confirmBtn = overlay.querySelector('.alba-modal-confirm');
    const modeRadios = overlay.querySelectorAll('input[name="albaMode"]');
    const addChainBtn = overlay.querySelector('#addChainStep');
    const addParallelBtn = overlay.querySelector('#addParallelModel');

    // 닫기 (X 버튼, 취소 버튼만)
    const closeModal = () => overlay.remove();
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // 모드 변경
    modeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const mode = radio.value;
        overlay.querySelector('.alba-mode-single-field').style.display = mode === 'single' ? '' : 'none';
        overlay.querySelector('.alba-mode-single-prompt').style.display = mode === 'single' ? '' : 'none';
        overlay.querySelector('.alba-mode-chain-field').style.display = mode === 'chain' ? '' : 'none';
        overlay.querySelector('.alba-mode-parallel-field').style.display = mode === 'parallel' ? '' : 'none';
      });
    });

    // 체인 단계 추가
    addChainBtn.addEventListener('click', () => {
      const container = overlay.querySelector('#albaChainSteps');
      const stepNum = container.children.length + 1;
      const stepHtml = `
        <div class="alba-chain-step">
          <div class="step-header">
            <span class="step-num">${stepNum}</span>
            <select class="alba-modal-select alba-chain-model">${this.renderModelOptions(null, true)}</select>
            <button type="button" class="alba-chain-remove">&times;</button>
          </div>
          <input type="text" class="alba-chain-role" placeholder="역할 (예: 검토자)" />
          <textarea class="alba-chain-prompt" rows="2" placeholder="이 단계의 업무를 설명하세요..."></textarea>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', stepHtml);
      this.updateChainRemoveButtons(container);
    });

    // 병렬 모델 추가
    addParallelBtn.addEventListener('click', () => {
      const container = overlay.querySelector('#albaParallelModels');
      const itemHtml = `
        <div class="alba-parallel-item">
          <div class="parallel-header">
            <span class="parallel-icon">+</span>
            <select class="alba-modal-select alba-parallel-model">${this.renderModelOptions(null, true)}</select>
            <button type="button" class="alba-parallel-remove">&times;</button>
          </div>
          <input type="text" class="alba-parallel-role" placeholder="역할 (예: 비판적 관점)" />
          <textarea class="alba-parallel-prompt" rows="2" placeholder="이 모델의 업무를 설명하세요..."></textarea>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', itemHtml);
      this.updateParallelRemoveButtons(container);
    });

    // 삭제 버튼 위임
    overlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('alba-chain-remove')) {
        const step = e.target.closest('.alba-chain-step');
        const container = step.parentElement;
        step.remove();
        this.renumberChainSteps(container);
        this.updateChainRemoveButtons(container);
      }
      if (e.target.classList.contains('alba-parallel-remove')) {
        const item = e.target.closest('.alba-parallel-item');
        const container = item.parentElement;
        item.remove();
        this.updateParallelRemoveButtons(container);
      }
    });

    // 확인
    confirmBtn.addEventListener('click', () => this.submitAlbaModal(overlay));
  }

  updateChainRemoveButtons(container) {
    const btns = container.querySelectorAll('.alba-chain-remove');
    btns.forEach(btn => btn.disabled = btns.length <= 1);
  }

  updateParallelRemoveButtons(container) {
    const btns = container.querySelectorAll('.alba-parallel-remove');
    btns.forEach(btn => btn.disabled = btns.length <= 1);
  }

  renumberChainSteps(container) {
    container.querySelectorAll('.alba-chain-step').forEach((step, idx) => {
      step.querySelector('.step-num').textContent = idx + 1;
    });
  }

  /**
   * 알바 모달 제출
   */
  async submitAlbaModal(overlay) {
    const name = overlay.querySelector('#albaName').value.trim();
    const description = overlay.querySelector('#albaDesc').value.trim();
    const mode = overlay.querySelector('input[name="albaMode"]:checked').value;
    const systemPrompt = overlay.querySelector('#albaPrompt').value.trim();
    const maxTokens = parseInt(overlay.querySelector('#albaMaxTokens').value) || 4096;
    const triggersRaw = overlay.querySelector('#albaTriggers').value;
    const triggers = triggersRaw.split(/[,\n]/).map(t => t.trim()).filter(t => t);

    if (!name) {
      this.showSaveStatus('이름을 입력해주세요.', 'error');
      return;
    }

    const roleId = `custom-${Date.now()}`;
    const roleData = {
      roleId,
      name,
      description,
      mode,
      systemPrompt: systemPrompt || `당신은 ${name}입니다.\n${description}`,
      maxTokens,
      triggers: triggers.length > 0 ? triggers : [name.toLowerCase()],
      createdBy: 'user',
      category: 'other'
    };

    // 모드별 추가 데이터
    if (mode === 'single') {
      roleData.preferredModel = overlay.querySelector('#albaModel').value;
    } else if (mode === 'chain') {
      const chainSteps = Array.from(overlay.querySelectorAll('.alba-chain-step')).map(step => ({
        model: step.querySelector('.alba-chain-model').value,
        role: step.querySelector('.alba-chain-role').value.trim(),
        prompt: step.querySelector('.alba-chain-prompt').value.trim()
      })).filter(s => s.model);
      roleData.chainSteps = chainSteps;
      roleData.systemPrompt = null; // 체인 모드는 각 단계별 프롬프트 사용
    } else if (mode === 'parallel') {
      const parallelModels = Array.from(overlay.querySelectorAll('.alba-parallel-item')).map(item => ({
        model: item.querySelector('.alba-parallel-model').value,
        role: item.querySelector('.alba-parallel-role').value.trim(),
        prompt: item.querySelector('.alba-parallel-prompt').value.trim()
      })).filter(p => p.model);
      roleData.parallelModels = parallelModels;
      roleData.systemPrompt = null; // 병렬 모드는 각 모델별 프롬프트 사용
    }

    try {
      await this.apiClient.post('/roles', roleData);
      overlay.remove();
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

  /**
   * 음성 모델 옵션 렌더링 (TTS/STT 지원 모델만)
   */

  /**
   * 서비스 라벨 가져오기
   */
  getServiceLabel(serviceId) {
    const labels = {
      'anthropic': 'Anthropic',
      'openai': 'OpenAI',
      'google': 'Google',
      'cartesia': 'Cartesia',
      'huggingface': 'HuggingFace',
      'xai': 'xAI',
      'openrouter': 'OpenRouter',
      'lightning': 'Lightning AI',
      'fireworks': 'Fireworks AI',
      'deepseek': 'DeepSeek',
      'qwen': 'Alibaba Qwen',
      'together': 'Together AI',
      'ollama': 'Ollama',
      'vertex': 'Vertex AI'
    };
    return labels[serviceId] || serviceId;
  }

  /**
   * 음성 모델 저장
   */
  /**
   * 통합 목소리 드롭다운 렌더링
   */
  renderVoiceOptions() {
    if (!this.ttsModels || this.ttsModels.length === 0) {
      return '<option value="">TTS 모델 로딩 중...</option>';
    }

    let html = '<option value="">모델 선택</option>';

    // 서비스별로 그룹화
    const grouped = {};
    this.ttsModels.forEach(model => {
      if (!grouped[model.service]) {
        grouped[model.service] = {
          label: model.serviceLabel,
          models: []
        };
      }
      grouped[model.service].models.push(model);
    });

    // 각 서비스별로 optgroup 생성
    for (const [serviceId, group] of Object.entries(grouped)) {
      html += `<optgroup label="${group.label}">`;

      group.models.forEach(model => {
        html += `<option value="${model.id}">${model.name}</option>`;
      });

      html += '</optgroup>';
    }

    return html;
  }

  /**
   * 모델 선택 핸들러
   */
  handleVoiceSelect(value) {
    const detailFields = document.getElementById('cartesiaDetailFields');

    if (!value) {
      if (detailFields) detailFields.style.display = 'none';
      this.voiceConfig = {};
      this.updateVoiceSummary();
      this.saveVoiceConfig();
      return;
    }

    if (value === 'cartesia:custom') {
      // 기존 cartesia 설정이 없을 때만 초기화
      if (!this.voiceConfig?.cartesia || this.voiceConfig.service !== 'cartesia') {
        this.voiceConfig = {
          service: 'cartesia',
          cartesia: {}
        };
      }
      // 폼 렌더링 (DOM 생성 + 이벤트 바인딩)
      this.restoreCartesiaFields();
    } else {
      // 다른 서비스 모델 선택 → 폼 숨기고 저장
      if (detailFields) detailFields.style.display = 'none';

      const [service, modelId] = value.split(':');
      this.voiceConfig = {
        service: service,
        model: modelId
      };

      this.updateVoiceSummary();
      this.saveVoiceConfig();
    }
  }

  /**
   * Cartesia 필드 변경 핸들러 (통합)
   */
  handleCartesiaModelChange(value) { this.handleCartesiaFieldChange('model', value); }
  handleCartesiaVoiceChange(value) { this.handleCartesiaFieldChange('voice', value); }

  handleCartesiaFieldChange(fieldName, value) {
    if (!this.voiceConfig) this.voiceConfig = { service: 'cartesia' };
    if (!this.voiceConfig.cartesia) this.voiceConfig.cartesia = {};

    this.voiceConfig.cartesia[fieldName] = value;

    // UI 업데이트: has-value + 디스플레이 텍스트
    const inputId = `cartesia${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}Input`;
    const input = document.getElementById(inputId);
    if (input) {
      const field = input.closest('.neu-field');
      if (field) {
        if (value && value.trim()) {
          field.classList.add('has-value');
        } else {
          field.classList.remove('has-value');
        }
        const valueSpan = field.querySelector('.neu-field-value');
        if (valueSpan) valueSpan.textContent = value || '';
      }
    }

    this.saveVoiceConfig();
    this.updateVoiceSummary();
  }

  /**
   * TTS 모델 목록 로드
   */
  async loadTTSModels() {
    try {
      const response = await fetch('/api/tts/tts-models');
      if (!response.ok) {
        this.ttsModels = [];
        return;
      }

      const data = await response.json();
      this.ttsModels = data.models || [];
    } catch (error) {
      console.error('Failed to load TTS models:', error);
      this.ttsModels = [];
    }
  }

  /**
   * Cartesia voice 목록 로드
   */
  async loadCartesiaVoices() {
    try {
      const response = await fetch('/api/tts/voices?service=cartesia');

      if (!response.ok) {
        throw new Error('Cartesia voice 목록을 가져올 수 없습니다.');
      }

      const data = await response.json();
      const voices = data.voices || [];

      // Voice 드롭다운 업데이트
      const voiceSelect = document.getElementById('cartesiaVoiceSelect');
      if (voiceSelect) {
        voiceSelect.innerHTML = '<option value="">선택...</option>' +
          voices.map(v => `<option value="${v.id}">${v.name}${v.description ? ` - ${v.description}` : ''}</option>`).join('');

        // 기존 선택값 복원
        if (this.voiceConfig?.cartesia?.voice) {
          voiceSelect.value = this.voiceConfig.cartesia.voice;
        }
      }
    } catch (error) {
      console.error('Failed to load Cartesia voices:', error);
    }
  }

  /**
   * 음성 설정 저장
   */
  async saveVoiceConfig(showNotification = false) {
    try {
      const response = await fetch('/api/config/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceConfig: this.voiceConfig })
      });

      if (!response.ok) {
        throw new Error('음성 설정에 실패했습니다.');
      }

      // 타임라인 요약 및 진행률 업데이트
      this.updateVoiceSummary();
      this.updateTimelineProgress('voice');

      if (showNotification) {
        this.showSaveStatus('음성 설정이 저장되었습니다.', 'success');
      }
    } catch (error) {
      console.error('Failed to save voice config:', error);
      this.showSaveStatus('음성 설정 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * 웹검색 API 키 저장
   */
  /**
   * 사용자 프로필 로드
   */
  async loadUserProfile() {
    try {
      const response = await fetch('/api/profile');
      if (!response.ok) return;

      this.profile = await response.json();
    } catch (error) {
      console.error('Failed to load user profile:', error);
      this.profile = { language: 'ko' }; // 기본값
    }
  }

  /**
   * 음성 설정 로드
   */
  async loadVoiceConfig() {
    try {
      // 현재 설정된 음성 설정 로드
      const response = await fetch('/api/config/preferences');
      if (!response.ok) return;

      const config = await response.json();
      this.voiceConfig = config.voiceConfig || {};

      // UI에 설정 반영
      const voiceSelect = document.getElementById('voiceSelect');
      const detailFields = document.getElementById('cartesiaDetailFields');

      if (voiceSelect && this.voiceConfig.service) {
        if (this.voiceConfig.service === 'cartesia' && this.voiceConfig.cartesia) {
          // Cartesia 복원
          voiceSelect.value = 'cartesia:custom';
          if (detailFields) {
            detailFields.style.display = 'block';
          }
        } else if (this.voiceConfig.model) {
          // 다른 서비스 모델 복원
          voiceSelect.value = `${this.voiceConfig.service}:${this.voiceConfig.model}`;
          if (detailFields) {
            detailFields.style.display = 'none';
          }
        }
      }

      // 초기 로드 후 요약 업데이트
      this.updateVoiceSummary();
    } catch (error) {
      console.error('Failed to load voice config:', error);
    }
  }

  /**
   * Cartesia 필드 복원 (DOM 생성 후 실행)
   */
  /**
   * Cartesia WebSocket 폼 렌더링 + 복원
   * 정체성 섹션과 동일한 soul-form 패턴
   */
  /**
   * Cartesia WebSocket 폼 렌더링
   */
  restoreCartesiaFields() {
    const soulForm = document.getElementById('cartesiaSoulForm');
    if (!soulForm) return;

    const isCartesia = this.voiceConfig?.service === 'cartesia';

    if (isCartesia) {
      const voiceSelect = document.getElementById('voiceSelect');
      const detailFields = document.getElementById('cartesiaDetailFields');
      if (voiceSelect) voiceSelect.value = 'cartesia:custom';
      if (detailFields) detailFields.style.display = 'block';
    }

    const cart = this.voiceConfig?.cartesia || {};

    // model_id: 텍스트 입력 (soul-form 패턴)
    const modelVal = cart.model || '';
    const modelHasValue = modelVal ? 'has-value' : '';

    // voice: 드롭다운 (API에서 불러오기)
    const voiceVal = cart.voice || '';

    // language: 드롭다운
    const langVal = cart.language || this.profile?.language || 'ko';
    const languages = [
      { value: 'ko', label: '한국어' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
      { value: 'zh', label: '中文' },
      { value: 'fr', label: 'Français' },
      { value: 'de', label: 'Deutsch' },
    ];

    // speed: 숫자 배율 (0.6 ~ 1.5, 기본 1.0)
    const speedVal = cart.speed || '1.0';
    const speeds = [
      { value: '0.6', label: '0.6x 매우 느림' },
      { value: '0.8', label: '0.8x 느림' },
      { value: '1.0', label: '1.0x 보통' },
      { value: '1.2', label: '1.2x 빠름' },
      { value: '1.5', label: '1.5x 매우 빠름' },
    ];

    // volume: 숫자 배율 (0.5 ~ 2.0, 기본 1.0)
    const volumeVal = cart.volume || '1.0';
    const volumes = [
      { value: '0.5', label: '0.5x 매우 작게' },
      { value: '0.75', label: '0.75x 작게' },
      { value: '1.0', label: '1.0x 보통' },
      { value: '1.5', label: '1.5x 크게' },
      { value: '2.0', label: '2.0x 매우 크게' },
    ];

    // voiceTags: 음성 태그 (배열)
    const voiceTagsList = cart.voiceTags || ['laughter'];
    const availableVoiceTags = [
      { value: 'laughter', label: '웃음 [laughter]' },
      { value: 'sigh', label: '한숨 [sigh]', upcoming: true },
      { value: 'cough', label: '기침 [cough]', upcoming: true },
    ];

    // emotion: 감정 (beta)
    const emotionVal = cart.emotion || 'neutral';
    const emotions = [
      { value: 'neutral', label: '기본' },
      { value: 'happy', label: '행복' },
      { value: 'excited', label: '신남' },
      { value: 'calm', label: '차분' },
      { value: 'content', label: '만족' },
      { value: 'curious', label: '호기심' },
      { value: 'affectionate', label: '다정' },
      { value: 'sad', label: '슬픔' },
      { value: 'angry', label: '화남' },
      { value: 'scared', label: '공포' },
      { value: 'sarcastic', label: '비꼼' },
      { value: 'surprised', label: '놀람' },
    ];

    const langOptions = languages.map(l =>
      `<option value="${l.value}" ${l.value === langVal ? 'selected' : ''}>${l.label}</option>`
    ).join('');

    const speedOptions = speeds.map(s =>
      `<option value="${s.value}" ${s.value === speedVal ? 'selected' : ''}>${s.label}</option>`
    ).join('');

    const volumeOptions = volumes.map(v =>
      `<option value="${v.value}" ${v.value === volumeVal ? 'selected' : ''}>${v.label}</option>`
    ).join('');

    const emotionOptions = emotions.map(e =>
      `<option value="${e.value}" ${e.value === emotionVal ? 'selected' : ''}>${e.label}</option>`
    ).join('');

    let html = `
      <div class="neu-field has-badge ${modelHasValue}">
        <span class="cartesia-badge cartesia-badge--required">필수</span>
        <div class="neu-field-body">
          <div class="neu-field-display">
            <span class="neu-field-title">model_id : </span>
            <span class="neu-field-value">${modelVal}</span>
          </div>
          <input type="text" class="neu-field-input" id="cartesiaModelInput" placeholder="model_id" value="${modelVal}">
        </div>
      </div>

      <div class="neu-field has-badge ${voiceVal ? 'has-value' : ''}">
        <span class="cartesia-badge cartesia-badge--required">필수</span>
        <div class="neu-field-body">
          <div class="neu-field-display">
            <span class="neu-field-title">voice : </span>
            <span class="neu-field-value" id="cartesiaVoiceLabel">로딩...</span>
          </div>
          <select class="neu-field-input" id="cartesiaVoiceSelect">
            <option value="">목소리 선택</option>
          </select>
        </div>
      </div>

      <div class="neu-field has-badge has-value">
        <span class="cartesia-badge cartesia-badge--required">필수</span>
        <div class="neu-field-body">
          <div class="neu-field-display">
            <span class="neu-field-title">language : </span>
            <span class="neu-field-value">${languages.find(l => l.value === langVal)?.label || langVal}</span>
          </div>
          <select class="neu-field-input" id="cartesiaLanguageSelect">
            ${langOptions}
          </select>
        </div>
      </div>

      <div class="cartesia-advanced-toggle" id="cartesiaAdvancedToggle">고급 설정</div>
      <div class="cartesia-advanced-panel" id="cartesiaAdvancedPanel" style="display: none;">
        <div class="neu-field has-badge has-value">
          <span class="cartesia-badge cartesia-badge--optional">선택</span>
          <div class="neu-field-body">
            <div class="neu-field-display">
              <span class="neu-field-title">speed : </span>
              <span class="neu-field-value">${speeds.find(s => s.value === speedVal)?.label || speedVal}</span>
            </div>
            <select class="neu-field-input" id="cartesiaSpeedSelect">
              ${speedOptions}
            </select>
          </div>
        </div>

        <div class="neu-field has-badge has-value">
          <span class="cartesia-badge cartesia-badge--optional">선택</span>
          <div class="neu-field-body">
            <div class="neu-field-display">
              <span class="neu-field-title">volume : </span>
              <span class="neu-field-value">${volumes.find(v => v.value === volumeVal)?.label || volumeVal}</span>
            </div>
            <select class="neu-field-input" id="cartesiaVolumeSelect">
              ${volumeOptions}
            </select>
          </div>
        </div>

        <div class="neu-field has-badge has-value">
          <span class="cartesia-badge cartesia-badge--optional">선택</span>
          <div class="neu-field-body">
            <div class="neu-field-display">
              <span class="neu-field-title">emotion : </span>
              <span class="neu-field-value">${emotions.find(e => e.value === emotionVal)?.label || emotionVal}</span>
            </div>
            <select class="neu-field-input" id="cartesiaEmotionSelect">
              ${emotionOptions}
            </select>
          </div>
        </div>

        <div class="cartesia-voice-tags-row">
          <span class="cartesia-badge cartesia-badge--optional">선택</span>
          <div class="cartesia-voice-tags-body">
            <span class="cartesia-voice-tags-title">음성 태그</span>
            <div class="cartesia-voice-tags-checkboxes" id="cartesiaVoiceTagsGroup">
              ${availableVoiceTags.map(tag => `
                <label class="cartesia-voice-tag-label${tag.upcoming ? ' upcoming' : ''}">
                  <input type="checkbox" value="${tag.value}" ${voiceTagsList.includes(tag.value) ? 'checked' : ''} ${tag.upcoming ? 'disabled' : ''}>
                  <span>${tag.label}${tag.upcoming ? ' (예정)' : ''}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="cartesia-btn-group">
        <button type="button" class="cartesia-btn cartesia-btn--preview" id="cartesiaPreviewBtn">목소리 미리듣기</button>
        <button type="button" class="cartesia-btn cartesia-btn--save" id="cartesiaSaveBtn">저장</button>
      </div>`;

    soulForm.innerHTML = html;
    this.attachCartesiaEvents();

    // 즉시 요약 업데이트 (model, language는 동기적으로 표시 가능)
    this.updateVoiceSummary();

    // 목소리 목록 로드 (완료 후 voice 이름 포함하여 요약 재업데이트)
    this.loadCartesiaVoices(voiceVal);
  }

  /**
   * Cartesia 이벤트 바인딩
   */
  attachCartesiaEvents() {
    // model_id 텍스트 입력
    const modelInput = document.getElementById('cartesiaModelInput');
    if (modelInput) {
      modelInput.addEventListener('focus', (e) => { e.target.dataset.originalValue = e.target.value; });
      modelInput.addEventListener('blur', (e) => {
        const value = e.target.value.trim();
        if (value !== (e.target.dataset.originalValue || '')) {
          this.handleCartesiaFieldChange('model', value);
        }
      });
      modelInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      });
    }

    // voice 드롭다운
    const voiceSelect = document.getElementById('cartesiaVoiceSelect');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        const label = e.target.selectedOptions[0]?.text || '';
        this.handleCartesiaFieldChange('voice', value);
        const voiceLabel = document.getElementById('cartesiaVoiceLabel');
        if (voiceLabel) voiceLabel.textContent = label || '선택 안됨';
        const field = e.target.closest('.neu-field');
        if (field) {
          field.classList.remove('editing');
          if (value) { field.classList.add('has-value'); }
          else { field.classList.remove('has-value'); }
        }
      });
    }

    // language 드롭다운
    const langSelect = document.getElementById('cartesiaLanguageSelect');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        const label = e.target.selectedOptions[0]?.text || '';
        this.handleCartesiaFieldChange('language', value);
        const valueSpan = e.target.closest('.neu-field')?.querySelector('.neu-field-value');
        if (valueSpan) valueSpan.textContent = label;
        const field = e.target.closest('.neu-field');
        if (field) field.classList.remove('editing');
      });
    }

    // speed 드롭다운
    const speedSelect = document.getElementById('cartesiaSpeedSelect');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        const label = e.target.selectedOptions[0]?.text || '';
        this.handleCartesiaFieldChange('speed', value);
        const valueSpan = e.target.closest('.neu-field')?.querySelector('.neu-field-value');
        if (valueSpan) valueSpan.textContent = label;
        const field = e.target.closest('.neu-field');
        if (field) field.classList.remove('editing');
      });
    }

    // 고급 설정 토글
    const advToggle = document.getElementById('cartesiaAdvancedToggle');
    const advPanel = document.getElementById('cartesiaAdvancedPanel');
    if (advToggle && advPanel) {
      advToggle.addEventListener('click', () => {
        const open = advPanel.style.display !== 'none';
        advPanel.style.display = open ? 'none' : 'block';
        advToggle.classList.toggle('open', !open);
      });
    }

    // volume 드롭다운
    const volumeSelect = document.getElementById('cartesiaVolumeSelect');
    if (volumeSelect) {
      volumeSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        const label = e.target.selectedOptions[0]?.text || '';
        this.handleCartesiaFieldChange('volume', value);
        const valueSpan = e.target.closest('.neu-field')?.querySelector('.neu-field-value');
        if (valueSpan) valueSpan.textContent = label;
        const field = e.target.closest('.neu-field');
        if (field) field.classList.remove('editing');
      });
    }

    // emotion 드롭다운
    const emotionSelect = document.getElementById('cartesiaEmotionSelect');
    if (emotionSelect) {
      emotionSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        const label = e.target.selectedOptions[0]?.text || '';
        this.handleCartesiaFieldChange('emotion', value);
        const valueSpan = e.target.closest('.neu-field')?.querySelector('.neu-field-value');
        if (valueSpan) valueSpan.textContent = label;
        const field = e.target.closest('.neu-field');
        if (field) field.classList.remove('editing');
      });
    }

    // voiceTags 체크박스 그룹
    const voiceTagsGroup = document.getElementById('cartesiaVoiceTagsGroup');
    if (voiceTagsGroup) {
      voiceTagsGroup.addEventListener('change', () => {
        const checked = [...voiceTagsGroup.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
        this.handleCartesiaFieldChange('voiceTags', checked);
        const valueSpan = voiceTagsGroup.closest('.neu-field')?.querySelector('.neu-field-value');
        if (valueSpan) valueSpan.textContent = checked.length > 0 ? checked.map(t => `[${t}]`).join(' ') : '없음';
      });
    }

    // 미리듣기 버튼
    const previewBtn = document.getElementById('cartesiaPreviewBtn');
    if (previewBtn) previewBtn.addEventListener('click', () => this.testCartesiaTTS());

    // 저장 버튼
    const saveBtn = document.getElementById('cartesiaSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveCartesiaConfig());
  }

  /**
   * Cartesia 목소리 목록 로드
   */
  async loadCartesiaVoices(selectedVoiceId) {
    const voiceSelect = document.getElementById('cartesiaVoiceSelect');
    const voiceLabel = document.getElementById('cartesiaVoiceLabel');
    if (!voiceSelect) return;

    try {
      const res = await fetch('/api/tts/voices?service=cartesia');
      if (!res.ok) throw new Error('Failed to load voices');
      const data = await res.json();

      voiceSelect.innerHTML = '<option value="">목소리 선택</option>';
      (data.voices || []).forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        if (v.id === selectedVoiceId) opt.selected = true;
        voiceSelect.appendChild(opt);
      });

      // 디스플레이 라벨 업데이트
      if (selectedVoiceId && voiceLabel) {
        const selected = voiceSelect.selectedOptions[0];
        voiceLabel.textContent = (selected && selected.value) ? selected.text : selectedVoiceId;
      } else if (voiceLabel) {
        voiceLabel.textContent = '선택 안됨';
      }
      this.updateVoiceSummary();
    } catch (err) {
      console.error('[Cartesia] Failed to load voices:', err);
      if (voiceLabel) voiceLabel.textContent = selectedVoiceId || '로드 실패';
      this.updateVoiceSummary();
    }
  }

  /**
   * 음성 타임라인 요약 렌더링 (초기 HTML 생성용)
   */
  renderVoiceSummary() {
    const model = this.voiceConfig?.model || '';
    if (!model) return '';

    const modelInfo = this.voiceModels?.find(m => m.id === model);
    const label = modelInfo ? modelInfo.name : model;
    return `<div><span class="summary-label">음성</span><span class="summary-text">${label}</span></div>`;
  }

  /**
   * 음성 타임라인 요약 업데이트 (DOM 업데이트용)
   */
  updateVoiceSummary() {
    const summaryEl = document.querySelector('.timeline-summary--voice');
    if (!summaryEl) return;

    const service = this.voiceConfig?.service || '';
    const voiceSection = document.querySelector('[data-section="voice"]');
    const emptyHint = voiceSection?.querySelector('.section-empty-hint');

    if (service && this.voiceConfig) {
      let badgeLabel = service.charAt(0).toUpperCase() + service.slice(1);
      let summaryText = '';

      if (service === 'cartesia' && this.voiceConfig.cartesia) {
        const cart = this.voiceConfig.cartesia;
        const parts = [];
        parts.push(cart.model || '-');
        if (cart.voice) {
          const voiceSelect = document.getElementById('cartesiaVoiceSelect');
          const voiceName = voiceSelect?.selectedOptions[0]?.text || '';
          let voicePart = voiceName || cart.voice;
          if (cart.language) voicePart += ` (${cart.language})`;
          parts.push(voicePart);
        } else if (cart.language) {
          parts.push(`(${cart.language})`);
        }
        summaryText = parts.join(' / ');
      } else if (this.voiceConfig.model) {
        const modelId = `${service}:${this.voiceConfig.model}`;
        const modelInfo = this.ttsModels?.find(m => m.id === modelId);
        summaryText = modelInfo?.name || this.voiceConfig.model;
      }

      const html = summaryText
        ? `<div><span class="summary-label">${badgeLabel}</span><span class="summary-text">${summaryText}</span></div>`
        : '';
      summaryEl.innerHTML = html;
      summaryEl.style.display = summaryText ? 'block' : '';

      if (emptyHint) emptyHint.style.display = summaryText ? 'none' : 'block';
    } else {
      summaryEl.innerHTML = '';
      summaryEl.style.display = '';
      if (emptyHint) emptyHint.style.display = 'block';
    }
  }

  /**
   * Cartesia TTS 테스트
   */
  async testCartesiaTTS() {
    const previewBtn = document.getElementById('cartesiaPreviewBtn');

    const model = document.getElementById('cartesiaModelInput')?.value?.trim();
    const voice = document.getElementById('cartesiaVoiceSelect')?.value;
    const language = document.getElementById('cartesiaLanguageSelect')?.value;
    const speed = document.getElementById('cartesiaSpeedSelect')?.value;
    const volume = document.getElementById('cartesiaVolumeSelect')?.value;
    const emotion = document.getElementById('cartesiaEmotionSelect')?.value;

    if (!model || !voice) {
      alert('Model과 Voice를 모두 입력해주세요.');
      return;
    }

    try {
      previewBtn.disabled = true;
      previewBtn.textContent = '재생 중...';

      // 감정별 미리듣기 문장
      const emotionPreviews = {
        'neutral': '안녕하세요. 소울입니다.',
        'happy': '오늘 진짜 좋은 일이 있었어! [laughter] 너무 기분 좋다!',
        'excited': '대박! [laughter] 이거 진짜야? 완전 신난다!',
        'calm': '괜찮아, 천천히 하면 돼. 내가 도와줄게.',
        'content': '오늘 하루도 좋았어. 이렇게 편안한 게 좋아.',
        'curious': '어? 그거 뭐야? 좀 더 자세히 알려줘!',
        'affectionate': '고마워, 진짜. 네가 있어서 다행이야.',
        'sad': '그랬구나... 많이 힘들었겠다.',
        'angry': '아 진짜 너무하다. 그건 좀 아니지 않아?',
        'scared': '헐... 진짜? 무섭다 그거...',
        'sarcastic': '와, 정말 대단하시네. 진짜 감동이다.',
        'surprised': '헐! 진짜? [laughter] 말도 안 돼!'
      };
      const previewText = emotionPreviews[emotion] || emotionPreviews['neutral'];

      // 폼의 현재 값을 직접 백엔드에 전달 (저장 전에도 미리듣기 가능)
      const res = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: previewText,
          model, voice, language, speed, volume, emotion
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `TTS 실패: ${res.status}`);
      }

      const wavBuffer = await res.arrayBuffer();
      if (wavBuffer.byteLength < 44) throw new Error('오디오 데이터 없음');

      // 오디오 재생
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(wavBuffer);
      const source = audioCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(audioCtx.destination);
      source.start(0);

      source.onended = () => {
        previewBtn.textContent = '✓ 완료';
        setTimeout(() => {
          previewBtn.textContent = '목소리 미리듣기';
          previewBtn.disabled = false;
        }, 1500);
        audioCtx.close();
      };
    } catch (error) {
      console.error('TTS test failed:', error);
      alert(`TTS 테스트 실패: ${error.message}`);
      previewBtn.textContent = '목소리 미리듣기';
      previewBtn.disabled = false;
    }
  }

  async saveCartesiaConfig() {
    const saveBtn = document.getElementById('cartesiaSaveBtn');
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';

      await this.saveVoiceConfig(true);

      saveBtn.textContent = '✓ 저장됨';
      setTimeout(() => {
        saveBtn.textContent = '저장';
        saveBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('Voice config save failed:', error);
      alert(`저장 실패: ${error.message}`);
      saveBtn.textContent = '저장';
      saveBtn.disabled = false;
    }
  }

}
