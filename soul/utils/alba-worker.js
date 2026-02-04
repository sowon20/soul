/**
 * alba-worker.js
 * 백그라운드 작업 수행 (AIServiceFactory 기반)
 *
 * 용도:
 * - aiMemo 생성 (대화 내면 메모)
 * - 태그 자동 생성
 * - 메시지 압축 (densityLevel 1, 2)
 * - 주제 분류
 *
 * 사용 모델:
 * - DB의 digest-worker 역할에서 모델/서비스 설정을 읽어 사용
 * - UI 설정 > 알바에서 변경 가능
 */

const { AIServiceFactory } = require('./ai-service');

// 백그라운드 태스크별 고정 프롬프트
const BACKGROUND_PROMPTS = {
  tagGeneration: `메시지를 보고 검색용 태그 3-5개 생성해.
규칙:
- 한국어 명사 위주
- 감정 태그 포함 (기쁨, 피로, 걱정, 설렘 등)
- 주제 태그 포함 (코딩, 일상, 고민 등)
- JSON 배열로만 출력
예시: ["코딩", "피로", "버그"]`,

  compression: `대화를 압축해.
규칙:
- 감정, 톤, 관계 맥락 반드시 유지
- 핵심 사실만 추출하지 말고, 분위기도 포함
- 시간 맥락 유지 (새벽, 저녁 등)
- 대화체 유지
- 원문의 50% 정도 길이로`,

  weeklySummary: `일주일간 대화 요약해.
규칙:
- 주요 주제/사건 정리
- 감정 흐름
- 중요 결정사항
- 특이사항 (늦은 밤 대화, 긴 침묵 등)
- 3-5문장으로`
};

