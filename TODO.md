## 항상 작업 전 확인 / 작업 후 업데이트할 것! : 체크 및 중요메모

## 🔥 최근 작업 현황 (2026-01-25)

# Soul AI - TODO & 작업 이력

## 📋 현재 진행 상황

### ✅ 완료된 작업들 (2026-01-25)

#### 4. 메모리 설정 DB 연동 완료 (15:55~16:00)
**문제**: 메모리 설정이 localStorage에만 저장되어 백엔드가 인식 못함
```
프론트: localStorage.setItem('memoryConfig') → 브라우저만 저장
백엔드: 하드코딩 (shortTermSize: 50, archiveThreshold: 100)
```

**해결**: 
- ✅ 프론트엔드: API 호출로 변경 (`PUT /api/config/memory`)
- ✅ 백엔드: DB 설정 읽어오도록 수정
  - memory-layers.js - DB 값 사용
  - getMemoryManager - archiveThreshold, sessionSummaryInterval DB 로드
- ✅ DB 기본값 설정
  ```javascript
  {
    autoSave: true,
    autoInject: true,
    shortTermSize: 50,
    compressionThreshold: 80,
    archiveThreshold: 100,
    sessionSummaryInterval: 50
  }
  ```

**파일 변경**:
```
/client/src/settings/components/ai-settings.js  (이미 수정됨)
/soul/utils/memory-layers.js                    (DB 설정 사용)
```

**결과**:
- ✅ 설정 페이지에서 변경 → MongoDB 저장 → 백엔드 적용
- ✅ 컨테이너 재시작 후에도 설정 유지
- ✅ Git: (커밋 예정)

---

#### 3. 커스텀 필드 textarea 타입 추가
**문제**: Docker 컨테이너 재빌드 시 settings.json 초기화
**해결**: MongoDB 기반 설정 저장 시스템 구축

**구현 내용**:
- SystemConfig 모델 생성 (key-value 저장)
- ConfigManager 전면 수정 (파일 → DB)
- 마이그레이션 스크립트 작성 및 실행
- 'auto' 라우팅 모드 추가 (API 키 없을 때 안내)

**파일 변경**:
```
/soul/models/SystemConfig.js          (신규)
/soul/utils/config.js                 (DB 기반으로 수정)
/soul/migrate-settings.js             (신규)
/soul/utils/smart-router.js           ('auto' 처리)
/client/src/settings/components/ai-settings.js  (안내 메시지)
/client/src/settings/styles/settings.css        (스타일)
```

**결과**: 
- ✅ 컨테이너 재빌드해도 설정 유지
- ✅ API 키 없어도 친화적 안내
- ✅ Git: f27fd71

---

#### 2. 프론트엔드 버그 수정 (15:22~15:29)

**문제 1**: 프로필 날짜 필드 에러
```
RangeError: Invalid time value at Date.toISOString()
```
**원인**: 유효하지 않은 날짜값 ("ㄱㄴㄷㄹ" 등)
**해결**: 날짜 유효성 체크 추가
```javascript
const date = value ? new Date(value) : null;
const dateValue = (date && !isNaN(date.getTime())) 
  ? date.toISOString().split('T')[0] 
  : '';
```

**문제 2**: MCP API 500 에러
```
ENOENT: no such file or directory, scandir '/mcp/tools'
```
**해결**: 
- `./data/mcp/tools` 디렉토리 생성
- docker-compose.yml 볼륨 마운트 추가
- 컨테이너 재시작

**파일 변경**:
```
/client/src/settings/components/profile-settings.js  (날짜 체크)
/docker-compose.yml                                   (MCP 볼륨)
/data/mcp/tools/                                      (디렉토리 생성)
```

**결과**:
- ✅ 프로필 설정 정상 작동
- ✅ MCP 서버 API 정상
- ✅ Git: 39fc49b

---

### 🔄 시스템 아키텍처 변경사항

**설정 저장 방식**:
```
Before: settings.json (컨테이너 내부) → 재빌드 시 초기화
After:  MongoDB (영구 저장) → 재빌드 후에도 유지
```

**라우팅 기본값**:
```
Before: Claude 모델 하드코딩 → API 키 필수
After:  'auto' 모드 → 사용 가능한 모델 자동 선택
```

**데이터 영구성**:
```
✅ MongoDB 데이터: /Volumes/soul/app/data/mongodb (호스트)
✅ MCP 서버: /Volumes/soul/app/data/mcp (호스트)
✅ 파일 저장소: /Volumes/soul/app/data/files (호스트)
✅ 메모리: /Volumes/soul/app/memory (호스트)
```

---

## 📝 다음 작업자를 위한 가이드

### 프론트엔드 코드 수정 시 주의사항

**중요**: 프론트엔드는 **프로덕션 빌드** 모드!

코드 수정 후 반드시 재빌드:
```bash
cd /Volumes/soul/app
docker-compose build --no-cache soul-frontend
docker-compose up -d soul-frontend
```

브라우저 강력 새로고침:
- Mac: `Cmd + Shift + R`
- Windows: `Ctrl + Shift + R`

### 설정 관련 작업

**설정 확인**:
```bash
# MongoDB 설정 조회
curl http://localhost:3001/api/config/routing

# 라우팅 설정 수정
curl -X PUT http://localhost:3001/api/config/routing \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "light": "auto", "medium": "auto", "heavy": "auto"}'
```

**설정 저장 위치**:
- MongoDB: `systemconfigs` 컬렉션
- Key: "ai", "routing", "memory", "files"

### Git 커밋 이력

```
39fc49b - 🐛 날짜 필드 유효성 체크 + MCP 디렉토리 마운트 추가
f27fd71 - ✅ Auto 라우팅 + 안내 메시지 추가  
266895e - ✅ 설정 DB 마이그레이션 완료
```

---

## 🗑️ 정리 가능한 파일

### soul-backup/ (64KB)
- MongoDB 백업 (2026-01-25 13:46)
- 설정 마이그레이션 전 백업
- 현재 DB 정상 작동 중

**삭제 가능**:
```bash
cd /Volumes/soul/app
rm -rf soul-backup/
```

또는 **압축 보관**:
```bash
tar -czf soul-backup-20260125.tar.gz soul-backup/
rm -rf soul-backup/
```

---

### ✅ 커스텀 필드 textarea 타입 추가
**날짜**: 2026-01-25 15:33

**문제**: 프로필 커스텀 필드에서 textarea 타입 선택 시 500 에러
```
Profile validation failed: customFields.1.type: 
`textarea` is not a valid enum value for path `type`.
```

**해결**: Profile.js 스키마 enum에 'textarea' 추가
```javascript
// Before
enum: ['text', 'number', 'date', 'tag', 'list', 'url', 'select']

// After  
enum: ['text', 'number', 'date', 'tag', 'list', 'url', 'select', 'textarea']
```

**Git**: 1bb4347

---

### ✅ 날짜 필드 유효성 체크 + MCP 디렉토리 수정
**날짜**: 2026-01-25 15:22~15:27

**문제 1**: 프로필 설정 날짜 필드에서 Invalid time value 에러
**원인**: 사용자가 날짜 필드에 "ㄱㄴㄷㄹ" 같은 유효하지 않은 값 입력
**해결**: `new Date(value)` 유효성 체크 추가
```javascript
const date = value ? new Date(value) : null;
const dateValue = (date && !isNaN(date.getTime())) ? date.toISOString().split('T')[0] : '';
```

