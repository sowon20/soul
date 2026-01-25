#!/bin/bash

# Soul 시작 스크립트
# 어디서든 실행 가능한 포터블 스크립트

# 현재 스크립트 위치 감지
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🌟 Soul 시작 중..."
echo "📍 위치: $SCRIPT_DIR"

# Docker 확인
if ! command -v docker &> /dev/null; then
    echo "❌ Docker가 설치되지 않았습니다."
    echo "   brew install --cask docker"
    exit 1
fi

# Docker Compose 확인
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose가 설치되지 않았습니다."
    exit 1
fi

# 폴더 생성
mkdir -p data/mongodb data/files memory

# Docker Compose 실행
echo "🚀 Docker Compose 시작..."
docker-compose up -d

echo ""
echo "✅ Soul이 시작되었습니다!"
echo "   Frontend: http://localhost:3080"
echo "   Backend: http://localhost:3001"
echo ""
echo "로그 보기: docker-compose logs -f"
echo "중지: docker-compose down"
