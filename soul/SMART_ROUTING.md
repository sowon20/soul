# Smart Routing System

**Phase 8: 스마트 라우팅**

AI 모델 자동 선택 및 단일 인격 시스템

---

## 목차

1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [SmartRouter](#smartrouter)
4. [PersonalityCore](#personalitycore)
5. [API 레퍼런스](#api-레퍼런스)
6. [사용 예제](#사용-예제)
7. [모델 선택 로직](#모델-선택-로직)

---

## 개요

스마트 라우팅 시스템은 태스크의 복잡도를 자동으로 분석하여 최적의 AI 모델을 선택하고, 모든 모델에서 일관된 인격을 유지하는 시스템입니다.

### 핵심 기능

1. **자동 모델 선택**
   - 태스크 복잡도 분석
   - 3가지 모델 중 자동 선택 (Haiku/Sonnet/Opus)
   - 비용/성능 최적화

2. **단일 인격 유지**
   - 모델 간 일관된 톤/스타일
   - 컨텍스트 연속성
   - 모델 전환 시 seamless transition

3. **비용 최적화**
   - 간단한 작업 → Haiku (빠르고 저렴)
   - 일반 작업 → Sonnet (균형잡힌 성능)
   - 복잡한 작업 → Opus (최고 성능)

---

## 시스템 아키텍처

```
User Message
    ↓
SmartRouter
    ↓
Task Analysis
    ├─ Complexity Detection
    ├─ Task Type Detection
    └─ Requirements Detection
    ↓
Model Selection
    ├─ Haiku (complexity ≤ 3)
    ├─ Sonnet (complexity 4-6)
    └─ Opus (complexity ≥ 7)
    ↓
PersonalityCore
    ↓
System Prompt Generation
    ↓
Conversation Pipeline
    ↓
AI Response
    ↓
Response Validation
```

---

## SmartRouter

### 개요

태스크를 분석하고 최적 모델을 선택하는 라우터

### 주요 클래스

#### `SmartRouter`

```javascript
const { getSmartRouter } = require('./utils/smart-router');

const router = getSmartRouter();
const result = await router.route(message, context);
```

### 모델 목록

#### 1. Claude 3.5 Haiku
```javascript
{
  id: 'claude-3-5-haiku-20241022',
  name: 'Claude 3.5 Haiku',
  tier: 'fast',
  costPerMToken: 1.0,  // $1/M input tokens
  costPerMTokenOutput: 5.0,  // $5/M output tokens
  strengths: ['speed', 'simple_tasks', 'cost_effective']
}
```

**사용 시나리오:**
- 간단한 질문
- 번역
- 요약
- 포맷팅

#### 2. Claude 3.5 Sonnet (기본)
```javascript
{
  id: 'claude-3-5-sonnet-20241022',
  name: 'Claude 3.5 Sonnet',
  tier: 'balanced',
  costPerMToken: 3.0,
  costPerMTokenOutput: 15.0,
  strengths: ['balanced', 'reasoning', 'coding', 'analysis']
}
```

**사용 시나리오:**
- 코드 생성/리뷰
- 데이터 분석
- 문제 해결
- 일반적인 대화

#### 3. Claude 3 Opus
```javascript
{
  id: 'claude-3-opus-20240229',
  name: 'Claude 3 Opus',
  tier: 'premium',
  costPerMToken: 15.0,
  costPerMTokenOutput: 75.0,
  strengths: ['complex_reasoning', 'creativity', 'expert_level']
}
```

**사용 시나리오:**
- 아키텍처 설계
- 복잡한 디버깅
- 연구/조사
- 전문가 수준 컨설팅

### 태스크 복잡도 분석

#### 복잡도 시그널

```javascript
// 1. 메시지 길이
200+ words → +2 complexity
100+ words → +1 complexity

// 2. 코드 블록
Each code block → +1 complexity

// 3. 다중 요구사항
3+ numbered items → +2 complexity

// 4. 기술 키워드 밀도
3+ tech keywords → +2 complexity
```

#### 태스크 유형별 복잡도

| 태스크 유형 | 복잡도 | 추천 모델 |
|------------|-------|----------|
| 간단한 질문 | 1 | Haiku |
| 번역 | 1 | Haiku |
| 요약 | 2 | Haiku |
| 코드 생성 | 5 | Sonnet |
| 코드 리뷰 | 4 | Sonnet |
| 데이터 분석 | 5 | Sonnet |
| 문제 해결 | 6 | Sonnet |
| 아키텍처 설계 | 8 | Opus |
| 복잡한 디버깅 | 7 | Opus |
| 연구 | 7 | Opus |
| 전문가 컨설팅 | 9 | Opus |

### 메서드

#### `route(message, context)`

메시지를 분석하여 최적 모델 선택

```javascript
const result = await router.route("React 컴포넌트 구현해줘", {
  historyTokens: 5000,
  messageCount: 10
});

// result:
{
  modelId: 'claude-3-5-sonnet-20241022',
  modelName: 'Claude 3.5 Sonnet',
  reason: 'Task type: CODE_GENERATION | Complexity: 5/10 | Selected: Sonnet',
  confidence: 0.8,
  analysis: {
    complexity: 5,
    taskType: 'CODE_GENERATION',
    requiresReasoning: true,
    inputTokens: 150,
    contextTokens: 5000,
    totalTokens: 5150,
    signals: [...]
  },
  estimatedCost: {
    inputTokens: 5150,
    estimatedOutputTokens: 300,
    inputCost: 0.00001545,
    outputCost: 0.0000045,
    totalCost: 0.00001995,
    currency: 'USD'
  }
}
```

#### `analyzeTask(message, context)`

라우팅 없이 분석만 수행

```javascript
const analysis = router.analyzeTask("간단한 질문입니다");

// analysis:
{
  complexity: 1,
  taskType: 'SIMPLE_QUESTION',
  requiresReasoning: false,
  inputTokens: 50,
  contextTokens: 0,
  totalTokens: 50,
  confidence: 0.7,
  signals: ['Detected task: SIMPLE_QUESTION']
}
```

#### `getStats()`

라우팅 통계 조회

```javascript
const stats = router.getStats();

// stats:
{
  totalRequests: 100,
  routingDecisions: {
    haiku: 30,
    sonnet: 50,
    opus: 20
  },
  distribution: {
    haiku: '30%',
    sonnet: '50%',
    opus: '20%'
  },
  totalCost: 0.05,
  averageLatency: 0
}
```

---

## PersonalityCore

### 개요

모든 모델에서 일관된 인격을 유지하는 시스템

### 인격 프로필

```javascript
const PERSONALITY_PROFILE = {
  name: 'Soul',
  role: 'AI Assistant',

  // 핵심 특성
  traits: {
    helpful: 1.0,        // 도움을 주려는 의지
    professional: 0.9,   // 전문성
    friendly: 0.8,       // 친근함
    precise: 0.9,        // 정확성
    proactive: 0.7,      // 능동성
    empathetic: 0.6      // 공감 능력
  },

  // 커뮤니케이션 스타일
  communication: {
    formality: 0.7,      // 격식
    verbosity: 0.5,      // 말 많음
    technicality: 0.8,   // 기술적
    directness: 0.8      // 직설적
  },

  // 언어 선호
  language: {
    primary: 'ko',       // 한국어
    secondary: 'en',     // 영어
    codeComments: 'en',  // 코드 주석은 영어
    mixedOk: true        // 한영 혼용 가능
  }
}
```

### 주요 클래스

#### `PersonalityCore`

```javascript
const { getPersonalityCore } = require('./utils/personality-core');

const personality = getPersonalityCore();
```

### 메서드

#### `generateSystemPrompt(options)`

인격이 일관된 시스템 프롬프트 생성

```javascript
const systemPrompt = personality.generateSystemPrompt({
  model: 'claude-3-5-sonnet-20241022',
  context: {
    previousModel: 'claude-3-5-haiku-20241022'
  }
});

// systemPrompt:
// "You are Soul, an AI assistant with the following personality:
//
// CORE TRAITS:
// - Highly helpful (100%)
// - Highly professional (90%)
// - Highly friendly (80%)
// ...
//
// COMMUNICATION STYLE:
// - Formality: balanced (70%)
// - Detail level: balanced (50%)
// ...
//
// CONTEXT: You are continuing a conversation previously handled by another model..."
```

#### `validateResponse(response, context)`

응답이 인격과 일치하는지 검증

```javascript
const validation = personality.validateResponse(
  "안녕하세요. 도와드리겠습니다.",
  { englishExpected: false }
);

// validation:
{
  valid: true,
  issues: [],
  score: 1.0
}
```

#### `handleModelSwitch(fromModel, toModel)`

모델 전환 시 컨텍스트 유지

```javascript
const result = personality.handleModelSwitch(
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  { reason: 'Task complexity increased' }
);

// result:
{
  success: true,
  fromModel: 'claude-3-5-haiku-20241022',
  toModel: 'claude-3-5-sonnet-20241022',
  switchCount: 1,
  transitionMessage: '[Model Transition: haiku → sonnet]...',
  context: { ... }
}
```

#### `trackTopic(topic)`

대화 주제 추적

```javascript
personality.trackTopic('React 컴포넌트');
personality.trackTopic('코드 리뷰');
```

#### `setUserPreference(key, value)`

사용자 선호도 설정

```javascript
personality.setUserPreference('responseStyle', 'detailed');
personality.setUserPreference('language', 'en');
```

---

## API 레퍼런스

### 1. POST /api/chat

통합 채팅 엔드포인트 (라우팅 포함)

**Request:**
```json
{
  "message": "React 컴포넌트 구현해줘",
  "sessionId": "main-conversation",
  "options": {
    "historyTokens": 5000,
    "messageCount": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "main-conversation",
  "message": "[Mock Response using Claude 3.5 Sonnet] ...",
  "usage": { ... },
  "compressed": false,
  "contextData": { ... },
  "routing": {
    "selectedModel": "Claude 3.5 Sonnet",
    "modelId": "claude-3-5-sonnet-20241022",
    "reason": "Task type: CODE_GENERATION | Complexity: 5/10",
    "confidence": 0.8,
    "estimatedCost": {
      "inputTokens": 5150,
      "estimatedOutputTokens": 300,
      "totalCost": 0.00001995,
      "currency": "USD"
    }
  },
  "validation": {
    "valid": true,
    "score": 1.0,
    "issues": []
  }
}
```

### 2. POST /api/chat/analyze-task

태스크 분석 (라우팅 없이 분석만)

**Request:**
```json
{
  "message": "마이크로서비스 아키텍처 설계해주세요",
  "context": {
    "historyTokens": 0
  }
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "complexity": 8,
    "taskType": "ARCHITECTURE_DESIGN",
    "requiresReasoning": true,
    "requiresCreativity": false,
    "requiresExpertise": true,
    "inputTokens": 200,
    "contextTokens": 0,
    "totalTokens": 200,
    "confidence": 0.9,
    "signals": [
      "Detected task: ARCHITECTURE_DESIGN",
      "Medium input (100+ words)",
      "3 technical keywords",
      "Requires expertise"
    ]
  }
}
```

### 3. GET /api/chat/routing-stats

라우팅 통계

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalRequests": 100,
    "routingDecisions": {
      "haiku": 30,
      "sonnet": 50,
      "opus": 20
    },
    "distribution": {
      "haiku": "30%",
      "sonnet": "50%",
      "opus": "20%"
    },
    "totalCost": 0.05,
    "averageLatency": 0
  }
}
```

### 4. GET /api/chat/models

사용 가능한 모델 목록

**Response:**
```json
{
  "success": true,
  "models": [
    {
      "id": "claude-3-5-haiku-20241022",
      "name": "Claude 3.5 Haiku",
      "tier": "fast",
      "costPerMToken": 1.0,
      "costPerMTokenOutput": 5.0,
      "strengths": ["speed", "simple_tasks", "cost_effective"],
      "maxTokens": 200000,
      "description": "빠르고 효율적인 응답, 간단한 작업에 최적"
    },
    // ... more models
  ]
}
```

### 5. GET /api/chat/personality

인격 정보

**Response:**
```json
{
  "success": true,
  "personality": {
    "currentModel": "claude-3-5-sonnet-20241022",
    "previousModel": null,
    "modelSwitchCount": 0,
    "topicHistory": ["React", "코드 리뷰"],
    "userPreferences": {
      "responseStyle": "detailed"
    },
    "profile": {
      "name": "Soul",
      "traits": { ... },
      "communication": { ... }
    }
  }
}
```

### 6. POST /api/chat/personality/preference

사용자 선호도 설정

**Request:**
```json
{
  "key": "responseStyle",
  "value": "detailed"
}
```

**Response:**
```json
{
  "success": true,
  "preference": {
    "key": "responseStyle",
    "value": "detailed"
  }
}
```

---

## 사용 예제

### 예제 1: 간단한 대화

```javascript
// 사용자: "오늘 날씨 어때?"
const response = await fetch('http://localhost:3080/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "오늘 날씨 어때?"
  })
});

