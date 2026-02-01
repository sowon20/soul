FROM node:18-slim

WORKDIR /app

# 네이티브 모듈 빌드를 위한 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# 의존성 먼저 설치 (캐시 활용)
COPY package*.json ./
RUN npm install --production

# 소스 복사
COPY . .

# 포트 설정
EXPOSE 8080

# 환경변수
ENV PORT=8080
ENV NODE_ENV=production

# 실행
CMD ["node", "server/index.js"]
