/**
 * tool-intent-detector.js
 * {need} 모드 폴백: 사용자 메시지에서 도구 사용 의도를 감지
 *
 * AI가 {need} 태그를 출력하지 않을 때 서버측에서 보완하는 안전망.
 * 키워드/패턴 기반으로 동작하며, 도구 정의에서 자동으로 키워드를 추출한다.
 */

class ToolIntentDetector {
  constructor(toolDefinitions = []) {
    // 도구별 수동 인텐트 맵 (한국어 + 영어)
    this.manualIntents = {
      get_profile: {
        keywords: ['프로필', '이름', '나이', '생일', '직업', '취미', '성별', 'profile', 'name', 'age'],
        patterns: [
          /(?:내|나|제)\s*(?:이름|나이|생일|직업|프로필)/,
          /(?:누구|뭐|뭘|어떤)\s*(?:야|인지|인가)/,
          /프로필\s*(?:보여|알려|조회|확인)/,
          /(?:나|내)\s*(?:에\s*대해|정보)/,
        ],
        needTemplate: '사용자의 프로필 정보 조회',
      },
      recall_memory: {
        keywords: ['기억', '어제', '저번', '지난번', '예전', '과거', '이전', '며칠전', '작년', '지난주', 'remember', 'memory', 'recall'],
        patterns: [
          /(?:기억|어제|저번에?|지난번|예전에?|과거에?|이전에?|그때).*(?:뭐|뭘|무엇|어떤|무슨)/,
          /(?:뭐|뭘)\s*(?:했|말했|얘기|이야기)/,
          /(?:말한|했던|얘기한)\s*(?:거|것|내용)/,
          /(?:기억)\s*(?:나|해|하|있)/,
          /(?:우리|너|나).*(?:언제|뭐).*(?:했|말)/,
        ],
        needTemplate: '관련 기억/대화 검색: {query}',
      },
      update_profile: {
        keywords: [],
        patterns: [
          /(?:내|나|제)\s*(?:이름|나이|생일|직업).*(?:야|이야|거든|인데|이거든)/,
          /(?:이름|나이|생일|직업).*(?:바꿔|변경|수정|업데이트)/,
        ],
        needTemplate: '사용자 프로필 업데이트',
      },
      execute_command: {
        keywords: ['명령', '실행', '터미널', '커맨드', 'command', 'execute', 'run', 'shell'],
        patterns: [
          /(?:명령|커맨드|command)\s*(?:실행|해줘|해)/,
          /(?:실행|run)\s*(?:해|해줘)/,
          /(?:터미널|terminal).*(?:실행|해|쳐)/,
        ],
        needTemplate: '명령 실행: {command}',
      },
    };

    // 동작 기반 복합 인텐트 (하나의 동작이 여러 도구를 필요로 하는 경우)
    // 도구 이름은 런타임에 매칭 (MCP 접두사 무시)
    this.compositeIntents = [
      {
        keywords: ['체크', '완료', '끝', 'check', 'done', 'complete', '토글', 'toggle'],
        minKeywordHits: 1,  // 체크/토글은 단독으로도 의미 명확
        patterns: [
          /(?:투두|todo|할일|할 일).*(?:체크|완료|끝|done|check|토글)/,
          /(?:체크|완료|끝|done|check|토글).*(?:해줘|해봐|해|하자|해라)/,
          /(?:이거|그거|항목).*(?:체크|완료|끝|done|check)/,
        ],
        // 읽기 + 토글 두 개 필요
        needTemplates: ['투두 목록 읽기', '투두 항목 체크/토글: {content}'],
        toolHints: ['read_todo', 'toggle_task'],
      },
      {
        keywords: ['투두', 'todo', '할일'],
        patterns: [
          /(?:투두|todo|할일|할 일).*(?:추가|넣어|넣|적어|add)/,
          /(?:추가|넣어|add).*(?:투두|todo|할일)/,
        ],
        needTemplates: ['투두에 할 일 추가: {content}'],
        toolHints: ['add_task'],
      },
      {
        keywords: ['메모', 'memo'],
        patterns: [
          /(?:메모|memo).*(?:써|적어|남겨|write|수정|edit)/,
          /(?:써|적어|남겨|write).*(?:메모|memo)/,
        ],
        needTemplates: ['메모 작성/수정: {content}'],
        toolHints: ['write_memo', 'read_memo'],
      },
    ];

    // 도구 정의에서 자동 키워드 추출 (수동 맵에 없는 도구용)
    this._enrichFromDefinitions(toolDefinitions);
  }

