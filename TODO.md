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
- [ ] **코드 감사** (8h)
  - [ ] librechat → soul 전면 변경
  - [ ] 하드코딩 제거 (sowon, 경로 등)
  - [ ] 환경변수 분리
  - [ ] 네이밍 통일
  
- [ ] **Phase 9 UI 완성** (10h)
  - [ ] 기존 UI 통합 (6h)
  - [ ] Claude 스타일 적용 (4h)
  
- [ ] **패널 시스템** (4h)
  - [ ] 탭/분할/팝업 모드
  - [ ] 자연어 제어 ("투두 보여줘", "탭으로 바꿔")
  
- [ ] **MCP 정리** (2h)
  - [ ] hub-server.js 재작성
  - [ ] tools/ 모듈화
  
- [ ] **자연어 제어 기초** (2h)
  - [ ] 의도 감지 로직
  - [ ] 패턴 매칭
  
- [ ] **통합 테스트** (4h)

### Week 2: 고급 기능 (30h)
- [ ] **메모리 고도화** (8h)
  - [ ] 관계 그래프 시각화
  - [ ] 타임라인 뷰
  - [ ] 태그 클라우드
  - [ ] 패턴 분석
  
- [ ] **알바 시스템** (8h)
  - [ ] 백그라운드 작업자 (요약, 비전, TTS, STT)
  - [ ] 작업 큐 관리
  - [ ] 상태 추적
  
- [ ] **Proactive Messaging** (4h)
  - [ ] 작업 완료 알림
  - [ ] 안부 시스템
  - [ ] 에러 알림
  
- [ ] **자연어 설정** (4h)
  - [ ] 의도 감지 고도화
  - [ ] 컨텍스트 추적
  - [ ] 패턴 학습
  
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
- [ ] Claude/GPT/로컬 모델 선택 가능
- [ ] 모델별 API 인터페이스
- [ ] 설정 UI

### 2.2 자동 분석
- [ ] 대화 종료 시 AI 분석
- [ ] 주제 3개 추출
- [ ] 태그 5-10개 생성
- [ ] 카테고리 분류
- [ ] 중요도 점수 (1-10)

### 2.3 결과 저장
- [ ] index.json 업데이트
- [ ] 파일명에 주제 반영
- [ ] 검색 인덱스 등록

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
- [ ] GET /api/search
- [ ] 키워드 매칭
- [ ] 날짜/태그/파일 유형 필터

### 3.2 지능형 검색
- [ ] "개떡같이" 검색어 해석
- [ ] 시간 추론 ("저번에", "최근")
- [ ] 맥락 기반 검색
- [ ] 관련성 순위

### 3.3 전문 검색
- [ ] Elasticsearch/MeiliSearch 연동
- [ ] OCR 텍스트 포함
- [ ] 금액/날짜 범위 검색

### 3.4 연관 검색
- [ ] 비슷한 주제 찾기
- [ ] 관계 그래프
- [ ] "이것도 볼래?" 추천

---

## 🧠 Phase 4: 자율 기억

### 4.1 맥락 감지
- [ ] 관련 주제 자동 감지
- [ ] 트리거 조건 설정
- [ ] 자동 검색 실행

### 4.2 자연스러운 통합
- [ ] 시스템 프롬프트 주입
- [ ] "그때 애기했던..." 패턴
- [ ] 스팸 방지

### 4.3 비유/연결
- [ ] 과거 대화 비유 찾기
- [ ] 선택적 활성화

---

## 🎛️ Phase 5: 컨텍스트 관리

### 5.1 토큰 모니터링
- [ ] 현재 토큰 수 추적
- [ ] 80% 경고, 90% 자동 압축
- [ ] UI 게이지 (선택)

### 5.2 자동 압축
- [ ] 오래된 메시지 요약
- [ ] 핵심만 남기기
- [ ] 원본 파일 저장

### 5.3 세션 연속성
- [ ] 종료 시 요약 생성
- [ ] 시작 시 요약 로드
- [ ] "이어가기" 버튼

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

---

## 🎯 Phase 8: 스마트 라우팅

- [ ] 복잡도 분석: complexity.js
- [ ] API 라우트 수정
- [ ] Batch 큐 구현
- [ ] Cron Job
- [ ] 테스트

**메모**: Haiku(간단) vs Sonnet(복잡) 자동 선택

---

## 🔔 Phase N: 알림 시스템

- [ ] 알림 DB 테이블
- [ ] 알림 큐 관리
- [ ] 상태 추적 (pending/delivered/read)
- [ ] 트리거 조건 (작업 완료, 에러, 결정 등)
- [ ] 전달 채널 (웹/대화창/외부)
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