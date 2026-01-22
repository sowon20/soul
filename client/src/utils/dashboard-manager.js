/**
 * 대시보드 관리자
 * 통계 및 활동 데이터를 가져와서 표시
 */

class DashboardManager {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      await this.loadTokenStats();
      this.setupEventListeners();
      this.initialized = true;
      console.log('✅ Dashboard initialized');
    } catch (error) {
      console.error('❌ Dashboard initialization failed:', error);
    }
  }

  async loadTokenStats() {
    try {
      // 토큰 상태만 가져오기
      const tokenStatus = await fetch('/api/chat/token-status').then(r => r.json()).catch(() => null);

      // 토큰 통계 업데이트
      this.updateStat('stat-tokens', this.formatNumber(tokenStatus?.currentTokens || 0), '');

    } catch (error) {
      console.error('Failed to load token stats:', error);
      this.updateStat('stat-tokens', '-', '');
    }
  }

  setupEventListeners() {
    // 자동 새로고침 제거 - 대시보드 열 때만 로드
  }

  updateStat(elementId, value, suffix = '') {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = `${value}${suffix}`;
    }
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}

// 전역 인스턴스 생성
const dashboardManager = new DashboardManager();

// 자동 초기화 제거 - 필요할 때만 수동으로 loadStats() 호출

export default dashboardManager;
