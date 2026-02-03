/**
 * Profile Model
 * 사용자 프로필 (SQLite)
 */

const { Profile } = require('../db/models');

/**
 * value 필드를 파싱해서 프로필 객체에 확장
 */
function parseProfileValue(profile) {
  if (!profile) return null;

  // value 필드 파싱
  let valueData = {};
  if (profile.value) {
    try {
      valueData = typeof profile.value === 'string'
        ? JSON.parse(profile.value)
        : profile.value;
    } catch (e) {
      console.error('[Profile] Error parsing value:', e);
      valueData = {};
    }
  }

  // 기본값 설정
  const defaultData = {
    basicInfo: {
      name: { value: '', visibility: { visibleToSoul: true, autoIncludeInContext: true } },
      country: { value: '', visibility: { visibleToSoul: true, autoIncludeInContext: true } },
      timezone: { value: 'Asia/Seoul', visibility: { visibleToSoul: true, autoIncludeInContext: true } },
      language: { value: 'ko', visibility: { visibleToSoul: true, autoIncludeInContext: true } }
    },
    customFields: [],
    permissions: {
      readScope: 'limited',
      canWrite: false,
      canDelete: false,
      autoIncludeInContext: true,
      includeOnKeywords: ['개인', '나', '내', '취향', '좋아하는']
    },
    metadata: {
      createdAt: profile.createdAt || profile.created_at,
      updatedAt: profile.updatedAt || profile.updated_at
    }
  };

  // 파싱된 데이터와 기본값 병합
  const result = {
    id: profile.id,
    userId: profile.userId || profile.user_id,
    profileKey: profile.profileKey || profile.profile_key,
    profileImage: profile.profileImage || profile.profile_image || null,
    basicInfo: { ...defaultData.basicInfo, ...valueData.basicInfo },
    customFields: valueData.customFields || defaultData.customFields,
    permissions: { ...defaultData.permissions, ...valueData.permissions },
    metadata: valueData.metadata || defaultData.metadata,
    createdAt: profile.createdAt || profile.created_at,
    updatedAt: profile.updatedAt || profile.updated_at,
    // save 메서드 추가 (DB 업데이트용)
    save: async function() {
      const { Profile: ProfileModel } = require('../db/models');
      const newValue = JSON.stringify({
        basicInfo: this.basicInfo,
        customFields: this.customFields,
        permissions: this.permissions,
        metadata: this.metadata
      });
      await ProfileModel.updateOne(
        { id: this.id },
        { value: newValue, profileImage: this.profileImage }
      );
    },
    // Mongoose 호환 메서드
    markModified: function() {}
  };

  return result;
}

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
          timezone: { value: 'Asia/Seoul', visibility: { visibleToSoul: true, autoIncludeInContext: true } },
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

  return parseProfileValue(profile);
};

module.exports = Profile;
