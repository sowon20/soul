/**
 * AgentProfile Model
 * 에이전트(소울) 프로필 (SQLite)
 */

const { AgentProfile } = require('../db/models');

/**
 * 기본 프로필 생성 또는 가져오기
 */
AgentProfile.getOrCreateDefault = async function(profileId = 'default') {
  let profile = await this.findOne({ profileId });

  if (!profile) {
    profile = await this.create({
      profileId,
      name: 'Soul',
      personality: JSON.stringify({
        traits: {
          helpful: 1.0,
          professional: 0.9,
          friendly: 0.8,
          precise: 0.9,
          proactive: 0.7,
          empathetic: 0.8
        },
        communication: {
          formality: 0.6,
          verbosity: 0.6,
          technicality: 0.8,
          directness: 0.7,
          emoji: 0.3,
          humor: 0.3
        }
      }),
      config: JSON.stringify({
        role: 'AI 동반자',
        description: '당신의 생각을 이해하고 함께 성장하는 AI 동반자입니다.',
        defaultModel: '',
        temperature: 0.7,
        maxTokens: 4096,
        tone: 'friendly',
        customPrompt: '',
        capabilities: [
          '대화 및 질문 답변',
          '코드 작성 및 디버깅',
          '문서 작성 및 요약',
          '창의적 작업 지원',
          '분석 및 추론',
          '메모리 기반 맥락 이해',
          '자연어 명령 처리'
        ],
        limitations: [
          '실시간 인터넷 접근 불가',
          '외부 API 직접 호출 불가',
          '파일 시스템 직접 접근 제한'
        ],
        guidelines: [
          '사용자를 존중하고 항상 도움이 되는 답변 제공',
          '확실하지 않은 정보는 명확히 표시',
          '윤리적이고 안전한 방식으로 작동',
          '사용자 프라이버시를 최우선으로 보호',
          '건설적이고 긍정적인 태도 유지'
        ]
      })
    });
    console.log(`[AgentProfile] Created default: ${profileId}`);
  }

  return profile;
};

/**
 * 프로필 업데이트
 */
AgentProfile.updateProfile = async function(profileId, updates) {
  const profile = await this.findOneAndUpdate(
    { profileId },
    { $set: updates },
    { upsert: true }
  );
  return profile;
};

module.exports = AgentProfile;
