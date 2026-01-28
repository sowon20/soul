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
   * 서비스별 지원 기능 (서브클래스에서 오버라이드)
   * Claude 전용 기능들이 다른 서비스에 전달되면 무시됨
   */
  static get supportedFeatures() {
    return {
      documents: false,      // Citations용 문서
      searchResults: false,  // RAG 검색 결과
      outputFormat: false,   // Structured Outputs
      strictTools: false,    // 도구 입력 검증
      thinking: false,       // Extended Thinking
      prefill: false,        // 응답 시작 미리 채움
      enableCache: false,    // 프롬프트 캐싱
      effort: false,         // 노력 수준 조절
      toolExamples: false,   // 도구별 input_examples
      fineGrainedToolStreaming: false, // 세밀한 도구 스트리밍
      enableToolSearch: false, // Tool Search Tool
    };
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
  /**
   * Claude 지원 기능 (모두 지원)
   */
  static get supportedFeatures() {
    return {
      documents: true,       // Citations
      searchResults: true,   // RAG 검색 결과
      outputFormat: true,    // Structured Outputs (beta)
      strictTools: true,     // 도구 입력 검증 (beta)
      thinking: true,        // Extended Thinking
      prefill: true,         // 응답 시작 미리 채움
      enableCache: true,     // 프롬프트 캐싱 (90% 비용 절감)
      effort: true,          // 노력 수준 조절 (Opus 4.5 전용)
      toolExamples: true,    // 도구별 input_examples (beta)
      fineGrainedToolStreaming: true, // 세밀한 도구 스트리밍 (beta)
      enableToolSearch: true, // Tool Search Tool (beta)
    };
  }

  constructor(apiKey, modelName = 'claude-haiku-4-5-20251001') {
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
    console.log(`[formatToolName] Raw name: ${name}`);
    
    // MCP 도구: mcp_{timestamp}__{server}__{tool} 형식
    const mcpMatch = name.match(/^mcp_\d+__(.+?)__(.+)$/);
    if (mcpMatch) {
      const [, serverKey, toolName] = mcpMatch;
      const serverName = this.mcpServerNames[serverKey] || serverKey;
      console.log(`[formatToolName] Matched server: ${serverKey} -> ${serverName}, tool: ${toolName}`);
      return `${serverName} > ${toolName}`;
    }
    
    // 일반 MCP: mcp_{timestamp}__{tool} 형식
    const simpleMatch = name.match(/^mcp_\d+__(.+)$/);
    if (simpleMatch) {
      console.log(`[formatToolName] Simple match: ${simpleMatch[1]}`);
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
      thinkingBudget = null, // thinking 토큰 예산 (기본: maxTokens의 60%)
      enableCache = true, // 프롬프트 캐싱 (기본 활성화)
      prefill = null, // JSON 응답 강제용 prefill (예: '{', '[')
      enableContextEditing = false, // Context Editing (비활성화 - API 오류 발생)
      effort = null, // 노력 수준: 'high' | 'medium' | 'low' (Opus 4.5 전용, 베타)
      documents = null, // Citations용 문서 배열 [{ title, content, type? }]
      searchResults = null, // RAG용 검색 결과 [{ source, title, content: [{type:'text',text}] }]
      outputFormat = null, // Structured Outputs: JSON 스키마 { type: 'json_schema', schema: {...} }
      strictTools = false, // Structured Outputs: 도구 입력 검증 (베타)
      toolExamples = null, // 도구별 예제 입력 { toolName: [{ input: {...}, description?: '...' }] } (베타)
      fineGrainedToolStreaming = false, // 세밀한 도구 파라미터 스트리밍 (베타) - 지연 시간 감소
      disableParallelToolUse = false, // 병렬 도구 사용 비활성화 (한 번에 하나의 도구만)
      enableToolSearch = false, // Tool Search Tool 활성화 (도구 30개+ 시 유용, 베타)
      toolSearchType = 'regex', // 'regex' | 'bm25' - 검색 방식
      alwaysLoadTools = [], // Tool Search 사용 시에도 항상 로드할 도구 이름 배열
    } = options;

    // Citations: 문서가 있으면 user 메시지에 문서를 포함
    // Claude API는 content를 배열로 받아 document 블록과 text 블록을 함께 전달
    const apiMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 문서/파일이 있으면 첫 번째 user 메시지에 문서 블록 추가
    // documents 배열 형식:
    // - 텍스트: { type: 'text', title, content, context? }
    // - PDF (base64): { type: 'pdf', title, data (base64), context? }
    // - PDF (URL): { type: 'pdf_url', title, url, context? }
    // - PDF (file_id): { type: 'file', title, file_id, context? }
    // - 이미지 (base64): { type: 'image', media_type, data (base64) }
    // - 이미지 (URL): { type: 'image_url', url }
    // - 이미지 (file_id): { type: 'image_file', file_id }
    if (documents && documents.length > 0) {
      const firstUserIdx = apiMessages.findIndex(m => m.role === 'user');
      if (firstUserIdx >= 0) {
        const originalContent = apiMessages[firstUserIdx].content;
        const contentBlocks = documents.map((doc, idx) => {
          const baseBlock = {
            title: doc.title || `문서 ${idx + 1}`,
            context: doc.context || undefined
          };

          switch (doc.type) {
            case 'pdf':
              // PDF (base64)
              return {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: doc.data
                },
                ...baseBlock,
                citations: { enabled: doc.citations !== false }
              };

            case 'pdf_url':
              // PDF (URL)
              return {
                type: 'document',
                source: {
                  type: 'url',
                  url: doc.url
                },
                ...baseBlock,
                citations: { enabled: doc.citations !== false }
              };

            case 'file':
              // Files API (file_id)
              return {
                type: 'document',
                source: {
                  type: 'file',
                  file_id: doc.file_id
                },
                ...baseBlock,
                citations: { enabled: doc.citations !== false }
              };

            case 'image':
              // 이미지 (base64)
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: doc.media_type || 'image/jpeg',
                  data: doc.data
                }
              };

            case 'image_url':
              // 이미지 (URL)
              return {
                type: 'image',
                source: {
                  type: 'url',
                  url: doc.url
                }
              };

            case 'image_file':
              // 이미지 (file_id)
              return {
                type: 'image',
                source: {
                  type: 'file',
                  file_id: doc.file_id
                }
              };

            case 'text':
            default:
              // 텍스트 문서 (기존)
              return {
                type: 'document',
                source: {
                  type: 'text',
                  media_type: 'text/plain',
                  data: doc.content
                },
                ...baseBlock,
                citations: { enabled: doc.citations !== false }
              };
          }
        });

        // content를 배열로 변환: [documents..., text]
        apiMessages[firstUserIdx].content = [
          ...contentBlocks,
          { type: 'text', text: typeof originalContent === 'string' ? originalContent : JSON.stringify(originalContent) }
        ];
        console.log(`[Anthropic] Documents/files enabled: ${documents.length} items`);
      }
    }

    // Search Results: RAG 애플리케이션용 검색 결과
    // tool_result 내 또는 최상위 user 메시지에 search_result 블록으로 포함
    // Claude가 자동으로 인용하며 답변함 (citations 필요 없이 source 링크 사용)
    // searchResults 형식: [{ source: 'URL', title: '제목', content: [{type:'text', text:'내용'}] }]
    if (searchResults && searchResults.length > 0) {
      const lastUserIdx = apiMessages.map((m, i) => ({ m, i }))
        .filter(x => x.m.role === 'user')
        .pop()?.i;

      if (lastUserIdx !== undefined) {
        const originalContent = apiMessages[lastUserIdx].content;
        const searchBlocks = searchResults.map(sr => ({
          type: 'search_result',
          source: sr.source || sr.url || '',
          title: sr.title || '',
          content: Array.isArray(sr.content) ? sr.content : [{ type: 'text', text: sr.content || '' }]
        }));

        // content를 배열로 변환: [search_results..., text]
        apiMessages[lastUserIdx].content = [
          ...searchBlocks,
          { type: 'text', text: typeof originalContent === 'string' ? originalContent : JSON.stringify(originalContent) }
        ];
        console.log(`[Anthropic] Search results enabled: ${searchResults.length} results`);
      }
    }

    // Prefill: assistant 메시지로 응답 시작 부분 미리 채움
    // JSON 응답 강제 시 유용 (예: prefill: '{' → JSON 객체 응답 보장)
    if (prefill) {
      apiMessages.push({ role: 'assistant', content: prefill });
    }

    const params = {
      model: this.modelName,
      max_tokens: maxTokens,
      messages: apiMessages,
    };

    // extended thinking 설정 (활성화 시 temperature 사용 불가)
    // 지원 모델: Sonnet 4.5, Sonnet 4, Haiku 4.5, Opus 4.5, Opus 4.1, Opus 4
    if (thinking) {
      const budgetTokens = thinkingBudget || Math.min(10000, Math.floor(maxTokens * 0.6));
      params.thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens
      };
      console.log(`[Anthropic] Extended thinking enabled with budget: ${budgetTokens}`);
    } else {
      params.temperature = temperature;
    }

    // 시스템 프롬프트 (캐싱 적용: 90% 비용 절감)
    if (systemPrompt) {
      if (enableCache) {
        // 캐싱을 위해 배열 형태로 전달
        params.system = [{
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' }
        }];
        console.log(`[Anthropic] System prompt cached (${systemPrompt.length} chars)`);
      } else {
        params.system = systemPrompt;
      }
    }

    // 베타 기능 배열 (도구 블록 전에 정의해야 함)
    const requestOptions = {};
    const betas = [];

    // 도구 정의 (캐싱 적용: 매 요청마다 동일하므로 캐싱 효과 큼)
    if (tools && tools.length > 0) {
      let processedTools = tools.map(tool => ({ ...tool }));

      // Tool Search Tool (베타: advanced-tool-use-2025-11-20)
      // 도구가 많을 때 (30개+) 필요한 도구만 동적으로 검색/로드하여 컨텍스트 절약
      // alwaysLoadTools에 지정된 도구는 항상 로드, 나머지는 defer_loading: true
      if (enableToolSearch && tools.length >= 10) {
        betas.push('advanced-tool-use-2025-11-20');

        // Tool Search Tool 추가
        const toolSearchToolType = toolSearchType === 'bm25'
          ? 'tool_search_tool_bm25_20251119'
          : 'tool_search_tool_regex_20251119';
        const toolSearchToolName = toolSearchType === 'bm25'
          ? 'tool_search_tool_bm25'
          : 'tool_search_tool_regex';

        processedTools = [
          { type: toolSearchToolType, name: toolSearchToolName },
          ...processedTools.map(tool => ({
            ...tool,
            defer_loading: !alwaysLoadTools.includes(tool.name)
          }))
        ];

        const deferredCount = processedTools.filter(t => t.defer_loading).length;
        console.log(`[Anthropic] Tool Search enabled (${toolSearchType}): ${deferredCount} deferred, ${alwaysLoadTools.length} always loaded`);
      }

      // input_examples 추가 (베타: advanced-tool-use-2025-11-20)
      // 복잡한 도구에 예제 입력을 제공하여 Claude의 도구 사용 정확도 향상
      // 예: toolExamples = { 'search': [{ input: { query: '날씨' }, description: '날씨 검색 예시' }] }
      if (toolExamples) {
        betas.push('advanced-tool-use-2025-11-20');
        processedTools = processedTools.map(tool => {
          if (toolExamples[tool.name]) {
            return {
              ...tool,
              input_examples: toolExamples[tool.name]
            };
          }
          return tool;
        });
        const exampleCount = Object.keys(toolExamples).length;
        console.log(`[Anthropic] Tool examples added for ${exampleCount} tools`);
      }

      if (enableCache) {
        // 마지막 도구에 cache_control 추가 (도구 전체가 캐싱됨)
        processedTools = processedTools.map((tool, index) => {
          if (index === processedTools.length - 1) {
            return { ...tool, cache_control: { type: 'ephemeral' } };
          }
          return tool;
        });
        console.log(`[Anthropic] Tools cached: ${tools.length} tools`);
      }

      params.tools = processedTools;
      console.log(`[Anthropic] Tools passed: ${tools.length} tools`);

      // 병렬 도구 사용 비활성화 (한 번에 하나의 도구만 호출)
      if (disableParallelToolUse) {
        params.tool_choice = { type: 'auto', disable_parallel_tool_use: true };
        console.log(`[Anthropic] Parallel tool use disabled`);
      }
    } else {
      console.log(`[Anthropic] No tools passed!`);
    }

    // Context Editing: 서버에서 tool_result와 thinking 블록 자동 정리 (토큰 절약)
    // - clear_tool_uses: 이전 tool_result 내용을 빈 문자열로 교체
    // - clear_thinking: 마지막 N개 턴 제외하고 thinking 블록 제거
    // 베타 기능이므로 betas 헤더 필요 (배열은 도구 블록 전에 정의됨)

    if (enableContextEditing) {
      betas.push('context-management-2025-06-27');
      params.context_management = {
        edits: [
          {
            type: 'clear_tool_uses_20250919',
            // trigger 없으면 항상 적용
          },
          {
            type: 'clear_thinking_20251015',
            keep: { type: 'thinking_turns', value: 1 } // 마지막 1턴만 유지
          }
        ]
      };
      console.log(`[Anthropic] Context Editing enabled (clear_tool_uses + clear_thinking)`);
    }

    // Effort: 토큰 사용량 조절 (Opus 4.5 전용, 베타)
    // - high: 최대 기능 (기본값, 생략과 동일)
    // - medium: 균형 잡힌 접근
    // - low: 가장 효율적, 빠른 응답
    if (effort && this.modelName.includes('opus-4-5')) {
      betas.push('effort-2025-11-24');
      params.output_config = {
        effort: effort
      };
      console.log(`[Anthropic] Effort level: ${effort}`);
    }

    // Structured Outputs: JSON 스키마 강제 (베타)
    // Claude가 지정한 JSON 스키마에 맞는 응답만 생성
    // outputFormat: { type: 'json_schema', schema: { ... JSON Schema ... } }
    // 주의: schema에 additionalProperties: false 필수, 재귀 스키마 불가
    if (outputFormat) {
      betas.push('structured-outputs-2025-11-13');
      params.output_format = outputFormat;
      console.log(`[Anthropic] Structured output enabled (JSON schema)`);
    }

    // Strict Tools: 도구 입력 스키마 검증 (베타)
    // tools 배열의 각 도구에 strict: true 추가하면 입력값 검증
    // 잘못된 입력 시 오류 발생 (기본: 허용적)
    if (strictTools && params.tools && params.tools.length > 0) {
      if (!betas.includes('structured-outputs-2025-11-13')) {
        betas.push('structured-outputs-2025-11-13');
      }
      params.tools = params.tools.map(tool => ({
        ...tool,
        strict: true
      }));
      console.log(`[Anthropic] Strict tool validation enabled`);
    }

    // Fine-grained Tool Streaming (베타: fine-grained-tool-streaming-2025-05-14)
    // 도구 파라미터를 JSON 검증 없이 바로 스트리밍하여 지연 시간 감소
    // 주의: 불완전한 JSON이 전달될 수 있으므로 에러 처리 필요
    if (fineGrainedToolStreaming) {
      betas.push('fine-grained-tool-streaming-2025-05-14');
      console.log(`[Anthropic] Fine-grained tool streaming enabled`);
    }

    if (betas.length > 0) {
      requestOptions.betas = betas;
    }

    let response = await this.client.messages.create(params, requestOptions);
    console.log(`[Anthropic] stop_reason: ${response.stop_reason}, content types: ${response.content.map(b => b.type).join(', ')}`);

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

      // 다시 API 호출 (Context Editing 옵션 유지)
      params.messages = apiMessages;
      response = await this.client.messages.create(params, requestOptions);
    }

    // 최종 응답 추출 (thinking + tool_use + text)
    const thinkingBlock = response.content.find(block => block.type === 'thinking');
    const textBlock = response.content.find(block => block.type === 'text');

    let textContent = textBlock ? textBlock.text : '';

    // Prefill이 있으면 응답 앞에 붙여서 완전한 JSON으로 만듦
    if (prefill) {
      textContent = prefill + textContent;
    }

    // Citations: 인용 정보 추출 (문서가 있을 때만)
    let citations = [];
    if (documents && documents.length > 0 && textBlock?.citations) {
      citations = textBlock.citations.map(cite => ({
        documentTitle: cite.document_title || documents[cite.document_index]?.title,
        documentIndex: cite.document_index,
        startIndex: cite.start_char_index,
        endIndex: cite.end_char_index,
        citedText: cite.cited_text
      }));
      console.log(`[Anthropic] Found ${citations.length} citations in response`);
    }

    // 응답 조립
    let finalResponse = '';

    // thinking이 있으면 추가
    if (thinkingBlock) {
      console.log(`[Anthropic] Thinking content length: ${thinkingBlock.thinking.length}`);
      finalResponse += `<thinking>${thinkingBlock.thinking}</thinking>\n\n`;
    }

    // 도구 사용 정보는 소켓으로 이미 전송됨 - 텍스트에 포함하지 않음
    // (이전에 <tool_use> 태그로 추가했으나, AI가 이를 학습해서 흉내내는 문제 발생)

    finalResponse += textContent;

    // 사용량 정보 추출 (response.usage에서)
    const usage = {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0
    };

    // Citations가 있으면 응답 객체로 반환 (선택적)
    if (citations.length > 0) {
      return { text: finalResponse, citations, usage };
    }

    // 사용량 정보를 포함한 객체 반환 (하위 호환성: text 속성이 있으면 객체, 없으면 문자열)
    return { text: finalResponse, usage };
  }

  /**
   * 토큰 카운팅 (무료 API)
   * 요청 전에 토큰 수를 미리 계산하여 비용/속도 제한 관리
   * @param {Array} messages - 메시지 배열
   * @param {Object} options - { systemPrompt, tools, thinking }
   * @returns {Promise<number>} 입력 토큰 수
   */
  async countTokens(messages, options = {}) {
    const { systemPrompt = null, tools = null, thinking = false, thinkingBudget = null } = options;

    const params = {
      model: this.modelName,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    if (thinking) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget || 10000
      };
    }

    try {
      const response = await this.client.messages.countTokens(params);
      console.log(`[Anthropic] Token count: ${response.input_tokens}`);
      return response.input_tokens;
    } catch (error) {
      console.error('[Anthropic] Token counting error:', error.message);
      // 실패 시 대략적인 추정 (4자 = 1토큰)
      const textLength = JSON.stringify(messages).length;
      return Math.ceil(textLength / 4);
    }
  }

  /**
   * 문서 기반 대화 (Citations)
   * 문서를 참조하여 답변하고, 인용 정보를 함께 반환
   *
   * @param {string} question - 사용자 질문
   * @param {Array} documents - 문서 배열 [{ title, content, context? }]
   * @param {Object} options - chat() 옵션과 동일
   * @returns {Promise<{text: string, citations: Array}>}
   *
   * @example
   * const result = await aiService.chatWithDocuments(
   *   '계약 해지 조건이 뭐야?',
   *   [{ title: '임대차계약서', content: '...' }]
   * );
   * // result.text: "계약 해지 조건은 ... 입니다."
   * // result.citations: [{ documentTitle, citedText, startIndex, endIndex }]
   */
  async chatWithDocuments(question, documents, options = {}) {
    if (!documents || documents.length === 0) {
      throw new Error('문서가 필요합니다');
    }

    const messages = [{ role: 'user', content: question }];

    // systemPrompt에 문서 참조 지시 추가
    const defaultSystemPrompt = options.systemPrompt || '';
    const docSystemPrompt = `${defaultSystemPrompt}
제공된 문서를 참조하여 답변하세요. 문서에서 관련 내용을 인용하며 답변하고, 문서에 없는 내용은 추측하지 마세요.`.trim();

    const result = await this.chat(messages, {
      ...options,
      systemPrompt: docSystemPrompt,
      documents
    });

    // chat()이 citations와 함께 객체를 반환하면 그대로 반환
    if (typeof result === 'object' && result.text) {
      return result;
    }

    // citations 없이 문자열만 반환된 경우
    return { text: result, citations: [] };
  }

  /**
   * Files API: 파일 업로드 (베타)
   * 한 번 업로드하면 file_id로 여러 요청에서 재사용 가능
   *
   * @param {Buffer|ReadableStream} fileContent - 파일 내용
   * @param {string} filename - 파일명
   * @param {string} mimeType - MIME 타입 (application/pdf, image/jpeg 등)
   * @returns {Promise<{id: string, filename: string, size_bytes: number}>}
   *
   * @example
   * const file = await aiService.uploadFile(pdfBuffer, 'contract.pdf', 'application/pdf');
   * // 이후 chat()에서 사용: documents: [{ type: 'file', file_id: file.id }]
   */
  async uploadFile(fileContent, filename, mimeType = 'application/pdf') {
    try {
      const response = await this.client.beta.files.upload(
        { file: (filename, fileContent, mimeType) },
        { betas: ['files-api-2025-04-14'] }
      );
      console.log(`[Anthropic] File uploaded: ${response.id} (${filename}, ${response.size_bytes} bytes)`);
      return response;
    } catch (error) {
      console.error('[Anthropic] File upload error:', error.message);
      throw error;
    }
  }

  /**
   * Files API: 파일 다운로드 (스킬/코드 실행 결과만)
   * @param {string} fileId - 파일 ID
   * @returns {Promise<Buffer>}
   */
  async downloadFile(fileId) {
    try {
      const content = await this.client.beta.files.download(
        fileId,
        { betas: ['files-api-2025-04-14'] }
      );
      console.log(`[Anthropic] File downloaded: ${fileId}`);
      return content;
    } catch (error) {
      console.error('[Anthropic] File download error:', error.message);
      throw error;
    }
  }

  /**
   * Files API: 파일 목록 조회
   * @returns {Promise<Array>}
   */
  async listFiles() {
    try {
      const files = await this.client.beta.files.list({
        betas: ['files-api-2025-04-14']
      });
      return files.data || [];
    } catch (error) {
      console.error('[Anthropic] File list error:', error.message);
      return [];
    }
  }

  /**
   * Files API: 파일 삭제
   * @param {string} fileId - 파일 ID
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileId) {
    try {
      await this.client.beta.files.delete(
        fileId,
        { betas: ['files-api-2025-04-14'] }
      );
      console.log(`[Anthropic] File deleted: ${fileId}`);
      return true;
    } catch (error) {
      console.error('[Anthropic] File delete error:', error.message);
      return false;
    }
  }

  /**
   * PDF 분석 헬퍼 (URL 또는 base64)
   * @param {string} pdfSource - PDF URL 또는 base64 문자열
   * @param {string} question - 질문
   * @param {Object} options - { isUrl: false, enableCitations: true }
   * @returns {Promise<{text: string, citations?: Array}>}
   */
  async analyzePdf(pdfSource, question, options = {}) {
    const { isUrl = false, enableCitations = true } = options;

    const doc = isUrl
      ? { type: 'pdf_url', url: pdfSource, citations: enableCitations }
      : { type: 'pdf', data: pdfSource, citations: enableCitations };

    return this.chatWithDocuments(question, [doc], options);
  }

  /**
   * RAG 검색 결과 기반 대화 (Search Results)
   * 검색 결과를 참조하여 답변하고, 자동으로 소스 링크 포함
   *
   * @param {string} question - 사용자 질문
   * @param {Array} searchResults - 검색 결과 배열
   *   [{ source: 'URL', title: '제목', content: '내용' 또는 [{type:'text',text}] }]
   * @param {Object} options - chat() 옵션과 동일
   * @returns {Promise<string>} AI 응답 (소스 링크 포함)
   *
   * @example
   * const result = await aiService.chatWithSearchResults(
   *   '최신 AI 트렌드가 뭐야?',
   *   [
   *     { source: 'https://example.com/ai', title: 'AI 트렌드 2024', content: '...' },
   *     { source: 'https://blog.com/ml', title: 'ML 동향', content: '...' }
   *   ]
   * );
   */
  async chatWithSearchResults(question, searchResults, options = {}) {
    if (!searchResults || searchResults.length === 0) {
      throw new Error('검색 결과가 필요합니다');
    }

    const messages = [{ role: 'user', content: question }];

    // systemPrompt에 검색 결과 참조 지시 추가
    const defaultSystemPrompt = options.systemPrompt || '';
    const ragSystemPrompt = `${defaultSystemPrompt}
검색 결과를 참조하여 답변하세요. 정보의 출처를 명시하고, 검색 결과에 없는 내용은 추측하지 마세요.`.trim();

    return this.chat(messages, {
      ...options,
      systemPrompt: ragSystemPrompt,
      searchResults
    });
  }

  /**
   * JSON 스키마 기반 대화 (Structured Outputs)
   * Claude가 지정한 JSON 스키마에 맞는 응답만 생성
   *
   * @param {Array} messages - 메시지 배열
   * @param {Object} jsonSchema - JSON Schema 객체
   *   주의: additionalProperties: false 필수, 재귀 스키마 불가
   * @param {Object} options - chat() 옵션과 동일
   * @returns {Promise<Object>} 파싱된 JSON 객체
   *
   * @example
   * const result = await aiService.chatWithJsonSchema(
   *   [{ role: 'user', content: '서울 날씨 알려줘' }],
   *   {
   *     type: 'object',
   *     properties: {
   *       city: { type: 'string' },
   *       temperature: { type: 'number' },
   *       condition: { type: 'string', enum: ['sunny', 'cloudy', 'rainy'] }
   *     },
   *     required: ['city', 'temperature', 'condition'],
   *     additionalProperties: false
   *   }
   * );
   * // result: { city: '서울', temperature: 15, condition: 'cloudy' }
   */
  async chatWithJsonSchema(messages, jsonSchema, options = {}) {
    if (!jsonSchema) {
      throw new Error('JSON 스키마가 필요합니다');
    }

    // additionalProperties: false 강제 (API 요구사항)
    const schemaWithDefaults = this._ensureAdditionalPropertiesFalse(jsonSchema);

    const response = await this.chat(messages, {
      ...options,
      outputFormat: {
        type: 'json_schema',
        schema: schemaWithDefaults
      }
    });

    // JSON 파싱
    try {
      const text = typeof response === 'object' ? response.text : response;
      return JSON.parse(text);
    } catch (error) {
      console.error('[Anthropic] JSON parsing failed:', error.message);
      throw new Error(`JSON 파싱 실패: ${error.message}`);
    }
  }

  /**
   * JSON Schema에 additionalProperties: false 추가 (재귀적)
   * Structured Outputs API 요구사항
   */
  _ensureAdditionalPropertiesFalse(schema) {
    if (!schema || typeof schema !== 'object') return schema;

    const result = { ...schema };

    // object 타입이면 additionalProperties: false 추가
    if (result.type === 'object') {
      result.additionalProperties = false;

      // properties 내부도 재귀 처리
      if (result.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          result.properties[key] = this._ensureAdditionalPropertiesFalse(value);
        }
      }
    }

    // array의 items도 처리
    if (result.type === 'array' && result.items) {
      result.items = this._ensureAdditionalPropertiesFalse(result.items);
    }

    // anyOf, oneOf, allOf 처리
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      if (Array.isArray(result[key])) {
        result[key] = result[key].map(s => this._ensureAdditionalPropertiesFalse(s));
      }
    }

    return result;
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
      // Claude 전용 옵션들 - 무시되지만 경고 출력
      documents = null,
      searchResults = null,
      outputFormat = null,
      strictTools = false,
      thinking = false,
      prefill = null,
      enableCache = false,
      effort = null,
      toolExamples = null,
      fineGrainedToolStreaming = false,
      disableParallelToolUse = false,
      enableToolSearch = false,
    } = options;

    // Claude 전용 옵션 사용 시 경고
    const claudeOnlyOptions = { documents, searchResults, outputFormat, strictTools, thinking, prefill, enableCache, effort, toolExamples, fineGrainedToolStreaming, disableParallelToolUse, enableToolSearch };
    const usedClaudeOptions = Object.entries(claudeOnlyOptions)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (usedClaudeOptions.length > 0) {
      console.warn(`[OpenAI] Claude-only options ignored: ${usedClaudeOptions.join(', ')}`);
    }

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

    // 사용량 정보 추출 (OpenAI format: prompt_tokens, completion_tokens)
    const usage = {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0
    };

    return { text: data.choices[0].message.content, usage };
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
      // Claude 전용 옵션들 - 무시되지만 경고 출력
      documents = null,
      searchResults = null,
      outputFormat = null,
      strictTools = false,
      thinking = false,
      prefill = null,
      enableCache = false,
      effort = null,
      toolExamples = null,
      fineGrainedToolStreaming = false,
      disableParallelToolUse = false,
      enableToolSearch = false,
    } = options;

    // Claude 전용 옵션 사용 시 경고
    const claudeOnlyOptions = { documents, searchResults, outputFormat, strictTools, thinking, prefill, enableCache, effort, toolExamples, fineGrainedToolStreaming, disableParallelToolUse, enableToolSearch };
    const usedClaudeOptions = Object.entries(claudeOnlyOptions)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (usedClaudeOptions.length > 0) {
      console.warn(`[Google] Claude-only options ignored: ${usedClaudeOptions.join(', ')}`);
    }

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

    // Gemini는 usageMetadata로 토큰 정보 반환
    const usage = {
      input_tokens: data.usageMetadata?.promptTokenCount || 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount || 0
    };

    return { text: data.candidates[0].content.parts[0].text, usage };
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
      // Claude 전용 옵션들 - 무시되지만 경고 출력
      documents = null,
      searchResults = null,
      outputFormat = null,
      strictTools = false,
      thinking = false,
      prefill = null,
      enableCache = false,
      effort = null,
      toolExamples = null,
      fineGrainedToolStreaming = false,
      disableParallelToolUse = false,
      enableToolSearch = false,
    } = options;

    // Claude 전용 옵션 사용 시 경고
    const claudeOnlyOptions = { documents, searchResults, outputFormat, strictTools, thinking, prefill, enableCache, effort, toolExamples, fineGrainedToolStreaming, disableParallelToolUse, enableToolSearch };
    const usedClaudeOptions = Object.entries(claudeOnlyOptions)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (usedClaudeOptions.length > 0) {
      console.warn(`[xAI] Claude-only options ignored: ${usedClaudeOptions.join(', ')}`);
    }

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

    // xAI도 OpenAI 호환 format 사용
    const usage = {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0
    };

    return { text: data.choices[0].message.content, usage };
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
      // Claude 전용 옵션들 - 무시되지만 경고 출력
      documents = null,
      searchResults = null,
      outputFormat = null,
      strictTools = false,
      thinking = false,
      prefill = null,
      enableCache = false,
      effort = null,
      toolExamples = null,
      fineGrainedToolStreaming = false,
      disableParallelToolUse = false,
      enableToolSearch = false,
    } = options;

    // Claude 전용 옵션 사용 시 경고
    const claudeOnlyOptions = { documents, searchResults, outputFormat, strictTools, thinking, prefill, enableCache, effort, toolExamples, fineGrainedToolStreaming, disableParallelToolUse, enableToolSearch };
    const usedClaudeOptions = Object.entries(claudeOnlyOptions)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (usedClaudeOptions.length > 0) {
      console.warn(`[Ollama] Claude-only options ignored: ${usedClaudeOptions.join(', ')}`);
    }

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

    // Ollama는 로컬이므로 비용이 없지만, 토큰 정보는 있을 수 있음
    // Ollama의 prompt_eval_count(입력), eval_count(출력)
    const usage = {
      input_tokens: data.prompt_eval_count || 0,
      output_tokens: data.eval_count || 0
    };

    return { text: data.message.content, usage };
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
 * Google Cloud Vertex AI를 통한 Claude 서비스
 * - Google Cloud 인프라에서 Claude 모델 사용
 * - ADC(Application Default Credentials) 또는 서비스 계정 JSON 인증
 * - Claude의 모든 기능 지원 (Anthropic API와 동일)
 */
