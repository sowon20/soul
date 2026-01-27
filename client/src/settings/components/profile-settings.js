/**
 * Profile Settings Component
 * 프로필 설정 UI 컴포넌트
 */

export class ProfileSettings {
  constructor() {
    this.profile = null;
    this.userId = localStorage.getItem('userId') || 'default';
  }

  /**
   * 컴포넌트 렌더링
   */
  async render(container, apiClient) {
    this.container = container;
    this.apiClient = apiClient;

    try {
      // 프로필 데이터 로드
      const response = await apiClient.get(`/profile/p?userId=${this.userId}`);
      this.profile = response.profile;

      // UI 렌더링
      container.innerHTML = `
        <div class="profile-settings-panel">
          <!-- 프로필 사진 -->
          <section class="settings-section profile-image-section">
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
      `;

      // 이벤트 리스너 등록
      this.attachEventListeners(container, apiClient);
    } catch (error) {
      console.error('Failed to load profile:', error);
      container.innerHTML = `
        <div class="settings-error">
          <p>프로필을 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 기본 정보 필드 렌더링
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
          <select class="settings-input" data-basic-field="${field.key}">
            <option value="">선택 안함</option>
            ${options}
          </select>
        `;
      } else if (field.type === 'date') {
        const date = value ? new Date(value) : null;
        const dateValue = (date && !isNaN(date.getTime())) ? date.toISOString().split('T')[0] : '';
        inputHtml = `
          <input type="${field.type}"
                 class="settings-input"
                 value="${dateValue}"
                 data-basic-field="${field.key}"
                 placeholder="${field.placeholder}">
        `;
      } else {
        inputHtml = `
          <input type="${field.type}"
                 class="settings-input"
                 value="${value}"
                 data-basic-field="${field.key}"
                 placeholder="${field.placeholder}">
        `;
      }

      return `
        <div class="settings-field">
          <div class="settings-field-header">
            <label>${field.label}</label>
            <div class="settings-field-toggles">
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
          ${field.sensitive ? '<small class="settings-field-hint">⚠️ 민감 정보</small>' : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * 커스텀 필드 렌더링
   */
  renderCustomFields() {
    if (!this.profile.customFields || this.profile.customFields.length === 0) {
      return '<p class="settings-empty">추가 필드가 없습니다. "필드 추가" 버튼을 눌러 정보를 추가하세요.</p>';
    }

    const sortedFields = [...this.profile.customFields].sort((a, b) => a.order - b.order);

    return sortedFields.map(field => `
      <div class="settings-custom-field" draggable="true" data-field-id="${field.id}">
        <span class="settings-field-drag-handle">⋮⋮</span>
        <div class="settings-field-content">
          <div class="settings-field-header">
            <input type="text"
                   class="settings-field-label"
                   value="${field.label}"
                   data-field-id="${field.id}"
                   data-prop="label"
                   placeholder="필드 이름">
            <button class="settings-field-delete" data-field-id="${field.id}">×</button>
          </div>
          <div class="settings-field-value">
            ${this.renderCustomFieldInput(field)}
          </div>
          <div class="settings-field-meta">
            <select class="settings-field-type" data-field-id="${field.id}" data-prop="type">
              <option value="text" ${field.type === 'text' ? 'selected' : ''}>텍스트</option>
              <option value="number" ${field.type === 'number' ? 'selected' : ''}>숫자</option>
              <option value="date" ${field.type === 'date' ? 'selected' : ''}>날짜</option>
              <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>긴 텍스트</option>
            </select>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * 커스텀 필드 입력 요소 렌더링
   */
  renderCustomFieldInput(field) {
    const value = field.value || '';

    switch (field.type) {
      case 'textarea':
        return `<textarea class="settings-field-input" data-field-id="${field.id}" data-prop="value" placeholder="내용을 입력하세요">${value}</textarea>`;
      case 'number':
        return `<input type="number" class="settings-field-input" value="${value}" data-field-id="${field.id}" data-prop="value" placeholder="숫자를 입력하세요">`;
      case 'date':
        const date = value ? new Date(value) : null;
        const dateValue = (date && !isNaN(date.getTime())) ? date.toISOString().split('T')[0] : '';
        return `<input type="date" class="settings-field-input" value="${dateValue}" data-field-id="${field.id}" data-prop="value">`;
      default:
        return `<input type="text" class="settings-field-input" value="${value}" data-field-id="${field.id}" data-prop="value" placeholder="내용을 입력하세요">`;
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners(container, apiClient) {
    // 프로필 사진 업로드
    const profileImageInput = container.querySelector('#profileImageInput');
    if (profileImageInput) {
      profileImageInput.addEventListener('change', (e) => this.handleProfileImageUpload(e));
    }

    // 프로필 사진 삭제
    const deleteImageBtn = container.querySelector('#deleteProfileImageBtn');
    if (deleteImageBtn) {
      deleteImageBtn.addEventListener('click', () => this.deleteProfileImage());
    }

    // 기본 정보 값 변경 자동 저장
    container.querySelectorAll('.settings-input[data-basic-field]').forEach(input => {
      input.addEventListener('change', (e) => this.saveBasicInfoValue(e.target, apiClient));
    });

    // 기본 정보 토글 버튼
    container.querySelectorAll('.toggle-checkbox[data-basic-field]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.saveBasicInfoVisibility(e.target, apiClient));
    });

    // 필드 추가 버튼
    const addBtn = container.querySelector('#addFieldBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.addField(container, apiClient));
    }

    // 커스텀 필드 이벤트 리스너
    this.attachCustomFieldEventListeners(container);
  }

  /**
   * 프로필 사진 업로드 처리
   */
  async handleProfileImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      this.showSaveStatus('이미지 파일만 업로드 가능합니다.', 'error');
      return;
    }

    // 파일 크기 검증 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.showSaveStatus('이미지 크기는 5MB 이하여야 합니다.', 'error');
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
      await this.render(this.container, this.apiClient);
      this.showSaveStatus('프로필 사진 저장됨', 'success');

      // 메인 화면 아바타도 업데이트
      this.updateMainAvatar(imageData);

    } catch (error) {
      console.error('프로필 사진 업로드 실패:', error);
      this.showSaveStatus('업로드 실패', 'error');
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
  async deleteProfileImage() {
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
      await this.render(this.container, this.apiClient);
      this.showSaveStatus('프로필 사진 삭제됨', 'success');

      // 메인 화면 아바타도 초기화
      this.updateMainAvatar(null);

    } catch (error) {
      console.error('프로필 사진 삭제 실패:', error);
      this.showSaveStatus('삭제 실패', 'error');
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
   * 메인 화면 프로필 정보 업데이트
   */
  updateMainProfile(fieldKey, value) {
    if (fieldKey === 'name') {
      const userName = document.querySelector('.profile-section .user-name');
      if (userName) userName.textContent = value || 'User';
    } else if (fieldKey === 'email') {
      const userEmail = document.querySelector('.profile-section .user-email');
      if (userEmail) userEmail.textContent = value || '';
    }
  }

  /**
   * 기본 정보 값 저장
   */
  async saveBasicInfoValue(input, apiClient) {
    const fieldKey = input.dataset.basicField;
    const value = input.value;

    try {
      this.showSaveStatus('저장 중...', 'info');

      // 로컬 상태 업데이트
      if (!this.profile.basicInfo[fieldKey]) {
        this.profile.basicInfo[fieldKey] = {};
      }
      this.profile.basicInfo[fieldKey].value = value;

      // API 호출
      const response = await fetch(`/api/profile/p/basic/${fieldKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });

      if (!response.ok) throw new Error('저장 실패');

      // 메인 화면도 업데이트
      this.updateMainProfile(fieldKey, value);

      this.showSaveStatus('✓ 저장됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('기본 정보 저장 실패:', error);
      this.showSaveStatus('❌ 저장 실패', 'error');
      setTimeout(() => this.hideSaveStatus(), 3000);
    }
  }

  /**
   * 기본 정보 공개 설정 저장
   */
  async saveBasicInfoVisibility(checkbox, apiClient) {
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

      // API 호출
      const response = await fetch(`/api/profile/p/basic/${fieldKey}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [visibilityKey]: value })
      });

      if (!response.ok) throw new Error('저장 실패');

      this.showSaveStatus('✓ 저장됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('기본 정보 저장 실패:', error);
      this.showSaveStatus('✗ 저장 실패', 'error');
    }
  }

