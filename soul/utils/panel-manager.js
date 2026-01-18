/**
 * panel-manager.js
 * 패널 시스템 관리 유틸리티
 *
 * 기능:
 * - 탭/분할/팝업 모드 관리
 * - 패널 상태 관리
 * - 자연어 명령 처리
 * - 레이아웃 관리
 */

/**
 * 패널 타입
 */
const PANEL_TYPES = {
  MEMORY: 'memory',          // 메모리 탐색
  SEARCH: 'search',          // 통합 검색
  FILES: 'files',            // 파일 매니저
  MCP: 'mcp',                // MCP 관리
  ARCHIVE: 'archive',        // 대화 아카이브
  SETTINGS: 'settings',      // 설정
  NOTIFICATIONS: 'notifications', // 알림 센터
  CONTEXT: 'context',        // 컨텍스트 관리
  TODO: 'todo',              // TODO 패널
  TERMINAL: 'terminal'       // 터미널
};

/**
 * 패널 모드
 */
const PANEL_MODES = {
  TAB: 'tab',                // 탭 모드 (전환)
  SPLIT: 'split',            // 분할 모드 (병렬)
  POPUP: 'popup',            // 팝업 모드 (오버레이)
  HIDDEN: 'hidden'           // 숨김
};

/**
 * 레이아웃 타입
 */
const LAYOUT_TYPES = {
  SINGLE: 'single',          // 단일 패널
  HORIZONTAL: 'horizontal',  // 가로 분할
  VERTICAL: 'vertical',      // 세로 분할
  GRID: 'grid'               // 그리드 레이아웃 (최대 4개)
};

/**
 * PanelManager 클래스
 */
class PanelManager {
  constructor() {
    this.panels = new Map(); // panelId -> panelState
    this.activePanel = null;
    this.mode = PANEL_MODES.TAB;
    this.layout = LAYOUT_TYPES.SINGLE;
    this.history = []; // 패널 히스토리 (뒤로가기용)
  }

  /**
   * 패널 등록
   */
  registerPanel(panelId, type, title, metadata = {}) {
    const panel = {
      id: panelId,
      type,
      title,
      isActive: false,
      isVisible: false,
      position: null, // { x, y, width, height } for popup
      size: 1, // 분할 모드에서 상대적 크기
      order: this.panels.size, // 순서
      metadata,
      createdAt: new Date(),
      lastAccessedAt: null
    };

    this.panels.set(panelId, panel);
    return panel;
  }

  /**
   * 패널 제거
   */
  removePanel(panelId) {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }

    this.panels.delete(panelId);

    // 활성 패널이었다면 다른 패널로 전환
    if (this.activePanel === panelId) {
      const remaining = Array.from(this.panels.values())
        .filter(p => p.isVisible)
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

      this.activePanel = remaining[0]?.id || null;
    }

