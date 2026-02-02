# HuggingFace Spaces 전용 Dockerfile
# 메인 코드는 건드리지 않고 HF Dataset 연동만 추가

FROM node:20-slim

WORKDIR /app

# 시스템 패키지 + Python (HF CLI용)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    git \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# HuggingFace CLI 설치
RUN pip3 install --break-system-packages huggingface_hub

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
RUN mkdir -p /home/node/.soul && chown -R node:node /home/node/.soul

# node 유저로 전환
USER node

# 포트 설정 (HF는 7860)
EXPOSE 7860

# 환경변수
ENV PORT=7860
ENV NODE_ENV=production
ENV SOUL_DATA_DIR=/home/node/.soul

# HF 래퍼로 실행 (복원 → 서버 → 주기적 백업)
CMD ["bash", "./hf-wrapper.sh"]