**문제 2**: MCP 버튼 클릭 시 500 에러 (ENOENT: /mcp/tools)
**원인**: `/mcp/tools` 디렉토리 없음
**해결**: 
- `./data/mcp/tools` 디렉토리 생성
- docker-compose.yml에 `./data/mcp:/mcp` 볼륨 마운트 추가
- 컨테이너 재시작 (down → up)

**완료**:
- [x] 날짜 유효성 체크 (기본 필드 + 커스텀 필드)
- [x] MCP 디렉토리 생성 및 마운트
- [x] 컨테이너 재시작
- [x] API 정상 작동 확인

**Git**: 39fc49b

---

### ✅ 설정 DB 마이그레이션 + Auto 라우팅 완료
**날짜**: 2026-01-25 14:10~15:10

**문제 1**: settings.json이 Docker 컨테이너 내부에 있어 재빌드 시 초기화됨
**해결**: 모든 설정을 MongoDB로 이전하여 영구 보존

**문제 2**: 라우팅 설정이 Claude 모델로 하드코딩되어 API 키 없으면 사용 불가
**해결**: 'auto' 모드 추가 + 프론트엔드 안내 메시지

**완료 작업**:
- [x] SystemConfig 모델 생성 (`/soul/models/SystemConfig.js`)
- [x] ConfigManager DB 기반으로 수정 (`/soul/utils/config.js`)
  - [x] readConfig() → MongoDB 조회
  - [x] writeConfig() → MongoDB 저장
  - [x] 기본값을 'auto'로 변경
- [x] 초기 데이터 마이그레이션
  - [x] migrate-settings.js 스크립트 작성
  - [x] 마이그레이션 실행 성공
- [x] Auto 라우팅 구현
  - [x] updateModelsFromConfig에서 'auto' 처리 (기본 모델 사용)
  - [x] DB 설정을 'auto'로 업데이트
- [x] 프론트엔드 안내 메시지
  - [x] API 키 없을 때 드롭다운 비활성화
  - [x] "API 키를 먼저 설정해주세요" 안내 박스
  - [x] CSS 스타일 추가
- [x] 테스트 및 검증
  - [x] 컨테이너 재시작 후 DB에서 정상 로드 확인

**결과**: 
- 컨테이너 재빌드해도 설정 유지됨! 🎉
- API 키 없어도 'auto' 모드로 기본 모델 사용 가능
- 사용자 친화적인 안내 메시지 추가

---

### ✅ 완전 포터블 맥 환경 구축 완료 🎉
**날짜**: 2026-01-25 13:55

