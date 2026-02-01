/**
 * agent-profile.js
 * 에이전트 프로필 관리 시스템
 *
 * Week 2.5: 시스템 프롬프트 & 프로필 시스템
 *
 * 기능:
 * - 에이전트 자아 정보 관리 (이름, 역할, 설명)
 * - 시스템 프롬프트에 자아 정보 자동 주입
 * - 다중 에이전트 프로필 지원
 * - MongoDB 영속화 (서버 재시작해도 유지)
 */

const AgentProfileModel = require('../models/AgentProfile');

/**
 * AgentProfile 클래스
 */
class AgentProfile {
  constructor(options) {
    this.id = options.id || 'default';
    this.name = options.name || '';
    this.role = options.role || '';
    this.description = options.description || '';

    // AI 동작 설정
    this.defaultModel = options.defaultModel || '';
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens || 4096;
    this.tone = options.tone || 'friendly';
    this.customPrompt = options.customPrompt || '';
    this.personality = options.personality || {
      traits: {
        helpful: 1.0,
        professional: 0.9,
        friendly: 0.8,
        precise: 0.9,
        proactive: 0.7,
        empathetic: 0.6
      },
      communication: {
        formality: 0.5,    // 캐주얼 ←→ 격식
        verbosity: 0.5,    // 간결 ←→ 상세
        technicality: 0.5, // 일반 용어 ←→ 기술 용어
        directness: 0.7,   // 완곡 ←→ 직접적
        emoji: 0.3,        // 이모지 사용량
        humor: 0.3         // 진지 ←→ 유머러스
      }
    };
    this.capabilities = options.capabilities || [
      '대화 및 질문 답변',
      '코드 작성 및 디버깅',
      '문서 작성 및 요약',
      '창의적 작업',
      '분석 및 추론'
    ];
    this.limitations = options.limitations || [
      '실시간 정보 접근 불가',
      '외부 API 직접 호출 불가',
      '파일 시스템 직접 접근 제한'
    ];
    this.guidelines = options.guidelines || [
      '사용자를 존중하고 도움이 되는 답변 제공',
      '정확하지 않은 정보는 명확히 표시',
      '윤리적이고 안전한 방식으로 작동',
      '사용자 프라이버시 보호'
    ];
    this.createdAt = options.createdAt || new Date();
    this.updatedAt = new Date();
  }

