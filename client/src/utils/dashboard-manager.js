/**
 * 대시보드 관리자
 * AI 라우팅 통계를 가져와서 표시
 */

class DashboardManager {
  constructor() {
    this.initialized = false;
    this.currentPeriod = 'today';
    this.customStartDate = null;
    this.customEndDate = null;
  }

  async init() {
    if (this.initialized) return;

    try {
      this.setupPeriodTabs();
      this.setupDateRange();
      this.setupStatsActions();
      await this.loadServerStatus();
      await this.loadRoutingStats();
      this.initialized = true;
      console.log('Dashboard initialized');

      // 30초마다 서버 상태 갱신
      setInterval(() => this.loadServerStatus(), 30000);
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
    }
  }

  /**
   * 통계 새로고침/초기화 버튼 설정
   */
  setupStatsActions() {
    const refreshBtn = document.getElementById('refreshStatsBtn');
    const resetBtn = document.getElementById('resetStatsBtn');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.style.transform = 'rotate(360deg)';
        refreshBtn.style.transition = 'transform 0.5s';
        await this.loadRoutingStats();
        setTimeout(() => {
          refreshBtn.style.transform = '';
          refreshBtn.style.transition = '';
        }, 500);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (!confirm('모든 사용 통계를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
          return;
        }
        await this.resetStats();
      });
    }
  }

  /**
   * 통계 초기화 (삭제)
   */
  async resetStats() {
    try {
      const response = await fetch('/api/chat/routing-stats', {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.loadRoutingStats();
        alert('통계가 초기화되었습니다.');
      } else {
        const data = await response.json();
        alert('초기화 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('Failed to reset stats:', error);
      alert('통계 초기화 중 오류가 발생했습니다.');
    }
  }

  async loadServerStatus() {
    const grid = document.getElementById('serverStatusGrid');
    if (!grid) return;

    grid.querySelectorAll('.server-indicator').forEach(el => {
      if (!el.closest('[data-service="websocket"]')) {
        el.className = 'server-indicator checking';
      }
    });

    try {
      const response = await fetch('/api/config/server-status');
      const status = await response.json();

      Object.entries(status).forEach(([service, info]) => {
        const item = grid.querySelector(`[data-service="${service}"]`);
        if (item) {
          const indicator = item.querySelector('.server-indicator');
          const portEl = item.querySelector('.server-port');

          indicator.className = `server-indicator ${info.online ? 'online' : 'offline'}`;
          if (info.port) {
            portEl.textContent = `:${info.port}`;
          }
          if (info.host && service === 'ftp') {
            portEl.textContent = `${info.host}:${info.port}`;
          }
        }
      });
    } catch (error) {
      console.error('Failed to load server status:', error);
      grid.querySelectorAll('.server-indicator').forEach(el => {
        el.className = 'server-indicator offline';
      });
    }
  }

  setupPeriodTabs() {
    const tabs = document.querySelectorAll('.stats-period-tab');
    const dateRangeEl = document.getElementById('statsDateRange');

    tabs.forEach(tab => {
      tab.addEventListener('click', async (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');

        const period = e.target.dataset.period;
        this.currentPeriod = period;

        if (dateRangeEl) {
          dateRangeEl.style.display = period === 'custom' ? 'flex' : 'none';
        }

        if (period !== 'custom') {
          await this.loadRoutingStats();
        }
      });
    });
  }

  setupDateRange() {
    const startInput = document.getElementById('statsStartDate');
    const endInput = document.getElementById('statsEndDate');
    const applyBtn = document.getElementById('statsDateApply');

    if (!startInput || !endInput || !applyBtn) return;

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    startInput.value = weekAgo;
    endInput.value = today;

    applyBtn.addEventListener('click', async () => {
      this.customStartDate = startInput.value;
      this.customEndDate = endInput.value;
      await this.loadRoutingStats();
    });
  }

  async loadRoutingStats() {
    try {
      let url = `/api/chat/routing-stats?period=${this.currentPeriod}`;

      if (this.currentPeriod === 'custom' && this.customStartDate && this.customEndDate) {
        url += `&startDate=${this.customStartDate}&endDate=${this.customEndDate}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.stats) {
        const stats = data.stats;

        this.updateStat('stat-requests', this.formatNumber(stats.totalRequests || 0));
        this.updateStat('stat-light', stats.distribution?.light || '0%');
        this.updateStat('stat-medium', stats.distribution?.medium || '0%');
        this.updateStat('stat-heavy', stats.distribution?.heavy || '0%');

        const cost = stats.totalCost || 0;
        this.updateStat('stat-cost', '$' + cost.toFixed(4));

        const latency = stats.averageLatency;
        this.updateStat('stat-latency', latency ? latency.toFixed(0) + 'ms' : '-');

        this.renderTokenUsage(stats);
        this.renderModelUsage(stats.modelUsage || []);
        this.renderCategoryUsage(stats.categoryUsage || []);
      }
    } catch (error) {
      console.error('Failed to load routing stats:', error);
      this.setDefaultStats();
    }
  }

  renderTokenUsage(stats) {
    const totalTokens = stats.totalTokens || 0;
    const inputTokens = stats.inputTokens || 0;
    const outputTokens = stats.outputTokens || 0;
    const totalRequests = stats.totalRequests || 1;
    const tokensPerRequest = Math.round(totalTokens / totalRequests);

    const totalEl = document.getElementById('stat-total-tokens');
    if (totalEl) {
      totalEl.textContent = this.formatNumber(totalTokens);
      if (totalTokens >= 100000) {
        totalEl.classList.add('warning');
      } else {
        totalEl.classList.remove('warning');
      }
    }

    const inputEl = document.getElementById('stat-input-tokens');
    if (inputEl) {
      inputEl.textContent = this.formatNumber(inputTokens);
      if (inputTokens >= 80000) {
        inputEl.classList.add('warning');
      } else {
        inputEl.classList.remove('warning');
      }
    }

    const outputEl = document.getElementById('stat-output-tokens');
    if (outputEl) {
      outputEl.textContent = this.formatNumber(outputTokens);
    }

    const perRequestEl = document.getElementById('stat-tokens-per-request');
    if (perRequestEl) {
      if (tokensPerRequest >= 10000) {
        perRequestEl.classList.add('high-usage');
        perRequestEl.innerHTML = `⚠️ 평균 <span>${this.formatNumber(tokensPerRequest)}</span> 토큰/요청`;
      } else if (tokensPerRequest >= 5000) {
        perRequestEl.classList.remove('high-usage');
        perRequestEl.innerHTML = `평균 <span>${this.formatNumber(tokensPerRequest)}</span> 토큰/요청 (주의)`;
      } else {
        perRequestEl.classList.remove('high-usage');
        perRequestEl.innerHTML = `평균 <span>${this.formatNumber(tokensPerRequest)}</span> 토큰/요청`;
      }
    }
  }

  renderModelUsage(modelUsage) {
    const container = document.getElementById('model-usage-list');
    if (!container) return;

    if (modelUsage.length === 0) {
      container.innerHTML = '<div class="no-data">아직 사용 기록이 없습니다</div>';
      return;
    }

    const topModels = modelUsage.slice(0, 5);

    container.innerHTML = topModels.map(model => {
      const displayName = this.getModelDisplayName(model.modelId);
      const percentage = parseFloat(model.percentage) || 0;

      return `
        <div class="model-usage-item">
          <div class="model-usage-header">
            <span class="model-name">${displayName}</span>
            <span class="model-percentage">${model.percentage}</span>
          </div>
          <div class="model-usage-bar">
            <div class="model-usage-fill" style="width: ${percentage}%"></div>
          </div>
          <div class="model-usage-details">
            <span>${model.count}회</span>
            <span>${model.avgLatency ? model.avgLatency.toFixed(0) + 'ms' : '-'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderCategoryUsage(categoryUsage) {
    const container = document.getElementById('category-usage-list');
    if (!container) return;

    if (!categoryUsage || categoryUsage.length === 0) {
      container.innerHTML = '<div class="no-data">카테고리별 기록 없음</div>';
      return;
    }

    const categoryNames = {
      'chat': '💬 대화',
      'summary': '📝 요약',
      'compression': '🗜️ 압축',
      'alba': '⚙️ 백그라운드',
      'role': '🎭 역할',
      'embedding': '🔗 임베딩',
      'other': '📦 기타'
    };

    const categoryColors = {
      'chat': '#4CAF50',
      'summary': '#2196F3',
      'compression': '#FF9800',
      'alba': '#9C27B0',
      'role': '#E91E63',
      'embedding': '#00BCD4',
      'other': '#607D8B'
    };

    container.innerHTML = categoryUsage.map(cat => {
      const name = categoryNames[cat.category] || cat.category;
      const color = categoryColors[cat.category] || '#607D8B';
      const percentage = parseFloat(cat.percentage) || 0;
      const cost = cat.totalCost ? '$' + cat.totalCost.toFixed(4) : '-';

      return `
        <div class="category-usage-item">
          <div class="category-usage-header">
            <span class="category-name">${name}</span>
            <span class="category-cost">${cost}</span>
          </div>
          <div class="category-usage-bar">
            <div class="category-usage-fill" style="width: ${percentage}%; background: ${color}"></div>
          </div>
          <div class="category-usage-details">
            <span>${cat.count}회 (${cat.percentage})</span>
            <span>${this.formatNumber(cat.totalTokens || 0)} 토큰</span>
          </div>
        </div>
      `;
    }).join('');
  }

  getModelDisplayName(modelId) {
    if (!modelId) return 'Unknown';

    const id = modelId.toLowerCase();

    if (id.includes('claude')) {
      if (id.includes('opus')) return 'Claude Opus';
      if (id.includes('sonnet')) return 'Claude Sonnet';
      if (id.includes('haiku')) return 'Claude Haiku';
      return 'Claude';
    }

    if (id.includes('gpt')) {
      if (id.includes('4o')) return 'GPT-4o';
      if (id.includes('4')) return 'GPT-4';
      if (id.includes('3.5')) return 'GPT-3.5';
      return 'GPT';
    }

    if (id.includes('gemini')) {
      if (id.includes('ultra')) return 'Gemini Ultra';
      if (id.includes('pro')) return 'Gemini Pro';
      if (id.includes('flash')) return 'Gemini Flash';
      return 'Gemini';
    }

    if (id.includes('grok')) {
      if (id.includes('mini')) return 'Grok Mini';
      return 'Grok';
    }

    return modelId.length > 20 ? modelId.substring(0, 20) + '...' : modelId;
  }

  setDefaultStats() {
    this.updateStat('stat-requests', '0');
    this.updateStat('stat-light', '0%');
    this.updateStat('stat-medium', '0%');
    this.updateStat('stat-heavy', '0%');
    this.updateStat('stat-cost', '$0.00');
    this.updateStat('stat-latency', '-');

    this.updateStat('stat-total-tokens', '0');
    this.updateStat('stat-input-tokens', '0');
    this.updateStat('stat-output-tokens', '0');

    const perRequestEl = document.getElementById('stat-tokens-per-request');
    if (perRequestEl) {
      perRequestEl.innerHTML = '평균 <span>0</span> 토큰/요청';
      perRequestEl.classList.remove('high-usage');
    }

    const modelContainer = document.getElementById('model-usage-list');
    if (modelContainer) {
      modelContainer.innerHTML = '<div class="no-data">아직 사용 기록이 없습니다</div>';
    }

    const categoryContainer = document.getElementById('category-usage-list');
    if (categoryContainer) {
      categoryContainer.innerHTML = '<div class="no-data">카테고리별 기록 없음</div>';
    }
  }

  updateStat(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value;
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

  async refresh() {
    await this.loadRoutingStats();
  }

  async setPeriod(period) {
    this.currentPeriod = period;
    await this.loadRoutingStats();
  }
}

// 전역 인스턴스 생성
const dashboardManager = new DashboardManager();

export default dashboardManager;
