# 🌟 .soul 프로젝트 TODO

> **중요**: 이 TODO는 .soul 프로젝트 전체 계획입니다.  
> 체크 해제 완료 - 처음부터 다시 구현하며 정리합니다.

---

## 📋 프로젝트 정보

**프로젝트명**: `.soul` (The Soul Project)  
**저장소**: GitHub private repo (생성 예정)  
**현재 위치**: `/home/sowon/librechat` (라즈베리파이)  
**새 위치**: `/home/sowon/soul` (마이그레이션 예정)

**핵심 철학**:
- 단일 인격 AI 동반자
- 자연어로 모든 제어
- Anti-템플릿 (말투 고정 금지)
- 완전 재배포 가능 (하드코딩 제로)

---

## 🎯 개발 환경

### GitHub Codespaces (월 120 core-hours)
- **2-core 기준**: 60시간/월
- **4-core 실사용**: ~30시간/월 (빌드만 풀가동)
- **용도**: 빠른 개발 + 테스트
- **배포**: 완성본만 라즈베리파이로

### 로컬 서버 (라즈베리파이)
- **SSH**: `ssh sowon`
- **도메인**: https://sowon.mooo.com
- **MongoDB**: Docker 컨테이너 (chat-mongodb:27017)
- **빌드 시간**: ~14분 (느림)

---

## 🗂️ 폴더 구조 (재설계)

```
/home/sowon/soul/
├── soul/               # 백엔드
│   ├── server/
│   ├── models/
│   ├── routes/
│   └── utils/
├── client/            # 프론트엔드
│   ├── src/
│   └── public/
├── memory/            # 메모리 저장소
│   ├── raw/          # 원본 대화 (YYYY-MM-DD_HHmmss_주제.md)
│   ├── processed/    # AI 분석 결과
│   └── index.json    # 메타데이터
├── files/            # 파일 저장소
│   ├── uploads/
│   ├── processed/
│   └── index.json
├── mcp/              # MCP 서버들
│   ├── hub-server.js
│   └── tools/
├── .env.example      # 환경변수 템플릿
└── install.sh        # 설치 스크립트
```

**변경사항**:
- `soul_memories/` → `memory/`
- `librechat` → `soul` (모든 네이밍)
- 환경변수 완전 분리 (`.env.example`)

---

## 📅 개발 계획 (80시간)

### Week 1: 클린업 & 기반 (30h)
- [x] **코드 감사** (완료)
  - [x] 하드코딩 제거 확인 (sowon, 경로 등)
  - [x] 환경변수 분리 확인 (.env.example 완비)
  - [x] 네이밍 통일 확인 (soul 네이밍 적용됨)
  - [x] install.sh 자동 설치 스크립트 작성
  - [x] README.md 전문 문서화

- [ ] **Phase 9 UI 완성** (10h)
  - [ ] 기존 UI 통합 (6h)
  - [ ] Claude 스타일 적용 (4h)

- [x] **패널 시스템** (완료)
  - [x] 탭/분할/팝업 모드
  - [x] 자연어 제어 ("투두 보여줘", "탭으로 바꿔")
  - [x] panel-manager.js 유틸리티
  - [x] panel.js API 라우트 (15개 엔드포인트)
  - [x] 자연어 명령 처리 (NLP 통합)
  - [x] 10개 패널 타입 지원
  - [x] 4개 모드/4개 레이아웃
  - [x] 패널 히스토리 (뒤로가기)
  - [x] 테스트 (10개 테스트)
  - [x] 문서화 (PANEL_SYSTEM.md)

- [x] **MCP 정리** (완료)
  - [x] hub-server.js 작성 (MCP 허브 서버)
  - [x] tools/ 모듈화 (memory, context, nlp)
  - [x] 10개 MCP 도구 구현
  - [x] package.json 및 문서화
  - [x] example-client.js 예제

- [x] **자연어 제어 기초** (완료)
  - [x] 의도 감지 로직 (intent-detector.js)
  - [x] 패턴 매칭 시스템
  - [x] 8개 API 엔드포인트
  - [x] 14개 의도, 21개 패턴
  - [x] 테스트 (100% 통과)
  - [x] 문서화 (NLP_SYSTEM.md)

- [x] **통합 테스트** (완료)
  - [x] test-all-apis.sh 작성 및 테스트
  - [x] 40개 API 엔드포인트 검증 (메모리/AI/검색/컨텍스트/비유/NLP)

### Week 2: 고급 기능 (30h)
- [x] **메모리 고도화** (8h) ✅ 완료
  - [x] 관계 그래프 시각화 (relationship-graph.js)
  - [x] 타임라인 뷰 (timeline-view.js)
  - [x] 태그 클라우드 (pattern-analysis.js)
  - [x] 패턴 분석 (pattern-analysis.js)
  - [x] API 라우트 (memory-advanced.js - 10개 엔드포인트)
  - [x] server/index.js 통합
  
- [x] **알바 시스템** (8h) ✅ 완료
  - [x] 작업 큐 관리 (job-queue.js)
  - [x] 백그라운드 작업자 (worker-manager.js)
  - [x] 6개 워커 (요약, 엔티티 추출, 태그 생성, 감정 분석, 아카이빙, 정리)
  - [x] 우선순위 기반 스케줄링
  - [x] 재시도 로직
  - [x] 상태 추적
  - [x] API 라우트 (workers.js - 13개 엔드포인트)
  - [x] server/index.js 통합
  
