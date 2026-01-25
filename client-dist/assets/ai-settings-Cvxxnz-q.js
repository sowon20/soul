class E{constructor(){this.services=[],this.agentProfile=null,this.apiClient=null,this.availableModels=[],this.routingConfig={light:"claude-3-5-haiku-20241022",medium:"claude-3-5-sonnet-20241022",heavy:"claude-3-opus-20240229",lightThinking:!1,mediumThinking:!1,heavyThinking:!0},this.routingStats=null,this.memoryConfig={autoSave:!0,autoInject:!0,shortTermSize:50,compressionThreshold:80},this.storageConfig={memoryPath:"./memory",filesPath:"./files"},this.agentChains=[],this.availableRoles=[],this.expandedRoleId=null,this.abortController=null}async render(e,t){this.apiClient=t;try{await this.loadServices(),this.collectAvailableModels(),await this.loadAgentProfile(),await this.loadRoutingConfig(),await this.loadMemoryConfig(),await this.loadStorageConfig(),await this.loadRoutingStats(),await this.loadAvailableRoles(),await this.loadAgentChains(),e.innerHTML=`
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

          <!-- 라우팅 통계 -->
          <section class="settings-section">
            <h3 class="settings-section-title">라우팅 통계</h3>
            <p class="settings-section-desc">모델별 사용 현황과 비용을 확인합니다.</p>
            ${this.renderRoutingStats()}
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
      `,this.attachEventListeners(e)}catch(s){console.error("Failed to load AI services:",s),e.innerHTML=`
        <div class="settings-error">
          <p>AI 서비스를 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">${s.message}</p>
        </div>
      `}}async loadServices(){const e=await this.apiClient.get("/ai-services");this.services=e.services||[]}collectAvailableModels(){this.availableModels=[],this.services.forEach(e=>{e.hasApiKey&&e.isActive&&e.models&&e.models.length>0&&e.models.forEach(t=>{this.availableModels.push({id:t.id,name:t.name||t.id,service:e.name,type:e.type})})}),this.availableModels.length===0&&this.availableModels.push({id:"",name:"(API 키를 설정하고 모델 새로고침을 해주세요)",service:"-",type:"none",disabled:!0})}async loadAgentProfile(){try{const t=(await this.apiClient.get("/profile/agent")).profiles||[];this.agentProfile=t.find(s=>s.id==="default")||t[0]||{id:"default",name:"Soul",role:"AI Assistant",description:"당신의 AI 동반자"}}catch(e){console.error("Failed to load agent profile:",e),this.agentProfile={id:"default",name:"Soul",role:"AI Assistant",description:"당신의 AI 동반자"}}}async loadRoutingConfig(){var e,t,s,a,n,r;try{const c=await this.apiClient.get("/config/routing");c&&c.light&&(this.routingConfig={light:((e=c.light)==null?void 0:e.modelId)||c.light,medium:((t=c.medium)==null?void 0:t.modelId)||c.medium,heavy:((s=c.heavy)==null?void 0:s.modelId)||c.heavy,lightService:((a=c.light)==null?void 0:a.serviceId)||null,mediumService:((n=c.medium)==null?void 0:n.serviceId)||null,heavyService:((r=c.heavy)==null?void 0:r.serviceId)||null})}catch(c){console.error("Failed to load routing config from server:",c);try{const d=localStorage.getItem("smartRoutingConfig");d&&(this.routingConfig=JSON.parse(d))}catch(d){console.error("Failed to load routing config from localStorage:",d)}}}async loadMemoryConfig(){try{const e=localStorage.getItem("memoryConfig");e&&(this.memoryConfig=JSON.parse(e))}catch(e){console.error("Failed to load memory config:",e)}}async loadStorageConfig(){try{const e=await this.apiClient.get("/config/memory"),t=await this.apiClient.get("/config/files");e&&e.storagePath&&(this.storageConfig.memoryPath=e.storagePath),t&&t.storagePath&&(this.storageConfig.filesPath=t.storagePath)}catch(e){console.error("Failed to load storage config:",e)}}async loadRoutingStats(){try{const e=await this.apiClient.get("/chat/routing-stats");e.success&&(this.routingStats=e.stats)}catch(e){console.error("Failed to load routing stats:",e),this.routingStats=null}}async loadAvailableRoles(){try{const e=await this.apiClient.get("/roles");e.success&&(this.availableRoles=e.roles||[])}catch(e){console.error("Failed to load roles:",e),this.availableRoles=[]}}async loadAgentChains(){try{const e=localStorage.getItem("agentChains");e?this.agentChains=JSON.parse(e):this.agentChains=[{id:"code-review-chain",name:"코드 리뷰 체인",description:"코드 생성 후 검토를 수행합니다",type:"sequential",enabled:!1,steps:[{roleId:"coder",customModel:""},{roleId:"reviewer",customModel:""}]},{id:"research-summary-chain",name:"연구 요약 체인",description:"조사 후 요약을 생성합니다",type:"sequential",enabled:!1,steps:[{roleId:"researcher",customModel:""},{roleId:"summarizer",customModel:""}]},{id:"parallel-analysis",name:"병렬 분석",description:"여러 관점에서 동시에 분석합니다",type:"parallel",enabled:!1,steps:[{roleId:"analyzer",customModel:""},{roleId:"coder",customModel:""}]}]}catch(e){console.error("Failed to load agent chains:",e),this.agentChains=[]}}renderThinkingToggle(e,t,s){return`
      <div class="thinking-toggle-wrapper">
        <label class="thinking-toggle">
          <input type="checkbox"
                 id="thinking${e}"
                 ${s?"checked":""}>
          <span class="thinking-toggle-slider"></span>
          <span class="thinking-toggle-label">생각</span>
        </label>
        <span class="thinking-hint">지원 모델에서 생각 과정 표시</span>
      </div>
    `}renderSmartRoutingSettings(){return`
      <div class="routing-settings-container">
        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">경량 작업 (1-2)</span>
            <span class="label-hint">간단한 질문, 번역, 요약</span>
          </label>
          <div class="routing-field-row">
            <select class="routing-select" id="routingLight" ${this.availableModels.length===1&&this.availableModels[0].disabled?"disabled":""}>
              ${this.renderModelOptions(this.routingConfig.light)}
            </select>
            ${this.renderThinkingToggle("Light",this.routingConfig.light,this.routingConfig.lightThinking)}
          </div>
        </div>

        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">중간 작업 (4-6)</span>
            <span class="label-hint">코드 생성, 리뷰, 분석, 문제 해결</span>
          </label>
          <div class="routing-field-row">
            <select class="routing-select" id="routingMedium" ${this.availableModels.length===1&&this.availableModels[0].disabled?"disabled":""}>
              ${this.renderModelOptions(this.routingConfig.medium)}
            </select>
            ${this.renderThinkingToggle("Medium",this.routingConfig.medium,this.routingConfig.mediumThinking)}
          </div>
        </div>

        <div class="routing-field">
          <label class="routing-label">
            <span class="label-text">고성능 작업 (7-9)</span>
            <span class="label-hint">아키텍처 설계, 복잡한 디버깅, 연구</span>
          </label>
          <div class="routing-field-row">
            <select class="routing-select" id="routingHeavy" ${this.availableModels.length===1&&this.availableModels[0].disabled?"disabled":""}>
              ${this.renderModelOptions(this.routingConfig.heavy)}
            </select>
            ${this.renderThinkingToggle("Heavy",this.routingConfig.heavy,this.routingConfig.heavyThinking)}
          </div>
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
    `}getModelDisplayName(e){if(!e)return"미설정";const t=this.availableModels.find(s=>s.id===e);return t?t.name||e:e.split("-").slice(0,2).join(" ")}renderRoutingStats(){var n,r,c,d,g,p;const e=this.getModelDisplayName(this.routingConfig.light),t=this.getModelDisplayName(this.routingConfig.medium),s=this.getModelDisplayName(this.routingConfig.heavy);if(!this.routingStats)return`
        <div class="stats-container">
          <p class="stats-empty">통계 데이터가 없습니다. 대화를 시작하면 통계가 수집됩니다.</p>
          <button class="settings-btn settings-btn-outline" id="refreshStatsBtn">
            통계 새로고침
          </button>
        </div>
      `;const a=this.routingStats;return`
      <div class="stats-container">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${a.totalRequests||0}</div>
            <div class="stat-label">총 요청</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${((n=a.distribution)==null?void 0:n.light)||((r=a.distribution)==null?void 0:r.haiku)||"0%"}</div>
            <div class="stat-label" title="${e}">경량</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${((c=a.distribution)==null?void 0:c.medium)||((d=a.distribution)==null?void 0:d.sonnet)||"0%"}</div>
            <div class="stat-label" title="${t}">중간</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${((g=a.distribution)==null?void 0:g.heavy)||((p=a.distribution)==null?void 0:p.opus)||"0%"}</div>
            <div class="stat-label" title="${s}">고성능</div>
          </div>
        </div>

        <div class="stats-details">
          <div class="stats-row">
            <span class="stats-label">예상 비용</span>
            <span class="stats-value">$${(a.totalCost||0).toFixed(4)}</span>
          </div>
          <div class="stats-row">
            <span class="stats-label">평균 응답 시간</span>
            <span class="stats-value">${a.averageLatency?a.averageLatency.toFixed(0)+"ms":"-"}</span>
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
    `}renderAgentChainSettings(){return`
      <div class="alba-container">
        ${this.availableRoles.length>0?`
          <div class="alba-list">
            ${this.availableRoles.map(t=>this.renderAlbaItem(t)).join("")}
          </div>
        `:`
          <div class="alba-empty">
            <p>등록된 알바가 없습니다.</p>
            <button class="settings-btn settings-btn-primary" id="initRolesBtn">
              기본 알바 초기화
            </button>
          </div>
        `}

        <div class="alba-add">
          <button class="settings-btn settings-btn-primary" id="addAlbaBtn">
            + 알바 추가
          </button>
        </div>
      </div>
    `}renderAlbaItem(e){const t=this.expandedRoleId===e.roleId;return`
      <div class="alba-item ${e.active?"":"inactive"}" data-role-id="${e.roleId}">
        <div class="alba-header" data-role-id="${e.roleId}" data-action="toggle-expand">
          <div class="alba-info">
            <span class="alba-icon">${this.getRoleIcon(e.category)}</span>
            <div class="alba-text">
              <span class="alba-name">${e.name}</span>
              <span class="alba-desc">${e.description}</span>
            </div>
          </div>
          <div class="alba-status">
            <span class="alba-mode-badge">${this.getModeLabel(e.mode||"single")}</span>
            <label class="toggle-switch toggle-switch-sm" onclick="event.stopPropagation()">
              <input type="checkbox"
                     data-role-id="${e.roleId}"
                     data-action="toggle-active"
                     ${e.active?"checked":""}>
              <span class="toggle-slider"></span>
            </label>
            <span class="alba-expand-icon">${t?"▼":"▶"}</span>
          </div>
        </div>

        <div class="alba-detail ${t?"expanded":""}">
          <div class="alba-detail-row">
            <label class="alba-label">작동 방식</label>
            <select class="alba-mode-select" data-role-id="${e.roleId}">
              <option value="single" ${(e.mode||"single")==="single"?"selected":""}>일반 (단일 모델)</option>
              <option value="chain" ${e.mode==="chain"?"selected":""}>체인 (순차 실행)</option>
              <option value="parallel" ${e.mode==="parallel"?"selected":""}>병렬 (동시 실행)</option>
            </select>
          </div>

          ${this.renderModeConfig(e)}

          <div class="alba-detail-row alba-prompt-row">
            <label class="alba-label">시스템 프롬프트</label>
            <textarea class="alba-prompt-textarea"
                      data-role-id="${e.roleId}"
                      placeholder="이 알바의 역할과 성격을 정의하세요..."
                      rows="4">${e.systemPrompt||""}</textarea>
            <button class="settings-btn settings-btn-sm settings-btn-primary alba-save-prompt"
                    data-role-id="${e.roleId}">
              프롬프트 저장
            </button>
          </div>

          <div class="alba-detail-row">
            <label class="alba-label">카테고리</label>
            <select class="alba-category-select" data-role-id="${e.roleId}">
              <option value="content" ${e.category==="content"?"selected":""}>✍️ 콘텐츠</option>
              <option value="code" ${e.category==="code"?"selected":""}>💻 코드</option>
              <option value="data" ${e.category==="data"?"selected":""}>📊 데이터</option>
              <option value="creative" ${e.category==="creative"?"selected":""}>🎨 크리에이티브</option>
              <option value="technical" ${e.category==="technical"?"selected":""}>🔧 기술</option>
              <option value="other" ${e.category==="other"?"selected":""}>🤖 기타</option>
            </select>
          </div>

          <div class="alba-detail-row alba-triggers-row">
            <label class="alba-label">트리거 키워드</label>
            <div class="alba-triggers-container">
              <div class="alba-triggers-list">
                ${(e.triggers||[]).map((s,a)=>`
                  <span class="alba-trigger-tag">
                    ${s}
                    <button class="trigger-remove" data-role-id="${e.roleId}" data-trigger-index="${a}">×</button>
                  </span>
                `).join("")}
              </div>
              <div class="alba-trigger-input-wrap">
                <input type="text" class="alba-trigger-input"
                       data-role-id="${e.roleId}"
                       placeholder="키워드 입력 후 Enter">
                <button class="settings-btn settings-btn-sm settings-btn-outline alba-add-trigger"
                        data-role-id="${e.roleId}">추가</button>
              </div>
            </div>
          </div>

          <div class="alba-detail-row alba-ai-settings">
            <div class="alba-ai-setting">
              <label class="alba-label">Temperature</label>
              <input type="range" class="alba-temperature-range"
                     data-role-id="${e.roleId}"
                     min="0" max="2" step="0.1"
                     value="${e.temperature??.7}">
              <span class="alba-range-value">${e.temperature??.7}</span>
            </div>
            <div class="alba-ai-setting">
              <label class="alba-label">Max Tokens</label>
              <input type="number" class="alba-maxTokens-input"
                     data-role-id="${e.roleId}"
                     min="100" max="32000" step="100"
                     value="${e.maxTokens||4096}">
            </div>
          </div>

          <div class="alba-detail-row">
            <label class="alba-label">폴백 모델</label>
            <select class="alba-fallback-select" data-role-id="${e.roleId}">
              <option value="">없음</option>
              ${this.renderModelOptions(e.fallbackModel)}
            </select>
          </div>

          <div class="alba-detail-row alba-tags-row">
            <label class="alba-label">태그</label>
            <div class="alba-tags-container">
              <div class="alba-tags-list">
                ${(e.tags||[]).map((s,a)=>`
                  <span class="alba-tag">
                    #${s}
                    <button class="tag-remove" data-role-id="${e.roleId}" data-tag-index="${a}">×</button>
                  </span>
                `).join("")}
              </div>
              <div class="alba-tag-input-wrap">
                <input type="text" class="alba-tag-input"
                       data-role-id="${e.roleId}"
                       placeholder="태그 입력 후 Enter">
                <button class="settings-btn settings-btn-sm settings-btn-outline alba-add-tag"
                        data-role-id="${e.roleId}">추가</button>
              </div>
            </div>
          </div>

          <div class="alba-detail-row alba-actions-row">
            <div class="alba-btns">
              <button class="settings-btn settings-btn-sm settings-btn-outline"
                      data-role-id="${e.roleId}"
                      data-action="edit-alba">
                수정
              </button>
              <button class="settings-btn settings-btn-sm settings-btn-secondary"
                      data-role-id="${e.roleId}"
                      data-action="delete-alba">
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    `}renderModeConfig(e){const t=e.mode||"single";if(t==="single")return`
        <div class="alba-detail-row">
          <label class="alba-label">사용 모델</label>
          <select class="alba-model-select" data-role-id="${e.roleId}">
            <option value="">자동 선택</option>
            ${this.renderModelOptions(e.preferredModel)}
          </select>
        </div>
      `;if(t==="chain")return`
        <div class="alba-detail-row alba-chain-config">
          <label class="alba-label">체인 순서</label>
          <div class="alba-chain-steps">
            ${(e.chainSteps||[]).map((a,n)=>`
              <div class="alba-chain-step">
                <span class="step-num">${n+1}</span>
                <select class="chain-step-select" data-role-id="${e.roleId}" data-step-index="${n}">
                  <option value="">선택...</option>
                  ${this.availableRoles.filter(r=>r.roleId!==e.roleId).map(r=>`
                    <option value="${r.roleId}" ${a===r.roleId?"selected":""}>${r.name}</option>
                  `).join("")}
                </select>
                <button class="step-remove" data-role-id="${e.roleId}" data-step-index="${n}">×</button>
              </div>
            `).join('<span class="chain-arrow-sm">→</span>')}
            <button class="settings-btn settings-btn-sm settings-btn-outline add-chain-step" data-role-id="${e.roleId}">+</button>
          </div>
        </div>
      `;if(t==="parallel"){const s=e.parallelRoles||[];return`
        <div class="alba-detail-row alba-parallel-config">
          <label class="alba-label">동시 실행 알바</label>
          <div class="alba-parallel-list">
            ${this.availableRoles.filter(a=>a.roleId!==e.roleId).map(a=>`
              <label class="alba-parallel-item">
                <input type="checkbox"
                       data-role-id="${e.roleId}"
                       data-target-role="${a.roleId}"
                       ${s.includes(a.roleId)?"checked":""}>
                <span>${a.name}</span>
              </label>
            `).join("")}
          </div>
        </div>
      `}return""}getModeLabel(e){return{single:"일반",chain:"체인",parallel:"병렬"}[e]||"일반"}getRoleIcon(e){const t={content:"✍️",code:"💻",data:"📊",creative:"🎨",technical:"🔧",other:"🤖"};return t[e]||t.other}renderMemorySettings(){return`
      <div class="memory-settings-container">
        <div class="memory-toggle-group">
          <div class="memory-toggle-item">
            <div class="toggle-info">
              <span class="label-text">자동 메모리 저장</span>
              <span class="label-hint">대화 내용을 자동으로 메모리에 저장합니다</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="memoryAutoSave" ${this.memoryConfig.autoSave?"checked":""}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="memory-toggle-item">
            <div class="toggle-info">
              <span class="label-text">자동 메모리 주입</span>
              <span class="label-hint">관련된 과거 대화를 자동으로 참조합니다</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="memoryAutoInject" ${this.memoryConfig.autoInject?"checked":""}>
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
    `}renderStorageSettings(){return`
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
    `}renderPromptSettings(){var e,t,s,a,n,r,c,d,g,p,u,v,m,b,h,f;return this.agentProfile?`
      <div class="prompt-settings-container">
        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">에이전트 이름</span>
            <span class="label-hint">AI의 이름을 설정합니다</span>
          </label>
          <input type="text"
                 class="prompt-input"
                 id="agentName"
                 value="${this.agentProfile.name||""}"
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
                 value="${this.agentProfile.role||""}"
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
                    placeholder="당신의 AI 동반자">${this.agentProfile.description||""}</textarea>
        </div>

        <div class="prompt-field">
          <label class="prompt-label">
            <span class="label-text">커스텀 시스템 프롬프트 (선택사항)</span>
            <span class="label-hint">추가로 포함할 지침이나 맥락을 입력하세요</span>
          </label>
          <textarea class="prompt-textarea"
                    id="customPrompt"
                    rows="6"
                    placeholder="예: 항상 코드 예시를 포함하세요. 답변은 친절하고 상세하게 작성하세요.">${this.agentProfile.customPrompt||""}</textarea>
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
                     value="${this.agentProfile.temperature??.7}">
              <span class="prompt-range-value" id="soulTempValue">${this.agentProfile.temperature??.7}</span>
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
                   value="${this.agentProfile.maxTokens||4096}">
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
                     value="${((t=(e=this.agentProfile.personality)==null?void 0:e.communication)==null?void 0:t.formality)??.5}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">⚡ 간결</span>
                <span class="slider-label-right">📚 상세</span>
              </div>
              <input type="range" class="personality-range" id="personalityVerbosity"
                     min="0" max="1" step="0.1"
                     value="${((a=(s=this.agentProfile.personality)==null?void 0:s.communication)==null?void 0:a.verbosity)??.5}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🌸 완곡</span>
                <span class="slider-label-right">🎯 직접적</span>
              </div>
              <input type="range" class="personality-range" id="personalityDirectness"
                     min="0" max="1" step="0.1"
                     value="${((r=(n=this.agentProfile.personality)==null?void 0:n.communication)==null?void 0:r.directness)??.7}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">📝 일반 용어</span>
                <span class="slider-label-right">🔧 기술 용어</span>
              </div>
              <input type="range" class="personality-range" id="personalityTechnicality"
                     min="0" max="1" step="0.1"
                     value="${((d=(c=this.agentProfile.personality)==null?void 0:c.communication)==null?void 0:d.technicality)??.5}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">😐 이모지 없음</span>
                <span class="slider-label-right">😊 이모지 많이</span>
              </div>
              <input type="range" class="personality-range" id="personalityEmoji"
                     min="0" max="1" step="0.1"
                     value="${((p=(g=this.agentProfile.personality)==null?void 0:g.communication)==null?void 0:p.emoji)??.3}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🧐 진지</span>
                <span class="slider-label-right">😄 유머러스</span>
              </div>
              <input type="range" class="personality-range" id="personalityHumor"
                     min="0" max="1" step="0.1"
                     value="${((v=(u=this.agentProfile.personality)==null?void 0:u.communication)==null?void 0:v.humor)??.3}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🤖 기계적</span>
                <span class="slider-label-right">💕 공감적</span>
              </div>
              <input type="range" class="personality-range" id="personalityEmpathy"
                     min="0" max="1" step="0.1"
                     value="${((b=(m=this.agentProfile.personality)==null?void 0:m.traits)==null?void 0:b.empathetic)??.6}">
            </div>

            <div class="personality-slider-item">
              <div class="slider-header">
                <span class="slider-label-left">🐢 수동적</span>
                <span class="slider-label-right">🚀 적극적</span>
              </div>
              <input type="range" class="personality-range" id="personalityProactive"
                     min="0" max="1" step="0.1"
                     value="${((f=(h=this.agentProfile.personality)==null?void 0:h.traits)==null?void 0:f.proactive)??.7}">
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
    `:'<p style="color: rgba(0, 0, 0, 0.5);">프로필을 불러오는 중...</p>'}renderServiceCards(){return this.services.map(e=>`
      <div class="ai-service-card ${e.isActive?"active":"inactive"}" data-service-id="${e.id}">
        <div class="service-header">
          <div class="service-title">
            <h4>${this.getServiceIcon(e.type)} ${e.name}</h4>
            <span class="service-type">${e.type}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox"
                   data-service-id="${e.id}"
                   data-action="toggle-active"
                   ${e.isActive?"checked":""}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="service-body">
          <!-- API 키 상태 -->
          <div class="service-api-key">
            <div class="api-key-status">
              ${e.hasApiKey?'<span class="status-badge status-success">✓ API 키 설정됨</span>':'<span class="status-badge status-warning">✗ API 키 미설정</span>'}
            </div>
            <button class="settings-btn settings-btn-sm settings-btn-secondary"
                    data-service-id="${e.id}"
                    data-action="edit-api-key"
                    style="width: 100%;">
              ${e.hasApiKey?"키 변경":"키 설정"}
            </button>
          </div>

          <!-- 모델 정보 -->
          ${e.modelCount>0?`
            <div class="service-models">
              <span class="models-count">사용 가능한 모델: ${e.modelCount}개</span>
              ${e.lastRefresh?`
                <span class="models-refresh">최근 갱신: ${this.formatDate(e.lastRefresh)}</span>
              `:""}
            </div>
          `:""}

          <!-- 작업 버튼 -->
          <div class="service-actions">
            ${e.hasApiKey?`
              <button class="settings-btn settings-btn-sm settings-btn-primary"
                      data-service-id="${e.id}"
                      data-action="test-connection">
                연결 테스트
              </button>
              <button class="settings-btn settings-btn-sm settings-btn-outline"
                      data-service-id="${e.id}"
                      data-action="refresh-models">
                모델 새로고침
              </button>
            `:`
              <p class="service-hint">API 키를 설정하면 연결 테스트와 모델 갱신이 가능합니다.</p>
            `}
          </div>
        </div>
      </div>
    `).join("")}renderModelOptions(e){return this.availableModels.map(t=>`
      <option value="${t.id}"
              ${t.id===e?"selected":""}
              ${t.disabled?"disabled":""}>
        ${t.name}${t.service&&t.service!=="-"?` (${t.service})`:""}
      </option>
    `).join("")}getServiceIcon(e){return{anthropic:"🤖",openai:"🧠",google:"🔵",ollama:"🦙",custom:"⚙️"}[e.toLowerCase()]||"🤖"}formatDate(e){if(!e)return"";const t=new Date(e),a=new Date-t,n=Math.floor(a/6e4),r=Math.floor(a/36e5),c=Math.floor(a/864e5);return n<1?"방금 전":n<60?`${n}분 전`:r<24?`${r}시간 전`:c<7?`${c}일 전`:t.toLocaleDateString("ko-KR")}attachEventListeners(e){this.abortController&&this.abortController.abort(),this.abortController=new AbortController;const{signal:t}=this.abortController;e.addEventListener("change",async i=>{if(i.target.dataset.action==="toggle-active"){i.stopPropagation();const l=i.target.dataset.serviceId;l&&await this.toggleServiceActive(l,i.target.checked)}},{signal:t}),e.addEventListener("click",async i=>{const l=i.target.closest("button[data-action]");if(!l)return;i.stopPropagation();const o=l.dataset.action,y=l.dataset.serviceId;switch(o){case"edit-api-key":await this.editApiKey(y);break;case"test-connection":await this.testConnection(y,l);break;case"refresh-models":await this.refreshModels(y,l);break}},{signal:t});const s=e.querySelector("#saveRoutingBtn"),a=e.querySelector("#resetRoutingBtn");s&&s.addEventListener("click",()=>this.saveRoutingSettings()),a&&a.addEventListener("click",()=>this.resetRoutingSettings());const n=e.querySelector("#saveMemoryBtn"),r=e.querySelector("#resetMemoryBtn"),c=e.querySelector("#memoryCompressionThreshold");n&&n.addEventListener("click",()=>this.saveMemorySettings()),r&&r.addEventListener("click",()=>this.resetMemorySettings()),c&&c.addEventListener("input",i=>{const l=e.querySelector("#compressionValue");l&&(l.textContent=`${i.target.value}%`)});const d=e.querySelector("#savePromptBtn"),g=e.querySelector("#resetPromptBtn");d&&d.addEventListener("click",()=>this.savePromptSettings()),g&&g.addEventListener("click",()=>this.resetPromptSettings());const p=e.querySelector("#soulTemperature");p&&p.addEventListener("input",i=>{const l=e.querySelector("#soulTempValue");l&&(l.textContent=i.target.value)});const u=e.querySelector("#saveStorageBtn"),v=e.querySelector("#resetStorageBtn");u&&u.addEventListener("click",()=>this.saveStorageSettings()),v&&v.addEventListener("click",()=>this.resetStorageSettings());const m=e.querySelector("#refreshStatsBtn"),b=e.querySelector("#resetStatsBtn");m&&m.addEventListener("click",()=>this.refreshRoutingStats()),b&&b.addEventListener("click",()=>this.resetRoutingStats());const h=e.querySelector("#addChainBtn");h&&h.addEventListener("click",()=>this.addNewChain());const f=e.querySelector("#initRolesBtn");f&&f.addEventListener("click",()=>this.initializeRoles());const S=e.querySelector("#addAlbaBtn");S&&S.addEventListener("click",()=>this.addAlba()),e.querySelectorAll(".alba-header").forEach(i=>{i.addEventListener("click",l=>{if(l.target.closest(".toggle-switch")||l.target.closest("button"))return;const o=i.dataset.roleId;this.toggleAlbaExpand(o)})}),e.querySelectorAll(".alba-mode-select").forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId;this.updateAlbaMode(o,l.target.value)})}),e.querySelectorAll(".alba-model-select").forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId;this.updateAlbaModel(o,l.target.value)})}),e.querySelectorAll(".alba-category-select").forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId;this.updateAlbaField(o,"category",l.target.value)})}),e.querySelectorAll(".alba-fallback-select").forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId;this.updateAlbaField(o,"fallbackModel",l.target.value)})}),e.querySelectorAll(".alba-temperature-range").forEach(i=>{i.addEventListener("input",l=>{const o=parseFloat(l.target.value);l.target.nextElementSibling.textContent=o}),i.addEventListener("change",l=>{const o=l.target.dataset.roleId;this.updateAlbaField(o,"temperature",parseFloat(l.target.value))})}),e.querySelectorAll(".alba-maxTokens-input").forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId;this.updateAlbaField(o,"maxTokens",parseInt(l.target.value))})}),e.querySelectorAll(".alba-add-trigger").forEach(i=>{i.addEventListener("click",()=>{const l=i.dataset.roleId,o=e.querySelector(`.alba-trigger-input[data-role-id="${l}"]`);o&&o.value.trim()&&(this.addAlbaTrigger(l,o.value.trim()),o.value="")})}),e.querySelectorAll(".alba-trigger-input").forEach(i=>{i.addEventListener("keypress",l=>{if(l.key==="Enter"&&i.value.trim()){const o=i.dataset.roleId;this.addAlbaTrigger(o,i.value.trim()),i.value=""}})}),e.querySelectorAll(".trigger-remove").forEach(i=>{i.addEventListener("click",()=>{const l=i.dataset.roleId,o=parseInt(i.dataset.triggerIndex);this.removeAlbaTrigger(l,o)})}),e.querySelectorAll(".alba-add-tag").forEach(i=>{i.addEventListener("click",()=>{const l=i.dataset.roleId,o=e.querySelector(`.alba-tag-input[data-role-id="${l}"]`);o&&o.value.trim()&&(this.addAlbaTag(l,o.value.trim()),o.value="")})}),e.querySelectorAll(".alba-tag-input").forEach(i=>{i.addEventListener("keypress",l=>{if(l.key==="Enter"&&i.value.trim()){const o=i.dataset.roleId;this.addAlbaTag(o,i.value.trim()),i.value=""}})}),e.querySelectorAll(".tag-remove").forEach(i=>{i.addEventListener("click",()=>{const l=i.dataset.roleId,o=parseInt(i.dataset.tagIndex);this.removeAlbaTag(l,o)})}),e.querySelectorAll('[data-action="toggle-active"][data-role-id]').forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId;this.toggleAlbaActive(o,l.target.checked)})}),e.querySelectorAll('[data-action="edit-alba"]').forEach(i=>{i.addEventListener("click",()=>{this.editAlba(i.dataset.roleId)})}),e.querySelectorAll('[data-action="delete-alba"]').forEach(i=>{i.addEventListener("click",()=>{this.deleteAlba(i.dataset.roleId)})}),e.querySelectorAll(".add-chain-step").forEach(i=>{i.addEventListener("click",()=>{const l=i.dataset.roleId;this.addAlbaChainStep(l)})}),e.querySelectorAll(".step-remove").forEach(i=>{i.addEventListener("click",()=>{const l=i.dataset.roleId,o=parseInt(i.dataset.stepIndex);this.removeAlbaChainStep(l,o)})}),e.querySelectorAll(".chain-step-select").forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId,y=parseInt(l.target.dataset.stepIndex);this.updateAlbaChainStep(o,y,l.target.value)})}),e.querySelectorAll('.alba-parallel-config input[type="checkbox"]').forEach(i=>{i.addEventListener("change",l=>{const o=l.target.dataset.roleId,y=l.target.dataset.targetRole;this.toggleAlbaParallelRole(o,y,l.target.checked)})}),e.querySelectorAll(".alba-save-prompt").forEach(i=>{i.addEventListener("click",async()=>{const l=i.dataset.roleId,o=e.querySelector(`.alba-prompt-textarea[data-role-id="${l}"]`);o&&await this.saveAlbaPrompt(l,o.value)})}),e.addEventListener("change",async i=>{if(i.target.dataset.action==="toggle-chain"){const l=i.target.dataset.chainId;await this.toggleChain(l,i.target.checked)}if(i.target.classList.contains("role-select")){const l=i.target.dataset.chainId,o=parseInt(i.target.dataset.stepIndex);await this.updateStepRole(l,o,i.target.value)}if(i.target.classList.contains("model-override-select")){const l=i.target.dataset.chainId,o=parseInt(i.target.dataset.stepIndex);await this.updateStepModel(l,o,i.target.value)}},{signal:t}),e.addEventListener("click",async i=>{const l=i.target.closest("button[data-action]");if(!l)return;const o=l.dataset.action,y=l.dataset.chainId,I=l.dataset.stepIndex?parseInt(l.dataset.stepIndex):null;switch(o){case"edit-chain":await this.editChain(y);break;case"delete-chain":await this.deleteChain(y);break;case"add-step":await this.addChainStep(y);break;case"remove-step":await this.removeChainStep(y,I);break}},{signal:t})}async toggleServiceActive(e,t){try{await this.apiClient.post(`/ai-services/${e}/toggle`),this.showSaveStatus(`서비스가 ${t?"활성화":"비활성화"}되었습니다.`,"success");const s=document.querySelector(`[data-service-id="${e}"]`);s&&(s.classList.toggle("active",t),s.classList.toggle("inactive",!t))}catch(s){console.error("Failed to toggle service:",s),this.showSaveStatus("상태 변경에 실패했습니다.","error");const a=document.querySelector(`input[data-service-id="${e}"][data-action="toggle-active"]`);a&&(a.checked=!t)}}async editApiKey(e){const t=this.services.find(a=>a.id===e);if(!t)return;const s=prompt(`${t.name} API 키를 입력하세요:

${t.hasApiKey?"(비워두면 기존 키가 유지됩니다)":""}`,"");if(s!==null)try{await this.apiClient.patch(`/ai-services/${e}`,{apiKey:s.trim()||void 0}),this.showSaveStatus("API 키가 저장되었습니다.","success"),await this.loadServices();const a=document.querySelector(".ai-settings-panel").parentElement;await this.render(a,this.apiClient)}catch(a){console.error("Failed to update API key:",a),this.showSaveStatus("API 키 저장에 실패했습니다.","error")}}async testConnection(e,t){const s=t.textContent;t.disabled=!0,t.textContent="테스트 중...";try{const a=await this.apiClient.post(`/ai-services/${e}/test`);if(a.success)alert(`✓ 연결 성공!

${a.message||"정상적으로 연결되었습니다."}`),this.showSaveStatus("연결 테스트 성공","success");else throw new Error(a.message||a.error||"연결 실패")}catch(a){console.error("Connection test failed:",a),alert(`✗ 연결 실패

${a.message}`),this.showSaveStatus("연결 테스트 실패","error")}finally{t.disabled=!1,t.textContent=s}}async refreshModels(e,t){const s=t.textContent;t.disabled=!0,t.textContent="새로고침 중...";try{const a=await this.apiClient.post(`/ai-services/${e}/refresh-models`);if(a.success){this.showSaveStatus(`모델 목록이 갱신되었습니다. (${a.modelCount||0}개)`,"success"),await this.loadServices();const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient)}else throw new Error(a.message||a.error||"새로고침 실패")}catch(a){console.error("Failed to refresh models:",a),this.showSaveStatus("모델 새로고침에 실패했습니다.","error")}finally{t.disabled=!1,t.textContent=s}}findServiceByModelId(e){const t=this.availableModels.find(s=>s.id===e);return t?{serviceId:t.type,serviceName:t.service}:null}async saveRoutingSettings(){var e,t,s,a,n,r;try{const c=(e=document.getElementById("routingLight"))==null?void 0:e.value,d=(t=document.getElementById("routingMedium"))==null?void 0:t.value,g=(s=document.getElementById("routingHeavy"))==null?void 0:s.value,p=((a=document.getElementById("thinkingLight"))==null?void 0:a.checked)||!1,u=((n=document.getElementById("thinkingMedium"))==null?void 0:n.checked)||!1,v=((r=document.getElementById("thinkingHeavy"))==null?void 0:r.checked)||!1,m=this.findServiceByModelId(c),b=this.findServiceByModelId(d),h=this.findServiceByModelId(g),f={enabled:!0,light:{modelId:c,serviceId:(m==null?void 0:m.serviceId)||null,thinking:p},medium:{modelId:d,serviceId:(b==null?void 0:b.serviceId)||null,thinking:u},heavy:{modelId:g,serviceId:(h==null?void 0:h.serviceId)||null,thinking:v}};await this.apiClient.put("/config/routing",f),this.routingConfig={light:c,medium:d,heavy:g,lightThinking:p,mediumThinking:u,heavyThinking:v,lightService:m==null?void 0:m.serviceId,mediumService:b==null?void 0:b.serviceId,heavyService:h==null?void 0:h.serviceId},localStorage.setItem("smartRoutingConfig",JSON.stringify(this.routingConfig)),this.showSaveStatus("스마트 라우팅 설정이 저장되었습니다.","success")}catch(c){console.error("Failed to save routing settings:",c),this.showSaveStatus("라우팅 설정 저장에 실패했습니다.","error")}}async resetRoutingSettings(){var e,t,s,a,n,r;if(confirm("스마트 라우팅 설정을 기본값으로 되돌리시겠습니까?"))try{const c=((e=this.availableModels.find(h=>h.id.includes("haiku")||h.id.includes("fast")))==null?void 0:e.id)||((t=this.availableModels[0])==null?void 0:t.id),d=((s=this.availableModels.find(h=>h.id.includes("sonnet")||h.id.includes("4o")||h.id.includes("flash")))==null?void 0:s.id)||((a=this.availableModels[0])==null?void 0:a.id),g=((n=this.availableModels.find(h=>h.id.includes("opus")||h.id.includes("pro")))==null?void 0:n.id)||((r=this.availableModels[0])==null?void 0:r.id),p=this.findServiceByModelId(c),u=this.findServiceByModelId(d),v=this.findServiceByModelId(g),m={enabled:!0,light:{modelId:c,serviceId:(p==null?void 0:p.serviceId)||null},medium:{modelId:d,serviceId:(u==null?void 0:u.serviceId)||null},heavy:{modelId:g,serviceId:(v==null?void 0:v.serviceId)||null}};await this.apiClient.put("/config/routing",m),this.routingConfig={light:c,medium:d,heavy:g,lightService:p==null?void 0:p.serviceId,mediumService:u==null?void 0:u.serviceId,heavyService:v==null?void 0:v.serviceId},localStorage.setItem("smartRoutingConfig",JSON.stringify(this.routingConfig)),this.showSaveStatus("스마트 라우팅 설정이 초기화되었습니다.","success");const b=document.querySelector(".ai-settings-panel").parentElement;await this.render(b,this.apiClient)}catch(c){console.error("Failed to reset routing settings:",c),this.showSaveStatus("라우팅 설정 초기화에 실패했습니다.","error")}}async saveMemorySettings(){var e,t,s,a;try{const n=(e=document.getElementById("memoryAutoSave"))==null?void 0:e.checked,r=(t=document.getElementById("memoryAutoInject"))==null?void 0:t.checked,c=parseInt((s=document.getElementById("memoryShortTermSize"))==null?void 0:s.value)||50,d=parseInt((a=document.getElementById("memoryCompressionThreshold"))==null?void 0:a.value)||80;this.memoryConfig={autoSave:n,autoInject:r,shortTermSize:c,compressionThreshold:d},localStorage.setItem("memoryConfig",JSON.stringify(this.memoryConfig)),this.showSaveStatus("메모리 설정이 저장되었습니다.","success")}catch(n){console.error("Failed to save memory settings:",n),this.showSaveStatus("메모리 설정 저장에 실패했습니다.","error")}}async resetMemorySettings(){if(confirm("메모리 설정을 기본값으로 되돌리시겠습니까?"))try{this.memoryConfig={autoSave:!0,autoInject:!0,shortTermSize:50,compressionThreshold:80},localStorage.setItem("memoryConfig",JSON.stringify(this.memoryConfig)),this.showSaveStatus("메모리 설정이 초기화되었습니다.","success");const e=document.querySelector(".ai-settings-panel").parentElement;await this.render(e,this.apiClient)}catch(e){console.error("Failed to reset memory settings:",e),this.showSaveStatus("메모리 설정 초기화에 실패했습니다.","error")}}async savePromptSettings(){var e,t,s,a,n,r,c,d,g,p,u,v,m,b,h,f;try{const S=((e=document.getElementById("agentName"))==null?void 0:e.value)||"Soul",i=((t=document.getElementById("agentRole"))==null?void 0:t.value)||"AI Assistant",l=((s=document.getElementById("agentDescription"))==null?void 0:s.value)||"",o=((a=document.getElementById("customPrompt"))==null?void 0:a.value)||"",y=((n=document.getElementById("defaultModel"))==null?void 0:n.value)||"",I=parseFloat((r=document.getElementById("soulTemperature"))==null?void 0:r.value)||.7,w=parseInt((c=document.getElementById("soulMaxTokens"))==null?void 0:c.value)||4096,C={traits:{helpful:1,professional:.9,friendly:.8,precise:.9,proactive:parseFloat((d=document.getElementById("personalityProactive"))==null?void 0:d.value)||.7,empathetic:parseFloat((g=document.getElementById("personalityEmpathy"))==null?void 0:g.value)||.6},communication:{formality:parseFloat((p=document.getElementById("personalityFormality"))==null?void 0:p.value)||.5,verbosity:parseFloat((u=document.getElementById("personalityVerbosity"))==null?void 0:u.value)||.5,technicality:parseFloat((v=document.getElementById("personalityTechnicality"))==null?void 0:v.value)||.5,directness:parseFloat((m=document.getElementById("personalityDirectness"))==null?void 0:m.value)||.7,emoji:parseFloat((b=document.getElementById("personalityEmoji"))==null?void 0:b.value)||.3,humor:parseFloat((h=document.getElementById("personalityHumor"))==null?void 0:h.value)||.3}},$=((f=this.agentProfile)==null?void 0:f.id)||"default";await this.apiClient.put(`/profile/agent/${$}`,{name:S,role:i,description:l,customPrompt:o,defaultModel:y,temperature:I,maxTokens:w,personality:C}),this.showSaveStatus("설정이 저장되었습니다.","success"),await this.loadAgentProfile()}catch(S){console.error("Failed to save prompt settings:",S),this.showSaveStatus("설정 저장에 실패했습니다.","error")}}async resetPromptSettings(){var e;if(confirm("프롬프트 설정을 초기값으로 되돌리시겠습니까?"))try{const t=((e=this.agentProfile)==null?void 0:e.id)||"default";await this.apiClient.put(`/profile/agent/${t}`,{name:"Soul",role:"AI Assistant",description:"당신의 AI 동반자",customPrompt:"",defaultModel:"",temperature:.7,maxTokens:4096,personality:{traits:{helpful:1,professional:.9,friendly:.8,precise:.9,proactive:.7,empathetic:.6},communication:{formality:.5,verbosity:.5,technicality:.5,directness:.7,emoji:.3,humor:.3}}}),this.showSaveStatus("설정이 초기화되었습니다.","success"),await this.loadAgentProfile();const s=document.querySelector(".ai-settings-panel").parentElement;await this.render(s,this.apiClient)}catch(t){console.error("Failed to reset prompt settings:",t),this.showSaveStatus("프롬프트 초기화에 실패했습니다.","error")}}async saveStorageSettings(){var e,t;try{const s=(e=document.getElementById("memoryPath"))==null?void 0:e.value,a=(t=document.getElementById("filesPath"))==null?void 0:t.value;if(!s||!a){this.showSaveStatus("경로를 입력해주세요.","error");return}await this.apiClient.put("/config/memory",{storagePath:s}),await this.apiClient.put("/config/files",{storagePath:a}),this.storageConfig.memoryPath=s,this.storageConfig.filesPath=a,this.showSaveStatus("저장소 경로 설정이 저장되었습니다.","success")}catch(s){console.error("Failed to save storage settings:",s),this.showSaveStatus("저장소 경로 설정 저장에 실패했습니다.","error")}}async resetStorageSettings(){if(confirm("저장소 경로 설정을 기본값으로 되돌리시겠습니까?"))try{await this.apiClient.put("/config/memory",{storagePath:"./memory"}),await this.apiClient.put("/config/files",{storagePath:"./files"}),this.storageConfig.memoryPath="./memory",this.storageConfig.filesPath="./files",this.showSaveStatus("저장소 경로 설정이 초기화되었습니다.","success");const e=document.querySelector(".ai-settings-panel").parentElement;await this.render(e,this.apiClient)}catch(e){console.error("Failed to reset storage settings:",e),this.showSaveStatus("저장소 경로 설정 초기화에 실패했습니다.","error")}}async refreshRoutingStats(){try{await this.loadRoutingStats();const e=document.querySelector(".ai-settings-panel").parentElement;await this.render(e,this.apiClient),this.showSaveStatus("통계가 갱신되었습니다.","success")}catch(e){console.error("Failed to refresh routing stats:",e),this.showSaveStatus("통계 갱신에 실패했습니다.","error")}}async resetRoutingStats(){if(confirm("라우팅 통계를 초기화하시겠습니까?"))try{this.routingStats=null;const e=document.querySelector(".ai-settings-panel").parentElement;await this.render(e,this.apiClient),this.showSaveStatus("통계가 초기화되었습니다.","success")}catch(e){console.error("Failed to reset routing stats:",e),this.showSaveStatus("통계 초기화에 실패했습니다.","error")}}async toggleChain(e,t){try{const s=this.agentChains.find(a=>a.id===e);s&&(s.enabled=t,localStorage.setItem("agentChains",JSON.stringify(this.agentChains)),this.showSaveStatus(`체인이 ${t?"활성화":"비활성화"}되었습니다.`,"success"))}catch(s){console.error("Failed to toggle chain:",s),this.showSaveStatus("체인 상태 변경에 실패했습니다.","error")}}async initializeRoles(){try{const e=await this.apiClient.post("/roles/initialize");if(e.success){await this.loadAvailableRoles();const t=document.querySelector(".ai-settings-panel").parentElement;await this.render(t,this.apiClient),this.showSaveStatus(`기본 알바 ${e.count}명이 초기화되었습니다.`,"success")}}catch(e){console.error("Failed to initialize roles:",e),this.showSaveStatus("알바 초기화에 실패했습니다.","error")}}async updateStepRole(e,t,s){try{const a=this.agentChains.find(n=>n.id===e);if(a&&a.steps[t]){a.steps[t].roleId=s,localStorage.setItem("agentChains",JSON.stringify(this.agentChains));const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("알바가 배정되었습니다.","success")}}catch(a){console.error("Failed to update step role:",a),this.showSaveStatus("알바 배정에 실패했습니다.","error")}}async updateStepModel(e,t,s){try{const a=this.agentChains.find(n=>n.id===e);a&&a.steps[t]&&(a.steps[t].customModel=s,localStorage.setItem("agentChains",JSON.stringify(this.agentChains)),this.showSaveStatus("모델이 저장되었습니다.","success"))}catch(a){console.error("Failed to update step model:",a),this.showSaveStatus("모델 저장에 실패했습니다.","error")}}async addChainStep(e){try{const t=this.agentChains.find(s=>s.id===e);if(t){t.steps.push({roleId:"",customModel:""}),localStorage.setItem("agentChains",JSON.stringify(this.agentChains));const s=document.querySelector(".ai-settings-panel").parentElement;await this.render(s,this.apiClient),this.showSaveStatus("단계가 추가되었습니다.","success")}}catch(t){console.error("Failed to add chain step:",t),this.showSaveStatus("단계 추가에 실패했습니다.","error")}}async removeChainStep(e,t){try{const s=this.agentChains.find(a=>a.id===e);if(s&&s.steps.length>1){s.steps.splice(t,1),localStorage.setItem("agentChains",JSON.stringify(this.agentChains));const a=document.querySelector(".ai-settings-panel").parentElement;await this.render(a,this.apiClient),this.showSaveStatus("단계가 제거되었습니다.","success")}else s&&s.steps.length<=1&&this.showSaveStatus("최소 1개의 단계가 필요합니다.","error")}catch(s){console.error("Failed to remove chain step:",s),this.showSaveStatus("단계 제거에 실패했습니다.","error")}}async addNewChain(){if(this.availableRoles.length===0){this.showSaveStatus("먼저 알바를 초기화해주세요.","error");return}const e=prompt("새 체인 이름을 입력하세요:");if(!e)return;const t=prompt("체인 설명을 입력하세요 (선택사항):")||"",s=confirm(`순차 실행 체인을 만드시겠습니까?
(취소를 누르면 병렬 실행 체인이 생성됩니다)`)?"sequential":"parallel",a={id:`chain-${Date.now()}`,name:e,description:t,type:s,enabled:!1,steps:[{roleId:"",customModel:""},{roleId:"",customModel:""}]};this.agentChains.push(a),localStorage.setItem("agentChains",JSON.stringify(this.agentChains));const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("새 체인이 추가되었습니다. 알바를 배정해주세요.","success")}async editChain(e){const t=this.agentChains.find(n=>n.id===e);if(!t)return;const s=prompt("체인 이름:",t.name);if(s===null)return;t.name=s,localStorage.setItem("agentChains",JSON.stringify(this.agentChains));const a=document.querySelector(".ai-settings-panel").parentElement;await this.render(a,this.apiClient),this.showSaveStatus("체인이 수정되었습니다.","success")}async deleteChain(e){if(!confirm("이 체인을 삭제하시겠습니까?"))return;this.agentChains=this.agentChains.filter(s=>s.id!==e),localStorage.setItem("agentChains",JSON.stringify(this.agentChains));const t=document.querySelector(".ai-settings-panel").parentElement;await this.render(t,this.apiClient),this.showSaveStatus("체인이 삭제되었습니다.","success")}async toggleAlbaExpand(e){this.expandedRoleId=this.expandedRoleId===e?null:e;const t=document.querySelector(".ai-settings-panel").parentElement;await this.render(t,this.apiClient)}async toggleAlbaActive(e,t){try{await this.apiClient.patch(`/roles/${e}`,{active:t}),await this.loadAvailableRoles(),this.showSaveStatus(`알바가 ${t?"활성화":"비활성화"}되었습니다.`,"success")}catch(s){console.error("Failed to toggle alba:",s),this.showSaveStatus("상태 변경에 실패했습니다.","error")}}async updateAlbaMode(e,t){try{const s=this.availableRoles.find(r=>r.roleId===e);if(!s)return;const a={mode:t};t==="chain"&&!s.chainSteps&&(a.chainSteps=[]),t==="parallel"&&!s.parallelRoles&&(a.parallelRoles=[]),await this.apiClient.patch(`/roles/${e}`,a),await this.loadAvailableRoles(),this.expandedRoleId=e;const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("작동 방식이 변경되었습니다.","success")}catch(s){console.error("Failed to update alba mode:",s),this.showSaveStatus("방식 변경에 실패했습니다.","error")}}async updateAlbaModel(e,t){try{await this.apiClient.patch(`/roles/${e}`,{preferredModel:t}),await this.loadAvailableRoles(),this.showSaveStatus("모델이 변경되었습니다.","success")}catch(s){console.error("Failed to update alba model:",s),this.showSaveStatus("모델 변경에 실패했습니다.","error")}}async saveAlbaPrompt(e,t){try{await this.apiClient.patch(`/roles/${e}`,{systemPrompt:t}),await this.loadAvailableRoles(),this.showSaveStatus("프롬프트가 저장되었습니다.","success")}catch(s){console.error("Failed to save alba prompt:",s),this.showSaveStatus("프롬프트 저장에 실패했습니다.","error")}}async updateAlbaField(e,t,s){try{await this.apiClient.patch(`/roles/${e}`,{[t]:s}),await this.loadAvailableRoles(),this.showSaveStatus("설정이 저장되었습니다.","success")}catch(a){console.error(`Failed to update alba ${t}:`,a),this.showSaveStatus("저장에 실패했습니다.","error")}}async addAlbaTrigger(e,t){try{const s=this.availableRoles.find(r=>r.roleId===e);if(!s)return;const a=[...s.triggers||[],t];await this.apiClient.patch(`/roles/${e}`,{triggers:a}),await this.loadAvailableRoles(),this.expandedRoleId=e;const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("트리거가 추가되었습니다.","success")}catch(s){console.error("Failed to add trigger:",s),this.showSaveStatus("트리거 추가에 실패했습니다.","error")}}async removeAlbaTrigger(e,t){try{const s=this.availableRoles.find(r=>r.roleId===e);if(!s||!s.triggers)return;const a=s.triggers.filter((r,c)=>c!==t);await this.apiClient.patch(`/roles/${e}`,{triggers:a}),await this.loadAvailableRoles(),this.expandedRoleId=e;const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("트리거가 삭제되었습니다.","success")}catch(s){console.error("Failed to remove trigger:",s),this.showSaveStatus("트리거 삭제에 실패했습니다.","error")}}async addAlbaTag(e,t){try{const s=this.availableRoles.find(r=>r.roleId===e);if(!s)return;const a=[...s.tags||[],t];await this.apiClient.patch(`/roles/${e}`,{tags:a}),await this.loadAvailableRoles(),this.expandedRoleId=e;const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("태그가 추가되었습니다.","success")}catch(s){console.error("Failed to add tag:",s),this.showSaveStatus("태그 추가에 실패했습니다.","error")}}async removeAlbaTag(e,t){try{const s=this.availableRoles.find(r=>r.roleId===e);if(!s||!s.tags)return;const a=s.tags.filter((r,c)=>c!==t);await this.apiClient.patch(`/roles/${e}`,{tags:a}),await this.loadAvailableRoles(),this.expandedRoleId=e;const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("태그가 삭제되었습니다.","success")}catch(s){console.error("Failed to remove tag:",s),this.showSaveStatus("태그 삭제에 실패했습니다.","error")}}async editAlba(e){const t=this.availableRoles.find(n=>n.roleId===e);if(!t)return;const s=prompt("알바 이름:",t.name);if(s===null)return;const a=prompt("설명:",t.description);if(a!==null)try{await this.apiClient.patch(`/roles/${e}`,{name:s,description:a}),await this.loadAvailableRoles();const n=document.querySelector(".ai-settings-panel").parentElement;await this.render(n,this.apiClient),this.showSaveStatus("알바 정보가 수정되었습니다.","success")}catch(n){console.error("Failed to edit alba:",n),this.showSaveStatus("수정에 실패했습니다.","error")}}async deleteAlba(e){const t=this.availableRoles.find(s=>s.roleId===e);if(t&&confirm(`"${t.name}" 알바를 삭제하시겠습니까?`))try{await this.apiClient.delete(`/roles/${e}`),await this.loadAvailableRoles();const s=document.querySelector(".ai-settings-panel").parentElement;await this.render(s,this.apiClient),this.showSaveStatus("알바가 삭제되었습니다.","success")}catch(s){console.error("Failed to delete alba:",s),this.showSaveStatus("삭제에 실패했습니다.","error")}}async addAlba(){const e=prompt("새 알바 이름을 입력하세요:");if(!e)return;const t=prompt("알바 설명을 입력하세요:");if(t===null)return;const s=`custom-${Date.now()}`;try{await this.apiClient.post("/roles",{roleId:s,name:e,description:t,systemPrompt:`당신은 ${e}입니다.
${t}`,triggers:[e.toLowerCase()],createdBy:"user",category:"other"}),await this.loadAvailableRoles();const a=document.querySelector(".ai-settings-panel").parentElement;await this.render(a,this.apiClient),this.showSaveStatus("새 알바가 추가되었습니다.","success")}catch(a){console.error("Failed to add alba:",a),this.showSaveStatus("알바 추가에 실패했습니다.","error")}}async addAlbaChainStep(e){try{const t=this.availableRoles.find(n=>n.roleId===e);if(!t)return;const s=t.chainSteps||[];s.push(""),await this.apiClient.patch(`/roles/${e}`,{chainSteps:s}),await this.loadAvailableRoles(),this.expandedRoleId=e;const a=document.querySelector(".ai-settings-panel").parentElement;await this.render(a,this.apiClient)}catch(t){console.error("Failed to add chain step:",t),this.showSaveStatus("단계 추가에 실패했습니다.","error")}}async removeAlbaChainStep(e,t){try{const s=this.availableRoles.find(n=>n.roleId===e);if(!s||!s.chainSteps)return;s.chainSteps.splice(t,1),await this.apiClient.patch(`/roles/${e}`,{chainSteps:s.chainSteps}),await this.loadAvailableRoles(),this.expandedRoleId=e;const a=document.querySelector(".ai-settings-panel").parentElement;await this.render(a,this.apiClient)}catch(s){console.error("Failed to remove chain step:",s),this.showSaveStatus("단계 제거에 실패했습니다.","error")}}async updateAlbaChainStep(e,t,s){try{const a=this.availableRoles.find(r=>r.roleId===e);if(!a)return;const n=a.chainSteps||[];n[t]=s,await this.apiClient.patch(`/roles/${e}`,{chainSteps:n}),await this.loadAvailableRoles(),this.showSaveStatus("체인 단계가 저장되었습니다.","success")}catch(a){console.error("Failed to update chain step:",a),this.showSaveStatus("단계 저장에 실패했습니다.","error")}}async toggleAlbaParallelRole(e,t,s){try{const a=this.availableRoles.find(r=>r.roleId===e);if(!a)return;const n=a.parallelRoles||[];if(s&&!n.includes(t))n.push(t);else if(!s){const r=n.indexOf(t);r>-1&&n.splice(r,1)}await this.apiClient.patch(`/roles/${e}`,{parallelRoles:n}),await this.loadAvailableRoles(),this.showSaveStatus("병렬 실행 설정이 저장되었습니다.","success")}catch(a){console.error("Failed to toggle parallel role:",a),this.showSaveStatus("설정 저장에 실패했습니다.","error")}}showSaveStatus(e,t="success"){const s=document.getElementById("saveStatus");s&&(s.textContent=e,s.className=`settings-save-status ${t}`,s.style.display="block",setTimeout(()=>{s.style.display="none"},3e3))}}export{E as AISettings};
