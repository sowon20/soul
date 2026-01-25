#!/bin/bash

# Soul 개발 모드 실행

cd "$(dirname "$0")"

# 환경변수
export NODE_ENV=development
export MONGODB_URI=mongodb://localhost:27017/soul
export PORT=3001
export MEMORY_STORAGE_PATH=./memory

# MongoDB 확인
if ! pgrep -x "mongod" > /dev/null; then
  echo "⚠️  MongoDB가 실행 중이 아닙니다."
  echo "   brew services start mongodb-community"
  exit 1
fi

# 백엔드 (nodemon)
echo "🚀 Starting Backend (dev)..."
cd soul
npm install --silent 2>/dev/null
npx nodemon server/index.js &
BACKEND_PID=$!
cd ..

sleep 2

# 프론트엔드 (vite dev)
echo "🎨 Starting Frontend (dev)..."
cd client
npm install --include=dev --silent 2>/dev/null
npx vite --host 0.0.0.0 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Soul DEV is running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001"
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
