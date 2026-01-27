/**
 * batch-processor.js
 * Claude Batch API를 활용한 비용 절감 (50% 할인)
 *
 * ⚠️ Claude(Anthropic) 전용 - 다른 모델(Gemini, OpenAI 등)은 지원 안 함
 *
 * 적용 대상:
 * - 주간 요약 생성
 * - 장기 아카이브 압축
 * - 대량 태그 생성
 *
 * 특징:
 * - 비실시간 작업만 배치로 처리
 * - 최대 24시간 내 처리 (보통 더 빠름)
 * - 비용 50% 절감
 */

const Anthropic = require('@anthropic-ai/sdk');

class BatchProcessor {
  constructor() {
    this.client = null;
    this.pendingRequests = []; // 배치 대기열
    this.batchResults = new Map(); // 결과 캐시
    this.batchInterval = 60 * 60 * 1000; // 1시간마다 배치 실행
    this.minBatchSize = 3; // 최소 3개 요청이 모이면 배치
    this.maxBatchSize = 100; // 최대 배치 크기
    this.initialized = false;
    this.enabled = false; // Claude 사용 시에만 true
  }

  /**
   * 초기화 - Claude(Anthropic) API 키 확인
   */
  async initialize() {
    if (this.initialized) return;

    // Claude API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('[BatchProcessor] No Anthropic API key, batch processing disabled');
      this.initialized = true;
      this.enabled = false;
      return;
    }

    // 현재 기본 AI 서비스 확인
    try {
      const configManager = require('./config');
      const aiConfig = await configManager.getAIConfig();

      // Anthropic이 기본 서비스가 아니면 배치 비활성화
      if (aiConfig.defaultService !== 'anthropic') {
        console.log(`[BatchProcessor] Default service is ${aiConfig.defaultService}, batch disabled (Claude only)`);
        this.initialized = true;
        this.enabled = false;
        return;
      }
    } catch (err) {
      console.warn('[BatchProcessor] Could not check AI config:', err.message);
    }

    this.client = new Anthropic({ apiKey });
    this.initialized = true;
    this.enabled = true;

    // 백그라운드 배치 처리 시작
    this._startBatchScheduler();