- [x] **Proactive Messaging** (4h) ✅ 완료
  - [x] 작업 완료 알림 (notification-manager.js)
  - [x] 안부 시스템 (greeting-system.js)
  - [x] 에러 알림 (event-listener.js)
  - [x] API 라우트 (notifications.js - 18개 엔드포인트)
  - [x] 이벤트 리스너 시스템
  - [x] 알림 우선순위 관리
  - [x] 자동 정리 기능
  - [x] 시간대별 인사
  - [x] 사용자 활동 패턴 학습
  - [x] server/index.js 통합
  
- [x] **자연어 설정** (4h) ✅ 완료
  - [x] 의도 감지 고도화 (intent-detector-advanced.js)
  - [x] 컨텍스트 추적 (context-tracker.js)
  - [x] 패턴 학습 (pattern-learner.js)
  - [x] 엔티티 추출 (사람/장소/시간/숫자)
  - [x] 대명사 해소 (anaphora resolution)
  - [x] 선호도 관리
  - [x] 단축 표현 학습
  - [x] 개인화된 의도 감지
  - [x] 피드백 학습 시스템
  - [x] API 라우트 (nlp-advanced.js - 17개 엔드포인트)
  - [x] server/index.js 통합

- [ ] **Self-Generated UI** (2h)
  - [ ] AI가 UI 요소 생성
  
- [ ] **통합 테스트** (4h)

### Week 3: 배포 준비 (20h)
- [ ] **환경변수 완전 분리** (6h)
  - [ ] .env.example 작성
  - [ ] 검증 로직
  - [ ] 문서화
  
- [ ] **설치 자동화** (6h)
  - [ ] install.sh 스크립트
  - [ ] Docker Compose
  - [ ] 헬스체크
  
- [ ] **문서화** (8h)
  - [ ] README.md (프로젝트 소개)
  - [ ] INSTALL.md (설치 가이드)
  - [ ] CONFIG.md (환경변수 설명)
  - [ ] API.md (API 문서)
  - [ ] LICENSE

---

## 🏗️ Phase 1: 메모리 저장 시스템

### 1.1 저장소 구조
- [x] 메타데이터 헤더 포맷 정의
- [x] `/memory/raw/` 디렉토리 생성
- [x] 파일명 규칙: `YYYY-MM-DD_HHmmss_주제.md`
- [x] index.json 스키마 설계

### 1.2 실시간 저장
- [x] 대화 종료 시 자동 저장 훅
- [x] API: POST /api/archive/:conversationId
- [x] Markdown 변환 로직
- [x] 파일 시스템 저장

### 1.3 메타데이터
- [x] index.json 자동 업데이트
- [x] 필드: id, date, length, participants, path, tags

**완료**: 2026-01-17 ✅
- API 테스트 완료 (POST /api/memory/archive)
- 파일 생성 확인 (2026-01-17_192254_Phase_1_테스트.md)
- index.json 자동 업데이트 확인

**메모**:
- 기존 `/soul_memories/raw/` → `/memory/raw/`
- conversationId는 'main-conversation' 고정

---

## 🤖 Phase 2: AI 분류 시스템

### 2.1 모델 선택
- [x] Claude/GPT/Gemini/로컬 모델 선택 가능
- [x] 모델별 API 인터페이스
- [x] 설정 API 구현

**완료**: 2026-01-17 ✅
- AI 서비스 클래스 구현 (Anthropic, OpenAI, Google, Ollama)
- API 라우트: GET /api/ai-models/services, POST /api/ai-models/test
- 설정 관리: GET/PATCH /api/config/ai
- .env.example에 AI 서비스 설정 추가

**메모**:
- UI는 Phase 9에서 구현 예정
- 현재는 API만 완성

### 2.2 자동 분석
- [x] 대화 종료 시 AI 분석
- [x] 주제 3개 추출
- [x] 태그 5-10개 생성
- [x] 카테고리 분류
- [x] 중요도 점수 (1-10)

**완료**: 2026-01-17 ✅
- memory.js에 analyzeConversation() 메서드 추가
- saveConversation()에 AI 자동 분석 통합
- autoAnalyze 파라미터로 활성화/비활성화 제어
- AI 분석 실패 시 기본값 반환 (fallback)

**메모**:
- API 키 필요 (Anthropic/OpenAI/Google)
- Ollama 로컬 모델도 지원
- 기본값: autoAnalyze=true

### 2.3 결과 저장
- [x] index.json 업데이트
- [x] 파일명에 주제 반영
- [x] 검색 인덱스 등록

**완료**: 2026-01-17 ✅
- AI 분석 결과가 자동으로 메타데이터에 반영
- 첫 번째 주제가 파일명에 포함
- index.json에 모든 메타데이터 저장

---

## 📁 Phase 2A: 파일 시스템

### 2A.1 저장 경로 설정
- [ ] 설정 > 파일 저장소 UI
- [ ] 플러그인 방식 (로컬/NAS/클라우드)
- [ ] 경로 검증 API
- [ ] 폴백 시스템

### 2A.2 파일 메타데이터 DB
- [ ] 파일 정보 테이블
- [ ] 필드: filename, path, type, size, date
- [ ] 분류, 태그, 추출 정보

### 2A.3 자동 분류
- [ ] 카테고리 정의 (금융, 계약, 개인)
- [ ] AI 자동 확장
- [ ] 다중 카테고리 허용

---

## 📄 Phase 2B: 문서 처리

### 2B.1 PDF 처리
- [ ] pdf-parse 연동
- [ ] OCR 결합
- [ ] 메타데이터 추출

### 2B.2 이미지 OCR
- [ ] Tesseract 설치
- [ ] 한글/영문 인식
- [ ] 정확도 검증

### 2B.3 Office 문서
- [ ] Word (mammoth)
- [ ] Excel (xlsx)
- [ ] PowerPoint (python-pptx)

