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

## 🔥 배포 구조 (매우 중요 - 반드시 숙지!)

### 전체 흐름도
```
[로컬 개발]
    ↓ git push origin main
[GitHub] ─────────────────────────────────────────┐
    │                                              │
    │ GitHub Actions 자동 실행                      │
    │ (.github/workflows/sync-to-hf.yml)           │
    ↓                                              ↓
[HuggingFace Space]                         [Oracle VM]
(테스트용, 7860 포트)                        (배포용, 4000 포트)
자동: HF로 git push                         자동: SSH로 git pull & restart
```

**⚡ git push 한 번에 두 환경 모두 자동 배포됨!**

### 핵심 파일 역할

| 파일 | 역할 | 누가 사용 |
|------|------|----------|
| `/Dockerfile` | 공용 Dockerfile (SPACE_ID 있으면 HF 모드) | 둘 다 |
| `/README.md` (YAML 헤더) | HF Space 설정 (sdk: docker, app_port: 7860) | HF Space만 |
| `/.github/workflows/sync-to-hf.yml` | GitHub→HF & Oracle 자동 배포 | GitHub Actions |
| `/deploy/hf/hf-wrapper.sh` | HF Dataset 백업/복원 + Oracle Wallet 영속성 | HF Space |

### 포트 및 실행 방식
```
Dockerfile: ENV PORT=4000 (기본값)
    ↓
HF Space: SPACE_ID 환경변수 자동 설정됨
    ↓
CMD: SPACE_ID 있으면 → hf-wrapper.sh (백업/복원 + 서버)
     SPACE_ID 없으면 → node soul/server/index.js (직접 실행)
```

**즉, 같은 Dockerfile로 두 환경 모두 동작함!**

### 자동 동기화 설정 (GitHub → HF)

**이미 설정됨:** `.github/workflows/sync-to-hf.yml`

**GitHub Secrets 필요:**
1. GitHub 레포 → Settings → Secrets and variables → Actions
2. New repository secret:
   - `HF_TOKEN`: HuggingFace 토큰 (hf_xxx...)
   - `ORACLE_SSH_KEY`: Oracle VM SSH 개인키 (-----BEGIN RSA PRIVATE KEY-----...)

**작동 방식:**
- `git push origin main` 하면
- GitHub Actions가 자동으로:
  1. HF Space에 푸시 → HF 자동 재빌드
  2. Oracle VM에 SSH 접속 → git pull & restart

### 환경별 상세

| 항목 | Oracle VM | HF Spaces |
|------|-----------|-----------|
| URL | http://134.185.105.192:4000 | https://sowon20-soul.hf.space |
| 포트 | 4000 | 7860 |
| 데이터 저장 | 파일시스템 (영구) | HF Dataset (자동 백업/복원) |
| 용도 | 배포용 (일반 사용자) | 테스트용 (LLM 호출 검증) |
| 업데이트 | 자동 (GitHub Actions) | 자동 (GitHub Actions) |

### HF Space 환경변수 설정
Settings → Variables and secrets에서:
- `PORT` = `7860`
- `HF_TOKEN` = `hf_xxx...` (Dataset 백업용, 선택)
- `HF_DATASET_REPO` = `sowon20/dataset` (Dataset 백업용, 선택)

### Oracle VM 관리

**SSH 접속:**
```bash
ssh soul_clean
# 또는
ssh -i "~/Downloads/ssh-key-2026-02-02 (1).key" ubuntu@134.185.105.192
```

**서버 관리:**
```bash
# 상태 확인
sudo systemctl status soul

# 재시작
sudo systemctl restart soul

# 로그 보기
sudo journalctl -u soul -f

# 코드 업데이트 (수동)
cd ~/soul && git pull && cd client && npm run build && sudo systemctl restart soul
```

### 주의사항
1. **git push 한 번에 HF + Oracle 둘 다 자동 배포됨**
2. **환경별 코드 분기 금지** - 환경변수로만 차이 처리
3. **HF 전용 코드는 deploy/ 폴더에만** - 메인 코드 오염 금지
4. **README.md 상단 YAML은 건드리지 말 것** - HF Space 설정임
5. **keytar 사용 금지** - 환경변수(ORACLE_PASSWORD 등)로만 인증 처리

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
**브라우저 접속**: http://localhost:5173 (4000 아님!)

### 서버 재시작 방법

코드 수정 후 반영이 필요할 때:

- **프론트엔드 (CSS/JS)**: Vite HMR로 자동 반영됨. 안 되면 브라우저 새로고침
- **백엔드 (soul/ 하위)**: 서버 재시작 필요

```bash
# 백엔드만 재시작 (프론트는 유지)
lsof -ti :4000 | xargs kill -9; PORT=4000 node soul/server/index.js &

# 전체 재시작 (백엔드 + 프론트)
lsof -ti :4000 | xargs kill -9; lsof -ti :5173 | xargs kill -9; npm run dev &
```

**주의**: 포트가 이미 사용 중이면 kill 먼저 해야 함. `strictPort: true`라서 5173 점유 시 Vite가 안 뜸

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
