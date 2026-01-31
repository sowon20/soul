/**
 * Role Model
 * 동적 역할 관리 (SQLite)
 */

const { Role } = require('../db/models');

/**
 * 활성 역할 목록
 */
Role.getActiveRoles = async function() {
  return this.find({ active: 1 });
};

/**
 * 기본 역할 초기화
 */
Role.initializeDefaultRoles = async function() {
  const db = require('../db');
  if (!db.db) db.init();

  const defaultRoles = [
    {
      roleId: 'summarizer',
      name: '문서 요약',
      description: '긴 문서를 간결하게 요약',
      preferredModel: 'claude-sonnet-4-20250514',
      systemPrompt: `당신은 문서 요약 전문가입니다.
주어진 텍스트를 간결하고 핵심만 담아 요약하세요.
- 핵심 포인트 3-5개로 정리
- 불필요한 세부사항 제거
- 명확하고 이해하기 쉽게`,
      config: JSON.stringify({
        fallbackModel: 'claude-3-5-haiku-20241022',
        maxTokens: 1000,
        temperature: 0.3,
        triggers: ['요약', 'summarize', '정리', '핵심', '간단히'],
        category: 'content',
        createdBy: 'system'
      })
    },
    {
      roleId: 'coder',
      name: '코드 생성',
      description: '고품질 코드 작성 및 리팩토링',
      preferredModel: 'claude-sonnet-4-20250514',
      systemPrompt: `당신은 시니어 개발자입니다.
고품질의 프로덕션 레벨 코드를 작성하세요.
- 클린 코드 원칙 준수
- 적절한 에러 핸들링
- 명확한 변수/함수명
- 필요시 주석 추가 (영어)`,
      config: JSON.stringify({
        fallbackModel: 'claude-3-5-haiku-20241022',
        maxTokens: 4096,
        temperature: 0.7,
        triggers: ['코드', 'code', '함수', '구현', 'implement', '작성'],
        category: 'code',
        createdBy: 'system'
      })
    },
    {
      roleId: 'analyzer',
      name: '데이터 분석',
      description: '데이터 분석 및 인사이트 도출',
      preferredModel: 'claude-sonnet-4-20250514',
      systemPrompt: `당신은 데이터 분석 전문가입니다.
데이터를 깊이 분석하고 의미있는 인사이트를 제공하세요.
- 패턴 발견
- 트렌드 파악
- 실행 가능한 제안`,
      config: JSON.stringify({
        fallbackModel: 'claude-3-5-haiku-20241022',
        maxTokens: 2048,
        temperature: 0.5,
        triggers: ['분석', 'analyze', '데이터', '통계', '인사이트'],
        category: 'data',
        createdBy: 'system'
      })
    },
    {
      roleId: 'researcher',
      name: '심층 리서치',
      description: '깊이 있는 조사 및 분석',
      preferredModel: 'claude-sonnet-4-20250514',
      systemPrompt: `당신은 리서치 전문가입니다.
주제를 깊이 있게 조사하고 다각도로 분석하세요.
- 다양한 관점 고려
- 근거 기반 분석
- 상세한 설명`,
      config: JSON.stringify({
        fallbackModel: 'claude-3-5-haiku-20241022',
        maxTokens: 8192,
        temperature: 0.6,
        triggers: ['조사', 'research', '리서치', '알아봐', '찾아봐'],
        category: 'technical',
        createdBy: 'system'
      })
    },
    {
      roleId: 'translator',
      name: '번역',
      description: '다국어 번역',
      preferredModel: 'claude-sonnet-4-20250514',
      systemPrompt: `당신은 전문 번역가입니다.
정확하고 자연스러운 번역을 제공하세요.
- 문맥 고려
- 자연스러운 표현
- 문화적 뉘앙스 반영`,
      config: JSON.stringify({
        fallbackModel: 'claude-3-5-haiku-20241022',
        maxTokens: 2000,
        temperature: 0.3,
        triggers: ['번역', 'translate', '영어로', '한국어로', '일본어로'],
        category: 'content',
        createdBy: 'system'
      })
    },
    {
      roleId: 'reviewer',
      name: '코드 리뷰',
      description: '코드 품질 검토',
      preferredModel: 'claude-sonnet-4-20250514',
      systemPrompt: `당신은 코드 리뷰어입니다.
코드를 꼼꼼히 검토하고 개선점을 제안하세요.
- 버그 찾기
- 성능 이슈
- 보안 취약점
- 개선 제안`,
      config: JSON.stringify({
        fallbackModel: 'claude-3-5-haiku-20241022',
        maxTokens: 3000,
        temperature: 0.4,
        triggers: ['리뷰', 'review', '검토', '문제점', '개선'],
        category: 'code',
        createdBy: 'system'
      })
    }
  ];

  for (const roleData of defaultRoles) {
    const existing = db.Role.findOne({ roleId: roleData.roleId });
    if (!existing) {
      db.Role.create(roleData);
      console.log(`[Role] Created: ${roleData.name}`);
    }
  }
};

module.exports = Role;