### 2B.4 HWP
- [ ] hwp5 연동
- [ ] 텍스트 추출
- [ ] PDF 변환 옵션

### 2B.5 원본 보관
- [ ] 보관 기간 설정
- [ ] 신뢰도 점수 기반 유지
- [ ] 수동 삭제만 허용

---

## 🔍 Phase 2C: AI 문서 분석

### 2C.1 유형 판단
- [ ] 계약서/청구서/관리비 등 분류
- [ ] 신뢰도 점수

### 2C.2 정보 추출
- [ ] 날짜 (계약일, 만기일 등)
- [ ] 금액 (계약금, 월세 등)
- [ ] 당사자 정보
- [ ] 기간 정보
- [ ] 구조화 저장

### 2C.3 자동 태그
- [ ] 내용 기반 태그
- [ ] 금액/날짜 메타 태그
- [ ] 기존 태그 연결

### 2C.4 AI 모델 설정
- [ ] 모델 선택 UI
- [ ] 작업별 모델 분리
  - OCR 후처리: 로컬
  - 분류: Haiku (빠름)
  - 요약: Sonnet (균형)
  - 중요 문서: Opus (최고)

---

## 📋 Phase 2D: 문서 관리

### 2D.1 수정 API
- [ ] POST /api/files/:id/tags
- [ ] POST /api/files/:id/category
- [ ] PATCH /api/files/:id/metadata

### 2D.2 재분류
- [ ] POST /api/files/:id/reclassify
- [ ] 수동 트리거
- [ ] 일괄 재분류

### 2D.3 태그 관리
- [ ] POST /api/tags/merge
- [ ] POST /api/tags/split
- [ ] UI 태그 관리 패널

---

## 🔧 Phase 2E: 문서 활용

### 2E.1 스케줄 추출
- [ ] "만기되는 보험 찾아줘"
- [ ] 자동 만기일 추출
- [ ] 캘린더 통합

### 2E.2 금액 집계
- [ ] 기간별/카테고리별 합산
- [ ] 차트 생성

### 2E.3 파일 편집
- [ ] 읽기: 모든 포맷 → 텍스트
- [ ] 수정: 텍스트 편집 → 재저장
- [ ] 생성: 텍스트 → PDF/Excel/Word
- [ ] 변환: 포맷 간 변환

---

## 🔎 Phase 3: 검색 시스템

### 3.1 기본 검색
- [x] GET /api/search
- [x] 키워드 매칭
- [x] 날짜/태그/파일 유형 필터

**완료**: 2026-01-17 ✅
- search.js 유틸리티 구현
  - searchConversations() - 키워드 검색 + 필터링
  - advancedSearch() - AND/OR/제외 키워드 검색
  - getAllTags() - 태그 목록 + 사용 빈도
  - getAllCategories() - 카테고리 목록 + 분포
  - getStatistics() - 통계 정보
- API 엔드포인트:
  - GET /api/search - 기본 검색 (q, tags, category, date range, importance)
  - POST /api/search/advanced - 고급 검색 (keywords, anyKeywords, excludeKeywords)
  - GET /api/search/tags - 태그 목록
  - GET /api/search/categories - 카테고리 목록
  - GET /api/search/stats - 통계 정보
- 기능:
  - 주제/태그/카테고리/ID 키워드 매칭
  - 날짜 범위 필터 (startDate, endDate)
  - 중요도 범위 필터 (minImportance, maxImportance)
  - 태그 다중 필터 (AND 조건)
  - 정렬 (date/importance/relevance)
  - 페이지네이션 (limit, offset)
  - 관련성 점수 계산

### 3.2 지능형 검색
- [x] "개떡같이" 검색어 해석
- [x] 시간 추론 ("저번에", "최근")
- [x] 맥락 기반 검색
- [x] 관련성 순위

**완료**: 2026-01-17 ✅
- smart-search.js 유틸리티 구현
  - parseTimeExpression() - 시간 표현 파싱
    - 오늘, 어제, 그저께
    - 이번주, 지난주
    - 이번달, 지난달
    - 최근, 요즘, 저번에, 예전에
    - N일/주/달 전 (예: "3일 전", "2주 전")
  - parseNaturalQuery() - 자연어 쿼리 파싱
    - 카테고리 키워드 인식 (개발, 일상, 업무, 학습 등)
    - 중요도 키워드 (중요한, 급한, 사소한 등)
    - 시간 표현 추출 및 변환
  - fuzzyCorrection() - 오타 수정 & 동의어 확장
  - expandContext() - 최근 검색 기반 맥락 확장
- search.js에 smartSearch() 메서드 추가
  - 자연어 → 필터 자동 변환
  - 맥락 기반 키워드 확장 (선택)
- API: POST /api/search/smart
  - Body: { query, recentSearches, useExpanded }
  - Returns: 검색 결과 + parsedQuery 정보

**예시**:
- "최근 개발 관련 중요한 대화" → filters: { startDate: 7일전, category: 개발, minImportance: 8 }
- "어제 테스트" → filters: { startDate: 어제 0시, endDate: 오늘 0시 }
- "3일 전 업무" → filters: { startDate: 3일 전, category: 업무 }

### 3.3 전문 검색
- [ ] Elasticsearch/MeiliSearch 연동
- [ ] OCR 텍스트 포함
- [ ] 금액/날짜 범위 검색

### 3.4 연관 검색
- [x] 비슷한 주제 찾기
- [x] 관계 그래프
- [x] "이것도 볼래?" 추천

