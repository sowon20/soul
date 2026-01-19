## 항상 작업 전 확인 / 작업 후 업데이트할 것! : 체크 및 중요메모

## ⚠️ 필수 숙지 사항

### 📖 LIBRECHAT_CONTEXT_HANDOVER.md 반드시 읽기
**위치**: `/workspaces/.soul/docs/LIBRECHAT_CONTEXT_HANDOVER.md`

📋 포함 내용
핵심 섹션
핵심 철학 - LibreChat이 일반 ChatGPT/Claude와 다른 이유
레이어 아키텍처 - 7개 레이어 상세 설명
메시지 구성 파이프라인 - 전체 흐름도 + 실제 코드
토큰 관리 전략 - 토큰 폭발 버그 3가지 원인과 해결
메모리 계층 시스템 - 단기/중기/장기 자동 관리
세션 연속성 - 자동 저장, 시간 인지 재개
에이전트 체이닝 - 순차/병렬 체인 구현
구현 상태 - Phase 5.4, 8 완료 상태
주요 특징
✅ 복붙 가능한 코드 예시 - 실제 동작하는 코드
✅ Before/After 비교 - 왜 이렇게 해야 하는지 명확히
✅ 시각화된 흐름도 - 전체 파이프라인 이해 쉽게
✅ 체크리스트 - 인수인계 시 확인사항
✅ 핵심 학습 포인트 - 반드시 이해해야 할 개념

강조한 핵심 기술
역순 메시지 추가 - 최신 대화 보존
자동 맥락 감지 - "저번에" 감지 → 메모리 주입
3단계 메모리 계층 - 단기(RAM) → 중기(파일) → 장기(DB)
토큰 폭발 방지 - Tool 출력 제한, Vision 계산, 토큰나이저 초기화
세션 연속성 - 1분 자동 저장, 시간 인지 재개
단일 인격 유지 - 모델 전환해도 일관된 말투
7개 레이어 스택 - 각 레이어의 역할과 중요성

**메모리 관련 작업 전 필수 숙지**:
- 3단계 메모리 계층 (단기→중기→장기)
- Omi 방식 점진적 밀도 증가
- 역순 메시지 추가 기법
- 토큰 폭발 방지 메커니즘
- 맥락 자동 감지 파이프라인
- 세션 연속성 시스템

**이 문서를 안 읽고 메모리 코드 건드리면**:
- 설계 의도를 모르고 수정 → 망가짐
- "왜 이렇게 했지?" → 컨텍스트 손실
- 중복 구현 or 잘못된 방향

---

**마지막 업데이트**: 2026-01-20
**버전**: 1.0 (GitHub 배포용)



----------------------------------------------------------------------------



## 🏗️ Phase 1: 메모리 저장 시스템 ✅

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

---

## 🤖 Phase 2: AI 분류 시스템 ✅

### 2.1 모델 선택
- [x] Claude/GPT/Gemini/로컬 모델 선택 가능
- [x] 모델별 API 인터페이스
- [x] 설정 API 구현

### 2.2 자동 분석
- [x] 대화 종료 시 AI 분석
- [x] 주제 3개 추출
- [x] 태그 5-10개 생성
- [x] 카테고리 분류
- [x] 중요도 점수 (1-10)

### 2.3 결과 저장
- [x] index.json 업데이트
- [x] 파일명에 주제 반영
- [x] 검색 인덱스 등록

---

## 📁 Phase 2A: 파일 시스템 (보류)

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

## 📄 Phase 2B: 문서 처리 (보류)

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

## 🔍 Phase 2C: AI 문서 분석 (보류)

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
- [ ] 작업별 모델 분리 (OCR 후처리, 분류, 요약, 중요 문서)

---

## 📋 Phase 2D: 문서 관리 (보류)

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

## 🔧 Phase 2E: 문서 활용 (보류)

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

## 🔎 Phase 3: 검색 시스템 ✅

