#!/bin/bash
# HuggingFace Spaces 전용 래퍼 스크립트
# 서버 시작 전 Dataset에서 복원, 종료 시 백업

set -e

DATA_DIR="${SOUL_DATA_DIR:-/home/node/.soul}"
REPO_ID="${HF_DATASET_REPO:-sowon20/dataset}"

# HF CLI 설치 확인
if ! command -v huggingface-cli &> /dev/null; then
    pip install -q huggingface_hub
fi

# 토큰 로그인
if [ -n "$HF_TOKEN" ]; then
    echo "$HF_TOKEN" | huggingface-cli login --token "$HF_TOKEN" --add-to-git-credential 2>/dev/null || true
fi

# Dataset에서 데이터 복원
restore_data() {
    echo "[HF-Wrapper] Restoring data from dataset..."
    mkdir -p "$DATA_DIR"

    # Dataset에서 파일 다운로드 시도
    if huggingface-cli download "$REPO_ID" --repo-type dataset --local-dir "$DATA_DIR" 2>/dev/null; then
        echo "[HF-Wrapper] Data restored successfully"
    else
        echo "[HF-Wrapper] No existing data found, starting fresh"
    fi
}

# Dataset으로 백업
backup_data() {
    echo "[HF-Wrapper] Backing up data to dataset..."

    if [ -f "$DATA_DIR/soul.db" ]; then
        huggingface-cli upload "$REPO_ID" "$DATA_DIR" --repo-type dataset --commit-message "Auto backup" 2>/dev/null || true
        echo "[HF-Wrapper] Backup complete"
    else
        echo "[HF-Wrapper] No data to backup"
    fi
}

# 시그널 핸들러 (종료 시 백업)
cleanup() {
    echo "[HF-Wrapper] Received shutdown signal, backing up..."
    backup_data
    exit 0
}

trap cleanup SIGTERM SIGINT

# 시작 시 복원
restore_data

# 메인 서버 실행
echo "[HF-Wrapper] Starting Soul server..."
node soul/server/index.js &
SERVER_PID=$!

# 주기적 백업 (5분마다)
while true; do
    sleep 300
    backup_data
done &

# 서버 프로세스 대기
wait $SERVER_PID
