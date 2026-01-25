/**
 * Profile Model - Phase P 프로필 시스템
 * 사용자(소원)의 개인 정보를 저장하고 소울이 참조할 수 있는 프로필 시스템
 */

const mongoose = require('mongoose');

/**
 * 동적 필드 스키마
 * 사용자가 자유롭게 추가/수정/삭제할 수 있는 필드
 */
const customFieldSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  type: {
    type: String,
    enum: ['text', 'number', 'date', 'tag', 'list', 'url', 'select', 'textarea'],
    default: 'text'
  },
  // select 타입일 경우 선택 가능한 옵션들
  options: {
    type: [String],
    default: []
  },
  // 필드 순서
  order: {
    type: Number,
    default: 0
  },
  // 필드 표시 여부
  visible: {
    type: Boolean,
    default: true
  },
  // 메모/설명
  description: {
    type: String,
    default: ''
  }
}, { _id: false });

/**
 * 개별 필드 공개 설정 스키마
 */
const fieldVisibilitySchema = new mongoose.Schema({
  // 소울에게 공개 여부
  visibleToSoul: {
    type: Boolean,
    default: true
  },
  // 자동으로 컨텍스트에 포함할지
  autoIncludeInContext: {
    type: Boolean,
    default: true
  }
}, { _id: false });

/**
 * 권한 설정 스키마
 */
const permissionsSchema = new mongoose.Schema({
  // 소울이 읽을 수 있는 범위
  readScope: {
    type: String,
    enum: ['full', 'limited', 'minimal'],
    default: 'limited'
  },
  // 소울이 쓸 수 있는지 여부
  canWrite: {
    type: Boolean,
    default: false
  },
  // 소울이 삭제할 수 있는지 여부
  canDelete: {
    type: Boolean,
    default: false
  },
  // 자동으로 컨텍스트에 포함할지
  autoIncludeInContext: {
    type: Boolean,
    default: true
  },
  // 특정 키워드 감지 시에만 포함할지
  includeOnKeywords: {
    type: [String],
    default: []
  }
}, { _id: false });

/**
 * 프로필 메인 스키마
 */
const profileSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    default: 'sowon'
  },
  // 프로필 사진 (Base64 또는 URL)
  profileImage: {
    type: String,
    default: null
  },
  // 고정 기본 정보 (각 필드마다 공개 설정 가능)
  basicInfo: {
    // 이름
    name: {
      value: { type: String, default: '소원' },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: true, autoIncludeInContext: true }) }
    },
    // 닉네임
    nickname: {
      value: { type: String, default: null },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: true, autoIncludeInContext: true }) }
    },
    // 이메일
    email: {
      value: { type: String, default: null },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: false, autoIncludeInContext: false }) }
    },
    // 전화번호
    phone: {
      value: { type: String, default: null },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: false, autoIncludeInContext: false }) }
    },
    // 생년월일
    birthDate: {
      value: { type: Date, default: null },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: true, autoIncludeInContext: false }) }
    },
    // 성별
    gender: {
      value: { type: String, enum: [null, '남성', '여성', '기타'], default: null },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: true, autoIncludeInContext: false }) }
    },
    // 주민번호 (민감 정보 - 기본 비공개)
    idNumber: {
      value: { type: String, default: null },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: false, autoIncludeInContext: false }) }
    },
    // 국가
    country: {
      value: { type: String, default: '대한민국' },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: true, autoIncludeInContext: true }) }
    },
    // 주소
    address: {
      value: { type: String, default: null },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: false, autoIncludeInContext: false }) }
    },
    // 타임존 (시스템용)
    timezone: {
      value: { type: String, default: 'Asia/Seoul' },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: true, autoIncludeInContext: true }) }
    },
    // 언어 (시스템용)
    language: {
      value: { type: String, default: 'ko' },
      visibility: { type: fieldVisibilitySchema, default: () => ({ visibleToSoul: true, autoIncludeInContext: true }) }
    }
  },
  // 동적 커스텀 필드들
  customFields: {
    type: [customFieldSchema],
    default: []
  },
  // 권한 설정
  permissions: {
    type: permissionsSchema,
    default: () => ({
      readScope: 'limited',
      canWrite: false,
      canDelete: false,
      autoIncludeInContext: true,
      includeOnKeywords: ['개인', '나', '내', '소원', '취향', '좋아하는']
    })
  },
  // 메타데이터
  metadata: {
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    lastAccessedBy: {
      type: String,
      default: null
    },
    lastAccessedAt: {
      type: Date,
      default: null
    },
    version: {
      type: Number,
      default: 1
    }
  }
}, {
  timestamps: true
});

/**
 * 필드 추가
 */
profileSchema.methods.addField = function(fieldData) {
  const newField = {
    id: fieldData.id || `field_${Date.now()}`,
    label: fieldData.label,
    value: fieldData.value || null,
    type: fieldData.type || 'text',
    options: fieldData.options || [],
    order: fieldData.order !== undefined ? fieldData.order : this.customFields.length,
    visible: fieldData.visible !== undefined ? fieldData.visible : true,
    description: fieldData.description || ''
  };

  this.customFields.push(newField);
  this.metadata.updatedAt = new Date();
  this.metadata.version += 1;

  return this.save();
};

/**
 * 필드 수정
 */
