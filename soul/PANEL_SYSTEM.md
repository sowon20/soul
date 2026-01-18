# 패널 시스템 (Panel System)

> Soul 프로젝트의 유연한 UI 패널 관리 시스템

**작성일**: 2026-01-18
**Phase**: Week 1 - 패널 시스템

---

## 📋 개요

패널 시스템은 Soul의 UI 구성 요소(메모리, 검색, 파일, MCP 등)를 유연하게 관리하는 시스템입니다.

### 핵심 기능
- **다중 모드**: 탭/분할/팝업 모드 지원
- **자연어 제어**: "투두 보여줘", "탭으로 바꿔" 등 자연어 명령
- **동적 레이아웃**: 1-4개 패널 자동 배치
- **세션 관리**: 패널 상태 저장 및 복원

---

## 🏗️ 아키텍처

### 구성 요소

```
soul/
├── utils/
│   └── panel-manager.js    # 패널 관리 유틸리티
└── routes/
    └── panel.js             # 패널 API 라우트
```

### 패널 타입

```javascript
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
```

### 패널 모드

```javascript
const PANEL_MODES = {
  TAB: 'tab',                // 탭 모드 (전환)
  SPLIT: 'split',            // 분할 모드 (병렬)
  POPUP: 'popup',            // 팝업 모드 (오버레이)
  HIDDEN: 'hidden'           // 숨김
};
```

### 레이아웃 타입

```javascript
const LAYOUT_TYPES = {
  SINGLE: 'single',          // 단일 패널
  HORIZONTAL: 'horizontal',  // 가로 분할
  VERTICAL: 'vertical',      // 세로 분할
  GRID: 'grid'               // 그리드 레이아웃 (최대 4개)
};
```

---

## 🔧 PanelManager 클래스

### 주요 메서드

#### `registerPanel(panelId, type, title, metadata)`
패널 등록

```javascript
const manager = getPanelManager();
const panel = manager.registerPanel(
  'todo-1',
  PANEL_TYPES.TODO,
  'TODO',
  { priority: 1 }
);
```

#### `openPanel(panelId, mode)`
패널 열기

```javascript
// 탭 모드로 열기
manager.openPanel('todo-1', PANEL_MODES.TAB);

// 분할 모드로 열기
manager.openPanel('terminal-1', PANEL_MODES.SPLIT);
```

#### `closePanel(panelId)`
패널 닫기

```javascript
manager.closePanel('todo-1');
```

#### `togglePanel(panelId, mode)`
패널 토글

```javascript
// 열려있으면 닫고, 닫혀있으면 열기
manager.togglePanel('todo-1');
```

#### `setMode(mode)`
모드 변경

```javascript
// 탭 모드로 전환
manager.setMode(PANEL_MODES.TAB);

// 분할 모드로 전환
manager.setMode(PANEL_MODES.SPLIT);
```

#### `setLayout(layout)`
레이아웃 변경

```javascript
// 가로 분할
manager.setLayout(LAYOUT_TYPES.HORIZONTAL);

// 세로 분할
manager.setLayout(LAYOUT_TYPES.VERTICAL);

// 그리드 레이아웃
manager.setLayout(LAYOUT_TYPES.GRID);
```

#### `getState()`
현재 상태 조회

```javascript
const state = manager.getState();
// {
//   panels: [...],
//   visiblePanels: [...],
//   activePanel: 'todo-1',
//   mode: 'tab',
//   layout: 'single',
//   hasHistory: false
// }
```

---

## 📡 API 엔드포인트

### 1. 패널 상태 조회
**GET** `/api/panel/state`

**Response**:
```json
{
  "success": true,
  "state": {
    "panels": [...],
    "visiblePanels": [...],
    "activePanel": "todo-1",
    "mode": "tab",
    "layout": "single",
    "hasHistory": false
  }
}
```

### 2. 패널 등록
**POST** `/api/panel/register`

**Request**:
```json
{
  "panelId": "todo-1",
  "type": "todo",
  "title": "TODO",
  "metadata": {
    "priority": 1
  }
}
```