class VertexAIService extends AIService {
  /**
   * Vertex AI Claude도 모든 Claude 기능 지원
   */
  static get supportedFeatures() {
    return {
      documents: true,       // Citations
      searchResults: true,   // RAG 검색 결과
      outputFormat: true,    // Structured Outputs (beta)
      strictTools: true,     // 도구 입력 검증 (beta)
      thinking: true,        // Extended Thinking
      prefill: true,         // 응답 시작 미리 채움
      enableCache: true,     // 프롬프트 캐싱
      effort: true,          // 노력 수준 조절
      toolExamples: true,    // 도구별 input_examples (beta)
      fineGrainedToolStreaming: true, // 세밀한 도구 스트리밍 (beta)
      enableToolSearch: true, // Tool Search Tool (beta)
    };
  }

  /**
   * @param {Object} config - { projectId, region, credentials? }
   * @param {string} modelName - 예: 'claude-sonnet-4-5@20250929'
   */
  constructor(config, modelName = 'claude-sonnet-4-5@20250929') {
    super(null, config);
    this.projectId = config.projectId;
    this.region = config.region || 'us-east5'; // 기본 리전
    this.modelName = modelName;
    this.credentials = config.credentials; // 서비스 계정 JSON (선택)

    // Vertex SDK 지연 로드
    this.client = null;
  }

