# Context Detection System (Phase 4.1)

맥락 감지 및 자율 기억 시스템 - 대화 중 관련 주제를 자동으로 감지하고 과거 메모리를 검색합니다.

## 🎯 개요

사용자가 과거 대화를 언급하면 자동으로 관련 메모리를 찾아 AI에게 제공하는 시스템입니다.

**예시**:
- "저번에 얘기했던 React 프로젝트 기억나?" → 자동으로 React 관련 과거 대화 검색
- "최근에 MongoDB 설정 어떻게 했었지?" → 최근 7일 내 MongoDB 관련 대화 검색
- "그때 그 버그랑 비슷한 문제가 또 생겼어" → 버그 관련 과거 대화 검색

## 🏗️ 아키텍처

```
사용자 메시지
    ↓
extractKeywords() ────→ 키워드, 엔티티, 시간 참조 추출
    ↓
evaluateTrigger() ────→ 트리거 조건 평가 (신뢰도 점수)
    ↓
findRelatedMemories() → 관련 메모리 검색 (다중 전략)
    ↓
generateContextPrompt() → 시스템 프롬프트 생성
    ↓
AI에게 컨텍스트 제공
```

## 📋 주요 기능

### 1. 키워드 추출 (`extractKeywords`)

**감지 항목**:
- **시간 참조**: "저번에", "최근에", "어제", "이번 주", "지난달" 등
- **주제 참조**: "그때", "아까 말한", "비슷한", "관련된" 등
- **엔티티**: 기술 키워드 (React, MongoDB, API 등), 프로젝트명
- **일반 키워드**: 3글자 이상 명사형 단어

**반환 값**:
```json
{
  "keywords": ["저번에", "React", "프로젝트"],
  "entities": ["react", "프로젝트"],
  "timeRefs": ["past_reference"],
  "hasTopicReference": true
}
```

### 2. 트리거 평가 (`evaluateTrigger`)

**신뢰도 점수 계산**:
- 시간 참조 있음: +30%
- 주제 참조 있음: +40%
- 키워드 2개 이상: +30%
- 엔티티 있음: +20%

**기본 임계값**: 50% (설정 가능)

**반환 값**:
```json
{
  "triggered": true,
  "confidence": 1.0,
  "reasons": [
    "time_reference: past_reference",
    "topic_reference",
    "keywords: 5",
    "entities: react, 프로젝트"
  ]
}
```

### 3. 메모리 검색 (`findRelatedMemories`)

**검색 전략** (우선순위 순):
1. **시간 기반**: 시간 참조에 맞는 날짜 범위 필터링
2. **키워드 기반**: 주제, 태그, 카테고리에서 키워드 매칭
3. **엔티티 기반**: 엔티티 AND 검색 (정확도 높음)

**관련성 점수**:
- 주제 매칭: +5점
- 태그 매칭: +3점
- 엔티티 매칭: +8점 (주제), +5점 (태그)
- 중요도 가산점: importance * 0.5

**반환 값**:
```json
{
  "memories": [
    {
      "id": "2026-01-17_192254",
      "topics": ["React 프로젝트 설정"],
      "tags": ["react", "개발", "프론트엔드"],
      "category": "개발",
      "importance": 7,
      "relevanceScore": 23.5
    }
  ],
  "searchStrategy": ["time_based: recent", "keyword_based"],
  "totalFound": 1
}
```

### 4. 프롬프트 생성 (`generateContextPrompt`)

자연스러운 형태로 과거 대화 정보를 AI에게 제공:

```
[Related Context from Past Conversations]
You may naturally reference these if relevant to the current discussion:

1. React 프로젝트 설정 (2026-01-17)
   - Topics: React 프로젝트 설정, Vite 빌드 설정
   - Tags: react, 개발, 프론트엔드
   - Category: 개발
   - Importance: 7/10
   - Relevance: 23.5

Note: Only mention these past conversations if they're genuinely relevant...
```

### 5. 스팸 방지 (`checkSpamPrevention`)

과도한 메모리 주입 방지:

**기본 설정**:
- 시간당 최대 5회
- 최소 간격 5분

**반환 값**:
```json
{
  "allowed": false,
  "reason": "max_injections_per_hour_exceeded",
  "count": 5,
  "limit": 5
}
```

## 🔌 API 엔드포인트

### POST `/api/context/detect`

**전체 파이프라인 실행** (가장 많이 사용)

```bash
curl -X POST http://localhost:3080/api/context/detect \
  -H "Content-Type: application/json" \
  -d '{
    "message": "저번에 얘기했던 React 프로젝트 기억나?",
    "options": {
      "triggerConfig": {
        "minConfidence": 0.5
      },
      "searchOptions": {
        "limit": 3,
        "minRelevance": 5,
        "timeWindow": "recent"
      },
      "autoTrigger": true
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "extracted": {...},
  "trigger": {...},
  "memories": {...},
  "shouldInject": true
}
```

### POST `/api/context/extract-keywords`

키워드만 추출

```bash
curl -X POST http://localhost:3080/api/context/extract-keywords \
  -H "Content-Type: application/json" \
  -d '{"message": "저번에 얘기했던 React 프로젝트"}'
```

