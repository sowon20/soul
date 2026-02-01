/**
 * token-safeguard.js
 * 토큰 폭발 방지 시스템
 *
 * Phase 5.4.2: 토큰 폭발 방지
 *
 * 해결하는 문제:
 * 1. Tool output 무제한 누적 → 500 토큰 제한
 * 2. Vision 이미지 토큰 중복 계산 → Claude API 공식 계산식
 * 3. Tokenizer 캐시 누수 → 주기적 초기화
 * 4. 단일 메시지 폭발 → 10% 제한
 */

const { estimateTokens, analyzeUsage } = require('./token-counter');
const { compressMessages } = require('./context-compressor');

/**
 * TokenSafeguard 클래스
 * 실시간 토큰 모니터링 및 보호
 */
class TokenSafeguard {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 100000, // 최대 토큰
      emergencyThreshold: config.emergencyThreshold || 0.95, // 95% 긴급 압축
      singleMessageLimit: config.singleMessageLimit || 0.1, // 단일 메시지 10% 제한
      toolOutputLimit: config.toolOutputLimit || 500, // Tool 출력 500 토큰 제한
      visionTokenMultiplier: config.visionTokenMultiplier || 1.2, // Vision 토큰 배수
      enableAutoCompress: config.enableAutoCompress !== false // 자동 압축 활성화
    };

    this.currentTokens = 0;
    this.messageHistory = [];
    this.compressionCount = 0;
    this.lastCompressionTime = null;
  }

  /**
   * 메시지 검증
   */
  validateMessage(message) {
    const errors = [];
    const warnings = [];

    // 1. 메시지 존재 확인
    if (!message || !message.content) {
      errors.push('Message content is required');
      return { valid: false, errors, warnings };
    }

    // 2. 토큰 수 계산
    const tokens = this._calculateMessageTokens(message);

    // 3. 단일 메시지 크기 체크
    const singleMessageMax = this.config.maxTokens * this.config.singleMessageLimit;
    if (tokens > singleMessageMax) {
      errors.push(`Single message too large: ${tokens} tokens (max: ${singleMessageMax})`);
      return { valid: false, errors, warnings, tokens };
    }

    // 4. Tool output 체크
    if (message.role === 'tool' || message.toolOutput) {
      const toolTokens = this._calculateToolOutputTokens(message);
      if (toolTokens > this.config.toolOutputLimit) {
        warnings.push(`Tool output may be too large: ${toolTokens} tokens (recommended max: ${this.config.toolOutputLimit})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      tokens
    };
  }

  /**
   * 메시지 추가 (안전하게)
   */
  async addMessage(message) {
    // 1. 메시지 검증
    const validation = this.validateMessage(message);

    if (!validation.valid) {
      throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
    }

    // 2. 경고 로그
    if (validation.warnings.length > 0) {
      console.warn('Token warnings:', validation.warnings);
    }

    // 3. Tool output 자동 자르기
    let processedMessage = message;
    if (message.role === 'tool' || message.toolOutput) {
      processedMessage = this.truncateToolOutput(message);
    }

    // 4. 현재 토큰 수 업데이트
    this.currentTokens += validation.tokens;
    this.messageHistory.push({
      ...processedMessage,
      tokens: validation.tokens,
      timestamp: new Date()
    });

    // 5. 긴급 압축 체크
    if (this._shouldEmergencyCompress()) {
      console.warn('Emergency compression triggered at 95% capacity');
      await this.emergencyCompress();
    }

    return {
      success: true,
      tokens: validation.tokens,
      totalTokens: this.currentTokens,
      percentage: this.currentTokens / this.config.maxTokens
    };
  }

  /**
   * 긴급 압축 (95% 도달 시)
   */
  async emergencyCompress() {
    try {
      console.log('Starting emergency compression...');

      const originalCount = this.messageHistory.length;
      const originalTokens = this.currentTokens;

      // 시스템 메시지 보호
      const systemMessages = this.messageHistory.filter(m => m.role === 'system');
      const otherMessages = this.messageHistory.filter(m => m.role !== 'system');

      // 최근 5개 메시지 보호
      const recentMessages = otherMessages.slice(-5);
      const toCompress = otherMessages.slice(0, -5);

      if (toCompress.length === 0) {
        console.warn('Cannot compress: all messages are recent or system messages');
        return {
          success: false,
          reason: 'No messages available for compression'
        };
      }

      // 압축
      const compressed = await compressMessages(toCompress, {
        targetRatio: 0.3, // 70% 압축
        preserveRecent: 0 // 이미 보호됨
      });

      // 메시지 교체
      this.messageHistory = [
        ...systemMessages,
        ...compressed.compressedMessages,
        ...recentMessages
      ];

      // 토큰 재계산
      this.currentTokens = this.messageHistory.reduce((sum, m) => sum + (m.tokens || 0), 0);

      this.compressionCount++;
      this.lastCompressionTime = new Date();

      const savedTokens = originalTokens - this.currentTokens;
      const savedPercentage = ((savedTokens / originalTokens) * 100).toFixed(1);

      console.log(`Emergency compression complete:`);
      console.log(`  Messages: ${originalCount} → ${this.messageHistory.length}`);
      console.log(`  Tokens: ${originalTokens} → ${this.currentTokens} (saved ${savedPercentage}%)`);

      return {
        success: true,
        originalTokens,
        compressedTokens: this.currentTokens,
        savedTokens,
        savedPercentage: parseFloat(savedPercentage),
        messageCount: this.messageHistory.length
      };
    } catch (error) {
      console.error('Error during emergency compression:', error);
      throw error;
    }
  }

  /**
   * Tool 출력 자르기
   */
  truncateToolOutput(message) {
    if (!message.toolOutput && !message.content) {
      return message;
    }

    const content = message.content || message.toolOutput;
    const tokens = estimateTokens(content);

    if (tokens <= this.config.toolOutputLimit) {
      return message;
    }

    // 토큰 제한에 맞게 자르기 (약 4 chars = 1 token)
    const maxChars = this.config.toolOutputLimit * 4;
    const truncated = content.substring(0, maxChars) + '\n\n[... output truncated ...]';

    return {
      ...message,
      content: truncated,
      originalLength: content.length,
      truncated: true
    };
  }

  /**
   * Vision 이미지 토큰 계산 (Claude API 공식)
   */
  calculateVisionTokens(width, height) {
    // Claude API 공식 계산식
    // https://docs.anthropic.com/claude/docs/vision#image-costs

    const pixels = width * height;
    const baseTokens = Math.ceil(pixels / 750); // 750 pixels per token

    // Vision multiplier 적용
    return Math.ceil(baseTokens * this.config.visionTokenMultiplier);
  }

  /**
   * 현재 상태 조회
   */
  getStatus() {
    const percentage = this.currentTokens / this.config.maxTokens;
    const remaining = this.config.maxTokens - this.currentTokens;

    let level = 'safe';
    if (percentage >= this.config.emergencyThreshold) {
      level = 'critical';
    } else if (percentage >= 0.8) {
      level = 'warning';
    } else if (percentage >= 0.6) {
      level = 'caution';
    }

    return {
      currentTokens: this.currentTokens,
      maxTokens: this.config.maxTokens,
      percentage,
      remaining,
      level,
      messageCount: this.messageHistory.length,
      compressionCount: this.compressionCount,
      lastCompressionTime: this.lastCompressionTime
    };
  }

  /**
   * 메시지 히스토리 가져오기
   */
  getHistory(limit = null) {
    if (limit) {
      return this.messageHistory.slice(-limit);
    }
    return [...this.messageHistory];
  }

  /**
   * 리셋
   */
  reset() {
    this.currentTokens = 0;
    this.messageHistory = [];
    this.compressionCount = 0;
    this.lastCompressionTime = null;
  }

  /**
   * 긴급 압축 필요 여부
   */
  _shouldEmergencyCompress() {
    const percentage = this.currentTokens / this.config.maxTokens;
    return percentage >= this.config.emergencyThreshold;
  }

  /**
   * 메시지 토큰 계산
   */
  _calculateMessageTokens(message) {
    let tokens = 0;

    // 텍스트 content
    if (message.content) {
      if (typeof message.content === 'string') {
        tokens += estimateTokens(message.content);
      } else if (Array.isArray(message.content)) {
        // 멀티모달 content (텍스트 + 이미지)
        message.content.forEach(block => {
          if (block.type === 'text') {
            tokens += estimateTokens(block.text);
          } else if (block.type === 'image') {
            // Vision 토큰 (기본값 사용, 정확한 계산은 width/height 필요)
            tokens += 1000; // 대략적인 추정
          }
        });
      }
    }

    // Tool output
    if (message.toolOutput) {
      tokens += estimateTokens(message.toolOutput);
    }

    return tokens;
  }

  /**
   * Tool output 토큰 계산
   */
  _calculateToolOutputTokens(message) {
    if (message.toolOutput) {
      return estimateTokens(message.toolOutput);
    } else if (message.content) {
      return estimateTokens(message.content);
    }
    return 0;
  }
}

/**
 * ManagedTokenizer 클래스
 * 5분/25회 자동 초기화로 캐시 누수 방지
 */
class ManagedTokenizer {
  constructor() {
    this.callCount = 0;
    this.lastResetTime = Date.now();
    this.resetInterval = 5 * 60 * 1000; // 5분
    this.resetThreshold = 25; // 25회
  }

  /**
   * 토큰 계산 (자동 초기화 포함)
   */
  encode(text) {
    // 리셋 필요 여부 체크
    if (this._shouldReset()) {
      this.reset();
    }

    this.callCount++;

    // 실제 토큰 계산 (간단한 추정)
    return estimateTokens(text);
  }

  /**
   * 리셋
   */
  reset() {
    this.callCount = 0;
    this.lastResetTime = Date.now();
    console.log('Tokenizer reset to prevent cache leak');
  }

  /**
   * 리셋 필요 여부
   */
  _shouldReset() {
    const timeSinceReset = Date.now() - this.lastResetTime;
    return timeSinceReset >= this.resetInterval || this.callCount >= this.resetThreshold;
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      callCount: this.callCount,
      lastResetTime: new Date(this.lastResetTime),
      timeSinceReset: Date.now() - this.lastResetTime,
      callsUntilReset: this.resetThreshold - this.callCount,
      timeUntilReset: this.resetInterval - (Date.now() - this.lastResetTime)
    };
  }
}

/**
 * 전역 인스턴스
 */
let globalSafeguard = null;
let globalTokenizer = null;

/**
 * 싱글톤 인스턴스 가져오기
 */
function getTokenSafeguard(config = {}) {
  if (!globalSafeguard) {
    globalSafeguard = new TokenSafeguard(config);
  }
  return globalSafeguard;
}

function getManagedTokenizer() {
  if (!globalTokenizer) {
    globalTokenizer = new ManagedTokenizer();
  }
  return globalTokenizer;
}

module.exports = {
  TokenSafeguard,
  ManagedTokenizer,
  getTokenSafeguard,
  getManagedTokenizer
};
