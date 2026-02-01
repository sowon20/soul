FROM node:18-slim

# Hugging Face Spaces는 user 1000으로 실행 (이미 있으면 스킵)
RUN useradd -m -u 1000 user 2>/dev/null || true

WORKDIR /app

# 네이티브 모듈 빌드를 위한 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# soul 폴더의 의존성 설치
COPY --chown=user soul/package*.json ./soul/
RUN cd soul && npm install --production

# 전체 소스 복사 (client + soul)
COPY --chown=user client ./client
COPY --chown=user soul ./soul

# user로 전환
USER user

# 포트 설정 (Hugging Face는 7860 사용)
EXPOSE 7860

# 환경변수
ENV PORT=7860
ENV NODE_ENV=production

# 실행
CMD ["node", "soul/server/index.js"]
