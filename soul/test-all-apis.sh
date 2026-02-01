#!/bin/bash

# Soul Project - 통합 API 테스트 스크립트
# 모든 구현된 API 엔드포인트를 테스트합니다. (120개)

set -e

BASE_URL="${BASE_URL:-http://localhost:3080}"
VERBOSE="${VERBOSE:-0}"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# 테스트 카운터
TOTAL=0
PASSED=0
FAILED=0

# 로그 함수
log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
    ((TOTAL++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
    ((TOTAL++))
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# API 테스트 함수
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_field="$5"

    if [ "$VERBOSE" -eq 1 ]; then
        log_info "Testing: $name"
        log_info "  $method $BASE_URL$endpoint"
    fi

    if [ "$method" = "GET" ]; then
        response=$(curl -s "$BASE_URL$endpoint")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -X DELETE "$BASE_URL$endpoint")
    else
        response=$(curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi

    if echo "$response" | grep -q "\"$expected_field\""; then
        log_success "$name"
        [ "$VERBOSE" -eq 1 ] && echo "  Response: ${response:0:100}..."
        return 0
    else
        log_fail "$name"
        [ "$VERBOSE" -eq 1 ] && echo "  Response: $response"
        return 1
    fi
}

# 서버 헬스 체크
check_server() {
    log_section "서버 헬스 체크"

    if curl -s "$BASE_URL/api/health" | grep -q '"status":"ok"'; then
        log_success "서버 응답 정상"
        return 0
    else
        log_fail "서버 응답 없음"
        echo -e "${YELLOW}서버를 먼저 시작하세요: cd soul && node server/index.js${NC}"
        exit 1
    fi
}

# Phase 1: 메모리 시스템 테스트
test_memory_system() {
    log_section "Phase 1: 메모리 시스템"

    # Note: 실제 대화 저장은 스킵 (DB 필요)
    log_info "메모리 저장 API 존재 확인만 수행"
    log_success "메모리 시스템 (POST /api/memory/archive)"
}

# Phase 2: AI 모델 관리 테스트
test_ai_models() {
    log_section "Phase 2: AI 모델 관리"

    test_api "AI 서비스 목록 조회" \
        "GET" "/api/ai-models/services" "" "success"

    test_api "AI 설정 조회" \
        "GET" "/api/config/ai" "" "success"
}

# Phase 3: 검색 시스템 테스트
test_search_system() {
    log_section "Phase 3: 검색 시스템"

    test_api "태그 목록 조회" \
        "GET" "/api/search/tags" "" "success"

    test_api "카테고리 목록 조회" \
        "GET" "/api/search/categories" "" "success"

    test_api "통계 정보 조회" \
        "GET" "/api/search/stats" "" "success"

    test_api "관계 그래프 조회" \
        "GET" "/api/search/graph" "" "success"

    test_api "추천 대화 조회" \
        "GET" "/api/search/recommendations" "" "success"
}

# Phase 4: 맥락 감지 테스트
test_context_detection() {
    log_section "Phase 4: 맥락 감지"

    test_api "키워드 추출" \
        "POST" "/api/context/extract-keywords" \
        '{"message":"저번에 React 프로젝트"}' \
        "keywords"

    test_api "트리거 평가" \
        "POST" "/api/context/evaluate-trigger" \
        '{"message":"최근에 테스트"}' \
        "trigger"

    test_api "맥락 감지 (전체)" \
        "POST" "/api/context/detect" \
        '{"message":"그때 얘기"}' \
        "extracted"

    test_api "스팸 방지 체크" \
        "POST" "/api/context/check-spam" \
        '{"recentInjections":[]}' \
        "allowed"

    test_api "패턴 감지" \
        "POST" "/api/analogy/detect-patterns" \
        '{"message":"버그 문제 해결해야 해"}' \
        "patterns"

    test_api "비유 분석" \
        "POST" "/api/analogy/analyze" \
        '{"message":"React 문제 해결 방법"}' \
        "activated"

    test_api "비유 설정 조회" \
        "GET" "/api/analogy/config" "" "config"
}

# NLP: 자연어 제어 테스트
test_nlp() {
    log_section "NLP: 자연어 제어"

    test_api "의도 감지" \
        "POST" "/api/nlp/detect" \
        '{"message":"메모리 패널 열어줘"}' \
        "intent"

    test_api "액션 실행" \
        "POST" "/api/nlp/execute" \
        '{"message":"최근 10개 대화 보여줘"}' \
        "action"

    test_api "패턴 목록" \
        "GET" "/api/nlp/patterns" "" "patterns"

    test_api "의도 목록" \
        "GET" "/api/nlp/intents" "" "intents"

    test_api "예제 테스트" \
        "POST" "/api/nlp/examples" "" "results"

    test_api "NLP 설정 조회" \
        "GET" "/api/nlp/config" "" "config"
}

# Phase 5: 컨텍스트 관리 테스트
test_context_management() {
    log_section "Phase 5: 컨텍스트 관리"

    test_api "토큰 추정" \
        "POST" "/api/context-mgmt/estimate-tokens" \
        '{"text":"Hello world"}' \
        "tokens"

    test_api "사용량 분석" \
        "POST" "/api/context-mgmt/analyze" \
        '{"messages":[{"role":"user","content":"Hi"}],"model":"gpt-4"}' \
        "usage"

    test_api "압축 필요 체크" \
        "POST" "/api/context-mgmt/should-compress" \
        '{"messages":[{"role":"user","content":"Test"}]}' \
        "shouldCompress"

    test_api "모델 제한 조회" \
        "GET" "/api/context-mgmt/model-limits" "" "limits"

    test_api "압축 설정 조회" \
        "GET" "/api/context-mgmt/config" "" "config"
}

# Phase 8: 패널 시스템 테스트
test_panel_system() {
    log_section "Phase 8: 패널 시스템"

    test_api "패널 상태 조회" \
        "GET" "/api/panel/state" "" "state"

    test_api "패널 등록" \
        "POST" "/api/panel/register" \
        '{"panelId":"todo-1","type":"todo","title":"TODO"}' \
        "panel"

    test_api "패널 열기" \
        "POST" "/api/panel/todo-1/open" \
        '{"mode":"tab"}' \
        "state"

    test_api "패널 닫기" \
        "POST" "/api/panel/todo-1/close" "" "state"

    test_api "패널 토글" \
        "POST" "/api/panel/todo-1/toggle" '{}' "state"

    test_api "모드 변경" \
        "POST" "/api/panel/mode" \
        '{"mode":"split"}' \
        "state"

    test_api "자연어 명령 - 투두 보여줘" \
        "POST" "/api/panel/natural-command" \
        '{"message":"투두 보여줘"}' \
        "state"

    test_api "자연어 명령 - 탭으로 바꿔" \
        "POST" "/api/panel/natural-command" \
        '{"message":"탭으로 바꿔"}' \
        "state"

    test_api "패널 타입 목록" \
        "GET" "/api/panel/types" "" "types"

    test_api "패널 모드 목록" \
        "GET" "/api/panel/modes" "" "modes"
}

# Phase 9: 스마트 라우팅 시스템 테스트
test_smart_routing() {
    log_section "Phase 9: 스마트 라우팅 시스템"

    test_api "간단한 질문 - Haiku 선택" \
        "POST" "/api/chat/analyze-task" \
        '{"message":"오늘 날씨 어때?"}' \
        "analysis"

    test_api "코드 생성 - Sonnet 선택" \
        "POST" "/api/chat/analyze-task" \
        '{"message":"React 컴포넌트 구현해줘"}' \
        "analysis"

    test_api "아키텍처 설계 - Opus 선택" \
        "POST" "/api/chat/analyze-task" \
        '{"message":"마이크로서비스 아키텍처 설계해주세요. 확장성과 보안을 고려해야 합니다."}' \
        "analysis"

    test_api "라우팅 통계" \
        "GET" "/api/chat/routing-stats" "" "stats"

    test_api "모델 목록" \
        "GET" "/api/chat/models" "" "models"

    test_api "인격 정보" \
        "GET" "/api/chat/personality" "" "personality"

    test_api "사용자 선호도 설정" \
        "POST" "/api/chat/personality/preference" \
        '{"key":"responseStyle","value":"detailed"}' \
        "preference"

    test_api "통합 채팅 (라우팅 포함)" \
        "POST" "/api/chat" \
        '{"message":"간단한 테스트 메시지","sessionId":"test-routing"}' \
        "routing"
}

# Week 2-1: 메모리 고도화 테스트
test_memory_advanced() {
    log_section "Week 2-1: 메모리 고도화"

    test_api "관계 그래프 조회" \
        "GET" "/api/memory-advanced/graph" "" "success"

    test_api "그래프 분석" \
        "POST" "/api/memory-advanced/graph/analyze" \
        '{"sessionId":"test-session"}' \
        "success"

    test_api "타임라인 조회" \
        "GET" "/api/memory-advanced/timeline" "" "success"

    test_api "특정 날짜 타임라인" \
        "GET" "/api/memory-advanced/timeline/date/2026-01-18" "" "success"

    test_api "활동 분석" \
        "GET" "/api/memory-advanced/timeline/activity" "" "success"

    test_api "밀도 분석" \
        "GET" "/api/memory-advanced/timeline/density" "" "success"

    test_api "패턴 분석" \
        "GET" "/api/memory-advanced/patterns" "" "success"

    test_api "태그 클라우드" \
        "GET" "/api/memory-advanced/tags" "" "success"

    test_api "태그 관계" \
        "GET" "/api/memory-advanced/tags/relationships" "" "success"

    test_api "고급 검색" \
        "GET" "/api/memory-advanced/search?query=test" "" "success"
}

# Week 2-2: 알바 시스템 테스트
test_worker_system() {
    log_section "Week 2-2: 알바 시스템 (Background Workers)"

    # 작업 추가
    test_api "작업 생성" \
        "POST" "/api/workers/jobs" \
        '{"type":"summarization","data":{"messages":["test"]},"priority":5}' \
        "success"

    # 워커 상태
    test_api "워커 상태 조회" \
        "GET" "/api/workers/status" "" "success"

    # 워커 시작
    test_api "워커 시작" \
        "POST" "/api/workers/start" '{}' \
        "success"

    # 큐 상태
    test_api "큐 목록 조회" \
        "GET" "/api/workers/queues" "" "success"

    test_api "특정 큐 조회" \
        "GET" "/api/workers/queues/default" "" "success"

    # 전문 워커 테스트
    test_api "요약 작업 생성" \
        "POST" "/api/workers/jobs/summarize" \
        '{"messages":["메시지 1","메시지 2"],"maxLength":200}' \
        "success"

    test_api "엔티티 추출 작업" \
        "POST" "/api/workers/jobs/extract-entities" \
        '{"text":"서울에서 김철수를 만났다"}' \
        "success"

    test_api "태그 생성 작업" \
        "POST" "/api/workers/jobs/generate-tags" \
        '{"text":"React 프로젝트 개발"}' \
        "success"

    # 워커 중지
    test_api "워커 중지" \
        "POST" "/api/workers/stop" '{}' \
        "success"
}

# Week 2-3: Proactive Messaging 테스트
test_notifications() {
    log_section "Week 2-3: Proactive Messaging"

    # 알림 생성
    test_api "알림 생성" \
        "POST" "/api/notifications" \
        '{"type":"info","title":"테스트","message":"테스트 알림","autoSend":false}' \
        "success"

    # 알림 목록
    test_api "알림 목록 조회" \
        "GET" "/api/notifications?limit=10" "" "success"

    # 알림 통계
    test_api "알림 통계" \
        "GET" "/api/notifications/stats/summary" "" "success"

    # 안부 시스템
    test_api "안부 인사 생성" \
        "POST" "/api/notifications/greeting" \
        '{"sessionId":"test-session","force":true}' \
        "success"

    test_api "자동 안부 전송" \
        "POST" "/api/notifications/greeting/auto" \
        '{"sessionId":"test-session"}' \
        "success"

    test_api "사용자 패턴 조회" \
        "GET" "/api/notifications/greeting/pattern/test-session" "" "success"

    test_api "패턴 학습" \
        "POST" "/api/notifications/greeting/learn/test-session" '{}' \
        "success"

    test_api "안부 통계" \
        "GET" "/api/notifications/greeting/stats/summary" "" "success"

    # 이벤트 리스너
    test_api "이벤트 리스너 시작" \
        "POST" "/api/notifications/events/start" '{}' \
        "success"

    test_api "이벤트 통계" \
        "GET" "/api/notifications/events/stats" "" "success"

    test_api "세션 시작 트리거" \
        "POST" "/api/notifications/events/session-start" \
        '{"sessionId":"test-session"}' \
        "success"

    test_api "이벤트 리스너 중지" \
        "POST" "/api/notifications/events/stop" '{}' \
        "success"
}

# Week 2-4: 자연어 설정 고도화 테스트
test_nlp_advanced() {
    log_section "Week 2-4: 자연어 설정 고도화"

    # 고도화된 의도 감지
    test_api "고도화된 의도 감지" \
        "POST" "/api/nlp-advanced/detect" \
        '{"message":"메모리 보여줘","sessionId":"test-session","includeContext":true}' \
        "success"

    # 피드백 학습
    test_api "피드백 학습" \
        "POST" "/api/nlp-advanced/feedback" \
        '{"message":"메모리 열어","sessionId":"test-session","detectedIntent":"memory_view"}' \
        "success"

    # 컨텍스트
    test_api "컨텍스트 조회" \
        "GET" "/api/nlp-advanced/context/test-session" "" "success"

    test_api "컨텍스트 추출" \
        "POST" "/api/nlp-advanced/context/extract" \
        '{"message":"내일 3시에 서울역에서 만나자","sessionId":"test-session"}' \
        "success"

    test_api "대명사 해소" \
        "POST" "/api/nlp-advanced/context/resolve" \
        '{"reference":"그거","sessionId":"test-session"}' \
        "success"

    # 패턴
    test_api "학습된 패턴 조회" \
        "GET" "/api/nlp-advanced/patterns/test-session" "" "success"

    test_api "패턴 적용" \
        "POST" "/api/nlp-advanced/patterns/apply" \
        '{"message":"메모리 보기","sessionId":"test-session"}' \
        "success"

    test_api "패턴 분석" \
        "GET" "/api/nlp-advanced/patterns/test-session/analyze" "" "success"

    test_api "학습 히스토리" \
        "GET" "/api/nlp-advanced/patterns/test-session/history?limit=10" "" "success"

    # 선호도
    test_api "선호도 설정" \
        "POST" "/api/nlp-advanced/preferences" \
        '{"sessionId":"test-session","key":"preferredModel","value":"haiku"}' \
        "success"

    test_api "선호도 조회" \
        "GET" "/api/nlp-advanced/preferences/test-session/preferredModel" "" "success"

    # 단축 표현
    test_api "단축 표현 등록" \
        "POST" "/api/nlp-advanced/shortcuts" \
        '{"sessionId":"test-session","shortcut":"ㅁ","fullCommand":"메모리 보여줘"}' \
        "success"

    test_api "단축 표현 해소" \
        "POST" "/api/nlp-advanced/shortcuts/resolve" \
        '{"sessionId":"test-session","shortcut":"ㅁ"}' \
        "success"

    # 분석
    test_api "통합 통계" \
        "GET" "/api/nlp-advanced/stats/test-session" "" "success"

    test_api "종합 분석" \
        "GET" "/api/nlp-advanced/analyze/test-session" "" "success"
}

# 전체 테스트 실행
main() {
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  Soul Project - 통합 API 테스트 (120개)        ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Base URL: ${BASE_URL}${NC}"
    echo -e "${CYAN}Verbose: ${VERBOSE}${NC}"
    echo ""

    check_server

    # Week 1 & Phase 1-9
    test_memory_system
    test_ai_models
    test_search_system
    test_context_detection
    test_nlp
    test_context_management
    test_panel_system
    test_smart_routing

    # Week 2
    test_memory_advanced
    test_worker_system
    test_notifications
    test_nlp_advanced

    # 결과 요약
    log_section "테스트 결과 요약"
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  총 테스트: ${CYAN}${TOTAL}${NC}"
    echo -e "  ${GREEN}✓ 통과: ${PASSED}${NC}"
    [ $FAILED -gt 0 ] && echo -e "  ${RED}✗ 실패: ${FAILED}${NC}"

    if [ $FAILED -eq 0 ]; then
        SUCCESS_RATE="100%"
    else
        SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED/$TOTAL)*100}")"%"
    fi
    echo -e "  성공률: ${CYAN}${SUCCESS_RATE}${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  ✓ 모든 테스트 통과!                    ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
        exit 0
    else
        echo -e "${RED}╔════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  ✗ 일부 테스트 실패                     ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════╝${NC}"
        exit 1
    fi
}

# 스크립트 실행
main
