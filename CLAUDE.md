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

## 배포 환경

### Raspberry Pi (배포용)
- **호스트명**: pi
- **OS**: Debian (aarch64), Linux 6.12
- **스펙**: 4GB RAM, ARM64, 58GB SD
- **포트**: 5041
- **경로**: `~/soul`
- **저장**: 파일시스템 기반 (SQLite)
- **Git remote**: `https://github.com/sowon20/.soul.git`

---

## 🔥 배포 구조 (매우 중요 - 반드시 숙지!)

### 전체 흐름도
```
[로컬 개발 (Mac)]
    ↓ git push origin main
[GitHub] ───── GitHub Actions ─────→ [Raspberry Pi]
                                      SSH로 git pull & restart
                                      (배포용, 5041 포트)
```

**⚡ git push 한 번에 라즈베리파이 자동 배포!**

### 라즈베리파이 관리

**SSH 접속:**
```bash
ssh pi
# ~/.ssh/config:
#   Host pi
#   HostName 192.168.0.50
#   User sowon
```

**서버 실행:**
```bash
# 프로덕션 실행
cd ~/soul && ./start.sh

# start.sh 내용: NODE_ENV=production PORT=5041 node soul/server/index.js
```

**코드 업데이트 (수동):**
```bash
ssh pi "cd ~/soul && git pull && cd client && npm run build"
```

### 자동 배포 설정

**워크플로우:** `.github/workflows/sync-to-hf.yml` (이름은 레거시, 실제로는 Pi 배포)

**GitHub Secrets 필요:**
- `PI_SSH_KEY`: 라즈베리파이 SSH 키

### 주의사항
1. **환경별 코드 분기 금지** - 환경변수로만 차이 처리
2. **keytar 사용 금지** - 환경변수로만 인증 처리

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
├── deploy/                # 배포 관련
├── Dockerfile             # Docker 빌드용
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

**포트**: 백엔드 5041, 프론트엔드 5173 (Vite 프록시로 /api → localhost:5041)
**브라우저 접속**: http://localhost:5173 (5041 아님!)

### 서버 재시작 방법

코드 수정 후 반영이 필요할 때:

- **프론트엔드 (CSS/JS)**: Vite HMR로 자동 반영됨. 안 되면 브라우저 새로고침
- **백엔드 (soul/ 하위)**: 서버 재시작 필요

```bash
# 백엔드만 재시작 (프론트는 유지)
lsof -ti :5041 | xargs kill -9; PORT=5041 node soul/server/index.js &

# 전체 재시작 (백엔드 + 프론트)
lsof -ti :5041 | xargs kill -9; lsof -ti :5173 | xargs kill -9; npm run dev &
```

**주의**: 포트가 이미 사용 중이면 kill 먼저 해야 함. `strictPort: true`라서 5173 점유 시 Vite가 안 뜸

---

## 데이터 저장소

### 통합 저장소 시스템
- 사용자는 설정 UI에서 **하나의 저장소**만 선택 (로컬/FTP/Notion)
- 내부적으로는 용도별 폴더로 자동 분리 (메모리, 설정, 대화 등)
- 저장 형식: 파일 기반 (SQLite)
- **하드코딩 절대 없음** - 모든 경로는 사용자 설정에서 가져옴

### 저장소 마이그레이션 (공통 커넥터 방식)

저장소를 바꾸면 **완전 마이그레이션** (기존 데이터를 새 저장소로 이동):

**구조:**
```
source.exportAll() → 공통 JSON → target.importAll()
```

- 모든 저장소 어댑터는 `exportAll()` / `importAll()` 인터페이스를 구현
- 마이그레이션 코드는 저장소 타입을 모름 → **새 저장소 추가 시 마이그레이션 코드 변경 불필요**
- 저장소 N개여도 각각 export/import만 구현하면 모든 조합 자동 지원

**공통 JSON 포맷:**
```json
{
  "2026-01/2026-01-30": [{ "role": "user", "content": "...", "timestamp": "...", "meta": {...} }],
  "2026-02/2026-02-03": [...]
}
```

**관련 파일:**

