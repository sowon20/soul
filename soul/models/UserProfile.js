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

  // 반환된 객체에 헬퍼 메소드 추가
  return addProfileMethods(profile);
};

/**
 * 프로필 객체에 헬퍼 메소드 추가
 */
function addProfileMethods(profile) {
  if (!profile) return null;

  // updateActivity 메소드
  profile.updateActivity = async function() {
    await UserProfile.updateOne(
      { userId: this.userId },
      { lastActiveAt: new Date().toISOString() }
    );
    this.lastActiveAt = new Date().toISOString();
  };

  // updateTheme 메소드
  profile.updateTheme = async function(themeSettings) {
    const preferences = typeof this.preferences === 'string'
      ? JSON.parse(this.preferences || '{}')
      : (this.preferences || {});

    preferences.theme = { ...preferences.theme, ...themeSettings };

    await UserProfile.updateOne(
      { userId: this.userId },
      { preferences: JSON.stringify(preferences) }
    );
    this.preferences = preferences;
  };

  // save 메소드 (호환성)
  profile.save = async function() {
    await UserProfile.updateOne(
      { userId: this.userId },
      {
        name: this.name,
        displayName: this.displayName,
        email: this.email,
        timezone: this.timezone,
        language: this.language,
        preferences: typeof this.preferences === 'string'
          ? this.preferences
          : JSON.stringify(this.preferences || {}),
        context: typeof this.context === 'string'
          ? this.context
          : JSON.stringify(this.context || {}),
        interests: typeof this.interests === 'string'
          ? this.interests
          : JSON.stringify(this.interests || []),
        customFields: typeof this.customFields === 'string'
          ? this.customFields
          : JSON.stringify(this.customFields || {})
      }
    );
    return this;
  };

  return profile;
}

// findOne 래퍼 (메소드 추가)
const originalFindOne = UserProfile.findOne.bind(UserProfile);
UserProfile.findOne = async function(query) {
  const profile = await originalFindOne(query);
  return addProfileMethods(profile);
};

// findById 래퍼 (메소드 추가)
const originalFindById = UserProfile.findById.bind(UserProfile);
UserProfile.findById = async function(id) {
  const profile = await originalFindById(id);
  return addProfileMethods(profile);
};

module.exports = UserProfile;
