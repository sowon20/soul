class v{constructor(){this.profile=null,this.userId="sowon"}async render(s,e){var t;this.container=s,this.apiClient=e;try{const i=await e.get("/profile/p?userId=sowon");this.profile=i.profile,s.innerHTML=`
        <div class="profile-settings-panel">
          <!-- 프로필 사진 -->
          <section class="settings-section profile-image-section">
            <div class="profile-image-container">
              <div class="profile-image-wrapper" id="profileImageWrapper">
                ${this.profile.profileImage?`<img src="${this.profile.profileImage}" alt="프로필 사진" class="profile-image-preview">`:`<div class="profile-image-placeholder">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                         <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                         <circle cx="12" cy="7" r="4"/>
                       </svg>
                     </div>`}
                <div class="profile-image-overlay">
                  <label for="profileImageInput" class="profile-image-upload-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </label>
                  ${this.profile.profileImage?`
                    <button class="profile-image-delete-btn" id="deleteProfileImageBtn" title="사진 삭제">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  `:""}
                </div>
              </div>
              <input type="file" id="profileImageInput" accept="image/*" style="display: none;">
              <div class="profile-image-info">
                <span class="profile-image-name">${((t=this.profile.basicInfo.name)==null?void 0:t.value)||"소원"}</span>
              </div>
            </div>
          </section>

          <!-- 기본 정보 -->
          <section class="settings-section">
            <h3 class="settings-section-title">기본 정보</h3>
            <div class="settings-fields">
              ${this.renderBasicInfoFields()}
            </div>
          </section>

          <!-- 추가 정보 -->
          <section class="settings-section">
            <div class="settings-section-header">
              <h3 class="settings-section-title">추가 정보</h3>
              <button class="settings-btn settings-btn-add" id="addFieldBtn">
                <span>+</span>
                <span>필드 추가</span>
              </button>
            </div>
            <div class="settings-fields" id="customFieldsContainer">
              ${this.renderCustomFields()}
            </div>
          </section>
        </div>

        <!-- 저장 상태 표시 -->
        <div class="settings-save-status" id="saveStatus"></div>
      `,this.attachEventListeners(s,e)}catch(i){console.error("Failed to load profile:",i),s.innerHTML=`
        <div class="settings-error">
          <p>프로필을 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">${i.message}</p>
        </div>
      `}}renderBasicInfoFields(){return[{key:"name",label:"이름",type:"text",placeholder:"이름을 입력하세요"},{key:"nickname",label:"닉네임",type:"text",placeholder:"닉네임을 입력하세요"},{key:"email",label:"이메일",type:"email",placeholder:"email@example.com"},{key:"phone",label:"전화번호",type:"tel",placeholder:"010-0000-0000"},{key:"birthDate",label:"생년월일",type:"date",placeholder:""},{key:"gender",label:"성별",type:"select",options:["남성","여성","기타"]},{key:"idNumber",label:"주민번호",type:"text",placeholder:"000000-0000000",sensitive:!0},{key:"country",label:"국가",type:"text",placeholder:"대한민국"},{key:"address",label:"주소",type:"text",placeholder:"주소를 입력하세요"},{key:"timezone",label:"타임존",type:"select",options:["Asia/Seoul","UTC","America/New_York","Europe/London"]},{key:"language",label:"언어",type:"select",options:["ko","en","ja","zh"]}].map(e=>{const t=this.profile.basicInfo[e.key]||{},i=t.value||"",a=t.visibility||{visibleToSoul:!0,autoIncludeInContext:!0};let o="";if(e.type==="select"){const l=e.options.map(r=>`<option value="${r}" ${i===r?"selected":""}>${r}</option>`).join("");o=`
          <select class="settings-input" data-basic-field="${e.key}">
            <option value="">선택 안함</option>
            ${l}
          </select>
        `}else if(e.type==="date"){const l=i?new Date(i).toISOString().split("T")[0]:"";o=`
          <input type="${e.type}"
                 class="settings-input"
                 value="${l}"
                 data-basic-field="${e.key}"
                 placeholder="${e.placeholder}">
        `}else o=`
          <input type="${e.type}"
                 class="settings-input"
                 value="${i}"
                 data-basic-field="${e.key}"
                 placeholder="${e.placeholder}">
        `;return`
        <div class="settings-field">
          <div class="settings-field-header">
            <label>${e.label}</label>
            <div class="settings-field-toggles">
              <label class="toggle-label" title="소울에게 공개">
                <input type="checkbox"
                       class="toggle-checkbox"
                       data-basic-field="${e.key}"
                       data-visibility="visibleToSoul"
                       ${a.visibleToSoul?"checked":""}>
                <span class="toggle-icon">${a.visibleToSoul?"👁️":"🔒"}</span>
              </label>
              <label class="toggle-label" title="자동 포함">
                <input type="checkbox"
                       class="toggle-checkbox"
                       data-basic-field="${e.key}"
                       data-visibility="autoIncludeInContext"
                       ${a.autoIncludeInContext?"checked":""}>
                <span class="toggle-icon">${a.autoIncludeInContext?"🔄":"⏸️"}</span>
              </label>
            </div>
          </div>
          ${o}
          ${e.sensitive?'<small class="settings-field-hint">⚠️ 민감 정보</small>':""}
        </div>
      `}).join("")}renderCustomFields(){return!this.profile.customFields||this.profile.customFields.length===0?'<p class="settings-empty">추가 필드가 없습니다. "필드 추가" 버튼을 눌러 정보를 추가하세요.</p>':[...this.profile.customFields].sort((e,t)=>e.order-t.order).map(e=>`
      <div class="settings-custom-field" draggable="true" data-field-id="${e.id}">
        <span class="settings-field-drag-handle">⋮⋮</span>
        <div class="settings-field-content">
          <div class="settings-field-header">
            <input type="text"
                   class="settings-field-label"
                   value="${e.label}"
                   data-field-id="${e.id}"
                   data-prop="label"
                   placeholder="필드 이름">
            <button class="settings-field-delete" data-field-id="${e.id}">×</button>
          </div>
          <div class="settings-field-value">
            ${this.renderCustomFieldInput(e)}
          </div>
          <div class="settings-field-meta">
            <select class="settings-field-type" data-field-id="${e.id}" data-prop="type">
              <option value="text" ${e.type==="text"?"selected":""}>텍스트</option>
              <option value="number" ${e.type==="number"?"selected":""}>숫자</option>
              <option value="date" ${e.type==="date"?"selected":""}>날짜</option>
              <option value="textarea" ${e.type==="textarea"?"selected":""}>긴 텍스트</option>
            </select>
          </div>
        </div>
      </div>
    `).join("")}renderCustomFieldInput(s){const e=s.value||"";switch(s.type){case"textarea":return`<textarea class="settings-field-input" data-field-id="${s.id}" data-prop="value" placeholder="내용을 입력하세요">${e}</textarea>`;case"number":return`<input type="number" class="settings-field-input" value="${e}" data-field-id="${s.id}" data-prop="value" placeholder="숫자를 입력하세요">`;case"date":return`<input type="date" class="settings-field-input" value="${e?new Date(e).toISOString().split("T")[0]:""}" data-field-id="${s.id}" data-prop="value">`;default:return`<input type="text" class="settings-field-input" value="${e}" data-field-id="${s.id}" data-prop="value" placeholder="내용을 입력하세요">`}}attachEventListeners(s,e){const t=s.querySelector("#profileImageInput");t&&t.addEventListener("change",o=>this.handleProfileImageUpload(o));const i=s.querySelector("#deleteProfileImageBtn");i&&i.addEventListener("click",()=>this.deleteProfileImage()),s.querySelectorAll(".settings-input[data-basic-field]").forEach(o=>{o.addEventListener("change",l=>this.saveBasicInfoValue(l.target,e))}),s.querySelectorAll(".toggle-checkbox[data-basic-field]").forEach(o=>{o.addEventListener("change",l=>this.saveBasicInfoVisibility(l.target,e))});const a=s.querySelector("#addFieldBtn");a&&a.addEventListener("click",()=>this.addField(s,e)),this.attachCustomFieldEventListeners(s)}async handleProfileImageUpload(s){const e=s.target.files[0];if(e){if(!e.type.startsWith("image/")){this.showSaveStatus("이미지 파일만 업로드 가능합니다.","error");return}if(e.size>5*1024*1024){this.showSaveStatus("이미지 크기는 5MB 이하여야 합니다.","error");return}try{this.showSaveStatus("업로드 중...","info");const t=await this.resizeAndConvertToBase64(e,400,400),a=await(await fetch("/api/profile/p/image",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,imageData:t})})).json();if(!a.success)throw new Error(a.error||"업로드 실패");this.profile.profileImage=t,await this.render(this.container,this.apiClient),this.showSaveStatus("프로필 사진 저장됨","success"),this.updateMainAvatar(t)}catch(t){console.error("프로필 사진 업로드 실패:",t),this.showSaveStatus("업로드 실패","error")}}}resizeAndConvertToBase64(s,e,t){return new Promise((i,a)=>{const o=new FileReader;o.onload=l=>{const r=new Image;r.onload=()=>{const d=document.createElement("canvas");let{width:c,height:n}=r;c>n?c>e&&(n=Math.round(n*e/c),c=e):n>t&&(c=Math.round(c*t/n),n=t),d.width=c,d.height=n,d.getContext("2d").drawImage(r,0,0,c,n);const u=d.toDataURL("image/jpeg",.8);i(u)},r.onerror=a,r.src=l.target.result},o.onerror=a,o.readAsDataURL(s)})}async deleteProfileImage(){if(confirm("프로필 사진을 삭제하시겠습니까?"))try{this.showSaveStatus("삭제 중...","info");const e=await(await fetch(`/api/profile/p/image?userId=${this.userId}`,{method:"DELETE"})).json();if(!e.success)throw new Error(e.error||"삭제 실패");this.profile.profileImage=null,await this.render(this.container,this.apiClient),this.showSaveStatus("프로필 사진 삭제됨","success"),this.updateMainAvatar(null)}catch(s){console.error("프로필 사진 삭제 실패:",s),this.showSaveStatus("삭제 실패","error")}}updateMainAvatar(s){const e=document.querySelector(".profile-section .avatar");e&&(s?(e.style.backgroundImage=`url(${s})`,e.style.backgroundSize="cover",e.style.backgroundPosition="center"):e.style.backgroundImage="")}updateMainProfile(s,e){if(s==="name"){const t=document.querySelector(".profile-section .user-name");t&&(t.textContent=e||"소원")}else if(s==="email"){const t=document.querySelector(".profile-section .user-email");t&&(t.textContent=e||"")}}async saveBasicInfoValue(s,e){const t=s.dataset.basicField,i=s.value;try{if(this.showSaveStatus("저장 중...","info"),this.profile.basicInfo[t]||(this.profile.basicInfo[t]={}),this.profile.basicInfo[t].value=i,!(await fetch(`/api/profile/p/basic/${t}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({value:i})})).ok)throw new Error("저장 실패");this.updateMainProfile(t,i),this.showSaveStatus("✓ 저장됨","success"),setTimeout(()=>this.hideSaveStatus(),2e3)}catch(a){console.error("기본 정보 저장 실패:",a),this.showSaveStatus("❌ 저장 실패","error"),setTimeout(()=>this.hideSaveStatus(),3e3)}}async saveBasicInfoVisibility(s,e){const t=s.dataset.basicField,i=s.dataset.visibility,a=s.checked;try{const o=s.nextElementSibling;if(i==="visibleToSoul"?o.textContent=a?"👁️":"🔒":i==="autoIncludeInContext"&&(o.textContent=a?"🔄":"⏸️"),this.showSaveStatus("저장 중...","info"),this.profile.basicInfo[t]||(this.profile.basicInfo[t]={visibility:{}}),this.profile.basicInfo[t].visibility||(this.profile.basicInfo[t].visibility={}),this.profile.basicInfo[t].visibility[i]=a,!(await fetch(`/api/profile/p/basic/${t}/visibility`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({[i]:a})})).ok)throw new Error("저장 실패");this.showSaveStatus("✓ 저장됨","success"),setTimeout(()=>this.hideSaveStatus(),2e3)}catch(o){console.error("기본 정보 저장 실패:",o),this.showSaveStatus("✗ 저장 실패","error")}}async addField(s,e){var t;try{this.showSaveStatus("필드 추가 중...","info");const i={userId:this.userId,label:"새 필드",value:"",type:"text",order:(((t=this.profile.customFields)==null?void 0:t.length)||0)+1},o=await(await fetch("/api/profile/p/fields",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i)})).json();if(!o.success)throw new Error(o.error||"필드 추가 실패");this.profile.customFields||(this.profile.customFields=[]),this.profile.customFields.push(o.field),this.refreshCustomFields(s),this.showSaveStatus("✓ 필드 추가됨","success"),setTimeout(()=>this.hideSaveStatus(),2e3)}catch(i){console.error("필드 추가 실패:",i),this.showSaveStatus("❌ 필드 추가 실패","error"),setTimeout(()=>this.hideSaveStatus(),3e3)}}refreshCustomFields(s){const e=s.querySelector("#customFieldsContainer");e&&(e.innerHTML=this.renderCustomFields(),this.attachCustomFieldEventListeners(s))}async saveCustomFieldValue(s,e,t){try{this.showSaveStatus("저장 중...","info");const i=this.profile.customFields.find(l=>l.id===s);i&&(i[e]=t);const o=await(await fetch(`/api/profile/p/fields/${s}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,[e]:t})})).json();if(!o.success)throw new Error(o.error||"저장 실패");this.showSaveStatus("✓ 저장됨","success"),setTimeout(()=>this.hideSaveStatus(),2e3)}catch(i){console.error("필드 저장 실패:",i),this.showSaveStatus("❌ 저장 실패","error"),setTimeout(()=>this.hideSaveStatus(),3e3)}}async deleteCustomField(s){if(confirm("이 필드를 삭제하시겠습니까?"))try{this.showSaveStatus("삭제 중...","info");const t=await(await fetch(`/api/profile/p/fields/${s}?userId=${this.userId}`,{method:"DELETE"})).json();if(!t.success)throw new Error(t.error||"삭제 실패");this.profile.customFields=this.profile.customFields.filter(i=>i.id!==s),this.refreshCustomFields(this.container),this.showSaveStatus("✓ 필드 삭제됨","success"),setTimeout(()=>this.hideSaveStatus(),2e3)}catch(e){console.error("필드 삭제 실패:",e),this.showSaveStatus("❌ 삭제 실패","error"),setTimeout(()=>this.hideSaveStatus(),3e3)}}async reorderFields(s){try{const t=await(await fetch("/api/profile/p/fields/reorder",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,fieldOrders:s})})).json();if(!t.success)throw new Error(t.error||"순서 변경 실패");this.profile.customFields=t.customFields,this.showSaveStatus("✓ 순서 변경됨","success"),setTimeout(()=>this.hideSaveStatus(),2e3)}catch(e){console.error("순서 변경 실패:",e),this.showSaveStatus("❌ 순서 변경 실패","error"),setTimeout(()=>this.hideSaveStatus(),3e3)}}attachCustomFieldEventListeners(s){s.querySelectorAll(".settings-field-input[data-field-id]").forEach(e=>{e.addEventListener("change",t=>{const i=t.target.dataset.fieldId,a=t.target.dataset.prop;this.saveCustomFieldValue(i,a,t.target.value)})}),s.querySelectorAll(".settings-field-label[data-field-id]").forEach(e=>{e.addEventListener("change",t=>{const i=t.target.dataset.fieldId;this.saveCustomFieldValue(i,"label",t.target.value)})}),s.querySelectorAll(".settings-field-type[data-field-id]").forEach(e=>{e.addEventListener("change",t=>{const i=t.target.dataset.fieldId;this.saveCustomFieldValue(i,"type",t.target.value);const a=this.profile.customFields.find(o=>o.id===i);a&&(a.type=t.target.value,this.refreshCustomFields(s))})}),s.querySelectorAll(".settings-field-delete[data-field-id]").forEach(e=>{e.addEventListener("click",t=>{const i=t.target.closest(".settings-field-delete").dataset.fieldId;this.deleteCustomField(i)})}),this.setupDragAndDrop(s)}setupDragAndDrop(s){const e=s.querySelector("#customFieldsContainer");if(!e)return;let t=null;const i=r=>{t=r.target.closest(".settings-custom-field"),t&&(t.classList.add("dragging"),r.dataTransfer.effectAllowed="move")},a=r=>{r.preventDefault(),r.dataTransfer.dropEffect="move";const d=l(e,r.clientY);t&&(d?e.insertBefore(t,d):e.appendChild(t))},o=()=>{if(t){t.classList.remove("dragging");const r=e.querySelectorAll(".settings-custom-field"),d=Array.from(r).map((c,n)=>({id:c.dataset.fieldId,order:n+1}));this.reorderFields(d),t=null}},l=(r,d)=>[...r.querySelectorAll(".settings-custom-field:not(.dragging)")].reduce((n,p)=>{const u=p.getBoundingClientRect(),h=d-u.top-u.height/2;return h<0&&h>n.offset?{offset:h,element:p}:n},{offset:Number.NEGATIVE_INFINITY}).element;e.addEventListener("dragstart",i),e.addEventListener("dragover",a),e.addEventListener("dragend",o)}showSaveStatus(s,e){const t=document.getElementById("saveStatus");t&&(t.textContent=s,t.className=`settings-save-status ${e}`,t.style.display="block")}hideSaveStatus(){const s=document.getElementById("saveStatus");s&&(s.style.display="none")}}export{v as ProfileSettings};
