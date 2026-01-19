/**
 * Menu Manager
 * 2단 슬라이딩 메뉴 관리
 */

export class MenuManager {
  constructor() {
    this.mainMenu = document.getElementById('mainMenu');
    this.subMenu = document.getElementById('subMenu');
    this.subMenuContent = document.getElementById('subMenuContent');
    this.menuOverlay = document.getElementById('menuOverlay');
    this.currentMenu = 'dashboard';

    // 메뉴 컨텐츠 정의
    this.menuContents = {
      dashboard: {
        title: '대시보드',
        render: () => this.renderDashboard(),
      },
      conversations: {
        title: '대화 목록',
        render: () => this.renderConversations(),
      },
      search: {
        title: '통합 검색',
        render: () => this.renderSearch(),
      },
      memory: {
        title: '메모리 탐색',
        render: () => this.renderMemory(),
      },
      files: {
        title: '파일 관리',
        render: () => this.renderFiles(),
      },
      mcp: {
        title: 'MCP 도구',
        render: () => this.renderMCP(),
      },
      settings: {
        title: '설정',
        render: () => this.renderSettings(),
      },
    };
  }

  /**
   * 메뉴 열기
   */
  open() {
    this.mainMenu.classList.add('open');
    this.subMenu.classList.add('open');
    this.menuOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';

    // 현재 선택된 메뉴 컨텐츠 렌더링
    this.switchMenu(this.currentMenu);
  }