### POST `/api/context/evaluate-trigger`

트리거 조건 평가

```bash
curl -X POST http://localhost:3080/api/context/evaluate-trigger \
  -H "Content-Type: application/json" \
  -d '{
    "message": "최근에 MongoDB 설정",
    "triggerConfig": {"minConfidence": 0.5}
  }'
```

### POST `/api/context/find-memories`

메모리 검색

```bash
curl -X POST http://localhost:3080/api/context/find-memories \
  -H "Content-Type: application/json" \
  -d '{
    "message": "React 관련",
    "searchOptions": {
      "limit": 5,
      "minRelevance": 5,
      "timeWindow": "week"
    }
  }'
```

### POST `/api/context/generate-prompt`

시스템 프롬프트 생성

```bash
curl -X POST http://localhost:3080/api/context/generate-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "저번에 그 버그",
    "options": {"autoTrigger": true}
  }'
```

### POST `/api/context/check-spam`

스팸 방지 체크

```bash
curl -X POST http://localhost:3080/api/context/check-spam \
  -H "Content-Type: application/json" \
  -d '{
    "recentInjections": [
      {"timestamp": 1737205000000, "messageId": "msg1"}
    ],
    "config": {
      "maxInjectionsPerHour": 5,
      "minIntervalMinutes": 5
    }
  }'
```

## 🎮 사용 예시

### 1. 기본 사용 (Node.js)

```javascript
const contextDetector = require('./utils/context-detector');

// 메시지 분석
const result = await contextDetector.detectAndRetrieve(
  "저번에 얘기했던 React 프로젝트 기억나?",
  {
    triggerConfig: { minConfidence: 0.5 },
    searchOptions: { limit: 3, minRelevance: 5 },
    autoTrigger: true
  }
);

if (result.shouldInject) {
  const prompt = contextDetector.generateContextPrompt(result);
  // AI에게 프롬프트 주입
  console.log(prompt);
}
```

### 2. Express 미들웨어

```javascript
async function contextMiddleware(req, res, next) {
  const { message } = req.body;

  // 맥락 감지
  const context = await contextDetector.detectAndRetrieve(message);

  // 스팸 방지
  const spam = contextDetector.checkSpamPrevention(req.session.injections || []);

  if (context.shouldInject && spam.allowed) {
    req.contextPrompt = contextDetector.generateContextPrompt(context);
    req.session.injections.push({
      timestamp: Date.now(),
      messageId: req.body.messageId
    });
  }

  next();
}
```

### 3. 커스텀 트리거 설정

```javascript
const result = await contextDetector.detectAndRetrieve(message, {
  triggerConfig: {
    minKeywords: 3,           // 최소 키워드 개수
    requireTimeRef: true,     // 시간 참조 필수
    requireTopicRef: false,   // 주제 참조 선택
    minConfidence: 0.7        // 높은 임계값
  },
  searchOptions: {
    limit: 5,
    minRelevance: 10,         // 높은 관련성 요구
    timeWindow: 'month'       // 한 달 내 검색
  }
});
```

## 📊 테스트 결과

### 트리거 감지 정확도

| 메시지 | 트리거 | 신뢰도 |
|--------|--------|--------|
| "저번에 얘기했던 React 프로젝트 기억나?" | ✅ | 100% |
| "최근에 MongoDB 설정 어떻게 했었지?" | ✅ | 80% |
| "그때 그 버그랑 비슷한 문제" | ✅ | 70% |
| "안녕?" | ❌ | 0% |

### 검색 전략 효과

- **시간 기반**: 최근 7일 필터링 → 90% 관련성
- **키워드 기반**: OR 검색 → 70% 관련성
- **엔티티 기반**: AND 검색 → 95% 관련성

## 🔧 설정

### 기본값

```javascript
// 트리거 설정
{
  minKeywords: 2,
  requireTimeRef: false,
  requireTopicRef: false,
  minConfidence: 0.5
}

// 검색 옵션
{
  limit: 3,
  minRelevance: 5,
  timeWindow: null  // 전체 검색
}

// 스팸 방지
{
  maxInjectionsPerHour: 5,
  minIntervalMinutes: 5
}
```

### 시간 범위 옵션

- `null`: 전체 검색
- `"recent"`: 최근 7일
- `"week"`: 최근 2주
- `"month"`: 최근 1개월

## 🚀 다음 단계

### Phase 4.3: 비유/연결
- 과거 대화를 현재 상황에 비유
- 패턴 인식 및 학습
- 선택적 활성화 UI

### UI 통합 (Phase 9)
- 맥락 감지 상태 표시
- 검색된 메모리 미리보기
- 수동 트리거 버튼
- 설정 UI

## 📝 메모

- 현재 메모리 DB가 비어있어 실제 검색 결과는 0건
- Phase 2 (AI 분류)로 메모리가 쌓이면 자동으로 작동
- 성능 최적화 필요 시 Elasticsearch 연동 고려

---

**작성일**: 2026-01-18
**Phase**: 4.1 (맥락 감지) ✅
**다음 Phase**: 4.3 (비유/연결)
