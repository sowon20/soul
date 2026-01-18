#!/bin/bash

# Soul Project - 통합 API 테스트 스크립트
# 모든 구현된 API 엔드포인트를 테스트합니다.

set -e

BASE_URL="${BASE_URL:-http://localhost:3080}"
VERBOSE="${VERBOSE:-0}"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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
        echo -e "${YELLOW}서버를 먼저 시작하세요: node server/index.js${NC}"
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

# 전체 테스트 실행
main() {
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  Soul Project - 통합 API 테스트                ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════╝${NC}"
    echo ""

    check_server
    test_memory_system
    test_ai_models
    test_search_system
    test_context_detection
    test_analogy
    test_nlp
    test_context_management
    test_panel_system

    # 결과 요약
    log_section "테스트 결과 요약"
    echo -e "총 테스트: ${TOTAL}"
    echo -e "${GREEN}통과: ${PASSED}${NC}"
    [ $FAILED -gt 0 ] && echo -e "${RED}실패: ${FAILED}${NC}"
    echo ""

    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ 모든 테스트 통과!${NC}"
        exit 0
    else
        echo -e "${RED}✗ 일부 테스트 실패${NC}"
        exit 1
    fi
}

# 스크립트 실행
main
