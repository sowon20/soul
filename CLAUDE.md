# CLAUDE.md - Soul AI 프로젝트 가이드

## 프로젝트 개요

Soul은 **단일 인격 AI 동반자 시스템**입니다. 여러 AI 모델(Claude, GPT, Gemini, Ollama)을 사용하면서도 일관된 성격을 유지하는 것이 핵심 철학입니다.

### 핵심 원칙
- 단일 통합 인격 (모드 분리 없음)
- 자연어 제어 (모든 설정과 기능을 자연어로 조작)
- 고정 템플릿 없음
- 환경 변수 기반 설정

## 기술 스택

### 백엔드 (`/soul`)
- Node.js 18+ / Express.js
- MongoDB 4.4+ (primary) + SQLite (fallback)
- Mongoose ORM
- Socket.io (실시간)
- JWT + bcrypt (인증)

### 프론트엔드 (`/client`)
- Vite 5
- Vanilla JavaScript (ES6+) - 프레임워크 없음
- CSS Variables + 모듈식 CSS
- marked.js (마크다운)

### MCP 서버 (`/mcp`)
- 10개 도구: 메모리 4개, 컨텍스트 4개, NLP 2개

## 디렉토리 구조

```
soul/
├── soul/              # 백엔드
│   ├── server/        # Express 서버 진입점
│   ├── routes/        # API 엔드포인트 (~20개)
│   ├── models/        # DB 모델 (12개)
│   └── utils/         # 유틸리티 (52개)
├── client/            # 프론트엔드
│   └── src/
│       ├── components/  # UI 컴포넌트
│       ├── settings/    # 설정 모듈
│       ├── styles/      # CSS
│       └── utils/       # 유틸리티
├── mcp/               # MCP 서버
└── config/            # 설정 템플릿
```

## 주요 유틸리티 파일

| 파일 | 설명 |
|------|------|
| `soul/utils/ai-service.js` | AI 서비스 통합 (82KB) |
| `soul/utils/conversation-pipeline.js` | 대화 파이프라인 |
| `soul/utils/memory-layers.js` | 3계층 메모리 시스템 |
| `soul/utils/smart-router.js` | 모델 자동 선택 |
| `soul/utils/context-detector.js` | 컨텍스트 감지 |
| `soul/utils/context-compressor.js` | 컨텍스트 압축 |

## 개발 명령어

```bash
# 백엔드 실행
cd soul && npm start

# 프론트엔드 개발
cd client && npm run dev

# 전체 설치
./install.sh
```

## 포트
- 백엔드: 3080
- 프론트엔드 (dev): 8000

## 환경 변수

`.env.example` 참조. 주요 변수:
- `ANTHROPIC_API_KEY` - Claude API 키
- `OPENAI_API_KEY` - OpenAI API 키
- `MONGODB_URI` - MongoDB 연결 문자열
- `JWT_SECRET` - JWT 시크릿

## 코드 스타일

- 한국어 주석 사용
- ES6+ 문법
- 프론트엔드는 프레임워크 없이 Vanilla JS
- CSS는 모듈식 구조 (`styles/core/`, `styles/components/`)

## 관련 문서

- [README.md](README.md) - 프로젝트 소개
- [TODO.md](TODO.md) - 개발 로드맵 (Phase 1-9.8 완료)
- [soul/API_REFERENCE.md](soul/API_REFERENCE.md) - API 문서
- [soul/PANEL_SYSTEM.md](soul/PANEL_SYSTEM.md) - 패널 시스템
- [soul/SMART_ROUTING.md](soul/SMART_ROUTING.md) - 스마트 라우팅

## 현재 상태

- Phase 1-9.8 완료
- 버전: 1.5.0
- 활발히 개발 중
