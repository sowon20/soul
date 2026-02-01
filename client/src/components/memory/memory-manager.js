/**
 * Memory Manager UI
 * 메모리 계층 탐색 및 관리
 */

export class MemoryManager {
  constructor(apiClient) {
    this.api = apiClient;
    this.currentTab = 'overview';
  }

  async render(container) {
    container.innerHTML = `
      <div class="memory-manager">
        <div class="memory-tabs">
          <button class="tab-btn active" data-tab="overview">개요</button>
          <button class="tab-btn" data-tab="short">단기</button>
          <button class="tab-btn" data-tab="middle">중기</button>
          <button class="tab-btn" data-tab="long">장기</button>
          <button class="tab-btn" data-tab="docs">문서</button>
        </div>
        <div class="memory-content" id="memoryContent">
          <div class="loading">로딩 중...</div>
        </div>
      </div>
    `;

    // 탭 이벤트
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTab = btn.dataset.tab;
        this.renderTab(container.querySelector('#memoryContent'));
      });
    });

    await this.renderTab(container.querySelector('#memoryContent'));
  }

  async renderTab(contentEl) {
    contentEl.innerHTML = '<div class="loading">로딩 중...</div>';
    
    try {
      switch (this.currentTab) {
        case 'overview':
          await this.renderOverview(contentEl);
          break;
        case 'short':
          await this.renderShortTerm(contentEl);
          break;
        case 'middle':
          await this.renderMiddleTerm(contentEl);
          break;
        case 'long':
          await this.renderLongTerm(contentEl);
          break;
        case 'docs':
          await this.renderDocuments(contentEl);
          break;
      }
    } catch (error) {
      contentEl.innerHTML = `<div class="error">오류: ${error.message}</div>`;
    }
  }

  async renderOverview(el) {
    const res = await this.api.get('/memory/stats');
    if (!res.success) throw new Error(res.error);
    
    const { shortTerm, middleTerm, longTerm, documents } = res.stats;
    
    el.innerHTML = `
      <div class="memory-overview">
        <div class="stat-card">
          <div class="stat-icon">💭</div>
          <div class="stat-info">
            <div class="stat-value">${shortTerm.count}</div>
            <div class="stat-label">단기 메시지</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-info">
            <div class="stat-value">${middleTerm.summaryCount}</div>
            <div class="stat-label">주간 요약</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🗄️</div>
          <div class="stat-info">
            <div class="stat-value">${longTerm.totalCount}</div>
            <div class="stat-label">아카이브</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📁</div>
          <div class="stat-info">
            <div class="stat-value">${documents.count}</div>
            <div class="stat-label">문서</div>
          </div>
        </div>
      </div>
      <div class="memory-desc">
        <h4>메모리 구조</h4>
        <ul>
          <li><strong>단기</strong>: 최근 대화 (일별 JSON, ${shortTerm.count}/50)</li>
          <li><strong>중기</strong>: AI 생성 주간 요약 (파일)</li>
          <li><strong>장기</strong>: 원본 대화 아카이브 (파일, 평생 보관)</li>
          <li><strong>문서</strong>: OCR/스캔 기록물 (파일)</li>
        </ul>
      </div>
    `;
  }

  async renderShortTerm(el) {
    const res = await this.api.get('/memory/short-term?limit=30');
    if (!res.success) throw new Error(res.error);
    
    if (!res.messages.length) {
      el.innerHTML = '<div class="empty">메시지가 없습니다.</div>';
      return;
    }
    
    el.innerHTML = `
      <div class="message-list">
        ${res.messages.map(m => `
          <div class="msg-item ${m.role}">
            <div class="msg-role">${m.role === 'user' ? '👤' : '🤖'}</div>
            <div class="msg-content">${this.truncate(m.content, 100)}</div>
            <div class="msg-time">${this.formatTime(m.timestamp)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async renderMiddleTerm(el) {
    const res = await this.api.get('/memory/weekly-summaries?limit=12');
    if (!res.success) throw new Error(res.error);
    
    if (!res.summaries.length) {
      el.innerHTML = '<div class="empty">주간 요약이 없습니다. 대화가 쌓이면 자동 생성됩니다.</div>';
      return;
    }
    
    el.innerHTML = `
      <div class="summary-list">
        ${res.summaries.map(s => `
          <div class="summary-item" data-path="${s.path}">
            <div class="summary-header">
              <span class="summary-period">${s.year}년 ${s.month}월 ${s.week}주차</span>
              <span class="summary-date">${this.formatDate(s.createdAt)}</span>
            </div>
            <div class="summary-preview">${this.truncate(s.summary || '요약 내용 없음', 150)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async renderLongTerm(el) {
    const res = await this.api.get('/memory/archives?limit=20');
    if (!res.success) throw new Error(res.error);
    
    el.innerHTML = `
      <div class="archive-search">
        <input type="text" id="archiveQuery" placeholder="검색어 (태그, 주제, 요약)">
        <button id="archiveSearchBtn">검색</button>
      </div>
      <div class="archive-list" id="archiveList">
        ${this.renderArchiveList(res.archives)}
      </div>
    `;
    
    el.querySelector('#archiveSearchBtn').addEventListener('click', async () => {
      const query = el.querySelector('#archiveQuery').value;
      const searchRes = await this.api.get(`/memory/archives?query=${encodeURIComponent(query)}&limit=20`);
      el.querySelector('#archiveList').innerHTML = this.renderArchiveList(searchRes.archives || []);
    });
  }

  renderArchiveList(archives) {
    if (!archives.length) {
      return '<div class="empty">아카이브가 없습니다.</div>';
    }
    
    return archives.map(a => `
      <div class="archive-item" data-id="${a.id}">
        <div class="archive-header">
          <span class="archive-date">${this.formatDate(a.archivedAt)}</span>
          <span class="archive-count">${a.messageCount || 0}개 메시지</span>
        </div>
        ${a.summary ? `<div class="archive-summary">${this.truncate(a.summary, 100)}</div>` : ''}
        ${a.tags?.length ? `<div class="archive-tags">${a.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
      </div>
    `).join('');
  }

  async renderDocuments(el) {
    const res = await this.api.get('/memory/documents?limit=20');
    if (!res.success) throw new Error(res.error);
    
    el.innerHTML = `
      <div class="doc-toolbar">
        <input type="text" id="docQuery" placeholder="문서 검색">
        <select id="docCategory">
          <option value="">전체 카테고리</option>
          ${(res.categories || []).map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="doc-list" id="docList">
        ${this.renderDocList(res.documents)}
      </div>
    `;
    
    const searchDocs = async () => {
      const query = el.querySelector('#docQuery').value;
      const category = el.querySelector('#docCategory').value;
      const searchRes = await this.api.get(`/memory/documents?query=${encodeURIComponent(query)}&category=${category}&limit=20`);
      el.querySelector('#docList').innerHTML = this.renderDocList(searchRes.documents || []);
    };
    
    el.querySelector('#docQuery').addEventListener('input', this.debounce(searchDocs, 300));
    el.querySelector('#docCategory').addEventListener('change', searchDocs);
  }

  renderDocList(docs) {
    if (!docs.length) {
      return '<div class="empty">문서가 없습니다.</div>';
    }
    
    return docs.map(d => `
      <div class="doc-item" data-id="${d.id}">
        <div class="doc-icon">📄</div>
        <div class="doc-info">
          <div class="doc-name">${d.filename}</div>
          <div class="doc-meta">
            <span class="doc-category">${d.category}</span>
            <span class="doc-size">${this.formatSize(d.size)}</span>
            <span class="doc-date">${this.formatDate(d.createdAt)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // 유틸
  truncate(text, len) {
    if (!text) return '';
    return text.length > len ? text.slice(0, len) + '...' : text;
  }
  
  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  
  formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }
  
  formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
  debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }
}
