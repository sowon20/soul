/**
 * 지능형 검색 유틸리티
 * 자연어 검색어를 해석하고 시간 표현을 처리
 */
class SmartSearchUtils {
  /**
   * 시간 표현을 날짜로 변환
   */
  parseTimeExpression(expression) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const timePatterns = {
      // 오늘, 오늘날
      '오늘': () => ({
        startDate: today.toISOString(),
        endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
      }),

      // 어제
      '어제': () => {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return {
          startDate: yesterday.toISOString(),
          endDate: today.toISOString()
        };
      },

      // 그저께
      '그저께': () => {
        const dayBeforeYesterday = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
        return {
          startDate: dayBeforeYesterday.toISOString(),
          endDate: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString()
        };
      },

      // 이번 주
      '이번주': () => {
        const dayOfWeek = today.getDay();
        const monday = new Date(today.getTime() - (dayOfWeek - 1) * 24 * 60 * 60 * 1000);
        return {
          startDate: monday.toISOString(),
          endDate: now.toISOString()
        };
      },

      // 지난 주
      '지난주': () => {
        const dayOfWeek = today.getDay();
        const lastMonday = new Date(today.getTime() - (dayOfWeek + 6) * 24 * 60 * 60 * 1000);
        const lastSunday = new Date(lastMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
        return {
          startDate: lastMonday.toISOString(),
          endDate: lastSunday.toISOString()
        };
      },

      // 이번 달
      '이번달': () => {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          startDate: firstDay.toISOString(),
          endDate: now.toISOString()
        };
      },

      // 지난 달
      '지난달': () => {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        return {
          startDate: firstDay.toISOString(),
          endDate: lastDay.toISOString()
        };
      },

      // 최근 (기본 7일)
      '최근': () => {
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return {
          startDate: weekAgo.toISOString(),
          endDate: now.toISOString()
        };
      },

      // 요즘 (기본 14일)
      '요즘': () => {
        const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
        return {
          startDate: twoWeeksAgo.toISOString(),
          endDate: now.toISOString()
        };
      },

      // 저번에 (기본 30일)
      '저번에': () => {
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return {
          startDate: monthAgo.toISOString(),
          endDate: now.toISOString()
        };
      },

      // 예전에 (기본 90일)
      '예전에': () => {
        const threeMonthsAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        return {
          startDate: threeMonthsAgo.toISOString(),
          endDate: now.toISOString()
        };
      }
    };

