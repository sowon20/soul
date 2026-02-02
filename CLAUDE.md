# Soul AI - 프로젝트 가이드

## 개요
Soul AI는 개인용 AI 어시스턴트 앱입니다. 여러 AI 서비스(Claude, OpenAI, Gemini 등)를 통합하고, 스마트 라우팅으로 복잡도에 따라 적절한 모델을 자동 선택합니다.

---

## ⚠️ 핵심 원칙 (반드시 준수)

### 1. 환경 독립성
- **절대 특정 환경에 맞춘 코드 작성 금지**
- 모든 코드는 최소 사양(1GB RAM)에서도 동작해야 함
- 하드코딩된 경로, 환경 가정 금지
- 플랫폼별 기능은 플러그인/옵션으로 분리

### 2. 메모리 효율성
- 파일 처리는 **스트리밍** 기본 (전체 로드 금지)
- 큰 파일을 메모리에 통째로 올리지 않음
- base64 인코딩 시 메모리 33% 추가 사용 주의

### 3. 코드 분리
- 메인 코드 = 깨끗하게 유지 (어디서든 동작)
- 플랫폼 전용 코드 = 별도 파일로 분리, 메인에서 import 금지

---

## 배포 환경 (2개)

### 1. Oracle Cloud VM (배포용) - 우선순위 높음
- **인스턴스**: VM.Standard.E2.1.Micro
- **스펙**: 1GB RAM, 1/8 OCPU, 50GB 디스크
- **용도**: 일반 사용자 배포용, 깨끗한 코드
- **저장**: 파일시스템 기반 (SQLite)
- **특징**: 데이터 영속성 O, 무료

**최소 동작 요구사항** (~85MB):
- Express 서버 + 정적 파일 서빙
- SQLite로 설정 저장/불러오기
- 설정 적용 확인 가능
- DB/저장소 변경 시 마이그레이션

### 2. HuggingFace Spaces (테스트용)
- **Space**: `sowon20/soul` (private)
- **스펙**: 16GB RAM, Docker 기반
- **포트**: 7860
- **용도**: LLM 실제 호출 테스트, 기능 검증
- **저장**: HF Dataset으로 영속성 유지 (컨테이너 재시작 시 데이터 복원)

**중요**: HF Dataset 연동 코드는 **메인 코드에 없어야 함**
- Dockerfile에서 HF 전용 래퍼 스크립트로 처리
- 서버 시작 전: Dataset에서 데이터 복원
- 서버 종료 시: Dataset으로 백업
- 메인 코드는 이 존재를 모름

---

## 🔥 배포 구조 (중요!)

**같은 GitHub 레포, 다른 Dockerfile:**

```
GitHub 레포 (sowon20/soul)
├── /Dockerfile              ← Oracle VM이 사용 (깨끗한 코드)
├── /deploy/hf/Dockerfile    ← HF Spaces가 사용 (Dataset 연동 포함)
└── /deploy/hf/hf-wrapper.sh ← HF 전용 래퍼 (백업/복원)
```

| 항목 | Oracle VM | HF Spaces |
|------|-----------|-----------|
| Dockerfile | `/Dockerfile` | `/deploy/hf/Dockerfile` |
| 포트 | 4000 | 7860 |
| 데이터 저장 | 파일시스템 (영구) | HF Dataset (래퍼로 백업/복원) |
| 용도 | 배포용 (일반 사용자) | 테스트용 (LLM 호출 검증) |
| IP | 134.185.105.192 | sowon20-soul.hf.space |

**HF Spaces 설정:**
- Settings → Dockerfile path: `deploy/hf/Dockerfile`
- Secrets: `HF_TOKEN`, `HF_DATASET_REPO=sowon20/dataset`

**Oracle VM 접속:**
```bash
ssh soul_clean
# 또는
ssh -i "~/Downloads/ssh-key-2026-02-02 (1).key" ubuntu@134.185.105.192
```

**Oracle VM 서버 관리:**
```bash
# 상태 확인
sudo systemctl status soul

# 재시작
sudo systemctl restart soul

# 로그 보기
sudo journalctl -u soul -f

# 코드 업데이트
cd ~/soul && git pull && cd client && npm run build && sudo systemctl restart soul
```

---

## 프로젝트 구조