**완료**: 2026-01-17 ✅
- recommendation.js 유틸리티 구현
  - calculateSimilarity() - 유사도 계산 알고리즘
    - 공통 주제 (가중치 10)
    - 공통 태그 (가중치 5)
    - 같은 카테고리 (가중치 8)
    - 비슷한 중요도 (가중치 3)
    - 시간적 근접성 (가중치 2)
  - findSimilar() - 비슷한 대화 찾기
  - buildRelationshipGraph() - 관계 그래프 생성 (nodes + edges)
  - getRecommendations() - 추천 시스템 (recent/important/category 기반)
  - findByTags() - 태그 기반 연관 검색 (any/all 매칭)
- API 엔드포인트:
  - GET /api/search/similar/:conversationId - 비슷한 대화
  - GET /api/search/graph - 관계 그래프 데이터
  - GET /api/search/recommendations - 추천 대화
  - POST /api/search/by-tags - 태그 기반 검색

---

## 🧠 Phase 4: 자율 기억

### 4.1 맥락 감지
- [x] 관련 주제 자동 감지
- [x] 트리거 조건 설정
- [x] 자동 검색 실행

**완료**: 2026-01-18 ✅
- context-detector.js 유틸리티 구현
  - extractKeywords() - 키워드, 엔티티, 시간 참조 추출
  - evaluateTrigger() - 트리거 조건 평가 (신뢰도 점수)
  - findRelatedMemories() - 관련 메모리 자동 검색
  - detectAndRetrieve() - 전체 파이프라인
  - generateContextPrompt() - 시스템 프롬프트 생성
  - checkSpamPrevention() - 스팸 방지
- API 엔드포인트 (/api/context):
  - POST /detect - 맥락 감지 및 메모리 검색
  - POST /extract-keywords - 키워드 추출
  - POST /evaluate-trigger - 트리거 평가
  - POST /find-memories - 메모리 검색
  - POST /generate-prompt - 프롬프트 생성
  - POST /check-spam - 스팸 방지 체크
- 기능:
  - 시간 참조 감지 ("저번에", "최근에", "어제" 등)
  - 주제 참조 감지 ("그때", "아까 말한", "비슷한" 등)
  - 엔티티 감지 (기술 키워드, 프로젝트명 등)
  - 트리거 신뢰도 점수 (0.0~1.0)
  - 다중 검색 전략 (시간 기반, 키워드 기반, 엔티티 기반)
  - 관련성 점수 계산
  - 스팸 방지 (시간당 최대 횟수, 최소 간격)
- 테스트 결과:
  - "저번에 얘기했던 React 프로젝트 기억나?" → 트리거 발동 (confidence: 1.0)
  - "최근에 MongoDB 설정 어떻게 했었지?" → 트리거 발동 (confidence: 0.8)
  - 스팸 방지 정상 작동

**메모**:
- 현재 메모리 DB가 비어있어 실제 메모리 검색은 0건
- Phase 2 (AI 분류)로 메모리가 쌓이면 자동으로 작동
- UI 통합은 Phase 9에서 진행 예정

### 4.2 자연스러운 통합
- [x] 시스템 프롬프트 주입
- [x] "그때 애기했던..." 패턴
- [x] 스팸 방지

**완료**: 2026-01-18 ✅ (4.1과 함께 구현)
- generateContextPrompt()로 자연스러운 프롬프트 생성
- 과거 대화 참조 시 자동으로 관련 메모리 제공
- 강제 주입 없이 자연스러운 언급 유도
- 스팸 방지 내장

### 4.3 비유/연결
- [x] 과거 대화 비유 찾기
- [x] 선택적 활성화

**완료**: 2026-01-18 ✅
- analogy-finder.js 유틸리티 구현
  - detectPatterns() - 문제/해결/결과 패턴 감지
  - calculateAnalogyScore() - 비유 점수 계산 (최대 50점)
  - findAnalogies() - 비유 검색 (문제/해결책 키워드 기반)
  - shouldActivate() - 선택적 활성화 (패턴 매칭 기반)
  - analyze() - 전체 파이프라인
- API 엔드포인트 (/api/analogy):
  - POST /analyze - 비유 분석 (전체)
  - POST /find - 비유 검색만
  - POST /detect-patterns - 패턴 감지
  - POST /should-activate - 활성화 체크
  - GET/PATCH /config - 설정 관리
- 기능:
  - 문제/해결/결과 패턴 자동 감지
  - 유사도 기반 비유 점수 계산
  - 선택적 활성화 (최소 패턴 매칭 필요)
  - 컨텍스트 프롬프트 자동 생성
- 비유 타입:
  - similar_problem - 비슷한 문제
  - similar_solution - 비슷한 해결책
  - similar_outcome - 비슷한 결과
  - general_context - 일반 맥락
- 테스트 결과:
  - 패턴 감지 정상 작동
  - 활성화 체크 정상 작동
  - 비유 분석 파이프라인 정상 작동
  - 설정 관리 정상 작동

**메모**:
- 현재 메모리 DB가 비어있어 실제 비유 검색 결과는 0건
- Phase 2 (AI 분류)로 메모리가 쌓이면 비유 검색 작동
- UI 통합은 Phase 9에서 진행 예정

---

## 🎛️ Phase 5: 컨텍스트 관리

### 5.1 토큰 모니터링
- [x] 현재 토큰 수 추적
- [x] 80% 경고, 90% 자동 압축
- [ ] UI 게이지 (선택)

**완료**: 2026-01-18 ✅
- token-counter.js 유틸리티 구현
  - estimateTokens() - 텍스트 토큰 수 추정 (정확도 ~85%)
  - countMessagesTokens() - 메시지 배열 토큰 계산
  - analyzeUsage() - 컨텍스트 사용량 분석
  - calculateCompressionPriority() - 압축 우선순위 계산
  - selectMessagesForCompression() - 압축 대상 선택