### 3.1 기본 검색
- [x] GET /api/search
- [x] 키워드 매칭
- [x] 날짜/태그/파일 유형 필터
- [x] 페이지네이션, 정렬, 관련성 점수

### 3.2 지능형 검색
- [x] "개떡같이" 검색어 해석
- [x] 시간 추론 ("저번에", "최근", "3일 전")
- [x] 맥락 기반 검색
- [x] 관련성 순위
- [x] 오타 수정 & 동의어 확장

### 3.3 전문 검색 (보류)
- [ ] Elasticsearch/MeiliSearch 연동
- [ ] OCR 텍스트 포함
- [ ] 금액/날짜 범위 검색

### 3.4 연관 검색
- [x] 비슷한 주제 찾기
- [x] 관계 그래프
- [x] "이것도 볼래?" 추천

---

## 🧠 Phase 4: 자율 기억 ✅

### 4.1 맥락 감지
- [x] 관련 주제 자동 감지
- [x] 트리거 조건 설정
- [x] 자동 검색 실행
- [x] 스팸 방지

### 4.2 자연스러운 통합
- [x] 시스템 프롬프트 주입
- [x] "그때 애기했던..." 패턴
- [x] 스팸 방지

### 4.3 비유/연결
- [x] 과거 대화 비유 찾기
- [x] 선택적 활성화
- [x] 문제/해결/결과 패턴 감지

---

## 🎛️ Phase 5: 컨텍스트 관리 ✅

### 5.1 토큰 모니터링
- [x] 현재 토큰 수 추적
- [x] 80% 경고, 90% 자동 압축
- [ ] UI 게이지 (선택)

### 5.2 자동 압축
- [x] 오래된 메시지 요약
- [x] 핵심만 남기기
- [x] 원본 파일 저장
- [x] AI 요약 지원 (선택)

### 5.3 세션 연속성
- [x] 종료 시 요약 생성
- [x] 시작 시 요약 로드
- [ ] "이어가기" 버튼 (UI)

---

## 🎛️ Phase 5.4: 영속적 대화방 시스템 ✅

### 5.4.1 대화 처리 파이프라인
- [x] buildConversationMessages() - 메시지 배열 구성
- [x] getMessagesWithinTokenLimit() - 역순 메시지 추가
- [x] handleResponse() - 응답 처리 및 저장
- [x] 시스템 프롬프트 동적 구성
- [x] 자동 메모리 주입
- [x] 80% 도달시 자동 압축

### 5.4.2 토큰 폭발 방지
- [x] TokenSafeguard 클래스 - 실시간 모니터링
- [x] emergencyCompress() - 95% 강제 압축
- [x] truncateToolOutput() - Tool 출력 500 토큰 제한
- [x] Vision 토큰 계산
- [x] ManagedTokenizer - 5분/25회 자동 초기화
- [x] 단일 메시지 10% 제한

### 5.4.3 에이전트 체이닝
- [x] Agent 클래스
- [x] SequentialChain - 순차 실행
- [x] ParallelChain - 병렬 실행
- [x] ToolLayer

### 5.4.4 메모리 계층
- [x] ShortTermMemory - 최근 50개 메시지
- [x] MiddleTermMemory - 세션 요약 (파일)
- [x] LongTermMemory - 아카이브 (MongoDB)
- [x] MemoryManager - 통합 관리
- [x] 자동 계층 이동

### 5.4.5 세션 연속성
- [x] saveSessionState() - 세션 상태 저장
- [x] restoreSession() - 세션 복원
- [x] generateResumePrompt() - 재개 프롬프트
- [x] 시간 인지 재개 메시지
- [x] 자동 저장 (1분 간격)
- [x] 세션 만료 관리 (30일)

---

## 🏷️ Phase 6: 태그 진화 (보류)

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

## ⚡ Phase 7: 프롬프트 캐싱 (보류)

- [ ] DB 스키마: PromptCacheUsage
- [ ] 자동 저장: recordTokenUsage()
- [ ] Stats API: GET /api/prompt-caching/stats
- [ ] 기본값 활성화

