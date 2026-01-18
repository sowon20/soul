/**
 * user-profile.js
 * 사용자 프로필 관리 시스템
 *
 * Week 2.5: 시스템 프롬프트 & 프로필 시스템
 *
 * 기능:
 * - 사용자 정보 관리
 * - 선호도 저장
 * - 시스템 프롬프트에 사용자 정보 주입
 */

/**
 * UserProfile 클래스
 */
class UserProfile {
  constructor(options) {
    this.userId = options.userId || 'default-user';
    this.name = options.name || null;
    this.displayName = options.displayName || null;
    this.email = options.email || null;
    this.timezone = options.timezone || 'Asia/Seoul';
    this.language = options.language || 'ko';
    this.preferences = options.preferences || {};
    this.context = options.context || null;  // 사용자에 대한 추가 컨텍스트
    this.interests = options.interests || [];
    this.customFields = options.customFields || {};
    this.createdAt = options.createdAt || new Date();
    this.updatedAt = new Date();
    this.lastActiveAt = new Date();
  }

  /**
   * 선호도 설정
   */
  setPreference(key, value) {
    this.preferences[key] = value;
    this.updatedAt = new Date();
  }

  /**
   * 선호도 조회
   */
  getPreference(key, defaultValue = null) {
    return this.preferences[key] !== undefined
      ? this.preferences[key]
      : defaultValue;
  }

  /**
   * 관심사 추가
   */
  addInterest(interest) {
    if (!this.interests.includes(interest)) {
      this.interests.push(interest);
      this.updatedAt = new Date();
    }
  }

  /**
   * 관심사 제거
   */
  removeInterest(interest) {
    const index = this.interests.indexOf(interest);
    if (index !== -1) {
      this.interests.splice(index, 1);
      this.updatedAt = new Date();
    }
  }

  /**
   * 활동 시간 업데이트
   */
  updateActivity() {
    this.lastActiveAt = new Date();
  }

  /**
   * 프로필 업데이트
   */
  update(updates) {
    Object.keys(updates).forEach(key => {
      if (key !== 'userId' && key !== 'createdAt') {
        this[key] = updates[key];
      }
    });

    this.updatedAt = new Date();
  }

  /**
   * 시스템 프롬프트용 정보 생성
   */
  toPromptContext() {
    const context = {};

    if (this.name || this.displayName) {
      context.name = this.displayName || this.name;
    }

    if (Object.keys(this.preferences).length > 0) {
      context.preferences = { ...this.preferences };
    }

    if (this.context) {
      context.context = this.context;
    }

    if (this.interests.length > 0) {
      context.interests = [...this.interests];
    }

    context.timezone = this.timezone;
    context.language = this.language;

    // 커스텀 필드 추가
    if (Object.keys(this.customFields).length > 0) {
      context.customFields = { ...this.customFields };
    }

    return context;
  }

  /**
   * JSON 직렬화
   */
  toJSON() {
    return {
      userId: this.userId,
      name: this.name,
      displayName: this.displayName,
      email: this.email,
      timezone: this.timezone,
      language: this.language,
      preferences: this.preferences,
      context: this.context,
      interests: this.interests,
      customFields: this.customFields,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastActiveAt: this.lastActiveAt
    };
  }
}

/**
 * UserProfileManager 클래스
 */
class UserProfileManager {
  constructor() {
    this.profiles = new Map();

    // 기본 사용자 프로필 생성
    this._createDefaultProfile();
  }

  /**
   * 기본 프로필 생성
   */
  _createDefaultProfile() {
    const defaultProfile = new UserProfile({
      userId: 'default-user',
      name: null,
      timezone: 'Asia/Seoul',
      language: 'ko',
      preferences: {
        responseStyle: 'balanced',  // detailed, balanced, concise
        codeStyle: 'explanatory',   // minimal, explanatory, comprehensive
        language: 'korean'           // korean, english, mixed
      }
    });

    this.profiles.set('default-user', defaultProfile);
  }

  /**
   * 프로필 생성
   */
  createProfile(options) {
    const profile = new UserProfile(options);
    this.profiles.set(profile.userId, profile);
    return profile;
  }

  /**
   * 프로필 조회
   */
  getProfile(userId = 'default-user') {
    let profile = this.profiles.get(userId);

    // 없으면 생성
    if (!profile) {
      profile = this.createProfile({ userId });
    }

    profile.updateActivity();
    return profile;
  }

  /**
   * 프로필 업데이트
   */
  updateProfile(userId, updates) {
    const profile = this.getProfile(userId);
    profile.update(updates);
    return profile;
  }

  /**
   * 프로필 삭제
   */
  deleteProfile(userId) {
    if (userId === 'default-user') {
      throw new Error('Cannot delete default user profile');
    }

    return this.profiles.delete(userId);
  }

  /**
   * 선호도 설정
   */
  setPreference(userId, key, value) {
    const profile = this.getProfile(userId);
    profile.setPreference(key, value);
    return profile;
  }

  /**
   * 선호도 조회
   */
  getPreference(userId, key, defaultValue = null) {
    const profile = this.getProfile(userId);
    return profile.getPreference(key, defaultValue);
  }

  /**
   * 모든 프로필 조회
   */
  getAllProfiles() {
    return Array.from(this.profiles.values()).map(p => p.toJSON());
  }

  /**
   * 통계
   */
  getStats() {
    return {
      totalUsers: this.profiles.size,
      activeUsers: Array.from(this.profiles.values()).filter(
        p => Date.now() - p.lastActiveAt.getTime() < 7 * 24 * 60 * 60 * 1000
      ).length
    };
  }
}

/**
 * 전역 인스턴스
 */
let globalUserProfileManager = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getUserProfileManager() {
  if (!globalUserProfileManager) {
    globalUserProfileManager = new UserProfileManager();
  }
  return globalUserProfileManager;
}

module.exports = {
  UserProfile,
  UserProfileManager,
  getUserProfileManager
};
