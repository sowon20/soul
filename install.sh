#!/bin/bash

# Soul Project - 설치 스크립트

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Soul Project - 설치 스크립트       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# 1. Node.js 확인
echo "📦 Node.js 확인..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js가 설치되어 있지 않습니다.${NC}"
    echo "   brew install node"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# 2. MongoDB 확인/설치
echo ""
echo "🗄️  MongoDB 확인..."
if ! command -v mongod &> /dev/null; then
    echo -e "${YELLOW}MongoDB가 설치되어 있지 않습니다.${NC}"
    read -p "brew로 설치할까요? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew tap mongodb/brew
        brew install mongodb-community
        brew services start mongodb-community
    else
        echo -e "${RED}❌ MongoDB 설치가 필요합니다.${NC}"
        exit 1
    fi
fi

# MongoDB 실행 확인
if ! pgrep -x "mongod" > /dev/null; then
    echo "MongoDB 시작 중..."
    brew services start mongodb-community
    sleep 2
fi
echo -e "${GREEN}✓${NC} MongoDB 실행 중"

# 3. 디렉토리 생성
echo ""
echo "📁 디렉토리 생성..."
mkdir -p memory/sessions memory/archives memory/summaries
mkdir -p data/files
echo -e "${GREEN}✓${NC} 디렉토리 준비 완료"

# 4. 백엔드 의존성 설치
echo ""
echo "🔧 백엔드 의존성 설치..."
cd soul
npm install --silent
cd ..
echo -e "${GREEN}✓${NC} 백엔드 설치 완료"

# 5. 프론트엔드 의존성 설치
echo ""
echo "🎨 프론트엔드 의존성 설치..."
cd client
npm install --include=dev --silent
npm run build --silent
cd ..
echo -e "${GREEN}✓${NC} 프론트엔드 빌드 완료"

# 6. 환경변수
echo ""
echo "⚙️  환경변수 확인..."
if [ ! -f .env ]; then
    cat > .env << EOF
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/soul
PORT=3001
MEMORY_STORAGE_PATH=./memory

# API Keys (필요시 설정)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
EOF
    echo -e "${YELLOW}⚠️  .env 파일이 생성되었습니다. API 키를 설정하세요.${NC}"
else
    echo -e "${GREEN}✓${NC} .env 파일 존재"
fi

# 완료
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ 설치 완료!${NC}"
echo ""
echo "실행 방법:"
echo "  개발 모드:  ./start-dev.sh"
echo "  프로덕션:   ./start.sh"
echo ""
echo "접속:"
echo "  http://localhost:5173 (개발)"
echo "  http://localhost:3000 (프로덕션)"
echo -e "${GREEN}════════════════════════════════════════${NC}"
