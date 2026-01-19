# LibreChat 대화방 맥락 기술 인수인계

> **작성일**: 2026-01-20
> **목적**: LibreChat의 순수 뇌(API)에 여러 겹의 기능적 레이어를 쌓아 대화의 질과 맥락을 이어가는 핵심 기술 전수

---

## 📚 목차

1. [핵심 철학](#핵심-철학)
2. [레이어 아키텍처](#레이어-아키텍처)
3. [메시지 구성 파이프라인](#메시지-구성-파이프라인)
4. [토큰 관리 전략](#토큰-관리-전략)
5. [메모리 계층 시스템](#메모리-계층-시스템)
6. [세션 연속성](#세션-연속성)
7. [에이전트 체이닝](#에이전트-체이닝)
8. [구현 상태](#구현-상태)

---

## 🎯 핵심 철학

### LibreChat이 일반 ChatGPT/Claude와 다른 이유

**일반적인 API 호출**:
```javascript
// ❌ 단순 API 호출 (맥락 약함)
const response = await anthropic.messages.create({
  model: 'claude-3-sonnet',
  messages: [
    { role: 'user', content: userMessage }
  ]
});
```

**LibreChat 방식**:
```javascript
// ✅ 레이어드 아키텍처 (맥락 강함)
const response = await anthropic.messages.create({
  model: await smartRouter.selectModel(userMessage),
  messages: await conversationPipeline.buildMessages({
    // Layer 1: 토큰 제한 내 역순 메시지 추가
    currentSession: getRecentMessages(),

    // Layer 2: 자동 맥락 감지 및 메모리 주입
    relatedMemories: await contextDetector.autoRetrieve(userMessage),

    // Layer 3: 세션 요약 (압축된 과거 대화)
    sessionSummary: await getSummary(),

    // Layer 4: 동적 시스템 프롬프트 (관계 기반)
    systemPrompt: personalityCore.generatePrompt({
      userContext,
      recentTopics,
      conversationHistory
    })
  })
});
```

**결과**:
- ✅ 사람같은 이해력 (맥락 누적)
- ✅ 기억력 (장기 메모리 자동 참조)
- ✅ 판단력 (과거 결정 사항 반영)
- ✅ 문맥 이해 (대화 흐름 유지)

---

## 🏗️ 레이어 아키텍처

### Layer 0: 순수 뇌 (AI API)
```
Anthropic / OpenAI / Google API
└─ 기본 completion 능력만 제공
```

### Layer 1: 토큰 관리 레이어
```javascript
// 파일: soul/utils/token-safeguard.js
// 역할: 토큰 폭발 방지, 실시간 모니터링

class TokenSafeguard {
  // 95% 도달 시 강제 압축
  emergencyCompress()

  // Tool 출력 500 토큰 제한
  truncateToolOutput()

  // Vision 토큰 정확 계산
  calculateImageTokens()

  // 5분/25회 마다 토큰나이저 초기화
  ManagedTokenizer
}
```

**해결하는 문제**:
- ❌ "ㅇㅇㅇ" 같은 짧은 메시지에도 토큰 폭발
- ❌ Tool 출력 무제한 누적
- ❌ Vision 이미지 토큰 중복 계산
- ❌ 토큰나이저 캐시 메모리 누수

### Layer 2: 메시지 구성 레이어 (핵심!)
```javascript
// 파일: soul/utils/conversation-pipeline.js
// 역할: LibreChat의 핵심 - 메시지 배열 지능적 구성

async buildConversationMessages({
  conversationId,
  newMessage,
  model
}) {
  // Step 1: 역순 메시지 추가 (최신부터)
  const messages = await getMessagesWithinTokenLimit({
    sessionMessages,
    tokenLimit: getModelLimit(model) * 0.8, // 80%까지만 사용
    reverseOrder: true // 🔑 핵심 기법
  });

  // Step 2: 자동 맥락 감지
  const contextTrigger = await contextDetector.detect(newMessage);

  // Step 3: 관련 메모리 자동 주입
  let relatedMemories = [];
  if (contextTrigger.shouldRetrieve) {
    relatedMemories = await longTermMemory.search(
      contextTrigger.keywords
    );
  }

  // Step 4: 토큰 80% 초과 시 자동 압축
  if (tokenUsage > 0.8) {
    const compressed = await autoCompress(messages);
    messages = compressed.messages;
    sessionSummary = compressed.summary;
  }

  // Step 5: 동적 시스템 프롬프트 구성
  const systemPrompt = personalityCore.generateSystemPrompt({
    relatedMemories,      // 과거 대화
    sessionSummary,       // 압축된 현재 세션
    userContext,          // 사용자 관계
    conversationHistory   // 대화 누적 횟수
  });

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: newMessage }
    ]
  };
}
```

**핵심 기법: 역순 메시지 추가**
```javascript
// ❌ 일반적인 방식 (오래된 것부터)
messages = [msg1, msg2, msg3, ..., msg100];
// 토큰 제한 도달 시 → 최신 메시지가 잘림!

// ✅ LibreChat 방식 (최신부터)
const reversedMessages = sessionMessages.reverse();
let tokenCount = 0;
const selected = [];

for (const msg of reversedMessages) {
  const tokens = estimateTokens(msg);
  if (tokenCount + tokens > tokenLimit) break;

  selected.unshift(msg); // 앞에 추가 (원래 순서 유지)
  tokenCount += tokens;
}

// 결과: 최신 대화가 항상 보존됨
```

### Layer 3: 메모리 계층 레이어
```javascript
// 파일: soul/utils/memory-layers.js
// 역할: 3단계 메모리 자동 관리

class MemoryManager {
  // 단기: 현재 세션 (메모리)
  shortTerm = new ShortTermMemory({
    maxMessages: 50,
    storage: 'memory'
  });

  // 중기: 세션 요약 (파일)
  middleTerm = new MiddleTermMemory({
    summaryInterval: '1 hour',
    storage: 'file' // /workspaces/.soul/memory/sessions/
  });

  // 장기: 아카이브 (MongoDB)
  longTerm = new LongTermMemory({
    storage: 'mongodb',
    collection: 'memories'
  });

  // 자동 계층 이동
  async promote(message) {
    if (this.shortTerm.isFull()) {
      const batch = this.shortTerm.getOldest(10);
      await this.middleTerm.createSummary(batch);
    }

    if (this.middleTerm.shouldArchive()) {
      await this.longTerm.archive(
        this.middleTerm.getSummary()
      );
    }
  }
}
```

**메모리 흐름**:
```
[사용자 메시지]
    ↓
단기 메모리 (50개)
    ↓ (시간 or 개수 초과)
중기 메모리 (세션 요약)
    ↓ (1시간 경과 or 주제 변경)
장기 메모리 (AI 분석 + MongoDB)
    ↓
전문 검색 (Phase 3)
```

### Layer 4: 맥락 감지 레이어
```javascript
// 파일: soul/utils/context-detector.js
// 역할: 과거 대화 참조 자동 감지

const triggers = {
  // 시간 참조
  temporal: ['저번에', '최근에', '어제', '그때', '예전에'],

  // 주제 참조
  topical: ['아까 말한', '그거', '비슷한', '관련된'],

  // 직접 질문
  direct: ['기억나?', '했었지?', '얘기했던']
};

async detectAndRetrieve(userMessage) {
  // 1. 트리거 감지
  const detected = evaluateTrigger(userMessage);

  if (detected.confidence > 0.7) {
    // 2. 키워드 추출
    const keywords = extractKeywords(userMessage);

    // 3. 시간 범위 파싱
    const timeRange = parseTimeExpression(userMessage);
    // "저번에" → 지난 7일
    // "최근에" → 지난 3일

    // 4. 장기 메모리 검색
    const memories = await longTermMemory.search({
      keywords,
      timeRange,
      limit: 3
    });

    // 5. 시스템 프롬프트 주입
    return generateContextPrompt(memories);
  }

  return null;
}
```

**예시**:
```
User: "저번에 얘기했던 React 프로젝트 기억나?"

1. Trigger: "저번에" (시간) + "기억나?" (직접)
2. Keywords: ["React", "프로젝트"]
3. TimeRange: 지난 7일
4. Search: MongoDB에서 검색
5. Inject:
   "과거 대화 참조:
    - 2026-01-15: React 프로젝트 시작, Vite 사용
    - 2026-01-16: 라우팅 문제 해결 (React Router v6)
    - 2026-01-17: 상태 관리 Zustand 선택"
```

### Layer 5: 세션 연속성 레이어
```javascript
// 파일: soul/utils/session-continuity.js
// 역할: 대화 중단/재개 자연스럽게 처리

class SessionContinuity {
  // 1분마다 자동 저장
  async autoSave() {
    setInterval(async () => {
      await this.saveSessionState({
        conversationId: 'main-conversation',
        messages: shortTermMemory.getAll(),
        metadata: {
          lastMessageTime: Date.now(),
          topicStack: personalityCore.getTopicStack(),
          userPreferences: personalityCore.getUserPreferences()
        }
      });
    }, 60000);
  }

  // 세션 재개 시
  async restoreSession(conversationId) {
    const session = await loadSession(conversationId);
    const timeSince = Date.now() - session.lastMessageTime;

    // 시간 인지 재개 프롬프트
    const resumePrompt = this.generateResumePrompt(timeSince);
    // 예: "[3시간 전 대화 재개]"

    return {
      messages: session.messages,
      systemPrompt: resumePrompt
    };
  }

  // 30일 이상 비활성 세션 자동 아카이브
  async cleanup() {
    const expiredSessions = await findExpired(30 * 24 * 60 * 60 * 1000);

    for (const session of expiredSessions) {
      await longTermMemory.archive(session);
      await deleteSession(session.id);
    }
  }
}
```

### Layer 6: 에이전트 체이닝 레이어
```javascript
// 파일: soul/utils/agent-chain.js
// 역할: 복잡한 작업을 여러 에이전트로 분할

// 순차 체인
const chain = new SequentialChain([
  new Agent({
    name: 'analyzer',
    systemPrompt: '코드를 분석하고 문제점을 찾아라',
    model: 'claude-3-5-sonnet'
  }),
  new Agent({
    name: 'solver',
    systemPrompt: '분석 결과를 바탕으로 해결책을 제시하라',
    model: 'claude-3-opus'
  }),
  new Agent({
    name: 'implementer',
    systemPrompt: '해결책을 코드로 구현하라',
    model: 'claude-3-5-sonnet'
  })
]);

const result = await chain.execute(userRequest);

// 병렬 체인
const parallel = new ParallelChain([
  new Agent({ name: 'security', task: '보안 검토' }),
  new Agent({ name: 'performance', task: '성능 검토' }),
  new Agent({ name: 'accessibility', task: '접근성 검토' })
]);

const reviews = await parallel.execute(code);
```

### Layer 7: 단일 인격 레이어 (최상위)
```javascript
// 파일: soul/utils/personality-core.js
// 역할: 모델 전환해도 일관된 인격 유지

class PersonalityCore {
  // 인격 정의 (변하지 않음)
  PERSONALITY_PROFILE = {
    core: {
      approach: 'collaborative',
      communication: 'clear and natural',
      tone: 'professional yet friendly'
    },

    values: [
      'accuracy over speed',
      'understanding over memorization',
      'context over isolated facts'
    ],

    style: {
      explanationDepth: 'adaptive', // 사용자에 맞춤
      technicalLevel: 'match user',
      emojiUsage: 'minimal'
    }
  };

  // 모든 요청에 이 프롬프트 추가
  generateSystemPrompt({ userContext, recentMemories, currentSession }) {
    const parts = [];

    // ❌ 절대 금지
    // "You are a helpful work assistant"
    // "You are in counseling mode"

    // ✅ 관계 기반 동적 프롬프트
    parts.push("Continue our conversation naturally.");

    if (userContext.conversationCount > 0) {
      parts.push(
        `We've had ${userContext.conversationCount} conversations together.`
      );
    }

    if (recentMemories.length > 0) {
      const topics = recentMemories.map(m => m.topics).flat();
      parts.push(
        `Recently we've discussed: ${topics.join(', ')}.`
      );
    }

    if (currentSession.summary) {
      parts.push(
        `Earlier in this session: ${currentSession.summary}`
      );
    }

    return parts.join('\n\n');
  }

  // 응답 일관성 검증
  validateResponse(response, previousModel, currentModel) {
    if (previousModel !== currentModel) {
      // 모델 전환 시 톤/스타일 유지 확인
      return this.checkConsistency(response);
    }
    return true;
  }
}
```

---

## 🔧 메시지 구성 파이프라인

### 전체 흐름도

```
사용자 메시지 입력
    ↓
┌─────────────────────────────────┐
│ Layer 1: 토큰 안전 장치          │
│ - 단일 메시지 10% 제한           │
│ - Tool 출력 500 토큰 제한        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Layer 2: 맥락 감지               │
│ - "저번에", "기억나?" 등 감지    │
│ - 키워드 추출                    │
│ - 시간 범위 파싱                 │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Layer 3: 메모리 검색             │
│ - 장기 메모리 (MongoDB)          │
│ - 관련성 점수 계산               │
│ - 상위 3개 선택                  │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Layer 4: 세션 메시지 로드        │
│ - 단기 메모리 (최근 50개)        │
│ - 역순 추가 (최신부터)           │
│ - 토큰 80% 제한                  │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Layer 5: 자동 압축 (필요 시)     │
│ - 80% 초과 시 압축 실행          │
│ - 최근 5개 메시지 보호           │
│ - 요약 생성 (AI)                 │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Layer 6: 시스템 프롬프트 구성    │
│ - 인격 프로필                    │
│ - 관련 메모리 주입               │
│ - 세션 요약                      │
│ - 사용자 컨텍스트                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Layer 7: 모델 선택 (스마트 라우팅)│
│ - 작업 유형 감지                 │
│ - 복잡도 분석                    │
│ - 최적 모델 선택                 │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ AI API 호출                      │
│ - messages: [system, ...history]│
│ - model: (자동 선택됨)           │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 응답 처리                        │
│ - 단기 메모리 저장               │
│ - 토큰 사용량 추적               │
│ - 주제 스택 업데이트             │
│ - 자동 저장 (1분 간격)           │
└─────────────────────────────────┘
    ↓
사용자에게 응답 반환
```

### 핵심 코드 (실제 구현)

```javascript
// soul/routes/chat.js
router.post('/', async (req, res) => {
  const { message } = req.body;
  const conversationId = 'main-conversation';

  try {
    // Step 1: 메시지 배열 구성 (레이어 1-6)
    const { messages, metadata } = await conversationPipeline.buildConversationMessages({
      conversationId,
      newMessage: message,
      model: null // Layer 7에서 자동 선택
    });

    // Step 2: 스마트 라우팅 (Layer 7)
    const selectedModel = await smartRouter.selectModel(message);

    // Step 3: AI 호출
    const response = await aiService.chat({
      model: selectedModel,
      messages
    });

    // Step 4: 응답 처리
    await conversationPipeline.handleResponse({
      conversationId,
      userMessage: message,
      assistantMessage: response.content,
      metadata: {
        model: selectedModel,
        tokens: response.usage,
        compressed: metadata.compressed
      }
    });

    res.json({
      response: response.content,
      metadata: {
        model: selectedModel.name,
        tokensUsed: response.usage.total_tokens,
        memoryInjected: metadata.memoryInjected
      }
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## 🛡️ 토큰 관리 전략

### 문제: 토큰 폭발 버그

**발생 원인**:
1. Tool 출력 무제한 누적
2. Vision 이미지 토큰 중복 계산
3. 토큰나이저 캐시 메모리 누수

**해결책**:

#### 1. Tool 출력 제한
```javascript
// soul/utils/token-safeguard.js
truncateToolOutput(toolOutput, maxTokens = 500) {
  const tokens = this.estimateTokens(toolOutput);

  if (tokens > maxTokens) {
    // 500 토큰 초과 시 자르기
    const truncated = toolOutput.substring(0, maxTokens * 4); // 대략 4 chars = 1 token
    return truncated + '\n... [출력 생략]';
  }

  return toolOutput;
}
```

#### 2. Vision 토큰 정확 계산
```javascript
// Claude API 공식 계산식
calculateImageTokens(width, height) {
  const tokens = (
    Math.ceil(width / 224) *
    Math.ceil(height / 224) *
    85
  ) + 85;

  return tokens;
}

// 예시: 1024x1024 이미지
// (1024/224 = 5) * (1024/224 = 5) * 85 + 85 = 2,210 tokens
```

#### 3. 토큰나이저 초기화
```javascript
class ManagedTokenizer {
  constructor() {
    this.tokenizer = tiktoken.encoding_for_model('gpt-4');
    this.callCount = 0;
    this.lastReset = Date.now();
  }

  encode(text) {
    this.callCount++;

    // 5분 또는 25회마다 초기화
    if (
      Date.now() - this.lastReset > 5 * 60 * 1000 ||
      this.callCount > 25
    ) {
      this.reset();
    }

    return this.tokenizer.encode(text);
  }

  reset() {
    this.tokenizer.free(); // 메모리 해제
    this.tokenizer = tiktoken.encoding_for_model('gpt-4');
    this.callCount = 0;
    this.lastReset = Date.now();
  }
}
```

### 토큰 사용량 티어

```javascript
const TOKEN_TIERS = {
  NORMAL: 0.8,      // 80%: 정상 운영
  WARNING: 0.9,     // 90%: 경고, 오래된 메시지 제외
  CRITICAL: 0.95,   // 95%: 강제 압축
  EMERGENCY: 1.0    // 100%: Tool 출력 잘라내기
};

async monitorTokenUsage(messages, model) {
  const usage = await analyzeTokenUsage(messages, model);

  if (usage.percentage >= TOKEN_TIERS.CRITICAL) {
    // 95% 도달: 긴급 압축
    return await tokenSafeguard.emergencyCompress(messages);
  }

  if (usage.percentage >= TOKEN_TIERS.WARNING) {
    // 90% 도달: 자동 압축
    return await contextCompressor.autoCompress(messages);
  }

  // 정상: 그대로 반환
  return messages;
}
```

---

## 💾 메모리 계층 시스템

### 3단계 계층 구조

```
┌─────────────────────────────────────┐
│ Layer 1: 단기 메모리 (Short-Term)    │
│ - 저장소: 메모리 (RAM)                │
│ - 용량: 최근 50개 메시지              │
│ - 용도: 현재 세션 즉시 참조           │
│ - 수명: 세션 종료 시까지              │
└─────────────────────────────────────┘
           ↓ (50개 초과 or 1시간 경과)
┌─────────────────────────────────────┐
│ Layer 2: 중기 메모리 (Middle-Term)   │
│ - 저장소: 파일 시스템                │
│ - 형식: JSON                         │
│ - 용도: 세션 요약, 재개 시 복원       │
│ - 수명: 30일                         │
│ - 위치: /memory/sessions/            │
└─────────────────────────────────────┘
           ↓ (30일 경과 or 주제 종결)
┌─────────────────────────────────────┐
│ Layer 3: 장기 메모리 (Long-Term)     │
│ - 저장소: MongoDB                    │
│ - 형식: 구조화된 문서                │
│ - 용도: 전문 검색, AI 분석            │
│ - 수명: 무제한                       │
│ - 컬렉션: memories                   │
└─────────────────────────────────────┘
```

### 자동 계층 이동 로직

```javascript
// soul/utils/memory-layers.js

class ShortTermMemory {
  constructor() {
    this.messages = [];
    this.maxMessages = 50;
  }

  add(message) {
    this.messages.push(message);

    // 50개 초과 시 자동 승격
    if (this.messages.length > this.maxMessages) {
      const toPromote = this.messages.splice(0, 10); // 오래된 10개

      // 중기 메모리로 이동
      middleTermMemory.createSummary(toPromote);
    }
  }

  getAll() {
    return this.messages;
  }

  getRecent(n = 10) {
    return this.messages.slice(-n);
  }
}

class MiddleTermMemory {
  constructor() {
    this.sessionsPath = '/workspaces/.soul/memory/sessions/';
  }

  async createSummary(messages) {
    // AI로 요약 생성
    const summary = await contextCompressor.generateSessionSummary(messages);

    // 파일로 저장
    const filename = `${Date.now()}-${summary.topics[0]}.json`;
    await fs.writeFile(
      path.join(this.sessionsPath, filename),
      JSON.stringify({
        timestamp: Date.now(),
        messages,
        summary,
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30일
      })
    );
  }

  async shouldArchive(sessionFile) {
    const session = await this.loadSession(sessionFile);
    const age = Date.now() - session.timestamp;

    // 30일 경과 or 명시적 종결
    return age > (30 * 24 * 60 * 60 * 1000) || session.concluded;
  }

  async archiveToLongTerm(sessionFile) {
    const session = await this.loadSession(sessionFile);

    // 장기 메모리로 이동
    await longTermMemory.archive({
      id: `session-${session.timestamp}`,
      messages: session.messages,
      metadata: {
        topics: session.summary.topics,
        tags: session.summary.tags,
        category: session.summary.category,
        importance: session.summary.importance,
        type: 'archived-session'
      },
      autoAnalyze: true // AI 재분석
    });

    // 원본 파일 삭제
    await fs.unlink(sessionFile);
  }
}

class LongTermMemory {
  async archive(data) {
    // Phase 1 메모리 저장 시스템 활용
    return await memoryUtils.saveConversation(data);
  }

  async search(query) {
    // Phase 3 검색 시스템 활용
    return await searchUtils.smartSearch(query);
  }

  async findRelated(keywords, timeRange) {
    // Phase 4 맥락 감지 시스템 활용
    return await contextDetector.findRelatedMemories({
      keywords,
      timeRange
    });
  }
}
```

### 메모리 수집 최적화

```javascript
// 컨텍스트 구성 시 효율적인 메모리 수집
async collectContextMemories(userMessage) {
  const context = {
    short: [],  // 단기 (즉시)
    middle: [], // 중기 (빠름)
    long: []    // 장기 (느림, 선택적)
  };

  // 1. 단기: 항상 포함 (빠름)
  context.short = shortTermMemory.getAll();

  // 2. 중기: 현재 세션 요약 (빠름)
  const currentSession = await middleTermMemory.getCurrentSession();
  if (currentSession) {
    context.middle = [currentSession.summary];
  }

  // 3. 장기: 맥락 감지 시에만 (느림)
  const trigger = await contextDetector.detect(userMessage);
  if (trigger.shouldRetrieve) {
    context.long = await longTermMemory.search(trigger.keywords);
  }

  return context;
}
```

---

## 🔄 세션 연속성

### 자동 저장 메커니즘

```javascript
// soul/utils/session-continuity.js

class SessionContinuity {
  constructor() {
    this.sessionPath = '/workspaces/.soul/memory/sessions/';
    this.saveInterval = null;
  }

  // 자동 저장 시작 (1분 간격)
  startAutoSave(conversationId) {
    this.saveInterval = setInterval(async () => {
      await this.saveSessionState({
        conversationId,
        messages: shortTermMemory.getAll(),
        metadata: {
          lastMessageTime: Date.now(),
          topicStack: personalityCore.getTopicStack(),
          userPreferences: personalityCore.getUserPreferences(),
          tokenUsage: tokenCounter.getCurrentUsage()
        }
      });
    }, 60000); // 1분
  }

  // 세션 상태 저장
  async saveSessionState({ conversationId, messages, metadata }) {
    const filename = `${conversationId}-active.json`;

    await fs.writeFile(
      path.join(this.sessionPath, filename),
      JSON.stringify({
        conversationId,
        messages,
        metadata,
        savedAt: Date.now()
      })
    );
  }

  // 세션 복원
  async restoreSession(conversationId) {
    const filename = `${conversationId}-active.json`;
    const sessionFile = path.join(this.sessionPath, filename);

    if (!await fs.exists(sessionFile)) {
      return null;
    }

    const session = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
    const timeSince = Date.now() - session.metadata.lastMessageTime;

    // 시간 인지 재개 프롬프트
    const resumePrompt = this.generateResumePrompt(timeSince);

    return {
      messages: session.messages,
      metadata: session.metadata,
      resumePrompt
    };
  }

  // 재개 프롬프트 생성 (시간 인지)
  generateResumePrompt(timeSinceMs) {
    const minutes = Math.floor(timeSinceMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `[${days}일 전 대화 재개]`;
    } else if (hours > 0) {
      return `[${hours}시간 전 대화 재개]`;
    } else if (minutes > 5) {
      return `[${minutes}분 전 대화 재개]`;
    } else {
      return null; // 최근 대화는 프롬프트 불필요
    }
  }

  // 만료된 세션 정리 (30일)
  async cleanup() {
    const files = await fs.readdir(this.sessionPath);

    for (const file of files) {
      if (!file.endsWith('-active.json')) continue;

      const filePath = path.join(this.sessionPath, file);
      const session = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const age = Date.now() - session.savedAt;

      // 30일 경과 시 아카이브
      if (age > 30 * 24 * 60 * 60 * 1000) {
        await middleTermMemory.archiveToLongTerm(filePath);
      }
    }
  }
}
```

### 사용 예시

```javascript
// 대화 시작 시
const session = await sessionContinuity.restoreSession('main-conversation');

if (session) {
  // 기존 세션 복원
  shortTermMemory.restore(session.messages);
  personalityCore.restoreContext(session.metadata);

  if (session.resumePrompt) {
    // "[3시간 전 대화 재개]" 같은 프롬프트 추가
    systemPrompts.unshift(session.resumePrompt);
  }
} else {
  // 새 세션 시작
  sessionContinuity.startAutoSave('main-conversation');
}

// 대화 종료 시
await sessionContinuity.saveSessionState({
  conversationId: 'main-conversation',
  messages: shortTermMemory.getAll(),
  metadata: getCurrentMetadata()
});
```

---

## 🔗 에이전트 체이닝

### 기본 구조

```javascript
// soul/utils/agent-chain.js

class Agent {
  constructor({ name, systemPrompt, model, tools = [] }) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.tools = tools;
  }

  async execute(input, context = {}) {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...context.previousResults || [],
      { role: 'user', content: input }
    ];

    const response = await aiService.chat({
      model: this.model,
      messages,
      tools: this.tools
    });

    return {
      agent: this.name,
      output: response.content,
      metadata: {
        model: this.model,
        tokens: response.usage
      }
    };
  }
}
```

### 순차 체인

```javascript
class SequentialChain {
  constructor(agents) {
    this.agents = agents;
  }

  async execute(input, options = {}) {
    const results = [];
    let currentInput = input;

    for (const agent of this.agents) {
      const result = await agent.execute(currentInput, {
        previousResults: options.passContext ? results : []
      });

      results.push(result);
      currentInput = result.output; // 다음 에이전트에 전달
    }

    // 중간 결과 제거 옵션
    if (options.excludeIntermediateResults) {
      return results[results.length - 1]; // 마지막 결과만
    }

    return results;
  }
}
```

### 병렬 체인

```javascript
class ParallelChain {
  constructor(agents) {
    this.agents = agents;
  }

  async execute(input) {
    // 모든 에이전트 동시 실행
    const promises = this.agents.map(agent =>
      agent.execute(input)
    );

    const results = await Promise.all(promises);

    // 결과 통합
    return {
      input,
      results,
      summary: this.summarizeResults(results)
    };
  }

  summarizeResults(results) {
    return results.map(r =>
      `[${r.agent}]: ${r.output}`
    ).join('\n\n');
  }
}
```

### Tool 레이어

```javascript
class ToolLayer {
  constructor(tools) {
    this.tools = tools; // [{ name, description, function }]
  }

  getToolDefinitions() {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  async executeToolCall(toolName, args) {
    const tool = this.tools.find(t => t.name === toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    return await tool.function(args);
  }
}
```

### 실제 사용 예시

```javascript
// 복잡한 코드 분석 작업
const codeAnalysisChain = new SequentialChain([
  new Agent({
    name: 'scanner',
    systemPrompt: '코드를 읽고 구조를 파악하라',
    model: 'claude-3-haiku' // 빠른 모델
  }),
  new Agent({
    name: 'analyzer',
    systemPrompt: '문제점, 개선점, 보안 이슈를 찾아라',
    model: 'claude-3-5-sonnet' // 분석용
  }),
  new Agent({
    name: 'architect',
    systemPrompt: '리팩토링 계획을 세워라',
    model: 'claude-3-opus' // 고급 설계
  })
]);

const result = await codeAnalysisChain.execute(userCode, {
  passContext: true, // 이전 에이전트 결과 전달
  excludeIntermediateResults: true // 최종 결과만
});

// 병렬 코드 리뷰
const codeReviewChain = new ParallelChain([
  new Agent({
    name: 'security',
    systemPrompt: '보안 취약점을 찾아라',
    model: 'claude-3-5-sonnet'
  }),
  new Agent({
    name: 'performance',
    systemPrompt: '성능 문제를 찾아라',
    model: 'claude-3-5-sonnet'
  }),
  new Agent({
    name: 'style',
    systemPrompt: '코드 스타일과 가독성을 검토하라',
    model: 'claude-3-haiku'
  })
]);

const reviews = await codeReviewChain.execute(userCode);
// → 3가지 관점의 리뷰를 동시에 받음
```

---

## ✅ 구현 상태

### Phase 5.4: 영속적 대화방 시스템 ✅ (완료)

#### 5.4.1 대화 처리 파이프라인 ✅
- [x] `buildConversationMessages()` - 메시지 배열 구성
- [x] `getMessagesWithinTokenLimit()` - 역순 메시지 추가
- [x] `handleResponse()` - 응답 처리 및 저장
- [x] 시스템 프롬프트 동적 구성
- [x] 자동 메모리 주입
- [x] 80% 도달시 자동 압축

**파일**: `soul/utils/conversation-pipeline.js`

#### 5.4.2 토큰 폭발 방지 ✅
- [x] `TokenSafeguard` 클래스 - 실시간 모니터링
- [x] `emergencyCompress()` - 95% 강제 압축
- [x] `truncateToolOutput()` - Tool 출력 500 토큰 제한
- [x] Vision 토큰 계산
- [x] `ManagedTokenizer` - 5분/25회 자동 초기화
- [x] 단일 메시지 10% 제한

**파일**: `soul/utils/token-safeguard.js`

#### 5.4.3 에이전트 체이닝 ✅
- [x] `Agent` 클래스
- [x] `SequentialChain` - 순차 실행
- [x] `ParallelChain` - 병렬 실행
- [x] `ToolLayer`

**파일**: `soul/utils/agent-chain.js`

#### 5.4.4 메모리 계층 ✅
- [x] `ShortTermMemory` - 최근 50개 메시지
- [x] `MiddleTermMemory` - 세션 요약 (파일)
- [x] `LongTermMemory` - 아카이브 (MongoDB)
- [x] `MemoryManager` - 통합 관리
- [x] 자동 계층 이동

**파일**: `soul/utils/memory-layers.js`

#### 5.4.5 세션 연속성 ✅
- [x] `saveSessionState()` - 세션 상태 저장
- [x] `restoreSession()` - 세션 복원
- [x] `generateResumePrompt()` - 재개 프롬프트
- [x] 시간 인지 재개 메시지
- [x] 자동 저장 (1분 간격)
- [x] 세션 만료 관리 (30일)

**파일**: `soul/utils/session-continuity.js`

### Phase 8: 스마트 라우팅 ✅ (완료)

#### 8.1 스마트 라우터 ✅
- [x] `SmartRouter` 클래스
- [x] `analyzeTask()` - 복잡도 분석 (0-10)
- [x] `detectTaskType()` - 11개 태스크 유형 탐지
- [x] `selectModel()` - Haiku/Sonnet/Opus 자동 선택
- [x] 비용 추정
- [x] 라우팅 통계

**파일**: `soul/utils/smart-router.js`

#### 8.2 단일 인격 시스템 ✅
- [x] `PersonalityCore` 클래스
- [x] `PERSONALITY_PROFILE` (인격 정의)
- [x] `generateSystemPrompt()` - 일관된 프롬프트
- [x] `validateResponse()` - 응답 일관성 검증
- [x] `handleModelSwitch()` - 모델 전환 시 컨텍스트 유지
- [x] `trackTopic()` - 대화 주제 추적
- [x] `setUserPreference()` - 사용자 선호도

**파일**: `soul/utils/personality-core.js`

#### 8.3 API & 테스트 ✅
- [x] `POST /api/chat` - 스마트 라우팅 통합
- [x] `POST /api/chat/analyze-task`
- [x] `GET /api/chat/routing-stats`
- [x] `GET /api/chat/models`, `personality`
- [x] `POST /api/chat/personality/preference`
- [x] 통합 테스트 완료
- [x] `SMART_ROUTING.md` 문서화

**파일**: `soul/routes/chat.js`

---

## 🎓 핵심 학습 포인트

### 1. 역순 메시지 추가가 왜 중요한가?

**문제**:
```javascript
// 순방향: 오래된 것부터 추가
messages = [msg1(100), msg2(150), ..., msg50(200)];
// 토큰 제한: 1000

// msg1~msg4 추가 → 600 토큰
// msg5 추가 시 → 800 토큰 (OK)
// msg6 추가 시 → 1000 토큰 (제한 도달)
// 결과: msg7~msg50 (최신 메시지들) 제외됨! ❌
```

**해결**:
```javascript
// 역순: 최신부터 추가
reversed = [msg50(200), msg49(180), ..., msg1(100)];

// msg50 추가 → 200 토큰 (최신!)
// msg49 추가 → 380 토큰
// ...
// msg46 추가 → 980 토큰
// msg45 추가 시 → 1180 토큰 (제한 초과)
// 결과: msg50~msg46 (최신 5개) 보존됨! ✅
```

### 2. 맥락 감지가 왜 필요한가?

**없을 때**:
```
User: "저번에 얘기했던 React 프로젝트 어떻게 됐어?"
AI: "무슨 React 프로젝트를 말씀하시는 건가요?" ❌
```

**있을 때**:
```
User: "저번에 얘기했던 React 프로젝트 어떻게 됐어?"

1. Trigger 감지: "저번에" (시간 참조)
2. Keyword 추출: ["React", "프로젝트"]
3. 장기 메모리 검색:
   - 2026-01-15: React 프로젝트 시작
   - 2026-01-16: 라우팅 문제 해결
   - 2026-01-17: Zustand 도입
4. 시스템 프롬프트 주입:
   "과거 대화:
    - 1월 15일: React + Vite 프로젝트 시작
    - 1월 16일: React Router v6 문제 해결
    - 1월 17일: 상태 관리 Zustand 선택"

AI: "React 프로젝트 말이죠! 지난번에 React Router 문제 해결하고
     Zustand 도입하기로 했었는데, 잘 되고 있나요?" ✅
```

### 3. 단일 인격이 왜 중요한가?

**❌ 잘못된 방식 (모드 분리)**:
```javascript
// 업무 모드
systemPrompt = "You are a professional work assistant.
                Be formal and concise.";

// 상담 모드
systemPrompt = "You are a counselor.
                Be empathetic and supportive.";

// 결과:
User: "일 끝났어" (업무 모드 → 상담 모드 전환)
AI의 말투가 갑자기 바뀜 → 어색함! ❌
```

**✅ 올바른 방식 (단일 인격)**:
```javascript
// 항상 동일한 인격
systemPrompt = personalityCore.generatePrompt({
  // 관계 기반
  conversationHistory: 156,
  recentTopics: ['업무', '스트레스', '프로젝트'],
  userPreference: { tone: 'friendly', depth: 'adaptive' }
});

// → "Continue our conversation naturally.
//    We've discussed work stress and your project recently."

// 결과:
User: "일 끝났어"
AI: "오늘 프로젝트 마무리했구나! 어땠어?" ✅
// 자연스럽게 업무 → 감정 전환
```

### 4. 메모리 계층이 왜 필요한가?

**단일 저장소 문제**:
```javascript
// 모든 메시지를 MongoDB에 저장
await db.save(message); // 매번 DB I/O → 느림! ❌
```

**3단계 계층 장점**:
```javascript
// 단기: 메모리 (즉시)
shortTerm.add(message); // 빠름! ✅

// 중기: 파일 (빠름)
middleTerm.saveSummary(); // DB보다 빠름

// 장기: MongoDB (느림, 선택적)
longTerm.archive(); // 필요할 때만
```

**성능 비교**:
- 단기 메모리 접근: 0.01ms
- 중기 파일 접근: 1ms
- 장기 DB 접근: 10~100ms

---

## 📞 인수인계 체크리스트

### 반드시 이해해야 할 핵심 개념

- [ ] **역순 메시지 추가**: 왜 최신부터 추가하는가?
- [ ] **토큰 폭발 버그**: 3가지 원인과 해결책
- [ ] **맥락 감지 파이프라인**: 트리거 → 키워드 → 검색 → 주입
- [ ] **메모리 3단계 계층**: 단기 → 중기 → 장기 흐름
- [ ] **세션 연속성**: 자동 저장, 시간 인지 재개
- [ ] **단일 인격 시스템**: 모델 전환해도 일관된 인격 유지
- [ ] **스마트 라우팅**: 작업별 최적 모델 자동 선택

### 코드 확인 사항

- [ ] `soul/utils/conversation-pipeline.js` 읽어보기
- [ ] `soul/utils/token-safeguard.js` 읽어보기
- [ ] `soul/utils/memory-layers.js` 읽어보기
- [ ] `soul/utils/session-continuity.js` 읽어보기
- [ ] `soul/utils/personality-core.js` 읽어보기
- [ ] `soul/routes/chat.js` 메인 흐름 파악

### 테스트 해볼 것

- [ ] 일반 대화 → 맥락 유지 확인
- [ ] "저번에 얘기했던..." → 메모리 자동 주입 확인
- [ ] 토큰 80% 도달 → 자동 압축 확인
- [ ] 세션 종료 후 재개 → 시간 인지 프롬프트 확인
- [ ] 다양한 작업 → 모델 자동 선택 확인

---

## 📚 추가 자료

### 관련 문서
- `/workspaces/.soul/TODO.md` - 전체 프로젝트 진행 상황
- `/workspaces/.soul/docs/SMART_ROUTING.md` - 스마트 라우팅 상세
- `/home/codespace/.claude/plans/atomic-plotting-diffie.md` - Phase 5.4 계획

### 참고한 LibreChat 파일
- `/tmp/api/app/clients/BaseClient.js` - 메시지 구성 로직
- `/tmp/api/app/clients/AnthropicClient.js` - Claude 특화 구현
- `/tmp/packages/api/src/agents/` - 에이전트 체이닝

### 핵심 유틸리티 위치
```
soul/utils/
├── conversation-pipeline.js   # 대화 처리 파이프라인
├── token-safeguard.js         # 토큰 폭발 방지
├── agent-chain.js             # 에이전트 체이닝
├── memory-layers.js           # 메모리 계층
├── session-continuity.js      # 세션 연속성
├── smart-router.js            # 스마트 라우팅
├── personality-core.js        # 단일 인격
├── context-detector.js        # 맥락 감지 (Phase 4)
├── token-counter.js           # 토큰 계산 (Phase 5.1)
└── context-compressor.js      # 압축 (Phase 5.2)
```

---

## 🎯 마지막 당부

### 이 기술의 핵심은 "레이어"입니다

순수 AI API는 단순히 텍스트를 받아 텍스트를 반환할 뿐입니다.
LibreChat이 뛰어난 이유는 그 위에 7개의 기능 레이어를 쌓았기 때문입니다.

```
Layer 7: 단일 인격 (일관성)
Layer 6: 맥락 감지 (기억)
Layer 5: 세션 연속성 (영속성)
Layer 4: 메모리 계층 (효율성)
Layer 3: 메시지 구성 (지능성)
Layer 2: 토큰 관리 (안정성)
Layer 1: 스마트 라우팅 (최적화)
────────────────────────────
Layer 0: AI API (기본 능력)
```

**각 레이어를 빼면**:
- Layer 1 없음 → 토큰 폭발
- Layer 2 없음 → 최신 메시지 손실
- Layer 3 없음 → 메모리 부족
- Layer 4 없음 → 대화 끊김
- Layer 5 없음 → 과거 기억 못함
- Layer 6 없음 → 인격 분열
- Layer 7 없음 → 비효율

**모든 레이어가 함께 작동해야** 사람같은 대화가 가능합니다.

---

**작성자**: Claude Sonnet 4.5
**검토 필요**: Phase 5.4, Phase 8 구현 코드
**업데이트 예정**: Phase 9 (UI) 완성 후 프론트엔드 연동 섹션 추가
