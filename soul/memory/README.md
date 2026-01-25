# Memory Storage

이 디렉토리는 .soul 프로젝트의 메모리 저장소입니다.

## 구조

```
memory/
├── raw/              # 원본 대화 기록 (Markdown)
├── processed/        # AI 분석 결과
├── index.json        # 메타데이터 인덱스
└── README.md         # 이 파일
```

## 파일명 규칙

`YYYY-MM-DD_HHmmss_주제.md`

예시: `2026-01-17_143022_프로젝트_계획.md`

## Markdown 메타데이터 헤더

각 대화 파일은 다음 형식의 메타데이터 헤더로 시작합니다:

```markdown
---
id: conversation-id
date: 2026-01-17T14:30:22Z
participants: ["user", "soul"]
messageCount: 42
topics: ["프로젝트 계획", "메모리 시스템", "API 설계"]
tags: ["개발", "기획", "soul"]
category: "개발"
importance: 8
---

# 대화 제목

## 메시지 1
...
```

## index.json 스키마

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-01-17T14:30:22Z",
  "conversations": [
    {
      "id": "conv-uuid",
      "date": "2026-01-17T14:30:22Z",
      "filename": "2026-01-17_143022_주제.md",
      "path": "raw/2026-01-17_143022_주제.md",
      "messageCount": 42,
      "participants": ["user", "soul"],
      "topics": ["주제1", "주제2", "주제3"],
      "tags": ["태그1", "태그2"],
      "category": "카테고리",
      "importance": 8,
      "fileSize": 12345,
      "lastModified": "2026-01-17T14:30:22Z"
    }
  ]
}
```

## 필드 설명

- **id**: 고유 대화 ID
- **date**: 대화 시작 시간 (ISO 8601)
- **filename**: 파일명
- **path**: 상대 경로
- **messageCount**: 메시지 개수
- **participants**: 참여자 목록
- **topics**: AI가 추출한 주제 (최대 3개)
- **tags**: AI가 생성한 태그 (5-10개)
- **category**: 분류 카테고리
- **importance**: 중요도 점수 (1-10)
- **fileSize**: 파일 크기 (바이트)
- **lastModified**: 마지막 수정 시간
