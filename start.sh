#!/bin/bash

# Soul 실행 스크립트 (프로덕션)

cd "$(dirname "$0")"

# 환경변수
export NODE_ENV=production
export PORT=${PORT:-4000}

# 백엔드 실행
echo "🚀 Starting Soul Server..."
cd soul
node server/index.js