- 모델별 최대 컨텍스트 길이 지원:
  - Claude: 200K 토큰
  - GPT-4: 8K ~ 128K 토큰
  - Gemini: 32K ~ 1M 토큰
- 자동 압축 트리거:
  - 경고: 80% 도달 시
  - 위험: 90% 도달 시 (자동 압축)
- 압축 우선순위 알고리즘:
  - 최근 N개 메시지 보호
  - 시스템 메시지 우선 보호
  - 오래되고 긴 메시지 우선 압축

### 5.2 자동 압축
- [x] 오래된 메시지 요약
- [x] 핵심만 남기기
- [x] 원본 파일 저장

**완료**: 2026-01-18 ✅
- context-compressor.js 유틸리티 구현
  - compressMessages() - 메시지 압축 실행
  - shouldAutoCompress() - 자동 압축 필요 여부 체크
  - generateSessionSummary() - 세션 요약 생성
  - saveOriginalToMemory() - 원본 메모리에 저장
  - generateAISummary() - AI 요약 생성 (선택)
- 압축 기능:
  - 간단한 요약 (키워드 추출)
  - AI 요약 지원 (선택적)
  - 원본 자동 저장
  - 압축 통계 제공
- 세션 요약 기능:
  - 키워드 추출
  - 결정사항 추출
  - TODO 추출
  - 주요 주제 추출
- API 엔드포인트 (/api/context-mgmt):
  - POST /analyze - 컨텍스트 사용량 분석
  - POST /estimate-tokens - 토큰 수 추정
  - POST /compress - 메시지 압축
  - POST /should-compress - 압축 필요 여부 체크
  - POST /session-summary - 세션 요약
  - GET /restore/:id - 압축된 세션 복원
  - GET/PATCH /config - 설정 관리
  - GET /model-limits - 모델 제한 조회

**테스트 결과**:
- 토큰 추정: 정상 작동
- 사용량 분석: gpt-4 모델로 16 토큰 / 8192 토큰 = 0.2% 확인
- 압축 API: 정상 작동
- 설정 관리: 정상 작동

### 5.3 세션 연속성
- [x] 종료 시 요약 생성
- [x] 시작 시 요약 로드
- [ ] "이어가기" 버튼

**완료**: 2026-01-18 ✅ (5.2와 함께 구현)
- generateSessionSummary()로 세션 종료 시 자동 요약
- restoreCompressedSession()로 압축된 세션 복원
- UI "이어가기" 버튼은 Phase 9에서 구현 예정

---

## 🎛️ Phase 5.4: 영속적 대화방 시스템 ⭐ (완료)

**목표**: LibreChat의 대화 처리 로직을 참고하여 무한 메모리를 가진 단일 영속 대화방 구현

**핵심 철학**: 단일 인격 AI
- ❌ 모드 분리 (기본/업무/상담) 금지
- ✅ 하나의 복합적이고 유동적인 인격체
- 내부 모델 전환은 사용자에게 투명
- 다중 AI 제공사 지원 (Anthropic, Google, OpenAI, xAI)

### 5.4.1 대화 처리 파이프라인 ✅
- [x] conversation-pipeline.js 구현 (300 lines)
  - [x] buildConversationMessages() - 메시지 배열 구성
  - [x] getMessagesWithinTokenLimit() - 역순 메시지 추가
  - [x] handleResponse() - 응답 처리 및 저장
  - [x] 시스템 프롬프트 동적 구성
  - [x] 자동 메모리 주입 (과거 대화 참조 감지시)
  - [x] 80% 도달시 자동 압축
- [x] POST /api/chat 엔드포인트

### 5.4.2 토큰 폭발 방지 ✅
- [x] token-safeguard.js 구현 (400 lines)
  - [x] TokenSafeguard 클래스 - 실시간 모니터링
  - [x] emergencyCompress() - 95% 강제 압축
  - [x] truncateToolOutput() - Tool 출력 500 토큰 제한
  - [x] Vision 토큰 계산 (width/height 기반)
  - [x] ManagedTokenizer - 5분/25회 자동 초기화
  - [x] 단일 메시지 10% 제한

### 5.4.3 에이전트 체이닝 시스템 ✅
- [x] agent-chain.js 구현 (140 lines, 간소화 버전)
  - [x] Agent 클래스 - 단일 에이전트
  - [x] SequentialChain - 순차 실행
  - [x] ParallelChain - 병렬 실행
  - [x] ToolLayer - Tool 레이어

### 5.4.4 메모리 계층 통합 ✅
- [x] memory-layers.js 구현 (690 lines)
  - [x] ShortTermMemory - 최근 50개 메시지
  - [x] MiddleTermMemory - 세션 요약 (파일 저장)
  - [x] LongTermMemory - 아카이브 (MongoDB)
  - [x] MemoryManager - 통합 관리
  - [x] 자동 계층 이동 (단기 → 중기 → 장기)
  - [x] 컨텍스트 수집 최적화

### 5.4.5 세션 연속성 ✅
- [x] session-continuity.js 구현 (320 lines)
  - [x] saveSessionState() - 세션 상태 저장
  - [x] restoreSession() - 세션 복원
  - [x] generateResumePrompt() - 재개 프롬프트
  - [x] 대화 중단/재개 완벽 처리
  - [x] 시간 인지 재개 메시지 (N시간 전, N일 전)
  - [x] 자동 저장 (1분 간격)
  - [x] 세션 만료 관리 (30일)