  /**
   * Vertex AI 클라이언트 초기화 (지연 로드)
   */
  async _getClient() {
    if (this.client) return this.client;

    const { AnthropicVertex } = require('@anthropic-ai/vertex-sdk');

    const options = {
      projectId: this.projectId,
      region: this.region,
    };

    // 서비스 계정 JSON이 있으면 사용, 없으면 ADC 사용
    if (this.credentials) {
      // 환경변수로 서비스 계정 설정
      process.env.GOOGLE_APPLICATION_CREDENTIALS = this.credentials;
    }

    this.client = new AnthropicVertex(options);
    return this.client;
  }

  /**
   * 대화 생성 (Anthropic API와 거의 동일)
   */
  async chat(messages, options = {}) {
    const {
      systemPrompt = null,
      maxTokens = 4096,
      temperature = 0.7,
      tools = null,
      thinking = false,
      thinkingBudget = null,
      prefill = null,
      enableCache = true,
      effort = null,
      enableToolSearch = false,
      toolSearchType = 'regex',
      alwaysLoadTools = [],
    } = options;

    const client = await this._getClient();

    const apiMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Prefill 처리
    if (prefill) {
      apiMessages.push({ role: 'assistant', content: prefill });
    }

    const params = {
      model: this.modelName,
      max_tokens: maxTokens,
      messages: apiMessages,
    };

    // Extended Thinking
    if (thinking) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget || Math.min(maxTokens * 2, 10000)
      };
    } else {
      params.temperature = temperature;
    }

    // System prompt
    if (systemPrompt) {
      if (enableCache) {
        params.system = [{
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' }
        }];
      } else {
        params.system = systemPrompt;
      }
    }

    // 도구 처리
    if (tools && tools.length > 0) {
      let processedTools = tools.map(tool => ({ ...tool }));

      // Tool Search Tool
      if (enableToolSearch && tools.length >= 10) {
        const toolSearchToolType = toolSearchType === 'bm25'
          ? 'tool_search_tool_bm25_20251119'
          : 'tool_search_tool_regex_20251119';
        const toolSearchToolName = toolSearchType === 'bm25'
          ? 'tool_search_tool_bm25'
          : 'tool_search_tool_regex';

        processedTools = [
          { type: toolSearchToolType, name: toolSearchToolName },
          ...processedTools.map(tool => ({
            ...tool,
            defer_loading: !alwaysLoadTools.includes(tool.name)
          }))
        ];
      }

      if (enableCache) {
        processedTools = processedTools.map((tool, index) => {
          if (index === processedTools.length - 1) {
            return { ...tool, cache_control: { type: 'ephemeral' } };
          }
          return tool;
        });
      }

      params.tools = processedTools;
    }

    // Effort (Opus 4.5 전용)
    if (effort && this.modelName.includes('opus')) {
      params.thinking = { type: 'enabled', budget_tokens: 10000 };
      // Vertex에서 effort 지원 여부 확인 필요
    }

    console.log(`[VertexAI] Calling ${this.modelName} in ${this.region}`);

    let response = await client.messages.create(params);

    // 도구 호출 처리 (루프)
    const toolResults = [];
    let maxIterations = 10;
    let iteration = 0;

    while (response.stop_reason === 'tool_use' && iteration < maxIterations) {
      iteration++;
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

      for (const toolUse of toolUseBlocks) {
        console.log(`[VertexAI] Tool call: ${toolUse.name}`);
        toolResults.push({
          toolName: toolUse.name,
          input: toolUse.input,
          id: toolUse.id
        });
      }

      // 도구 결과가 options.toolExecutor에서 제공되면 실행
      if (options.toolExecutor) {
        const results = await options.toolExecutor(toolUseBlocks);

        apiMessages.push({ role: 'assistant', content: response.content });
        apiMessages.push({
          role: 'user',
          content: results.map(r => ({
            type: 'tool_result',
            tool_use_id: r.id,
            content: r.result
          }))
        });

        params.messages = apiMessages;
        response = await client.messages.create(params);
      } else {
        break;
      }
    }

    // 응답 추출
    let textContent = '';
    let thinkingContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'thinking') {
        thinkingContent += block.thinking;
      }
    }

    // Prefill이 있었으면 앞에 붙여서 반환
    if (prefill) {
      textContent = prefill + textContent;
    }

    // 메타데이터 포함 반환
    if (options.returnMetadata) {
      return {
        content: textContent,
        thinking: thinkingContent,
        toolResults,
        usage: response.usage,
        stopReason: response.stop_reason
      };
    }

    // 사용량 정보 추출
    const usage = {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0
    };

    return { text: textContent, usage };
  }

  async analyzeConversation(messages) {
    const conversationText = messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const result = await this.chat([{
      role: 'user',
      content: `다음 대화를 분석하고 JSON으로 응답하세요:

대화:
${conversationText}

형식:
{
  "topics": ["주제1", "주제2"],
  "tags": ["태그1", "태그2"],
  "category": "카테고리",
  "importance": 5
}`
    }], {
      systemPrompt: 'JSON 형식으로만 응답하세요.',
      maxTokens: 500,
      prefill: '{'
    });

    try {
      const jsonMatch = ('{' + result).match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      return null;
    }
  }

  async testConnection() {
    try {
      const client = await this._getClient();
      // 간단한 메시지로 테스트
      const response = await client.messages.create({
        model: this.modelName,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      return !!response.content;
    } catch (error) {
      console.error('Vertex AI connection test failed:', error);
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
    const service = serviceName || process.env.DEFAULT_AI_SERVICE;
    const model = modelName || process.env.DEFAULT_AI_MODEL;

    // 서비스와 모델 필수
    if (!service) {
      throw new Error('AI service not specified. Please configure in Settings or pass serviceName.');
    }
    if (!model) {
      throw new Error('AI model not specified. Please configure in Settings or pass modelName.');
    }

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
        serviceInstance = new AnthropicService(apiKey, model);
        break;
      }

      case 'openai': {
        const apiKey = await this.getApiKey('openai');
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY not configured. Please save it in Settings.');
        }
        serviceInstance = new OpenAIService(apiKey, model);
        break;
      }

      case 'google': {
        const apiKey = await this.getApiKey('google');
        if (!apiKey) {
          throw new Error('GOOGLE_API_KEY not configured. Please save it in Settings.');
        }
        serviceInstance = new GoogleService(apiKey, model);
        break;
      }

      case 'xai': {
        const apiKey = await this.getApiKey('xai');
        if (!apiKey) {
          throw new Error('XAI_API_KEY not configured. Please save it in Settings.');
        }
        serviceInstance = new XAIService(apiKey, model);
        break;
      }

      case 'ollama':
        serviceInstance = new OllamaService(
          process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          model
        );
        break;

      case 'vertex': {
        // Vertex AI는 API 키 대신 projectId와 region 필요
        // AIService 모델에서 vertex 설정 조회
        const AIServiceModel = require('../models/AIService');
        const vertexConfig = await AIServiceModel.findOne({ serviceId: 'vertex' });

        if (!vertexConfig || !vertexConfig.projectId) {
          throw new Error('Vertex AI not configured. Please set Project ID in Settings.');
        }

        serviceInstance = new VertexAIService({
          projectId: vertexConfig.projectId,
          region: vertexConfig.region || 'us-east5',
          credentials: vertexConfig.credentials // 서비스 계정 JSON 경로 (선택)
        }, model);
        break;
      }

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

        case 'vertex':
          // Vertex AI는 API 키 대신 Google Cloud 인증 사용
          // projectId와 region으로 연결 테스트
          return { valid: true, message: 'Vertex AI는 Google Cloud 인증을 사용합니다' };

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
          const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
          const ollamaResponse = await fetch(`${ollamaBaseUrl}/api/tags`);

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

        case 'vertex':
          // Vertex AI에서 사용 가능한 Claude 모델 (고정 목록)
          // https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude
          const vertexModels = [
            { id: 'claude-opus-4@20250514', name: 'Claude Opus 4', description: '최고 성능 모델' },
            { id: 'claude-sonnet-4@20250514', name: 'Claude Sonnet 4', description: '균형 잡힌 모델' },
            { id: 'claude-sonnet-4-5@20250929', name: 'Claude Sonnet 4.5', description: '향상된 Sonnet' },
            { id: 'claude-haiku-4@20250514', name: 'Claude Haiku 4', description: '빠르고 경제적' },
          ];
          return { success: true, models: vertexModels };

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

  /**
   * 사용량 추적 헬퍼 메서드
   * AI 호출 후 응답과 함께 호출하여 통계 기록
   * @param {Object} params - { serviceId, modelId, tier, usage, latency, category }
   */
  static async trackUsage(params) {
    try {
      const UsageStats = require('../models/UsageStats');
      const { serviceId, modelId, tier = 'medium', usage = {}, latency = 0, category = 'other' } = params;

      const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
      const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      // 비용 계산 (간단한 추정 - 서비스별로 다를 수 있음)
      let cost = 0;
      const lowerServiceId = serviceId?.toLowerCase() || '';
      const lowerModelId = modelId?.toLowerCase() || '';

      if (lowerServiceId === 'anthropic' || lowerServiceId === 'vertex') {
        // Claude 가격 (per 1K tokens 기준)
        if (lowerModelId.includes('opus')) {
          cost = (inputTokens * 0.015 + outputTokens * 0.075) / 1000;
        } else if (lowerModelId.includes('sonnet')) {
          cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;
        } else if (lowerModelId.includes('haiku')) {
          cost = (inputTokens * 0.0008 + outputTokens * 0.004) / 1000;
        }
      } else if (lowerServiceId === 'openai') {
        // GPT 가격 (추정)
        if (lowerModelId.includes('gpt-4o')) {
          cost = (inputTokens * 0.005 + outputTokens * 0.015) / 1000;
        } else if (lowerModelId.includes('gpt-4')) {
          cost = (inputTokens * 0.03 + outputTokens * 0.06) / 1000;
        } else {
          cost = (inputTokens * 0.0005 + outputTokens * 0.0015) / 1000;
        }
      } else if (lowerServiceId === 'google') {
        // Gemini 가격 (추정)
        if (lowerModelId.includes('pro')) {
          cost = (inputTokens * 0.00125 + outputTokens * 0.005) / 1000;
        } else {
          cost = (inputTokens * 0.000075 + outputTokens * 0.0003) / 1000;
        }
      }
      // ollama는 무료

      await UsageStats.addUsage({
        tier,
        modelId,
        serviceId,
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        latency,
        category
      });

      console.log(`[UsageTrack] ${category}: ${serviceId}/${modelId} - ${totalTokens} tokens, ${cost.toFixed(6)}`);
    } catch (error) {
      // 추적 실패해도 메인 기능에 영향 없도록
      console.error('[UsageTrack] Failed to track usage:', error.message);
    }
  }

  static getAvailableServices() {
    const services = [];

    if (process.env.ANTHROPIC_API_KEY) {
      services.push({
        name: 'anthropic',
        models: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001']
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
  VertexAIService,
  AIServiceFactory
};
