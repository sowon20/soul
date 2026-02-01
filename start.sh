#!/bin/bash

# Soul 실행 스크립트 (프로덕션)

cd "$(dirname "$0")"

# 환경변수
export NODE_ENV=production
export MONGODB_URI=mongodb://localhost:27017/soul
export PORT=3001
export MEMORY_STORAGE_PATH=./memory

# MongoDB 확인
if ! pgrep -x "mongod" > /dev/null; then
  echo "⚠️  MongoDB가 실행 중이 아닙니다."
  echo "   brew services start mongodb-community"
  exit 1
fi

# 백엔드 실행
echo "🚀 Starting Backend..."
cd soul
npm install --silent 2>/dev/null
node server/index.js &
BACKEND_PID=$!
cd ..

sleep 2

# 프론트엔드 빌드 및 서빙
echo "🎨 Starting Frontend..."
cd client
npm install --silent 2>/dev/null
npm run build --silent 2>/dev/null
npx serve -s dist -l 3000 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Soul is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