### API 엔드포인트 ✅
- [x] POST /api/chat - 메시지 전송
- [x] POST /api/chat/resume - 세션 재개
- [x] POST /api/chat/end - 세션 종료
- [x] GET /api/chat/sessions - 활성 세션 목록
- [x] GET /api/chat/memory-stats - 메모리 통계
- [x] GET /api/chat/token-status - 토큰 상태
- [x] POST /api/chat/compress - 수동 압축

**완료 달성:**
- ✅ 무한 연속 대화 (토큰 제한 극복)
- ✅ 자연스러운 맥락 유지
- ✅ 토큰 폭발 방지
- ✅ 에이전트 체이닝 지원
- ✅ 단기/중기/장기 메모리 자동 관리
- ✅ 세션 연속성 (저장/복원/재개)

**LibreChat 분석 활용:**
- 역순 메시지 추가 로직
- 누적 요약 메커니즘
- 토큰 계산 정확도
- 에이전트 체인 구조
- 메모리 계층 설계

**참고 파일:**
- librechat.tar.gz 분석 완료 (Agent ID: aaae15f)
- /tmp/api/app/clients/BaseClient.js
- /tmp/api/app/clients/AnthropicClient.js
- /tmp/packages/api/src/agents/

---

## 🏷️ Phase 6: 태그 진화

### 6.1 태그 분석
- [ ] 주 1회 전체 분석
- [ ] 유사 태그 감지
- [ ] 사용 빈도 추적

### 6.2 자동 재분류
- [ ] AI 정리 요청
- [ ] 병합 제안
- [ ] 세분화 제안

### 6.3 관계 업데이트
- [ ] 대화 간 관계 재계산
- [ ] 패턴 발견
- [ ] index.json 업데이트

---

## ⚡ Phase 7: 프롬프트 캐싱

- [ ] DB 스키마: PromptCacheUsage
- [ ] 자동 저장: recordTokenUsage()
- [ ] Stats API: GET /api/prompt-caching/stats
- [ ] 기본값 활성화

**메모**: Anthropic API 전용

**중요**: 단일 인격 철학 유지
- 프롬프트 캐싱은 성능 최적화 목적
- 사용자 인식 변화 없음 (투명한 내부 처리)
- 캐시된 시스템 프롬프트 = 일관된 인격 유지

---

## 🎯 Phase 8: 스마트 라우팅 (단일 인격 핵심 기능) ✅ 완료

**목표**: 작업에 맞는 최적 모델 자동 선택 (사용자는 모름)

- [x] **smart-router.js** - 스마트 라우터 시스템
  - [x] SmartRouter 클래스 (태스크 분석 & 모델 선택)
  - [x] analyzeTask() - 복잡도 분석 (0-10)
  - [x] detectTaskType() - 11개 태스크 유형 탐지
  - [x] selectModel() - Haiku/Sonnet/Opus 자동 선택
  - [x] 비용 추정 (estimatedCost)
  - [x] 라우팅 통계 (getStats)
  - [x] 3개 모델 정보 (MODELS)

- [x] **personality-core.js** - 단일 인격 시스템
  - [x] PersonalityCore 클래스
  - [x] PERSONALITY_PROFILE (인격 정의)
  - [x] generateSystemPrompt() - 일관된 시스템 프롬프트 생성
  - [x] validateResponse() - 응답 일관성 검증
  - [x] handleModelSwitch() - 모델 전환 시 컨텍스트 유지
  - [x] trackTopic() - 대화 주제 추적
  - [x] setUserPreference() - 사용자 선호도 설정

- [x] **API 라우트 수정**
  - [x] POST /api/chat - 스마트 라우팅 통합
  - [x] POST /api/chat/analyze-task - 태스크 분석만
  - [x] GET /api/chat/routing-stats - 라우팅 통계
  - [x] GET /api/chat/models - 모델 목록
  - [x] GET /api/chat/personality - 인격 정보
  - [x] POST /api/chat/personality/preference - 선호도 설정

- [x] **테스트**
  - [x] 간단한 질문 → Haiku
  - [x] 코드 생성 → Sonnet
  - [x] 아키텍처 설계 → Opus
  - [x] 라우팅 통계 조회
  - [x] 모델 목록 조회
  - [x] 인격 정보 조회
  - [x] 통합 채팅 테스트
  - [x] test-all-apis.sh 업데이트 (8개 테스트)

- [x] **문서화**
  - [x] SMART_ROUTING.md (완전한 문서)
  - [x] API 레퍼런스
  - [x] 사용 예제
  - [x] 모델 선택 로직
  - [x] 비용 최적화 가이드

**라우팅 로직**:
- complexity ≥ 7 OR requiresExpertise → Opus
- complexity ≤ 3 AND NOT requiresReasoning → Haiku
- else → Sonnet

**태스크 유형**:
- 간단한 질문, 번역, 요약 → Haiku (1-2)
- 코드 생성, 리뷰, 분석, 문제 해결 → Sonnet (4-6)
- 아키텍처 설계, 복잡한 디버깅, 연구, 전문 컨설팅 → Opus (7-9)

**단일 인격 철학** ✅:
- ✅ 모델 전환해도 동일한 인격 유지
- ✅ 시스템 프롬프트는 항상 통일된 인격 주입
- ✅ 사용자는 모델 전환을 인식하지 못함
- ✅ 응답 일관성 자동 검증

---

## 🔔 Phase N: 알림 시스템

- [ ] 알림 DB 테이블
- [ ] 알림 큐 관리
- [ ] 상태 추적 (pending/delivered/read)
- [ ] 트리거 조건 (작업 완료, 에러, 결정 등)
- [ ] 전달 방식
  - 메시지로 직접 전달 (대화창)
  - 알림창 표시 (패널 열 때만 fetch)
  - polling 없음