profileSchema.methods.updateField = function(fieldId, updates) {
  const fieldIndex = this.customFields.findIndex(f => f.id === fieldId);

  if (fieldIndex === -1) {
    throw new Error(`Field with id ${fieldId} not found`);
  }

  Object.keys(updates).forEach(key => {
    this.customFields[fieldIndex][key] = updates[key];
  });

  this.metadata.updatedAt = new Date();
  this.metadata.version += 1;
  this.markModified('customFields');

  return this.save();
};

/**
 * 필드 삭제
 */
profileSchema.methods.deleteField = function(fieldId) {
  const fieldIndex = this.customFields.findIndex(f => f.id === fieldId);

  if (fieldIndex === -1) {
    throw new Error(`Field with id ${fieldId} not found`);
  }

  this.customFields.splice(fieldIndex, 1);
  this.metadata.updatedAt = new Date();
  this.metadata.version += 1;

  return this.save();
};

/**
 * 필드 순서 변경
 */
profileSchema.methods.reorderFields = function(fieldOrders) {
  // fieldOrders: [{ id: 'field1', order: 0 }, { id: 'field2', order: 1 }, ...]
  fieldOrders.forEach(({ id, order }) => {
    const field = this.customFields.find(f => f.id === id);
    if (field) {
      field.order = order;
    }
  });

  // order로 정렬
  this.customFields.sort((a, b) => a.order - b.order);

  this.metadata.updatedAt = new Date();
  this.markModified('customFields');

  return this.save();
};

/**
 * 권한 업데이트
 */
profileSchema.methods.updatePermissions = function(permissionUpdates) {
  Object.keys(permissionUpdates).forEach(key => {
    this.permissions[key] = permissionUpdates[key];
  });

  this.metadata.updatedAt = new Date();
  this.markModified('permissions');

  return this.save();
};

/**
 * 액세스 기록
 */
profileSchema.methods.recordAccess = function(accessor) {
  this.metadata.lastAccessedBy = accessor;
  this.metadata.lastAccessedAt = new Date();

  return this.save();
};

/**
 * 프로필 요약 생성 (소울에게 전달할 컨텍스트)
 */
profileSchema.methods.generateSummary = function(scope = 'limited') {
  const summary = {
    basicInfo: {},
    customFields: []
  };

  // 기본 정보
  if (scope === 'full' || scope === 'limited') {
    summary.basicInfo = {
      name: this.basicInfo.name,
      nickname: this.basicInfo.nickname,
      location: this.basicInfo.location,
      timezone: this.basicInfo.timezone,
      language: this.basicInfo.language
    };

    if (scope === 'full') {
      summary.basicInfo.birthDate = this.basicInfo.birthDate;
    }
  } else if (scope === 'minimal') {
    summary.basicInfo = {
      name: this.basicInfo.name,
      timezone: this.basicInfo.timezone,
      language: this.basicInfo.language
    };
  }

  // 커스텀 필드
  const visibleFields = this.customFields
    .filter(f => f.visible)
    .sort((a, b) => a.order - b.order);

  if (scope === 'full') {
    summary.customFields = visibleFields.map(f => ({
      label: f.label,
      value: f.value,
      type: f.type
    }));
  } else if (scope === 'limited') {
    // 중요한 필드만 (처음 5개)
    summary.customFields = visibleFields.slice(0, 5).map(f => ({
      label: f.label,
      value: f.value
    }));
  }
  // minimal일 경우 커스텀 필드 제외

  return summary;
};

/**
 * 키워드로 관련 필드 찾기
 */
profileSchema.methods.findFieldsByKeywords = function(keywords) {
  const matchedFields = [];

  keywords.forEach(keyword => {
    this.customFields.forEach(field => {
      if (field.visible &&
          (field.label.includes(keyword) ||
           (field.value && String(field.value).includes(keyword)) ||
           field.description.includes(keyword))) {
        if (!matchedFields.find(f => f.id === field.id)) {
          matchedFields.push({
            label: field.label,
            value: field.value,
            type: field.type
          });
        }
      }
    });
  });

  return matchedFields;
};

/**
 * 기본 프로필 생성 또는 가져오기
 */
profileSchema.statics.getOrCreateDefault = async function(userId = 'sowon') {
  let profile = await this.findOne({ userId });

  if (!profile) {
    profile = await this.create({
      userId,
      basicInfo: {
        name: {
          value: '소원',
          visibility: { visibleToSoul: true, autoIncludeInContext: true }
        },
        country: {
          value: '대한민국',
          visibility: { visibleToSoul: true, autoIncludeInContext: true }
        },
        timezone: {
          value: 'Asia/Seoul',
          visibility: { visibleToSoul: true, autoIncludeInContext: true }
        },
        language: {
          value: 'ko',
          visibility: { visibleToSoul: true, autoIncludeInContext: true }
        }
      },
      customFields: [],
      permissions: {
        readScope: 'limited',
        canWrite: false,
        canDelete: false,
        autoIncludeInContext: true,
        includeOnKeywords: ['개인', '나', '내', '소원', '취향', '좋아하는']
      }
    });
    console.log(`✅ 기본 프로필 생성: ${userId}`);
  }

  return profile;
};

module.exports = mongoose.model('Profile', profileSchema);