  /**
   * 필드 추가
   */
  async addField(container, apiClient) {
    try {
      this.showSaveStatus('필드 추가 중...', 'info');

      // 새 필드 데이터
      const newField = {
        userId: this.userId,
        label: '새 필드',
        value: '',
        type: 'text',
        order: (this.profile.customFields?.length || 0) + 1
      };

      // API 호출
      const response = await fetch('/api/profile/p/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newField)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '필드 추가 실패');
      }

      // 로컬 상태 업데이트
      if (!this.profile.customFields) {
        this.profile.customFields = [];
      }
      this.profile.customFields.push(data.field);

      // UI 업데이트
      this.refreshCustomFields(container);
      this.showSaveStatus('✓ 필드 추가됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('필드 추가 실패:', error);
      this.showSaveStatus('❌ 필드 추가 실패', 'error');
      setTimeout(() => this.hideSaveStatus(), 3000);
    }
  }

  /**
   * 커스텀 필드 UI 새로고침
   */
  refreshCustomFields(container) {
    const customFieldsContainer = container.querySelector('#customFieldsContainer');
    if (customFieldsContainer) {
      customFieldsContainer.innerHTML = this.renderCustomFields();
      this.attachCustomFieldEventListeners(container);
    }
  }

  /**
   * 커스텀 필드 값 저장
   */
  async saveCustomFieldValue(fieldId, prop, value) {
    try {
      this.showSaveStatus('저장 중...', 'info');

      // 로컬 상태 업데이트
      const field = this.profile.customFields.find(f => f.id === fieldId);
      if (field) {
        field[prop] = value;
      }

      // API 호출
      const response = await fetch(`/api/profile/p/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId, [prop]: value })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '저장 실패');
      }

      this.showSaveStatus('✓ 저장됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('필드 저장 실패:', error);
      this.showSaveStatus('❌ 저장 실패', 'error');
      setTimeout(() => this.hideSaveStatus(), 3000);
    }
  }

  /**
   * 커스텀 필드 삭제
   */
  async deleteCustomField(fieldId) {
    if (!confirm('이 필드를 삭제하시겠습니까?')) {
      return;
    }

    try {
      this.showSaveStatus('삭제 중...', 'info');

      // API 호출
      const response = await fetch(`/api/profile/p/fields/${fieldId}?userId=${this.userId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '삭제 실패');
      }

      // 로컬 상태 업데이트
      this.profile.customFields = this.profile.customFields.filter(f => f.id !== fieldId);

      // UI 업데이트
      this.refreshCustomFields(this.container);
      this.showSaveStatus('✓ 필드 삭제됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('필드 삭제 실패:', error);
      this.showSaveStatus('❌ 삭제 실패', 'error');
      setTimeout(() => this.hideSaveStatus(), 3000);
    }
  }

  /**
   * 커스텀 필드 순서 변경
   */
  async reorderFields(fieldOrders) {
    try {
      // API 호출
      const response = await fetch('/api/profile/p/fields/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId, fieldOrders })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '순서 변경 실패');
      }

      // 로컬 상태 업데이트
      this.profile.customFields = data.customFields;

      this.showSaveStatus('✓ 순서 변경됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('순서 변경 실패:', error);
      this.showSaveStatus('❌ 순서 변경 실패', 'error');
      setTimeout(() => this.hideSaveStatus(), 3000);
    }
  }

  /**
   * 커스텀 필드 이벤트 리스너 등록
   */
  attachCustomFieldEventListeners(container) {
    // 필드 값 변경
    container.querySelectorAll('.settings-field-input[data-field-id]').forEach(input => {
      input.addEventListener('change', (e) => {
        const fieldId = e.target.dataset.fieldId;
        const prop = e.target.dataset.prop;
        this.saveCustomFieldValue(fieldId, prop, e.target.value);
      });
    });

    // 필드 라벨 변경
    container.querySelectorAll('.settings-field-label[data-field-id]').forEach(input => {
      input.addEventListener('change', (e) => {
        const fieldId = e.target.dataset.fieldId;
        this.saveCustomFieldValue(fieldId, 'label', e.target.value);
      });
    });

    // 필드 타입 변경
    container.querySelectorAll('.settings-field-type[data-field-id]').forEach(select => {
      select.addEventListener('change', (e) => {
        const fieldId = e.target.dataset.fieldId;
        this.saveCustomFieldValue(fieldId, 'type', e.target.value);

        // 입력 필드 타입도 업데이트
        const field = this.profile.customFields.find(f => f.id === fieldId);
        if (field) {
          field.type = e.target.value;
          this.refreshCustomFields(container);
        }
      });
    });

    // 필드 삭제
    container.querySelectorAll('.settings-field-delete[data-field-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fieldId = e.target.closest('.settings-field-delete').dataset.fieldId;
        this.deleteCustomField(fieldId);
      });
    });

    // 드래그 앤 드롭
    this.setupDragAndDrop(container);
  }