- [ ] 우선순위 관리 (1-10)
- [ ] 맥락 인지
- [ ] 자연어 메시지 생성

**메모**: 백엔드 완료, UI 통합 필요

---

## ⏰ Phase T: 시간 인지

- [ ] 대화 이력 DB
- [ ] 현재 시간 정보
- [ ] 패턴 분석 (빈도, 시간대)
- [ ] 맥락 연속성
- [ ] 시간 기반 응답
- [ ] 안부 시스템
- [ ] 시스템 프롬프트 주입

**메모**: 백엔드 완료

---

## 🎨 Phase 9: UI 개선

### 9.1 메모리 탐색
- [ ] 타임라인 뷰
- [ ] 태그 클라우드
- [ ] 관계 그래프 시각화 ⚠️ 미완

### 9.2 검색 UI
- [ ] 검색창
- [ ] 필터 옵션
- [ ] 미리보기
- [ ] "불러오기" 버튼

### 9.3 파일 관리 UI
- [ ] 파일 목록 뷰
- [ ] 분류별 필터
- [ ] 편집 인터페이스
- [ ] 태그 관리

### 9.4 MCP UI
- [ ] MCP 서버 목록
- [ ] 상세 정보
- [ ] 추가/편집/삭제
- [ ] 활성화/비활성화 토글
- [ ] 대화창 MCP 버튼 연동 ⚠️ 미완

### 9.5 알림 센터
- [ ] 알림 목록 (NotificationCenter)
- [ ] 우선순위 표시
- [ ] 읽음/미읽음
- [ ] 타입별 필터
- [ ] NotificationBadge
- [ ] 실시간 폴링 (30초)

### 9.6 컨텍스트 UI
- [ ] 토큰 게이지 (선택)

### 9.7 단일 대화방 시스템 ✅
**목표**: 여러 대화방 → 하나의 영속적 대화

#### 9.7.1 UI 정리 ⚠️ 추가 작업 필요
- [x] Nav.tsx 간소화
- [x] 채팅방 리스트 제거
- [x] 새 대화 버튼 제거 (좌측 Nav)
- [ ] 새 대화 버튼 제거 (우측 상단) ⭐
- [ ] 대화방 제목 제거 ("New Chat" 등) ⭐
- [ ] Header 상단 떠있는 UI 전부 제거 ⭐
- [x] 에이전트 마켓 제거
- [x] 검색바 제거
- [x] 북마크 제거

#### 9.7.2 라우팅 ✅
- [x] ChatRoute.tsx: 고정 'main-conversation'
- [x] routes/index.tsx: index: true
- [x] useNewConvo.ts: navigate('/')
- [x] URL: `/` 만 사용

#### 9.7.3 API ✅
- [x] convos.js: GET /:id만 유지
- [x] main-conversation 자동 생성
- [x] 불필요한 라우트 제거

#### 9.7.4 작동 확인 ⚠️
- [x] URL 깔끔 (/)
- [x] /c/new 리다이렉트 해결
- [x] Service Worker 갱신
- [ ] Header UI 완전 정리 ⭐
  - [ ] 우측 상단 새 대화 버튼 제거
  - [ ] 대화방 제목 영역 제거
  - [ ] 모델 선택 UI 제거 (설정으로 이동)
  - [ ] 깔끔한 헤더만 유지 ([☰] soul [🔔] [@user] [⚙️])
- [ ] 메시지 송수신 테스트
- [ ] 새로고침 후 대화 유지 확인

#### 9.7.5 메모리 통합 ⚠️
- [ ] 메모리 저장소 설정 UI
- [ ] 고정 대화방에 메모리 연결
- [ ] 컨텍스트 압축 시 메모리 유지
- [ ] API 연동 확인
- [ ] 프론트 UI 확인

**중요 메모**:
- conversationId = 'main-conversation' (고정)
- JWT 쿠키 인증 완료
- ChatView conversationId 수정 완료
- 빌드: index.DR7_9DDI.js

---

## 🚀 Phase 10: 배포 & 최적화

### 10.1 성능
- [ ] 검색 인덱싱 최적화
- [ ] 대용량 파일 처리
- [ ] 백그라운드 작업 큐

### 10.2 백업
- [ ] 자동 백업 스크립트
- [ ] 외부 동기화
- [ ] 복구 테스트

### 10.3 모니터링
- [ ] 저장 실패 알림
- [ ] 비용 추적
- [ ] 성능 메트릭

---

## 🌐 Phase 11: 네트워크

### 11.1 내부 도메인
- [ ] DNS/hosts 설정
- [ ] 자동 감지
- [ ] Reverse Proxy

### 11.2 외부 접속
- [ ] 도메인 관리 UI
- [ ] DDNS 연동
- [ ] 자체 도메인 설정
- [ ] SSL 자동 갱신

### 11.3 라우팅
- [ ] 내부망/외부망 감지
- [ ] 최적 경로 선택
- [ ] VPN/Tailscale 통합

---

## 🔄 Phase A: 자동 업데이트

### A.1 버전 체크
- [ ] GitHub Releases API
- [ ] 서버 시작 시 체크
- [ ] 현재 vs 최신 비교
- [ ] Header 배지 (🆙)

### A.2 업데이트 UI
- [ ] 안내 모달
- [ ] 릴리즈 노트 표시
- [ ] [지금 업데이트] [나중에] [무시]

### A.3 실행 스크립트
- [ ] Docker: pull && up -d
- [ ] 일반: git pull && build && restart

### A.4 설정
- [ ] 자동 확인 활성화/비활성화
- [ ] 체크 주기 설정
- [ ] [지금 확인] 버튼

### A.5 Tauri 앱
- [ ] Tauri Updater 연동

