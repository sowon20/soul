# Soul Backend Dockerfile
FROM node:20-alpine

WORKDIR /app

# 패키지 파일 복사 및 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 3001

# 시작 명령
CMD ["npm", "start"]