    console.log('[BatchProcessor] Initialized (Claude Batch API enabled)');
  }

  /**
   * 배치 사용 가능 여부
   */
  isEnabled() {
    return this.enabled && this.client !== null;
  }

  /**
   * 배치 요청 추가
   * @param {string} type - 요청 타입 (weekly_summary, archive_compress, tag_generation)
   * @param {Object} payload - 요청 데이터
   * @param {Function} callback - 결과 콜백 (선택적)
   * @returns {string|null} requestId (null이면 배치 불가 → 호출측에서 실시간 처리)
   */
  addRequest(type, payload, callback = null) {
    // 배치가 비활성화되어 있으면 null 반환 (호출측에서 실시간 처리해야 함)
    if (!this.isEnabled()) {
      console.log(`[BatchProcessor] Batch disabled, returning null for ${type}`);
      return null;
    }

    const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.pendingRequests.push({
      id: requestId,
      type,
      payload,
      callback,
      createdAt: new Date()
    });

    console.log(`[BatchProcessor] Added request: ${type} (${requestId})`);

    // 최소 배치 크기 도달 시 즉시 실행
    if (this.pendingRequests.length >= this.minBatchSize) {
      this._processBatch().catch(err => {
        console.error('[BatchProcessor] Batch processing error:', err);
      });
    }

    return requestId;
  }

  /**
   * 결과 조회
   */
  getResult(requestId) {
    return this.batchResults.get(requestId) || null;
  }

  /**
   * 배치 스케줄러 시작
   */
  _startBatchScheduler() {
    setInterval(() => {
      if (this.pendingRequests.length > 0) {
        this._processBatch().catch(err => {
          console.error('[BatchProcessor] Scheduled batch error:', err);
        });
      }
    }, this.batchInterval);
  }

  /**
   * 배치 처리 실행
   */
  async _processBatch() {
    if (!this.client || this.pendingRequests.length === 0) return;

    const batch = this.pendingRequests.splice(0, this.maxBatchSize);
    console.log(`[BatchProcessor] Processing batch of ${batch.length} requests`);

    try {
      // 요청을 Batch API 형식으로 변환
      const requests = batch.map((req, idx) => ({
        custom_id: req.id,
        params: this._buildRequestParams(req)
      }));

      // Batch API 호출
      const batchJob = await this.client.messages.batches.create({
        requests
      });

      console.log(`[BatchProcessor] Batch created: ${batchJob.id}`);

      // 결과 폴링
      await this._pollBatchResults(batchJob.id, batch);

    } catch (error) {
      console.error('[BatchProcessor] Batch error:', error);

      // 실패 시 개별 요청으로 폴백
      for (const req of batch) {
        await this._processIndividually(req);
      }
    }
  }

  /**
   * 요청 파라미터 빌드
   */
  _buildRequestParams(req) {
    const baseParams = {
      model: 'claude-haiku-4-5-20251001', // 배치는 저렴한 모델 사용
      max_tokens: 1024
    };

    switch (req.type) {
      case 'weekly_summary':
        return {
          ...baseParams,
          system: '대화 내용을 분석하여 주간 요약을 생성하는 AI입니다.',
          messages: [
            { role: 'user', content: this._buildWeeklySummaryPrompt(req.payload) },
            { role: 'assistant', content: '{' } // Prefill: JSON 응답 강제
          ]
        };

      case 'archive_compress':
        return {
          ...baseParams,
          max_tokens: 512,
          system: '대화 내용을 간결하게 압축하는 AI입니다.',
          messages: [
            { role: 'user', content: this._buildArchiveCompressPrompt(req.payload) },
            { role: 'assistant', content: '{' } // Prefill: JSON 응답 강제
          ]
        };

      case 'tag_generation':
        return {
          ...baseParams,
          max_tokens: 256,
          system: '대화 내용에서 핵심 태그를 추출하는 AI입니다.',
          messages: [
            { role: 'user', content: this._buildTagGenerationPrompt(req.payload) },
            { role: 'assistant', content: '[' } // Prefill: JSON 배열 응답 강제
          ]
        };

      default:
        return {
          ...baseParams,
          messages: [{
            role: 'user',
            content: JSON.stringify(req.payload)
          }]
        };
    }
  }

  /**
   * 주간 요약 프롬프트
   */
  _buildWeeklySummaryPrompt(payload) {
    const { messages, weekInfo } = payload;
    const messagesText = messages
      .map(m => `[${m.role}] ${m.content}`)
      .join('\n')
      .substring(0, 3000);

    return `다음은 ${weekInfo.year}년 ${weekInfo.month}월 ${weekInfo.weekNum}주차 대화입니다.

대화 내용:
${messagesText}

다음 JSON 형식으로 응답:
{
  "summary": "한 문단 요약",
  "highlights": ["중요 이벤트 1", "2", "3"],
  "topics": ["주요 화제"],
  "emotions": ["감정 톤"]
}`;
  }

  /**
   * 아카이브 압축 프롬프트
   */
  _buildArchiveCompressPrompt(payload) {
    const { messages, metadata } = payload;
    const messagesText = messages
      .map(m => `[${m.role}] ${m.content}`)
      .join('\n')
      .substring(0, 2000);

    return `다음 대화의 핵심 내용만 추출하세요.

대화:
${messagesText}

JSON 형식으로 응답:
{
  "summary": "핵심 내용 2-3문장",
  "tags": ["태그1", "태그2"],
  "importance": 1-10
}`;
  }

  /**
   * 태그 생성 프롬프트
   */
  _buildTagGenerationPrompt(payload) {
    const { content, context } = payload;

    return `다음 텍스트에서 핵심 태그 3-5개를 추출하세요.

텍스트: ${content.substring(0, 500)}
${context ? `맥락: ${context}` : ''}

JSON 배열로 응답: ["태그1", "태그2", ...]`;
  }

  /**
   * 배치 결과 폴링
   */
  async _pollBatchResults(batchId, originalRequests) {
    const maxWait = 24 * 60 * 60 * 1000; // 24시간
    const pollInterval = 30 * 1000; // 30초
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        const batch = await this.client.messages.batches.retrieve(batchId);

        if (batch.processing_status === 'ended') {
          // 결과 수집
          await this._collectBatchResults(batchId, originalRequests);
          return;
        }

        console.log(`[BatchProcessor] Batch ${batchId} status: ${batch.processing_status}`);
        await this._sleep(pollInterval);

      } catch (error) {
        console.error('[BatchProcessor] Poll error:', error);
        await this._sleep(pollInterval);
      }
    }

    console.warn(`[BatchProcessor] Batch ${batchId} timed out`);
  }

  /**
   * 배치 결과 수집
   */
  async _collectBatchResults(batchId, originalRequests) {
    try {
      // 결과 스트림 읽기
      const results = await this.client.messages.batches.results(batchId);

      for await (const result of results) {
        const request = originalRequests.find(r => r.id === result.custom_id);
        if (!request) continue;

        const parsedResult = this._parseResult(result, request.type);
        this.batchResults.set(request.id, parsedResult);

        // 콜백 실행
        if (request.callback) {
          try {
            await request.callback(parsedResult);
          } catch (err) {
            console.error('[BatchProcessor] Callback error:', err);
          }
        }
      }

      console.log(`[BatchProcessor] Collected results for batch ${batchId}`);

    } catch (error) {
      console.error('[BatchProcessor] Result collection error:', error);
    }
  }

  /**
   * 결과 파싱 (Prefill 고려)
   * Prefill로 '{' 또는 '['를 미리 넣었으므로 응답 앞에 붙여서 파싱
   */
  _parseResult(result, type) {
    if (result.result?.type !== 'succeeded') {
      return { success: false, error: result.result?.error?.message || 'Unknown error' };
    }

    try {
      const content = result.result.message?.content?.[0]?.text || '';

      // Prefill된 시작 문자 추가
      const prefix = type === 'tag_generation' ? '[' : '{';
      const fullContent = prefix + content;

      // JSON 파싱 시도
      const jsonMatch = fullContent.match(/\{[\s\S]*\}|\[[\s\S]*\]/);

      if (jsonMatch) {
        return {
          success: true,
          data: JSON.parse(jsonMatch[0]),
          raw: fullContent
        };
      }

      return { success: true, data: content, raw: content };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 개별 처리 (폴백) - Prefill 고려
   */
  async _processIndividually(req) {
    try {
      const params = this._buildRequestParams(req);
      const response = await this.client.messages.create(params);

      const content = response.content?.[0]?.text || '';

      // Prefill된 시작 문자 추가하여 파싱
      const prefix = req.type === 'tag_generation' ? '[' : '{';
      const fullContent = prefix + content;

      let data = content;
      try {
        const jsonMatch = fullContent.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // JSON 파싱 실패 시 원본 유지
      }

      const result = { success: true, data, raw: fullContent };
      this.batchResults.set(req.id, result);

      if (req.callback) {
        await req.callback(result);
      }

    } catch (error) {
      console.error(`[BatchProcessor] Individual processing failed: ${req.id}`, error);
      this.batchResults.set(req.id, { success: false, error: error.message });
    }
  }

  /**
   * 유틸: 대기
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 통계
   */
  getStats() {
    return {
      pendingCount: this.pendingRequests.length,
      resultsCount: this.batchResults.size,
      initialized: this.initialized
    };
  }

  /**
   * 대기열 비우기 (강제 실행)
   */
  async flush() {
    if (this.pendingRequests.length > 0) {
      await this._processBatch();
    }
  }
}

// 싱글톤
let globalBatchProcessor = null;

function getBatchProcessor() {
  if (!globalBatchProcessor) {
    globalBatchProcessor = new BatchProcessor();
    globalBatchProcessor.initialize().catch(err => {
      console.error('[BatchProcessor] Init error:', err);
    });
  }
  return globalBatchProcessor;
}

module.exports = {
  BatchProcessor,
  getBatchProcessor
};
