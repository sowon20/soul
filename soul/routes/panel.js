/**
 * panel.js
 * 패널 시스템 API 라우트
 *
 * 기능:
 * - 패널 관리 (열기/닫기/토글)
 * - 모드/레이아웃 변경
 * - 자연어 명령 처리
 */

const express = require('express');
const router = express.Router();
const {
  getPanelManager,
  PANEL_TYPES,
  PANEL_MODES,
  LAYOUT_TYPES
} = require('../utils/panel-manager');

/**
 * GET /api/panel/state
 * 현재 패널 상태 가져오기
 */
router.get('/state', (req, res) => {
  try {
    const manager = getPanelManager();
    const state = manager.getState();

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error getting panel state:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/register
 * 패널 등록
 */
router.post('/register', (req, res) => {
  try {
    const { panelId, type, title, metadata } = req.body;

    if (!panelId || !type || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: panelId, type, title'
      });
    }

    const manager = getPanelManager();
    const panel = manager.registerPanel(panelId, type, title, metadata);

    res.json({
      success: true,
      panel
    });
  } catch (error) {
    console.error('Error registering panel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/panel/:panelId
 * 패널 제거
 */
router.delete('/:panelId', (req, res) => {
  try {
    const { panelId } = req.params;
    const manager = getPanelManager();
    const result = manager.removePanel(panelId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error removing panel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/:panelId/open
 * 패널 열기
 */
router.post('/:panelId/open', (req, res) => {
  try {
    const { panelId } = req.params;
    const { mode } = req.body;

    const manager = getPanelManager();
    const state = manager.openPanel(panelId, mode);

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error opening panel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/:panelId/close
 * 패널 닫기
 */
router.post('/:panelId/close', (req, res) => {
  try {
    const { panelId } = req.params;
    const manager = getPanelManager();
    const state = manager.closePanel(panelId);

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error closing panel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/:panelId/toggle
 * 패널 토글
 */
router.post('/:panelId/toggle', (req, res) => {
  try {
    const { panelId } = req.params;
    const { mode } = req.body;

    const manager = getPanelManager();
    const state = manager.togglePanel(panelId, mode);

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error toggling panel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/mode
 * 모드 변경
 */
router.post('/mode', (req, res) => {
  try {
    const { mode } = req.body;

    if (!mode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: mode'
      });
    }

    const manager = getPanelManager();
    const state = manager.setMode(mode);

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error setting mode:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/layout
 * 레이아웃 변경
 */
router.post('/layout', (req, res) => {
  try {
    const { layout } = req.body;

    if (!layout) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: layout'
      });
    }

    const manager = getPanelManager();
    const state = manager.setLayout(layout);

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error setting layout:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/back
 * 뒤로 가기
 */
router.post('/back', (req, res) => {
  try {
    const manager = getPanelManager();
    const result = manager.goBack();

    res.json(result);
  } catch (error) {
    console.error('Error going back:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/close-all
 * 모든 패널 닫기
 */
router.post('/close-all', (req, res) => {
  try {
    const manager = getPanelManager();
    const state = manager.closeAll();

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error closing all panels:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/reset
 * 패널 시스템 리셋
 */
router.post('/reset', (req, res) => {
  try {
    const manager = getPanelManager();
    const state = manager.reset();

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error resetting panel system:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/panel/types
 * 패널 타입 목록
 */
router.get('/types', (req, res) => {
  res.json({
    success: true,
    types: PANEL_TYPES
  });
});

/**
 * GET /api/panel/modes
 * 패널 모드 목록
 */
router.get('/modes', (req, res) => {
  res.json({
    success: true,
    modes: PANEL_MODES
  });
});

/**
 * GET /api/panel/layouts
 * 레이아웃 타입 목록
 */
router.get('/layouts', (req, res) => {
  res.json({
    success: true,
    layouts: LAYOUT_TYPES
  });
});

/**
 * POST /api/panel/find
 * 패널 검색
 */
router.post('/find', (req, res) => {
  try {
    const criteria = req.body;

    const manager = getPanelManager();
    const panel = manager.findPanel(criteria);

    if (!panel) {
      return res.status(404).json({
        success: false,
        error: 'Panel not found'
      });
    }

    res.json({
      success: true,
      panel
    });
  } catch (error) {
    console.error('Error finding panel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/panel/natural-command
 * 자연어 명령 처리
 *
 * 예시:
 * - "투두 보여줘" → TODO 패널 열기
 * - "투두랑 터미널 같이" → TODO + 터미널 분할
 * - "탭으로 바꿔" → 탭 모드 전환
 * - "닫아" → 현재 패널 닫기
 */
router.post('/natural-command', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: message'
      });
    }

    // NLP 도구로 의도 감지
    const intentDetector = require('../utils/intent-detector');
    const intent = intentDetector.detectIntent(message, {});

    const manager = getPanelManager();
    let result = null;

    // 패널 관련 의도 처리
    if (intent.intent === 'panel_open') {
      // 패널 타입 추출
      const panelType = extractPanelType(message);

      if (!panelType) {
        return res.status(400).json({
          success: false,
          error: 'Could not determine panel type from message'
        });
      }

      // 분할 모드 감지
      const isSplit = /같이|분할|split/.test(message);
      const mode = isSplit ? PANEL_MODES.SPLIT : PANEL_MODES.TAB;

      // 패널 찾기 또는 생성
      let panel = manager.findPanel({ type: panelType });
      if (!panel) {
        const panelTitle = getPanelTitle(panelType);
        panel = manager.registerPanel(
          `${panelType}-${Date.now()}`,
          panelType,
          panelTitle
        );
      }

      result = manager.openPanel(panel.id, mode);

      // 여러 패널 열기 (예: "투두랑 터미널 같이")
      const additionalType = extractAdditionalPanelType(message);
      if (additionalType && isSplit) {
        let additionalPanel = manager.findPanel({ type: additionalType });
        if (!additionalPanel) {
          const panelTitle = getPanelTitle(additionalType);
          additionalPanel = manager.registerPanel(
            `${additionalType}-${Date.now()}`,
            additionalType,
            panelTitle
          );
        }
        result = manager.openPanel(additionalPanel.id, PANEL_MODES.SPLIT);
      }

    } else if (intent.intent === 'panel_close') {
      // 패널 닫기
      if (manager.activePanel) {
        result = manager.closePanel(manager.activePanel);
      } else {
        return res.status(400).json({
          success: false,
          error: 'No active panel to close'
        });
      }

    } else if (intent.intent === 'panel_toggle') {
      // 패널 토글
      const panelType = extractPanelType(message);
      if (!panelType) {
        return res.status(400).json({
          success: false,
          error: 'Could not determine panel type from message'
        });
      }

      let panel = manager.findPanel({ type: panelType });
      if (!panel) {
        const panelTitle = getPanelTitle(panelType);
        panel = manager.registerPanel(
          `${panelType}-${Date.now()}`,
          panelType,
          panelTitle
        );
      }

      result = manager.togglePanel(panel.id);

    } else if (intent.intent === 'setting_change') {
      // 모드/레이아웃 변경
      if (/탭/.test(message)) {
        result = manager.setMode(PANEL_MODES.TAB);
      } else if (/분할|split/.test(message)) {
        result = manager.setMode(PANEL_MODES.SPLIT);
      } else if (/팝업|popup/.test(message)) {
        result = manager.setMode(PANEL_MODES.POPUP);
      } else if (/가로/.test(message)) {
        result = manager.setLayout(LAYOUT_TYPES.HORIZONTAL);
      } else if (/세로/.test(message)) {
        result = manager.setLayout(LAYOUT_TYPES.VERTICAL);
      } else if (/그리드|grid/.test(message)) {
        result = manager.setLayout(LAYOUT_TYPES.GRID);
      }
    }

    if (!result) {
      return res.status(400).json({
        success: false,
        error: 'Could not process natural command',
        intent
      });
    }

    res.json({
      success: true,
      intent,
      state: result
    });
  } catch (error) {
    console.error('Error processing natural command:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 헬퍼: 메시지에서 패널 타입 추출
 */
function extractPanelType(message) {
  const msg = message.toLowerCase();

  if (/투두|todo/.test(msg)) return PANEL_TYPES.TODO;
  if (/터미널|terminal/.test(msg)) return PANEL_TYPES.TERMINAL;
  if (/메모리|memory/.test(msg)) return PANEL_TYPES.MEMORY;
  if (/검색|search/.test(msg)) return PANEL_TYPES.SEARCH;
  if (/파일|file/.test(msg)) return PANEL_TYPES.FILES;
  if (/mcp/.test(msg)) return PANEL_TYPES.MCP;
  if (/아카이브|archive/.test(msg)) return PANEL_TYPES.ARCHIVE;
  if (/설정|setting/.test(msg)) return PANEL_TYPES.SETTINGS;
  if (/알림|notification/.test(msg)) return PANEL_TYPES.NOTIFICATIONS;
  if (/컨텍스트|context/.test(msg)) return PANEL_TYPES.CONTEXT;

  return null;
}

/**
 * 헬퍼: 추가 패널 타입 추출 (분할 모드용)
 */
function extractAdditionalPanelType(message) {
  const msg = message.toLowerCase();

  // "투두랑 터미널" 패턴
  const match = msg.match(/(투두|터미널|메모리|검색|파일|mcp|아카이브|설정|알림|컨텍스트).*(투두|터미널|메모리|검색|파일|mcp|아카이브|설정|알림|컨텍스트)/);

  if (!match) return null;

  const first = extractPanelType(match[1]);
  const second = extractPanelType(match[2]);

  // 첫 번째와 다른 타입 반환
  return second !== first ? second : null;
}

/**
 * 헬퍼: 패널 타입에서 제목 가져오기
 */
function getPanelTitle(type) {
  const titles = {
    [PANEL_TYPES.TODO]: 'TODO',
    [PANEL_TYPES.TERMINAL]: '터미널',
    [PANEL_TYPES.MEMORY]: '메모리 탐색',
    [PANEL_TYPES.SEARCH]: '통합 검색',
    [PANEL_TYPES.FILES]: '파일 매니저',
    [PANEL_TYPES.MCP]: 'MCP 관리',
    [PANEL_TYPES.ARCHIVE]: '대화 아카이브',
    [PANEL_TYPES.SETTINGS]: '설정',
    [PANEL_TYPES.NOTIFICATIONS]: '알림 센터',
    [PANEL_TYPES.CONTEXT]: '컨텍스트 관리'
  };

  return titles[type] || type;
}

module.exports = router;