```
/Volumes/soul/app/
├── client/                 # 프론트엔드 (Vite + Vanilla JS)
│   ├── src/
│   │   ├── main.js        # 메인 채팅 UI (SoulApp 클래스)
│   │   ├── settings/      # 설정 페이지
│   │   │   ├── components/
│   │   │   │   ├── ai-settings.js   # AI 설정 컴포넌트 (4000줄+)
│   │   │   │   ├── profile-settings.js
│   │   │   │   ├── app-settings.js
│   │   │   │   └── theme-settings.js
│   │   │   └── styles/
│   │   │       └── settings.css     # 설정 페이지 스타일
│   │   ├── components/
│   │   │   ├── chat/chat-manager.js     # 채팅 관리
│   │   │   ├── shared/panel-manager.js  # 패널 관리
│   │   │   ├── sidebar/menu-manager.js  # 메뉴 관리
│   │   │   ├── memory/memory-manager.js # 메모리 관리
│   │   │   └── mcp/
│   │   │       ├── mcp-manager.js       # MCP 도구 관리
│   │   │       └── google-home-manager.js
│   │   ├── styles/        # 전역 스타일
│   │   └── utils/
│   │       ├── api-client.js        # API 클라이언트
│   │       ├── socket-client.js     # WebSocket 클라이언트
│   │       └── ...
│   ├── public/
│   │   └── assets/        # 정적 파일 (이미지, 사운드) - 빌드 시 복사됨
│   └── index.html
│
├── soul/                   # 백엔드 (Express + Socket.io)
│   ├── server/
│   │   └── index.js       # 서버 엔트리포인트
│   ├── routes/            # API 라우트
│   ├── models/            # 데이터 모델
│   ├── utils/             # 유틸리티
│   └── db/                # 데이터베이스 (SQLite)
│
├── deploy/                # 배포 관련 (HF 전용 코드는 여기)
│   └── hf/                # HuggingFace 전용
│       ├── hf-wrapper.sh  # Dataset 백업/복원 래퍼
│       └── Dockerfile     # HF 전용 Dockerfile
│
├── Dockerfile             # 범용 Dockerfile (Oracle 등)
└── .env                   # 환경변수
```

---

## 실행 방법

```bash
# 개발 모드 (프론트 + 백엔드 동시 실행)
npm run dev

# 백엔드만
cd soul && npm run dev

# 프론트엔드만
cd client && npm run dev
```

**포트**: 백엔드 4000, 프론트엔드 5173 (Vite 프록시로 /api → localhost:4000)

---

## 데이터 저장소

### 통합 저장소 시스템
- 사용자는 설정 UI에서 **하나의 저장소**만 선택 (로컬/Oracle/FTP/Notion)
- 내부적으로는 용도별 폴더로 자동 분리 (메모리, 설정, 대화 등)
- 저장 형식: 파일 기반 (SQLite)
- **하드코딩 절대 없음** - 모든 경로는 사용자 설정에서 가져옴

### 저장소 변경 시 옵션
저장소를 바꾸면 모든 데이터가 함께 이동:
1. **전부 옮기기** - 기존 데이터 전체 이전
2. **새로 만들기** - 빈 상태로 시작
3. **합쳐서 마이그레이션** - 기존 + 새 저장소 데이터 병합

---

## 핵심 기능

### 1. AI 서비스 관리
- 여러 AI 서비스(Claude, OpenAI, Gemini, Groq, DeepSeek 등) 지원
- API 키 관리 및 서비스 활성화/비활성화

### 2. 두뇌(Brain) 설정 - 라우팅 시스템
**두 가지 모드**:
- **단일 모델 (single)**: 하나의 모델만 사용
- **자동 라우팅 (auto)**: 복잡도에 따라 모델 자동 선택

### 3. 성격(Personality) 설정
- 프롬프트: AI의 역할과 말투 정의
- 세밀조절 슬라이더 (formality, verbosity, humor, empathy, temperature)

### 4. 역할(알바) 시스템
- 특정 작업을 위한 전문 AI 역할

### 5. MCP 도구 시스템
- 외부 도구 통합 (Model Context Protocol)

---

## 환경변수

```bash
# 필수
PORT=4000

# Oracle DB (선택)
ORACLE_PASSWORD=xxx
ORACLE_USER=ADMIN
ORACLE_CONNECTION_STRING=database_medium
ORACLE_WALLET_DIR=./wallet

# 데이터 경로
SOUL_DATA_DIR=~/.soul

# HuggingFace (HF Spaces에서만 사용)
HF_TOKEN=xxx
HF_DATASET_REPO=sowon20/dataset
SPACE_ID=sowon20/soul
```

---

## 주의사항

1. `ai-settings.js`는 4000줄+ 대형 파일 - offset/limit으로 부분 읽기 필요
2. 하드코딩된 기본값 없음 - 빈 문자열 또는 null 사용
3. DB는 SQLite 기본
4. Vite 캐시 문제 시: `rm -rf client/node_modules/.vite`
5. **특정 환경 전용 코드는 메인에 넣지 말 것** - deploy/ 폴더로 분리