**Response**:
```json
{
  "success": true,
  "panel": {
    "id": "todo-1",
    "type": "todo",
    "title": "TODO",
    "isActive": false,
    "isVisible": false,
    "order": 0
  }
}
```

### 3. 패널 열기
**POST** `/api/panel/:panelId/open`

**Request**:
```json
{
  "mode": "tab"
}
```

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 4. 패널 닫기
**POST** `/api/panel/:panelId/close`

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 5. 패널 토글
**POST** `/api/panel/:panelId/toggle`

**Request** (optional):
```json
{
  "mode": "split"
}
```

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 6. 모드 변경
**POST** `/api/panel/mode`

**Request**:
```json
{
  "mode": "split"
}
```

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 7. 레이아웃 변경
**POST** `/api/panel/layout`

**Request**:
```json
{
  "layout": "horizontal"
}
```

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 8. 뒤로 가기
**POST** `/api/panel/back`

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 9. 모든 패널 닫기
**POST** `/api/panel/close-all`

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 10. 패널 시스템 리셋
**POST** `/api/panel/reset`

**Response**:
```json
{
  "success": true,
  "state": { ... }
}
```

### 11. 패널 타입 목록
**GET** `/api/panel/types`

**Response**:
```json
{
  "success": true,
  "types": {
    "MEMORY": "memory",
    "SEARCH": "search",
    "FILES": "files",
    ...
  }
}
```

### 12. 패널 모드 목록
**GET** `/api/panel/modes`

**Response**:
```json
{
  "success": true,
  "modes": {
    "TAB": "tab",
    "SPLIT": "split",
    "POPUP": "popup",
    "HIDDEN": "hidden"
  }
}
```

### 13. 레이아웃 타입 목록
**GET** `/api/panel/layouts`

**Response**:
```json
{
  "success": true,
  "layouts": {
    "SINGLE": "single",
    "HORIZONTAL": "horizontal",
    "VERTICAL": "vertical",
    "GRID": "grid"
  }
}
```

### 14. 패널 검색
**POST** `/api/panel/find`

**Request**:
```json
{
  "type": "todo"
}
```

**Response**:
```json
{
  "success": true,
  "panel": {
    "id": "todo-1",
    "type": "todo",
    "title": "TODO",
    ...
  }
}
```

### 15. 자연어 명령 처리 ⭐
**POST** `/api/panel/natural-command`

**Request**:
```json
{
  "message": "투두 보여줘"
}
```

**Response**:
```json
{
  "success": true,
  "intent": {
    "intent": "panel_open",
    "confidence": 0.95,
    "entities": {
      "panelType": "todo"
    }
  },
  "state": { ... }
}
```

---

## 🗣️ 자연어 제어

### 지원되는 명령어

#### 패널 열기
- "투두 보여줘"
- "메모리 패널 열어"
- "터미널 띄워"
- "검색 창 열어줘"
- "todo show"
- "open memory panel"

#### 패널 닫기
- "닫아"
- "패널 닫아"
- "창 꺼줘"
- "close panel"
- "hide"

#### 패널 토글
- "투두 토글"
- "toggle terminal"

#### 다중 패널 열기 (분할 모드)
- "투두랑 터미널 같이" → TODO + 터미널 분할
- "메모리랑 검색 같이" → 메모리 + 검색 분할
- "todo with terminal"

#### 모드 전환
- "탭으로 바꿔" → 탭 모드
- "분할 모드" → 분할 모드
- "팝업으로" → 팝업 모드
- "split mode"
- "tab mode"

#### 레이아웃 변경
- "가로로" → 가로 분할
- "세로 분할" → 세로 분할
- "그리드로" → 그리드 레이아웃
- "horizontal"
- "vertical split"
- "grid layout"

---

## 💡 사용 예제

### 예제 1: 기본 패널 관리