class AlbaWorker {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 500,
      temperature: config.temperature || 0.3,
      ...config
    };

    this.queue = [];
    this.isProcessing = false;
    this.initialized = false;

    // 캐시: DB에서 읽은 모델 설정
    this._serviceCache = null;
    this._serviceCacheTime = 0;
  }

  /**
   * 초기화 - DB에서 알바 역할 설정 확인
   */
  async initialize() {
    try {
      const serviceInfo = await this._getServiceInfo();
      if (serviceInfo) {
        this.initialized = true;
        console.log(`[AlbaWorker] Initialized (${serviceInfo.serviceId}/${serviceInfo.modelId})`);
      } else {
        // 서비스 설정이 없어도 초기화는 성공 (나중에 설정될 수 있음)
        this.initialized = true;
        console.warn('[AlbaWorker] No digest-worker role configured, will retry on each call');
      }
    } catch (error) {
      console.error('[AlbaWorker] Initialization error:', error.message);
      // 초기화 실패해도 true로 설정 — 호출 시 재시도
      this.initialized = true;
    }
  }

  /**
   * DB에서 알바 모델/서비스 정보 로드 (1분 캐시)
   */
  async _getServiceInfo() {
    const now = Date.now();
    if (this._serviceCache && (now - this._serviceCacheTime) < 60000) {
      return this._serviceCache;
    }

    try {
      const RoleModel = require('../models/Role');
      const role = await RoleModel.findOne({ roleId: 'digest-worker', isActive: 1 });
      if (!role) return null;

      const roleConfig = typeof role.config === 'string'
        ? JSON.parse(role.config)
        : (role.config || {});

      this._serviceCache = {
        modelId: role.preferredModel || 'openai/gpt-oss-20b:free',
        serviceId: roleConfig.serviceId || 'openrouter',
        temperature: roleConfig.temperature || this.config.temperature,
        maxTokens: roleConfig.maxTokens || this.config.maxTokens
      };
      this._serviceCacheTime = now;
      return this._serviceCache;
    } catch (e) {
      console.error('[AlbaWorker] Failed to load service info:', e.message);
      return null;
    }
  }

  /**
   * AI 서비스를 통해 LLM 호출
   */
  async _callLLM(systemPrompt, userMessage) {
    try {
      const serviceInfo = await this._getServiceInfo();
      if (!serviceInfo) {
        console.warn('[AlbaWorker] No service configured, skipping LLM call');
        return null;
      }

      const service = await AIServiceFactory.createService(serviceInfo.serviceId, serviceInfo.modelId);
      if (!service) return null;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

      const response = await service.chat(messages, {
        temperature: serviceInfo.temperature,
        maxTokens: serviceInfo.maxTokens
      });

      const text = response?.text || response?.content || (typeof response === 'string' ? response : null);
      return text || null;
    } catch (error) {
      console.error('[AlbaWorker] LLM call error:', error.message);
      return null;
    }
  }

  /**
   * _callLLM alias (memory-layers 호환)
   */
  async _callAI(systemPrompt, userMessage) {
    return this._callLLM(systemPrompt, userMessage);
  }

  /**
   * aiMemo 생성 (대화에 대한 AI 내면 메모)
   */
  async generateAiMemo(messages, context = {}) {
    const systemPrompt = `당신은 대화를 지켜보는 AI입니다.
대화 내용을 보고 짧은 내면 메모를 작성하세요.

규칙:
- 1-2문장으로 짧게
- 객관적 사실 + 주관적 느낌/해석 포함
- 시간 맥락 반영 (새벽, 오랜만, 긴 대화 등)
- 반말로 자연스럽게
- 감정, 관계, 상황 맥락 포착

예시:
- "새벽 3시에 또 깨있네. 요즘 잠을 잘 못 자나봐"
- "4시간째 코딩 얘기. 집중력 대단하다"
- "3일 만에 연락. 바빴나보네"
- "기분 좋아보임. 좋은 일 있나?"`;

    const userMessage = `최근 대화:
${messages.map(m => `[${m.role}] ${m.content}`).join('\n')}

시간 맥락: ${context.timeContext || '없음'}
대화 길이: ${messages.length}개 메시지

이 대화에 대한 짧은 내면 메모:`;

    return await this._callLLM(systemPrompt, userMessage);
  }

  /**
   * 태그 생성
   */
  async generateTags(content, context = {}) {
    const systemPrompt = `대화 내용을 보고 검색용 태그를 생성하세요.

규칙:
- 3-7개 태그
- 한국어 명사 위주
- 감정 태그 포함 (기쁨, 피로, 걱정 등)
- 주제 태그 포함 (코딩, 일상, 고민 등)
- JSON 배열로 출력

예시 출력: ["코딩", "피로", "야근", "버그", "집중"]`;

    const userMessage = `내용: ${content}

태그 (JSON 배열):`;

    const result = await this._callLLM(systemPrompt, userMessage);

    try {
      const match = result?.match(/\[.*\]/s);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      console.warn('Tag parsing failed:', e);
    }

    return [];
  }

  /**
   * 메시지 압축 (densityLevel 1: 느슨한 압축)
   */
  async compressLevel1(messages) {
    const systemPrompt = `대화를 압축하세요.

규칙:
- 감정, 톤, 관계 맥락 반드시 유지
- 핵심 사실만 추출하지 말고, 분위기도 포함
- 시간 맥락 유지 (새벽, 저녁 등)
- 대화체 유지
- 원문의 50% 정도 길이로

예시:
원문: "야 나 졸려 ㅠㅠ 오늘 진짜 힘들었어 회의 5개나 했거든"
압축: "새벽, 피곤해함. 회의 5개로 힘든 하루"`;

    const userMessage = `압축할 대화:
${messages.map(m => `[${m.role}] ${m.content}`).join('\n')}

압축 결과:`;

    return await this._callLLM(systemPrompt, userMessage);
  }

  /**
   * 메시지 압축 (densityLevel 2: 더 압축)
   */
  async compressLevel2(messages) {
    const systemPrompt = `대화를 최대한 압축하세요.

규칙:
- 핵심 키워드 + 감정 상태만
- 시간 맥락 태그로
- 대괄호 형식 사용
- 원문의 20% 정도 길이로

예시:
원문: "야 나 졸려 ㅠㅠ 오늘 진짜 힘들었어 회의 5개나 했거든"
압축: "[새벽] 피곤, 바쁜 하루 (회의 5개)"`;

    const userMessage = `압축할 대화:
${messages.map(m => `[${m.role}] ${m.content}`).join('\n')}

최대 압축:`;

    return await this._callLLM(systemPrompt, userMessage);
  }

  /**
   * 작업 큐에 추가
   */
  addToQueue(task) {
    this.queue.push(task);
    this._processQueue();
  }

  /**
   * 큐 처리 (순차 실행)
   */
  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      try {
        await task();
      } catch (error) {
        console.error('AlbaWorker task error:', error);
      }
    }

    this.isProcessing = false;
  }
}

// 싱글톤
let globalAlbaWorker = null;

async function getAlbaWorker(config = {}) {
  if (!globalAlbaWorker) {
    globalAlbaWorker = new AlbaWorker(config);
    await globalAlbaWorker.initialize();
  }
  return globalAlbaWorker;
}

function resetAlbaWorker() {
  globalAlbaWorker = null;
}

module.exports = {
  AlbaWorker,
  getAlbaWorker,
  resetAlbaWorker,
  BACKGROUND_PROMPTS
};
