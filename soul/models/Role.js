/**
 * Role Model
 * 동적 역할 관리 (SQLite)
 */

const { Role } = require('../db/models');

/**
 * 활성 역할 목록
 */
Role.getActiveRoles = async function() {
  return this.find({ isActive: 1 });
};

/**
 * 기본 역할 초기화
 */
Role.initializeDefaultRoles = async function() {
  const db = require('../db');
  if (!db.db) db.init();

  const defaultRoles = [
    {
      roleId: 'digest-worker',
      name: '자동 요약',
      description: '대화를 자동으로 요약하고 중요한 기억을 추출합니다.',
      systemPrompt: '',  // session-digest.js 내부 프롬프트 사용
      preferredModel: '',  // UI에서 설정
      tools: '[]',
      isActive: 1,
      isSystem: 1,
      config: JSON.stringify({
        serviceId: '',
        temperature: 0.3,
        maxTokens: 800,
        purpose: 'digest'
      })
    },
    {
      roleId: 'embedding-worker',
      name: '벡터 임베딩',
      description: '다이제스트 결과를 벡터 임베딩하여 의미적 검색을 지원합니다.',
      systemPrompt: '',
      preferredModel: 'qwen/qwen3-embedding-8b',
      tools: '[]',
      isActive: 1,
      isSystem: 1,
      config: JSON.stringify({
        serviceId: 'openrouter',
        purpose: 'embedding'
      })
    },
    {
      roleId: 'vision-worker',
      name: '이미지 분석',
      description: '이미지를 분석하여 텍스트 설명을 생성합니다. 비전 미지원 모델 사용 시 자동 호출됩니다.',
      systemPrompt: `당신은 이미지 분석 전문가입니다.
주어진 이미지를 상세히 분석하여 다음을 포함한 설명을 작성하세요:
- 이미지에 보이는 주요 요소와 객체
- 텍스트가 있다면 정확히 읽어서 포함
- 색상, 구성, 분위기
- 전체적인 맥락과 의미
간결하지만 핵심을 놓치지 않는 설명을 제공하세요.`,
      preferredModel: '',
      tools: '[]',
      isActive: 0,
      isSystem: 1,
      config: JSON.stringify({
        serviceId: '',
        temperature: 0.3,
        maxTokens: 1000,
        purpose: 'vision'
      })
    },
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
