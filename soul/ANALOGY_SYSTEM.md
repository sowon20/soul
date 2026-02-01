# 비유/연결 시스템 (Analogy System)

> **Phase 4.3**: 과거 대화에서 비슷한 패턴/상황을 찾아 자연스럽게 참조하는 시스템

---

## 📋 개요

비유/연결 시스템은 현재 대화 내용을 분석하여 과거 대화에서 비슷한 문제, 해결책, 결과 패턴을 찾아냅니다.

**핵심 기능**:
- 문제/해결/결과 패턴 자동 감지
- 유사도 기반 비유 점수 계산
- 선택적 활성화 (불필요한 검색 방지)
- 자연스러운 참조 프롬프트 생성

---

## 🏗️ 아키텍처

### 파일 구조

```
soul/
├── utils/
│   └── analogy-finder.js      # 비유 검색 로직
└── routes/
    └── analogy.js              # API 엔드포인트
```

### 처리 파이프라인

```
사용자 메시지
    ↓
1. 패턴 감지 (detectPatterns)
   - 문제 패턴 ("문제", "버그", "에러")
   - 해결 패턴 ("해결", "수정", "변경")
   - 결과 패턴 ("성공", "실패", "완료")
    ↓
2. 활성화 체크 (shouldActivate)
   - 최소 패턴 매칭 확인
   - 키워드 개수 확인
   - 활성화 여부 결정
    ↓
3. 비유 검색 (findAnalogies)
   - 문제 키워드 기반 검색
   - 엔티티 기반 검색
   - 중복 제거
    ↓
4. 점수 계산 (calculateAnalogyScore)
   - 비슷한 문제: +20점
   - 비슷한 해결책: +15점
   - 공통 맥락: +8점
   - 유사도 점수 반영
    ↓
5. 프롬프트 생성 (generateAnalogyPrompt)
   - 자연스러운 참조 문구
   - 비유 타입별 설명
   - AI에게 제공
```

---

## 🔍 패턴 감지 상세

### 문제 패턴

```javascript
const problemPatterns = [
  /문제|이슈|버그|에러|오류|실패|안\s*되|작동.*안/gi,
  /어떻게|방법|해결|고치|수정/gi,
  /왜|이유|원인/gi
];
```

**예시**:
- "MongoDB 연결 문제 해결해야 해" → 문제 감지 ✅
- "React 렌더링 버그가 있어" → 문제 감지 ✅
- "왜 안 되지?" → 문제 감지 ✅

### 해결책 패턴

```javascript
const solutionPatterns = [
  /해결|고침|수정|변경|적용/gi,
  /방법은|~하면|~해서/gi,
  /시도|테스트|확인/gi
];
```

**예시**:
- "캐싱으로 해결했어" → 해결 감지 ✅
- "설정 변경하면 돼" → 해결 감지 ✅

### 결과 패턴

```javascript
const outcomePatterns = [
  /결과|성공|완료|해결.*됨/gi,
  /작동|동작|실행.*됨/gi,
  /실패|안.*됨/gi
];
```

---

## 📊 비유 점수 계산

### 가중치 시스템

| 요소 | 가중치 | 설명 |
|------|--------|------|
| similarProblem | 20 | 비슷한 문제/상황 |
| similarSolution | 15 | 비슷한 해결책 |
| similarOutcome | 10 | 비슷한 결과 |
| commonContext | 8 | 공통 맥락 (엔티티 매칭) |
| temporalPattern | 5 | 시간 패턴 (미구현) |
| Similarity Score | 0-15 | 기존 유사도 점수 (30% 반영) |

### 점수 예시

**현재 메시지**: "React 렌더링 문제 해결해야 해"

**과거 대화 1**: "React 최적화 - useMemo 사용"
- similarProblem: +20 (React 매칭)
- commonContext: +8 (React 엔티티)
- similarSolution: +15 (최적화 키워드)
- **총점: 43점** → confidence: 0.86

