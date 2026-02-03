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
      name: '',
      personality: JSON.stringify({
        traits: {},
        communication: {}
      }),
      config: JSON.stringify({
        role: '',
        description: '',
        defaultModel: '',
        temperature: null,
        maxTokens: null,
        tone: '',
        customPrompt: '',
        capabilities: [],
        limitations: [],
        guidelines: []
      })
    });
    console.log(`[AgentProfile] Created default: ${profileId}`);
  }

  return profile;
};

/**
 * 프로필 업데이트
 * config와 personality 필드는 기존 값과 병합
 */
AgentProfile.updateProfile = async function(profileId, updates) {
  // 기존 프로필 조회
  const existing = await this.findOne({ profileId });

  // 업데이트할 데이터 준비
  const updateData = { ...updates };

  if (existing) {
    // config 필드 병합 (role, description, temperature 등)
    if (updates.role !== undefined || updates.description !== undefined ||
        updates.temperature !== undefined || updates.maxTokens !== undefined ||
        updates.tone !== undefined || updates.customPrompt !== undefined ||
        updates.defaultModel !== undefined) {
      const existingConfig = typeof existing.config === 'string'
        ? JSON.parse(existing.config)
        : (existing.config || {});

      const newConfig = {
        ...existingConfig,
        ...(updates.role !== undefined && { role: updates.role }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.temperature !== undefined && { temperature: updates.temperature }),
        ...(updates.maxTokens !== undefined && { maxTokens: updates.maxTokens }),
        ...(updates.tone !== undefined && { tone: updates.tone }),
        ...(updates.customPrompt !== undefined && { customPrompt: updates.customPrompt }),
        ...(updates.defaultModel !== undefined && { defaultModel: updates.defaultModel })
      };

      updateData.config = newConfig;
      // 개별 필드 삭제 (config에 통합)
      delete updateData.role;
      delete updateData.description;
      delete updateData.temperature;
      delete updateData.maxTokens;
      delete updateData.tone;
      delete updateData.customPrompt;
      delete updateData.defaultModel;
    }

    // personality 필드 병합
    if (updates.personality) {
      const existingPersonality = typeof existing.personality === 'string'
        ? JSON.parse(existing.personality)
        : (existing.personality || { traits: {}, communication: {} });

      updateData.personality = {
        traits: {
          ...existingPersonality.traits,
          ...(updates.personality.traits || {})
        },
        communication: {
          ...existingPersonality.communication,
          ...(updates.personality.communication || {})
        }
      };
    }
  }

  const profile = await this.findOneAndUpdate(
    { profileId },
    { $set: updateData },
    { upsert: true }
  );
  return profile;
};

module.exports = AgentProfile;
