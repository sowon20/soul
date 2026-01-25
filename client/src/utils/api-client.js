/**
 * API Client
 * 백엔드 API 통신 관리
 */

export class APIClient {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
    console.log(`🔧 APIClient initialized with baseURL: ${this.baseURL}`);
    console.log(`🔧 window.location.origin: ${window.location.origin}`);
    console.log(`🔧 window.location.href: ${window.location.href}`);
  }

  /**
   * HTTP 요청 헬퍼
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    console.log(`🌐 API Request - endpoint: ${endpoint}`);
    console.log(`🌐 API Request - this.baseURL: ${this.baseURL}`);
    console.log(`🌐 API Request - constructed url: ${url}`);
    console.log(`🌐 API Request - window.location.origin: ${window.location.origin}`);
    console.log(`🌐 Full URL will be: ${new URL(url, window.location.origin).href}`);

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // 타임아웃 설정 (채팅은 60초, 나머지는 15초)
    const timeout = endpoint.includes('/chat') ? 60000 : 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    config.signal = controller.signal;

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.warn(`API 요청 타임아웃 [${endpoint}]`);
        throw new Error('Request timeout');
      }
      console.error(`API 요청 실패 [${endpoint}]:`, error);
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /* ===================================
     Chat APIs
     =================================== */

  /**
   * 메시지 전송
   */
  async sendMessage(message, options = {}) {
    return this.post('/chat', {
      message,
      sessionId: 'main-conversation',
      options: {
        maxTokens: 4096,
        temperature: 1.0,
        ...options,
      },
    });
  }

  /**
   * 대화 히스토리 조회
   * @param {string} conversationId - 대화 ID
   * @param {Object} options - { limit, before, after }
   */
  async getConversationHistory(conversationId = 'main-conversation', options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.before) params.append('before', options.before);
    if (options.after) params.append('after', options.after);

    const query = params.toString() ? `?${params}` : '';
    return this.get(`/chat/history/${conversationId}${query}`);
  }

  /**
   * 세션 재개
   */
  async resumeSession(sessionId) {
    return this.post('/chat/resume', { sessionId });
  }

  /**
   * 세션 종료
   */
  async endSession(sessionId) {
    return this.post('/chat/end', { sessionId });
  }

  /**
   * 메모리 통계 조회
   */
  async getMemoryStats() {
    return this.get('/chat/memory-stats');
  }

  /**
   * 토큰 상태 조회
   */
  async getTokenStatus() {
    return this.get('/chat/token-status');
  }

  /* ===================================
     Profile APIs
     =================================== */

  /**
   * 사용자 프로필 조회
   */
  async getUserProfile(userId) {
    return this.get(`/profile/user/${userId}`);
  }

  /**
   * 사용자 프로필 업데이트
   */
  async updateUserProfile(userId, data) {
    return this.patch(`/profile/user/${userId}`, data);
  }

  /**
   * 테마 설정 조회
   */
  async getThemeSettings(userId) {
    return this.get(`/profile/user/${userId}/theme`);
  }

  /**
   * 테마 설정 업데이트
   */
  async updateThemeSettings(userId, settings) {
    return this.patch(`/profile/user/${userId}/theme`, settings);
  }

  /* ===================================
     Notification APIs
     =================================== */

  /**
   * 알림 목록 조회
   */
  async getNotifications(options = {}) {
    const params = new URLSearchParams();
    if (options.unreadOnly) params.append('unreadOnly', 'true');
    if (options.limit) params.append('limit', options.limit);

    const query = params.toString() ? `?${params}` : '';
    return this.get(`/notifications${query}`);
  }

  /**
   * 알림 읽음 처리
   */
  async markNotificationAsRead(notificationId) {
    return this.post(`/notifications/${notificationId}/read`);
  }

  /**
   * 모든 알림 읽음 처리
   */
  async markAllNotificationsAsRead() {
    return this.post('/notifications/mark-all-read');
  }

  /* ===================================
     Panel APIs
     =================================== */

  /**
   * 패널 상태 조회
   */
  async getPanelState() {
    return this.get('/panel/state');
  }

  /**
   * 패널 열기
   */
  async openPanel(panelId, options = {}) {
    return this.post(`/panel/${panelId}/open`, options);
  }

  /**
   * 패널 닫기
   */
  async closePanel(panelId) {
    return this.post(`/panel/${panelId}/close`);
  }

  /* ===================================
     Search APIs
     =================================== */

  /**
   * 기본 검색
   */
  async search(query, options = {}) {
    const params = new URLSearchParams({ q: query, ...options });
    return this.get(`/search?${params}`);
  }

  /**
   * 스마트 검색 (자연어)
   */
  async smartSearch(query, options = {}) {
    return this.post('/search/smart', { query, ...options });
  }

  /**
   * 태그 목록 조회
   */
  async getTags() {
    return this.get('/search/tags');
  }

  /* ===================================
     Memory APIs
     =================================== */

  /**
   * 메모리 아카이브
   */
  async archiveConversation(conversationId, options = {}) {
    return this.post('/memory/archive', { conversationId, ...options });
  }

  /**
   * 메모리 목록 조회
   */
  async getMemories(options = {}) {
    const params = new URLSearchParams(options);
    return this.get(`/memory/list?${params}`);
  }

  /**
   * 메모리 상세 조회
   */
  async getMemoryById(memoryId) {
    return this.get(`/memory/${memoryId}`);
  }

  /**
   * 관계 그래프 조회
   */
  async getRelationshipGraph() {
    return this.get('/memory-advanced/relationship-graph');
  }

  /**
   * 타임라인 뷰 조회
   */
  async getTimeline(options = {}) {
    const params = new URLSearchParams(options);
    return this.get(`/memory-advanced/timeline?${params}`);
  }

  /* ===================================
     MCP APIs
     =================================== */

  /**
   * MCP 도구 목록 조회
   */
  async getMCPTools() {
    // TODO: MCP API 엔드포인트 확인 필요
    return this.get('/mcp/tools');
  }

  /**
   * MCP 도구 실행
   */
  async executeMCPTool(toolName, params = {}) {
    return this.post('/mcp/execute', { toolName, params });
  }
}
