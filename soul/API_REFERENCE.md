# Soul Project - API Reference

모든 구현된 API 엔드포인트 참조 문서

**Base URL**: `http://localhost:3080/api`

---

## 📚 목차

1. [헬스 체크](#헬스-체크)
2. [메모리 시스템 (Phase 1)](#메모리-시스템)
3. [AI 모델 관리 (Phase 2)](#ai-모델-관리)
4. [검색 시스템 (Phase 3)](#검색-시스템)
5. [맥락 감지 (Phase 4)](#맥락-감지)
6. [컨텍스트 관리 (Phase 5)](#컨텍스트-관리)

---

## 헬스 체크

### GET `/health`
서버 상태 확인

**Response**:
```json
{
  "status": "ok",
  "service": "soul-server"
}
```

---

## 메모리 시스템

### POST `/memory/archive`
대화를 메모리로 저장

**Body**:
```json
{
  "conversationId": "main-conversation",
  "messages": [{"role": "user", "content": "..."}],
  "metadata": {},
  "autoAnalyze": true
}
```

---

## AI 모델 관리

### GET `/ai-models/services`
사용 가능한 AI 서비스 목록

**Response**:
```json
{
  "success": true,
  "services": [
    {"id": "anthropic", "name": "Anthropic (Claude)", ...}
  ]
}
```

### GET `/config/ai`
AI 설정 조회

### PATCH `/config/ai`
AI 설정 업데이트

---

## 검색 시스템

### GET `/search/tags`
모든 태그 목록 (사용 빈도순)

**Response**:
```json
{
  "tags": [
    {"tag": "개발", "count": 5},
    {"tag": "테스트", "count": 3}
  ]
}
```

### GET `/search/categories`
모든 카테고리 목록

### GET `/search/stats`
검색 통계

### GET `/search/graph`
관계 그래프 데이터

### GET `/search/recommendations`
추천 대화

---

## 맥락 감지

### POST `/context/detect`
**전체 파이프라인** - 가장 많이 사용

**Body**:
```json
{
  "message": "저번에 얘기했던 React 프로젝트",
  "options": {
    "triggerConfig": {"minConfidence": 0.5},
    "searchOptions": {"limit": 3},
    "autoTrigger": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "extracted": {"keywords": [...], "timeRefs": [...]},
  "trigger": {"triggered": true, "confidence": 0.8},
  "memories": {"memories": [...], "totalFound": 2},
  "shouldInject": true
}
```

### POST `/context/extract-keywords`
키워드만 추출

### POST `/context/evaluate-trigger`
트리거 조건 평가

### POST `/context/find-memories`
메모리 검색

### POST `/context/generate-prompt`
시스템 프롬프트 생성

### POST `/context/check-spam`
스팸 방지 체크

---

## 비유/연결 시스템

### POST `/analogy/analyze`
**비유 분석 파이프라인** - 전체 프로세스

**Body**:
```json
{
  "message": "React 렌더링 문제 해결 방법 찾아야 해",
  "options": {
    "limit": 3,
    "minScore": 15,
    "includeContext": true
  }
}
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
      "confidence": 0.7
    }
  ],
  "totalFound": 1,
  "patterns": {
    "hasProblem": true,
    "hasSolution": true,
    "hasOutcome": false
  },
  "contextPrompt": "[Analogies from Past Conversations]..."
}
```

### POST `/analogy/find`
비유 검색만 실행 (활성화 체크 없이)

### POST `/analogy/detect-patterns`
패턴 감지 (문제/해결/결과)

**Body**:
```json
{
  "message": "MongoDB 연결 문제 해결해야 해"
}
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

### POST `/analogy/should-activate`
선택적 활성화 체크

### GET `/analogy/config`
비유 설정 조회

### PATCH `/analogy/config`
비유 설정 업데이트

---

## 자연어 제어 (NLP)

### POST `/nlp/detect`
**의도 감지**

**Body**:
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
  "reason": "Pattern matched: 메모리 패널 열어",
  "isCommand": true,
  "allResults": [...]
}
```

### POST `/nlp/execute`
**의도 감지 + 액션 제안**

**Body**:
```json
{
  "message": "최근 10개 대화 보여줘",
  "context": {}
}
```

**Response**:
```json
{
  "success": true,
  "intent": {...},
  "action": {
    "action": "list_memories",
    "params": {"limit": 10},
    "endpoint": "/api/memory/list"
  },
  "shouldExecute": true
}
```

### POST `/nlp/batch`
일괄 분석 (여러 메시지)

### GET `/nlp/patterns`
패턴 목록 조회

### GET `/nlp/intents`
의도 목록 조회

### POST `/nlp/examples`
예제 테스트

### GET `/nlp/config`
NLP 설정 조회

### PATCH `/nlp/config`
NLP 설정 업데이트

---

## 컨텍스트 관리

### POST `/context-mgmt/analyze`
**컨텍스트 사용량 분석**

**Body**:
```json
{
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi"}
  ],
  "model": "gpt-4"
}
```

**Response**:
```json
{
  "success": true,
  "usage": {
    "usedTokens": 16,
    "maxTokens": 8192,
    "remainingTokens": 8176,
    "usagePercent": 0.2,
    "status": "normal",
    "shouldCompress": false
  }
}
```

### POST `/context-mgmt/estimate-tokens`
텍스트 토큰 수 추정

**Body**:
```json
{
  "text": "Hello world"
}
```

**Response**:
```json
{
  "success": true,
  "tokens": 3
}
```

### POST `/context-mgmt/compress`
메시지 압축 실행

### POST `/context-mgmt/should-compress`
압축 필요 여부 체크

### POST `/context-mgmt/session-summary`
세션 요약 생성

### GET `/context-mgmt/restore/:conversationId`
압축된 세션 복원

### GET `/context-mgmt/config`
압축 설정 조회

### PATCH `/context-mgmt/config`
압축 설정 업데이트

### GET `/context-mgmt/model-limits`
모든 모델의 컨텍스트 제한 조회

**Response**:
```json
{
  "success": true,
  "limits": {
    "claude-3-5-sonnet-20241022": 200000,
    "gpt-4": 8192,
    "gpt-4-turbo": 128000,
    "gemini-1.5-pro": 1000000
  }
}
```

---

## 빠른 시작

### 서버 시작
```bash
cd /workspaces/.soul/soul
node server/index.js
```

### 기본 테스트
```bash
# 헬스 체크
curl http://localhost:3080/api/health

# 토큰 추정
curl -X POST http://localhost:3080/api/context-mgmt/estimate-tokens \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}'

# 맥락 감지
curl -X POST http://localhost:3080/api/context/detect \
  -H "Content-Type: application/json" \
  -d '{"message":"저번에 React 프로젝트"}'
```

### 통합 테스트
```bash
chmod +x test-all-apis.sh
./test-all-apis.sh
```

---

**작성일**: 2026-01-18
**버전**: 1.0
**상태**: Phase 1-5 완료