---

## 📱 UI 레이아웃 (확정)

```
┌─────────────────────────────────────────┐
│ [☰] soul    [🔔3] [@sowon] [🆙] [⚙️]   │ ← Header
├─────────────────────────────────────────┤
│                                         │
│           대화 영역                      │
│        (단일 대화방)                     │
│                                         │
├─────────────────────────────────────────┤
│ [📎] [🎤] 메시지 입력...         [▶]   │ ← Input
└─────────────────────────────────────────┘
```

### 햄버거 메뉴 (☰)
- 🔍 통합 검색
- 📁 파일 매니저
- 🧠 메모리 탐색
- 🔌 MCP 관리
- 📊 대화 아카이브
- ──────────
- ⚙️ 설정

### 설정 메뉴 (⚙️)
- 👤 계정
- 🎨 테마 (웹/앱)
- 🤖 AI 모델
- 🔔 알림
- 🔄 업데이트
- 💾 메모리 저장소
- 📁 파일 저장소
- 🔌 MCP 서버

---

## 📝 개발 원칙

### Anti-템플릿 철학
```javascript
// ❌ 절대 금지
const RESPONSES = {
  greeting: "안녕하세요!",
  goodbye: "좋은 하루!"
}

// ✅ 올바른 방식
- 최소 시스템 프롬프트 (본질만)
- 컨텍스트 기반 자연 응답
- 관계성/상황에 따라 동적 톤
- 사용자 말투 학습 (30% 변주)
```

### 자연어 제어
모든 설정을 자연어로:
- "투두 보여줘" → TODO 패널
- "투두랑 터미널 같이" → 분할 모드
- "탭으로 바꿔" → 탭 전환
- "매번 물어봐" → 보안 설정
- "덜 연락해" → Proactive 빈도

### 네이밍 규칙
```
librechat → soul
LibreChat → Soul
soul_memories → memory
```

### 환경변수
```bash
# .env.example
MONGODB_URI=mongodb://localhost:27017/soul
MEMORY_PATH=/path/to/memory
FILES_PATH=/path/to/files
MCP_PATH=/path/to/mcp
```

---

## 🤖 Phase X: AI 모델 관리 시스템

### X.1 데이터베이스 스키마
- [ ] AIServices 모델 생성
  - [ ] service (anthropic, openai, google, ollama, custom)
  - [ ] name, apiKey (암호화), baseUrl
  - [ ] isActive, models[], lastRefresh
- [ ] ModelConfig 모델 생성
  - [ ] soul_model (주 모델)
  - [ ] background_models (작업별 모델)

### X.2 ModelService 클래스
- [ ] 제공사별 API 연동
  - [ ] getAnthropicModels() (하드코딩 + 주기 체크)
  - [ ] getOpenAIModels() (API: /v1/models)
  - [ ] getGoogleModels() (API 연동)
  - [ ] getOllamaModels() (API: /api/tags)
- [ ] 자동 갱신 로직
  - [ ] refreshAll() - 모든 서비스
  - [ ] refreshService(id) - 특정 서비스
- [ ] API Key 암호화/복호화
- [ ] 연결 테스트

### X.3 API 라우트
- [ ] GET /api/services - 서비스 목록
- [ ] POST /api/services - 서비스 추가
- [ ] PATCH /api/services/:id - 서비스 수정
- [ ] DELETE /api/services/:id - 서비스 삭제
- [ ] POST /api/services/:id/test - 연결 테스트
- [ ] POST /api/services/:id/refresh - 모델 목록 갱신
- [ ] GET /api/model-config - 현재 모델 설정
- [ ] PATCH /api/model-config - 모델 설정 변경

### X.4 설정 UI
- [ ] 🎭 Soul 인격 설정
  - [ ] 주 모델 선택 드롭다운
  - [ ] 현재 활성 모델 표시
- [ ] 🤖 백그라운드 작업 모델
  - [ ] 복잡도 분석 모델
  - [ ] 문서 요약 모델
  - [ ] 태그 생성 모델
  - [ ] OCR 후처리 모델
  - [ ] 중요 문서 분석 모델
- [ ] 🔌 AI 서비스 관리
  - [ ] 서비스 목록 (카드 형태)
  - [ ] 활성/비활성 토글
  - [ ] API Key 표시/숨김 (***xyz)
  - [ ] 사용 가능 모델 개수 표시
  - [ ] [수정] [삭제] 버튼
- [ ] 서비스 추가/수정 모달
  - [ ] 서비스 타입 선택
  - [ ] API Key 입력
  - [ ] Base URL (Ollama/Custom)
  - [ ] [연결 테스트] [취소] [저장]

### X.5 Cron Job
- [ ] 매일 새벽 3시 자동 갱신
- [ ] 갱신 실패 시 알림
- [ ] 로그 기록

### X.6 대화방 UI 정리
- [ ] 모델 선택 UI 완전 제거
  - [ ] Header에서 모델 선택 드롭다운 제거
  - [ ] "Who am I talking to?" 제거
- [ ] 깔끔한 대화 인터페이스만 유지

**메모**:
- 사용자는 soul과만 대화 (단일 인격)
- 백그라운드 작업은 자동 라우팅
- 모델 선택은 설정에서만

---

## 🎯 우선순위

### P0 (필수)
- Phase 9 완성
- 환경변수 분리
- 기본 문서화

### P1 (중요)
- Phase 10 (배포)
- 설치 스크립트
- 자동 업데이트

### P2 (선택)
- Phase 11 (네트워크)
- 고급 문서
- Tauri 앱

---

**마지막 업데이트**: 2026-01-18  
**버전**: 1.0 (GitHub 배포용)