  /**
   * 도구 정의의 description에서 키워드를 자동 추출하여 보강
   */
  _enrichFromDefinitions(toolDefinitions) {
    for (const tool of toolDefinitions) {
      if (!tool.name || !tool.description) continue;
      if (this.manualIntents[tool.name]) continue; // 수동 맵 우선

      // description에서 한국어 명사 추출 (간단한 방법)
      const desc = tool.description;
      const words = desc.match(/[\uAC00-\uD7AF]+/g) || [];
      const keywords = words.filter(w => w.length >= 2);

      if (keywords.length > 0) {
        this.manualIntents[tool.name] = {
          keywords,
          patterns: [],
          needTemplate: desc.substring(0, 50),
        };
      }
    }
  }

  /**
   * 사용자 메시지에서 도구 사용 의도 감지
   * @param {string} userMessage
   * @returns {{ detected: boolean, suggestedNeeds: string[], matches: Array }}
   */
  detect(userMessage) {
    if (!userMessage || typeof userMessage !== 'string') {
      return { detected: false, suggestedNeeds: [], matches: [] };
    }

    const msg = userMessage.trim();
    const matches = [];

    // 짧은 인사/감정 메시지는 도구 불필요
    if (this._isSimpleChat(msg)) {
      return { detected: false, suggestedNeeds: [], matches: [] };
    }

    for (const [toolName, intent] of Object.entries(this.manualIntents)) {
      let score = 0;
      let matched = false;

      // 1. 패턴 매칭 (높은 가중치)
      for (const pattern of intent.patterns) {
        if (pattern.test(msg)) {
          score = Math.max(score, 0.9);
          matched = true;
          break;
        }
      }

      // 2. 키워드 매칭 (낮은 가중치, 누적)
      let keywordHits = 0;
      for (const kw of intent.keywords) {
        if (msg.includes(kw)) {
          keywordHits++;
        }
      }
      if (keywordHits > 0) {
        const kwScore = Math.min(0.8, 0.3 + keywordHits * 0.15);
        score = Math.max(score, kwScore);
        matched = true;
      }

      if (matched && score >= 0.4) {
        // 템플릿에 컨텍스트 삽입
        let needText = intent.needTemplate;
        if (needText.includes('{query}') || needText.includes('{content}') || needText.includes('{command}')) {
          needText = needText
            .replace('{query}', msg)
            .replace('{content}', msg)
            .replace('{command}', msg);
        }

        matches.push({ toolName, score, needText });
      }
    }

    // 복합 인텐트 체크 (하나의 동작이 여러 도구를 필요로 하는 경우)
    for (const composite of this.compositeIntents) {
      let matched = false;
      for (const pattern of composite.patterns) {
        if (pattern.test(msg)) { matched = true; break; }
      }
      if (!matched) {
        let hits = 0;
        for (const kw of composite.keywords) {
          if (msg.includes(kw)) hits++;
        }
        const minHits = composite.minKeywordHits || 2;
        if (hits >= minHits) matched = true;
      }
      if (matched) {
        for (const tmpl of composite.needTemplates) {
          const needText = tmpl.replace('{content}', msg);
          // 중복 방지
          if (!matches.some(m => m.needText === needText)) {
            matches.push({ toolName: composite.toolHints.join('+'), score: 0.95, needText });
          }
        }
      }
    }

    // 점수 순 정렬, 상위 5개
    matches.sort((a, b) => b.score - a.score);
    const top = matches.slice(0, 5);

    return {
      detected: top.length > 0,
      suggestedNeeds: top.map(m => m.needText),
      matches: top,
    };
  }

  /**
   * 간단한 인사/감정 메시지인지 판별
   */
  _isSimpleChat(msg) {
    // 5자 이하의 짧은 메시지
    if (msg.length <= 5) {
      const simplePatterns = /^(ㅋ+|ㅎ+|ㅇㅇ|넵|네|응|ㅇ|ok|ㅇㅋ|굿|좋아|안녕|하이|hi|hey|hello|thanks|고마워|감사|bye|ㅂㅂ)$/i;
      if (simplePatterns.test(msg)) return true;
    }

    // 10자 이하이고 특수 키워드가 없으면 대화로 간주하지 않음 (도구 필요할 수도)
    return false;
  }
}

module.exports = { ToolIntentDetector };
