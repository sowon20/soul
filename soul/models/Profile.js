/**
 * Profile Model
 * 사용자 프로필 (SQLite)
 */

const { Profile } = require('../db/models');

/**
 * 기본 프로필 생성 또는 가져오기
 */
Profile.getOrCreateDefault = async function(userId = 'default') {
  let profile = await this.findOne({ userId });

  if (!profile) {
    profile = await this.create({
      userId,
      profileKey: userId,
      value: JSON.stringify({
        basicInfo: {
          name: { value: '', visibility: { visibleToSoul: true, autoIncludeInContext: true } },
          country: { value: '', visibility: { visibleToSoul: true, autoIncludeInContext: true } },
          timezone: { value: 'UTC', visibility: { visibleToSoul: true, autoIncludeInContext: true } },
          language: { value: 'ko', visibility: { visibleToSoul: true, autoIncludeInContext: true } }
        },
        customFields: [],
        permissions: {
          readScope: 'limited',
          canWrite: false,
          canDelete: false,
          autoIncludeInContext: true,
          includeOnKeywords: ['개인', '나', '내', '취향', '좋아하는']
        }
      })
    });
    console.log(`[Profile] Created default: ${userId}`);
  }

  return profile;
};

module.exports = Profile;