```javascript
const { getPanelManager, PANEL_TYPES, PANEL_MODES } = require('./utils/panel-manager');

const manager = getPanelManager();

// 1. 패널 등록
const todoPanel = manager.registerPanel('todo-1', PANEL_TYPES.TODO, 'TODO');
const terminalPanel = manager.registerPanel('terminal-1', PANEL_TYPES.TERMINAL, '터미널');

// 2. 패널 열기 (탭 모드)
manager.openPanel('todo-1', PANEL_MODES.TAB);

// 3. 다른 패널 열기 (탭 전환)
manager.openPanel('terminal-1', PANEL_MODES.TAB);

// 4. 현재 상태 확인
const state = manager.getState();
console.log('Active panel:', state.activePanel); // 'terminal-1'
console.log('Mode:', state.mode); // 'tab'
```

### 예제 2: 분할 모드

```javascript
const manager = getPanelManager();

// 1. 패널 등록
manager.registerPanel('todo-1', PANEL_TYPES.TODO, 'TODO');
manager.registerPanel('terminal-1', PANEL_TYPES.TERMINAL, '터미널');

// 2. 분할 모드로 전환
manager.setMode(PANEL_MODES.SPLIT);

// 3. 패널 열기
manager.openPanel('todo-1', PANEL_MODES.SPLIT);
manager.openPanel('terminal-1', PANEL_MODES.SPLIT);

// 4. 레이아웃 설정 (가로 분할)
manager.setLayout(LAYOUT_TYPES.HORIZONTAL);

const state = manager.getState();
console.log('Visible panels:', state.visiblePanels.length); // 2
console.log('Layout:', state.layout); // 'horizontal'
```

### 예제 3: 자연어 명령 (API)

```javascript
const axios = require('axios');

// "투두 보여줘"
const response1 = await axios.post('http://localhost:3080/api/panel/natural-command', {
  message: '투두 보여줘'
});

console.log('Intent:', response1.data.intent.intent); // 'panel_open'
console.log('Panel opened:', response1.data.state.activePanel); // 'todo-...'

// "투두랑 터미널 같이"
const response2 = await axios.post('http://localhost:3080/api/panel/natural-command', {
  message: '투두랑 터미널 같이'
});

console.log('Mode:', response2.data.state.mode); // 'split'
console.log('Visible panels:', response2.data.state.visiblePanels.length); // 2

// "탭으로 바꿔"
const response3 = await axios.post('http://localhost:3080/api/panel/natural-command', {
  message: '탭으로 바꿔'
});

console.log('Mode changed:', response3.data.state.mode); // 'tab'
```

### 예제 4: 패널 히스토리

```javascript
const manager = getPanelManager();

// 1. 패널 열기
manager.openPanel('todo-1');

// 2. 다른 패널 열기
manager.openPanel('terminal-1');

// 3. 모드 변경
manager.setMode(PANEL_MODES.SPLIT);

// 4. 뒤로 가기
manager.goBack(); // 모드 변경 취소

// 5. 다시 뒤로 가기
manager.goBack(); // terminal-1 열기 취소

const state = manager.getState();
console.log('Active panel:', state.activePanel); // 'todo-1'
```

---

## 🎨 UI 통합

### React 컴포넌트 예제

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function PanelSystem() {
  const [panelState, setPanelState] = useState(null);

  // 패널 상태 가져오기
  useEffect(() => {
    fetchPanelState();
  }, []);

  const fetchPanelState = async () => {
    const response = await axios.get('/api/panel/state');
    setPanelState(response.data.state);
  };

  // 자연어 명령 처리
  const handleNaturalCommand = async (message) => {
    const response = await axios.post('/api/panel/natural-command', { message });
    setPanelState(response.data.state);
  };

  // 패널 렌더링
  const renderPanels = () => {
    if (!panelState) return null;

    const { visiblePanels, mode, layout } = panelState;

    if (mode === 'tab') {
      // 탭 모드: 활성 패널만 표시
      const activePanel = visiblePanels.find(p => p.isActive);
      return <PanelContent panel={activePanel} />;
    } else if (mode === 'split') {
      // 분할 모드: 모든 패널 표시
      return (
        <div className={`split-layout ${layout}`}>
          {visiblePanels.map(panel => (
            <PanelContent key={panel.id} panel={panel} />
          ))}
        </div>
      );
    }
  };

  return (
    <div className="panel-system">
      {/* 자연어 입력 */}
      <input
        type="text"
        placeholder="명령어 입력 (예: 투두 보여줘)"
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            handleNaturalCommand(e.target.value);
            e.target.value = '';
          }
        }}
      />

      {/* 패널 렌더링 */}
      {renderPanels()}
    </div>
  );
}
```

---

## ⚙️ 설정 옵션

### 기본 설정

```javascript
const manager = new PanelManager();

