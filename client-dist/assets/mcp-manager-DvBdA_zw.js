class g{constructor(e){this.apiClient=e,this.structures=[],this.rooms=[],this.devices=[],this.stats=null,this.currentView="overview",this.selectedStructure=null,this.selectedRoom=null,this.showHidden=!1,this.appleTVDevices=[],this.airplayDevices=[],this.networkDevices=[],this.networkInfo=null}async render(e){try{await this.loadAllData(),e.innerHTML=`
        <div class="google-home-manager">
          ${this.renderHeader()}
          ${this.renderTabs()}
          <div class="ghm-content">
            ${this.renderCurrentView()}
          </div>
        </div>
      `,this.attachEventListeners(e)}catch(t){console.error("Failed to render Google Home Manager:",t),e.innerHTML=`
        <div class="ghm-error">
          <p>Google Home 데이터를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${t.message}</p>
        </div>
      `}}async loadAllData(){const[e,t,i,a]=await Promise.all([this.apiClient.get("/google-home/structures"),this.apiClient.get("/google-home/rooms"),this.apiClient.get(`/google-home/devices?showHidden=${this.showHidden}`),this.apiClient.get("/google-home/stats")]);this.structures=e.structures||[],this.rooms=t.rooms||[],this.devices=i.devices||[],this.stats=a.stats||null}renderHeader(){return`
      <div class="ghm-header">
        <div class="ghm-title">
          <span style="font-size: 1.5rem;">🏠</span>
          <h2>Google Home 관리</h2>
        </div>
        <div class="ghm-actions">
          <label class="ghm-checkbox">
            <input type="checkbox" id="showHiddenToggle" ${this.showHidden?"checked":""}>
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
    `}renderTabs(){return`
      <div class="ghm-tabs">
        ${[{id:"overview",label:"개요",icon:"📊"},{id:"structures",label:"장소",icon:"🏢",count:this.structures.length},{id:"rooms",label:"방",icon:"🚪",count:this.rooms.length},{id:"devices",label:"기기",icon:"📱",count:this.devices.length},{id:"appletv",label:"Apple TV",icon:"📺"},{id:"airplay",label:"AirPlay",icon:"📡"},{id:"network",label:"네트워크",icon:"🌐"}].map(t=>`
          <button class="ghm-tab ${this.currentView===t.id?"active":""}" data-view="${t.id}">
            <span>${t.icon}</span>
            <span>${t.label}</span>
            ${t.count!==void 0?`<span class="ghm-badge">${t.count}</span>`:""}
          </button>
        `).join("")}
      </div>
    `}renderCurrentView(){switch(this.currentView){case"overview":return this.renderOverview();case"structures":return this.renderStructures();case"rooms":return this.renderRooms();case"devices":return this.renderDevices();case"appletv":return this.renderAppleTV();case"airplay":return this.renderAirPlay();case"network":return this.renderNetwork();default:return this.renderOverview()}}renderOverview(){if(!this.stats)return'<div class="ghm-loading">로딩 중...</div>';const{totalDevices:e,onlineDevices:t,structures:i,rooms:a,deviceTypes:o,hiddenDevices:r,disabledDevices:l,typeBreakdown:s}=this.stats;return`
      <div class="ghm-overview">
        <div class="ghm-stats-grid">
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">📱</div>
            <div class="ghm-stat-value">${e}</div>
            <div class="ghm-stat-label">전체 기기</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">💡</div>
            <div class="ghm-stat-value">${t}</div>
            <div class="ghm-stat-label">켜진 기기</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">🏢</div>
            <div class="ghm-stat-value">${i}</div>
            <div class="ghm-stat-label">장소</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">🚪</div>
            <div class="ghm-stat-value">${a}</div>
            <div class="ghm-stat-label">방</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">🔌</div>
            <div class="ghm-stat-value">${o}</div>
            <div class="ghm-stat-label">기기 종류</div>
          </div>
          <div class="ghm-stat-card">
            <div class="ghm-stat-icon">👁️</div>
            <div class="ghm-stat-value">${r}</div>
            <div class="ghm-stat-label">숨긴 기기</div>
          </div>
        </div>

        <div class="ghm-section">
          <h3>기기 종류별 현황</h3>
          <div class="ghm-type-list">
            ${s.map(n=>`
              <div class="ghm-type-item">
                <span class="ghm-type-icon">${this.getTypeIcon(n.type)}</span>
                <span class="ghm-type-name">${this.getTypeName(n.type)}</span>
                <span class="ghm-type-count">${n.count}개</span>
              </div>
            `).join("")}
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
    `}renderStructures(){return this.structures.length===0?'<div class="ghm-empty">등록된 장소가 없습니다.</div>':`
      <div class="ghm-structures">
        <div class="ghm-list">
          ${this.structures.map(e=>`
            <div class="ghm-list-item ${e.hidden?"ghm-hidden":""}" data-structure="${e.name}">
              <div class="ghm-item-icon">
                ${e.type==="store"?"🏪":e.type==="office"?"🏢":"🏠"}
              </div>
              <div class="ghm-item-info">
                <div class="ghm-item-name">${e.name}</div>
                <div class="ghm-item-meta">
                  ${e.deviceCount}개 기기 · ${e.hidden?"숨김":e.enabled?"활성":"비활성"}
                </div>
              </div>
              <div class="ghm-item-actions">
                <button class="ghm-btn-icon" data-action="edit-structure" data-name="${e.name}" title="편집">
                  ✏️
                </button>
                <button class="ghm-btn-icon" data-action="toggle-hide-structure" data-name="${e.name}" data-hidden="${e.hidden}" title="${e.hidden?"표시":"숨기기"}">
                  ${e.hidden?"👁️":"🙈"}
                </button>
                <label class="ghm-switch">
                  <input type="checkbox" ${e.enabled?"checked":""} data-action="toggle-structure" data-name="${e.name}">
                  <span class="ghm-slider"></span>
                </label>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `}renderRooms(){const e={};return this.rooms.forEach(t=>{e[t.structure]||(e[t.structure]=[]),e[t.structure].push(t)}),Object.keys(e).length===0?'<div class="ghm-empty">등록된 방이 없습니다.</div>':`
      <div class="ghm-rooms">
        ${Object.entries(e).map(([t,i])=>`
          <div class="ghm-group">
            <div class="ghm-group-header">
              <span>🏠 ${t}</span>
              <span class="ghm-badge">${i.length}</span>
            </div>
            <div class="ghm-list">
              ${i.map(a=>`
                <div class="ghm-list-item ${a.hidden?"ghm-hidden":""}" data-room="${a.name}" data-structure="${a.structure}">
                  <div class="ghm-item-icon">🚪</div>
                  <div class="ghm-item-info">
                    <div class="ghm-item-name">${a.name}</div>
                    <div class="ghm-item-meta">
                      ${a.deviceCount}개 기기 · ${a.hidden?"숨김":a.enabled?"활성":"비활성"}
                    </div>
                  </div>
                  <div class="ghm-item-actions">
                    <button class="ghm-btn-icon" data-action="edit-room" data-name="${a.name}" data-structure="${a.structure}" title="편집">
                      ✏️
                    </button>
                    <button class="ghm-btn-icon" data-action="toggle-hide-room" data-name="${a.name}" data-structure="${a.structure}" data-hidden="${a.hidden}" title="${a.hidden?"표시":"숨기기"}">
                      ${a.hidden?"👁️":"🙈"}
                    </button>
                    <label class="ghm-switch">
                      <input type="checkbox" ${a.enabled?"checked":""} data-action="toggle-room" data-name="${a.name}" data-structure="${a.structure}">
                      <span class="ghm-slider"></span>
                    </label>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `}renderDevices(){const e={};return this.devices.forEach(t=>{const i=`${t.structure}:${t.room||"미지정"}`;e[i]||(e[i]={structure:t.structure,room:t.room||"미지정",devices:[]}),e[i].devices.push(t)}),Object.keys(e).length===0?'<div class="ghm-empty">등록된 기기가 없습니다.</div>':`
      <div class="ghm-devices">
        <div class="ghm-toolbar">
          <select id="filterStructure" class="ghm-select">
            <option value="">모든 장소</option>
            ${this.structures.map(t=>`<option value="${t.name}">${t.name}</option>`).join("")}
          </select>
          <select id="filterType" class="ghm-select">
            <option value="">모든 종류</option>
            ${[...new Set(this.devices.map(t=>t.type))].map(t=>`<option value="${t}">${this.getTypeName(t)}</option>`).join("")}
          </select>
        </div>

        ${Object.values(e).map(t=>`
          <div class="ghm-group">
            <div class="ghm-group-header">
              <span>📍 ${t.structure} > ${t.room}</span>
              <span class="ghm-badge">${t.devices.length}</span>
            </div>
            <div class="ghm-device-grid">
              ${t.devices.map(i=>this.renderDeviceCard(i)).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `}renderDeviceCard(e){var o;const t=((o=e.state)==null?void 0:o.on)===!0,i=this.getTypeIcon(e.type),a=this.getTypeName(e.type);return`
      <div class="ghm-device-card ${e.hidden?"ghm-hidden":""} ${t?"ghm-device-on":""}"
           data-device-id="${e.id}">
        <div class="ghm-device-header">
          <span class="ghm-device-icon">${i}</span>
          <div class="ghm-device-status ${t?"on":"off"}"></div>
        </div>
        <div class="ghm-device-name">${e.customName||e.name}</div>
        <div class="ghm-device-type">${a}</div>
        <div class="ghm-device-actions">
          <button class="ghm-btn-sm ${t?"active":""}" data-action="control" data-id="${e.id}" data-cmd="toggle">
            ${t?"끄기":"켜기"}
          </button>
          <button class="ghm-btn-icon-sm" data-action="edit-device" data-id="${e.id}" title="설정">
            ⚙️
          </button>
          <button class="ghm-btn-icon-sm" data-action="toggle-hide-device" data-id="${e.id}" data-hidden="${e.hidden}" title="${e.hidden?"표시":"숨기기"}">
            ${e.hidden?"👁️":"🙈"}
          </button>
        </div>
      </div>
    `}renderDeviceEditModal(e){return`
      <div class="ghm-modal-overlay" id="deviceEditModal">
        <div class="ghm-modal">
          <div class="ghm-modal-header">
            <h3>기기 설정</h3>
            <button class="ghm-modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="ghm-modal-body">
            <div class="ghm-form-group">
              <label>표시 이름</label>
              <input type="text" id="deviceCustomName" value="${e.customName||e.name}" placeholder="${e.name}">
            </div>
            <div class="ghm-form-group">
              <label>장소</label>
              <select id="deviceStructure">
                ${this.structures.map(t=>`
                  <option value="${t.name}" ${t.name===e.structure?"selected":""}>${t.name}</option>
                `).join("")}
              </select>
            </div>
            <div class="ghm-form-group">
              <label>방</label>
              <select id="deviceRoom">
                ${this.rooms.filter(t=>t.structure===e.structure).map(t=>`
                  <option value="${t.name}" ${t.name===e.room?"selected":""}>${t.name}</option>
                `).join("")}
              </select>
            </div>
            <div class="ghm-form-group">
              <label class="ghm-checkbox">
                <input type="checkbox" id="deviceEnabled" ${e.enabled?"checked":""}>
                <span>AI 제어 활성화</span>
              </label>
            </div>
            <div class="ghm-form-group">
              <label class="ghm-checkbox">
                <input type="checkbox" id="deviceHidden" ${e.hidden?"checked":""}>
                <span>목록에서 숨기기</span>
              </label>
            </div>
          </div>
          <div class="ghm-modal-footer">
            <button class="ghm-btn" data-action="close-modal">취소</button>
            <button class="ghm-btn ghm-btn-primary" data-action="save-device" data-id="${e.id}">저장</button>
          </div>
        </div>
      </div>
    `}attachEventListeners(e){e.querySelectorAll(".ghm-tab").forEach(s=>{s.addEventListener("click",async()=>{this.currentView=s.dataset.view,await this.render(e)})});const t=e.querySelector("#ghmRefresh");t&&t.addEventListener("click",async()=>{await this.render(e)});const i=e.querySelector("#showHiddenToggle");i&&i.addEventListener("change",async s=>{this.showHidden=s.target.checked,await this.render(e)}),e.querySelectorAll('[data-action="toggle-structure"]').forEach(s=>{s.addEventListener("change",async n=>{const d=n.target.dataset.name;await this.apiClient.put(`/google-home/structures/${encodeURIComponent(d)}`,{enabled:n.target.checked}),await this.render(e)})}),e.querySelectorAll('[data-action="toggle-hide-structure"]').forEach(s=>{s.addEventListener("click",async()=>{const n=s.dataset.name,d=s.dataset.hidden==="true";await this.apiClient.put(`/google-home/structures/${encodeURIComponent(n)}`,{hidden:!d}),await this.render(e)})}),e.querySelectorAll('[data-action="toggle-room"]').forEach(s=>{s.addEventListener("change",async n=>{const d=n.target.dataset.name,c=n.target.dataset.structure;await this.apiClient.put(`/google-home/rooms/${encodeURIComponent(c)}/${encodeURIComponent(d)}`,{enabled:n.target.checked}),await this.render(e)})}),e.querySelectorAll('[data-action="toggle-hide-room"]').forEach(s=>{s.addEventListener("click",async()=>{const n=s.dataset.name,d=s.dataset.structure,c=s.dataset.hidden==="true";await this.apiClient.put(`/google-home/rooms/${encodeURIComponent(d)}/${encodeURIComponent(n)}`,{hidden:!c}),await this.render(e)})}),e.querySelectorAll('[data-action="control"]').forEach(s=>{s.addEventListener("click",async()=>{const n=s.dataset.id,d=s.dataset.cmd;s.disabled=!0,s.textContent="...";try{await this.apiClient.post(`/google-home/devices/${n}/control`,{action:d}),setTimeout(()=>this.render(e),1e3)}catch(c){alert(`제어 실패: ${c.message}`),await this.render(e)}})}),e.querySelectorAll('[data-action="toggle-hide-device"]').forEach(s=>{s.addEventListener("click",async()=>{const n=s.dataset.id,d=s.dataset.hidden==="true";await this.apiClient.put(`/google-home/devices/${n}`,{hidden:!d}),await this.render(e)})}),e.querySelectorAll('[data-action="edit-device"]').forEach(s=>{s.addEventListener("click",async()=>{const n=s.dataset.id,d=this.devices.find(c=>c.id===n);d&&(e.insertAdjacentHTML("beforeend",this.renderDeviceEditModal(d)),this.attachModalListeners(e,d))})}),e.querySelectorAll('[data-action="all-off"]').forEach(s=>{s.addEventListener("click",async()=>{if(confirm("모든 조명을 끄시겠습니까?"))try{await this.apiClient.post("/mcp/google-home/control",{command:"모든 조명 꺼줘"}),setTimeout(()=>this.render(e),2e3)}catch(n){alert(`실패: ${n.message}`)}})}),e.querySelectorAll('[data-action="all-on"]').forEach(s=>{s.addEventListener("click",async()=>{if(confirm("모든 조명을 켜시겠습니까?"))try{await this.apiClient.post("/mcp/google-home/control",{command:"모든 조명 켜줘"}),setTimeout(()=>this.render(e),2e3)}catch(n){alert(`실패: ${n.message}`)}})});const a=e.querySelector("#scanAppleTV");a&&a.addEventListener("click",async()=>{a.disabled=!0,a.textContent="검색 중...";try{const s=await this.apiClient.get("/mcp/google-home/appletv/devices");this.appleTVDevices=s.devices||[],await this.render(e)}catch(s){alert(`Apple TV 검색 실패: ${s.message}
(로컬 네트워크에서만 작동합니다)`),a.disabled=!1,a.textContent="🔍 기기 검색"}});const o=e.querySelector("#scanAirPlay");o&&o.addEventListener("click",async()=>{o.disabled=!0,o.textContent="검색 중...";try{const s=await this.apiClient.get("/mcp/google-home/airplay/devices");this.airplayDevices=s.devices||[],await this.render(e)}catch(s){alert(`AirPlay 검색 실패: ${s.message}
(로컬 네트워크에서만 작동합니다)`),o.disabled=!1,o.textContent="🔍 기기 검색"}});const r=e.querySelector("#scanNetwork");r&&r.addEventListener("click",async()=>{r.disabled=!0,r.textContent="스캔 중...";try{const[s,n]=await Promise.all([this.apiClient.get("/mcp/google-home/network/scan"),this.apiClient.get("/mcp/google-home/network/info")]);this.networkDevices=s.devices||[],this.networkInfo=n,await this.render(e)}catch(s){alert(`네트워크 스캔 실패: ${s.message}
(로컬 네트워크에서만 작동합니다)`),r.disabled=!1,r.textContent="🔍 기기 스캔"}});const l=e.querySelector("#sendWol");l&&l.addEventListener("click",async()=>{var d;const s=e.querySelector("#wolMac"),n=(d=s==null?void 0:s.value)==null?void 0:d.trim();if(!n){alert("MAC 주소를 입력하세요");return}try{await this.apiClient.post("/mcp/google-home/network/wol",{mac:n}),alert(`WoL 패킷 전송됨: ${n}`)}catch(c){alert(`WoL 전송 실패: ${c.message}`)}})}attachModalListeners(e,t){var r;const i=e.querySelector("#deviceEditModal");if(!i)return;i.querySelectorAll('[data-action="close-modal"]').forEach(l=>{l.addEventListener("click",()=>i.remove())});const a=i.querySelector("#deviceStructure"),o=i.querySelector("#deviceRoom");a&&o&&a.addEventListener("change",()=>{const l=a.value,s=this.rooms.filter(n=>n.structure===l);o.innerHTML=s.map(n=>`<option value="${n.name}">${n.name}</option>`).join("")}),(r=i.querySelector('[data-action="save-device"]'))==null||r.addEventListener("click",async()=>{const l=t.id,s=i.querySelector("#deviceCustomName").value,n=i.querySelector("#deviceStructure").value,d=i.querySelector("#deviceRoom").value,c=i.querySelector("#deviceEnabled").checked,m=i.querySelector("#deviceHidden").checked;try{await this.apiClient.put(`/google-home/devices/${l}`,{customName:s!==t.name?s:null,structure:n,room:d,enabled:c,hidden:m}),i.remove(),await this.render(e)}catch(v){alert(`저장 실패: ${v.message}`)}})}getTypeIcon(e){return{OUTLET:"🔌",SWITCH:"🎚️",LIGHT:"💡",AC_UNIT:"❄️",TV:"📺",FAN:"🌀",SPEAKER:"🔊",VACUUM:"🧹",CAMERA:"📷",THERMOSTAT:"🌡️",HEATER:"🔥",HUMIDIFIER:"💨",AIRPURIFIER:"🌬️",WASHER:"🧺",BOILER:"♨️",LOCK:"🔒"}[e]||"📦"}getTypeName(e){return{OUTLET:"콘센트",SWITCH:"스위치",LIGHT:"조명",AC_UNIT:"에어컨",TV:"TV",FAN:"선풍기",SPEAKER:"스피커",VACUUM:"청소기",CAMERA:"카메라",THERMOSTAT:"온도조절기",HEATER:"히터",HUMIDIFIER:"가습기",AIRPURIFIER:"공기청정기",WASHER:"세탁기",BOILER:"보일러",LOCK:"도어락"}[e]||e}renderAppleTV(){return`
      <div class="ghm-section">
        <div class="ghm-section-header">
          <h3>📺 Apple TV</h3>
          <button class="ghm-btn ghm-btn-scan" id="scanAppleTV">
            🔍 기기 검색
          </button>
        </div>
        <p class="ghm-note">Apple TV 기기를 검색하고 제어합니다. (로컬 네트워크 필요)</p>

        <div id="appleTVList" class="ghm-device-list">
          ${this.appleTVDevices.length===0?`
            <div class="ghm-empty">
              <span style="font-size: 3rem;">📺</span>
              <p>검색된 Apple TV가 없습니다</p>
              <p class="ghm-note">같은 네트워크에서 검색 버튼을 눌러주세요</p>
            </div>
          `:this.appleTVDevices.map(e=>`
            <div class="ghm-device-card" data-id="${e.identifier}">
              <div class="ghm-device-icon">📺</div>
              <div class="ghm-device-info">
                <div class="ghm-device-name">${e.name}</div>
                <div class="ghm-device-meta">${e.address}</div>
                <div class="ghm-device-meta">${e.paired?"✅ 페어링됨":"🔗 페어링 필요"}</div>
              </div>
              <div class="ghm-device-actions">
                ${e.paired?`
                  <button class="ghm-btn ghm-btn-sm" data-action="atv-playpause" data-id="${e.identifier}">⏯️</button>
                  <button class="ghm-btn ghm-btn-sm" data-action="atv-menu" data-id="${e.identifier}">📋</button>
                `:`
                  <button class="ghm-btn ghm-btn-sm" data-action="atv-pair" data-id="${e.identifier}">🔗 페어링</button>
                `}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `}renderAirPlay(){return`
      <div class="ghm-section">
        <div class="ghm-section-header">
          <h3>📡 AirPlay</h3>
          <button class="ghm-btn ghm-btn-scan" id="scanAirPlay">
            🔍 기기 검색
          </button>
        </div>
        <p class="ghm-note">AirPlay 기기로 오디오/비디오를 스트리밍합니다.</p>

        <div id="airplayList" class="ghm-device-list">
          ${this.airplayDevices.length===0?`
            <div class="ghm-empty">
              <span style="font-size: 3rem;">📡</span>
              <p>검색된 AirPlay 기기가 없습니다</p>
              <p class="ghm-note">같은 네트워크에서 검색 버튼을 눌러주세요</p>
            </div>
          `:this.airplayDevices.map(e=>{var t;return`
            <div class="ghm-device-card">
              <div class="ghm-device-icon">🔊</div>
              <div class="ghm-device-info">
                <div class="ghm-device-name">${e.friendly_name||e.name}</div>
                <div class="ghm-device-meta">${((t=e.addresses)==null?void 0:t[0])||"Unknown IP"}</div>
                <div class="ghm-device-meta">${e.model||e.type}</div>
              </div>
            </div>
          `}).join("")}
        </div>
      </div>
    `}renderNetwork(){return`
      <div class="ghm-section">
        <div class="ghm-section-header">
          <h3>🌐 네트워크</h3>
          <button class="ghm-btn ghm-btn-scan" id="scanNetwork">
            🔍 기기 스캔
          </button>
        </div>
        <p class="ghm-note">로컬 네트워크의 스마트홈 기기를 검색합니다.</p>

        ${this.networkInfo?`
          <div class="ghm-info-box">
            <div><strong>로컬 IP:</strong> ${this.networkInfo.local_ip}</div>
            <div><strong>서브넷:</strong> ${this.networkInfo.subnet}</div>
            <div><strong>호스트:</strong> ${this.networkInfo.hostname}</div>
          </div>
        `:""}

        <div id="networkList" class="ghm-device-list">
          ${this.networkDevices.length===0?`
            <div class="ghm-empty">
              <span style="font-size: 3rem;">🌐</span>
              <p>검색된 기기가 없습니다</p>
              <p class="ghm-note">검색 버튼을 눌러 네트워크를 스캔하세요</p>
            </div>
          `:this.networkDevices.map(e=>{var t;return`
            <div class="ghm-device-card">
              <div class="ghm-device-icon">${this.getNetworkDeviceIcon(e.type)}</div>
              <div class="ghm-device-info">
                <div class="ghm-device-name">${e.friendly_name||e.name.split(".")[0]}</div>
                <div class="ghm-device-meta">${((t=e.addresses)==null?void 0:t[0])||"Unknown"}</div>
                <div class="ghm-device-meta">${e.type.replace("._tcp.local.","").replace("_","")}</div>
              </div>
            </div>
          `}).join("")}
        </div>

        <div class="ghm-section" style="margin-top: 1.5rem;">
          <h4>🔋 Wake-on-LAN</h4>
          <div class="ghm-wol-form">
            <input type="text" id="wolMac" placeholder="MAC 주소 (AA:BB:CC:DD:EE:FF)" class="ghm-input">
            <button class="ghm-btn" id="sendWol">⚡ WoL 전송</button>
          </div>
        </div>
      </div>
    `}getNetworkDeviceIcon(e){return e.includes("airplay")?"📡":e.includes("googlecast")?"🏠":e.includes("hap")?"🍎":e.includes("matter")?"🔗":e.includes("raop")?"🔊":"📦"}}class p{constructor(e){this.apiClient=e,this.servers=[],this.selectedServer=null,this.serverTools={}}async render(e){this.container=e;try{await this.loadServers(),this.renderUI(),this.attachEventListeners()}catch(t){console.error("Failed to render MCP manager:",t),e.innerHTML=`
        <div style="padding: 2rem; text-align: center; color: #ef4444;">
          <p>MCP 관리자를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${t.message}</p>
        </div>
      `}}renderUI(){this.container.innerHTML=`
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
    `}renderServerCards(){return this.servers.length===0?'<div style="padding: 2rem; text-align: center; color: #666;">등록된 MCP 서버가 없습니다.</div>':this.servers.map(e=>this.renderServerCard(e)).join("")}renderServerCard(e){var o;const i={"hub-server":"🔧","google-home":"🏠",todo:"📝"}[e.id]||(e.type==="built-in"?"🔧":"🔌"),a=e.enabled;return`
      <div class="server-card" data-server-id="${e.id}"
        style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem;">

        <!-- 헤더: 아이콘, 이름, 토글 -->
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <span style="font-size: 1.5rem;">${i}</span>
          <div style="flex: 1;">
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: #333;">${e.name}</h4>
            <p style="margin: 0.2rem 0 0 0; font-size: 0.75rem; color: #666;">${e.description}</p>
          </div>
          <label style="position: relative; width: 44px; height: 24px; cursor: pointer;">
            <input type="checkbox" class="server-toggle" data-server-id="${e.id}"
              ${a?"checked":""}
              style="opacity: 0; width: 0; height: 0;">
            <span style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${a?"#4285f4":"#ccc"}; border-radius: 24px; transition: 0.3s;">
              <span style="position: absolute; width: 18px; height: 18px; left: ${a?"23px":"3px"}; top: 3px; background: white; border-radius: 50%; transition: 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></span>
            </span>
          </label>
        </div>

        <!-- 메타 정보 -->
        <div style="display: flex; gap: 0.4rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
          <span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: ${e.type==="built-in"?"#e8f5e9":"#fff3e0"}; color: ${e.type==="built-in"?"#2e7d32":"#e65100"}; border-radius: 4px;">
            ${e.type==="built-in"?"내장":"외부"}
          </span>
          <span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: #e3f2fd; color: #1565c0; border-radius: 4px;">
            ${((o=e.tools)==null?void 0:o.length)||0}개 도구
          </span>
          ${e.port?`<span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: #fce4ec; color: #c2185b; border-radius: 4px;">포트 ${e.port}</span>`:""}
        </div>

        <!-- 버튼들 -->
        <div style="display: flex; gap: 0.5rem;">
          ${e.id==="google-home"?`
            <button class="btn-settings" data-server-id="${e.id}"
              style="flex: 1; padding: 0.5rem; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">
              ⚙️ 설정 페이지
            </button>
          `:""}
          <button class="btn-tools" data-server-id="${e.id}"
            style="flex: 1; padding: 0.5rem; background: ${e.id==="google-home"?"#f5f5f5":"#4285f4"}; color: ${e.id==="google-home"?"#333":"white"}; border: ${e.id==="google-home"?"1px solid #ddd":"none"}; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">
            📋 도구 목록
          </button>
        </div>
      </div>
    `}renderToolsPanel(e,t){const i=this.container.querySelector("#toolsPanel");i.innerHTML=`
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h4 style="margin: 0; font-size: 0.95rem; color: #333;">${e.name} 도구</h4>
          <button id="closeToolsPanel" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #666;">✕</button>
        </div>

        ${t.length===0?`
          <p style="text-align: center; color: #666; font-size: 0.85rem; padding: 1rem;">등록된 도구가 없습니다.</p>
        `:`
          <div style="display: grid; gap: 0.5rem;">
            ${t.map(a=>`
              <div style="background: #f9fafb; border: 1px solid #eee; border-radius: 8px; padding: 0.75rem;">
                <div style="font-weight: 600; font-size: 0.85rem; color: #333; margin-bottom: 0.25rem;">🛠️ ${a.name}</div>
                <div style="font-size: 0.75rem; color: #666;">${a.description||"설명 없음"}</div>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    `,i.style.display="block",i.querySelector("#closeToolsPanel").addEventListener("click",()=>{i.style.display="none"})}openGoogleHomeSettings(){const e=document.createElement("div");e.id="googleHomeModal",e.style.cssText=`
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: #f5f5f5; z-index: 2000;
      display: flex; flex-direction: column;
      animation: slideIn 0.3s ease;
    `,e.innerHTML=`
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
    `,document.body.appendChild(e);const t=e.querySelector("#googleHomeContent");new g(this.apiClient).render(t),e.querySelector("#closeGoogleHome").addEventListener("click",()=>{e.style.animation="slideOut 0.3s ease forwards",setTimeout(()=>e.remove(),300)})}async loadServers(){const e=await this.apiClient.get("/mcp/servers");this.servers=e.servers||[]}async loadServerTools(e){if(this.serverTools[e])return this.serverTools[e];try{const t=await this.apiClient.get(`/mcp/servers/${e}/tools`);return this.serverTools[e]=t.tools||[],this.serverTools[e]}catch(t){return console.error(`Failed to load tools for ${e}:`,t),[]}}async toggleServer(e,t){try{await this.apiClient.post(`/mcp/servers/${e}/enable`,{enabled:t});const i=this.servers.find(o=>o.id===e);i&&(i.enabled=t);const a=this.container.querySelector("#serverCards");a&&(a.innerHTML=this.renderServerCards(),this.attachCardListeners())}catch(i){console.error("Failed to toggle server:",i),alert("서버 상태 변경에 실패했습니다.")}}attachEventListeners(){const e=this.container.querySelector("#mcpRefreshBtn");e&&e.addEventListener("click",async()=>{e.textContent="⏳ 로딩...",await this.loadServers(),this.serverTools={},this.renderUI(),this.attachEventListeners()}),this.attachCardListeners()}attachCardListeners(){this.container.querySelectorAll(".server-toggle").forEach(e=>{e.addEventListener("change",t=>{const i=t.target.dataset.serverId,a=t.target.checked;this.toggleServer(i,a)})}),this.container.querySelectorAll(".btn-settings").forEach(e=>{e.addEventListener("click",t=>{t.target.dataset.serverId==="google-home"&&this.openGoogleHomeSettings()})}),this.container.querySelectorAll(".btn-tools").forEach(e=>{e.addEventListener("click",async t=>{const i=t.target.dataset.serverId,a=this.servers.find(r=>r.id===i);e.textContent="⏳ 로딩...";const o=await this.loadServerTools(i);e.textContent="📋 도구 목록",this.renderToolsPanel(a,o)})})}}export{p as MCPManager};