  /**
   * 메뉴 닫기
   */
  close() {
    this.mainMenu.classList.remove('open');
    this.subMenu.classList.remove('open');
    this.menuOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /**
   * 메뉴 전환
   * @param {string} menuType
   */
  switchMenu(menuType) {
    if (!this.menuContents[menuType]) {
      console.warn(`알 수 없는 메뉴: ${menuType}`);
      return;
    }

    this.currentMenu = menuType;

    // Active 상태 업데이트
    document.querySelectorAll('.main-menu-item').forEach(item => {
      if (item.dataset.menu === menuType) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 서브 메뉴 컨텐츠 렌더링
    const content = this.menuContents[menuType];
    content.render();
  }

  /* ===================================
     메뉴 컨텐츠 렌더링
     =================================== */

  renderDashboard() {
    this.subMenuContent.innerHTML = `
      <div class="dashboard">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          대시보드
        </h2>

        <div class="dashboard-grid" style="display: grid; gap: 1rem;">
          <!-- 빠른 통계 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              오늘의 통계
            </h3>
            <div style="font-size: var(--font-size-sm); line-height: 1.8; opacity: 0.9;">
              <p>총 대화: 0개</p>
              <p>메시지: 0개</p>
              <p>토큰 사용: 0</p>
            </div>
          </div>

          <!-- 최근 활동 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              최근 활동
            </h3>
            <p style="font-size: var(--font-size-sm); opacity: 0.8;">
              활동 기록이 없습니다.
            </p>
          </div>

          <!-- 빠른 액션 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              빠른 액션
            </h3>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button class="action-btn" style="padding: 0.75rem; background: rgba(255, 255, 255, 0.2); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; font-size: var(--font-size-sm); font-weight: 400; transition: all 0.2s;">
                새 대화 시작
              </button>
              <button class="action-btn" style="padding: 0.75rem; background: rgba(255, 255, 255, 0.12); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; font-size: var(--font-size-sm); font-weight: 400; transition: all 0.2s;">
                메모리 검색
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderConversations() {
    this.subMenuContent.innerHTML = `
      <div class="conversations">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          대화 목록
        </h2>
        <div class="conversation-list">
          <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
            저장된 대화가 없습니다.
          </p>
        </div>
      </div>
    `;
  }

  renderSearch() {
    this.subMenuContent.innerHTML = `
      <div class="search">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          통합 검색
        </h2>
        <input
          type="text"
          placeholder="검색어 입력..."
          style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: var(--font-size-base); margin-bottom: 1rem;"
        >
        <div style="margin-top: 1rem;">
          <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center;">
            검색 결과가 여기에 표시됩니다.
          </p>
        </div>
      </div>
    `;
  }

  renderMemory() {
    this.subMenuContent.innerHTML = `
      <div class="memory">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          메모리 탐색
        </h2>
        <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
          메모리 데이터가 없습니다.
        </p>
      </div>
    `;
  }

  renderFiles() {
    this.subMenuContent.innerHTML = `
      <div class="files">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          파일 관리
        </h2>
        <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
          파일이 없습니다.
        </p>
      </div>
    `;
  }

  renderMCP() {
    this.subMenuContent.innerHTML = `
      <div class="mcp">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          MCP 도구
        </h2>
        <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
          MCP 도구가 연결되지 않았습니다.
        </p>
      </div>
    `;
  }

  renderSettings() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'default';
    const currentFontSize = document.documentElement.getAttribute('data-font-size') || 'md';

    // Get current glass intensity and background image from localStorage
    const savedGlassIntensity = window.soulApp.themeManager.getFromLocalStorage('glassIntensity', 'medium');
    const savedBackgroundImage = window.soulApp.themeManager.getFromLocalStorage('backgroundImage', '');

    this.subMenuContent.innerHTML = `
      <div class="settings">
        <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem;">
          설정
        </h2>

        <!-- 테마 설정 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            테마
          </h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
            ${['default', 'basic', 'dark', 'ocean', 'forest', 'sunset']
              .map(
                (theme) => `
              <button
                class="theme-btn"
                data-theme="${theme}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${
                  theme === currentTheme ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${theme}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- 글씨 크기 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            글씨 크기
          </h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${['xs', 'sm', 'md', 'lg', 'xl']
              .map(
                (size) => `
              <button
                class="font-size-btn"
                data-size="${size}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${
                  size === currentFontSize ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${size.toUpperCase()}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- 유리 효과 강도 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            유리 효과 강도
          </h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${['low', 'medium', 'high']
              .map(
                (intensity) => `
              <button
                class="glass-intensity-btn"
                data-intensity="${intensity}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${
                  intensity === savedGlassIntensity ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
                }; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${intensity === 'low' ? '낮음' : intensity === 'medium' ? '중간' : '높음'}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- 배경 이미지 -->
        <div>
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            배경 이미지
          </h3>
          <input
            type="text"
            id="backgroundImageInput"
            placeholder="이미지 URL 입력..."
            value="${savedBackgroundImage}"
            style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.9375rem; margin-bottom: 0.75rem;"
          >
          <button
            id="applyBackgroundBtn"
            style="width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.15); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
          >
            배경 적용
          </button>
          ${savedBackgroundImage ? `
            <button
              id="removeBackgroundBtn"
              style="width: 100%; padding: 0.75rem; background: rgba(220, 104, 104, 0.2); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s; margin-top: 0.5rem;"
            >
              배경 제거
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // 이벤트 리스너 추가
    this.attachSettingsListeners();
  }

  /**
   * 설정 패널 이벤트 리스너
   */
  attachSettingsListeners() {
    // 테마 버튼
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        window.soulApp.themeManager.applyTheme(theme);
        this.renderSettings(); // 다시 렌더링하여 active 상태 업데이트
      });
    });

    // 글씨 크기 버튼
    document.querySelectorAll('.font-size-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const size = btn.dataset.size;
        window.soulApp.themeManager.setFontSize(size);
        this.renderSettings();
      });
    });

    // 유리 효과 강도 버튼
    document.querySelectorAll('.glass-intensity-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const intensity = btn.dataset.intensity;
        window.soulApp.themeManager.setGlassIntensity(intensity);
        this.renderSettings();
      });
    });

    // 배경 이미지 적용 버튼
    const applyBackgroundBtn = document.getElementById('applyBackgroundBtn');
    if (applyBackgroundBtn) {
      applyBackgroundBtn.addEventListener('click', () => {
        const url = document.getElementById('backgroundImageInput').value.trim();
        if (url) {
          window.soulApp.themeManager.setBackgroundImage(url);
          this.renderSettings();
        }
      });
    }

    // 배경 이미지 제거 버튼
    const removeBackgroundBtn = document.getElementById('removeBackgroundBtn');
    if (removeBackgroundBtn) {
      removeBackgroundBtn.addEventListener('click', () => {
        window.soulApp.themeManager.removeBackgroundImage();
        this.renderSettings();
      });
    }

    // Enter 키로 배경 적용
    const backgroundInput = document.getElementById('backgroundImageInput');
    if (backgroundInput) {
      backgroundInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const url = e.target.value.trim();
          if (url) {
            window.soulApp.themeManager.setBackgroundImage(url);
            this.renderSettings();
          }
        }
      });
    }
  }
}
