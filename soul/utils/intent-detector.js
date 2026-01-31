/**
 * intent-detector.js
 * 자연어 명령의 의도를 감지하고 분류하는 시스템
 *
 * Phase: Week 1 - 자연어 제어 기초
 */

class IntentDetector {
  constructor() {
    // 의도 카테고리
    this.intentCategories = {
      // 메모리/검색 관련
      MEMORY_SEARCH: 'memory_search',
      MEMORY_VIEW: 'memory_view',
      MEMORY_DELETE: 'memory_delete',

      // 설정 관련
      SETTING_CHANGE: 'setting_change',
      SETTING_VIEW: 'setting_view',

      // UI/패널 관련
      PANEL_OPEN: 'panel_open',
      PANEL_CLOSE: 'panel_close',
      PANEL_TOGGLE: 'panel_toggle',
      PANEL_SWITCH: 'panel_switch',

      // 대화방 관련
      CONVERSATION_NEW: 'conversation_new',
      CONVERSATION_SWITCH: 'conversation_switch',
      CONVERSATION_DELETE: 'conversation_delete',

      // 일반 대화
      CONVERSATION: 'conversation',

      // 기타
      HELP: 'help',
      UNKNOWN: 'unknown'
    };

    // 패턴 정의
    this.patterns = this.initializePatterns();

    // 설정
    this.config = {
      minConfidence: 0.7,
      enableFuzzyMatching: true,
      enableContextAware: true
    };
  }

