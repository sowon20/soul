# 🌟 .soul

완전 포터블 AI 동반자 시스템

## 📦 특징

- ✅ **완전 포터블**: 어디서든 복사만 하면 작동
- ✅ **상대 경로만 사용**: 절대 경로 없음
- ✅ **Docker 기반**: 환경 독립적
- ✅ **단일 인격 AI**: 템플릿 없는 자연스러운 대화

## 🚀 빠른 시작

### 1. 사전 요구사항
- Docker Desktop
- Git

### 2. 설치
```bash
git clone https://github.com/sowon20/.soul.git
cd .soul
./start.sh
```

### 3. 접속
- Frontend: http://localhost:3080
- Backend: http://localhost:3001

## 📁 구조
```
.soul/
├── docker-compose.yml   # 포터블 설정
├── start.sh            # 시작 스크립트
├── soul/               # 백엔드
├── client/             # 프론트엔드
├── data/               # 데이터 (자동 생성)
│   ├── mongodb/        # DB
│   └── files/          # 파일
└── memory/             # 메모리 (자동 생성)
```

## 🔄 서버 이동

### 맥 → 맥미니
```bash
# 1. 맥에서 폴더 통째로 복사
rsync -av /Volumes/soul/app/ 맥미니:/path/to/soul/

# 2. 맥미니에서
cd /path/to/soul
./start.sh
```

### 외장하드 사용
```bash
# 외장하드에 복사
cp -R /Volumes/soul/app/ /Volumes/외장하드/SOUL/

# 어느 맥에서든
cd /Volumes/외장하드/SOUL
./start.sh
```

## 🛠️ 명령어

```bash
# 시작
./start.sh

# 중지
docker-compose down

# 로그 보기
docker-compose logs -f

# 재시작
docker-compose restart

# 완전 삭제 (데이터 유지)
docker-compose down

# 완전 삭제 (데이터 포함)
docker-compose down -v
rm -rf data/
```

## 📝 환경 변수

```bash
# .env 파일 생성 (선택사항)
cp .env.example .env
# 필요한 값 수정
```

## 🔒 보안

- MongoDB: 기본 포트만 열림 (외부 접속 불가)
- API Key: 환경변수로 관리
- 데이터: 로컬에만 저장

## 📄 라이선스

MIT
