/**
 * Search Manager
 * 메모리 및 대화 통합 검색 관리
 */

export class SearchManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.searchInput = null;
    this.resultsContainer = null;
    this.debounceTimer = null;
    this.debounceDelay = 300;
    this.isSearching = false;
    this.lastSearchResults = [];
  }

  /**
   * 검색 매니저 초기화
   */
  init() {
    this.searchInput = document.querySelector('.search-input');

    if (!this.searchInput) {
      console.warn('검색 입력창을 찾을 수 없습니다.');
      return;
    }

    // 검색 결과 드롭다운 생성
    this.createResultsDropdown();

    // 이벤트 리스너 등록
    this.setupEventListeners();

    console.log('✅ SearchManager 초기화 완료');
  }

  /**
   * 검색 결과 드롭다운 컨테이너 생성
   */
  createResultsDropdown() {
    const searchBox = this.searchInput.closest('.search-box');
    if (!searchBox) return;

    // 기존 드롭다운이 있으면 제거
    const existing = searchBox.querySelector('.search-results-dropdown');
    if (existing) existing.remove();

    // 드롭다운 생성
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.className = 'search-results-dropdown';
    this.resultsContainer.style.display = 'none';

    searchBox.appendChild(this.resultsContainer);
  }

  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    // 입력 이벤트 (디바운스)
    this.searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();

      clearTimeout(this.debounceTimer);

      if (!query) {
        this.hideResults();
        return;
      }

      this.debounceTimer = setTimeout(() => {
        this.search(query);
      }, this.debounceDelay);
    });

    // Enter 키로 즉시 검색
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = this.searchInput.value.trim();
        if (query) {
          clearTimeout(this.debounceTimer);
          this.search(query);
        }
      } else if (e.key === 'Escape') {
        this.hideResults();
        this.searchInput.blur();
      }
    });

    // 포커스 잃으면 드롭다운 숨김 (딜레이로 클릭 허용)
    this.searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        this.hideResults();
      }, 200);
    });

    // 포커스 시 기존 결과 표시
    this.searchInput.addEventListener('focus', () => {
      const query = this.searchInput.value.trim();
      if (query && this.resultsContainer.children.length > 0) {
        this.showResults();
      }
    });
  }

  /**
   * 검색 실행
   */
  async search(query) {
    if (this.isSearching || !query) return;

    this.isSearching = true;
    this.showLoading();

    try {
      // Smart Search API 호출
      const response = await this.apiClient.smartSearch(query, {
        limit: 10,
        includeMemory: true
      });

      if (response && response.results) {
        this.renderResults(response.results, query);
      } else {
        this.renderNoResults(query);
      }
    } catch (error) {
      console.error('검색 실패:', error);
      this.renderError(error.message);
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * 로딩 상태 표시
   */
  showLoading() {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <div class="search-loading">
        <div class="search-loading-spinner"></div>
        <span>검색 중...</span>
      </div>
    `;
    this.showResults();
  }

  /**
   * 검색 결과 렌더링
   */
  renderResults(results, query) {
    if (!this.resultsContainer) return;

    if (!results || results.length === 0) {
      this.renderNoResults(query);
      return;
    }

    // 결과 저장 (클릭 시 사용)
    this.lastSearchResults = results;

    const html = results.map(result => this.renderResultItem(result, query)).join('');

    this.resultsContainer.innerHTML = `
      <div class="search-results-header">
        <span class="search-results-count">${results.length}개의 결과</span>
      </div>
      <div class="search-results-list">
        ${html}
      </div>
    `;

    // 결과 항목 클릭 이벤트
    this.resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const type = item.dataset.type;
        this.handleResultClick(id, type);
      });
    });

    this.showResults();
  }

  /**
   * 개별 검색 결과 항목 렌더링
   */
  renderResultItem(result, query) {
    // 백엔드 응답 구조에 맞게 처리
    // topics 배열의 첫 번째 항목을 제목으로, 나머지를 미리보기로 사용
    const topics = result.topics || [];
    const title = this.highlightText(topics[0] || result.category || '제목 없음', query);
    const previewTopics = topics.slice(1).join(', ');
    const preview = this.highlightText(this.truncateText(previewTopics || result.category || '', 100), query);
    const date = result.date ? this.formatDate(result.date) : '';
    const tags = result.tags || [];
    const type = 'memory'; // 현재는 메모리 검색만 지원
    const typeLabel = '메모리';
    const typeClass = 'memory';

    return `
      <div class="search-result-item" data-id="${result.id}" data-type="${type}">
        <div class="search-result-header">
          <span class="search-result-type ${typeClass}">${typeLabel}</span>
          <span class="search-result-date">${date}</span>
        </div>
        <div class="search-result-title">${title}</div>
        ${preview ? `<div class="search-result-preview">${preview}</div>` : ''}
        ${tags.length > 0 ? `
          <div class="search-result-tags">
            ${tags.slice(0, 3).map(tag => `<span class="search-tag">${tag}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 검색어 하이라이트
   */
  highlightText(text, query) {
    if (!query || !text) return text;

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  /**
   * 텍스트 자르기
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 날짜 포맷
   */
  formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) return '오늘';
      if (days === 1) return '어제';
      if (days < 7) return `${days}일 전`;

      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * 결과 없음 표시
   */
  renderNoResults(query) {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <div class="search-no-results">
        <svg class="search-no-results-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <p>"${query}"에 대한 검색 결과가 없습니다.</p>
      </div>
    `;
    this.showResults();
  }

  /**
   * 에러 표시
   */
  renderError(message) {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <div class="search-error">
        <svg class="search-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>검색 중 오류가 발생했습니다.</p>
        <span class="search-error-detail">${message}</span>
      </div>
    `;
    this.showResults();
  }

  /**
   * 결과 클릭 처리
   */
  async handleResultClick(id, type) {
    console.log(`검색 결과 클릭: ${type} - ${id}`);

    // 클릭한 결과 데이터 찾기
    const clickedItem = this.resultsContainer.querySelector(`[data-id="${id}"]`);
    const resultData = this.lastSearchResults?.find(r => r.id === id);

    this.hideResults();
    this.searchInput.value = '';

    if (type === 'memory' && resultData) {
      // 검색 결과 데이터로 Canvas에 표시
      this.showMemoryInCanvas(resultData);
    } else {
      console.log('대화 로드 기능은 추후 구현 예정');
    }
  }

  /**
   * 검색 결과를 Canvas 패널에 표시
   */
  showMemoryInCanvas(memory) {
    const canvasPanel = document.getElementById('canvasPanel');
    const canvasContent = canvasPanel?.querySelector('.canvas-content');
    const canvasHeader = canvasPanel?.querySelector('.canvas-header h3');

    if (!canvasPanel || !canvasContent) return;

    canvasPanel.classList.remove('hide');

    const title = memory.topics?.[0] || memory.category || '메모리';
    const topics = memory.topics || [];
    const tags = memory.tags || [];

    if (canvasHeader) {
      canvasHeader.textContent = title;
    }

    canvasContent.innerHTML = `
      <div class="memory-detail">
        <div class="memory-detail-meta">
          <span class="memory-detail-date">${this.formatDate(memory.date)}</span>
          ${tags.length > 0 ? `
            <div class="memory-detail-tags">
              ${tags.map(tag => `<span class="memory-tag">${tag}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        ${memory.category ? `
          <div style="margin-bottom: 12px;">
            <span style="font-size: 11px; color: rgba(255,255,255,0.5);">카테고리:</span>
            <span style="font-size: 13px; color: #a5b4fc;">${memory.category}</span>
          </div>
        ` : ''}
        ${topics.length > 0 ? `
          <div class="memory-detail-content">
            <h4 style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 8px;">주제</h4>
            <ul style="margin: 0; padding-left: 20px; color: #e8e8e8;">
              ${topics.map(topic => `<li style="margin-bottom: 4px;">${topic}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${memory.importance ? `
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span style="font-size: 11px; color: rgba(255,255,255,0.5);">중요도:</span>
            <span style="font-size: 13px; color: #fcd34d;">${'★'.repeat(memory.importance)}${'☆'.repeat(5 - memory.importance)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 결과 드롭다운 표시
   */
  showResults() {
    if (this.resultsContainer) {
      this.resultsContainer.style.display = 'block';
    }
  }

  /**
   * 결과 드롭다운 숨기기
   */
  hideResults() {
    if (this.resultsContainer) {
      this.resultsContainer.style.display = 'none';
    }
  }
}