    // N일 전 패턴 (예: "3일 전", "일주일 전")
    const daysAgoMatch = expression.match(/(\d+)일\s*전/);
    if (daysAgoMatch) {
      const days = parseInt(daysAgoMatch[1]);
      const targetDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
      return {
        startDate: targetDate.toISOString(),
        endDate: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // N주 전 패턴
    const weeksAgoMatch = expression.match(/(\d+)주\s*전/);
    if (weeksAgoMatch) {
      const weeks = parseInt(weeksAgoMatch[1]);
      const startDate = new Date(today.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
      return {
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      };
    }

    // N달 전 패턴
    const monthsAgoMatch = expression.match(/(\d+)달\s*전/);
    if (monthsAgoMatch) {
      const months = parseInt(monthsAgoMatch[1]);
      const startDate = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
      return {
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      };
    }

    // 패턴 매칭
    for (const [pattern, handler] of Object.entries(timePatterns)) {
      if (expression.includes(pattern)) {
        return handler();
      }
    }

    return null;
  }

  /**
   * 자연어 검색어 파싱
   */
  parseNaturalQuery(query) {
    const parsed = {
      keywords: [],
      timeRange: null,
      category: null,
      importance: null,
      tags: []
    };

    // 시간 표현 추출
    const timeExpressions = [
      '오늘', '어제', '그저께', '이번주', '지난주', '이번달', '지난달',
      '최근', '요즘', '저번에', '예전에'
    ];

    for (const expr of timeExpressions) {
      if (query.includes(expr)) {
        parsed.timeRange = this.parseTimeExpression(expr);
        // 시간 표현 제거
        query = query.replace(expr, '').trim();
        break;
      }
    }

    // N일/주/달 전 패턴 체크
    const timePatternMatch = query.match(/\d+[일주달]\s*전/);
    if (timePatternMatch) {
      parsed.timeRange = this.parseTimeExpression(timePatternMatch[0]);
      query = query.replace(timePatternMatch[0], '').trim();
    }

    // 카테고리 키워드
    const categoryKeywords = {
      '개발': '개발',
      '코드': '개발',
      '프로그래밍': '개발',
      '일상': '일상',
      '업무': '업무',
      '일': '업무',
      '공부': '학습',
      '학습': '학습',
      '배움': '학습'
    };

    for (const [keyword, category] of Object.entries(categoryKeywords)) {
      if (query.includes(keyword)) {
        parsed.category = category;
        break;
      }
    }

    // 중요도 키워드
    const importanceKeywords = {
      '중요한': { min: 8, max: 10 },
      '중요': { min: 7, max: 10 },
      '급한': { min: 8, max: 10 },
      '급': { min: 8, max: 10 },
      '사소한': { min: 1, max: 3 },
      '간단한': { min: 1, max: 4 }
    };

    for (const [keyword, range] of Object.entries(importanceKeywords)) {
      if (query.includes(keyword)) {
        parsed.importance = range;
        query = query.replace(keyword, '').trim();
        break;
      }
    }

    // 나머지를 키워드로 처리
    const cleanedQuery = query
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedQuery) {
      // 공백으로 분리하여 각각을 키워드로
      parsed.keywords = cleanedQuery.split(/\s+/).filter(k => k.length > 0);
    }

    return parsed;
  }

  /**
   * 자연어 검색어를 필터 객체로 변환
   */
  convertToFilters(naturalQuery) {
    const parsed = this.parseNaturalQuery(naturalQuery);
    const filters = {};

    if (parsed.timeRange) {
      filters.startDate = parsed.timeRange.startDate;
      filters.endDate = parsed.timeRange.endDate;
    }

    if (parsed.category) {
      filters.category = parsed.category;
    }

    if (parsed.importance) {
      filters.minImportance = parsed.importance.min;
      filters.maxImportance = parsed.importance.max;
    }

    return {
      keywords: parsed.keywords,
      filters
    };
  }

  /**
   * "개떡같이" 말해도 "찰떡같이" 이해하는 검색어 수정
   */
  fuzzyCorrection(query) {
    // 자주 틀리는 단어 매핑
    const corrections = {
      // 오타 수정
      '메모라': '메모리',
      '데이타': '데이터',
      '프로젝트': '프로젝트',

      // 동의어 확장
      '찾아줘': '검색',
      '찾기': '검색',
      '봐줘': '보기',
      '보여줘': '보기',

      // 축약어 확장
      'db': '데이터베이스',
      'api': 'API'
    };

    let corrected = query;
    for (const [wrong, correct] of Object.entries(corrections)) {
      const regex = new RegExp(wrong, 'gi');
      corrected = corrected.replace(regex, correct);
    }

    return corrected;
  }

  /**
   * 맥락 기반 검색어 확장
   */
  expandContext(query, recentSearches = []) {
    // 최근 검색어에서 관련 태그 추출
    const relatedTags = [];

    // 간단한 구현: 최근 검색과 현재 검색의 공통 단어 찾기
    const currentWords = query.toLowerCase().split(/\s+/);

    recentSearches.forEach(recent => {
      const recentWords = recent.toLowerCase().split(/\s+/);
      const hasCommon = currentWords.some(word =>
        recentWords.some(rw => rw.includes(word) || word.includes(rw))
      );

      if (hasCommon) {
        // 관련성 있는 검색어의 단어들을 확장 후보로 추가
        relatedTags.push(...recentWords);
      }
    });

    return {
      originalQuery: query,
      expandedKeywords: [...new Set([...currentWords, ...relatedTags])]
    };
  }
}

module.exports = new SmartSearchUtils();
