/**
 * AI Service Manager
 * AI 서비스 설정 관리
 */

import { APIClient } from './api-client.js';

export class AIServiceManager {
  constructor() {
    this.apiClient = new APIClient();
    this.services = [];
  }

  /**
   * 초기화
   */
  async init() {
    await this.loadServices();
    this.render();
    this.attachEventListeners();
  }

  /**
   * AI 서비스 목록 로드
   */
  async loadServices() {
    try {
      const response = await fetch('/api/ai-services');
      const data = await response.json();

      if (data.success) {
        this.services = data.services;
      } else {
        throw new Error(data.error || 'Failed to load services');
      }
    } catch (error) {
      console.error('Failed to load AI services:', error);
      alert('AI 서비스 목록을 불러오는데 실패했습니다: ' + error.message);
    }
  }

  /**
   * 화면 렌더링
   */
  render() {
    const container = document.getElementById('aiServiceList');
    if (!container) return;

    container.innerHTML = `
      <table class="service-table">
        <thead>
          <tr>
            <th>서비스</th>
            <th>타입</th>
            <th>상태</th>
            <th>API 키</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${this.services.map(service => this.renderServiceRow(service)).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * 서비스 행 렌더링
   */
  renderServiceRow(service) {
    const statusBadge = service.isActive
      ? '<span class="badge badge-success">활성</span>'
      : '<span class="badge badge-inactive">비활성</span>';

    const keyStatus = service.hasApiKey
      ? '<span class="badge badge-success">✓ 설정됨</span>'
      : '<span class="badge badge-warning">✗ 미설정</span>';

    return `
      <tr data-service-id="${service.id}">
        <td><strong>${service.name}</strong></td>
        <td>${service.type}</td>
        <td>${statusBadge}</td>
        <td>${keyStatus}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="window.aiServiceManager.editApiKey('${service.id}', '${service.name}')">
            ${service.hasApiKey ? 'API 키 변경' : 'API 키 설정'}
          </button>
          <button class="btn btn-sm ${service.isActive ? 'btn-warning' : 'btn-success'}"
                  onclick="window.aiServiceManager.toggleActive('${service.id}')">
            ${service.isActive ? '비활성화' : '활성화'}
          </button>
          ${service.hasApiKey ? `
            <button class="btn btn-sm btn-secondary" onclick="window.aiServiceManager.testConnection('${service.id}')">
              연결 테스트
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }

  /**
   * API 키 편집 모달 표시
   */
  async editApiKey(serviceId, serviceName) {
    const apiKey = prompt(`${serviceName} API 키를 입력하세요:\n\n(비워두면 키가 삭제됩니다)`);

    if (apiKey === null) return; // 취소

    try {
      const response = await fetch(`/api/ai-services/${serviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey || null })
      });

      const data = await response.json();

      if (data.success) {
        alert('API 키가 저장되었습니다.');
        await this.loadServices();
        this.render();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to update API key:', error);
      alert('API 키 저장 실패: ' + error.message);
    }
  }

  /**
   * 서비스 활성화/비활성화
   */
  async toggleActive(serviceId) {
    try {
      const response = await fetch(`/api/ai-services/${serviceId}/toggle`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        await this.loadServices();
        this.render();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to toggle service:', error);
      alert('상태 변경 실패: ' + error.message);
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection(serviceId) {
    const service = this.services.find(s => s.id === serviceId);
    if (!service) return;

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '테스트 중...';

    try {
      const response = await fetch(`/api/ai-services/${serviceId}/test`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        alert(`✓ 연결 성공!\n\n${data.message}`);
      } else {
        alert(`✗ 연결 실패\n\n${data.message || data.error}`);
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
      alert('연결 테스트 실패: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '연결 테스트';
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners() {
    // 필요한 경우 추가
  }
}

// 전역으로 노출 (인라인 onclick에서 사용)
window.aiServiceManager = null;