| 파일 | 역할 |
|------|------|
| `soul/storage/adapter.js` | 추상 인터페이스 (exportConversations/importConversations) |
| `soul/utils/conversation-archiver.js` | 로컬/FTP/Notion의 exportAll/importAll 구현 |
| `soul/utils/oracle-storage.js` | Oracle의 exportAll/importAll 구현 |
| `soul/routes/storage.js` | `/api/storage/migrate` 엔드포인트 + `createMigrationAdapter()` |
| `client/.../storage-settings.js` | UI: 마이그레이션 모달 + 진행률 표시 |

**새 저장소 추가 시:**
1. 해당 저장소 어댑터에 `exportAll(onProgress)` / `importAll(data, onProgress)` 구현
2. `storage.js`의 `createMigrationAdapter()`에 case 추가
3. 끝. 다른 모든 저장소와 자동으로 마이그레이션 가능

---

## 핵심 기능

### 1. AI 서비스 관리
- 여러 AI 서비스(Claude, OpenAI, Gemini, Groq, DeepSeek 등) 지원
- API 키 관리 및 서비스 활성화/비활성화
- **도구(Tool) 지원**: 모든 AI 서비스에서 도구 호출 가능 (Claude 네이티브, OpenAI/xAI/HuggingFace/LightningAI/Ollama는 OpenAI 호환, Gemini는 functionDeclarations)
- 간단한 메시지(ㅋㅋ, 넵, ok 등)에는 도구 생략하여 토큰 절약

### 2. 두뇌(Brain) 설정 - 라우팅 시스템
**두 가지 모드**:
- **단일 모델 (single)**: 하나의 모델만 사용
- **자동 라우팅 (auto)**: 복잡도에 따라 모델 자동 선택

### 3. 사용자 프로필
- 설정 > 프로필에서 기본 정보 관리
- **시간대(timezone)**: 프로필 기본 정보에서 관리 (기본값: Asia/Seoul)
- **언어(language)**: 프로필 기본 정보에서 관리 (기본값: ko)
- 각 필드에 visibility 토글 (소울에게 공개 / 자동 컨텍스트 포함)
- AI 컨텍스트 전달 경로: 프로필 → chat.js (`<user_profile>`) + conversation-pipeline.js (`<current_time>`, 시간 프롬프트)

### 4. 성격(Personality) 설정
- 프롬프트: AI의 역할과 말투 정의
- 세밀조절 슬라이더 (formality, verbosity, humor, empathy, temperature)

### 5. 역할(알바) 시스템
- 특정 작업을 위한 전문 AI 역할

### 6. MCP 도구 시스템
- 외부 도구 통합 (Model Context Protocol)

---

## 환경변수

```bash
# 필수
PORT=5041

# 데이터 경로
SOUL_DATA_DIR=~/.soul
```

---

## 주의사항

1. `ai-settings.js`는 4000줄+ 대형 파일 - offset/limit으로 부분 읽기 필요
2. 하드코딩된 기본값 최소화 - timezone(Asia/Seoul), language(ko)만 기본값 있음
3. DB는 SQLite 기본
4. Vite 캐시 문제 시: `rm -rf client/node_modules/.vite`
5. **특정 환경 전용 코드는 메인에 넣지 말 것** - deploy/ 폴더로 분리

---

## 도구 시스템 구조 (2026-02-03 기준)

### 내장 도구 (builtin-tools.js) - 항상 전송
| 도구 | 설명 |
|------|------|
| recall_memory | 과거 대화/기억 검색 |
| get_profile | 사용자 프로필 조회 |
| update_profile | 사용자 정보 저장 |

### 프로액티브 도구 (mcp-tools.js) - 토글 ON일 때만 전송
| 도구 | 설명 |
|------|------|
| send_message | 즉시 메시지 전송 |
| schedule_message | 예약 메시지 |
| cancel_scheduled_message | 예약 취소 |
| list_scheduled_messages | 예약 목록 |

- 토글 위치: 설정 > 앱 설정 > 선제 메시지
- API: `GET /api/notifications/proactive/status`, `POST /api/notifications/proactive/toggle`
- 기본값: OFF (토큰 절약)

### 외부 MCP 도구 (mcp-tools.js)
- DB 설정(`mcp_servers`)에 등록된 외부 SSE 서버의 도구
- 설정 > MCP에서 서버 추가/삭제/토글

### mcp/tools/ 디렉토리
- 현재 비어있음 (context-tool.js, self-rules-tool.js 삭제됨)
- hub-server.js는 이 디렉토리에서 동적 로딩하지만, 도구 없으므로 MCP 설정에서 제거됨
