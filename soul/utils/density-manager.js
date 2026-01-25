/**
 * density-manager.js
 * 컨텍스트 윈도우 밀도 관리 (Phase 1.5.2)
 * 
 * 80/10/10 비율:
 * - 80%: 원문 (densityLevel 0)
 * - 10%: 느슨한 압축 (densityLevel 1)
 * - 10%: 더 압축 (densityLevel 2)
 */

const { getAlbaWorker } = require('./alba-worker');

class DensityManager {
  constructor(config = {}) {
    this.config = {
      maxContextTokens: config.maxContextTokens || 8000,  // 컨텍스트 최대 토큰
      ratios: config.ratios || { level0: 0.8, level1: 0.1, level2: 0.1 },
      compressionThreshold: config.compressionThreshold || 0.9, // 90% 차면 압축 시작
      minMessagesForCompression: config.minMessagesForCompression || 10,
      ...config
    };
  }

  /**
   * 토큰 예산 계산
   */
  getTokenBudgets() {
    const { maxContextTokens, ratios } = this.config;
    return {
      level0: Math.floor(maxContextTokens * ratios.level0),
      level1: Math.floor(maxContextTokens * ratios.level1),
      level2: Math.floor(maxContextTokens * ratios.level2)
    };
  }

  /**
   * 압축 필요 여부 판단
   */
  needsCompression(messages) {
    if (messages.length < this.config.minMessagesForCompression) {
      return { needed: false, reason: 'Not enough messages' };
    }

    const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    const threshold = this.config.maxContextTokens * this.config.compressionThreshold;

    if (totalTokens > threshold) {
      return {
        needed: true,
        reason: `Token limit approaching: ${totalTokens}/${this.config.maxContextTokens}`,
        currentTokens: totalTokens,
        overflow: totalTokens - this.getTokenBudgets().level0
      };
    }

    return { needed: false, reason: 'Within limits' };
  }

  /**
   * 메시지 분류 (densityLevel별)
   */
  categorizeMessages(messages) {
    const budgets = this.getTokenBudgets();
    
    // 역순으로 정렬 (최신 먼저)
    const sorted = [...messages].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    const result = {
      level0: [],  // 원문 유지
      level1: [],  // 느슨한 압축 대상
      level2: [],  // 더 압축 대상
      tokenUsage: { level0: 0, level1: 0, level2: 0 }
    };

    let currentLevel = 0;
    let currentBudget = budgets.level0;

    for (const msg of sorted) {
      const tokens = msg.tokens || 0;
      
      // 현재 레벨 예산 초과 시 다음 레벨로
      while (result.tokenUsage[`level${currentLevel}`] + tokens > currentBudget && currentLevel < 2) {
        currentLevel++;
        currentBudget = budgets[`level${currentLevel}`];
      }

      const levelKey = `level${currentLevel}`;
      result[levelKey].push(msg);
      result.tokenUsage[levelKey] += tokens;
    }

    // 원래 순서로 복원
    result.level0.reverse();
    result.level1.reverse();
    result.level2.reverse();

    return result;
  }

  /**
   * 압축 실행
   */
  async compressMessages(messages, targetLevel) {
    const alba = await getAlbaWorker();
    
    if (targetLevel === 1) {
      // 느슨한 압축: 대화 쌍 단위로
      const compressed = await alba.compressLevel1(messages);
      return {
        original: messages,
        compressed,
        densityLevel: 1,
        tokenSaved: this._estimateTokenSaved(messages, compressed)
      };
    } else if (targetLevel === 2) {
      // 더 압축: 전체를 하나로
      const compressed = await alba.compressLevel2(messages);
      return {
        original: messages,
        compressed,
        densityLevel: 2,
        tokenSaved: this._estimateTokenSaved(messages, compressed)
      };
    }

    return { original: messages, compressed: null, densityLevel: 0 };
  }

  /**
   * 컨텍스트 빌드 (80/10/10 적용)
   */
  async buildContext(messages) {
    const check = this.needsCompression(messages);
    
    if (!check.needed) {
      // 압축 불필요: 모두 원문으로
      return {
        messages: messages.map(m => ({ ...m, densityLevel: 0 })),
        compressed: false,
        stats: { level0: messages.length, level1: 0, level2: 0 }
      };
    }

    // 압축 필요: 분류 후 압축
    const categorized = this.categorizeMessages(messages);
    const result = [];

    // Level 0: 원문 유지
    for (const msg of categorized.level0) {
      result.push({ ...msg, densityLevel: 0 });
    }

    // Level 1: 느슨한 압축
    if (categorized.level1.length > 0) {
      const { compressed } = await this.compressMessages(categorized.level1, 1);
      if (compressed) {
        result.push({
          role: 'system',
          content: `[이전 대화 요약]\n${compressed}`,
          densityLevel: 1,
          originalCount: categorized.level1.length
        });
      }
    }

    // Level 2: 더 압축
    if (categorized.level2.length > 0) {
      const { compressed } = await this.compressMessages(categorized.level2, 2);
      if (compressed) {
        result.push({
          role: 'system',
          content: `[오래된 대화 요약]\n${compressed}`,
          densityLevel: 2,
          originalCount: categorized.level2.length
        });
      }
    }

    // 시간순 정렬
    result.sort((a, b) => {
      if (!a.timestamp) return -1;
      if (!b.timestamp) return 1;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    return {
      messages: result,
      compressed: true,
      stats: {
        level0: categorized.level0.length,
        level1: categorized.level1.length,
        level2: categorized.level2.length
      }
    };
  }

  /**
   * 토큰 절약량 추정
   */
  _estimateTokenSaved(original, compressed) {
    const originalTokens = original.reduce((sum, m) => sum + (m.tokens || 0), 0);
    const compressedTokens = compressed ? Math.ceil(compressed.length / 4) : 0;
    return originalTokens - compressedTokens;
  }
}

// 싱글톤
let globalDensityManager = null;

function getDensityManager(config = {}) {
  if (!globalDensityManager) {
    globalDensityManager = new DensityManager(config);
  }
  return globalDensityManager;
}

function resetDensityManager() {
  globalDensityManager = null;
}

module.exports = {
  DensityManager,
  getDensityManager,
  resetDensityManager
};
