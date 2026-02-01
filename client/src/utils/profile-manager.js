/**
 * Profile Manager - Phase P
 * 프로필 관리 (inline 편집, 드래그 정렬)
 */

export class ProfileManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.userId = localStorage.getItem('userId') || 'default';
    this.profile = null;
    this.draggedElement = null;
  }

  /**
   * 프로필 패널 렌더링
   */
  async renderProfilePanel(container) {
    try {
      // 프로필 로드
      const response = await fetch(`/api/profile/p?userId=${this.userId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '프로필 로드 실패');
      }

      this.profile = data.profile;

      // UI 렌더링
      container.innerHTML = `
        <div class="profile-panel">
          <!-- 프로필 사진 -->
          <div class="profile-section profile-image-section">
            <div class="profile-image-container">
              <div class="profile-image-wrapper" id="profileImageWrapper">
                ${this.profile.profileImage
                  ? `<img src="${this.profile.profileImage}" alt="프로필 사진" class="profile-image-preview">`
                  : `<div class="profile-image-placeholder">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                         <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                         <circle cx="12" cy="7" r="4"/>
                       </svg>
                     </div>`
                }
                <div class="profile-image-overlay">
                  <label for="profileImageInput" class="profile-image-upload-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </label>
                  ${this.profile.profileImage ? `
                    <button class="profile-image-delete-btn" id="deleteProfileImageBtn" title="사진 삭제">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  ` : ''}
                </div>
              </div>
              <input type="file" id="profileImageInput" accept="image/*" style="display: none;">
              <div class="profile-image-info">
                <span class="profile-image-name">${this.profile.basicInfo.name?.value || 'User'}</span>
              </div>
            </div>
          </div>

          <!-- 기본 정보 -->
          <div class="profile-section">
            <h3 class="profile-section-title">기본 정보</h3>
            <div class="profile-basic-info">
              ${this.renderBasicInfoFields()}
            </div>
          </div>

          <!-- 커스텀 필드 -->
          <div class="profile-section">
            <div class="profile-section-header">
              <h3 class="profile-section-title">추가 정보</h3>
              <button class="profile-btn profile-btn-add" id="addFieldBtn">
                <span>+</span> 필드 추가
              </button>
            </div>
            <div class="profile-custom-fields" id="customFieldsContainer">
              ${this.renderCustomFields()}
            </div>
          </div>

          <!-- 권한 설정 -->
          <div class="profile-section">
            <h3 class="profile-section-title">소울 권한 설정</h3>
            <div class="profile-permissions">
              <div class="profile-field">
                <label>읽기 범위</label>
                <select class="profile-input" id="readScope">
                  <option value="full" ${this.profile.permissions.readScope === 'full' ? 'selected' : ''}>전체 (Full)</option>
                  <option value="limited" ${this.profile.permissions.readScope === 'limited' ? 'selected' : ''}>제한적 (Limited)</option>
                  <option value="minimal" ${this.profile.permissions.readScope === 'minimal' ? 'selected' : ''}>최소 (Minimal)</option>
                </select>
                <small>소울이 프로필을 읽을 수 있는 범위입니다.</small>
              </div>
              <div class="profile-field">
                <label>
                  <input type="checkbox" id="canWrite" ${this.profile.permissions.canWrite ? 'checked' : ''}>
                  쓰기 권한 허용
                </label>
                <small>소울이 프로필을 수정할 수 있습니다.</small>
              </div>
              <div class="profile-field">
                <label>
                  <input type="checkbox" id="canDelete" ${this.profile.permissions.canDelete ? 'checked' : ''}>
                  삭제 권한 허용
                </label>
                <small>소울이 필드를 삭제할 수 있습니다.</small>
              </div>
              <div class="profile-field">
                <label>
                  <input type="checkbox" id="autoIncludeInContext" ${this.profile.permissions.autoIncludeInContext ? 'checked' : ''}>
                  자동으로 컨텍스트에 포함
                </label>
                <small>대화 시작 시 자동으로 프로필 요약을 포함합니다.</small>
              </div>
            </div>
            <button class="profile-btn profile-btn-save" id="savePermissionsBtn">권한 저장</button>
          </div>

          <!-- 저장 상태 -->
          <div class="profile-save-status" id="saveStatus"></div>
        </div>
      `;

      // 이벤트 리스너 등록
      this.attachEventListeners(container);

    } catch (error) {
      console.error('프로필 패널 렌더링 실패:', error);
      container.innerHTML = `
        <div class="error-message">
          <p>프로필을 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 기본 정보 필드 렌더링 (각 필드마다 공개 토글)
   */
  renderBasicInfoFields() {
    const basicFields = [
      { key: 'name', label: '이름', type: 'text', placeholder: '이름을 입력하세요' },
      { key: 'nickname', label: '닉네임', type: 'text', placeholder: '닉네임을 입력하세요' },
      { key: 'email', label: '이메일', type: 'email', placeholder: 'email@example.com' },
      { key: 'phone', label: '전화번호', type: 'tel', placeholder: '010-0000-0000' },
      { key: 'birthDate', label: '생년월일', type: 'date', placeholder: '' },
      { key: 'gender', label: '성별', type: 'select', options: ['남성', '여성', '기타'] },
      { key: 'idNumber', label: '주민번호', type: 'text', placeholder: '000000-0000000', sensitive: true },
      { key: 'country', label: '국가', type: 'text', placeholder: '대한민국' },
      { key: 'address', label: '주소', type: 'text', placeholder: '주소를 입력하세요' },
      { key: 'timezone', label: '타임존', type: 'select', options: ['Asia/Seoul', 'UTC', 'America/New_York', 'Europe/London'] },
      { key: 'language', label: '언어', type: 'select', options: ['ko', 'en', 'ja', 'zh'] }
    ];

    return basicFields.map(field => {
      const basicInfo = this.profile.basicInfo[field.key] || {};
      const value = basicInfo.value || '';
      const visibility = basicInfo.visibility || { visibleToSoul: true, autoIncludeInContext: true };

      let inputHtml = '';
      if (field.type === 'select') {
        const options = field.options.map(opt =>
          `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');
        inputHtml = `
          <select class="profile-input" data-basic-field="${field.key}">
            <option value="">선택 안함</option>
            ${options}
          </select>
        `;
      } else if (field.type === 'date') {
        const dateValue = value ? new Date(value).toISOString().split('T')[0] : '';
        inputHtml = `
          <input type="${field.type}"
                 class="profile-input"
                 value="${dateValue}"
                 data-basic-field="${field.key}"
                 placeholder="${field.placeholder}">
        `;
      } else {
        inputHtml = `
          <input type="${field.type}"
                 class="profile-input"
                 value="${value}"
                 data-basic-field="${field.key}"
                 placeholder="${field.placeholder}">
        `;
      }

      return `
        <div class="profile-field-with-toggle">
          <div class="profile-field">
            <div class="profile-field-label-row">
              <div class="profile-field-label-header">
                <label>${field.label}</label>
                <div class="profile-field-toggles">
                  <label class="toggle-label" title="소울에게 공개">
                    <input type="checkbox"
                           class="toggle-checkbox"
                           data-basic-field="${field.key}"
                           data-visibility="visibleToSoul"
                           ${visibility.visibleToSoul ? 'checked' : ''}>
                    <span class="toggle-icon">${visibility.visibleToSoul ? '👁️' : '🔒'}</span>
                  </label>
                  <label class="toggle-label" title="자동 포함">
                    <input type="checkbox"
                           class="toggle-checkbox"
                           data-basic-field="${field.key}"
                           data-visibility="autoIncludeInContext"
                           ${visibility.autoIncludeInContext ? 'checked' : ''}>
                    <span class="toggle-icon">${visibility.autoIncludeInContext ? '🔄' : '⏸️'}</span>
                  </label>
                </div>
              </div>
              ${inputHtml}
              ${field.sensitive ? '<small style="color: rgba(239, 68, 68, 0.8);">⚠️ 민감 정보</small>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * 커스텀 필드 렌더링
   */
  renderCustomFields() {
    if (!this.profile.customFields || this.profile.customFields.length === 0) {
      return '<p class="profile-empty">추가 필드가 없습니다. "필드 추가" 버튼을 눌러 정보를 추가하세요.</p>';
    }

    const sortedFields = [...this.profile.customFields].sort((a, b) => a.order - b.order);

    return sortedFields.map(field => `
      <div class="profile-custom-field"
           data-field-id="${field.id}"
           draggable="true">
        <div class="profile-field-drag-handle">☰</div>
        <div class="profile-field-content">
          <div class="profile-field-header">
            <input type="text"
                   class="profile-field-label"
                   value="${field.label}"
                   data-field-id="${field.id}"
                   data-prop="label"
                   placeholder="필드 이름">
            <button class="profile-field-delete" data-field-id="${field.id}">×</button>
          </div>
          <div class="profile-field-value">
            ${this.renderFieldInput(field)}
          </div>
          <div class="profile-field-meta">
            <select class="profile-field-type" data-field-id="${field.id}">
              <option value="text" ${field.type === 'text' ? 'selected' : ''}>텍스트</option>
              <option value="number" ${field.type === 'number' ? 'selected' : ''}>숫자</option>
              <option value="date" ${field.type === 'date' ? 'selected' : ''}>날짜</option>
              <option value="tag" ${field.type === 'tag' ? 'selected' : ''}>태그</option>
              <option value="list" ${field.type === 'list' ? 'selected' : ''}>리스트</option>
              <option value="url" ${field.type === 'url' ? 'selected' : ''}>URL</option>
            </select>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * 필드 입력 렌더링 (타입별)
   */
  renderFieldInput(field) {
    const value = field.value || '';

    switch (field.type) {
      case 'number':
        return `<input type="number" class="profile-field-input" value="${value}" data-field-id="${field.id}" data-prop="value">`;
      case 'date':
        return `<input type="date" class="profile-field-input" value="${value}" data-field-id="${field.id}" data-prop="value">`;
      case 'url':
        return `<input type="url" class="profile-field-input" value="${value}" data-field-id="${field.id}" data-prop="value" placeholder="https://">`;
      case 'tag':
        return `<input type="text" class="profile-field-input" value="${value}" data-field-id="${field.id}" data-prop="value" placeholder="태그1, 태그2, ...">`;
      case 'list':
        return `<textarea class="profile-field-input" data-field-id="${field.id}" data-prop="value" placeholder="항목을 줄바꿈으로 구분">${value}</textarea>`;
      case 'text':
      default:
        return `<input type="text" class="profile-field-input" value="${value}" data-field-id="${field.id}" data-prop="value">`;
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners(container) {
    // 프로필 사진 업로드
    const profileImageInput = container.querySelector('#profileImageInput');
    if (profileImageInput) {
      profileImageInput.addEventListener('change', (e) => this.handleProfileImageUpload(e, container));
    }

    // 프로필 사진 삭제
    const deleteImageBtn = container.querySelector('#deleteProfileImageBtn');
    if (deleteImageBtn) {
      deleteImageBtn.addEventListener('click', () => this.deleteProfileImage(container));
    }

    // 기본 정보 값 변경 자동 저장
    container.querySelectorAll('.profile-input[data-basic-field]').forEach(input => {
      input.addEventListener('change', (e) => this.saveBasicInfoValue(e.target));
    });

    // 기본 정보 토글 버튼 (공개 설정)
    container.querySelectorAll('.toggle-checkbox[data-basic-field]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.saveBasicInfoVisibility(e.target));
    });

    // 필드 추가
    const addBtn = container.querySelector('#addFieldBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.addField(container));
    }

    // 커스텀 필드 이벤트
    this.attachCustomFieldListeners(container);

    // 권한 저장
    const savePermissionsBtn = container.querySelector('#savePermissionsBtn');
    if (savePermissionsBtn) {
      savePermissionsBtn.addEventListener('click', () => this.savePermissions(container));
    }
  }

  /**
   * 프로필 사진 업로드 처리
   */
  async handleProfileImageUpload(e, container) {
    const file = e.target.files[0];
    if (!file) return;

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      this.showSaveStatus('❌ 이미지 파일만 업로드 가능합니다.', 'error');
      return;
    }

    // 파일 크기 검증 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.showSaveStatus('❌ 이미지 크기는 5MB 이하여야 합니다.', 'error');
      return;
    }

    try {
      this.showSaveStatus('업로드 중...', 'info');

      // 이미지 리사이즈 및 Base64 변환
      const imageData = await this.resizeAndConvertToBase64(file, 400, 400);

      // API 호출
      const response = await fetch('/api/profile/p/image', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          imageData
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '업로드 실패');
      }

      // 로컬 상태 업데이트
      this.profile.profileImage = imageData;

      // UI 새로고침
      await this.renderProfilePanel(container);
      this.showSaveStatus('✓ 프로필 사진 저장됨', 'success');

      // 메인 화면 아바타도 업데이트
      this.updateMainAvatar(imageData);

    } catch (error) {
      console.error('프로필 사진 업로드 실패:', error);
      this.showSaveStatus('❌ 업로드 실패', 'error');
    }
  }

  /**
   * 이미지 리사이즈 및 Base64 변환
   */
  resizeAndConvertToBase64(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // 비율 유지하며 리사이즈
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // JPEG로 변환 (품질 0.8)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 프로필 사진 삭제
   */
  async deleteProfileImage(container) {
    if (!confirm('프로필 사진을 삭제하시겠습니까?')) {
      return;
    }

    try {
      this.showSaveStatus('삭제 중...', 'info');

      const response = await fetch(`/api/profile/p/image?userId=${this.userId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '삭제 실패');
      }

      // 로컬 상태 업데이트
      this.profile.profileImage = null;

      // UI 새로고침
      await this.renderProfilePanel(container);
      this.showSaveStatus('✓ 프로필 사진 삭제됨', 'success');

      // 메인 화면 아바타도 초기화
      this.updateMainAvatar(null);

    } catch (error) {
      console.error('프로필 사진 삭제 실패:', error);
      this.showSaveStatus('❌ 삭제 실패', 'error');
    }
  }

  /**
   * 메인 화면 아바타 업데이트
   */
  updateMainAvatar(imageData) {
    const avatar = document.querySelector('.profile-section .avatar');
    if (avatar) {
      if (imageData) {
        avatar.style.backgroundImage = `url(${imageData})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
      } else {
        avatar.style.backgroundImage = '';
      }
    }
  }

  /**
   * 커스텀 필드 이벤트 리스너
   */
  attachCustomFieldListeners(container) {
    const fieldsContainer = container.querySelector('#customFieldsContainer');
    if (!fieldsContainer) return;

    // 드래그 앤 드롭
    fieldsContainer.querySelectorAll('.profile-custom-field').forEach(field => {
      field.addEventListener('dragstart', (e) => this.onDragStart(e));
      field.addEventListener('dragover', (e) => this.onDragOver(e));
      field.addEventListener('drop', (e) => this.onDrop(e, container));
      field.addEventListener('dragend', (e) => this.onDragEnd(e));
    });

    // 필드 라벨 변경
    fieldsContainer.querySelectorAll('.profile-field-label').forEach(input => {
      input.addEventListener('change', (e) => this.updateFieldProperty(e.target, container));
    });

    // 필드 값 변경
    fieldsContainer.querySelectorAll('.profile-field-input').forEach(input => {
      input.addEventListener('change', (e) => this.updateFieldProperty(e.target, container));
    });

    // 필드 타입 변경
    fieldsContainer.querySelectorAll('.profile-field-type').forEach(select => {
      select.addEventListener('change', (e) => this.changeFieldType(e.target, container));
    });

    // 필드 삭제
    fieldsContainer.querySelectorAll('.profile-field-delete').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteField(e.target.dataset.fieldId, container));
    });
  }

  /**
   * 기본 정보 값 저장
   */
  async saveBasicInfoValue(input) {
    const fieldKey = input.dataset.basicField;
    const value = input.value;

    try {
      this.showSaveStatus('저장 중...', 'info');

      // 로컬 상태 업데이트
      if (!this.profile.basicInfo[fieldKey]) {
        this.profile.basicInfo[fieldKey] = {};
      }
      this.profile.basicInfo[fieldKey].value = value;

      // API 호출 (백엔드 업데이트 필요)
      const response = await fetch(`/api/profile/p/basic/${fieldKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });

      if (!response.ok) throw new Error('저장 실패');

      this.showSaveStatus('✓ 저장됨', 'success');

      setTimeout(() => {
        this.hideSaveStatus();
      }, 2000);

    } catch (error) {
      console.error('기본 정보 저장 실패:', error);
      this.showSaveStatus('❌ 저장 실패', 'error');
      setTimeout(() => this.hideSaveStatus(), 3000);
    }
  }

  /**
   * 기본 정보 공개 설정 저장
   */
  async saveBasicInfoVisibility(checkbox) {
    const fieldKey = checkbox.dataset.basicField;
    const visibilityKey = checkbox.dataset.visibility;
    const value = checkbox.checked;

    try {
      // 아이콘 업데이트
      const icon = checkbox.nextElementSibling;
      if (visibilityKey === 'visibleToSoul') {
        icon.textContent = value ? '👁️' : '🔒';
      } else if (visibilityKey === 'autoIncludeInContext') {
        icon.textContent = value ? '🔄' : '⏸️';
      }

      this.showSaveStatus('저장 중...', 'info');

      // 로컬 상태 업데이트
      if (!this.profile.basicInfo[fieldKey]) {
        this.profile.basicInfo[fieldKey] = { visibility: {} };
      }
      if (!this.profile.basicInfo[fieldKey].visibility) {
        this.profile.basicInfo[fieldKey].visibility = {};
      }
      this.profile.basicInfo[fieldKey].visibility[visibilityKey] = value;

      // API 호출 (백엔드 업데이트 필요)
      const response = await fetch(`/api/profile/p/basic/${fieldKey}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [visibilityKey]: value })
      });

      if (!response.ok) throw new Error('저장 실패');

      this.showSaveStatus('✓ 저장됨', 'success');

      setTimeout(() => {
        this.hideSaveStatus();
      }, 2000);

    } catch (error) {
      console.error('기본 정보 저장 실패:', error);
      this.showSaveStatus('✗ 저장 실패', 'error');
    }
  }

  /**
   * 필드 추가
   */
  async addField(container) {
    const newField = {
      id: `field_${Date.now()}`,
      label: '새 필드',
      value: '',
      type: 'text',
      order: this.profile.customFields.length
    };

    try {
      const response = await fetch('/api/profile/p/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newField, userId: this.userId })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '필드 추가 실패');
      }

      // 프로필 새로고침
      await this.renderProfilePanel(container);
      this.showSaveStatus('✓ 필드 추가됨', 'success');

    } catch (error) {
      console.error('필드 추가 실패:', error);
      this.showSaveStatus('✗ 필드 추가 실패', 'error');
    }
  }

  /**
   * 필드 속성 업데이트
   */
  async updateFieldProperty(input, container) {
    const fieldId = input.dataset.fieldId;
    const prop = input.dataset.prop;
    const value = input.value;

    try {
      this.showSaveStatus('저장 중...', 'info');

      const response = await fetch(`/api/profile/p/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          [prop]: value
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '필드 업데이트 실패');
      }

      this.showSaveStatus('✓ 저장됨', 'success');

      setTimeout(() => {
        this.hideSaveStatus();
      }, 2000);

    } catch (error) {
      console.error('필드 업데이트 실패:', error);
      this.showSaveStatus('✗ 저장 실패', 'error');
    }
  }

  /**
   * 필드 타입 변경
   */
  async changeFieldType(select, container) {
    const fieldId = select.dataset.fieldId;
    const newType = select.value;

    try {
      this.showSaveStatus('저장 중...', 'info');

      const response = await fetch(`/api/profile/p/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          type: newType
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '필드 타입 변경 실패');
      }

      // UI 새로고침
      await this.renderProfilePanel(container);
      this.showSaveStatus('✓ 타입 변경됨', 'success');

    } catch (error) {
      console.error('필드 타입 변경 실패:', error);
      this.showSaveStatus('✗ 타입 변경 실패', 'error');
    }
  }

  /**
   * 필드 삭제
   */
  async deleteField(fieldId, container) {
    if (!confirm('이 필드를 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/profile/p/fields/${fieldId}?userId=${this.userId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '필드 삭제 실패');
      }

      // UI 새로고침
      await this.renderProfilePanel(container);
      this.showSaveStatus('✓ 필드 삭제됨', 'success');

    } catch (error) {
      console.error('필드 삭제 실패:', error);
      this.showSaveStatus('✗ 필드 삭제 실패', 'error');
    }
  }

  /**
   * 권한 저장
   */
  async savePermissions(container) {
    try {
      const readScope = container.querySelector('#readScope').value;
      const canWrite = container.querySelector('#canWrite').checked;
      const canDelete = container.querySelector('#canDelete').checked;
      const autoIncludeInContext = container.querySelector('#autoIncludeInContext').checked;

      this.showSaveStatus('저장 중...', 'info');

      const response = await fetch('/api/profile/p/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          readScope,
          canWrite,
          canDelete,
          autoIncludeInContext
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '권한 저장 실패');
      }

      this.showSaveStatus('✓ 권한 저장됨', 'success');

      setTimeout(() => {
        this.hideSaveStatus();
      }, 2000);

    } catch (error) {
      console.error('권한 저장 실패:', error);
      this.showSaveStatus('✗ 권한 저장 실패', 'error');
    }
  }

  /**
   * 드래그 앤 드롭 - 시작
   */
  onDragStart(e) {
    this.draggedElement = e.target;
    e.target.style.opacity = '0.5';
  }

  /**
   * 드래그 앤 드롭 - 오버
   */
  onDragOver(e) {
    e.preventDefault();
    const afterElement = this.getDragAfterElement(e.currentTarget.parentElement, e.clientY);
    const draggable = this.draggedElement;

    if (afterElement == null) {
      e.currentTarget.parentElement.appendChild(draggable);
    } else {
      e.currentTarget.parentElement.insertBefore(draggable, afterElement);
    }
  }

  /**
   * 드래그 앤 드롭 - 드롭
   */
  async onDrop(e, container) {
    e.preventDefault();

    // 순서 계산
    const fieldsContainer = container.querySelector('#customFieldsContainer');
    const fieldElements = Array.from(fieldsContainer.querySelectorAll('.profile-custom-field'));

    const fieldOrders = fieldElements.map((el, index) => ({
      id: el.dataset.fieldId,
      order: index
    }));

    // 서버에 순서 저장
    try {
      const response = await fetch('/api/profile/p/fields/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          fieldOrders
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '순서 변경 실패');
      }

      this.showSaveStatus('✓ 순서 변경됨', 'success');

    } catch (error) {
      console.error('순서 변경 실패:', error);
      this.showSaveStatus('✗ 순서 변경 실패', 'error');
    }
  }

  /**
   * 드래그 앤 드롭 - 종료
   */
  onDragEnd(e) {
    e.target.style.opacity = '';
    this.draggedElement = null;
  }

  /**
   * 드래그 후 위치 계산
   */
  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.profile-custom-field:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  /**
   * 저장 상태 표시
   */
  showSaveStatus(message, type) {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `profile-save-status ${type}`;
      statusEl.style.display = 'block';
    }
  }

  /**
   * 저장 상태 숨기기
   */
  hideSaveStatus() {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.style.display = 'none';
    }
  }
}