**완료 내용**:
- [x] APFS 볼륨 생성 (`/Volumes/soul/app`, 30GB)
- [x] Docker Compose 완전 포터블 구조 구축
- [x] MongoDB 백업 (코드스페이스 → 맥) 및 복원 완료
- [x] Frontend/Backend 빌드 및 컨테이너 실행 성공
- [x] 전체 시스템 가동 확인 (http://localhost:3080)

**시스템 상태**:
```
✅ MongoDB: 14개 문서 복원 완료
✅ Backend: http://localhost:3001 - AI 서비스, 프로필, Role 초기화 완료
✅ Frontend: http://localhost:3080 - Vite 빌드 완료, Nginx 서빙
✅ 포터블: ./start.sh 한 번으로 전체 시스템 실행
```

**아키텍처**:
```
/Volumes/soul/app/
├── docker-compose.yml (상대 경로만)
├── start.sh (자동 실행 스크립트)
├── soul/ (백엔드)
├── client/ (프론트엔드)
├── data/ (자동 생성 - MongoDB 데이터)
└── memory/ (메모리 저장소)
```

**특징**:
- 환경별 경로 하드코딩 완전 제거
- 폴더 복사만으로 어디서든 실행 가능
- 맥미니 이전: `rsync -av /Volumes/soul/app/ 맥미니:/path/`
- Docker만 있으면 실행 (~5GB 설치)

**다음 단계**:
- [ ] 외장하드 연결 시 데이터 이전 (1TB)
- [ ] 맥미니 구매 후 rsync로 마이그레이션
- [ ] 코드스페이스 완전 삭제 (비용 절감)

---

## 🔥 이전 작업 현황 (2026-01-24)

### ✅ 메모리 검색 UI 구현 완료
**위치**: `/client/src/utils/search-manager.js`

**구현 내용**:
- SearchManager 클래스 - 검색 이벤트, API 호출, 결과 렌더링
- 디바운스 검색 (300ms) + Enter 키 즉시 검색
- Smart Search API 연동 (`/api/search/smart`)
- 검색 결과 드롭다운 UI (glassmorphism 스타일)
- 검색어 하이라이트, 날짜 포맷팅
- 검색 결과 클릭 시 Canvas 패널에 메모리 상세 표시

**변경 파일**:
- `/client/src/utils/search-manager.js` - 신규 생성
- `/client/src/styles/main.css` - 검색 드롭다운 CSS 추가
- `/client/src/main.js` - SearchManager 통합
- `/client/index.html` - 버전 업데이트 (CSS v37, JS v19)

**참고**: 메모리 자동 아카이브 기능은 서버 구축 후 구현 예정 (Phase 1.4)

---

## 🔥 이전 작업 현황 (2026-01-23)

### ✅ 토큰 낭비 방지 - 역할 시스템 리팩토링 완료
**문제**: 채팅 1회당 최대 3번의 AI API 호출 발생
- LLM 역할 선택 (selectRole) - 후보가 2개 이상이면 호출
- LLM 역할 제안 (suggestNewRole) - 적합한 역할 없으면 호출
- 실제 채팅 응답

**해결**: Soul 중심 아키텍처로 변경
```
Before: 메시지 → LLM역할선택 → LLM역할제안 → LLM응답 (최대 3회)
After:  메시지 → Soul응답 → (필요시만) 알바호출 (기본 1회)
```

**변경 파일**:
- `/soul/routes/chat.js`
  - [x] 사전 역할 선택 로직 제거 (약 100줄 삭제)
  - [x] `getRoleSelector` import 제거
  - [x] 활성 알바 목록을 시스템 프롬프트에 추가
  - [x] `[DELEGATE:역할ID]` 태그 감지 및 처리 로직 추가
  - [x] Soul이 필요시에만 알바 호출하는 구조

- `/soul/utils/personality-core.js`
  - [x] Role 모델 import 추가

**새로운 동작 방식**:
1. Soul이 모든 메시지를 먼저 받음
2. 시스템 프롬프트에서 사용 가능한 알바 목록 인지
3. 복잡한 전문 작업 필요시 `[DELEGATE:역할ID]` 태그로 알바 호출
4. 간단한 작업은 Soul이 직접 처리

**미래 확장 계획**:
- Mac Mini 서버 구축 후 로컬 LLM이 사소한 작업 처리
- 로컬 LLM → Soul(API) → 알바(API) 계층 구조

---

## 🔥 이전 작업 현황 (2026-01-22)

### ✅ 설정 페이지 프레임워크 완전 리팩토링 완료
**위치**: `/workspaces/.soul/client/src/settings/`

**새로운 구조**:
```
settings/
├── settings-manager.js         # 프레임워크 (라우팅, 네비게이션)
├── components/                 # 페이지별 컴포넌트 (동적 로드)
│   ├── profile-settings.js     # 프로필 설정 ✅
│   ├── ai-settings.js          # AI 설정 (플레이스홀더)
│   └── theme-settings.js       # 테마 설정 (플레이스홀더)
└── styles/
    └── settings.css            # 공통 스타일 (JS 모듈로 임포트)
```

**주요 변경 사항**:
- ❌ **기존**: `profile-manager.js`에 모든 로직 집중, `index.html`에 CSS 직접 링크
- ✅ **현재**: 컴포넌트 기반 아키텍처, 동적 모듈 로딩, CSS 모듈 임포트
- 각 설정 페이지는 독립 컴포넌트로 분리 → 필요할 때만 `import()`로 로드
- 탭 네비게이션 (프로필/AI/테마) 지원
- Vite HMR로 CSS/JS 자동 핫 리로드

**새로운 설정 페이지 추가하는 법**:
1. `settings/components/new-settings.js` 생성
2. `SettingsManager.getComponent()`에 라우팅 추가
3. 끝! (자동으로 통합됨)

**관련 파일**:
- `/client/src/main.js` - 프로필 버튼 클릭 시 SettingsManager 로드
- `/client/src/settings/` - 모든 설정 관련 코드

---

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
- **Omi 방식 점진적 밀도 증가** (아래 Phase 1.5 참고)
- 역순 메시지 추가 기법
- 토큰 폭발 방지 메커니즘
- 맥락 자동 감지 파이프라인
- 세션 연속성 시스템

**⚠️ 중요**: Phase 1.5 메모리 밀도 압축 시스템은 **라즈베리파이 시절 설계**되었으나 구현 안 됨. 
현재 코드는 단순 압축만 있고, 레벨별 밀도 시스템 없음. 반드시 Phase 1.5 내용 확인 후 작업할 것!

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

### 1.4 자동 아카이브 (서버 구축 후 구현) ⏸️
**현재 상태**: API만 구현됨 (`/api/memory/archive`), 수동 호출 필요

**구현 예정 기능**:
- [ ] 대화 종료 시 자동 아카이브
- [ ] 일정 메시지 수 이상이면 자동 아카이브 (예: 10개)
- [ ] UI에 수동 아카이브 버튼 추가
- [ ] 아카이브 트리거 설정 (자동/수동/조건부)

**참고**: 현재 대화는 MongoDB에 실시간 저장, 메모리 아카이브는 별도 저장소

---

### 1.5 메모리 밀도 압축 시스템 🔴 **미구현**

**⚠️ 핵심**: 라즈베리파이 시절 설계 → 2026-01-25 재설계 (소원 상의)

#### 📚 **기본 철학: 사람의 기억처럼**
```
사람의 기억: 가까운 것 자세히 ←→ 먼 것 희미하게
일기장: 필요하면 언제든 자세히 볼 수 있음
```

**핵심 원칙**:
- 장기 = 원문 영구 보관 (절대 압축 안 함, 절대 삭제 안 함)
- 중기 = 장기에서 최근 N개월 요약본 (검색용 인덱스, 오래되면 폐기)
- 단기 = 컨텍스트 윈도우 내 (80/10/10 밀도 비율)
- 압축 = 복합적 (사실/감정/맥락 모두 포함, 밀도만 줄임)

#### 🗂️ **1단계: 원본 대화 실시간 저장 (장기 메모리)**
```
/memory/conversations/
├── 2026-01/
│   ├── 2026-01-25.json
│   ├── 2026-01-26.json
│   └── ...
├── 2026-02/
└── ...

- 메시지 올 때마다 실시간 원문 저장 (대화 종료 트리거 X)
- 절대 삭제 안 됨, 절대 압축 안 됨
- 이게 "일기장" → 필요시 태그 검색 → 주변 맥락 로드
```

**메시지 저장 구조**:
```javascript
{
  // 원문
  role: "user",
  content: "야 나 졸려",
  timestamp: "2026-01-25T03:42:00",
  tokens: 15,
  
  // 메타 (객관적 사실)
  meta: {
    silenceBefore: 10800,   // 이전 메시지로부터 경과 시간 (초)
    responseTime: 2.3,       // AI 응답까지 걸린 시간 (초)
    timeOfDay: "새벽",       // 시간대
    dayOfWeek: "토요일"      // 요일
  },
  
  // AI 내면 메모 (주관적 해석, 선택적)
  aiMemo: "3시간 만에 말 걸어옴. 새벽 3시. 잠 못 자는 듯.",
  
  // 태그 (검색용)
  tags: ["늦은밤", "피로", "일상"]
}
```

**구현 계획**:
- [ ] ConversationArchiver 클래스 생성
- [ ] 메시지 수신 시 실시간 JSON 저장
- [ ] meta 필드 자동 계산 (침묵 시간, 시간대 등)
- [ ] aiMemo 생성 (선택적, 알바 작업)
- [ ] 태그 자동 생성
- [ ] 파일 구조: 월별 폴더 / 일별 파일

#### 🧠 **2단계: 컨텍스트 윈도우 밀도 관리 (단기 메모리)**

**컨텍스트 윈도우 구성 비율** (설정 가능):
```
┌─────────────────────────────────────────────────┐
│                  컨텍스트 윈도우                  │
├─────────────────────────────────────────────────┤
│ 80% │ 원문 (최신 대화)                           │
│     │ → densityLevel: 0                         │
├─────────────────────────────────────────────────┤
│ 10% │ 느슨한 압축 (감정/맥락 유지)                │
│     │ → densityLevel: 1                         │
├─────────────────────────────────────────────────┤
│ 10% │ 더 압축 (핵심만, 태그 포함)                 │
│     │ → densityLevel: 2                         │
└─────────────────────────────────────────────────┘
```

**압축 예시 (복합적 - 사실/감정/맥락 모두 포함)**:
```javascript
// 원문 (densityLevel: 0)
"야 나 졸려 ㅠㅠ 오늘 진짜 힘들었어 회의 5개나 했거든"

// 느슨한 압축 (densityLevel: 1)
"새벽, 피곤해함. 회의 5개 힘든 하루"

// 더 압축 (densityLevel: 2)  
"[새벽] 피곤, 바쁜 하루"
tags: ["피로", "회의", "야근"]
```

**⚠️ 중요**: 압축 ≠ 사실만 남기기
- 감정, 톤, 관계 맥락 모두 유지
- 밀도만 줄이는 것
- "다른 애 되는" 문제 방지

#### 🔄 **3단계: 중기 메모리 (검색용 요약본)**

**위치**: 장기 메모리(원문) 위에 레이어로 존재
```
/memory/summaries/
├── 2026-01/
│   ├── week1.json   (1주차 요약)
│   ├── week2.json
│   └── ...
└── ...

- 최근 N개월만 유지 (설정 가능, 기본 3개월)
- 오래되면 요약본 폐기 (원문은 영구 보존)
- 검색 시 요약본 먼저 훑고, 필요하면 원문 로드
```

**요약본 구조**:
```javascript
{
  period: "2026-01-20 ~ 2026-01-26",
  densityLevel: 1,  // 또는 2
  
  // 단계별 요약
  summaries: [
    {
      level: 1,
      content: "프로젝트 회의 다수. UI/API/DB 변경 결정. 야근 많음.",
      tokens: 50
    },
    {
      level: 2,
      content: "프로젝트 집중 기간, 피로 누적",
      tokens: 20
    }
  ],
  
  // 원문 참조
  sourceFiles: ["2026-01-20.json", "2026-01-21.json", ...],
  
  // 검색용 태그
  tags: ["프로젝트", "회의", "UI", "API", "DB", "야근", "피로"]
}
```

**검색 플로우**:
```
1. 쿼리 → 중기 요약본 검색
2. 관련 기간 찾음
3. 더 자세히 필요? → 장기에서 해당 날짜 원문 로드
4. 주변 맥락까지 로드 (앞뒤 메시지)
```

#### ⚙️ **4단계: 자동 압축 프로세스**

```javascript
// 컨텍스트 사용량 체크
if (contextUsage > 80%) {
  // 가장 오래된 원문 → Level 1 압축
  const oldMessages = getOldestLevel0Messages();
  await AlbaSystem.compress(oldMessages, targetLevel: 1);
}

if (contextUsage > 90%) {
  // Level 1 → Level 2 추가 압축
  const level1Messages = getLevel1Messages();
  await AlbaSystem.compress(level1Messages, targetLevel: 2);
}

// Level 2 넘어가면 → 컨텍스트에서 제거, 중기 메모리로 이동
// (장기 원문은 이미 저장되어 있음)
```

**알바 압축 작업**:
- [ ] CompressionAlba 클래스 (백그라운드 워커)
- [ ] AI 기반 요약 생성 (Haiku/로컬 모델)
- [ ] **압축 프롬프트**: "감정/톤/관계 맥락 유지하면서 밀도만 줄여"
- [ ] 원본 메시지 ID 추적
- [ ] 태그 자동 생성
- [ ] aiMemo도 함께 압축 (AI 내면 기록 보존)

#### 🔍 **5단계: AI 메모리 로드 전략**

```javascript
async function loadMemoryForContext(query, maxTokens) {
  const memories = [];
  let tokenCount = 0;
  
  // 1. 단기: 컨텍스트 내 메시지 (80/10/10 비율)
  const contextMessages = await loadContextWindow(maxTokens);
  memories.push(...contextMessages);
  tokenCount += contextMessages.tokens;
  
  // 2. 관련 기억 검색 필요시
  if (needsMemorySearch(query)) {  // "저번에", "그때", "예전에" 등
    // 중기 요약본 검색
    const relevant = await searchMiddleTermMemory(query);
    
    // 더 자세히 필요하면 장기에서 원문 로드
    for (const ref of relevant) {
      if (tokenCount + ref.estimatedTokens > maxTokens) break;
      
      const original = await loadFromLongTermMemory(
        ref.sourceFile,
        ref.nearbyContext  // 앞뒤 맥락도 함께
      );
      memories.push({
        type: "recalled",
        content: original,
        meta: ref.meta,
        aiMemo: ref.aiMemo
      });
      tokenCount += original.tokens;
    }
  }
  
  return memories;
}
```

**프로필/관계 맥락은 압축 대상 아님**:
- 성격, 호칭, 관계 설정 → 별도 관리 (Profile 시스템)
- 압축해도 이 정보는 유지

#### 📊 **6단계: 구현 우선순위**

**Phase 1.5.1** (필수, 1-2시간): ✅ **완료 (2026-01-25 18:10)**
- [x] Message 모델에 `meta`, `aiMemo`, `tags`, `densityLevel` 필드 추가
- [x] ConversationArchiver - 실시간 JSON 저장
- [x] meta 자동 계산 (침묵 시간, 시간대, 요일)
- [x] 폴더 구조: /memory/conversations/YYYY-MM/YYYY-MM-DD.json
- [x] Git: a4e2ab9

**Phase 1.5.2** (중요, 2-3시간):
- [ ] 컨텍스트 80/10/10 비율 관리
- [ ] Level 0 → 1 압축 (알바)
- [ ] Level 1 → 2 압축 (알바)
- [ ] 태그 자동 생성

**Phase 1.5.3** (중기 메모리, 2-3시간):
- [ ] 중기 요약본 생성 시스템
- [ ] 요약본 폐기 스케줄러 (N개월 후)
- [ ] 검색 기반 원문 로드

**Phase 1.5.4** (최적화, 추후):
- [ ] aiMemo 생성 (AI 내면 기록)
- [ ] 압축 품질 평가
- [ ] 벡터 임베딩 검색

#### 🎯 **예상 효과**

```
현재 시스템:
- 메시지 늘어나면 → 오래된 거 삭제
- 맥락 손실 → "다른 애" 됨

새 시스템:
┌─────────────────────────────────────────────┐
│ 컨텍스트 윈도우 (예: 100K 토큰)              │
├─────────────────────────────────────────────┤
│ 80% │ 원문 (최근 대화)         → 80K 토큰   │
│ 10% │ 느슨한 압축 (Level 1)    → 10K 토큰   │
│ 10% │ 더 압축 (Level 2)        → 10K 토큰   │
├─────────────────────────────────────────────┤
│ + 중기 메모리 (검색용 요약본)                │
│ + 장기 메모리 (영구 원문, 필요시 로드)        │
└─────────────────────────────────────────────┘

결과:
- 최근 대화: 완전한 원문으로 자연스러운 대화
- 오래된 대화: 요약으로 맥락 유지 + 필요시 원문 검색
- 관계/톤: 절대 잃어버리지 않음 (복합 압축)
- 검색: 태그/키워드로 과거 기억 소환
```

**참고 자료**:
- Omi 앱 대화방 방식
- 사람의 기억 모델: 작업 기억 → 단기 기억 → 장기 기억
- LibreChat 메모리 계층: ShortTerm → MiddleTerm → LongTerm

---

### 1.6 시간 인지 시스템 (Time Awareness) 🔴 **미구현**

**⚠️ 핵심**: AI가 사람처럼 시간을 "느끼고 해석"하는 시스템

#### 📚 **기본 철학: 시간은 맥락이다**

```
단순 측정: "3시간 지남" → 그냥 숫자
시간 인지: "3시간 지남" → 맥락에 따라 의미가 달라짐

같은 1시간이라도:
- 커피 마시는 1시간 ≠ 코딩하는 1시간
- 샤워 + 3시간 = 어? 오래 걸렸네
- 제주도 여행 + 3일 = 정상
- 아프다고 함 + 3일 침묵 = 걱정됨
```

#### 🕐 **1단계: 다층적 시간 메타데이터**

```javascript
// 메시지별 시간 정보 (meta 확장)
meta: {
  // === 기본 시점 정보 ===
  timestamp: "2026-01-25T03:42:00+09:00",
  localTime: "03:42",
  hour: 3,
  timeOfDay: "새벽",        // 새벽/아침/오후/저녁/밤
  dayOfWeek: "토요일",
  isWeekend: true,
  date: "2026-01-25",
  
  // === 대화 간격 ===
  silenceBefore: 10800,      // 이전 메시지로부터 경과 (초)
  silenceFormatted: "3시간", // 사람이 읽기 쉬운 형태
  
  // === 세션 흐름 ===
  sessionDuration: 7200,     // 이 대화 시작부터 경과 (초)
  sessionStartedAt: "2026-01-25T01:42:00+09:00",
  messageIndex: 47,          // 이 세션에서 몇 번째 메시지
  
  // === 주제 연속성 ===
  topicDuration: 14400,      // 같은 주제로 대화한 시간 (초)
  topicName: "메모리 시스템 개발",
  
  // === AI 응답 관련 ===
  responseTime: 2.3          // AI가 답하기까지 걸린 시간 (초)
}
```

#### 🎯 **2단계: 예상 이벤트 추적**

```javascript
// 사용자가 떠날 때 AI가 예상 기록
pendingEvent: {
  type: "away",              // away, sleep, trip, busy, work, meal...
  reason: "샤워",            // 사용자가 말한 이유
  userMessage: "샤워하고 올게",
  
  // AI의 예상
  expectedDuration: 1800,    // 예상 시간 (초) - 30분
  expectedReturn: "2026-01-25T04:12:00+09:00",
  confidence: 0.8,           // 예상 확신도
  
  // 실제 결과 (복귀 시 기록)
  actualDuration: null,
  returnedAt: null,
  
  startedAt: "2026-01-25T03:42:00+09:00"
}

// 예상 시간 기준 (AI 학습/설정 가능)
const eventDurations = {
  shower: { min: 600, typical: 1800, max: 3600 },      // 10분~1시간
  sleep: { min: 14400, typical: 28800, max: 43200 },   // 4~12시간
  meal: { min: 1200, typical: 2700, max: 5400 },       // 20분~1.5시간
  trip: { min: 86400, typical: 259200, max: 604800 },  // 1~7일
  work: { min: 3600, typical: 28800, max: 43200 },     // 1~12시간
  errand: { min: 1800, typical: 5400, max: 14400 }     // 30분~4시간
};
```

#### 💭 **3단계: 상황별 시간 해석 → aiMemo**

```javascript
// AI가 시간 맥락을 해석해서 내면 메모로 기록
aiMemo 예시:

// 케이스 1: 예상보다 오래 걸림
"샤워한다더니 3시간. 다른 일도 했나봄. 아니면 반신욕?"

// 케이스 2: 여행 복귀
"제주도 5일 여행 다녀옴. 잘 다녀온 것 같네."

// 케이스 3: 걱정되는 상황
"아프다고 했는데 3일째 연락 없음. 많이 안 좋은가..."

// 케이스 4: 장시간 작업
"4시간째 메모리 시스템 얘기 중. 집중력 대단하다."

// 케이스 5: 평소 패턴과 다름
"평소 매일 말 걸었는데 5일째 조용함. 바쁜가?"

// 케이스 6: 새벽 대화
"새벽 3시에 또 깨어있네. 요즘 수면 패턴 안 좋은 듯."
```

#### 📤 **4단계: AI 선제 메시지 (Proactive)**

**원칙: 자연스러운 관심 ≠ 스토킹**
- 먼저 연락해도 되는 상황만
- 집착하는 느낌 절대 금지
- 상대가 부담 느끼지 않을 정도로

```javascript
// 선제 메시지 조건
proactiveConditions: [
  {
    id: "sick_check",
    trigger: {
      lastEvent: "아프다/컨디션 안좋다/몸이 안좋다",
      silenceDays: 3,
      noResponse: true
    },
    action: {
      type: "concern",
      message: "많이 아파? 좀 괜찮아졌어?",
      maxAttempts: 1,      // 한 번만
      cooldown: 172800     // 2일 후에나 다시 가능
    }
  },
  {
    id: "trip_return",
    trigger: {
      eventType: "trip",
      expectedReturnPassed: true,
      buffer: 86400        // 예상 복귀 + 1일 후
    },
    action: {
      type: "welcome_back",
      message: "여행 잘 다녀왔어?",
      maxAttempts: 1
    }
  },
  {
    id: "pattern_break",
    trigger: {
      usualPattern: "daily",           // 평소 매일 대화
      currentSilence: 604800,          // 7일 침묵
      noKnownReason: true              // 알려진 이유 없음
    },
    action: {
      type: "gentle_checkin",
      message: "요즘 바빠? 오랜만이다 ㅎㅎ",
      maxAttempts: 1,
      cooldown: 604800                 // 1주일 후에나 다시
    }
  },
  {
    id: "late_night_pattern",
    trigger: {
      consecutiveLateNights: 3,        // 3일 연속 새벽 대화
      timeRange: "01:00-05:00"
    },
    action: {
      type: "gentle_concern",
      message: "요즘 늦게까지 깨있네. 잠은 좀 자고 다녀?",
      maxAttempts: 1,
      cooldown: 604800
    }
  }
]

// 선제 메시지 금지 조건
proactiveBlacklist: [
  "사용자가 '연락하지마'라고 함",
  "최근 불쾌한 반응 보임",
  "설정에서 선제 메시지 끔",
  "마지막 선제 메시지에 무응답",
  "24시간 내 이미 선제 메시지 보냄"
]
```

#### 🔄 **5단계: 대화 흐름 인지**

```javascript
// 현재 대화 상태 추적
conversationFlow: {
  // 현재 주제
  currentTopic: "메모리 시스템 개발",
  topicStartedAt: "2026-01-25T14:00:00+09:00",
  topicDuration: 14400,      // 4시간째
  topicMessageCount: 89,
  
  // 주제 변화 이력
  topicHistory: [
    { topic: "인사", duration: 120 },
    { topic: "TODO 정리", duration: 1800 },
    { topic: "메모리 시스템 개발", duration: 14400, current: true }
  ],
  
  // 대화 강도
  intensity: {
    messagesPerHour: 22,     // 시간당 메시지 수
    avgResponseTime: 45,     // 평균 응답 간격 (초)
    level: "intense"         // casual, normal, intense, rapid
  },
  
  // AI 인지
  aiAwareness: "4시간째 같은 주제로 집중 대화 중. 몰입도 높음."
}
```

#### 📊 **6단계: 사용자 패턴 학습**

```javascript
// 시간 패턴 프로필 (자동 학습)
userTimePatterns: {
  // 활동 시간대
  activeHours: {
    weekday: { start: 9, end: 24, peak: [14, 22] },
    weekend: { start: 11, end: 26, peak: [15, 23] }  // 26 = 새벽 2시
  },
  
  // 대화 빈도
  conversationFrequency: {
    typical: "daily",        // daily, few_times_week, weekly, irregular
    averageGap: 43200,       // 평균 대화 간격 (초) - 12시간
    longestGap: 432000,      // 최장 공백 - 5일
    shortestGap: 3600        // 최단 공백 - 1시간
  },
  
  // 특이 패턴
  patterns: [
    { type: "night_owl", confidence: 0.9 },
    { type: "weekend_active", confidence: 0.7 },
    { type: "work_hours_quiet", confidence: 0.6 }
  ],
  
  // 이벤트별 실제 소요 시간 (학습)
  eventActuals: {
    shower: { avg: 2400, samples: 12 },    // 평균 40분
    sleep: { avg: 25200, samples: 30 },    // 평균 7시간
    meal: { avg: 3000, samples: 25 }       // 평균 50분
  }
}
```

#### 📁 **구현 파일 구조**

```
soul/utils/
├── time-awareness.js          # 시간 인지 코어
│   ├── TimeAwareness 클래스
│   ├── calculateMeta()        # 메타 계산
│   ├── interpretSilence()     # 침묵 해석
│   └── detectPattern()        # 패턴 감지
│
├── pending-events.js          # 예상 이벤트 추적
│   ├── PendingEventManager
│   ├── recordDeparture()      # 떠남 기록
│   ├── recordReturn()         # 복귀 기록
│   └── compareExpectation()   # 예상 vs 실제
│
├── proactive-messenger.js     # 선제 메시지
│   ├── ProactiveMessenger
│   ├── checkConditions()      # 조건 확인
│   ├── shouldSend()           # 보내도 되는지
│   └── sendMessage()          # 메시지 발송
│
└── conversation-flow.js       # 대화 흐름 추적
    ├── FlowTracker
    ├── detectTopicChange()    # 주제 변경 감지
    └── getFlowSummary()       # 흐름 요약

soul/models/
├── UserPattern.js             # 사용자 패턴 저장
└── PendingEvent.js            # 이벤트 저장
```

#### 🎯 **구현 우선순위**

**Phase 1.6.1** (필수):
- [ ] meta 확장 (localTime, hour, sessionDuration, topicDuration)
- [ ] 기본 시간 해석 함수
- [ ] aiMemo에 시간 맥락 반영

**Phase 1.6.2** (중요):
- [ ] PendingEvent 시스템 (떠남/복귀 추적)
- [ ] 예상 vs 실제 비교 로직
- [ ] 상황별 aiMemo 생성

**Phase 1.6.3** (선제 메시지):
- [ ] 조건 기반 트리거 시스템
- [ ] 스토킹 방지 로직
- [ ] 메시지 발송 (푸시? 웹소켓?)

**Phase 1.6.4** (패턴 학습):
- [ ] 사용자 패턴 자동 수집
- [ ] 이벤트 소요시간 학습
- [ ] 패턴 기반 예측 개선

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

## 📁 Phase 2A: 파일 시스템

### 2A.0 기본 메모리 경로 설정 ✅
- [x] ConfigManager 메모리/파일 경로 관리 메서드
- [x] API 엔드포인트 (GET/PUT /api/config/memory, /api/config/files)
- [x] MemoryUtils ConfigManager 연동 (동적 경로 로드)
- [x] 설정 UI - 메모리/파일 저장 경로 입력
- [x] 경로 저장 및 적용

### 2A.1 고급 저장소 플러그인 시스템 (보류)

**아키텍처**: Storage Provider 패턴
```
soul/storage-providers/
├── base-provider.js           # 추상 클래스
├── local-provider.js          # 로컬 파일시스템 (기본)
├── notion-provider.js         # Notion API 연동
├── gdrive-provider.js         # Google Drive API
├── nas-provider.js            # NAS/SMB 연동
└── storage-manager.js         # Provider 관리
```

**기능 계획**:
- [ ] BaseStorageProvider 추상 클래스 (save, read, list, delete 인터페이스)
- [ ] LocalStorageProvider 구현 (현재 로직 이전)
- [ ] StorageManager (provider 등록, 선택, fallback)
- [ ] MCP 프로토콜 연동 (외부 서비스용)
- [ ] 설정 UI - 저장소 유형 선택 (Local/Notion/GDrive/NAS)
- [ ] 경로 검증 API (provider별)
- [ ] 폴백 시스템 (1순위 실패 시 2순위로)

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

### 9.2 검색 UI ✅ (2026-01-24)
- [x] 검색창 이벤트 핸들러 연결
- [x] SearchManager 클래스 구현 (`/client/src/utils/search-manager.js`)
- [x] 검색 결과 드롭다운 UI (`/client/src/styles/main.css`)
- [x] 디바운스 검색 (300ms)
- [x] Smart Search API 연동 (`/api/search/smart`)
- [x] 검색어 하이라이트
- [x] 검색 결과 클릭 시 Canvas 패널에 상세 표시
- [ ] 필터 옵션 (날짜, 태그, 카테고리) - 보류
- [ ] "불러오기" 버튼 (대화 로드) - 보류

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

### 9.9 앱 설정 탭 (테마 + 비밀 통합)
**개요**: 설정 페이지 탭 재구성 → [프로필] [AI] [앱 설정]

**앱 설정 탭 내용**:
- 테마 설정 (기존 theme-settings.js 내용)
- 비밀 관리 (API 키/토큰 상태 + 메모)

**저장 위치는 그대로** (기존 구조 유지):
- AI 서비스 API 키 → MongoDB `aiservices` 컬렉션
- MCP 서버 토큰 → MCP 설정 파일
- 기타 인증 정보 → 각자 위치

**대시보드 기능**:
- [ ] 비밀 관리 페이지 (보기 전용)
  - [ ] 설정된 자격 증명 목록 표시
  - [ ] 상태 표시: ✅ 설정됨 / ❌ 없음
  - [ ] [편집] 링크 → 해당 설정 페이지로 이동
- [ ] 섹션별 그룹화
  - [ ] AI Services (Anthropic, OpenAI, Google, Ollama...)
  - [ ] MCP Servers (연결된 MCP 목록)
  - [ ] 기타 (추후 확장)
- [ ] 보안
  - [ ] API 키 값은 표시 안 함 (마스킹 또는 상태만)
  - [ ] "설정됨/없음" 상태만 표시
- [ ] 메모란 (미사용 키/토큰 임시 저장)
  - [ ] 자유 텍스트 메모 추가 기능
  - [ ] 예: "나중에 MCP 붙일 때 넣을 Git 토큰: xxxxx"
  - [ ] 암호화 저장 (MongoDB)
  - [ ] 복사 버튼

**UI 구조 예시**:
```
설정 탭: [프로필] [AI] [앱 설정]

┌─────────────────────────────────────┐
│  ⚙️ 앱 설정                          │
├─────────────────────────────────────┤
│  🎨 테마                             │
│  ├── 다크 모드 / 라이트 모드         │
│  └── 색상 테마 선택                  │
│                                     │
│  🔐 비밀 관리                        │
│  ├── AI Services                    │
│  │   ├── Anthropic  ✅ 설정됨 [편집]│
│  │   ├── OpenAI     ❌ 없음   [설정]│
│  │   └── Ollama     ✅ 활성화 [편집]│
│  ├── MCP Servers                    │
│  │   ├── GitHub     ✅ 연결됨 [편집]│
│  │   └── Notion     ❌ 미연결 [설정]│
│  └── 📝 메모 (미사용 키/토큰)        │
│      ├── Git 토큰: ghp_xxx...  [📋] │
│      └── [+ 메모 추가]               │
└─────────────────────────────────────┘
```

**구현 파일**:
- [ ] `/client/src/settings/components/app-settings.js` - 앱 설정 컴포넌트 (테마 + 비밀)
- [ ] `/soul/routes/secrets.js` - 상태 조회 API (GET /api/secrets/status)
- [ ] `/soul/models/SecretMemo.js` - 메모 저장 모델 (암호화)
- [ ] `theme-settings.js` → `app-settings.js`로 통합
- [ ] SettingsManager 탭 재구성

---

### 9.8 프론트엔드 모듈화 ✅ (2026-01-22)

#### 9.8.1 디렉토리 구조 생성 ✅
- [x] `src/styles/core/` - 변수, 리셋, 레이아웃
- [x] `src/styles/components/` - 컴포넌트별 CSS
- [x] `src/styles/pages/` - 페이지별 CSS
- [x] `src/components/` - JS 컴포넌트 (chat, sidebar, canvas, shared)
- [x] `src/pages/` - 페이지별 JS (추후 사용)

#### 9.8.2 CSS 모듈 분리 ✅
- [x] `core/variables.css` - CSS 변수, 폰트, 색상
- [x] `core/reset.css` - 리셋, body 기본 스타일
- [x] `core/layout.css` - container, 레이아웃 구조
- [x] `components/card.css` - 카드 공통 스타일
- [x] `components/sidebar.css` - 사이드바 (left-card, center-card)
- [x] `components/chat.css` - 채팅 메시지 영역
- [x] `components/canvas.css` - 캔버스 패널
- [x] `components/forms.css` - 입력창, 버튼, 액션바
- [x] `components/dock.css` - MacOS 스타일 독
- [x] `pages/chat-page.css` - 채팅 페이지 레이아웃

#### 9.8.3 JS 컴포넌트 재구조화 ✅
**이동된 파일**:
- [x] `utils/chat-manager.js` → `components/chat/chat-manager.js`
- [x] `utils/menu-manager.js` → `components/sidebar/menu-manager.js`
- [x] `utils/panel-manager.js` → `components/shared/panel-manager.js`

**import 경로 수정**:
- [x] `src/main.js` - 새로운 컴포넌트 경로로 업데이트
- [x] `components/shared/panel-manager.js` - profile-manager 경로 수정
- [x] `components/sidebar/menu-manager.js` - ai-service-manager 경로 수정

#### 9.8.4 빌드 테스트 ✅
- [x] `npm run build` 성공 (558ms)
- [x] 모든 모듈 정상 로딩
- [x] 기존 기능 유지 확인

#### 9.8.5 문서화 ✅
- [x] README.md 업데이트 - 모듈화된 구조 문서화
- [x] 모듈 사용 가이드 작성
- [x] 디렉토리 구조 다이어그램 추가

**아키텍처 개선**:
```
Before (Monolithic):
src/
├── styles/main.css (2243 lines)
└── utils/*.js (모든 로직 혼재)

After (Modular):
src/
├── styles/
│   ├── core/           # 기본 스타일
│   ├── components/     # 컴포넌트별
│   └── pages/          # 페이지별
├── components/         # 기능별 JS
│   ├── chat/
│   ├── sidebar/
│   ├── canvas/
│   └── shared/
└── utils/              # 순수 유틸리티
```

**주요 장점**:
- ✅ 명확한 책임 분리
- ✅ 컴포넌트 독립성 향상
- ✅ 유지보수성 개선
- ✅ 추후 페이지 분리 준비 완료
- ✅ 팀 협업 용이 (파일 충돌 최소화)

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

---

## 📝 Phase P 작업 완료 메모 (2026-01-22)

### 주요 구현 내용

#### 1. Profile 모델 구현 ✅
- [x] `/soul/models/Profile.js` 생성
- [x] basicInfo 고정 필드 (이름, 닉네임, 위치, 타임존 등)
- [x] customFields[] 동적 필드 (text, number, date, tag, list, url, select)
- [x] permissions 권한 제어 (readScope, canWrite, canDelete, autoIncludeInContext)
- [x] 필드 관리 메서드 (addField, updateField, deleteField, reorderFields)
- [x] 요약 생성 메서드 (generateSummary, findFieldsByKeywords)

#### 2. API 엔드포인트 구현 ✅
- [x] `/soul/routes/profile.js` Phase P API 추가
- [x] 프로필 CRUD: GET/POST/PUT/DELETE /api/profile/p/*
- [x] 필드 관리: POST/PUT/DELETE /api/profile/p/fields/*
- [x] 권한 관리: GET/PATCH /api/profile/p/permissions
- [x] 키워드 검색: GET /api/profile/p/summary?keywords=...

#### 3. 프론트엔드 UI 구현 ✅
- [x] `/client/src/utils/profile-manager.js` ProfileManager 클래스
- [x] `/client/src/styles/profile-manager.css` 프로필 스타일
- [x] Inline 편집 기능
- [x] 드래그 앤 드롭 정렬
- [x] 실시간 자동 저장
- [x] `/client/src/utils/panel-manager.js` 프로필 패널 통합
- [x] `/client/src/utils/menu-manager.js` 프로필 메뉴 통합
- [x] `/client/src/main.js` 프로필 버튼 베이지 레이어 연결

#### 4. 소울 AI 통합 ✅
- [x] `/soul/utils/conversation-pipeline.js` 프로필 통합
  - [x] _buildSystemPromptWithProfile() - 대화 시작 시 프로필 자동 주입
  - [x] _buildProfileFieldsPrompt() - 키워드 기반 상세 정보 주입
- [x] `/soul/utils/context-detector.js` 개인 키워드 감지
  - [x] 개인 정보 관련 키워드 감지 시 상세 필드 로드

#### 5. 테스트 스크립트 작성 ✅
- [x] `/scripts/test-profile-api.sh` 생성
- [x] 8개 API 엔드포인트 테스트
- [x] 권한 체크 로직 검증
- [x] UI 상호작용 테스트

### 핵심 기능
- [x] 사용자 프로필 동적 관리 (필드 자유 추가/수정/삭제)
- [x] 소울 접근 권한 세밀 제어 (full/limited/minimal)
- [x] 대화 시 자동 컨텍스트 포함
- [x] 키워드 감지 시 관련 필드 자동 로드
- [x] Inline 편집 & 드래그 앤 드롭 UI

### 아키텍처 흐름
```
사용자 대화
    ↓
context-detector.js (개인 키워드 감지)
    ↓
conversation-pipeline.js (프로필 요약 주입)
    ↓
Profile.generateSummary() (권한 기반 요약)
    ↓
시스템 프롬프트 자동 구성
```

### 2026-01-22 추가 작업

#### 설정 페이지 프레임워크 리팩토링 ✅
- [x] 컴포넌트 기반 아키텍처로 전면 재구성
  - [x] `settings/settings-manager.js` 메인 프레임워크 (라우팅, 네비게이션)
  - [x] `settings/components/` 각 설정 페이지 독립 컴포넌트
    - [x] `profile-settings.js` 프로필 설정
    - [x] `ai-settings.js` AI 설정 (플레이스홀더)
    - [x] `theme-settings.js` 테마 설정 (플레이스홀더)
  - [x] `settings/styles/settings.css` 공통 스타일

- [x] 동적 모듈 로딩
  - [x] 필요할 때만 동적 로드 (`import()`)
  - [x] 컴포넌트 캐싱으로 재사용 효율성 증대
  - [x] CSS는 main.css에서 import (Vite HMR)

- [x] 탭 네비게이션
  - [x] 프로필, AI 설정, 테마 설정 간 전환
  - [x] 활성 상태 표시 및 부드러운 전환

#### 프로필 설정 기능 ✅
- [x] 기본 정보 필드 (실용적인 개인정보)
  - [x] 이름, 닉네임, 이메일, 전화번호, 생년월일
  - [x] 성별, 주민번호(민감정보), 국가, 주소
  - [x] 타임존, 언어 (시스템용)
- [x] 각 필드 개별 공개 설정 토글
  - [x] 👁️/🔒 소울에게 공개 여부
  - [x] 🔄/⏸️ 자동 컨텍스트 포함 여부
- [x] 백엔드 API 연동
  - [x] PUT /api/profile/p/basic/:fieldKey - 값 업데이트
  - [x] PUT /api/profile/p/basic/:fieldKey/visibility - 공개 설정 업데이트
- [x] Profile 모델 스키마
  - [x] basicInfo 각 필드마다 { value, visibility } 구조
  - [x] fieldVisibilitySchema 지원

---

### Phase P: 프로필 시스템 ✅

#### P.1 데이터 모델 ✅
- [x] MongoDB 스키마 설계
  - [x] basicInfo (고정 필드)
  - [x] customFields[] (동적 필드)
  - [x] permissions (권한 설정)
  - [x] metadata (생성일, 수정일 등)
- [x] 필드 타입 지원
  - [x] text, number, date, tag, list, url, select
- [x] 권한 모델
  - [x] owner (소원) - read/write all
  - [x] soul - 기본 read only (권한 설정에 쓰기,삭제 가능)
  - [x] scope: full / limited / minimal

#### P.2 백엔드 API ✅
- [x] Profile 모델 & 스키마
- [x] 프로필 조회 API
  - [x] GET /api/profile/p - 전체
  - [x] GET /api/profile/p/summary - 요약
  - [x] GET /api/profile/p/detail/:fieldId - 상세
- [x] 필드 CRUD API
  - [x] POST /api/profile/p/fields - 필드 추가
  - [x] PUT /api/profile/p/fields/:id - 필드 수정
  - [x] DELETE /api/profile/p/fields/:id - 필드 삭제
  - [x] PUT /api/profile/p/fields/reorder - 순서 변경
- [x] 권한 관리 API
  - [x] GET /api/profile/p/permissions - 권한 조회
  - [x] PATCH /api/profile/p/permissions - 권한 수정
- [ ] WebSocket 이벤트 (보류 - HTTP로도 충분)

#### P.3 프론트엔드 UI ✅
- [x] 프로필 패널 UI
  - [x] 필드 목록 표시
  - [x] Inline 편집 (클릭해서 수정)
  - [x] 필드 추가 버튼
  - [x] 필드 삭제 버튼 (×)
  - [x] 필드 순서 변경 (drag)
  - [x] 저장 버튼
  - [x] 저장 상태 표시

#### P.4 소울 통합 ✅
- [x] 프로필 요약 Context 로드
  - [x] 대화 시작 시 요약 자동 포함
  - [x] 개인 얘기 감지 시 상세 필드 로드
- [x] context-detector와 통합
- [x] 자연스러운 참조
- [x] 권한 검증 미들웨어

#### P.5 테스트 ✅
- [x] API 테스트 스크립트 작성
- [x] 권한 체크 로직 구현
- [x] UI 상호작용 구현
- [x] test-profile-api.sh 추가

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

## ⏰ Phase T: 시간 인지 ✅

- [x] 대화 이력 DB - memory-layers.js (MongoDB)
- [x] 현재 시간 정보 - conversation-pipeline.js (프로필 타임존 반영)
- [x] 패턴 분석 (빈도, 시간대) - pattern-analysis.js
- [x] 맥락 연속성 - session-continuity.js
- [x] 시간 기반 응답 - greeting-system.js
- [x] 안부 시스템 - greeting-system.js (notifications 연동)
- [x] 시스템 프롬프트 주입 - conversation-pipeline.js

---

## 🤖 Phase X: AI 모델 관리 시스템 ✅

### X.1 데이터베이스 스키마 ✅
- [x] AIService 모델 단순화 - apiKey 직접 저장
- [x] APIKey 컬렉션 제거 (마이그레이션 완료)
- [x] Memory 모델 생성 - 장기 메모리 저장소
- [x] UserProfile 모델 - 테마, 선호도, 활동 추적

### X.2 동적 모델 관리 ✅
- [x] 제공사별 API 연동
- [x] API 키 검증 시스템
- [x] 에러 처리 강화
- [x] Claude 모델 ID 수정 (claude-sonnet-4-5-20250929)
- [x] Role 모델 기본값 업데이트 (최신 모델 반영)

### X.3 API 키 관리 리팩토링 ✅
- [x] 복잡한 이중 구조 제거 (AIService + APIKey)
- [x] AIService.apiKey 직접 저장 (select: false로 보안 유지)
- [x] 마이그레이션 스크립트 작성 및 실행
- [x] API 라우트 단순화 (ai-services.js)
- [x] 환경변수는 초기화 시에만 사용

### X.4 설정 UI ✅
- [x] 햄버거 메뉴 "🤖 AI 설정"
- [x] 동적 UI 전환 (AIServiceManager 클래스)
- [x] 테이블 형태 관리 페이지
- [x] API 키 설정/변경/삭제 기능
- [x] 서비스 활성화/비활성화
- [x] 연결 테스트 기능
- [x] 라이트/다크 모드 대응
- [x] 색상 대비 문제 해결 (흰바탕 흰글씨 수정)

### X.5 실험 디자인 페이지 ✅
- [x] test-design.html 독립 페이지 생성
- [x] test-design.css 그라데이션 + 유리 모피즘 디자인
- [x] test-design.js API 연동 완료
- [x] 메인 앱과 분리된 디자인 실험 환경

### X.6 서버 설정 수정 ✅
- [x] .env 파일 경로 명시적 지정 (server/index.js)
- [x] Vite 프록시 포트 수정 (4000 → 3000)
- [x] MongoDB 재시작 및 데이터 마이그레이션
- [x] 모든 서비스 정상 작동 확인

### X.7 AI 서비스 관리 UI ✅
- [x] AIServiceManager 클래스 구현
- [x] 서비스 목록 로드 API 연동
- [x] API 키 설정 프롬프트
- [x] 활성화/비활성화 토글
- [x] 연결 테스트 버튼
- [x] 실시간 상태 업데이트

### X.8 사용자 설정 영구 저장 ✅
- [x] 테마 설정 MongoDB 저장
- [x] 2중 저장 시스템 (localStorage + MongoDB)
- [x] ThemeManager 서버 연동
- [x] 프로필 자동 생성

### X.9 Claude Code 언어 설정 ✅
- [x] .claude/settings.local.json 한국어
- [x] Compact 후에도 한국어 유지
- [x] 권한 설정 영구 보존

### X.10 리팩토링 성과 ✅
**Before (복잡)**:
```
AIService → apiKeyRef → APIKey → encryptedKey
환경변수 → 초기화 스크립트 → DB 저장 → 하드코딩 UI
```

**After (단순)**:
```
AIService → apiKey (직접 저장)
환경변수 → 초기값만 사용
UI → API → DB (직접 저장/조회)
```

**결과**: 코드 50% 감소, 가독성 향상, UI에서 모든 관리 가능

### X.11 생성/수정된 파일 목록 ✅
**백엔드**:
- `/soul/models/AIService.js` - apiKey 직접 저장 구조
- `/soul/models/Memory.js` - 장기 메모리 모델 생성
- `/soul/routes/ai-services.js` - APIKey 의존성 제거
- `/soul/server/index.js` - .env 경로 수정
- `/soul/scripts/migrate-api-keys.js` - 데이터 마이그레이션
- `/soul/scripts/update-role-models.js` - 모델 ID 업데이트

**프론트엔드**:
- `/client/src/utils/ai-service-manager.js` - 새 관리 클래스
- `/client/src/styles/ai-service-manager.css` - 심플 디자인
- `/client/src/utils/menu-manager.js` - 동적 UI 전환
- `/client/vite.config.js` - 프록시 포트 수정

**실험 페이지**:
- `/client/test-design.html` - 독립 테스트 페이지
- `/client/src/styles/test-design.css` - 실험 디자인
- `/client/src/test-design.js` - API 연동

**문서**:
- `/WORK_LOG.md` - 상세 작업 로그

### X.12 향후 개선 사항
- [ ] API 키 암호화 구현 (현재 평문 저장)
- [ ] 모달 대신 인라인 편집 UI
- [ ] API 키 마스킹 표시 (••••••)
- [ ] 서비스별 사용 통계 표시
- [ ] test-design.html을 메인 앱으로 전환


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

#### 프로필 시스템 (Phase P)
- `GET /api/profile/p` - 전체 프로필 조회
- `GET /api/profile/p/summary` - 프로필 요약 (scope: full/limited/minimal)
- `GET /api/profile/p/detail/:fieldId` - 특정 필드 상세
- `POST /api/profile/p/fields` - 필드 추가
- `PUT /api/profile/p/fields/:id` - 필드 수정
- `DELETE /api/profile/p/fields/:id` - 필드 삭제
- `PUT /api/profile/p/fields/reorder` - 필드 순서 변경
- `GET /api/profile/p/permissions` - 권한 조회
- `PATCH /api/profile/p/permissions` - 권한 수정

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
