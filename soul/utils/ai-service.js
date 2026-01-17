const Anthropic = require('@anthropic-ai/sdk');

/**
 * AI 서비스 추상 클래스
 * 각 AI 제공사별 구현체가 이를 상속받음
 */
class AIService {
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.config = config;
  }

  /**
   * 대화 내용 분석
   * @param {Array} messages - 분석할 메시지 배열
   * @returns {Promise<Object>} { topics, tags, category, importance }
   */
  async analyzeConversation(messages) {
    throw new Error('analyzeConversation must be implemented');
  }

  /**
   * 서비스 연결 테스트
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    throw new Error('testConnection must be implemented');
  }
}

/**
 * Anthropic Claude AI 서비스
 */
class AnthropicService extends AIService {
  constructor(apiKey, modelName = 'claude-3-haiku-20240307') {
    super(apiKey);
    this.client = new Anthropic({ apiKey });
    this.modelName = modelName;
  }

  async analyzeConversation(messages) {
    const conversationText = messages
      .map(msg => `${msg.sender}: ${msg.text}`)
      .join('\n');

    const prompt = `다음 대화를 분석해서 JSON 형식으로 결과를 반환해줘:

대화 내용:
${conversationText}

다음 형식으로 응답해줘:
{
  "topics": ["주제1", "주제2", "주제3"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "category": "카테고리명",
  "importance": 5
}

규칙:
- topics: 대화의 핵심 주제 3개 (간결하게)
- tags: 검색에 유용한 태그 5-10개
- category: 개발, 일상, 업무, 학습, 기타 중 하나
- importance: 1-10 사이의 중요도 점수

JSON만 응답하고 다른 설명은 하지 마.`;

    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const result = JSON.parse(response.content[0].text);
    return result;
  }

  async testConnection() {
    try {
      await this.client.messages.create({
        model: this.modelName,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }]
      });
      return true;
    } catch (error) {
      console.error('Anthropic connection test failed:', error);
      return false;
    }
  }
}

/**
 * OpenAI GPT 서비스
 */
class OpenAIService extends AIService {
  constructor(apiKey, modelName = 'gpt-4o-mini') {
    super(apiKey);
    this.modelName = modelName;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async analyzeConversation(messages) {
    const conversationText = messages
      .map(msg => `${msg.sender}: ${msg.text}`)
      .join('\n');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [{
          role: 'user',
          content: `다음 대화를 분석해서 JSON 형식으로 결과를 반환해줘:

대화 내용:
${conversationText}

다음 형식으로 응답해줘:
{
  "topics": ["주제1", "주제2", "주제3"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "category": "카테고리명",
  "importance": 5
}

규칙:
- topics: 대화의 핵심 주제 3개 (간결하게)
- tags: 검색에 유용한 태그 5-10개
- category: 개발, 일상, 업무, 학습, 기타 중 하나
- importance: 1-10 사이의 중요도 점수

JSON만 응답하고 다른 설명은 하지 마.`
        }],
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return result;
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return response.ok;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }
}

/**
 * Google Gemini 서비스
 */
class GoogleService extends AIService {
  constructor(apiKey, modelName = 'gemini-2.0-flash-exp') {
    super(apiKey);
    this.modelName = modelName;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async analyzeConversation(messages) {
    const conversationText = messages
      .map(msg => `${msg.sender}: ${msg.text}`)
      .join('\n');

    const response = await fetch(
      `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `다음 대화를 분석해서 JSON 형식으로 결과를 반환해줘:

대화 내용:
${conversationText}

다음 형식으로 응답해줘:
{
  "topics": ["주제1", "주제2", "주제3"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "category": "카테고리명",
  "importance": 5
}

규칙:
- topics: 대화의 핵심 주제 3개 (간결하게)
- tags: 검색에 유용한 태그 5-10개
- category: 개발, 일상, 업무, 학습, 기타 중 하나
- importance: 1-10 사이의 중요도 점수

JSON만 응답하고 다른 설명은 하지 마.`
            }]
          }]
        })
      }
    );

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    const result = JSON.parse(text);
    return result;
  }

  async testConnection() {
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'test' }] }]
          })
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Google connection test failed:', error);
      return false;
    }
  }
}

/**
 * Ollama 로컬 모델 서비스
 */
class OllamaService extends AIService {
  constructor(baseUrl = 'http://localhost:11434', modelName = 'llama3.2') {
    super(null, { baseUrl });
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  async analyzeConversation(messages) {
    const conversationText = messages
      .map(msg => `${msg.sender}: ${msg.text}`)
      .join('\n');

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        prompt: `다음 대화를 분석해서 JSON 형식으로 결과를 반환해줘:

대화 내용:
${conversationText}

다음 형식으로 응답해줘:
{
  "topics": ["주제1", "주제2", "주제3"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "category": "카테고리명",
  "importance": 5
}

규칙:
- topics: 대화의 핵심 주제 3개 (간결하게)
- tags: 검색에 유용한 태그 5-10개
- category: 개발, 일상, 업무, 학습, 기타 중 하나
- importance: 1-10 사이의 중요도 점수

JSON만 응답하고 다른 설명은 하지 마.`,
        stream: false,
        format: 'json'
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.response);
    return result;
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      console.error('Ollama connection test failed:', error);
      return false;
    }
  }
}

/**
 * AI 서비스 팩토리
 * 환경변수 기반으로 적절한 AI 서비스 인스턴스 생성
 */
class AIServiceFactory {
  static createService(serviceName = null, modelName = null) {
    const service = serviceName || process.env.DEFAULT_AI_SERVICE || 'anthropic';
    const model = modelName || process.env.DEFAULT_AI_MODEL;

    switch (service.toLowerCase()) {
      case 'anthropic':
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }
        return new AnthropicService(
          process.env.ANTHROPIC_API_KEY,
          model || 'claude-3-haiku-20240307'
        );

      case 'openai':
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY not configured');
        }
        return new OpenAIService(
          process.env.OPENAI_API_KEY,
          model || 'gpt-4o-mini'
        );

      case 'google':
        if (!process.env.GOOGLE_API_KEY) {
          throw new Error('GOOGLE_API_KEY not configured');
        }
        return new GoogleService(
          process.env.GOOGLE_API_KEY,
          model || 'gemini-2.0-flash-exp'
        );

      case 'ollama':
        return new OllamaService(
          process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          model || 'llama3.2'
        );

      default:
        throw new Error(`Unknown AI service: ${service}`);
    }
  }

  static getAvailableServices() {
    const services = [];

    if (process.env.ANTHROPIC_API_KEY) {
      services.push({
        name: 'anthropic',
        models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
      });
    }

    if (process.env.OPENAI_API_KEY) {
      services.push({
        name: 'openai',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
      });
    }

    if (process.env.GOOGLE_API_KEY) {
      services.push({
        name: 'google',
        models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']
      });
    }

    // Ollama는 항상 사용 가능하다고 가정 (로컬)
    services.push({
      name: 'ollama',
      models: ['llama3.2', 'llama3.1', 'mistral', 'codellama']
    });

    return services;
  }
}

module.exports = {
  AIService,
  AnthropicService,
  OpenAIService,
  GoogleService,
  OllamaService,
  AIServiceFactory
};
