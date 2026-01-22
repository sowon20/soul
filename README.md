# 🌟 Soul Project

> **단일 인격 AI 동반자 시스템** - 완전 재배포 가능한 오픈소스 프로젝트

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4.4%2B-green)](https://www.mongodb.com/)

---

## 📋 개요

Soul Project는 **장기 메모리, 컨텍스트 관리, 자율 학습**을 갖춘 단일 인격 AI 동반자 시스템입니다.

### 핵심 철학

- **단일 인격**: 모드 분리 없이 하나의 복합적이고 유동적인 인격체
- **자연어 제어**: 모든 설정과 기능을 자연어로 제어
- **Anti-템플릿**: 고정된 말투나 템플릿 응답 금지
- **완전 재배포 가능**: 하드코딩 제로, 환경변수로 모든 설정 관리

---

## ✨ 주요 기능

### 📚 메모리 시스템 (Phase 1-3)
- **대화 자동 저장**: Markdown 형식으로 구조화된 대화 저장
- **AI 자동 분류**: 주제, 태그, 카테고리, 중요도 자동 추출
- **지능형 검색**: 자연어 쿼리, 시간 추론, 맥락 기반 검색
- **관계 그래프**: 대화 간 연결 관계 시각화
- **추천 시스템**: "이것도 볼래?" 스타일 추천

### 🧠 자율 기억 (Phase 4)
- **맥락 감지**: 대화 중 관련 주제 자동 감지
- **자동 메모리 주입**: "저번에 얘기했던..." 자연스러운 참조
- **비유/연결**: 과거 대화에서 비슷한 패턴 찾기
- **스팸 방지**: 과도한 메모리 주입 방지

### 🎛️ 컨텍스트 관리 & 영속적 대화방 (Phase 5 & 5.4)
- **토큰 모니터링**: 실시간 컨텍스트 사용량 추적
- **자동 압축**: 80% 경고, 90% 자동 압축
- **세션 연속성**: 대화 중단/재개 완벽 처리, 시간 인지 재개
- **무한 메모리**: 토큰 제한 극복한 연속 대화
- **토큰 폭발 방지**: Tool 출력 제한, Vision 토큰 계산, 단일 메시지 10% 제한
- **메모리 계층**: 단기(RAM) → 중기(파일) → 장기(DB) 자동 관리
- **에이전트 체이닝**: 순차/병렬 작업 실행 지원

### 🗣️ 자연어 제어 (Week 1)
- **의도 감지**: 14가지 의도 자동 인식
- **패턴 매칭**: 21개 패턴으로 명령 이해
- **엔티티 추출**: 숫자, 날짜, 시간, 설정값 자동 추출
- **액션 제안**: 감지된 의도에 따른 액션 자동 제안
- **신뢰도 기반 실행**: 70% 이상 신뢰도에서 자동 실행

### 🤖 스마트 라우팅 & 단일 인격 시스템 (Phase 8)
- **자동 모델 선택**: 작업 복잡도(0-10) 분석 후 최적 모델 자동 선택
- **태스크 유형 감지**: 11가지 태스크 유형 자동 탐지
- **다중 AI 제공사**: Anthropic, OpenAI, Google, Ollama 지원
- **비용 최적화**: 경량 작업은 Haiku, 복잡한 작업은 Opus
- **단일 인격 유지**: 모델 전환 시에도 일관된 말투와 성격 유지
- **대화 주제 추적**: 컨텍스트 기반 대화 흐름 관리

### 👤 프로필 시스템 (Phase P)
- **동적 필드 관리**: 자유롭게 추가/수정/삭제 가능한 프로필 필드
- **세밀한 권한 제어**: 필드별 소울 접근 권한 설정 (full/limited/minimal)
- **자동 컨텍스트 주입**: 대화 시작 시 프로필 요약 자동 포함
- **키워드 감지**: 개인 정보 관련 키워드 감지 시 상세 필드 로드
- **Inline 편집**: 드래그 앤 드롭 정렬, 실시간 자동 저장

### 🎨 모듈화된 프론트엔드 (Phase 9.7-9.8)
- **단일 대화방**: 고정된 영속적 대화방 시스템
- **깔끔한 UI**: 불필요한 요소 제거, 햄버거 메뉴 중심 설계
- **모듈화 구조**: CSS/JS 컴포넌트별 분리로 유지보수성 향상
- **컴포넌트 기반**: chat/sidebar/canvas/shared 폴더 구조
- **설정 프레임워크**: 동적 모듈 로딩, 탭 네비게이션

### ⚙️ AI 서비스 관리 (Phase X)
- **통합 관리 UI**: 모든 AI 서비스를 한 곳에서 관리
- **API 키 관리**: 서비스별 API 키 설정/변경/삭제
- **연결 테스트**: 실시간 서비스 연결 상태 확인
- **활성화 토글**: 서비스별 활성화/비활성화
- **동적 모델 관리**: 제공사별 사용 가능 모델 자동 갱신

---

## 🚀 빠른 시작

### 필수 요구사항

- **Node.js** 18.0.0 이상
- **MongoDB** 4.4 이상 (또는 Docker)
- **AI API 키** (최소 1개):
  - Anthropic (Claude) - 추천
  - OpenAI (GPT)
  - Google (Gemini)
  - Ollama (로컬 모델)

### 설치

```bash
# 1. 저장소 클론
git clone https://github.com/YOUR_USERNAME/soul.git
cd soul

# 2. 설치 스크립트 실행
chmod +x install.sh
./install.sh
```

설치 스크립트가 자동으로:
- 디렉토리 구조 생성
- 의존성 설치
- 환경변수 파일 생성
- MongoDB 연결 테스트
- 서버 헬스 체크

### 환경변수 설정

`.env` 파일을 편집하여 다음 값을 설정하세요:

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/soul

# AI Services (최소 1개 필요)
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Server
PORT=3080
```

### 서버 시작

#### 백엔드 서버
```bash
# 개발 모드
cd soul
node server/index.js

# 또는 pm2로 프로덕션 실행
pm2 start soul/server/index.js --name soul-server
```

#### 프론트엔드 개발 서버
```bash
cd client
npm install
npm run dev
# http://localhost:8000 에서 접속
```

#### 전체 시스템 실행
```bash
# 터미널 1: 백엔드 (포트 3000)
cd soul && node server/index.js

# 터미널 2: 프론트엔드 (포트 8000)
cd client && npm run dev
```

---

## 📖 사용법

### API 테스트

```bash
# 헬스 체크
curl http://localhost:3080/api/health

# 전체 API 테스트
cd soul
./test-all-apis.sh
```

### API 사용 예시

#### 1. 대화 저장

```bash
curl -X POST http://localhost:3080/api/memory/archive \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "main-conversation",
    "messages": [
      {"role": "user", "content": "React 시작하는 방법"},
      {"role": "assistant", "content": "React 프로젝트를 시작하려면..."}
    ],
    "autoAnalyze": true
  }'
