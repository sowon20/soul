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
   * 대화 메시지 생성 (핵심 메서드)
   * @param {Array} messages - 메시지 배열 [{ role: 'user'|'assistant', content: '...' }]
   * @param {Object} options - { systemPrompt, maxTokens, temperature, stream }
   * @returns {Promise<string>} AI 응답 텍스트
   */
  async chat(messages, options = {}) {
    throw new Error('chat must be implemented');
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
    
    // MCP 서버 이름 매핑
    this.mcpServerNames = {
      'ssh-commander': '터미널',
      'google-home': '스마트홈',
      'todo': 'Todo',
      'varampet': '바램펫',
      'calendar': '캘린더',
      'search': '검색'
    };
  }

  /**
   * 도구 이름을 읽기 좋게 변환
   * mcp_1234567890__execute -> 터미널 > execute
   */
  formatToolName(name) {
    // MCP 도구: mcp_{timestamp}__{server}__{tool} 형식
    const mcpMatch = name.match(/^mcp_\d+__(.+?)__(.+)$/);
    if (mcpMatch) {
      const [, serverKey, toolName] = mcpMatch;
      const serverName = this.mcpServerNames[serverKey] || serverKey;
      return `${serverName} > ${toolName}`;
    }
    
    // 일반 MCP: mcp_{timestamp}__{tool} 형식
    const simpleMatch = name.match(/^mcp_\d+__(.+)$/);
    if (simpleMatch) {
      return simpleMatch[1];
    }
    
    return name;
  }

  /**
   * 도구 입력을 간결하게 변환
   */
  formatToolInput(input) {
    if (!input) return '';
    
    // 명령어가 있으면 그것만
    if (input.command) return input.command;
    if (input.query) return input.query;
    if (input.host && input.command) return `${input.host}: ${input.command}`;
    
    // 간단한 객체면 값들만
    const values = Object.values(input).filter(v => typeof v === 'string' || typeof v === 'number');
    if (values.length <= 2) return values.join(', ');
    
    return JSON.stringify(input);
  }

  async chat(messages, options = {}) {
    const {
      systemPrompt = null,
      maxTokens = 4096,
      temperature = 1.0,
      tools = null,
      toolExecutor = null, // 도구 실행 함수
      thinking = false, // extended thinking 활성화
    } = options;

    const apiMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const params = {
      model: this.modelName,
      max_tokens: maxTokens,
      messages: apiMessages,
    };

    // extended thinking 설정 (활성화 시 temperature 사용 불가)
    // 지원하지 않는 모델은 API에서 무시되거나 에러 발생 가능 - UI에서 안내
    if (thinking) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(10000, Math.floor(maxTokens * 0.6)) // 최대 토큰의 60%를 thinking에 할당
      };
      console.log(`[Anthropic] Extended thinking enabled with budget: ${params.thinking.budget_tokens}`);
    } else {
      params.temperature = temperature;
    }

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    let response = await this.client.messages.create(params);

    // 도구 사용 정보 수집
    const toolUsageInfo = [];

    // 도구 호출 루프 처리
    while (response.stop_reason === 'tool_use' && toolExecutor) {
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

      // 도구 실행 결과 수집
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        console.log(`[Tool] Executing: ${toolUse.name}`, toolUse.input);
        const result = await toolExecutor(toolUse.name, toolUse.input);
        
        // 도구 사용 정보 저장
        toolUsageInfo.push({
          name: toolUse.name,
          input: toolUse.input,
          result: typeof result === 'string' ? result : JSON.stringify(result)
        });
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        });
      }

      // 메시지에 assistant 응답과 tool_result 추가
      apiMessages.push({
        role: 'assistant',
        content: response.content
      });
      apiMessages.push({
        role: 'user',
        content: toolResults
      });

      // 다시 API 호출
      params.messages = apiMessages;
      response = await this.client.messages.create(params);
    }

    // 최종 응답 추출 (thinking + tool_use + text)
    const thinkingBlock = response.content.find(block => block.type === 'thinking');
    const textBlock = response.content.find(block => block.type === 'text');

    const textContent = textBlock ? textBlock.text : '';
    
    // 응답 조립
    let finalResponse = '';
    
    // thinking이 있으면 추가
    if (thinkingBlock) {
      console.log(`[Anthropic] Thinking content length: ${thinkingBlock.thinking.length}`);
      finalResponse += `<thinking>${thinkingBlock.thinking}</thinking>\n\n`;
    }
    
    // 도구 사용 정보가 있으면 추가
    if (toolUsageInfo.length > 0) {
      const toolSummary = toolUsageInfo.map(t => {
        // 도구 이름 파싱: mcp_1234567890__execute -> execute (ssh-commander)
        const friendlyName = this.formatToolName(t.name);
        const inputStr = this.formatToolInput(t.input);
        const resultStr = t.result ? t.result.substring(0, 200) : '';
        return `${friendlyName}|${inputStr}|${resultStr}`;
      }).join('\n');
      finalResponse += `<tool_use>${toolSummary}</tool_use>\n\n`;
    }
    
    finalResponse += textContent;
    
    return finalResponse;
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

  async chat(messages, options = {}) {
    const {
      systemPrompt = null,
      maxTokens = 4096,
      temperature = 1.0,
    } = options;

    const apiMessages = [...messages];
    if (systemPrompt) {
      apiMessages.unshift({
        role: 'system',
        content: systemPrompt
      });
    }

    const requestBody = {
      model: this.modelName,
      messages: apiMessages,
    };

    // o1 모델은 max_completion_tokens 사용, 일반 모델은 max_tokens
    const isO1Model = this.modelName.includes('o1');
    if (isO1Model) {
      requestBody.max_completion_tokens = maxTokens;
      // o1 모델은 temperature 지원 안함
    } else {
      requestBody.max_tokens = maxTokens;
      requestBody.temperature = temperature;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    // 에러 응답 처리
    if (data.error) {
      throw new Error(data.error.message || 'OpenAI API error');
    }

    // 정상 응답 확인
    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from OpenAI API');
    }

    return data.choices[0].message.content;
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

  async chat(messages, options = {}) {
    const {
      systemPrompt = null,
      maxTokens = 4096,
      temperature = 1.0,
    } = options;

    // Gemini는 contents 배열로 메시지 전달
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const generationConfig = {
      maxOutputTokens: maxTokens,
    };

    // Gemini Thinking 모델은 temperature 지원 안함
    const isThinkingModel = this.modelName.includes('thinking');
    if (!isThinkingModel) {
      generationConfig.temperature = temperature;
    }

    const requestBody = {
      contents,
      generationConfig
    };

    if (systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    const response = await fetch(
      `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();

    // 에러 응답 처리
    if (data.error) {
      throw new Error(data.error.message || 'Google API error');
    }

    // 정상 응답 확인
    if (!data.candidates || !data.candidates[0]) {
      throw new Error('Invalid response from Google API');
    }

    return data.candidates[0].content.parts[0].text;
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
 * xAI 서비스 (Grok)
 */
class XAIService extends AIService {
  constructor(apiKey, modelName = 'grok-4-1-fast-non-reasoning') {
    super(apiKey);
    this.modelName = modelName;
    this.baseUrl = 'https://api.x.ai/v1';
  }

  async chat(messages, options = {}) {
    const {
      systemPrompt = null,
      maxTokens = 4096,
      temperature = 1.0,
    } = options;

    const apiMessages = [...messages];
    if (systemPrompt) {
      apiMessages.unshift({
        role: 'system',
        content: systemPrompt
      });
    }

    const requestBody = {
      model: this.modelName,
      messages: apiMessages,
      max_tokens: maxTokens,
    };

    // reasoning 모델은 temperature 지원 안할 수 있음
    const isReasoningModel = this.modelName.includes('reasoning') || this.modelName.includes('r1');
    if (!isReasoningModel) {
      requestBody.temperature = temperature;
    }

    console.log('[XAI] Request URL:', `${this.baseUrl}/chat/completions`);
    console.log('[XAI] Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[XAI] Response status:', response.status);
    console.log('[XAI] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[XAI] Error response:', errorText);
      throw new Error(`xAI API error (${response.status}): ${errorText || 'Unknown error'}`);
    }

    const responseText = await response.text();
    console.log('[XAI] Response text:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[XAI] JSON parse error:', parseError);
      throw new Error(`Failed to parse xAI response: ${responseText.substring(0, 200)}`);
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[XAI] Invalid data structure:', data);
      throw new Error('Invalid response from xAI API');
    }

    return data.choices[0].message.content;
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
        messages: [
          { role: 'user', content: `다음 대화를 분석해서 JSON 형식으로 결과를 반환해줘:\n\n${conversationText}\n\n형식: { topics: [], tags: [], category: "", importance: 1-10 }` }
        ]
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return result;
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

  async chat(messages, options = {}) {
    const {
      systemPrompt = null,
      maxTokens = 4096,
      temperature = 1.0,
    } = options;

    // Ollama는 /api/chat 엔드포인트 사용
    const requestBody = {
      model: this.modelName,
      messages: systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature
      }
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    return data.message.content;
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
 * MongoDB에서 암호화된 API 키 로드 (Fallback: process.env)
 */
class AIServiceFactory {
  static _cache = {}; // 서비스 인스턴스 캐시

  /**
   * API 키 조회 (UI 설정 전용 - .env 사용 안 함)
   */
  static async getApiKey(service) {
    // 1. AIService 모델에서 조회 (UI에서 설정한 키)
    try {
      const AIServiceModel = require('../models/AIService');
      const serviceDoc = await AIServiceModel.findOne({ serviceId: service }).select('+apiKey');
      if (serviceDoc && serviceDoc.apiKey) {
        console.log(`[APIKey] Loaded ${service} key from UI settings`);
        return serviceDoc.apiKey;
      }
    } catch (error) {
      console.warn(`[APIKey] Failed to load from AIService model for ${service}:`, error.message);
    }

    // 2. APIKey 모델에서 조회 (레거시 지원)
    try {
      const APIKey = require('../models/APIKey');
      const key = await APIKey.getKey(service);
      if (key) {
        console.log(`[APIKey] Loaded ${service} key from APIKey model (legacy)`);
        return key;
      }
    } catch (error) {
      // APIKey 모델이 없을 수 있음 - 무시
    }

    // .env는 사용하지 않음 - UI에서 API 키 설정 필요
    console.warn(`[APIKey] No API key found for ${service}. Please set it in AI Settings UI.`);
    return null;
  }

  static async createService(serviceName = null, modelName = null) {
    const service = serviceName || process.env.DEFAULT_AI_SERVICE || 'anthropic';
    const model = modelName || process.env.DEFAULT_AI_MODEL;

    // 캐시 키
    const cacheKey = `${service}-${model}`;

    // 캐시가 있으면 재사용 (API 키 변경 시 _cache가 초기화됨)
    if (this._cache[cacheKey]) {
      return this._cache[cacheKey];
    }

    let serviceInstance;

    switch (service.toLowerCase()) {
      case 'anthropic': {
        const apiKey = await this.getApiKey('anthropic');
        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY not configured. Please save it in Settings.');
        }
        serviceInstance = new AnthropicService(
          apiKey,
          model || 'claude-3-haiku-20240307'
        );
        break;
      }

      case 'openai': {
        const apiKey = await this.getApiKey('openai');
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY not configured. Please save it in Settings.');
        }
        serviceInstance = new OpenAIService(
          apiKey,
          model || 'gpt-4o-mini'
        );
        break;
      }

      case 'google': {
        const apiKey = await this.getApiKey('google');
        if (!apiKey) {
          throw new Error('GOOGLE_API_KEY not configured. Please save it in Settings.');
        }
        serviceInstance = new GoogleService(
          apiKey,
          model || 'gemini-2.0-flash-exp'
        );
        break;
      }

      case 'xai': {
        const apiKey = await this.getApiKey('xai');
        if (!apiKey) {
          throw new Error('XAI_API_KEY not configured. Please save it in Settings.');
        }
        serviceInstance = new XAIService(
          apiKey,
          model || 'grok-4-1-fast-non-reasoning'
        );
        break;
      }

      case 'ollama':
        serviceInstance = new OllamaService(
          process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          model || 'llama3.2'
        );
        break;

      default:
        throw new Error(`Unknown AI service: ${service}`);
    }

    // 캐시 저장
    this._cache[cacheKey] = serviceInstance;
    return serviceInstance;
  }

  /**
   * API 키 검증 (모델 목록 API로 테스트 - 비용 0, 빠름)
   */
  static async validateApiKey(service, apiKey) {
    try {
      switch (service.toLowerCase()) {
        case 'anthropic':
          // Anthropic Models API 호출
          const anthropicResponse = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            }
          });

          if (!anthropicResponse.ok) {
            const errorData = await anthropicResponse.json();
            throw new Error(errorData.error?.message || 'Anthropic API 인증 실패');
          }

          return { valid: true, message: 'API 키가 유효합니다' };

        case 'openai':
          // OpenAI Models API 호출
          const openaiResponse = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });

          if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json();
            throw new Error(errorData.error?.message || 'OpenAI API 인증 실패');
          }

          return { valid: true, message: 'API 키가 유효합니다' };

        case 'google':
          // Google Models API 호출
          const googleResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          );

          if (!googleResponse.ok) {
            const errorData = await googleResponse.json();
            throw new Error(errorData.error?.message || 'Google API 인증 실패');
          }

          return { valid: true, message: 'API 키가 유효합니다' };

        case 'xai':
          // xAI Models API 호출
          const xaiResponse = await fetch('https://api.x.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });

          if (!xaiResponse.ok) {
            const errorData = await xaiResponse.json();
            throw new Error(errorData.error?.message || 'xAI API 인증 실패');
          }

          return { valid: true, message: 'API 키가 유효합니다' };

        case 'ollama':
          // Ollama는 API 키가 필요 없음
          return { valid: true, message: 'Ollama는 API 키가 필요하지 않습니다' };

        default:
          return { valid: false, message: '지원하지 않는 서비스입니다' };
      }
    } catch (error) {
      console.error(`API key validation failed for ${service}:`, error);
      return {
        valid: false,
        message: `API 키가 유효하지 않습니다: ${error.message}`
      };
    }
  }

  /**
   * 모델 목록 가져오기 (제공사별)
   */
  static async getAvailableModels(service, apiKey) {
    try {
      switch (service.toLowerCase()) {
        case 'anthropic':
          // Anthropic Models API 호출
          const anthropicResponse = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            }
          });

          if (!anthropicResponse.ok) {
            const errorText = await anthropicResponse.text();
            let errorMessage = 'Anthropic API 호출 실패';
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.error?.message) {
                errorMessage = `Anthropic API 오류: ${errorData.error.message}`;
              }
            } catch (e) {}

            return {
              success: false,
              error: errorMessage,
              models: []
            };
          }

          const anthropicData = await anthropicResponse.json();
          const anthropicModels = anthropicData.data.map(m => ({
            id: m.id,
            name: m.display_name || m.id,
            description: new Date(m.created_at).toLocaleDateString()
          }));
          return { success: true, models: anthropicModels };

        case 'openai':
          const openaiResponse = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });

          if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            let errorMessage = 'OpenAI API 호출 실패';
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.error?.message) {
                errorMessage = `OpenAI API 오류: ${errorData.error.message}`;
              }
            } catch (e) {}

            return {
              success: false,
              error: errorMessage,
              models: []
            };
          }

          const openaiData = await openaiResponse.json();
          const openaiModels = openaiData.data
            .filter(m => m.id.includes('gpt'))
            .map(m => ({
              id: m.id,
              name: m.id,
              description: m.id.includes('4o') ? '최신 모델' : ''
            }));
          return { success: true, models: openaiModels };

        case 'google':
          const googleResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          );

          console.log('[Google] API Response Status:', googleResponse.status);

          if (!googleResponse.ok) {
            const errorText = await googleResponse.text();
            console.log('[Google] API Error:', errorText.substring(0, 200));

            let errorMessage = 'Google API 호출 실패';
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.error?.message) {
                if (errorData.error.message.includes('suspended')) {
                  errorMessage = 'Google API 키가 정지되었습니다. API 키를 확인하세요.';
                } else if (errorData.error.code === 403) {
                  errorMessage = `Google API 권한 오류: ${errorData.error.message}`;
                } else if (errorData.error.code === 401) {
                  errorMessage = 'Google API 키가 유효하지 않습니다.';
                } else {
                  errorMessage = errorData.error.message;
                }
              }
            } catch (e) {
              // JSON 파싱 실패 시 기본 메시지 사용
            }

            return {
              success: false,
              error: errorMessage,
              models: []
            };
          }

          const googleData = await googleResponse.json();
          console.log('[Google] Total models received:', googleData.models?.length);

          const googleModels = googleData.models
            .filter(m => {
              // 'generateContent' 메서드를 지원하고 gemini를 포함하는 모델만 필터링
              const hasGenerateContent = m.supportedGenerationMethods &&
                                        m.supportedGenerationMethods.includes('generateContent');
              const isGemini = m.name.includes('gemini');
              return isGemini && hasGenerateContent;
            })
            .map(m => ({
              id: m.name.replace('models/', ''),
              name: m.displayName || m.name,
              description: m.description ? m.description.substring(0, 100) : ''
            }));

          console.log('[Google] Filtered models:', googleModels.length);
          return { success: true, models: googleModels };

        case 'xai':
          // xAI 모델 목록 API 호출
          const xaiResponse = await fetch('https://api.x.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });

          if (!xaiResponse.ok) {
            const errorText = await xaiResponse.text();
            let errorMessage = 'xAI API 호출 실패';
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.error?.message) {
                errorMessage = `xAI API 오류: ${errorData.error.message}`;
              }
            } catch (e) {}

            return {
              success: false,
              error: errorMessage,
              models: []
            };
          }

          const xaiData = await xaiResponse.json();
          const xaiModels = xaiData.data
            .filter(m => m.id.includes('grok'))
            .map(m => ({
              id: m.id,
              name: m.id,
              description: `Created: ${new Date(m.created * 1000).toLocaleDateString()}`
            }));
          return { success: true, models: xaiModels };

        case 'ollama':
          const ollamaResponse = await fetch('http://localhost:11434/api/tags');

          if (!ollamaResponse.ok) {
            return {
              success: false,
              error: 'Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.',
              models: []
            };
          }

          const ollamaData = await ollamaResponse.json();
          const ollamaModels = ollamaData.models.map(m => ({
            id: m.name,
            name: m.name,
            description: `Size: ${(m.size / 1e9).toFixed(2)}GB`
          }));
          return { success: true, models: ollamaModels };

        default:
          return { success: false, error: '지원하지 않는 서비스입니다', models: [] };
      }
    } catch (error) {
      console.error(`Failed to fetch models for ${service}:`, error);
      return {
        success: false,
        error: `모델 목록을 가져오는 중 오류 발생: ${error.message}`,
        models: []
      };
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
  XAIService,
  OllamaService,
  AIServiceFactory
};