    return { success: true, panelId };
  }

  /**
   * 패널 열기
   */
  openPanel(panelId, mode = null) {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }

    const targetMode = mode || this.mode;

    // 모드에 따라 처리
    switch (targetMode) {
      case PANEL_MODES.TAB:
        // 탭 모드: 기존 패널 숨기고 새 패널 활성화
        this.panels.forEach(p => {
          p.isActive = false;
          if (p.id !== panelId) {
            p.isVisible = false;
          }
        });
        panel.isActive = true;
        panel.isVisible = true;
        this.activePanel = panelId;
        break;

      case PANEL_MODES.SPLIT:
        // 분할 모드: 여러 패널 동시 표시
        panel.isVisible = true;
        this.activePanel = panelId;
        this._recalculateLayout();
        break;

      case PANEL_MODES.POPUP:
        // 팝업 모드: 오버레이
        panel.isVisible = true;
        panel.position = this._calculatePopupPosition(panel);
        break;

      case PANEL_MODES.HIDDEN:
        // 숨김
        panel.isVisible = false;
        break;
    }

    panel.lastAccessedAt = new Date();

    // 히스토리 추가
    this.history.push({
      action: 'open',
      panelId,
      mode: targetMode,
      timestamp: new Date()
    });

    return this.getState();
  }

  /**
   * 패널 닫기
   */
  closePanel(panelId) {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }

    panel.isActive = false;
    panel.isVisible = false;

    // 활성 패널이었다면 다른 패널로 전환
    if (this.activePanel === panelId) {
      const visible = Array.from(this.panels.values())
        .filter(p => p.isVisible)
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

      this.activePanel = visible[0]?.id || null;
    }

    this._recalculateLayout();

    // 히스토리 추가
    this.history.push({
      action: 'close',
      panelId,
      timestamp: new Date()
    });

    return this.getState();
  }

  /**
   * 패널 토글
   */
  togglePanel(panelId, mode = null) {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }

    if (panel.isVisible) {
      return this.closePanel(panelId);
    } else {
      return this.openPanel(panelId, mode);
    }
  }

  /**
   * 모드 변경
   */
  setMode(mode) {
    if (!Object.values(PANEL_MODES).includes(mode)) {
      throw new Error(`Invalid panel mode: ${mode}`);
    }

    const previousMode = this.mode;
    this.mode = mode;

    // 모드 변경에 따라 레이아웃 재계산
    if (mode === PANEL_MODES.TAB) {
      // 탭 모드: 활성 패널만 표시
      this.panels.forEach(p => {
        if (p.id !== this.activePanel) {
          p.isVisible = false;
        }
      });
    }

    this._recalculateLayout();

    // 히스토리 추가
    this.history.push({
      action: 'setMode',
      from: previousMode,
      to: mode,
      timestamp: new Date()
    });

    return this.getState();
  }

  /**
   * 레이아웃 변경
   */
  setLayout(layout) {
    if (!Object.values(LAYOUT_TYPES).includes(layout)) {
      throw new Error(`Invalid layout type: ${layout}`);
    }

    this.layout = layout;
    this._recalculateLayout();

    return this.getState();
  }

  /**
   * 레이아웃 재계산
   */
  _recalculateLayout() {
    const visiblePanels = Array.from(this.panels.values())
      .filter(p => p.isVisible)
      .sort((a, b) => a.order - b.order);

    const count = visiblePanels.length;

    if (count === 0) {
      return;
    }

    if (this.mode === PANEL_MODES.TAB || count === 1) {
      // 탭 모드 또는 단일 패널
      this.layout = LAYOUT_TYPES.SINGLE;
      return;
    }

    if (this.mode === PANEL_MODES.SPLIT) {
      // 분할 모드
      if (count === 2) {
        // 2개: 가로 또는 세로 분할 (기본 가로)
        this.layout = this.layout === LAYOUT_TYPES.VERTICAL
          ? LAYOUT_TYPES.VERTICAL
          : LAYOUT_TYPES.HORIZONTAL;
      } else if (count <= 4) {
        // 3-4개: 그리드
        this.layout = LAYOUT_TYPES.GRID;
      } else {
        // 5개 이상: 탭 모드로 전환 권장
        console.warn('Too many panels for split mode. Consider using tab mode.');
      }
    }
  }

  /**
   * 팝업 위치 계산
   */
  _calculatePopupPosition(panel) {
    // 기본 팝업 위치 (중앙)
    return {
      x: '50%',
      y: '50%',
      width: 600,
      height: 400,
      transform: 'translate(-50%, -50%)'
    };
  }

  /**
   * 뒤로 가기
   */
  goBack() {
    if (this.history.length < 2) {
      return { success: false, message: 'No history' };
    }

    // 현재 상태 제거
    this.history.pop();

    // 이전 상태 가져오기
    const previous = this.history[this.history.length - 1];

    // 이전 상태 복원
    if (previous.action === 'open') {
      this.openPanel(previous.panelId, previous.mode);
    } else if (previous.action === 'close') {
      this.closePanel(previous.panelId);
    } else if (previous.action === 'setMode') {
      this.setMode(previous.from);
    }

    return this.getState();
  }

  /**
   * 현재 상태 가져오기
   */
  getState() {
    const visiblePanels = Array.from(this.panels.values())
      .filter(p => p.isVisible)
      .sort((a, b) => a.order - b.order);

    return {
      panels: Array.from(this.panels.values()),
      visiblePanels,
      activePanel: this.activePanel,
      mode: this.mode,
      layout: this.layout,
      hasHistory: this.history.length > 1
    };
  }

  /**
   * 패널 검색
   */
  findPanel(criteria) {
    return Array.from(this.panels.values()).find(panel => {
      if (criteria.id && panel.id !== criteria.id) return false;
      if (criteria.type && panel.type !== criteria.type) return false;
      if (criteria.title && !panel.title.includes(criteria.title)) return false;
      return true;
    });
  }

  /**
   * 모든 패널 닫기
   */
  closeAll() {
    this.panels.forEach(p => {
      p.isActive = false;
      p.isVisible = false;
    });

    this.activePanel = null;

    return this.getState();
  }

  /**
   * 리셋
   */
  reset() {
    this.panels.clear();
    this.activePanel = null;
    this.mode = PANEL_MODES.TAB;
    this.layout = LAYOUT_TYPES.SINGLE;
    this.history = [];

    return this.getState();
  }
}

/**
 * 전역 인스턴스
 */
let globalPanelManager = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getPanelManager() {
  if (!globalPanelManager) {
    globalPanelManager = new PanelManager();
  }
  return globalPanelManager;
}

module.exports = {
  PanelManager,
  getPanelManager,
  PANEL_TYPES,
  PANEL_MODES,
  LAYOUT_TYPES
};
