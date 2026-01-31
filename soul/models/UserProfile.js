/**
 * UserProfile Model
 * 사용자 프로필 및 설정 (SQLite)
 */

const { UserProfile } = require('../db/models');

/**
 * 기본 사용자 프로필 생성
 */
UserProfile.getOrCreateDefault = async function(userId = 'default') {
  let profile = await this.findOne({ userId });

  if (!profile) {
    profile = await this.create({
      userId,
      name: null,
      displayName: null,
      email: null,
      timezone: 'Asia/Seoul',
      language: 'ko',
      preferences: JSON.stringify({
        responseStyle: 'balanced',
        codeStyle: 'explanatory',
        language: 'korean',
        theme: {
          skin: 'default',
          fontSize: 'md',
          glassEnabled: true,
          glassOpacity: 85,
          glassBlur: 20,
          backgroundImage: null,
          backgroundOpacity: 30,
          backgroundBlur: 5
        }
      }),
      interests: JSON.stringify([]),
      customFields: JSON.stringify({})
    });
    console.log(`[UserProfile] Created default: ${userId}`);
  }

  return profile;
};

module.exports = UserProfile;
