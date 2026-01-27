/**
 * UserProfile Model
 * 사용자 프로필 및 설정을 MongoDB에 저장
 */

const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    default: null
  },
  displayName: {
    type: String,
    default: null
  },
  email: {
    type: String,
    default: null
  },
  timezone: {
    type: String,
    default: 'Asia/Seoul'
  },
  language: {
    type: String,
    default: 'ko'
  },
  // 사용자 선호도 (일반)
  preferences: {
    responseStyle: {
      type: String,
      default: 'balanced',
      enum: ['detailed', 'balanced', 'concise']
    },
    codeStyle: {
      type: String,
      default: 'explanatory',
      enum: ['minimal', 'explanatory', 'comprehensive']
    },
    language: {
      type: String,
      default: 'korean',
      enum: ['korean', 'english', 'mixed']
    },
    // 테마 설정
    theme: {
      skin: {
        type: String,
        default: 'default'
      },
      fontSize: {
        type: String,
        default: 'md'
      },
      glassEnabled: {
        type: Boolean,
        default: true
      },
      glassOpacity: {
        type: Number,
        default: 85
      },
      glassBlur: {
        type: Number,
        default: 20
      },
      backgroundImage: {
        type: String,
        default: null
      },
      backgroundOpacity: {
        type: Number,
        default: 30
      },
      backgroundBlur: {
        type: Number,
        default: 5
      }
    }
  },
  // 사용자 컨텍스트 (추가 정보)
  context: {
    type: String,
    default: null
  },
  // 관심사
  interests: {
    type: [String],
    default: []
  },
  // 커스텀 필드 (유연한 확장)
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

/**
 * 활동 시간 업데이트
 */
userProfileSchema.methods.updateActivity = function() {
  this.lastActiveAt = new Date();
  return this.save();
};

/**
 * 테마 설정 업데이트
 */
userProfileSchema.methods.updateTheme = function(themeUpdate) {
  if (!this.preferences) {
    this.preferences = {};
  }
  if (!this.preferences.theme) {
    this.preferences.theme = {};
  }

  Object.keys(themeUpdate).forEach(key => {
    this.preferences.theme[key] = themeUpdate[key];
  });

  this.markModified('preferences');
  return this.save();
};

/**
 * 선호도 설정
 */
userProfileSchema.methods.setPreference = function(key, value) {
  if (!this.preferences) {
    this.preferences = {};
  }
  this.preferences[key] = value;
  this.markModified('preferences');
  return this.save();
};

/**
 * 기본 사용자 프로필 생성
 */
userProfileSchema.statics.getOrCreateDefault = async function(userId = 'default') {
  let profile = await this.findOne({ userId });

  if (!profile) {
    profile = await this.create({
      userId,
      name: null,
      timezone: 'Asia/Seoul',
      language: 'ko',
      preferences: {
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
      }
    });
    console.log(`✅ 기본 사용자 프로필 생성: ${userId}`);
  }

  return profile;
};

module.exports = mongoose.model('UserProfile', userProfileSchema);
