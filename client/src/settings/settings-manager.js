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

    // 컨테이너 초기화 (탭 없이 컨텐츠만)
    container.innerHTML = `
      <div class="settings-container">
        <div class="settings-content" id="settingsContent"></div>
      </div>
    `;

    // 해당 페이지 바로 로드
    await this.loadPage(pageName);
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

      case 'storage':
        const { StorageSettings } = await import('./components/storage-settings.js');
        // StorageSettings는 다른 컴포넌트와 인터페이스가 다름
        const storageComponent = new StorageSettings(this.apiClient);
        this.components.set(pageName, {
          render: async (container) => await storageComponent.init(container)
        });
        return this.components.get(pageName);

      default:
        throw new Error(`Unknown page: ${pageName}`);
    }

    const component = new ComponentClass();
    this.components.set(pageName, component);
    return component;
  }
}