---

## 🎯 Phase 8: 스마트 라우팅 ✅

### 8.1 스마트 라우터
- [x] SmartRouter 클래스
- [x] analyzeTask() - 복잡도 분석 (0-10)
- [x] detectTaskType() - 11개 태스크 유형 탐지
- [x] selectModel() - Haiku/Sonnet/Opus 자동 선택
- [x] 비용 추정
- [x] 라우팅 통계

### 8.2 단일 인격 시스템
- [x] PersonalityCore 클래스
- [x] PERSONALITY_PROFILE (인격 정의)
- [x] generateSystemPrompt() - 일관된 프롬프트
- [x] validateResponse() - 응답 일관성 검증
- [x] handleModelSwitch() - 모델 전환 시 컨텍스트 유지
- [x] trackTopic() - 대화 주제 추적
- [x] setUserPreference() - 사용자 선호도

### 8.3 API & 테스트
- [x] POST /api/chat - 스마트 라우팅 통합
- [x] POST /api/chat/analyze-task
- [x] GET /api/chat/routing-stats
- [x] GET /api/chat/models, personality
- [x] POST /api/chat/personality/preference
- [x] 통합 테스트 완료
- [x] SMART_ROUTING.md 문서화

---

## 🎨 Phase 9: UI 개선

### 9.1 메모리 탐색
- [ ] 타임라인 뷰
- [ ] 태그 클라우드
- [ ] 관계 그래프 시각화

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
- [ ] 대화창 MCP 버튼 연동

### 9.5 알림 센터
- [ ] 알림 목록 (NotificationCenter)
- [ ] 우선순위 표시
- [ ] 읽음/미읽음
- [ ] 타입별 필터
- [ ] NotificationBadge
- [ ] 실시간 폴링 (30초)

### 9.6 컨텍스트 UI
- [ ] 토큰 게이지 (선택)

### 9.7 단일 대화방 시스템

#### 9.7.1 UI 정리
- [x] Nav.tsx 간소화
- [x] 채팅방 리스트 제거
- [x] 새 대화 버튼 제거 (좌측 Nav)
- [x] 에이전트 마켓 제거
- [x] 검색바 제거
- [x] 북마크 제거
- [x] 새 대화 버튼 제거 (우측 상단) ⭐
- [x] 대화방 제목 제거 ("New Chat" 등) ⭐
- [x] Header 상단 떠있는 UI 전부 제거 ⭐
- [x] 햄버거 버튼만 남기기 (알림/사용자/설정 제거)

#### 9.7.2 라우팅
- [x] ChatRoute.tsx: 고정 'main-conversation'
- [x] routes/index.tsx: index: true
- [x] useNewConvo.ts: navigate('/')
- [x] URL: `/` 만 사용

#### 9.7.3 API
- [x] convos.js: GET /:id만 유지
- [x] main-conversation 자동 생성
- [x] 불필요한 라우트 제거
- [x] 정적 파일 서빙 설정 (Express)

#### 9.7.4 작동 확인
- [x] URL 깔끔 (/)
- [x] /c/new 리다이렉트 해결
- [x] Service Worker 갱신
- [x] Header UI 완전 정리 ⭐
- [x] 메시지 송수신 테스트 (구조 확인 완료)
- [x] 새로고침 후 대화 유지 확인 (loadRecentMessages 구현 완료)

#### 9.7.5 메모리 통합
- [x] 고정 대화방에 메모리 연결 (conversation-pipeline)
- [x] API 연동 확인 (GET /api/chat/history/:sessionId)
- [x] 메모리 자동 저장 (handleResponse)
- [x] 프론트 API 클라이언트 업데이트 (chat-simple → /api/chat)
- [x] 컨텍스트 압축 시 메모리 유지 (이미 구현됨)
- [ ] 메모리 설정 UI (보류)

---

## 🚀 Phase 10: 배포 & 최적화 (보류)

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

