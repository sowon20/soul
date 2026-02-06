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
    this.currentCurrency = 'USD';
    this.exchangeRate = null;
  }

  async init() {
    if (this.initialized) return;

    try {
      this.setupPeriodTabs();
      this.setupDateRange();
      this.setupStatsActions();
      this.setupBreakdownPanels();
      await this.loadCurrencyPreference();
      this.setupCurrencyDropdown();
      await this.fetchExchangeRate();
      await this.loadServerStatus();
      await this.loadRoutingStats();
      await this.loadLastRequestFromStorage();
      this.setupBillingRefresh();
      await this.loadServiceBilling();
      this.initialized = true;
      console.log('Dashboard initialized');

      // 30초마다 서버 상태 갱신
      setInterval(() => this.loadServerStatus(), 30000);
      // 60초마다 서비스 잔액 갱신
      setInterval(() => this.loadServiceBilling(), 60000);
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
    }
  }

  /**
   * 마지막 요청 정보를 DB에서 불러오기
   */
  async loadLastRequestFromStorage() {
    try {
      const response = await fetch('/api/config/preferences');
      const prefs = await response.json();
      if (prefs.lastRequestTokenUsage) {
        this.updateLastRequest(prefs.lastRequestTokenUsage, true); // skipSave = true
      }
    } catch (e) {
      console.error('Failed to load last request from DB:', e);
    }
  }

  /**
   * 마지막 요청 정보를 DB에 저장
   */
  async saveLastRequestToStorage(tokenUsage) {
    try {
      await fetch('/api/config/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastRequestTokenUsage: tokenUsage })
      });
    } catch (e) {
      console.error('Failed to save last request to DB:', e);
    }
  }

  /**
   * 토큰 분류 패널 접기/펼치기 설정
   */
  setupBreakdownPanels() {
    const headers = document.querySelectorAll('.breakdown-panel-header');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const panel = header.closest('.breakdown-panel');
        const targetId = header.dataset.target;
        const content = document.getElementById(targetId);
        const toggle = header.querySelector('.breakdown-toggle');

        if (!content) return;

        const isCollapsed = panel.classList.contains('collapsed');
        if (isCollapsed) {
          panel.classList.remove('collapsed');
          content.style.display = 'block';
          toggle.textContent = '▼';
        } else {
          panel.classList.add('collapsed');
          content.style.display = 'none';
          toggle.textContent = '▶';
        }
      });
    });
  }

  /**
   * 통계 새로고침/초기화 버튼 설정
   */
  setupStatsActions() {
    const refreshBtn = document.getElementById('refreshStatsBtn');
    const resetBtn = document.getElementById('resetStatsBtn');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '로딩...';
        await this.loadRoutingStats();
        refreshBtn.textContent = '새로고침';
        refreshBtn.disabled = false;
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
   * 통화 드롭다운 설정
   */
  setupCurrencyDropdown() {
    const dropdown = document.getElementById('currencyDropdown');
    if (!dropdown) return;

    const options = dropdown.querySelectorAll('.currency-option');
    options.forEach(opt => {
      // 초기 활성화 표시
      if (opt.dataset.currency === this.currentCurrency) {
        opt.classList.add('active');
      }

      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currency = opt.dataset.currency;
        this.currentCurrency = currency;

        // 활성화 표시 업데이트
        options.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        // 통화 변경 시 재렌더링
        if (this._cachedModelUsage) this.renderModelUsage(this._cachedModelUsage);
        if (this._cachedCategoryUsage) this.renderCategoryUsage(this._cachedCategoryUsage);
        if (this._cachedBillingData) this.renderServiceBilling(this._cachedBillingData);

        // DB에 저장
        await this.saveCurrencyPreference(currency);
      });
    });
  }

  /**
   * 통화 설정 저장
   */
  async saveCurrencyPreference(currency) {
    try {
      await fetch('/api/config/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency })
      });
      console.log('💱 통화 설정 저장:', currency);
    } catch (error) {
      console.error('통화 설정 저장 실패:', error);
    }
  }

  /**
   * 통화 설정 불러오기
   */
  async loadCurrencyPreference() {
    try {
      const response = await fetch('/api/config/preferences');
      const prefs = await response.json();
      if (prefs.currency) {
        this.currentCurrency = prefs.currency;
        // 드롭다운 UI 업데이트
        const dropdown = document.getElementById('currencyDropdown');
        if (dropdown) {
          const options = dropdown.querySelectorAll('.currency-option');
          options.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.currency === this.currentCurrency);
          });
        }
      }
    } catch (error) {
      console.error('통화 설정 불러오기 실패:', error);
    }
  }

  /**
   * 환율 가져오기 (무료 API)
   */
  async fetchExchangeRate() {
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      this.exchangeRate = data.rates.KRW;
      this.exchangeRates = data.rates; // 모든 통화 환율 저장
      console.log('💱 환율 로드: USD→KRW', this.exchangeRate);
    } catch (error) {
      console.error('환율 가져오기 실패:', error);
      this.exchangeRate = 1400; // 기본값
      this.exchangeRates = { KRW: 1400, CNY: 7.2 };
    }
  }

  /**
   * 임의 통화 → 원화 변환
   */
  convertToKRW(amount, currency = 'USD') {
    if (!amount || amount <= 0) return 0;
    if (currency === 'KRW') return amount;
    if (currency === 'USD') return amount * (this.exchangeRate || 1400);
    // 다른 통화: USD 기준 환율로 변환 (CNY 등)
    const rateToUSD = this.exchangeRates?.[currency];
    if (rateToUSD) {
      const usd = amount / rateToUSD;
      return usd * (this.exchangeRate || 1400);
    }
    return amount; // 환율 없으면 원본
  }


  /**
   * USD 비용을 현재 화폐 설정에 맞게 포맷
   */
  formatCost(usdAmount) {
    if (!usdAmount || usdAmount <= 0) return '-';
    if (this.currentCurrency === 'KRW' && this.exchangeRate) {
      const krw = usdAmount * this.exchangeRate;
      return `₩${Math.round(krw).toLocaleString()}`;
    }
    return `$${usdAmount.toFixed(4)}`;
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

      // 저장소 타입 이름 매핑
      const storageTypeNames = {
        local: '로컬',
        ftp: 'FTP/NAS',
        oracle: 'Oracle',
        notion: 'Notion'
      };

      Object.entries(status).forEach(([service, info]) => {
        const item = grid.querySelector(`[data-service="${service}"]`);
        if (item) {
          const indicator = item.querySelector('.server-indicator');
          const portEl = item.querySelector('.server-port');

          indicator.className = `server-indicator ${info.online ? 'online' : 'offline'}`;
          if (info.port) {
            portEl.textContent = `:${info.port}`;
          }
          if (info.label) {
            portEl.textContent = info.label;
          }
        }
      });

      // 저장소 상태 업데이트
      const storageItem = grid.querySelector('[data-service="storage"]');
      if (storageItem && status.storage) {
        const indicator = storageItem.querySelector('.server-indicator');
        const nameEl = storageItem.querySelector('.server-name');
        const labelEl = storageItem.querySelector('.server-port');

        indicator.className = `server-indicator ${status.storage.online ? 'online' : 'offline'}`;
        nameEl.textContent = storageTypeNames[status.storage.type] || '저장소';
        labelEl.textContent = status.storage.label || status.storage.type;
      }
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

        const latency = stats.averageLatency;
        this.updateStat('stat-latency', latency ? latency.toFixed(0) + 'ms' : '-');

        this.renderTokenUsage(stats);
        this._cachedModelUsage = stats.modelUsage || [];
        this._cachedCategoryUsage = stats.categoryUsage || [];
        this.renderModelUsage(this._cachedModelUsage);
        this.renderCategoryUsage(this._cachedCategoryUsage);
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

    // 토큰 분류 정보
    const breakdown = stats.tokenBreakdown || {};
    const messageTokens = breakdown.messages || 0;
    const systemTokens = breakdown.system || 0;
    const toolTokens = breakdown.tools || 0;
    const avgToolCount = breakdown.avgToolCount || 0;

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

    // 토큰 분류별 표시
    this.renderTokenBreakdown(messageTokens, systemTokens, toolTokens, avgToolCount, inputTokens);

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

  /**
   * 토큰 분류별 표시 (메시지/시스템/도구)
   */
  renderTokenBreakdown(messageTokens, systemTokens, toolTokens, avgToolCount, totalInput) {
    const container = document.getElementById('token-breakdown');
    if (!container) return;

    // 비율 계산
    const total = messageTokens + systemTokens + toolTokens;
    if (total === 0) {
      container.innerHTML = '<div class="no-data">분류 데이터 없음</div>';
      return;
    }

    const msgPercent = ((messageTokens / total) * 100).toFixed(1);
    const sysPercent = ((systemTokens / total) * 100).toFixed(1);
    const toolPercent = ((toolTokens / total) * 100).toFixed(1);

    container.innerHTML = `
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-label">💬 메시지</span>
          <span class="breakdown-value">${this.formatNumber(messageTokens)} (${msgPercent}%)</span>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-fill messages" style="width: ${msgPercent}%"></div>
        </div>
      </div>
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-label">⚙️ 시스템</span>
          <span class="breakdown-value">${this.formatNumber(systemTokens)} (${sysPercent}%)</span>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-fill system" style="width: ${sysPercent}%"></div>
        </div>
      </div>
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-label">🔧 도구 (평균 ${avgToolCount}개)</span>
          <span class="breakdown-value">${this.formatNumber(toolTokens)} (${toolPercent}%)</span>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-fill tools" style="width: ${toolPercent}%"></div>
        </div>
      </div>
    `;
  }

  /**
   * 마지막 요청 실시간 업데이트 (채팅 응답마다 호출)
   * @param {Object} tokenUsage - chat.js에서 반환한 detailedTokenUsage
   */
  updateLastRequest(tokenUsage, skipSave = false) {
    if (!tokenUsage) {
      return;
    }

    // 로컬스토리지에 저장 (새로고침 시 복원용)
    if (!skipSave) {
      this.saveLastRequestToStorage(tokenUsage);
    }

    const { actual, breakdown, meta } = tokenUsage;

    // 모델 (전체 모델 ID, 길면 ... 처리)
    const modelEl = document.getElementById('lastReqModel');
    if (modelEl) {
      modelEl.textContent = meta?.model || '-';
      modelEl.title = meta?.model || '';
    }

    // Tier 배지
    const tierEl = document.getElementById('lastReqTier');
    if (tierEl) {
      const tier = meta?.tier || '-';
      const tierLabels = { light: '경량', medium: '중간', heavy: '고성능', single: '단일' };
      tierEl.textContent = tierLabels[tier] || tier;
      tierEl.className = 'last-req-tier-badge ' + tier;
    }

    // 입력/출력 토큰
    const inputEl = document.getElementById('lastReqInput');
    if (inputEl) {
      inputEl.textContent = this.formatNumber(actual?.input || 0);
    }

    const outputEl = document.getElementById('lastReqOutput');
    if (outputEl) {
      outputEl.textContent = this.formatNumber(actual?.output || 0);
    }

    // 토큰 분류 바
    const msgTokens = breakdown?.messages || 0;
    const sysTokens = breakdown?.system || 0;
    const toolTokens = breakdown?.tools || 0;
    const toolCount = breakdown?.toolCount || 0;
    const totalBreakdown = msgTokens + sysTokens + toolTokens;

    if (totalBreakdown > 0) {
      const msgPercent = (msgTokens / totalBreakdown) * 100;
      const sysPercent = (sysTokens / totalBreakdown) * 100;
      const toolPercent = (toolTokens / totalBreakdown) * 100;

      const msgBar = document.getElementById('lastBreakdownMessages');
      const sysBar = document.getElementById('lastBreakdownSystem');
      const toolBar = document.getElementById('lastBreakdownTools');

      if (msgBar) msgBar.style.width = `${msgPercent}%`;
      if (sysBar) sysBar.style.width = `${sysPercent}%`;
      if (toolBar) toolBar.style.width = `${toolPercent}%`;
    }

    // 레전드 값
    const msgValEl = document.getElementById('lastBreakdownMessagesVal');
    const sysValEl = document.getElementById('lastBreakdownSystemVal');
    const toolValEl = document.getElementById('lastBreakdownToolsVal');
    const toolCountEl = document.getElementById('lastBreakdownToolCount');

    if (msgValEl) msgValEl.textContent = this.formatNumber(msgTokens);
    if (sysValEl) sysValEl.textContent = this.formatNumber(sysTokens);
    if (toolValEl) toolValEl.textContent = this.formatNumber(toolTokens);
    if (toolCountEl) toolCountEl.textContent = toolCount;

    // 응답시간
    const latencyEl = document.getElementById('lastReqLatency');
    if (latencyEl) {
      const ms = meta?.latency || 0;
      if (ms >= 1000) {
        latencyEl.textContent = `${(ms / 1000).toFixed(1)}s`;
      } else {
        latencyEl.textContent = `${ms}ms`;
      }
    }

    // 시간
    const timeEl = document.getElementById('lastRequestTime');
    if (timeEl && meta?.timestamp) {
      const date = new Date(meta.timestamp);
      timeEl.textContent = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
            <span class="model-percentage">${model.percentage || '0%'}</span>
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
    // 용도별 사용량 제거 (사용하지 않음)
    return;
  }

  /**
   * 서비스 잔액 새로고침 버튼
   */
  setupBillingRefresh() {
    // 서비스 잔액 새로고침 버튼
    const refreshBtn = document.getElementById('refreshBillingBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '로딩...';
        await this.loadServiceBilling();
        refreshBtn.textContent = '새로고침';
        refreshBtn.disabled = false;
      });
    }

    // 모델별 사용량 새로고침 버튼
    const refreshModelUsageBtn = document.getElementById('refreshModelUsageBtn');
    if (refreshModelUsageBtn) {
      refreshModelUsageBtn.addEventListener('click', async () => {
        refreshModelUsageBtn.disabled = true;
        refreshModelUsageBtn.textContent = '로딩...';
        await this.loadRoutingStats();
        refreshModelUsageBtn.textContent = '새로고침';
        refreshModelUsageBtn.disabled = false;
      });
    }
  }

  /**
   * 서비스 잔액/사용량 로드
   */
  async loadServiceBilling() {
    try {
      const response = await fetch('/api/chat/service-billing');
      const data = await response.json();

      if (data.success && data.services) {
        this._cachedBillingData = data.services;
        this.renderServiceBilling(data.services);
      }
    } catch (error) {
      console.error('Failed to load service billing:', error);
      const container = document.getElementById('service-billing-list');
      if (container) {
        container.innerHTML = '<div class="no-data">잔액 정보를 불러올 수 없습니다</div>';
      }
    }
  }

  /**
   * 서비스 잔액 카드 렌더링
   */
  renderServiceBilling(services) {
    const container = document.getElementById('service-billing-list');
    if (!container) return;

    if (!services || services.length === 0) {
      container.innerHTML = '<div class="no-data">활성화된 서비스 없음</div>';
      return;
    }

    const serviceIcons = {
      'anthropic': '🟣',
      'openai': '🟢',
      'google': '🔵',
      'xai': '⚫',
      'openrouter': '🟠',
      'huggingface': '🟡',
      'ollama': '🔧',
      'lightning': '⚡',
      'cartesia': '🎙️',
      'fireworks': '🔥'
    };

    // 잔액 있는 서비스 / 없는 서비스 분리
    const withBalance = services.filter(s => s.balance && s.balance.total_credits > 0);
    const withoutBalance = services.filter(s => !s.balance || !s.balance.total_credits);

    const renderCard = (svc) => {
      const icon = serviceIcons[svc.serviceId] || '🔹';
      const topModelName = svc.topModel
        ? this.getModelDisplayName(svc.topModel)
        : '-';

      // 잔액 표시
      let balanceHtml = '';
      if (svc.balance && svc.balance.total_credits > 0) {
        const totalCredits = svc.balance.total_credits;
        const totalUsage = svc.balance.total_usage || 0;
        const remaining = svc.balance.remaining != null ? svc.balance.remaining : (totalCredits - totalUsage);

        const currency = svc.balance.currency || 'USD';
        let remainStr;
        if (this.currentCurrency === 'KRW' && this.exchangeRate) {
          const krw = this.convertToKRW(remaining, currency);
          remainStr = `₩${Math.round(krw).toLocaleString()}`;
        } else if (currency === 'CNY') {
          remainStr = `¥${remaining.toFixed(2)}`;
        } else {
          remainStr = this.formatCost(remaining) || '$0.00';
        }
        const usagePercent = totalCredits > 0
          ? Math.min(100, Math.round((totalUsage / totalCredits) * 100))
          : 0;
        balanceHtml += `
          <div class="billing-balance-row">
            <span class="billing-balance-label">잔액</span>
            <span class="billing-balance-value">${remainStr}</span>
          </div>
          <div class="model-usage-bar">
            <div class="billing-usage-fill" style="width: ${usagePercent}%"></div>
          </div>
        `;

        if (svc.balance.is_free_tier) {
          balanceHtml += '<span class="billing-tag billing-free">무료 티어</span>';
        }
      }

      return `
        <div class="service-billing-item">
          <div class="service-billing-item-header">
            <span class="service-billing-name">${icon} ${svc.name}</span>
          </div>
          ${balanceHtml}
          <div class="service-billing-details">
            <span>오늘 ${svc.todayRequests}회</span>
            <span>${topModelName}</span>
          </div>
        </div>
      `;
    };

    let html = '';

    // 잔액 있는 서비스
    if (withBalance.length > 0) {
      html += withBalance.map(renderCard).join('');
    }

    // 잔액 없는 서비스 (접기/펼치기)
    if (withoutBalance.length > 0) {
      const collapsed = this._billingOthersCollapsed !== false; // 기본: 접힘
      html += `
        <div class="billing-others-toggle" id="billing-others-toggle">
          <span>${collapsed ? '▶' : '▼'} 기타 서비스 (${withoutBalance.length})</span>
        </div>
        <div class="billing-others-list" id="billing-others-list" style="display: ${collapsed ? 'none' : 'grid'}">
          ${withoutBalance.map(renderCard).join('')}
        </div>
      `;
    }

    container.innerHTML = html;

    // 접기/펼치기 이벤트
    const toggleBtn = document.getElementById('billing-others-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const list = document.getElementById('billing-others-list');
        const isHidden = list.style.display === 'none';
        list.style.display = isHidden ? 'grid' : 'none';
        toggleBtn.querySelector('span').textContent = `${isHidden ? '▼' : '▶'} 기타 서비스 (${withoutBalance.length})`;
        this._billingOthersCollapsed = !isHidden;
      });
    }
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
      // HF Inference OSS 모델 구분
      const ossMatch = id.match(/gpt-oss-(\d+b)/);
      if (ossMatch) return `GPT-OSS ${ossMatch[1].toUpperCase()}`;
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

    const billingContainer = document.getElementById('service-billing-list');
    if (billingContainer) {
      billingContainer.innerHTML = '<div class="no-data">잔액 정보 없음</div>';
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