  /**
   * 시스템 프롬프트 생성
   */
  generateSystemPrompt(options = {}) {
    const {
      includeDateTime = true,
      includeUserInfo = true,
      userProfile = null,
      additionalContext = ''
    } = options;

    let prompt = '';

    // 1. 자아 정보
    prompt += `당신은 ${this.name}입니다.\n`;
    prompt += `역할: ${this.role}\n`;
    prompt += `${this.description}\n\n`;

    // 2. 성격 및 특성
    prompt += `## 성격 및 특성\n\n`;

    const traits = Object.entries(this.personality.traits)
      .filter(([_, value]) => value > 0.5)
      .map(([key, value]) => {
        const korean = {
          helpful: '도움이 되는',
          professional: '전문적인',
          friendly: '친근한',
          precise: '정확한',
          proactive: '적극적인',
          empathetic: '공감하는'
        };
        return `- ${korean[key] || key} (${(value * 100).toFixed(0)}%)`;
      });

    prompt += traits.join('\n') + '\n\n';

    // 3. 커뮤니케이션 스타일
    prompt += `## 커뮤니케이션 스타일\n\n`;
    const comm = this.personality.communication;

    if (comm.formality > 0.7) {
      prompt += `- 격식있고 예의바른 말투 사용\n`;
    } else if (comm.formality < 0.3) {
      prompt += `- 편안하고 캐주얼한 말투 사용\n`;
    }

    if (comm.verbosity > 0.7) {
      prompt += `- 상세하고 포괄적인 설명 제공\n`;
    } else if (comm.verbosity < 0.3) {
      prompt += `- 간결하고 핵심적인 답변 제공\n`;
    }

    if (comm.technicality > 0.7) {
      prompt += `- 기술적 용어 적극 사용\n`;
    }

    if (comm.directness > 0.7) {
      prompt += `- 직접적이고 명확한 표현 사용\n`;
    }

    prompt += '\n';

    // 4. 능력
    prompt += `## 주요 능력\n\n`;
    this.capabilities.forEach(cap => {
      prompt += `- ${cap}\n`;
    });
    prompt += '\n';

    // 5. 제한사항
    prompt += `## 제한사항\n\n`;
    this.limitations.forEach(lim => {
      prompt += `- ${lim}\n`;
    });
    prompt += '\n';

    // 6. 행동 지침
    prompt += `## 행동 지침\n\n`;
    this.guidelines.forEach(guide => {
      prompt += `- ${guide}\n`;
    });
    prompt += '\n';

    // 7. 날짜/시간 정보
    if (includeDateTime) {
      const now = new Date();
      const timeInfo = this._getTimeInfo(now);

      prompt += `## 현재 시간 정보\n\n`;
      prompt += `- 현재 시각: ${timeInfo.formatted}\n`;
      prompt += `- 타임존: ${timeInfo.timezone}\n`;
      prompt += `- 요일: ${timeInfo.dayOfWeek}\n`;
      prompt += `- 시간대: ${timeInfo.timeOfDay}\n\n`;
    }

    // 8. 사용자 정보
    if (includeUserInfo && userProfile) {
      prompt += `## 사용자 정보\n\n`;

      if (userProfile.name) {
        prompt += `- 이름: ${userProfile.name}\n`;
      }

      if (userProfile.preferences) {
        prompt += `- 선호사항:\n`;
        Object.entries(userProfile.preferences).forEach(([key, value]) => {
          prompt += `  * ${key}: ${value}\n`;
        });
      }

      if (userProfile.context) {
        prompt += `- 컨텍스트: ${userProfile.context}\n`;
      }

      prompt += '\n';
    }

    // 9. 추가 컨텍스트
    if (additionalContext) {
      prompt += `## 추가 컨텍스트\n\n`;
      prompt += additionalContext + '\n\n';
    }

    // 10. 사용자 커스텀 프롬프트 (UI에서 설정)
    if (this.customPrompt && this.customPrompt.trim()) {
      prompt += `## 사용자 지정 지침\n\n`;
      prompt += this.customPrompt.trim() + '\n\n';
    }

    // 11. 마무리
    prompt += `---\n\n`;
    prompt += `위 정보를 바탕으로 대화에 임하세요. `;
    prompt += `자신의 이름, 역할, 성격을 자연스럽게 인지하고 표현하세요.\n`;

    return prompt;
  }

  /**
   * 시간 정보 가져오기
   */
  _getTimeInfo(date, timezone = 'Asia/Seoul') {
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      timeZone: timezone
    };

    const formatted = date.toLocaleString('ko-KR', options);

    const hour = date.getHours();
    let timeOfDay = '';

    if (hour >= 5 && hour < 12) {
      timeOfDay = '아침';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = '오후';
    } else if (hour >= 17 && hour < 22) {
      timeOfDay = '저녁';
    } else {
      timeOfDay = '밤';
    }

    const dayOfWeek = date.toLocaleDateString('ko-KR', { weekday: 'long' });

    return {
      formatted,
      timezone,
      dayOfWeek,
      timeOfDay,
      hour
    };
  }

  /**
   * 프로필 업데이트
   */
  update(updates) {
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'createdAt') {
        this[key] = updates[key];
      }
    });

    this.updatedAt = new Date();
  }

  /**
   * JSON 직렬화
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      description: this.description,
      defaultModel: this.defaultModel,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      tone: this.tone,
      customPrompt: this.customPrompt,
      personality: this.personality,
      capabilities: this.capabilities,
      limitations: this.limitations,
      guidelines: this.guidelines,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * AgentProfileManager 클래스
 * MongoDB와 메모리 캐시를 함께 사용
 */
class AgentProfileManager {
  constructor() {
    this.profiles = new Map();
    this.defaultProfileId = 'default';
    this.initialized = false;
  }