## 🌐 Phase 11: 네트워크 (보류)

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

## 🔄 Phase A: 자동 업데이트 (보류)

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

## 🔔 Phase N: 알림 시스템 (보류)

- [ ] 알림 DB 테이블
- [ ] 알림 큐 관리
- [ ] 상태 추적 (pending/delivered/read)
- [ ] 트리거 조건 (작업 완료, 에러, 결정 등)
- [ ] 전달 방식 (메시지 직접 전달, 알림창 표시)
- [ ] 우선순위 관리 (1-10)
- [ ] 맥락 인지
- [ ] 자연어 메시지 생성

---

## ⏰ Phase T: 시간 인지 (보류)

- [ ] 대화 이력 DB
- [ ] 현재 시간 정보
- [ ] 패턴 분석 (빈도, 시간대)
- [ ] 맥락 연속성
- [ ] 시간 기반 응답
- [ ] 안부 시스템
- [ ] 시스템 프롬프트 주입

---

## 🤖 Phase X: AI 모델 관리 시스템 ✅

### X.1 데이터베이스 스키마
- [x] APIKey 모델 - AES-256-CBC 암호화
- [x] AIServices 모델 - 5개 기본 서비스
- [x] UserProfile 모델 - 테마, 선호도, 활동 추적

### X.2 동적 모델 관리
- [x] 제공사별 API 연동
- [x] API 키 검증 시스템
- [x] 에러 처리 강화
- [x] 2단계 드롭다운 UI

### X.3 고급 서비스 관리 (보류)
- [ ] 커스텀 서비스 CRUD
- [ ] 수동 갱신

### X.4 설정 UI
- [x] 햄버거 메뉴 "🤖 AI 설정"
- [x] API 키 입력/저장 (암호화)
- [x] 서버 재시작 없이 즉시 적용
- [x] API 키 검증
- [x] 동적 모델 목록 로딩
- [ ] Soul 인격 설정 (보류)
- [ ] 백그라운드 작업 모델 (보류)

### X.5 자동 갱신 (보류)
- [ ] 매일 새벽 3시 자동 갱신
- [ ] 갱신 실패 시 알림

### X.6 대화방 UI 정리
- [ ] Header 모델 선택 UI 제거
- [ ] "Who am I talking to?" 제거

### X.7 AI 서비스 관리 UI
- [x] 서비스 카드 렌더링
- [x] "+ 서비스 추가" 버튼 (모달)
- [x] 활성화/비활성화 토글
- [x] 모델 갱신 버튼
- [x] 연결 테스트 버튼
- [x] 수정/삭제 버튼 (커스텀만)
- [x] 모달 UX 개선

### X.8 사용자 설정 영구 저장
- [x] 테마 설정 MongoDB 저장
- [x] 2중 저장 시스템 (localStorage + MongoDB)
- [x] ThemeManager 서버 연동
- [x] 프로필 자동 생성

### X.9 Claude Code 언어 설정
- [x] .claude/settings.local.json 한국어
- [x] Compact 후에도 한국어 유지
- [x] 권한 설정 영구 보존


-----------


## 📚 개발 레퍼런스 + 중요메모

### 🗂️ 폴더 구조
```
/workspaces/.soul/
├── soul/               # 백엔드
│   ├── server/
│   ├── models/        # MongoDB 모델
│   ├── routes/        # API 라우트
│   ├── utils/         # 유틸리티
│   ├── config/
│   └── memory/
├── client/            # 프론트엔드
│   ├── src/
│   ├── public/
│   └── index.html
├── memory/            # 메모리 저장소
│   ├── raw/          # YYYY-MM-DD_HHmmss_주제.md
│   ├── processed/
│   └── index.json
├── files/            # 파일 저장소
│   ├── uploads/
│   └── processed/
├── mcp/              # MCP 서버들
│   ├── hub-server.js
│   └── tools/
├── docs/             # 문서
├── install.sh
└── README.md
```

