# Soul MCP Server

> Model Context Protocol 서버로 Soul의 모든 기능을 외부 AI 도구에서 사용 가능

---

## 📋 개요

Soul MCP Server는 [Model Context Protocol](https://modelcontextprotocol.io)을 구현하여 Claude Desktop, VSCode, 기타 MCP 클라이언트에서 Soul의 기능을 사용할 수 있게 합니다.

**제공 도구**:
- **메모리 도구** (4개): 검색, 조회, 저장, 추천
- **컨텍스트 도구** (4개): 맥락 감지, 토큰 분석, 압축, 비유 검색
- **NLP 도구** (2개): 의도 감지, 액션 실행

**총 10개 MCP 도구**

---

## 🏗️ 구조

```
mcp/
├── hub-server.js           # MCP 허브 서버
├── tools/
│   ├── memory-tool.js      # 메모리 관리 도구
│   ├── context-tool.js     # 컨텍스트 관리 도구
│   └── nlp-tool.js         # 자연어 처리 도구
└── README.md               # 이 파일
```

---

## 🚀 사용법

### 1. Soul 서버 시작

```bash
# Soul API 서버 실행
cd soul
node server/index.js
```

### 2. MCP 서버 시작

```bash
# MCP 허브 서버 실행
cd mcp
node hub-server.js
```

### 3. Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 또는
`%APPDATA%/Claude/claude_desktop_config.json` (Windows)에 추가:

```json
{
  "mcpServers": {
    "soul": {
      "command": "node",
      "args": ["/path/to/soul/mcp/hub-server.js"],
      "env": {
        "SOUL_API_BASE": "http://localhost:3080/api"
      }
    }
  }
}
```

### 4. VSCode MCP 확장 설정

`.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "soul": {
      "command": "node",
      "args": ["mcp/hub-server.js"],
      "env": {
        "SOUL_API_BASE": "http://localhost:3080/api"
      }
    }
  }
}
```

---

## 🔧 도구 상세

### 메모리 도구 (memory)

#### `search_memory`
과거 대화를 자연어로 검색

**Parameters**:
- `query` (string, required): 검색 쿼리
- `limit` (number, optional): 최대 결과 개수 (기본: 5)
- `timeRange` (string, optional): 시간 범위 (today, yesterday, last_week, last_month)

**Example**:
```json
{
  "query": "React 최적화 관련 대화",
  "limit": 3,
  "timeRange": "last_week"
}
```

#### `get_memory`
특정 대화의 전체 내용 가져오기

**Parameters**:
- `conversationId` (string, required): 대화 ID

#### `save_memory`
현재 대화를 메모리에 저장

**Parameters**:
- `conversationId` (string, required): 대화 ID
- `messages` (array, required): 메시지 배열
- `autoAnalyze` (boolean, optional): AI 자동 분석 (기본: true)

#### `recommend_memories`
현재 대화와 관련된 과거 대화 추천

**Parameters**:
- `conversationId` (string, required): 현재 대화 ID
- `limit` (number, optional): 추천 개수 (기본: 3)

---

### 컨텍스트 도구 (context)

#### `detect_context`
현재 메시지에서 과거 대화 참조 감지

**Parameters**:
- `message` (string, required): 현재 메시지
- `conversationHistory` (array, optional): 최근 대화 히스토리

**Example**:
```json
{
  "message": "저번에 얘기했던 React 프로젝트"
}
```

#### `analyze_tokens`
현재 대화의 토큰 사용량 분석

**Parameters**:
- `messages` (array, required): 메시지 배열
- `model` (string, optional): 모델 이름 (기본: 'gpt-4')

#### `compress_context`
대화 컨텍스트 압축

**Parameters**:
- `messages` (array, required): 압축할 메시지
- `targetRatio` (number, optional): 목표 압축 비율 (기본: 0.5)

#### `find_analogies`
현재 상황과 비슷한 과거 대화 찾기

**Parameters**:
- `message` (string, required): 현재 메시지
- `limit` (number, optional): 최대 비유 개수 (기본: 3)

---

### NLP 도구 (nlp)

#### `detect_intent`
사용자 메시지의 의도 감지

**Parameters**:
- `message` (string, required): 사용자 메시지
- `context` (object, optional): UI 상태 등 컨텍스트

**Example**:
```json
{
  "message": "메모리 패널 열어줘",
  "context": {
    "currentPanel": "none"
  }
}
```

**Response**:
```json
{
  "success": true,
  "intent": "panel_open",
  "confidence": 0.83,
  "entities": {
    "panelType": "메모리"
  },
  "isCommand": true
}
```

#### `execute_intent`
의도 감지 + 액션 제안

**Parameters**:
- `message` (string, required): 사용자 메시지
- `context` (object, optional): 컨텍스트

**Response**:
```json
{
  "success": true,
  "intent": {...},
  "action": {
    "action": "open_panel",
    "params": {"panelType": "메모리"},
    "endpoint": null
  },
  "shouldExecute": true
}
```

---

## 🧪 테스트

### MCP Inspector 사용

```bash
# MCP Inspector 설치
npm install -g @modelcontextprotocol/inspector

# Soul MCP 서버 테스트
mcp-inspector node mcp/hub-server.js
```

### curl 테스트

MCP는 stdio 프로토콜을 사용하므로 직접 테스트하려면:

```bash
# 메모리 검색 테스트
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_memory","arguments":{"query":"React"}},"id":1}' | node mcp/hub-server.js
```

---

## 🔌 통합 예시

### Claude Desktop에서 사용

```
User: @soul search_memory query="저번 주 MongoDB 대화"

Claude: [메모리 검색 결과 표시]
```

### 프로그래밍 방식

```javascript
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');

const client = new Client({
  name: 'my-app',
  version: '1.0.0'
});

// 메모리 검색
const result = await client.callTool('search_memory', {
  query: 'React 최적화',
  limit: 5
});

console.log(result);
```

---

## ⚙️ 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `SOUL_API_BASE` | Soul API 서버 주소 | `http://localhost:3080/api` |

---

## 🛠️ 개발

### 새 도구 추가

1. `tools/` 디렉토리에 새 파일 생성 (예: `my-tool.js`)

```javascript
module.exports = {
  name: 'my_tool',
  description: '도구 설명',
  tools: [
    {
      name: 'my_function',
      description: '함수 설명',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string', description: '파라미터 설명' }
        },
        required: ['param1']
      },
      handler: async ({ param1 }) => {
        // 구현
        return { success: true, result: '...' };
      }
    }
  ]
};
```

2. `hub-server.js`에 등록

```javascript
const myTool = require('./tools/my-tool');

const ALL_TOOLS = [
  memoryTool,
  contextTool,
  nlpTool,
  myTool  // 추가
];
```

---

## 📚 참고 자료

- [Model Context Protocol 공식 문서](https://modelcontextprotocol.io)
- [MCP SDK (JavaScript)](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Desktop MCP 설정](https://docs.anthropic.com/claude/docs/model-context-protocol)

---

**작성일**: 2026-01-18
**버전**: 1.0
**상태**: Week 1 MCP 정리 완료 ✅