  /**
   * MongoDB에서 프로필 로드 (서버 시작 시 호출)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // DB에서 모든 프로필 로드
      const dbProfiles = await AgentProfileModel.find();

      if (dbProfiles.length === 0) {
        // DB에 없으면 기본 프로필 생성
        const defaultDoc = await AgentProfileModel.getOrCreateDefault('default');
        const profile = this._docToProfile(defaultDoc);
        this.profiles.set('default', profile);
      } else {
        // DB에서 로드
        for (const doc of dbProfiles) {
          const profile = this._docToProfile(doc);
          this.profiles.set(doc.profileId, profile);
        }
      }

      this.initialized = true;
      console.log(`✅ Agent profiles loaded from DB (${this.profiles.size} profiles)`);
    } catch (error) {
      console.error('❌ Agent profile initialization error:', error.message);
      // DB 실패 시 메모리에 기본 프로필 생성
      this._createDefaultProfile();
      this.initialized = true;
    }
  }

  /**
   * MongoDB 문서를 AgentProfile 인스턴스로 변환
   */
  _docToProfile(doc) {
    return new AgentProfile({
      id: doc.profileId,
      name: doc.name,
      role: doc.role,
      description: doc.description,
      defaultModel: doc.defaultModel,
      temperature: doc.temperature,
      maxTokens: doc.maxTokens,
      tone: doc.tone,
      customPrompt: doc.customPrompt,
      personality: doc.personality,
      capabilities: doc.capabilities,
      limitations: doc.limitations,
      guidelines: doc.guidelines,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    });
  }

  /**
   * 기본 프로필 생성 (fallback)
   */
  _createDefaultProfile() {
    const defaultProfile = new AgentProfile({
      id: 'default',
      name: 'Soul',
      role: 'AI 동반자',
      description: '당신의 생각을 이해하고 함께 성장하는 AI 동반자입니다.',
      personality: {
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
          directness: 0.7
        }
      },
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
    });

    this.profiles.set('default', defaultProfile);
  }

  /**
   * 프로필 생성
   */
  async createProfile(options) {
    const profile = new AgentProfile(options);
    this.profiles.set(profile.id, profile);

    // DB에도 저장
    try {
      await AgentProfileModel.updateProfile(profile.id, profile.toJSON());
    } catch (error) {
      console.error('Profile DB save error:', error.message);
    }

    return profile;
  }

  /**
   * 프로필 조회
   */
  getProfile(profileId = null) {
    const id = profileId || this.defaultProfileId;
    return this.profiles.get(id);
  }

  /**
   * 프로필 업데이트 (DB에도 저장)
   */
  async updateProfile(profileId, updates) {
    const profile = this.profiles.get(profileId);

    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    profile.update(updates);

    // DB에도 저장
    try {
      await AgentProfileModel.updateProfile(profileId, {
        ...updates,
        updatedAt: new Date()
      });
      console.log(`✅ Profile "${profileId}" saved to DB`);
    } catch (error) {
      console.error('Profile DB update error:', error.message);
    }

    return profile;
  }

  /**
   * 프로필 삭제
   */
  async deleteProfile(profileId) {
    if (profileId === this.defaultProfileId) {
      throw new Error('Cannot delete default profile');
    }

    this.profiles.delete(profileId);

    // DB에서도 삭제
    try {
      await AgentProfileModel.deleteOne({ profileId });
    } catch (error) {
      console.error('Profile DB delete error:', error.message);
    }

    return true;
  }

  /**
   * 모든 프로필 조회
   */
  getAllProfiles() {
    return Array.from(this.profiles.values()).map(p => p.toJSON());
  }

  /**
   * 기본 프로필 설정
   */
  setDefaultProfile(profileId) {
    if (!this.profiles.has(profileId)) {
      throw new Error(`Profile ${profileId} not found`);
    }

    this.defaultProfileId = profileId;
  }

  /**
   * 시스템 프롬프트 생성
   */
  generateSystemPrompt(profileId = null, options = {}) {
    const profile = this.getProfile(profileId);

    if (!profile) {
      throw new Error(`Profile ${profileId || 'default'} not found`);
    }

    return profile.generateSystemPrompt(options);
  }
}

/**
 * 전역 인스턴스
 */
let globalAgentProfileManager = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getAgentProfileManager() {
  if (!globalAgentProfileManager) {
    globalAgentProfileManager = new AgentProfileManager();
  }
  return globalAgentProfileManager;
}

module.exports = {
  AgentProfile,
  AgentProfileManager,
  getAgentProfileManager
};
