# Soul Frontend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 패키지 파일 복사 및 설치
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# Nginx로 서빙
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx 설정 (SPA + API 프록시)
RUN echo 'server { \
    listen 80; \
    location /api/ { \
        proxy_pass http://soul-backend:3001/api/; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    location / { \
        root /usr/share/nginx/html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