### 🔑 환경변수 (.env)
```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/soul

# 경로
MEMORY_PATH=/path/to/memory
FILES_PATH=/path/to/files
MCP_PATH=/path/to/mcp

# AI API Keys
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=

# 암호화
ENCRYPTION_KEY=

# 서버
PORT=3000
JWT_SECRET=
```

### 🛣️ API 엔드포인트

#### 메모리 (Phase 1)
- `POST /api/memory/archive` - 대화 저장

#### AI 분류 (Phase 2)
- `GET /api/ai-models/services` - AI 서비스 목록
- `POST /api/ai-models/test` - AI 서비스 테스트
- `GET /api/config/ai` - AI 설정 조회
- `PATCH /api/config/ai` - AI 설정 변경

#### 검색 (Phase 3)
- `GET /api/search` - 기본 검색
- `POST /api/search/advanced` - 고급 검색
- `GET /api/search/tags` - 태그 목록
- `GET /api/search/categories` - 카테고리 목록
- `GET /api/search/stats` - 통계
- `POST /api/search/smart` - 지능형 검색
- `GET /api/search/similar/:id` - 유사 대화
- `GET /api/search/graph` - 관계 그래프
- `GET /api/search/recommendations` - 추천
- `POST /api/search/by-tags` - 태그 검색

#### 컨텍스트 (Phase 4)
- `POST /api/context/detect` - 맥락 감지
- `POST /api/context/extract-keywords` - 키워드 추출
- `POST /api/context/evaluate-trigger` - 트리거 평가
- `POST /api/context/find-memories` - 메모리 검색
- `POST /api/context/generate-prompt` - 프롬프트 생성
- `POST /api/context/check-spam` - 스팸 방지

#### 비유 (Phase 4)
- `POST /api/analogy/analyze` - 비유 분석
- `POST /api/analogy/find` - 비유 검색
- `POST /api/analogy/detect-patterns` - 패턴 감지
- `POST /api/analogy/should-activate` - 활성화 체크
- `GET /api/analogy/config` - 설정 조회
- `PATCH /api/analogy/config` - 설정 변경

#### 컨텍스트 관리 (Phase 5)
- `POST /api/context-mgmt/analyze` - 토큰 분석
- `POST /api/context-mgmt/estimate-tokens` - 토큰 추정
- `POST /api/context-mgmt/compress` - 압축
- `POST /api/context-mgmt/should-compress` - 압축 필요 체크
- `POST /api/context-mgmt/session-summary` - 세션 요약
- `GET /api/context-mgmt/restore/:id` - 세션 복원
- `GET /api/context-mgmt/config` - 설정 조회
- `PATCH /api/context-mgmt/config` - 설정 변경
- `GET /api/context-mgmt/model-limits` - 모델 제한

#### 대화 (Phase 5.4)
- `POST /api/chat` - 메시지 전송
- `POST /api/chat/resume` - 세션 재개
- `POST /api/chat/end` - 세션 종료
- `GET /api/chat/sessions` - 활성 세션
- `GET /api/chat/memory-stats` - 메모리 통계
- `GET /api/chat/token-status` - 토큰 상태
- `POST /api/chat/compress` - 수동 압축

#### 스마트 라우팅 (Phase 8)
- `POST /api/chat/analyze-task` - 태스크 분석
- `GET /api/chat/routing-stats` - 라우팅 통계
- `GET /api/chat/models` - 모델 목록
- `GET /api/chat/personality` - 인격 정보
- `POST /api/chat/personality/preference` - 선호도 설정