const result = await response.json();
console.log(result.routing.selectedModel); // "Claude 3.5 Haiku"
console.log(result.routing.reason);
// "Task type: SIMPLE_QUESTION | Complexity: 1/10 | Selected: Haiku (fast)"
```

### 예제 2: 코드 생성

```javascript
// 사용자: "React 로그인 컴포넌트 구현해줘"
const response = await fetch('http://localhost:3080/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "React 로그인 컴포넌트 구현해줘. useState와 validation 포함"
  })
});

const result = await response.json();
console.log(result.routing.selectedModel); // "Claude 3.5 Sonnet"
console.log(result.routing.reason);
// "Task type: CODE_GENERATION | Complexity: 5/10 | Selected: Sonnet (balanced)"
```

### 예제 3: 아키텍처 설계

```javascript
// 사용자: "마이크로서비스 아키텍처 설계"
const response = await fetch('http://localhost:3080/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: `마이크로서비스 아키텍처를 설계해주세요.

    요구사항:
    1. 확장성 고려
    2. 보안 강화
    3. 장애 복구
    4. 모니터링`
  })
});

const result = await response.json();
console.log(result.routing.selectedModel); // "Claude 3 Opus"
console.log(result.routing.reason);
// "Task type: ARCHITECTURE_DESIGN | Complexity: 8/10 | Requires expertise | Selected: Opus (premium)"
```

### 예제 4: 태스크 분석만

```javascript
// 복잡도만 확인하고 싶을 때
const response = await fetch('http://localhost:3080/api/chat/analyze-task', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "데이터베이스 쿼리 최적화해줘"
  })
});

const result = await response.json();
console.log(result.analysis.complexity); // 5
console.log(result.analysis.taskType); // "DATA_ANALYSIS"
```

---

## 모델 선택 로직

### 결정 트리

```
Input: message, context
    ↓
Analyze Task
    ├─ Detect task type
    ├─ Calculate complexity (0-10)
    └─ Detect requirements
    ↓
Decision:
    ├─ complexity ≥ 7 OR requiresExpertise
    │   → Opus (premium)
    │
    ├─ complexity ≤ 3 AND NOT requiresReasoning
    │   → Haiku (fast)
    │
    └─ else
        → Sonnet (balanced)
```

### 복잡도 계산 공식

```
complexity = base_complexity + signals

base_complexity:
- Task type complexity (0-9)

signals:
+ Word count > 200: +2
+ Word count > 100: +1
+ Code blocks: +1 per block
+ Numbered requirements ≥ 3: +2
+ Technical keywords ≥ 3: +2
+ Long conversation history: +1
```

### 예시

#### 예시 1: "오늘 날씨 어때?"
```
Task type: SIMPLE_QUESTION (complexity: 1)
Signals: 0
Total complexity: 1
→ Haiku
```

#### 예시 2: "React 컴포넌트 구현해줘"
```
Task type: CODE_GENERATION (complexity: 5)
Signals: 0
Total complexity: 5
→ Sonnet
```

#### 예시 3: "마이크로서비스 아키텍처 설계해주세요. 확장성과 보안을 고려해야 합니다."
```
Task type: ARCHITECTURE_DESIGN (complexity: 8)
Signals:
- 2 technical keywords: +2
- Requires expertise: detected
Total complexity: 10
→ Opus
```

---

## 비용 최적화

### 모델별 비용

| 모델 | Input ($/M tokens) | Output ($/M tokens) | 비율 |
|-----|-------------------|--------------------|----|
| Haiku | $1 | $5 | 1x |
| Sonnet | $3 | $15 | 3x |
| Opus | $15 | $75 | 15x |

### 비용 절감 전략

1. **간단한 작업은 Haiku로**
   - 질문, 번역, 요약 등
   - 15배 저렴 (vs Opus)

2. **일반 작업은 Sonnet으로**
   - 코드 생성, 분석 등
   - 균형잡힌 가격/성능

3. **복잡한 작업만 Opus로**
   - 아키텍처 설계, 전문 컨설팅 등
   - 필요할 때만 사용

### 예상 비용 절감

```
기존 (모두 Opus 사용):
- 100 requests
- Distribution: 30 simple, 50 medium, 20 complex
- Cost: 100 * $0.015 = $1.50

스마트 라우팅 사용:
- 30 simple → Haiku: $0.03
- 50 medium → Sonnet: $0.15
- 20 complex → Opus: $0.30
- Total: $0.48

절감: $1.02 (68% 절감)
```

---

## 통합 예제

### React 컴포넌트

```typescript
import { useState, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface RoutingInfo {
  selectedModel: string;
  reason: string;
  estimatedCost: {
    totalCost: number;
  };
}

export function SmartChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [routing, setRouting] = useState<RoutingInfo | null>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    // 사용자 메시지 추가
    setMessages([...messages, { role: 'user', content: input }]);

    // API 호출
    const response = await fetch('http://localhost:3080/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: input,
        sessionId: 'main-conversation'
      })
    });

    const result = await response.json();

    // AI 응답 추가
    setMessages([
      ...messages,
      { role: 'user', content: input },
      { role: 'assistant', content: result.message }
    ]);

    // 라우팅 정보 표시
    setRouting(result.routing);
    setInput('');
  };

  return (
    <div className="chat">
      {/* Messages */}
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      {/* Routing Info */}
      {routing && (
        <div className="routing-info">
          <span>Model: {routing.selectedModel}</span>
          <span>Cost: ${routing.estimatedCost.totalCost.toFixed(6)}</span>
          <span title={routing.reason}>ℹ️</span>
        </div>
      )}

      {/* Input */}
      <div className="input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && sendMessage()}
          placeholder="메시지를 입력하세요..."
        />
        <button onClick={sendMessage}>전송</button>
      </div>
    </div>
  );
}
```

---

## 참고 자료

- [Smart Router 코드](../utils/smart-router.js)
- [Personality Core 코드](../utils/personality-core.js)
- [Chat API 코드](../routes/chat.js)
- [테스트 스크립트](../test-all-apis.sh)

---

## 라이선스

MIT License