  /**
   * 패턴 초기화
   */
  initializePatterns() {
    return {
      // 메모리 검색
      memory_search: [
        {
          pattern: /(.+)\s*(찾아|검색|보여|알려|find|search)/i,
          weight: 0.9,
          keywords: ['찾아', '검색', '보여', '알려', 'find', 'search'],
          examples: ['React 대화 찾아줘', '어제 얘기 검색해줘']
        },
        {
          pattern: /(저번에|예전에|전에|이전에|과거)\s*(.+)(얘기|대화|말|언급)/i,
          weight: 0.85,
          keywords: ['저번에', '예전에', '전에', '이전에'],
          examples: ['저번에 얘기했던 MongoDB', '예전에 언급한 Docker']
        }
      ],

      // 메모리 보기
      memory_view: [
        {
          pattern: /(메모리|기억|대화)\s*(목록|리스트|전체|다|모두)\s*(보여|show)/i,
          weight: 0.9,
          keywords: ['메모리', '기억', '대화', '목록', '리스트'],
          examples: ['메모리 전체 보여줘', '대화 목록 show']
        },
        {
          pattern: /(최근|recent)\s*(\d+)?(개)?\s*(대화|메모리)/i,
          weight: 0.85,
          keywords: ['최근', 'recent', '대화'],
          examples: ['최근 10개 대화', 'recent 5 memories']
        }
      ],

      // 메모리 삭제
      memory_delete: [
        {
          pattern: /(삭제|지워|delete|remove)/i,
          weight: 0.95,
          keywords: ['삭제', '지워', 'delete', 'remove', '대화', '메모리'],
          examples: ['이 대화 삭제해', '메모리 지워줘']
        }
      ],

      // 설정 변경
      setting_change: [
        {
          pattern: /(설정|config|모델|model)\s*(바꿔|변경|change|set)/i,
          weight: 0.9,
          keywords: ['설정', '바꿔', '변경', 'config', 'change'],
          examples: ['모델 바꿔줘', 'config change']
        },
        {
          pattern: /(.+)\s*(끄|켜|활성화|비활성화|enable|disable)/i,
          weight: 0.85,
          keywords: ['끄', '켜', '활성화', '비활성화'],
          examples: ['자동 저장 켜줘', 'auto save enable']
        }
      ],

      // 설정 보기
      setting_view: [
        {
          pattern: /(설정|config|옵션)\s*(보여|확인|show|view)/i,
          weight: 0.9,
          keywords: ['설정', '옵션', 'config', '보여'],
          examples: ['설정 보여줘', 'show config']
        }
      ],

      // 패널 열기
      panel_open: [
        {
          pattern: /(메모리|설정|투두|todo|memory|settings?|터미널|terminal|검색|search|파일|file|mcp|아카이브|archive|알림|notification|컨텍스트|context)\s*(패널|창|화면|panel)?\s*(열|보여|띄워|show|open)/i,
          weight: 0.9,
          keywords: ['패널', '창', '열', 'open', 'show', '보여', '띄워'],
          examples: ['메모리 패널 열어', 'todo show', '투두 보여줘', '터미널 띄워']
        },
        {
          pattern: /(투두|todo|메모리|memory|터미널|terminal|검색|search).*(?:랑|과|와|같이|with)\s*(투두|todo|메모리|memory|터미널|terminal|검색|search)/i,
          weight: 0.95,
          keywords: ['랑', '같이', '분할', 'with'],
          examples: ['투두랑 터미널 같이', 'todo with terminal']
        }
      ],

      // 패널 닫기
      panel_close: [
        {
          pattern: /(패널|창|화면|panel)\s*(닫|꺼|close|hide)/i,
          weight: 0.9,
          keywords: ['닫', '꺼', 'close', 'hide'],
          examples: ['패널 닫아', 'close panel', '창 꺼']
        },
        {
          pattern: /(닫아|꺼|close|hide)/i,
          weight: 0.7,
          keywords: ['닫아', '꺼'],
          examples: ['닫아', '꺼줘']
        }
      ],

      // 패널 토글 (새로 추가)
      panel_toggle: [
        {
          pattern: /(투두|todo|메모리|memory|터미널|terminal)\s*(토글|toggle)/i,
          weight: 0.95,
          keywords: ['토글', 'toggle'],
          examples: ['투두 토글', 'toggle terminal']
        }
      ],

      // 패널 전환
      panel_switch: [
        {
          pattern: /(탭|tab|분할|split|팝업|popup|가로|세로|그리드|grid)\s*(으로|로|모드|으로\s*바꿔|mode)/i,
          weight: 0.9,
          keywords: ['탭', 'tab', '분할', 'split', '팝업', 'popup', '가로', '세로', '그리드'],
          examples: ['탭으로 바꿔', 'split mode', '가로로', '세로 분할']
        }
      ],

      // 새 대화방
      conversation_new: [
        {
          pattern: /(새|new)\s*(대화|채팅|conversation|chat)/i,
          weight: 0.9,
          keywords: ['새', 'new', '대화', 'conversation'],
          examples: ['새 대화 시작', 'new chat']
        }
      ],

      // 대화방 전환
      conversation_switch: [
        {
          pattern: /(대화|채팅|conversation)\s*(.+)?(전환|바꿔|switch)/i,
          weight: 0.85,
          keywords: ['대화', '전환', '바꿔', 'switch'],
          examples: ['이전 대화로 전환', 'switch conversation']
        }
      ],

      // 도움말
      help: [
        {
          pattern: /(도움말|help|사용법|how\s*to)/i,
          weight: 0.95,
          keywords: ['도움말', 'help', '사용법'],
          examples: ['도움말', 'help me']
        }
      ]
    };
  }

  /**
   * 메인 의도 감지 함수
   * @param {string} message - 사용자 입력 메시지
   * @param {Object} context - 선택적 컨텍스트 (이전 대화, 현재 패널 등)
   * @returns {Object} 감지된 의도 정보
   */
  async detect(message, context = {}) {
    if (!message || typeof message !== 'string') {
      return this.createResult(this.intentCategories.UNKNOWN, 0, null, 'Invalid input');
    }

    const normalizedMessage = message.trim();

    // 1. 패턴 매칭
    const patternResults = this.matchPatterns(normalizedMessage);

    // 2. 키워드 분석
    const keywordResults = this.analyzeKeywords(normalizedMessage);

    // 3. 컨텍스트 분석 (선택적)
    let contextBoost = 0;
    if (this.config.enableContextAware && context) {
      contextBoost = this.analyzeContext(normalizedMessage, context);
    }

    // 4. 결과 통합
    const combinedResults = this.combineResults(patternResults, keywordResults, contextBoost);

    // 5. 최고 점수 선택
    const topIntent = this.selectTopIntent(combinedResults);

    // 6. 엔티티 추출
    const entities = this.extractEntities(normalizedMessage, topIntent.intent);

    return this.createResult(
      topIntent.intent,
      topIntent.confidence,
      entities,
      topIntent.reason,
      combinedResults
    );
  }

