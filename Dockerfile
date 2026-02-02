# 공용 Dockerfile (HF Space + Oracle VM)
# HF에서는 환경변수로 HF 모드 활성화

FROM node:20-slim

WORKDIR /app

# 시스템 패키지 + Python (HF CLI용)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    git \
    unzip \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# HuggingFace CLI 설치 (HF 환경에서 사용)
RUN pip3 install --break-system-packages huggingface_hub || true

# client 의존성 설치 및 빌드
COPY --chown=node:node client/package*.json ./client/
RUN cd client && npm install

COPY --chown=node:node client ./client
RUN cd client && npm run build

# soul 폴더의 의존성 설치
COPY --chown=node:node soul/package*.json ./soul/
RUN cd soul && npm install --production --ignore-optional

# soul 소스 복사
COPY --chown=node:node soul ./soul

# HF 래퍼 스크립트 복사
COPY --chown=node:node deploy/hf/hf-wrapper.sh ./hf-wrapper.sh
RUN chmod +x ./hf-wrapper.sh

# 데이터 디렉토리 생성
RUN mkdir -p /home/node/.soul/memory /home/node/.soul/files && chown -R node:node /home/node/.soul

# Oracle Wallet 디렉토리 생성
RUN mkdir -p /app/soul/config/oracle && chown -R node:node /app/soul/config/oracle

# node 유저로 전환 (UID 1000)
USER node

# 포트 설정 (환경변수로 오버라이드 가능)
EXPOSE 4000
EXPOSE 7860

# 환경변수 (배포 환경에서 오버라이드)
ENV PORT=4000
ENV NODE_ENV=production
ENV SOUL_DATA_DIR=/home/node/.soul
ENV ORACLE_WALLET_DIR=/app/soul/config/oracle

# 실행 - HF_SPACE 환경변수가 있으면 래퍼 실행, 없으면 직접 실행
CMD if [ -n "$SPACE_ID" ]; then bash ./hf-wrapper.sh; else node soul/server/index.js; fi