// 기본 모드
manager.mode = PANEL_MODES.TAB;

// 기본 레이아웃
manager.layout = LAYOUT_TYPES.SINGLE;

// 히스토리 활성화
manager.history = [];
```

### 커스터마이징

```javascript
// 패널 위치 커스터마이징 (팝업 모드)
panel.position = {
  x: '50%',
  y: '50%',
  width: 600,
  height: 400,
  transform: 'translate(-50%, -50%)'
};

// 패널 크기 (분할 모드)
panel.size = 1.5; // 다른 패널보다 1.5배 크게

// 패널 순서
panel.order = 2; // 세 번째 패널
```

---

## 🔍 자동 레이아웃 로직

### 레이아웃 자동 결정

```javascript
_recalculateLayout() {
  const visiblePanels = Array.from(this.panels.values())
    .filter(p => p.isVisible)
    .sort((a, b) => a.order - b.order);

  const count = visiblePanels.length;

  if (count === 0) return;

  if (this.mode === PANEL_MODES.TAB || count === 1) {
    // 탭 모드 또는 단일 패널
    this.layout = LAYOUT_TYPES.SINGLE;
  } else if (this.mode === PANEL_MODES.SPLIT) {
    if (count === 2) {
      // 2개: 가로 또는 세로 분할
      this.layout = this.layout === LAYOUT_TYPES.VERTICAL
        ? LAYOUT_TYPES.VERTICAL
        : LAYOUT_TYPES.HORIZONTAL;
    } else if (count <= 4) {
      // 3-4개: 그리드
      this.layout = LAYOUT_TYPES.GRID;
    } else {
      // 5개 이상: 경고
      console.warn('Too many panels for split mode.');
    }
  }
}
```

---

## 📊 테스트

### 테스트 스크립트

```bash
# 전체 테스트 실행
bash test-all-apis.sh

# 패널 시스템 테스트만 실행
# (test-all-apis.sh에서 test_panel_system 함수 참고)
```

### 테스트 항목

1. ✅ 패널 상태 조회
2. ✅ 패널 등록
3. ✅ 패널 열기
4. ✅ 패널 닫기
5. ✅ 패널 토글
6. ✅ 모드 변경
7. ✅ 자연어 명령 - "투두 보여줘"
8. ✅ 자연어 명령 - "탭으로 바꿔"
9. ✅ 패널 타입 목록
10. ✅ 패널 모드 목록

---

## 🚀 향후 개선 사항

### Phase 9 UI 구현
- [ ] 실제 패널 컴포넌트 구현
- [ ] 드래그 앤 드롭 지원
- [ ] 패널 크기 조절
- [ ] 패널 위치 저장/복원

### 고급 기능
- [ ] 패널 북마크 (자주 사용하는 구성)
- [ ] 워크스페이스 프리셋
- [ ] 패널 애니메이션
- [ ] 키보드 단축키 지원

### 통합
- [ ] NLP 시스템과 완전 통합
- [ ] 메모리 시스템 연동 (패널 상태 저장)
- [ ] 설정 UI 연동

---

## 📚 관련 파일

- [panel-manager.js](./utils/panel-manager.js) - 패널 관리 유틸리티
- [panel.js](./routes/panel.js) - 패널 API 라우트
- [intent-detector.js](./utils/intent-detector.js) - 자연어 의도 감지
- [test-all-apis.sh](./test-all-apis.sh) - API 테스트 스크립트

---

**작성일**: 2026-01-18
**버전**: 1.0
**상태**: Week 1 패널 시스템 완료 ✅