  /**
   * 패턴 매칭
   */
  matchPatterns(message) {
    const results = {};

    for (const [intent, patternList] of Object.entries(this.patterns)) {
      let maxScore = 0;
      let matchedPattern = null;

      for (const patternDef of patternList) {
        if (patternDef.pattern.test(message)) {
          const score = patternDef.weight;
          if (score > maxScore) {
            maxScore = score;
            matchedPattern = patternDef;
          }
        }
      }

      if (maxScore > 0) {
        results[intent] = {
          score: maxScore,
          source: 'pattern',
          matchedPattern: matchedPattern
        };
      }
    }

    return results;
  }

  /**
   * 키워드 분석
   */
  analyzeKeywords(message) {
    const results = {};
    const messageLower = message.toLowerCase();

    for (const [intent, patternList] of Object.entries(this.patterns)) {
      let keywordCount = 0;
      let totalKeywords = 0;

      for (const patternDef of patternList) {
        totalKeywords += patternDef.keywords.length;

        for (const keyword of patternDef.keywords) {
          if (messageLower.includes(keyword.toLowerCase())) {
            keywordCount++;
          }
        }
      }

      if (keywordCount > 0 && totalKeywords > 0) {
        const score = (keywordCount / totalKeywords) * 0.7; // 최대 0.7점
        results[intent] = {
          score: score,
          source: 'keyword',
          keywordCount: keywordCount
        };
      }
    }

    return results;
  }

  /**
   * 컨텍스트 분석
   */
  analyzeContext(message, context) {
    let boost = 0;

    // 현재 열린 패널이 있으면 패널 관련 의도 부스트
    if (context.currentPanel) {
      if (message.includes('닫') || message.includes('close')) {
        boost += 0.1;
      }
    }

    // 이전 메시지가 질문이었으면 대화 의도 부스트
    if (context.previousMessageWasQuestion) {
      boost += 0.05;
    }

    return boost;
  }

  /**
   * 결과 통합
   */
  combineResults(patternResults, keywordResults, contextBoost) {
    const combined = {};

    // 모든 의도 수집
    const allIntents = new Set([
      ...Object.keys(patternResults),
      ...Object.keys(keywordResults)
    ]);

    for (const intent of allIntents) {
      const patternScore = patternResults[intent]?.score || 0;
      const keywordScore = keywordResults[intent]?.score || 0;

      // 가중 평균 (패턴이 있으면 패턴 우선, 없으면 키워드만)
      let baseScore;
      if (patternScore > 0) {
        // 패턴 매칭 시: 패턴 90%, 키워드 10%
        baseScore = (patternScore * 0.9) + (keywordScore * 0.1);
      } else {
        // 키워드만: 키워드 100%
        baseScore = keywordScore;
      }
      const finalScore = Math.min(1.0, baseScore + contextBoost);

      combined[intent] = {
        score: finalScore,
        patternScore,
        keywordScore,
        contextBoost,
        sources: {
          pattern: patternResults[intent],
          keyword: keywordResults[intent]
        }
      };
    }

    return combined;
  }

  /**
   * 최고 점수 의도 선택
   */
  selectTopIntent(results) {
    let topIntent = this.intentCategories.UNKNOWN;
    let topScore = 0;
    let reason = 'No patterns matched';

    for (const [intent, data] of Object.entries(results)) {
      if (data.score > topScore) {
        topScore = data.score;
        topIntent = intent;

        if (data.sources.pattern) {
          reason = `Pattern matched: ${data.sources.pattern.matchedPattern?.examples?.[0] || 'unknown'}`;
        } else if (data.sources.keyword) {
          reason = `Keywords matched: ${data.sources.keyword.keywordCount} keywords`;
        }
      }
    }

    // 신뢰도가 너무 낮으면 UNKNOWN
    if (topScore < this.config.minConfidence) {
      // 하지만 일반 대화는 항상 가능
      topIntent = this.intentCategories.CONVERSATION;
      topScore = 0.5;
      reason = 'Low confidence, treated as conversation';
    }

    return { intent: topIntent, confidence: topScore, reason };
  }