**과거 대화 2**: "MongoDB 인덱스 설정"
- (매칭 없음)
- **총점: 3점** → confidence: 0.06 (필터링됨)

---

## 🔄 선택적 활성화

비유 검색은 필요할 때만 활성화됩니다.

### 활성화 조건

1. **패턴 매칭**: 최소 1개 이상의 패턴 (문제/해결/결과)
2. **키워드**: 최소 2개 이상의 키워드
3. **설정**: `enableAnalogySearch: true`

### 활성화 예시

```javascript
// ✅ 활성화
"MongoDB 연결 문제 해결 방법"
→ 패턴: 문제 ✅, 해결 ✅
→ 키워드: MongoDB, 연결, 문제, 해결 (4개) ✅

// ❌ 비활성화
"안녕하세요"
→ 패턴: 없음 ❌
→ 키워드: 1개 ❌
```

---

## 🚀 API 사용법

### 1. 전체 파이프라인 (추천)

```bash
curl -X POST http://localhost:3080/api/analogy/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "React 렌더링 문제 해결 방법 찾아야 해",
    "options": {
      "limit": 3,
      "minScore": 15,
      "includeContext": true
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "activated": true,
  "analogies": [
    {
      "id": "conv_123",
      "topics": ["React 최적화"],
      "analogyScore": 35,
      "analogyType": "similar_problem",
      "confidence": 0.7,
      "date": "2026-01-15T10:30:00Z"
    }
  ],
  "totalFound": 1,
  "patterns": {
    "hasProblem": true,
    "hasSolution": true,
    "hasOutcome": false,
    "problemKeywords": ["React"],
    "solutionKeywords": []
  },
  "contextPrompt": "[Analogies from Past Conversations]..."
}
```

### 2. 패턴 감지만

```bash
curl -X POST http://localhost:3080/api/analogy/detect-patterns \
  -H "Content-Type: application/json" \
  -d '{"message":"MongoDB 연결 문제 해결해야 해"}'
```

**Response**:
```json
{
  "success": true,
  "patterns": {
    "hasProblem": true,
    "hasSolution": true,
    "hasOutcome": false,
    "problemKeywords": ["MongoDB"],
    "solutionKeywords": []
  }
}
```

### 3. 활성화 체크

```bash
curl -X POST http://localhost:3080/api/analogy/should-activate \
  -H "Content-Type: application/json" \
  -d '{"message":"저번에 비슷한 Docker 문제 있었는데"}'
```

**Response**:
```json
{
  "success": true,
  "activated": true,
  "reason": "pattern_detected",
  "patternCount": 2,
  "patterns": {
    "hasProblem": true,
    "hasSolution": false,
    "hasOutcome": false
  }
}
```

---

## 🎭 비유 타입

시스템이 자동으로 분류하는 비유 타입:

| 타입 | 설명 | 예시 |
|------|------|------|
| `similar_problem` | 비슷한 문제/상황 | "저번에도 React 렌더링 문제 있었지" |
| `similar_solution` | 비슷한 해결책 | "캐싱으로 해결했던 것 같은데" |
| `similar_outcome` | 비슷한 결과 | "그때도 성공했었어" |
| `general_context` | 일반 맥락 | "React 관련 대화" |

---

## 💬 생성되는 프롬프트 예시

```
[Analogies from Past Conversations]
You may reference these similar past situations if relevant:

1. React 최적화 (2026-01-15)
   - Type: similar problem
   - Relevance: 70%
   - Topics: React 최적화, useMemo, 성능 개선
   - Tags: react, performance, optimization
   - Category: 개발

2. MongoDB 인덱싱 (2026-01-12)
   - Type: similar solution
   - Relevance: 55%
   - Topics: MongoDB, 인덱스, 쿼리 최적화
   - Tags: mongodb, database, indexing
   - Category: 개발

Note: Use natural phrasing like:
- "This reminds me of when we..."
- "Similar to that time when..."
- "We had a similar situation before..."
Only mention if genuinely helpful to the current discussion.
```

---

## ⚙️ 설정

