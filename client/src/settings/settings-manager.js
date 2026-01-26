/**
 * Settings Manager
 * 설정 페이지 프레임워크 - 컴포넌트 기반 라우팅
 *
 * Note: CSS는 main.css에서 import됨
 */

export class SettingsManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.currentPage = null;
    this.components = new Map();
  }

  /**
   * 설정 페이지 렌더링
   */
  async render(container, pageName = 'profile') {

    // 컨테이너 초기화
    container.innerHTML = `
      <div class="settings-container">
        <!-- 설정 네비게이션 -->
        <nav class="settings-nav">
          <button class="settings-nav-item" data-page="profile">
            <span class="nav-icon">👤</span>
            <span class="nav-label">프로필</span>
          </button>
          <button class="settings-nav-item" data-page="ai">
            <span class="nav-icon">🤖</span>
            <span class="nav-label">AI 설정</span>
          </button>
          <button class="settings-nav-item" data-page="app">
            <span class="nav-icon">⚙️</span>
            <span class="nav-label">앱설정</span>
          </button>
        </nav>

        <!-- 설정 컨텐츠 영역 -->
        <div class="settings-content" id="settingsContent"></div>
      </div>
    `;

    // 네비게이션 이벤트 등록
    this.attachNavigation(container);

    // 초기 페이지 로드
    await this.loadPage(pageName);
  }

  /**
   * 네비게이션 이벤트 등록
   */
  attachNavigation(container) {
    const navItems = container.querySelectorAll('.settings-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', async () => {
        const pageName = item.dataset.page;
        await this.loadPage(pageName);

        // 활성 상태 업데이트
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
      });
    });

    // 초기 활성 상태
    const initialNav = container.querySelector(`[data-page="${this.currentPage || 'profile'}"]`);
    if (initialNav) initialNav.classList.add('active');
  }

  /**
   * 페이지 동적 로드
   */
  async loadPage(pageName) {
    this.currentPage = pageName;
    const contentArea = document.getElementById('settingsContent');

    if (!contentArea) return;

    try {
      // 컴포넌트 동적 임포트
      const component = await this.getComponent(pageName);

      // 컴포넌트 렌더링
      await component.render(contentArea, this.apiClient);
    } catch (error) {
      console.error(`Failed to load settings page: ${pageName}`, error);
      contentArea.innerHTML = `
        <div class="settings-error">
          <p>설정 페이지를 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; color: rgba(255,255,255,0.6);">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 컴포넌트 가져오기 (캐싱)
   */
  async getComponent(pageName) {
    if (this.components.has(pageName)) {
      return this.components.get(pageName);
    }

    let ComponentClass;

    switch (pageName) {
      case 'profile':
        const { ProfileSettings } = await import('./components/profile-settings.js');
        ComponentClass = ProfileSettings;
        break;

      case 'ai':
        const { AISettings } = await import('./components/ai-settings.js');
        ComponentClass = AISettings;
        break;

      case 'app':
        const { AppSettings } = await import('./components/app-settings.js');
        ComponentClass = AppSettings;
        break;

      default:
        throw new Error(`Unknown page: ${pageName}`);
    }

    const component = new ComponentClass();
    this.components.set(pageName, component);
    return component;
  }
}
