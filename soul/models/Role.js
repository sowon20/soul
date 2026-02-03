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
      roleId: 'digest-worker',
      name: '다이제스트 워커',
      description: '대화 요약 + 메모리 추출 전용. session-digest.js가 자동 호출.',
      systemPrompt: '',  // session-digest.js 내부 프롬프트 사용
      preferredModel: 'openai/gpt-oss-20b:free',
      tools: '[]',
      isActive: 1,
      isSystem: 1,
      config: JSON.stringify({
        serviceId: 'openrouter',
        temperature: 0.3,
        maxTokens: 800,
        purpose: 'digest'
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