  /**
   * 엔티티 추출
   */
  extractEntities(message, intent) {
    const entities = {};

    // 숫자 추출
    const numbers = message.match(/\d+/g);
    if (numbers) {
      entities.numbers = numbers.map(n => parseInt(n, 10));
    }

    // 날짜/시간 키워드
    const timeKeywords = ['오늘', '어제', '저번', '최근', '예전', 'today', 'yesterday', 'recent'];
    for (const keyword of timeKeywords) {
      if (message.toLowerCase().includes(keyword)) {
        entities.timeReference = keyword;
        break;
      }
    }

    // 의도별 특수 엔티티
    if (intent === 'memory_search') {
      // 검색 쿼리 추출
      const queryMatch = message.match(/(.+?)\s*(찾아|검색|보여)/);
      if (queryMatch) {
        entities.query = queryMatch[1].trim();
      }
    }

    if (intent === 'panel_open') {
      // 패널 타입 추출
      const panelTypes = ['메모리', '설정', '투두', 'memory', 'settings', 'todo'];
      for (const type of panelTypes) {
        if (message.toLowerCase().includes(type.toLowerCase())) {
          entities.panelType = type;
          break;
        }
      }
    }

    if (intent === 'panel_switch') {
      // 모드 추출
      const modes = ['탭', 'tab', '분할', 'split', '팝업', 'popup'];
      for (const mode of modes) {
        if (message.toLowerCase().includes(mode)) {
          entities.mode = mode;
          break;
        }
      }
    }

    if (intent === 'setting_change') {
      // 설정 이름 추출
      const settingMatch = message.match(/(.+?)\s*(바꿔|변경|켜|끄)/);
      if (settingMatch) {
        entities.settingName = settingMatch[1].trim();
      }

      // on/off 추출
      if (message.includes('켜') || message.includes('enable') || message.includes('활성화')) {
        entities.action = 'enable';
      } else if (message.includes('끄') || message.includes('disable') || message.includes('비활성화')) {
        entities.action = 'disable';
      }
    }

    return entities;
  }

  /**
   * 결과 객체 생성
   */
  createResult(intent, confidence, entities, reason, allResults = null) {
    return {
      intent,
      confidence: Math.round(confidence * 100) / 100,
      entities: entities || {},
      reason,
      isCommand: intent !== this.intentCategories.CONVERSATION && intent !== this.intentCategories.UNKNOWN,
      allResults: allResults ? Object.entries(allResults)
        .map(([i, data]) => ({ intent: i, confidence: data.score }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3) // 상위 3개만
        : []
    };
  }

  /**
   * 의도에 대한 액션 제안
   */
  suggestAction(intentResult) {
    const { intent, entities } = intentResult;

    const suggestions = {
      memory_search: {
        action: 'search_memory',
        params: { query: entities.query || '', timeReference: entities.timeReference },
        endpoint: '/api/search/smart'
      },
      memory_view: {
        action: 'list_memories',
        params: { limit: entities.numbers?.[0] || 10 },
        endpoint: '/api/memory/list'
      },
      memory_delete: {
        action: 'delete_memory',
        params: {},
        endpoint: '/api/memory/delete',
        requiresConfirmation: true
      },
      setting_change: {
        action: 'update_setting',
        params: { setting: entities.settingName, value: entities.action },
        endpoint: '/api/settings/update'
      },
      setting_view: {
        action: 'get_settings',
        params: {},
        endpoint: '/api/settings'
      },
      panel_open: {
        action: 'open_panel',
        params: { panelType: entities.panelType || 'memory' },
        endpoint: null // UI only
      },
      panel_close: {
        action: 'close_panel',
        params: {},
        endpoint: null // UI only
      },
      panel_switch: {
        action: 'switch_panel_mode',
        params: { mode: entities.mode || 'tab' },
        endpoint: null // UI only
      },
      help: {
        action: 'show_help',
        params: {},
        endpoint: '/api/help'
      },
      conversation: {
        action: 'continue_conversation',
        params: {},
        endpoint: '/api/chat'
      }
    };

    return suggestions[intent] || suggestions.conversation;
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 통계 정보
   */
  getStats() {
    const totalIntents = Object.keys(this.intentCategories).length;
    const totalPatterns = Object.values(this.patterns).reduce((sum, list) => sum + list.length, 0);

    return {
      totalIntents,
      totalPatterns,
      config: this.config,
      categories: this.intentCategories
    };
  }
}

module.exports = new IntentDetector();