  /**
   * 드래그 앤 드롭 설정
   */
  setupDragAndDrop(container) {
    const customFieldsContainer = container.querySelector('#customFieldsContainer');
    if (!customFieldsContainer) return;

    let draggedItem = null;

    const handleDragStart = (e) => {
      draggedItem = e.target.closest('.settings-custom-field');
      if (draggedItem) {
        draggedItem.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const afterElement = getDragAfterElement(customFieldsContainer, e.clientY);
      if (draggedItem) {
        if (afterElement) {
          customFieldsContainer.insertBefore(draggedItem, afterElement);
        } else {
          customFieldsContainer.appendChild(draggedItem);
        }
      }
    };

    const handleDragEnd = () => {
      if (draggedItem) {
        draggedItem.classList.remove('dragging');

        // 새 순서 저장
        const fieldElements = customFieldsContainer.querySelectorAll('.settings-custom-field');
        const fieldOrders = Array.from(fieldElements).map((el, index) => ({
          id: el.dataset.fieldId,
          order: index + 1
        }));

        this.reorderFields(fieldOrders);
        draggedItem = null;
      }
    };

    const getDragAfterElement = (container, y) => {
      const draggableElements = [...container.querySelectorAll('.settings-custom-field:not(.dragging)')];

      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    };

    // 이벤트 리스너 등록
    customFieldsContainer.addEventListener('dragstart', handleDragStart);
    customFieldsContainer.addEventListener('dragover', handleDragOver);
    customFieldsContainer.addEventListener('dragend', handleDragEnd);
  }

  /**
   * 저장 상태 표시
   */
  showSaveStatus(message, type) {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `settings-save-status ${type}`;
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
