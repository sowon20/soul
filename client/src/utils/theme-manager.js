/**
 * Theme Manager
 * 테마 및 스타일 관리
 */

export class ThemeManager {
  constructor() {
    this.root = document.documentElement;
    this.currentTheme = 'default';
    this.currentFontSize = 'md';
    this.userId = null; // 사용자 ID (서버 저장용)

    // Load saved settings from localStorage
    this.loadSettings();
  }

  /**
   * 사용자 ID 설정
   * @param {string} userId
   */
  setUserId(userId) {
    this.userId = userId;
  }

  /**
   * 테마 적용
   * @param {string} themeName - 테마 이름 (default, basic, dark, ocean, forest, sunset)
   */
  async applyTheme(themeName) {
    this.currentTheme = themeName;
    this.root.setAttribute('data-theme', themeName);

    // Dark mode class for glass effect
    if (themeName === 'dark') {
      this.root.classList.add('dark');
    } else {
      this.root.classList.remove('dark');
    }

    // Save to localStorage
    this.saveToLocalStorage('theme', themeName);

    // Save to server if userId is set
    if (this.userId) {
      await this.saveToServer({ skin: themeName });
    }

    console.log(`✨ 테마 적용: ${themeName}`);
  }

  /**
   * 글씨 크기 설정
   * @param {string} size - 크기 (xs, sm, md, lg, xl)
   */
  async setFontSize(size) {
    this.currentFontSize = size;
    this.root.setAttribute('data-font-size', size);

    // Save to localStorage
    this.saveToLocalStorage('fontSize', size);

    // Save to server if userId is set
    if (this.userId) {
      await this.saveToServer({ fontSize: size });
    }

    console.log(`📏 글씨 크기 변경: ${size}`);
  }

  /**
   * 유리 효과 강도 설정 (프리셋)
   * @param {string} intensity - 강도 (low, medium, high)
   */
  async setGlassIntensity(intensity) {
    const intensityPresets = {
      low: {
        opacity: 0.95,
        blur: 10,
      },
      medium: {
        opacity: 0.85,
        blur: 20,
      },
      high: {
        opacity: 0.75,
        blur: 30,
      },
    };

    const preset = intensityPresets[intensity] || intensityPresets.medium;

    this.setCSSVariable('--glass-opacity', preset.opacity);
    this.setCSSVariable('--glass-blur', `${preset.blur}px`);

    // Save to localStorage
    this.saveToLocalStorage('glassIntensity', intensity);

    // Save to server if userId is set
    if (this.userId) {
      await this.saveToServer({
        glassOpacity: preset.opacity * 100,
        glassBlur: preset.blur,
      });
    }

    console.log(`✨ 유리 효과 강도: ${intensity} (opacity: ${preset.opacity}, blur: ${preset.blur}px)`);
  }

  /**
   * 유리 효과 설정 (레거시 - 호환성 유지)
   * @param {boolean} enabled - 활성화 여부
   * @param {Object} options - 옵션 { opacity, blur }
   */
  async setGlassEffect(enabled, options = {}) {
    // Set data-glass attribute on root for CSS styling
    this.root.setAttribute('data-glass', enabled.toString());

    this.setCSSVariable('--glass-enabled', enabled);

    if (options.opacity !== undefined) {
      this.setCSSVariable('--glass-opacity', options.opacity / 100);
    }

    if (options.blur !== undefined) {
      this.setCSSVariable('--glass-blur', `${options.blur}px`);
    }

    // Save to localStorage
    this.saveToLocalStorage('glassEnabled', enabled);

    // Save to server if userId is set
    if (this.userId) {
      await this.saveToServer({ glassEnabled: enabled });
    }

    console.log(`✨ 유리 효과: ${enabled ? '활성화' : '비활성화'}`, options);
  }

  /**
   * 배경 이미지 설정
   * @param {string} imageUrl - 이미지 URL
   * @param {Object} options - 옵션 { opacity, blur, position, size }
   */
  async setBackgroundImage(imageUrl, options = {}) {
    if (imageUrl) {
      this.setCSSVariable('--background-image', `url('${imageUrl}')`);

      // Default values if not provided
      const opacity = options.opacity !== undefined ? options.opacity / 100 : 0.3;
      const blur = options.blur !== undefined ? `${options.blur}px` : '5px';
      const position = options.position || 'center';
      const size = options.size || 'cover';

      this.setCSSVariable('--background-image-opacity', opacity);
      this.setCSSVariable('--background-image-blur', blur);
      this.setCSSVariable('--background-image-position', position);
      this.setCSSVariable('--background-image-size', size);

      // Save to localStorage
      this.saveToLocalStorage('backgroundImage', imageUrl);

      // Save to server if userId is set
      if (this.userId) {
        await this.saveToServer({
          backgroundImage: imageUrl,
          backgroundOpacity: opacity * 100,
          backgroundBlur: parseInt(blur),
        });
      }

      console.log(`🖼️ 배경 이미지 설정:`, imageUrl, { opacity, blur, position, size });
    } else {
      this.removeBackgroundImage();
    }
  }

  /**
   * 배경 이미지 제거
   */
  async removeBackgroundImage() {
    this.setCSSVariable('--background-image', 'none');
    this.setCSSVariable('--background-image-opacity', 0);

    // Save to localStorage
    this.saveToLocalStorage('backgroundImage', '');

    // Save to server if userId is set
    if (this.userId) {
      await this.saveToServer({
        backgroundImage: null,
      });
    }

    console.log('🗑️ 배경 이미지 제거');
  }

