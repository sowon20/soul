/**
 * alba-worker.js
 * 저렴한 AI 호출로 백그라운드 작업 수행
 * 
 * 용도:
 * - aiMemo 생성 (대화 내면 메모)
 * - 태그 자동 생성
 * - 메시지 압축 (densityLevel 1, 2)
 * - 주제 분류
 */

const Anthropic = require('@anthropic-ai/sdk');

// 백그라운드 태스크별 고정 프롬프트
const BACKGROUND_PROMPTS = {
  tagGeneration: `메시지를 보고 검색용 태그 3-5개 생성해.
규칙:
- 한국어 명사 위주
- 감정 태그 포함 (기쁨, 피로, 걱정, 설렘 등)
- 주제 태그 포함 (코딩, 일상, 고민 등)
- JSON 배열로만 출력
예시: ["코딩", "피로", "버그"]`,

  memoGeneration: `대화를 보고 짧은 내면 메모 작성해.
규칙:
- 1-2문장으로 짧게
- 객관적 사실 + 주관적 느낌/해석 포함
- 시간 맥락 반영 (새벽, 오랜만, 긴 대화 등)
- 반말로 자연스럽게
예시: "새벽 3시에 또 깨있네. 요즘 잠을 잘 못 자나봐"`,

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
      model: config.model || 'claude-3-haiku-20240307', // 저렴한 모델
      maxTokens: config.maxTokens || 500,
      temperature: config.temperature || 0.3,
      ...config
    };
    
    this.client = null;
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * 초기화
   */
  async initialize() {
    try {
      // API 키 확인 - DB에서 가져옴 (AIServiceFactory와 동일 방식)
      const { AIServiceFactory } = require('./ai-service');
      const apiKey = await AIServiceFactory.getApiKey('anthropic');
      
      if (!apiKey) {
        console.warn('AlbaWorker: Anthropic API key not found in DB, will skip AI tasks');
        return;
      }
      
      this.client = new Anthropic({ apiKey });
      console.log('AlbaWorker initialized with model:', this.config.model);
    } catch (error) {
      console.error('AlbaWorker initialization error:', error);
    }
  }

  /**
   * AI 호출 (기본)
   */
  async _callAI(systemPrompt, userMessage) {
    if (!this.client) {
      console.warn('AlbaWorker: No API client, skipping AI call');
      return null;
    }

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      });

      return response.content[0]?.text || null;
    } catch (error) {
      console.error('AlbaWorker AI call error:', error);
      return null;
    }
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

    return await this._callAI(systemPrompt, userMessage);
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

    const result = await this._callAI(systemPrompt, userMessage);
    
    try {
      // JSON 파싱 시도
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

    return await this._callAI(systemPrompt, userMessage);
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

    return await this._callAI(systemPrompt, userMessage);
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