### 기본 설정

```javascript
{
  minAnalogyScore: 15,       // 최소 점수
  minConfidence: 0.6,        // 최소 신뢰도
  enableAnalogySearch: true, // 비유 검색 활성화
  maxAnalogiesPerQuery: 3,   // 최대 비유 개수
  weights: {
    similarProblem: 20,
    similarSolution: 15,
    similarOutcome: 10,
    commonContext: 8,
    temporalPattern: 5
  }
}
```

### 설정 변경

```bash
curl -X PATCH http://localhost:3080/api/analogy/config \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "maxAnalogiesPerQuery": 5,
      "minAnalogyScore": 10
    }
  }'
```

---

## 🧪 테스트 결과

### 패턴 감지

```bash
# 입력
"MongoDB 연결 문제 해결 방법 찾아야 해"

# 결과
✅ hasProblem: true
✅ hasSolution: true
❌ hasOutcome: false
✅ problemKeywords: ["MongoDB"]
```

### 활성화 체크

```bash
# 입력
"저번에 비슷한 Docker 문제 있었는데 어떻게 해결했었지?"

# 결과
✅ activated: true
✅ reason: "pattern_detected"
✅ patternCount: 2
✅ patterns: {hasProblem: true, hasSolution: true}
```

### 비유 분석

```bash
# 입력
"React 렌더링 문제 해결해야 해. 최적화 방법 찾아봐야겠어."

# 결과
✅ success: true
✅ activated: true
✅ analogies: [] (메모리 DB 비어있음)
✅ patterns 정상 감지
✅ contextPrompt: null (비유 없음)
```

---

## 🔗 통합 사례

### 대화 시스템과 통합

```javascript
// 1. 사용자 메시지 수신
const userMessage = "저번에 얘기했던 React 문제 어떻게 해결했었지?";

// 2. 비유 분석 (자동)
const analogyResult = await fetch('/api/analogy/analyze', {
  method: 'POST',
  body: JSON.stringify({ message: userMessage })
});

// 3. 활성화되었다면 프롬프트 주입
if (analogyResult.activated && analogyResult.contextPrompt) {
  systemPrompt += analogyResult.contextPrompt;
}

// 4. AI에게 전송
const aiResponse = await callAI({
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }]
});
```

---

## 📈 성능 최적화

### 검색 전략

1. **문제 키워드 우선**: 문제 관련 키워드로 먼저 검색 (limit * 3)
2. **엔티티 검색**: 기술 스택, 프로젝트명 등 엔티티로 검색 (limit * 2)
3. **중복 제거**: 같은 대화가 여러 번 매칭되지 않도록 필터링
4. **점수 기반 정렬**: 비유 점수 높은 순으로 정렬
5. **상위 N개 반환**: 설정된 limit만큼만 반환

### 캐싱 전략 (추후 구현)

- 자주 사용되는 패턴 캐싱
- 비유 점수 캐싱
- 검색 결과 캐싱 (5분)

---

## 🛠️ 확장 가능성

### Phase 4.4 고려사항

1. **시간 패턴 분석**: 주기적으로 발생하는 문제 감지
2. **학습 기반 개선**: 사용자 피드백으로 가중치 자동 조정
3. **다국어 지원**: 영어 패턴 추가
4. **시각화**: 비유 관계 그래프

---

## 📝 주요 파일

| 파일 | 라인 수 | 설명 |
|------|---------|------|
| `utils/analogy-finder.js` | ~350 | 비유 검색 로직 |
| `routes/analogy.js` | ~160 | API 엔드포인트 |

---

## ✅ 완료 상태

- [x] 패턴 감지 (문제/해결/결과)
- [x] 비유 점수 계산
- [x] 선택적 활성화
- [x] 비유 검색
- [x] 프롬프트 생성
- [x] API 엔드포인트 6개
- [x] 통합 테스트
- [x] 문서화

---

**작성일**: 2026-01-18
**버전**: 1.0
**상태**: Phase 4.3 완료 ✅