#### AI 서비스 (Phase X)
- `POST /api/config/api-key` - API 키 저장
- `GET /api/config/api-key/:service` - API 키 확인
- `DELETE /api/config/api-key/:service` - API 키 삭제
- `GET /api/ai-services` - 서비스 목록
- `GET /api/ai-services/:id` - 서비스 상세
- `POST /api/ai-services` - 서비스 추가
- `PATCH /api/ai-services/:id` - 서비스 수정
- `DELETE /api/ai-services/:id` - 서비스 삭제
- `POST /api/ai-services/:id/toggle` - 활성화 토글
- `POST /api/ai-services/:id/refresh-models` - 모델 갱신
- `POST /api/ai-services/:id/test` - 연결 테스트
- `GET /api/config/models/:service` - 모델 목록
- `POST /api/config/ai/default` - 기본 모델 저장
- `POST /api/config/api-key/validate` - API 키 검증

#### 프로필 (Phase X)
- `GET /api/profile/user/:userId` - 프로필 조회
- `PUT /api/profile/user/:userId` - 프로필 업데이트
- `GET /api/profile/user/:userId/theme` - 테마 조회
- `PATCH /api/profile/user/:userId/theme` - 테마 저장

### 📦 주요 파일

#### MongoDB 모델
- `soul/models/APIKey.js` - API 키 암호화
- `soul/models/AIService.js` - AI 서비스
- `soul/models/UserProfile.js` - 사용자 프로필

#### 유틸리티
- `soul/utils/ai-service.js` - AI 서비스 팩토리
- `soul/utils/search.js` - 검색 엔진
- `soul/utils/smart-search.js` - 지능형 검색
- `soul/utils/recommendation.js` - 추천 시스템
- `soul/utils/context-detector.js` - 맥락 감지
- `soul/utils/analogy-finder.js` - 비유 찾기
- `soul/utils/token-counter.js` - 토큰 계산
- `soul/utils/context-compressor.js` - 컨텍스트 압축
- `soul/utils/conversation-pipeline.js` - 대화 처리
- `soul/utils/token-safeguard.js` - 토큰 폭발 방지
- `soul/utils/agent-chain.js` - 에이전트 체이닝
- `soul/utils/memory-layers.js` - 메모리 계층
- `soul/utils/session-continuity.js` - 세션 연속성
- `soul/utils/smart-router.js` - 스마트 라우팅
- `soul/utils/personality-core.js` - 단일 인격

#### 프론트엔드
- `client/src/utils/menu-manager.js` - 햄버거 메뉴
- `client/src/utils/panel-manager.js` - 패널 시스템
- `client/src/utils/theme-manager.js` - 테마 관리
- `client/src/main.js` - 메인 엔트리

### 🔐 암호화
- **알고리즘**: AES-256-CBC
- **환경변수**: `ENCRYPTION_KEY`
- **저장**: MongoDB `APIKey` 컬렉션

### 🗄️ MongoDB 컬렉션
- `apikeys` - 암호화된 API 키
- `aiservices` - AI 서비스 설정
- `userprofiles` - 사용자 프로필 & 테마
- `conversations` - 대화 메타데이터
- `memories` - 장기 메모리 (Phase 5.4)

### 📝 conversationId
- **고정값**: `'main-conversation'`
- **용도**: 단일 영속 대화방

### 🎨 테마 저장
- **localStorage**: 즉시 복원
- **MongoDB**: 다른 기기 동기화
- **API**: `PATCH /api/profile/user/:userId/theme`

**라우팅 로직**:
- complexity ≥ 7 OR requiresExpertise → 고성능 모델 (예: Opus, GPT-4, Gemini Pro)
- complexity ≤ 3 AND NOT requiresReasoning → 경량 모델 (예: Haiku, GPT-3.5, Gemini Flash)
- else → 중간 모델 (예: Sonnet, GPT-4o, Gemini Pro)

**태스크 유형별 복잡도**:
- 경량 (1-2): 간단한 질문, 번역, 요약
- 중간 (4-6): 코드 생성, 리뷰, 분석, 문제 해결
- 고성능 (7-9): 아키텍처 설계, 복잡한 디버깅, 연구, 전문 컨설팅

**사용자 설정**:
- 각 복잡도 범위에 사용할 모델을 AI 설정에서 선택 가능
- 제공사 상관없이 원하는 모델 조합으로 구성