```

#### 2. 스마트 검색

```bash
curl -X POST http://localhost:3080/api/search/smart \
  -H "Content-Type: application/json" \
  -d '{"query": "최근 개발 관련 중요한 대화"}'
```

#### 3. 맥락 감지

```bash
curl -X POST http://localhost:3080/api/context/detect \
  -H "Content-Type: application/json" \
  -d '{"message": "저번에 얘기했던 React 프로젝트"}'
```

---

## 🏗️ 프로젝트 구조

```
soul/
├── soul/                   # 백엔드
│   ├── server/            # Express 서버
│   ├── routes/            # API 라우트 (120+ 엔드포인트)
│   ├── models/            # MongoDB 모델 (Profile, AIService, Memory 등)
│   └── utils/             # 유틸리티 (conversation-pipeline, smart-router 등)
├── client/                # 프론트엔드 (모듈화)
│   ├── src/
│   │   ├── components/   # 컴포넌트 (chat, sidebar, canvas, shared)
│   │   ├── settings/     # 설정 프레임워크 (프로필, AI, 테마)
│   │   ├── styles/       # CSS (core, components, pages)
│   │   ├── utils/        # 유틸리티
│   │   └── main.js       # 앱 진입점
│   ├── index.html        # 메인 HTML
│   └── vite.config.js    # Vite 설정
├── mcp/                   # MCP 서버
│   ├── hub-server.js      # MCP 허브 서버
│   ├── tools/             # MCP 도구 (10개)
│   └── example-client.js  # 클라이언트 예제
├── memory/                # 메모리 저장소
│   ├── raw/              # 원본 대화 (Markdown)
│   └── index.json        # 메타데이터 인덱스
├── files/                # 파일 저장소
├── scripts/              # 유틸리티 스크립트
├── docs/                 # 문서 (LIBRECHAT_CONTEXT_HANDOVER.md 등)
├── .env.example          # 환경변수 템플릿
├── install.sh            # 설치 스크립트
└── README.md             # 이 파일
```

---

## 📚 문서

### 핵심 문서
- [LibreChat Context Handover](docs/LIBRECHAT_CONTEXT_HANDOVER.md) - **필독!** 메모리 시스템 핵심 아키텍처
- [TODO](TODO.md) - 개발 계획 및 진행 상황 (Phase 1-9.8 완료)

### 기술 문서
- [API Reference](soul/API_REFERENCE.md) - 120+ API 엔드포인트 문서
- [Context Detection](soul/CONTEXT_DETECTION.md) - 맥락 감지 시스템
- [Analogy System](soul/ANALOGY_SYSTEM.md) - 비유/연결 시스템
- [NLP System](soul/NLP_SYSTEM.md) - 자연어 제어 시스템
- [Smart Routing](soul/SMART_ROUTING.md) - 스마트 라우팅 & 단일 인격 시스템
- [MCP Server](mcp/README.md) - Model Context Protocol 서버 (10개 도구)

### 프론트엔드
- [Client README](client/README.md) - 모듈화된 프론트엔드 구조

---

## 🎯 로드맵

### ✅ 완료 (Phase 1-9.8)
- [x] **Phase 1-3**: 메모리 저장 & 검색 시스템
  - 대화 자동 저장, AI 분류, 스마트 검색, 관계 그래프
- [x] **Phase 4**: 자율 기억 시스템
  - 맥락 감지, 자동 메모리 주입, 비유/연결
- [x] **Phase 5 & 5.4**: 컨텍스트 관리 & 영속적 대화방
  - 토큰 모니터링, 자동 압축, 세션 연속성
  - 메모리 계층, 토큰 폭발 방지, 에이전트 체이닝
- [x] **Phase 8**: 스마트 라우팅 & 단일 인격
  - 자동 모델 선택, 태스크 분석, 비용 최적화
  - 모델 전환 시에도 일관된 인격 유지
- [x] **Phase 9.7-9.8**: 프론트엔드 완성
  - 단일 영속 대화방, 깔끔한 UI
  - 모듈화 구조 (CSS/JS 컴포넌트 분리)
  - 설정 프레임워크 (프로필, AI, 테마)
- [x] **Phase P**: 프로필 시스템
  - 동적 필드 관리, 권한 제어
  - 자동 컨텍스트 주입, 키워드 감지
- [x] **Phase X**: AI 서비스 관리
  - 통합 관리 UI, API 키 관리
  - 연결 테스트, 동적 모델 관리
- [x] **기타**: MCP 서버, 자연어 제어, 설치 자동화

### 🚧 진행 중
- [ ] 파일 시스템 (Phase 2A-2E) - 보류
- [ ] 메모리 UI 개선 (Phase 9.1-9.6)

### 📅 예정
- [ ] Phase 10: 배포 & 최적화
- [ ] Phase A: 자동 업데이트
- [ ] Phase N: 알림 시스템
- [ ] Phase T: 시간 인지 시스템

자세한 로드맵은 [TODO.md](TODO.md)를 참고하세요.

---

## 🛠️ 기술 스택

### 백엔드
- **Node.js** 18+ + Express
- **MongoDB** 4.4+ + Mongoose
- **AI Services**: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Ollama

### 프론트엔드
- **Vite** 5 - 빠른 빌드 도구
- **Vanilla JavaScript** (ES6+) - 프레임워크 없는 순수 JS
- **CSS Modules** - 컴포넌트 기반 스타일링
- **모듈화 구조** - 명확한 책임 분리

### 핵심 기능
- 토큰 카운팅 & 폭발 방지
- 컨텍스트 압축 & 메모리 계층
- 맥락 감지 & 비유 검색
- 스마트 라우팅 & 단일 인격
- 에이전트 체이닝 (순차/병렬)

---

## ❓ FAQ

**Q: API 키는 어디서 받나요?**
- Anthropic: https://console.anthropic.com/
- OpenAI: https://platform.openai.com/
- Google: https://ai.google.dev/

**Q: MongoDB 설치가 필요한가요?**
Docker 사용 권장:
```bash
docker run -d --name soul-mongodb -p 27017:27017 mongo:7
```

**Q: 로컬 모델만 사용 가능한가요?**
네, Ollama를 설치하고 `.env`에서 설정하세요.

**Q: 프론트엔드 개발 서버는 어떻게 실행하나요?**
```bash
cd client
npm install
npm run dev
# 브라우저에서 http://localhost:8000 접속
```

**Q: 백엔드와 프론트엔드를 동시에 실행하려면?**
```bash
# 터미널 1: 백엔드
cd soul
node server/index.js

# 터미널 2: 프론트엔드
cd client
npm run dev
```

---

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

---

## 🙏 감사의 글

- [LibreChat](https://github.com/danny-avila/LibreChat) - 초기 영감
- [Anthropic](https://www.anthropic.com/) - Claude API
- [OpenAI](https://openai.com/) - GPT API

---

**Made with ❤️ for AI companions**

**Version**: 1.5.0
**Last Updated**: 2026-01-22

## 📝 최근 업데이트 (2026-01-22)

### Phase 9.8: 프론트엔드 모듈화 ✅
- CSS 모듈 분리 (core/components/pages)
- JS 컴포넌트 재구조화 (기능별 폴더)
- 명확한 책임 분리 및 독립성 향상
- 팀 협업 용이성 증대

### 주요 개선사항
- **설정 페이지 프레임워크**: 컴포넌트 기반, 동적 로딩
- **프로필 시스템**: 실용적 필드, 권한 제어
- **AI 서비스 관리**: 리팩토링으로 코드 50% 감소
- **단일 대화방**: 영속적 메모리 연동 완료
