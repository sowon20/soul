#!/bin/bash
# 코드스페이스에서 실행할 백업 스크립트

echo "🔍 MongoDB 백업 시작..."

# MongoDB 백업
mongodump --uri="mongodb://localhost:27017/soul" --out=/tmp/soul-backup

# 압축
cd /tmp
tar -czf soul-db.tar.gz soul-backup

# 파일 크기 확인
ls -lh soul-db.tar.gz

echo "✅ 백업 완료!"
echo "📁 위치: /tmp/soul-db.tar.gz"
echo ""
echo "다운로드 방법:"
echo "1. VS Code 왼쪽 파일 탐색기"
echo "2. /tmp/soul-db.tar.gz 찾기"
echo "3. 우클릭 → Download"