  /**
   * 커스텀 색상 설정
   * @param {string} variable - CSS 변수 이름
   * @param {string} value - 색상 값
   */
  setCustomColor(variable, value) {
    this.setCSSVariable(variable, value);
  }

  /**
   * CSS 변수 설정
   * @param {string} name - 변수 이름
   * @param {string|number} value - 값
   */
  setCSSVariable(name, value) {
    this.root.style.setProperty(name, value);
  }

  /**
   * CSS 변수 가져오기
   * @param {string} name - 변수 이름
   * @returns {string}
   */
  getCSSVariable(name) {
    return getComputedStyle(this.root).getPropertyValue(name).trim();
  }

  /**
   * 현재 테마 설정 가져오기
   * @returns {Object}
   */
  getCurrentSettings() {
    return {
      theme: this.currentTheme,
      fontSize: this.currentFontSize,
      glassEnabled: this.getCSSVariable('--glass-enabled') === 'true',
      glassOpacity: parseFloat(this.getCSSVariable('--glass-opacity')) * 100,
      glassBlur: parseInt(this.getCSSVariable('--glass-blur')),
    };
  }

  /**
   * 서버에 설정 저장 (개별 필드 업데이트)
   * @param {Object} themeUpdate - 업데이트할 테마 설정
   */
  async saveToServer(themeUpdate) {
    if (!this.userId) {
      console.warn('사용자 ID가 설정되지 않아 서버 저장을 건너뜁니다.');
      return;
    }

    try {
      // 1초 타임아웃 설정
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await fetch(`/api/profile/user/${this.userId}/theme`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(themeUpdate),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('테마 설정 저장 실패');
      }

      console.log('💾 서버에 테마 설정 저장 완료:', themeUpdate);
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('서버 저장 타임아웃 (로컬 저장은 유지)');
      } else {
        console.error('서버 저장 오류 (로컬 저장은 유지):', error);
      }
      // 서버 저장 실패해도 로컬 저장은 유지됨
    }
  }

  /**
   * 테마 설정 저장 (API 호출) - 레거시 메서드
   * @param {string} userId - 사용자 ID
   * @param {Object} settings - 설정 객체
   */
  async saveSettings(userId, settings) {
    try {
      const response = await fetch(`/api/profile/user/${userId}/theme`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('테마 설정 저장 실패');
      }

      console.log('💾 테마 설정 저장 완료');
      return await response.json();
    } catch (error) {
      console.error('테마 설정 저장 오류:', error);
      throw error;
    }
  }

  /**
   * 다크 모드 토글
   */
  toggleDarkMode() {
    if (this.currentTheme === 'dark') {
      this.applyTheme('default');
    } else {
      this.applyTheme('dark');
    }
  }

  /**
   * localStorage에 설정 저장
   * @param {string} key - 설정 키
   * @param {any} value - 설정 값
   */
  saveToLocalStorage(key, value) {
    try {
      localStorage.setItem(`soul_${key}`, JSON.stringify(value));
    } catch (error) {
      console.error('localStorage 저장 실패:', error);
    }
  }

  /**
   * localStorage에서 설정 불러오기
   * @param {string} key - 설정 키
   * @param {any} defaultValue - 기본값
   * @returns {any}
   */
  getFromLocalStorage(key, defaultValue) {
    try {
      const item = localStorage.getItem(`soul_${key}`);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('localStorage 불러오기 실패:', error);
      return defaultValue;
    }
  }

  /**
   * 저장된 설정 불러오기
   */
  loadSettings() {
    // 테마 불러오기
    const savedTheme = this.getFromLocalStorage('theme', 'default');
    this.currentTheme = savedTheme;
    this.root.setAttribute('data-theme', savedTheme);

    if (savedTheme === 'dark') {
      this.root.classList.add('dark');
    }

    // 글씨 크기 불러오기
    const savedFontSize = this.getFromLocalStorage('fontSize', 'md');
    this.currentFontSize = savedFontSize;
    this.root.setAttribute('data-font-size', savedFontSize);

    // 유리 효과 강도 불러오기 (새 버전)
    const savedGlassIntensity = this.getFromLocalStorage('glassIntensity', 'medium');
    const intensityPresets = {
      low: { opacity: 0.95, blur: 10 },
      medium: { opacity: 0.85, blur: 20 },
      high: { opacity: 0.75, blur: 30 },
    };
    const preset = intensityPresets[savedGlassIntensity] || intensityPresets.medium;
    this.setCSSVariable('--glass-opacity', preset.opacity);
    this.setCSSVariable('--glass-blur', `${preset.blur}px`);

    // 유리 효과 활성화 (레거시 - 호환성)
    const savedGlassEnabled = this.getFromLocalStorage('glassEnabled', true);
    this.root.setAttribute('data-glass', savedGlassEnabled.toString());
    this.setCSSVariable('--glass-enabled', savedGlassEnabled);

    // 배경 이미지 불러오기
    const savedBackgroundImage = this.getFromLocalStorage('backgroundImage', '');
    if (savedBackgroundImage) {
      this.setCSSVariable('--background-image', `url('${savedBackgroundImage}')`);
    }

    console.log('📂 저장된 설정 불러오기 완료:', {
      theme: savedTheme,
      fontSize: savedFontSize,
      glassIntensity: savedGlassIntensity,
      glassEnabled: savedGlassEnabled,
      backgroundImage: savedBackgroundImage,
    });
  }
}
