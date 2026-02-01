/**
 * roles.js
 * Soul의 전문 작업 알바들 (Worker Roles)
 *
 * Soul은 사장 (대화 담당)
 * Roles는 알바 (전문 작업 수행)
 */

const ROLES = {
  // 문서 요약 알바 (경량 모델 사용 - 비용 절감)
  summarizer: {
    id: 'summarizer',
    name: '문서 요약',
    description: '긴 문서를 간결하게 요약',

    // 모델 설정
    preferredModel: 'claude-3-5-haiku-20241022',  // Haiku 사용 (경량)
    fallbackModel: 'gpt-4o-mini',  // 폴백

    // 프롬프트
    systemPrompt: `당신은 문서 요약 전문가입니다.
주어진 텍스트를 간결하고 핵심만 담아 요약하세요.
- 핵심 포인트 3-5개로 정리
- 불필요한 세부사항 제거
- 명확하고 이해하기 쉽게`,

    // 설정
    maxTokens: 1000,
    temperature: 0.3,  // 낮은 창의성, 높은 일관성

    // 트리거 (이런 요청 시 자동 호출)
    triggers: [
      '요약',
      'summarize',
      '정리',
      '핵심',
      '간단히'
    ]
  },

  // 코드 생성 알바 (고성능 모델)
  coder: {
    id: 'coder',
    name: '코드 생성',
    description: '고품질 코드 작성 및 리팩토링',

    preferredModel: 'claude-3-5-sonnet-20241022',
    fallbackModel: 'gpt-4o',

    systemPrompt: `당신은 시니어 개발자입니다.
고품질의 프로덕션 레벨 코드를 작성하세요.
- 클린 코드 원칙 준수
- 적절한 에러 핸들링
- 명확한 변수/함수명
- 필요시 주석 추가 (영어)`,

    maxTokens: 4096,
    temperature: 0.7,

    triggers: [
      '코드',
      'code',
      '함수',
      '구현',
      'implement',
      '작성'
    ]
  },

  // 데이터 분석 알바
  analyzer: {
    id: 'analyzer',
    name: '데이터 분석',
    description: '데이터 분석 및 인사이트 도출',

    preferredModel: 'gpt-4o',
    fallbackModel: 'claude-3-5-sonnet-20241022',

    systemPrompt: `당신은 데이터 분석 전문가입니다.
데이터를 깊이 분석하고 의미있는 인사이트를 제공하세요.
- 패턴 발견
- 트렌드 파악
- 실행 가능한 제안`,

    maxTokens: 2048,
    temperature: 0.5,

    triggers: [
      '분석',
      'analyze',
      '데이터',
      '통계',
      '인사이트'
    ]
  },

  // 리서치 알바 (최고성능 모델)
  researcher: {
    id: 'researcher',
    name: '심층 리서치',
    description: '깊이 있는 조사 및 분석',

    preferredModel: 'claude-3-opus-20240229',
    fallbackModel: 'gpt-4o',

    systemPrompt: `당신은 리서치 전문가입니다.
주제를 깊이 있게 조사하고 다각도로 분석하세요.
- 다양한 관점 고려
- 근거 기반 분석
- 상세한 설명`,

    maxTokens: 8192,
    temperature: 0.6,

    triggers: [
      '조사',
      'research',
      '리서치',
      '알아봐',
      '찾아봐'
    ]
  },

  // 번역 알바 (경량 모델)
  translator: {
    id: 'translator',
    name: '번역',
    description: '다국어 번역',

    preferredModel: 'claude-3-5-haiku-20241022',
    fallbackModel: 'gpt-4o-mini',

    systemPrompt: `당신은 전문 번역가입니다.
정확하고 자연스러운 번역을 제공하세요.
- 문맥 고려
- 자연스러운 표현
- 문화적 뉘앙스 반영`,

    maxTokens: 2000,
    temperature: 0.3,

    triggers: [
      '번역',
      'translate',
      '영어로',
      '한국어로',
      '일본어로'
    ]
  },

  // 리뷰 알바
  reviewer: {
    id: 'reviewer',
    name: '코드 리뷰',
    description: '코드 품질 검토',

    preferredModel: 'claude-3-5-sonnet-20241022',
    fallbackModel: 'gpt-4o',

    systemPrompt: `당신은 코드 리뷰어입니다.
코드를 꼼꼼히 검토하고 개선점을 제안하세요.
- 버그 찾기
- 성능 이슈
- 보안 취약점
- 개선 제안`,

    maxTokens: 3000,
    temperature: 0.4,

    triggers: [
      '리뷰',
      'review',
      '검토',
      '문제점',
      '개선'
    ]
  }
};

/**
 * 작업 유형 감지
 * @param {string} message - 사용자 메시지
 * @returns {string|null} - 역할 ID 또는 null
 */
function detectRole(message) {
  const lowerMessage = message.toLowerCase();

  for (const [roleId, role] of Object.entries(ROLES)) {
    for (const trigger of role.triggers) {
      if (lowerMessage.includes(trigger.toLowerCase())) {
        return roleId;
      }
    }
  }

  return null;
}

/**
 * 역할별 모델 선택
 * @param {string} roleId - 역할 ID
 * @param {Object} availableModels - 사용 가능한 모델 목록
 * @returns {string} - 선택된 모델
 */
function selectModelForRole(roleId, availableModels = {}) {
  const role = ROLES[roleId];
  if (!role) return 'claude-3-5-sonnet-20241022'; // 기본값

  // 우선 모델 체크
  if (availableModels[role.preferredModel]) {
    return role.preferredModel;
  }

  // 폴백 모델
  if (availableModels[role.fallbackModel]) {
    return role.fallbackModel;
  }

  // 둘 다 없으면 기본값
  return 'claude-3-5-sonnet-20241022';
}

module.exports = {
  ROLES,
  detectRole,
  selectModelForRole
};
