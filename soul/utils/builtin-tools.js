/**
 * builtin-tools.js
 * AI가 자율적으로 호출하는 내장 도구
 *
 * 개인 AI 원칙: 사용자에 대한 정보는 항상 선명하게
 */

const { getMemoryManager } = require('./memory-layers');
const ProfileModel = require('../models/Profile');

/**
 * 내장 도구 정의 (Claude tool_use 형식)
 */
const builtinTools = [
  {
    name: 'recall_memory',
    description: '너와 유저의 과거 대화와 기억을 DB에서 검색. 검색 결과는 모두 너와 유저 사이의 대화 기록이다. 확실하지 않은 것은 추측하지 말고 검색으로 확인할 것.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 키워드 (구체적으로)' },
        timeFilter: { type: 'string', description: '특정 시점이 확실할 때만 사용(예: 2025년 11월, 어제). 모르면 생략 — 생략시 전체 기간 검색' },
        limit: { type: 'number', description: '개수 (맥락 필요시 10+ 권장)', default: 10 }
      },
      required: ['query']
    }
  },
  {
    name: 'get_profile',
    description: '사용자 프로필 조회',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: '필드명(생략시 전체)' }
      },
      required: []
    }
  },
  {
    name: 'update_profile',
    description: '새로 알게 된 사용자 정보 저장',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: '필드명' },
        value: { type: 'string', description: '값' }
      },
      required: ['field', 'value']
    }
  },
  {
    name: 'execute_command',
    description: '서버에서 쉘 명령어 실행. 결과는 터미널에 실시간 표시됨. 위험한 명령은 사용자에게 확인 후 실행할 것. 실행 결과에는 항상 command, output, exit_code를 포함.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '실행할 쉘 명령어' },
        timeout: { type: 'number', description: '타임아웃(초)', default: 30 }
      },
      required: ['command']
    }
  },
  {
    name: 'save_memory',
    description: '기억 저장/갱신. 같은 태그의 기억이 이미 있으면 자동으로 수정(이전 내용은 이력 보존). 없으면 새로 생성. 메모가 아닌 "사실"을 저장하는 곳.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '기억할 내용 (구체적으로)' },
        tags: { type: 'array', items: { type: 'string' }, description: '주제 태그 (기존 기억 매칭에 사용됨)' },
        reason: { type: 'string', description: '기존 기억을 수정하는 경우 변경 사유 (선택)' }
      },
      required: ['content', 'tags']
    }
  },
  {
    name: 'update_memory',
    description: '이전에 저장한 기억을 수정하거나 비활성화하세요. list_memories로 id를 확인 후 사용.',
    input_schema: {
      type: 'object',
      properties: {
        memory_id: { type: 'number', description: '수정할 기억의 id' },
        content: { type: 'string', description: '새 내용 (변경 시)' },
        category: { type: 'string', enum: ['fact', 'preference', 'relationship', 'event', 'general'] },
        tags: { type: 'array', items: { type: 'string' } },
        is_active: { type: 'boolean', description: 'false로 비활성화 (soft delete)' }
      },
      required: ['memory_id']
    }
  },
  {
    name: 'list_memories',
    description: '내가 저장한 기억 목록 조회. 키워드로 내용+태그 검색 가능.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 키워드 (내용+태그에서 검색)' },
        limit: { type: 'number', description: '최대 개수', default: 20 },
        include_hidden: { type: 'boolean', description: '비활성화된 기억도 포함', default: false }
      },
      required: []
    }
  },
  {
    name: 'update_tags',
    description: '대화 메시지의 태그를 추가, 수정, 삭제하세요. 대화 맥락상 중요한 키워드를 태그로 보완할 때 사용.',
    input_schema: {
      type: 'object',
      properties: {
        message_id: { type: 'number', description: '태그를 수정할 메시지 id' },
        tags: { type: 'array', items: { type: 'string' }, description: '태그 배열' },
        mode: { type: 'string', enum: ['replace', 'add', 'remove'], description: 'replace=전체교체, add=기존에추가, remove=특정태그삭제', default: 'add' }
      },
      required: ['message_id', 'tags']
    }
  },
  {
    name: 'search_web',
    description: '웹 검색. 최신 정보, 뉴스, 사실 확인에 사용. 기본적으로 advanced 깊이 검색 + AI 요약 제공.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        days: { type: 'number', description: '(선택) 최근 N일 이내 결과만 검색 (예: 7 = 최근 1주일)' },
        search_depth: { type: 'string', enum: ['basic', 'advanced'], description: '(선택) 검색 깊이. 기본값 advanced' }
      },
      required: ['query']
    }
  },
  // === 메시징 도구 (선제 메시지 + 예약) ===
  {
    name: 'send_message',
    description: '사용자에게 즉시 메시지 전송. 먼저 말을 걸거나 알림을 보낼 때 사용.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '내용' },
        priority: { type: 'string', enum: ['normal', 'urgent'], description: 'urgent는 야간모드 무시' }
      },
      required: ['message']
    }
  },
  {
    name: 'schedule_message',
    description: '예약 메시지. 나중에 보낼 메시지를 예약.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '내용' },
        delay_seconds: { type: 'number', description: '몇 초 뒤 발송' },
        send_at: { type: 'string', description: 'ISO 8601 절대시간 (delay_seconds와 택 1)' }
      },
      required: ['message']
    }
  },
  {
    name: 'cancel_schedule',
    description: '예약된 메시지 취소.',
    input_schema: {
      type: 'object',
      properties: {
        schedule_id: { type: 'number', description: '예약 ID' }
      },
      required: ['schedule_id']
    }
  },
  {
    name: 'list_schedules',
    description: '예약된 메시지 목록 조회.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'sent', 'all'], description: '필터 (기본: pending)' }
      }
    }
  },
  // === 캘린더 도구 ===
  {
    name: 'get_events',
    description: '일정 조회. 백엔드 캘린더(Google/Apple/CalDAV)는 서버 설정에서 결정.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO 날짜 또는 자연어(오늘, 내일)' },
        end_date: { type: 'string', description: '종료 날짜 (생략 시 start_date와 동일)' },
        query: { type: 'string', description: '검색어 (선택)' }
      },
      required: ['start_date']
    }
  },
  {
    name: 'create_event',
    description: '일정 생성.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '일정 제목' },
        start: { type: 'string', description: '시작 시간 (ISO 8601)' },
        end: { type: 'string', description: '종료 시간 (생략 시 start + 1시간)' },
        description: { type: 'string', description: '상세 설명' },
        location: { type: 'string', description: '장소' },
        reminder_minutes: { type: 'number', description: '알림(분 전)' }
      },
      required: ['title', 'start']
    }
  },
  {
    name: 'update_event',
    description: '일정 수정.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: '일정 ID' },
        title: { type: 'string', description: '제목' },
        start: { type: 'string', description: '시작 시간' },
        end: { type: 'string', description: '종료 시간' },
        description: { type: 'string', description: '설명' },
        location: { type: 'string', description: '장소' }
      },
      required: ['event_id']
    }
  },
  {
    name: 'delete_event',
    description: '일정 삭제.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: '일정 ID' }
      },
      required: ['event_id']
    }
  },
  // === 할 일 도구 ===
  {
    name: 'manage_todo',
    description: '할 일 관리 (CRUD). action별로 다른 파라미터 사용.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'done', 'update', 'delete'], description: '작업 종류' },
        todo_id: { type: 'string', description: '대상 ID (done/update/delete 시)' },
        title: { type: 'string', description: '할 일 내용' },
        due_date: { type: 'string', description: '마감일 (ISO 날짜)' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], description: '우선순위' },
        status: { type: 'string', enum: ['pending', 'done', 'all'], description: 'list 시 필터' },
        query: { type: 'string', description: 'list 시 검색어' },
        tags: { type: 'array', items: { type: 'string' }, description: '태그' }
      },
      required: ['action']
    }
  },
  // === 메모 도구 ===
  {
    name: 'manage_note',
    description: '메모 관리 (CRUD). Todo와 별개, 자유형 텍스트 저장.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'read', 'update', 'delete'], description: '작업 종류' },
        note_id: { type: 'string', description: '대상 ID' },
        title: { type: 'string', description: '메모 제목' },
        content: { type: 'string', description: '메모 내용' },
        query: { type: 'string', description: 'list 시 검색어' },
        limit: { type: 'number', description: 'list 시 최대 개수' },
        tags: { type: 'array', items: { type: 'string' }, description: '태그' }
      },
      required: ['action']
    }
  },
  // === 브라우저 도구 ===
  {
    name: 'browse',
    description: '웹페이지 읽기. JS 렌더링 후 마크다운 추출. search_web 결과의 URL을 자세히 읽을 때 유용.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL' },
        selector: { type: 'string', description: '(선택) CSS 선택자로 특정 영역만 추출' }
      },
      required: ['url']
    }
  },
  // === 파일시스템 도구 ===
  {
    name: 'file_read',
    description: '로컬 파일 읽기. 큰 파일은 offset/limit으로 부분 읽기. ~/ 경로 지원.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 (~/로 시작 가능)' },
        offset: { type: 'number', description: '시작 라인 (0부터, 기본: 0)' },
        limit: { type: 'number', description: '읽을 라인 수 (기본: 200)' }
      },
      required: ['path']
    }
  },
  {
    name: 'file_write',
    description: '로컬 파일 쓰기. 자동으로 이전 상태를 스냅샷 저장하므로 되돌리기 가능.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 (~/로 시작 가능)' },
        content: { type: 'string', description: '내용' },
        mode: { type: 'string', enum: ['rewrite', 'append'], description: '쓰기 모드 (기본: rewrite)' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'file_list',
    description: '디렉토리 목록 조회. depth로 하위 폴더까지 탐색.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '디렉토리 경로 (~/로 시작 가능)' },
        pattern: { type: 'string', description: '파일명 패턴 (예: *.txt, *.js)' },
        depth: { type: 'number', description: '탐색 깊이 (1~3, 기본: 1)' }
      },
      required: ['path']
    }
  },
  {
    name: 'file_info',
    description: '파일/디렉토리 메타데이터 조회 (크기, 생성일, 수정일, 권한).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 (~/로 시작 가능)' }
      },
      required: ['path']
    }
  },
  {
    name: 'file_restore',
    description: '파일 변경 되돌리기. file_write로 변경한 내용을 이전 상태로 복원.',
    input_schema: {
      type: 'object',
      properties: {
        turn_id: { type: 'string', description: '되돌릴 턴 ID (생략 시 가장 최근 턴)' },
        list_only: { type: 'boolean', description: 'true면 되돌릴 수 있는 턴 목록만 조회' }
      }
    }
  },
  // === 클라우드 스토리지 도구 (Google Drive) ===
  {
    name: 'cloud_search',
    description: 'Google Drive 파일 검색. 파일 타입으로 필터 가능.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        file_type: { type: 'string', enum: ['document', 'spreadsheet', 'image', 'pdf', 'any'], description: '파일 타입 (기본: any)' }
      },
      required: ['query']
    }
  },
  {
    name: 'cloud_read',
    description: 'Google Drive 파일 읽기. cloud_search 또는 cloud_list로 얻은 file_id 사용.',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: '파일 ID' }
      },
      required: ['file_id']
    }
  },
  {
    name: 'cloud_write',
    description: 'Google Drive 파일 생성 또는 수정.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '파일명' },
        content: { type: 'string', description: '내용' },
        folder_id: { type: 'string', description: '폴더 ID (생략 시 루트)' },
        file_id: { type: 'string', description: '기존 파일 수정 시 파일 ID' },
        mime_type: { type: 'string', description: 'MIME 타입 (기본: text/plain)' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'cloud_delete',
    description: 'Google Drive 파일을 휴지통으로 이동.',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: '파일 ID' }
      },
      required: ['file_id']
    }
  },
  {
    name: 'cloud_list',
    description: 'Google Drive 폴더 내 파일 목록.',
    input_schema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: '폴더 ID (생략 시 루트)' },
        limit: { type: 'number', description: '최대 개수 (기본: 20)' }
      }
    }
  },
  {
    name: 'cloud_mkdir',
    description: 'Google Drive 폴더 생성.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '폴더명' },
        parent_id: { type: 'string', description: '부모 폴더 ID (생략 시 루트)' }
      },
      required: ['name']
    }
  },
  // === 시스템 도구 ===
  {
    name: 'open_terminal',
    description: '내장 터미널 열기.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '실행할 명령어 (선택)' }
      }
    }
  },
  {
    name: 'get_weather',
    description: '날씨 조회. 오늘/내일/이번주 날씨 확인.',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: '지역명 (예: 서울, 부산, Tokyo). 생략 시 사용자 프로필 위치' },
        days: { type: 'number', description: '예보 일수 (기본: 1, 최대: 7)' }
      }
    }
  },
];

/**
 * 내장 도구 실행기
 */
async function executeBuiltinTool(toolName, input, options = {}) {
  switch (toolName) {
    case 'recall_memory':
      return await recallMemory(input);
    case 'get_profile':
      return await getProfile(input);
    case 'update_profile':
      return await updateProfile(input);
    case 'execute_command':
      return await executeCommandTool(input);
    case 'save_memory':
      return await saveMemory(input);
    case 'update_memory':
      return await updateMemory(input);
    case 'list_memories':
      return await listMemories(input);
    case 'update_tags':
      return await updateTags(input);
    case 'search_web':
      return await searchWeb(input);
    case 'read_url':
      return await browse(input); // browse로 통합 (하위호환)
    case 'send_message':
      return await sendMessageTool(input);
    case 'schedule_message':
      return await scheduleMessageTool(input);
    case 'cancel_schedule':
      return await cancelScheduleTool(input);
    case 'list_schedules':
      return await listSchedulesTool(input);
    // 캘린더
    case 'get_events':
      return await getEvents(input);
    case 'create_event':
      return await createEvent(input);
    case 'update_event':
      return await updateEvent(input);
    case 'delete_event':
      return await deleteEvent(input);
    // 할 일
    case 'manage_todo':
      return await manageTodo(input);
    // 메모
    case 'manage_note':
      return await manageNote(input);
    // 브라우저
    case 'browse':
      return await browse(input);
    // 파일시스템
    case 'file_read':
      return await fileRead(input);
    case 'file_write':
      return await fileWrite(input, options.turnId);
    case 'file_list':
      return await fileList(input);
    case 'file_info':
      return await fileInfo(input);
    case 'file_restore':
      return await fileRestore(input);
    // 클라우드
    case 'cloud_search':
      return await cloudSearch(input);
    case 'cloud_read':
      return await cloudRead(input);
    case 'cloud_write':
      return await cloudWrite(input);
    case 'cloud_delete':
      return await cloudDelete(input);
    case 'cloud_list':
      return await cloudList(input);
    case 'cloud_mkdir':
      return await cloudMkdir(input);
    // 시스템
    case 'open_terminal':
      return await openTerminal(input, options);
    case 'get_weather':
      return await getWeather(input);
    case 'call_worker':
      return await callWorker(input, options.context);
    default:
      return { error: `Unknown builtin tool: ${toolName}` };
  }
}

/**
 * timeFilter 자연어 → 날짜 범위 변환
 * @param {string} timeFilter - "어제", "지난주", "2025년 11월" 등
 * @returns {{ startDate: Date, endDate: Date } | null}
 */
function parseTimeFilter(timeFilter) {
  if (!timeFilter) return null;

  const now = new Date();
  const tf = timeFilter.trim().toLowerCase();

  // "오늘"
  if (tf === '오늘' || tf === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "어제"
  if (tf === '어제' || tf === 'yesterday') {
    const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "그저께" / "엊그제"
  if (tf === '그저께' || tf === '엊그제') {
    const start = new Date(now); start.setDate(start.getDate() - 2); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "이번 주" / "이번주"
  if (tf === '이번 주' || tf === '이번주' || tf === 'this week') {
    const dayOfWeek = now.getDay();
    const start = new Date(now); start.setDate(start.getDate() - dayOfWeek); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "지난주" / "지난 주"
  if (tf === '지난주' || tf === '지난 주' || tf === 'last week') {
    const dayOfWeek = now.getDay();
    const end = new Date(now); end.setDate(end.getDate() - dayOfWeek - 1); end.setHours(23, 59, 59, 999);
    const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end };
  }

  // "이번 달" / "이번달"
  if (tf === '이번 달' || tf === '이번달' || tf === 'this month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start, endDate: now };
  }

  // "지난달" / "지난 달"
  if (tf === '지난달' || tf === '지난 달' || tf === 'last month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "N일 전" 패턴
  const daysAgoMatch = tf.match(/(\d+)\s*일\s*전/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1]);
    const start = new Date(now); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "최근 N일" 패턴
  const recentDaysMatch = tf.match(/최근\s*(\d+)\s*일/);
  if (recentDaysMatch) {
    const days = parseInt(recentDaysMatch[1]);
    const start = new Date(now); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "최근 N개월" / "최근 N달" 패턴
  const recentMonthsMatch = tf.match(/최근\s*(\d+)\s*(?:개월|달)/);
  if (recentMonthsMatch) {
    const months = parseInt(recentMonthsMatch[1]);
    const start = new Date(now); start.setMonth(start.getMonth() - months); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "최근 N년" 패턴
  const recentYearsMatch = tf.match(/최근\s*(\d+)\s*년/);
  if (recentYearsMatch) {
    const years = parseInt(recentYearsMatch[1]);
    const start = new Date(now); start.setFullYear(start.getFullYear() - years); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now };
  }

  // "YYYY년 MM월" 패턴 (예: "2025년 11월")
  const yearMonthMatch = tf.match(/(\d{4})\s*년?\s*(\d{1,2})\s*월/);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1]);
    const month = parseInt(yearMonthMatch[2]) - 1;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "MM월" 패턴 (올해 기준, 미래 월이면 작년)
  const monthOnlyMatch = tf.match(/^(\d{1,2})\s*월$/);
  if (monthOnlyMatch) {
    const month = parseInt(monthOnlyMatch[1]) - 1;
    const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "YYYY-MM-DD to YYYY-MM-DD" 또는 "YYYY-MM-DD ~ YYYY-MM-DD" 패턴
  const rangeMatch = tf.match(/(\d{4}-\d{1,2}-\d{1,2})\s*(?:to|~|부터)\s*(\d{4}-\d{1,2}-\d{1,2})/);
  if (rangeMatch) {
    const start = new Date(rangeMatch[1]); start.setHours(0, 0, 0, 0);
    const end = new Date(rangeMatch[2]); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // "YYYY-MM-DD" 단일 날짜
  const singleDateMatch = tf.match(/^(\d{4}-\d{1,2}-\d{1,2})$/);
  if (singleDateMatch) {
    const start = new Date(singleDateMatch[1]); start.setHours(0, 0, 0, 0);
    const end = new Date(singleDateMatch[1]); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  return null;
}

/**
 * recall_memory 구현 - 3경로 병렬 검색
 *
 * 경로 1 (벡터): HNSW/brute-force로 원문 임베딩 직접 검색
 * 경로 2 (태그): 키워드를 태그로 변환하여 아카이브 태그 검색
 * 경로 3 (키워드): 아카이브 원문에서 키워드 매칭 (벡터 결과가 부족할 때)
 *
 * 벡터 검색이 원문을 직접 임베딩하므로 날짜→원문 2단계 불필요
 */
async function recallMemory({ query, timeFilter, limit = 10 }) {
  try {
    const keywords = query.split(/[\s,.\-!?~]+/).filter(k => k.length >= 2);
    const timeRange = parseTimeFilter(timeFilter);
    const timeOpts = timeRange ? { startDate: timeRange.startDate, endDate: timeRange.endDate } : {};

    console.log(`[recall_memory] query="${query}", time=${timeFilter || 'none'}, keywords=[${keywords.join(',')}]`);

    const results = [];
    const seenKeys = new Set(); // 중복 방지

    function addResult(r) {
      const key = (r.content || '').substring(0, 80);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      results.push(r);
    }

    // ========================================
    // 경로 0: Soul Memory 검색 (사실 관계 우선)
    // ========================================
    try {
      const db = require('../db');
      let memorySql = 'SELECT * FROM soul_memories WHERE is_active = 1 AND (content LIKE ?';
      const memoryParams = [`%${query}%`];

      // 각 키워드로도 검색
      for (const kw of keywords) {
        memorySql += ' OR content LIKE ?';
        memoryParams.push(`%${kw}%`);
      }
      memorySql += ') ORDER BY updated_at DESC LIMIT ?';
      memoryParams.push(limit);

      const memories = db.db.prepare(memorySql).all(...memoryParams);

      for (const m of memories) {
        addResult({
          source: 'soul_memory',
          date: m.source_date || m.created_at?.substring(0, 10),
          content: m.content,
          category: m.category,
          tags: m.tags ? JSON.parse(m.tags) : [],
          score: 0.95  // memory는 명시적 사실이므로 최고 점수
        });
      }
      if (memories.length > 0) {
        console.log(`[recall_memory] 경로0(memory): ${memories.length}건`);
      }
    } catch (e) {
      console.warn('[recall_memory] 경로0 실패:', e.message);
    }

    // ========================================
    // 경로 1: 벡터 검색 (HNSW → brute-force 폴백)
    // 원문 임베딩이므로 결과가 곧 원문
    // ========================================
    try {
      const vectorStore = require('./vector-store');
      const vectorHits = await Promise.race([
        vectorStore.search(query, limit * 3, timeOpts),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ]);

      for (const r of vectorHits) {
        const similarity = 1 - r.distance;
        if (similarity < 0.3) continue;
        const dateStr = r.metadata?.sourceDate || (r.metadata?.timestamp || '').substring(0, 10);

        addResult({
          source: r.metadata?.source?.startsWith('conversation:') ? 'conversation' : (r.metadata?.source || 'vector'),
          date: dateStr,
          content: (r.text || '').substring(0, 500),
          role: r.metadata?.role,
          timestamp: r.metadata?.timestamp,
          score: similarity
        });
      }
      console.log(`[recall_memory] 경로1(벡터): ${results.length}건`);
    } catch (e) {
      console.warn('[recall_memory] 경로1 실패:', e.message);
    }

    // ========================================
    // 경로 2: 태그 검색 (벡터 결과 부족 시)
    // ========================================
    if (results.length < limit && keywords.length > 0) {
      try {
        const { getArchiverAsync } = require('./conversation-archiver');
        const archiver = await getArchiverAsync();
        const tagResults = await archiver.searchByTags(
          keywords,
          timeOpts.startDate || null,
          timeOpts.endDate || null,
          { matchType: 'any', limit: limit * 2, withContext: true }
        );

        for (const r of tagResults) {
          addResult({
            source: 'tag_search',
            date: r.date,
            content: r.content,
            role: r.role,
            timestamp: r.timestamp,
            context: r.context,
            score: 0.5 + (r.matchCount / Math.max(keywords.length, 1)) * 0.3
          });
        }
        console.log(`[recall_memory] 경로2(태그): +${tagResults.length}건 → 총 ${results.length}건`);
      } catch (e) {
        console.warn('[recall_memory] 경로2 실패:', e.message);
      }
    }

    // ========================================
    // 경로 3: 키워드 매칭 (여전히 부족할 때)
    // ========================================
    if (results.length < 2 && keywords.length > 0) {
      try {
        const { getArchiverAsync } = require('./conversation-archiver');
        const archiver = await getArchiverAsync();
        const kwResults = await archiver.searchByKeywords(keywords, {
          startDate: timeOpts.startDate || null,
          endDate: timeOpts.endDate || null,
          limit: limit * 2
        });

        for (const r of kwResults) {
          addResult({
            source: 'keyword_search',
            date: (r.timestamp || '').substring(0, 10),
            content: (r.content || '').substring(0, 500),
            role: r.role,
            timestamp: r.timestamp,
            score: 0.3 + r.matchRatio * 0.4
          });
        }
        console.log(`[recall_memory] 경로3(키워드): +${kwResults.length}건 → 총 ${results.length}건`);
      } catch (e) {
        console.warn('[recall_memory] 경로3 실패:', e.message);
      }
    }

    // === 정렬 + 반환 ===
    results.sort((a, b) => b.score - a.score);

    if (results.length === 0) {
      return {
        success: true, tool: 'recall_memory',
        input_summary: `"${query}" 검색 (${timeFilter || '전체 기간'})`,
        found: false,
        message: `"${query}" 관련 기억을 찾지 못했습니다. 검색 결과가 없으므로 사실만 이야기하세요. 기억에 없는 내용을 사실처럼 말하지 마세요. 다른 키워드로 재검색하거나, 사용자에게 직접 물어보세요.`
      };
    }

    const formatted = formatResults(results.slice(0, limit), timeRange);
    return { success: true, tool: 'recall_memory', input_summary: `"${query}" 검색 (${timeFilter || '전체 기간'})`, ...formatted };
  } catch (error) {
    console.error('[recall_memory] Error:', error);
    return { success: false, tool: 'recall_memory', error: error.message };
  }
}

function formatResults(results, timeRange) {
  const finalResults = results.map(r => {
    const result = { ...r };
    result.relevance = r.score?.toFixed(2);
    delete result.score;
    return result;
  });

  return {
    found: true,
    count: finalResults.length,
    timeRange: timeRange ? {
      from: timeRange.startDate.toISOString().split('T')[0],
      to: timeRange.endDate.toISOString().split('T')[0]
    } : null,
    results: finalResults
  };
}

/**
 * get_profile 구현 - 사용자 프로필 상세 조회
 */
async function getProfile({ field, userId } = {}) {
  try {
    const profile = await ProfileModel.getOrCreateDefault(userId || 'default');

    console.log(`[get_profile] field=${field || 'all'}`);

    // 특정 필드만 요청한 경우
    if (field) {
      const fieldLower = field.toLowerCase();
      const customField = (profile.customFields || []).find(f =>
        (f.label || '').toLowerCase().includes(fieldLower) ||
        (f.key || '').toLowerCase().includes(fieldLower)
      );

      if (customField) {
        return {
          success: true, tool: 'get_profile', input_summary: `"${field}" 필드 조회`,
          found: true,
          field: customField.label,
          value: customField.value
        };
      }

      // 기본 정보에서 찾기
      const basicInfo = profile.basicInfo || {};
      if (basicInfo[fieldLower]) {
        const val = basicInfo[fieldLower];
        return { success: true, tool: 'get_profile', input_summary: `"${field}" 필드 조회`, found: true, field, value: typeof val === 'object' ? val.value : val };
      }

      return { success: true, tool: 'get_profile', input_summary: `"${field}" 필드 조회`, found: false, message: `"${field}" 필드를 찾지 못했어.` };
    }

    // 전체 프로필 반환
    const basicInfo = profile.basicInfo || {};
    const simplifiedBasicInfo = {};
    for (const [key, val] of Object.entries(basicInfo)) {
      simplifiedBasicInfo[key] = typeof val === 'object' ? val.value : val;
    }

    return {
      success: true, tool: 'get_profile', input_summary: '전체 프로필 조회',
      found: true,
      basicInfo: simplifiedBasicInfo,
      customFields: (profile.customFields || []).map(f => ({
        label: f.label,
        value: f.value
      }))
    };
  } catch (error) {
    console.error('[get_profile] Error:', error);
    return { success: false, tool: 'get_profile', error: error.message };
  }
}

/**
 * update_profile 구현 - 대화 중 알게 된 정보 저장
 */
async function updateProfile({ field, value, userId }) {
  try {
    const profile = await ProfileModel.getOrCreateDefault(userId || 'default');

    console.log(`[update_profile] field="${field}", value="${value?.substring(0, 50)}..."`);

    // 기존 필드 찾기
    const existingIndex = profile.customFields.findIndex(f =>
      f.label.toLowerCase() === field.toLowerCase()
    );

    if (existingIndex >= 0) {
      // 기존 필드 업데이트
      profile.customFields[existingIndex].value = value;
      profile.customFields[existingIndex].updatedAt = new Date();
    } else {
      // 새 필드 추가
      profile.customFields.push({
        key: field.toLowerCase().replace(/\s+/g, '_'),
        label: field,
        value: value,
        category: 'learned',  // 대화에서 학습한 정보
        updatedAt: new Date()
      });
    }

    await profile.save();

    return {
      success: true, tool: 'update_profile', input_summary: `"${field}" = "${value?.substring(0, 30)}"`,
      message: `"${field}" 정보를 저장했어.`,
      action: existingIndex >= 0 ? 'updated' : 'created'
    };
  } catch (error) {
    console.error('[update_profile] Error:', error);
    return { success: false, tool: 'update_profile', error: error.message };
  }
}

/**

/**
 * execute_command 구현
 * 터미널 서비스의 PTY에서 명령어 실행, 결과 반환
 * 캔버스 터미널에도 실시간으로 표시됨
 */
async function executeCommandTool({ command, timeout = 30 }) {
  try {
    const terminalService = require('./terminal-service');

    if (!terminalService.isAvailable()) {
      return { success: false, tool: 'execute_command', error: 'node-pty를 사용할 수 없습니다' };
    }

    // 기본 세션 사용 (없으면 생성)
    const session = terminalService.getOrCreateSession({ sessionId: 'default' });

    // 명령어 실행 + 결과 대기
    const output = await terminalService.executeCommand(session.id, command, timeout * 1000);

    // 결과가 너무 길면 잘라서 반환 (AI 컨텍스트 절약)
    const maxLen = 3000;
    const truncated = output.length > maxLen
      ? output.slice(0, maxLen) + `\n...(${output.length - maxLen}자 생략)`
      : output;

    return {
      success: true, tool: 'execute_command', input_summary: command,
      command,
      output: truncated
    };
  } catch (error) {
    console.error('[execute_command] Error:', error);
    return { success: false, tool: 'execute_command', error: error.message, command };
  }
}

// ========================================
// Memory 도구 구현 (save/update/list)
// ========================================

/**
 * save_memory — 기억 저장 (upsert: 태그 매칭으로 기존 기억 자동 갱신)
 * - 같은 주제(태그 50%+ 겹침) 기억이 있으면 → 이전 내용 이력 백업 + 갱신
 * - 없으면 → 새로 생성
 * - reason: 왜 바뀌었는지 (선택)
 */
async function saveMemory({ content, category = 'general', tags, reason }) {
  try {
    const db = require('../db');
    const now = new Date().toISOString();
    const tagsJson = tags ? JSON.stringify(tags) : null;
    const sourceDate = now.substring(0, 10);

    // 1. 태그 기반으로 관련 기존 기억 검색
    let matched = null;
    if (tags && tags.length > 0) {
      const actives = db.db.prepare(
        'SELECT * FROM soul_memories WHERE is_active = 1'
      ).all();

      for (const row of actives) {
        const existingTags = row.tags ? JSON.parse(row.tags) : [];
        if (existingTags.length === 0) continue;
        const overlap = tags.filter(t => existingTags.some(
          et => et.toLowerCase() === t.toLowerCase()
        ));
        // 태그 50% 이상 겹치면 같은 주제
        const threshold = Math.ceil(Math.min(tags.length, existingTags.length) / 2);
        if (overlap.length >= threshold) {
          matched = row;
          break;
        }
      }
    }

    // 2. 완전 동일 내용 체크
    if (!matched) {
      const exact = db.db.prepare(
        'SELECT id FROM soul_memories WHERE content = ? AND is_active = 1'
      ).get(content);
      if (exact) {
        return { success: false, tool: 'save_memory', message: '이미 동일한 기억이 있어.', existing_id: exact.id };
      }
    }

    // 3-A. 기존 기억 갱신
    if (matched) {
      // 이전 내용을 이력 테이블에 백업
      db.db.prepare(
        'INSERT INTO soul_memory_history (memory_id, previous_content, reason, changed_at) VALUES (?, ?, ?, ?)'
      ).run(matched.id, matched.content, reason || null, now);

      // 기억 갱신
      db.db.prepare(
        'UPDATE soul_memories SET content = ?, category = ?, tags = ?, updated_at = ?, source_date = ? WHERE id = ?'
      ).run(content, category, tagsJson, now, sourceDate, matched.id);

      console.log(`[save_memory] UPDATED id=${matched.id} "${matched.content.substring(0, 30)}" → "${content.substring(0, 30)}" reason="${reason || ''}"`);

      return {
        success: true, tool: 'save_memory', input_summary: `기억 수정 (id: ${matched.id})`,
        id: matched.id,
        action: 'updated',
        previous: matched.content,
        message: reason
          ? `기억을 수정했어. (${reason})`
          : `기억을 수정했어.`
      };
    }

    // 3-B. 새 기억 저장
    const result = db.db.prepare(
      'INSERT INTO soul_memories (category, content, tags, source_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(category, content, tagsJson, sourceDate, now, now);

    console.log(`[save_memory] NEW id=${result.lastInsertRowid} category=${category} content="${content.substring(0, 50)}"`);

    return {
      success: true, tool: 'save_memory', input_summary: `새 기억 저장 "${content.substring(0, 30)}"`,
      id: result.lastInsertRowid,
      action: 'created',
      message: `새 기억을 저장했어.`
    };
  } catch (error) {
    console.error('[save_memory] Error:', error);
    return { success: false, tool: 'save_memory', error: error.message };
  }
}

/**
 * update_memory — 기존 기억 수정
 */
async function updateMemory({ memory_id, content, category, tags, is_active }) {
  try {
    const db = require('../db');

    const existing = db.db.prepare('SELECT * FROM soul_memories WHERE id = ?').get(memory_id);
    if (!existing) {
      return { success: false, tool: 'update_memory', message: `id ${memory_id} 기억을 찾지 못했어.` };
    }

    const updates = [];
    const values = [];

    if (content !== undefined) { updates.push('content = ?'); values.push(content); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (updates.length === 0) {
      return { success: false, tool: 'update_memory', message: '수정할 항목이 없어.' };
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(memory_id);

    db.db.prepare(`UPDATE soul_memories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    console.log(`[update_memory] id=${memory_id} fields=[${updates.join(',')}]`);

    return {
      success: true, tool: 'update_memory', input_summary: `기억 id ${memory_id} ${is_active === false ? '비활성화' : '수정'}`,
      message: is_active === false
        ? `기억 id ${memory_id}를 비활성화했어.`
        : `기억 id ${memory_id}를 수정했어.`
    };
  } catch (error) {
    console.error('[update_memory] Error:', error);
    return { success: false, tool: 'update_memory', error: error.message };
  }
}

/**
 * list_memories — 기억 목록 조회
 */
async function listMemories({ query, limit = 20, include_hidden = false } = {}) {
  try {
    const db = require('../db');

    let sql = 'SELECT * FROM soul_memories';
    const params = [];

    sql += include_hidden ? ' WHERE 1=1' : ' WHERE is_active = 1';

    if (query) {
      sql += ' AND (content LIKE ? OR tags LIKE ?)';
      params.push(`%${query}%`, `%${query}%`);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.db.prepare(sql).all(...params);

    const memories = rows.map(r => ({
      id: r.id,
      category: r.category,
      content: r.content,
      tags: r.tags ? JSON.parse(r.tags) : [],
      is_active: r.is_active === 1,
      sourceDate: r.source_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    console.log(`[list_memories] query="${query || ''}" include_hidden=${include_hidden} → ${memories.length}건`);

    return {
      success: true, tool: 'list_memories', input_summary: `기억 목록 (${query ? `"${query}" 검색` : '전체'})`,
      count: memories.length,
      memories
    };
  } catch (error) {
    console.error('[list_memories] Error:', error);
    return { success: false, tool: 'list_memories', error: error.message };
  }
}

// ========================================
// 태그 관리 도구 구현
// ========================================

/**
 * update_tags — 메시지 태그 수정
 * DB messages 테이블 + archive JSON 파일 양쪽 동기화
 */
async function updateTags({ message_id, tags, mode = 'add' }) {
  try {
    const db = require('../db');

    // 1. DB에서 메시지 조회
    const msg = db.db.prepare('SELECT id, tags, timestamp, content FROM messages WHERE id = ?').get(message_id);
    if (!msg) {
      return { success: false, tool: 'update_tags', message: `메시지 id ${message_id}를 찾지 못했어.` };
    }

    // 현재 태그 파싱
    let currentTags = [];
    try { currentTags = msg.tags ? JSON.parse(msg.tags) : []; } catch { currentTags = []; }

    // 모드별 처리
    let newTags;
    if (mode === 'replace') {
      newTags = tags;
    } else if (mode === 'add') {
      newTags = [...new Set([...currentTags, ...tags])];
    } else if (mode === 'remove') {
      const removeSet = new Set(tags);
      newTags = currentTags.filter(t => !removeSet.has(t));
    } else {
      return { success: false, tool: 'update_tags', message: `알 수 없는 mode: ${mode}` };
    }

    // 2. DB 업데이트
    db.db.prepare('UPDATE messages SET tags = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(newTags), new Date().toISOString(), message_id);

    // 3. Archive JSON 파일도 동기화
    try {
      const { getArchiverAsync } = require('./conversation-archiver');
      const archiver = await getArchiverAsync();
      if (msg.timestamp && archiver.updateMessageTags) {
        await archiver.updateMessageTags(msg.timestamp, newTags);
      }
    } catch (e) {
      console.warn('[update_tags] Archive 동기화 실패 (DB만 업데이트됨):', e.message);
    }

    console.log(`[update_tags] id=${message_id} mode=${mode} before=[${currentTags.join(',')}] after=[${newTags.join(',')}]`);

    return {
      success: true, tool: 'update_tags', input_summary: `메시지 ${message_id} 태그 ${mode}`,
      message_id,
      previous_tags: currentTags,
      current_tags: newTags,
      message: `태그를 ${mode === 'add' ? '추가' : mode === 'remove' ? '삭제' : '교체'}했어.`
    };
  } catch (error) {
    console.error('[update_tags] Error:', error);
    return { success: false, tool: 'update_tags', error: error.message };
  }
}

// ========================================
// 웹 검색 / 웹페이지 읽기 (Jina API 직접 호출)
// ========================================

/**
 * Jina API 키 로드 (DB에서 캐싱)
 */
let _jinaApiKey = null;
let _tavilyApiKey = null;

async function getTavilyApiKey() {
  if (_tavilyApiKey) return _tavilyApiKey;
  try {
    const configManager = require('./config');
    const config = await configManager.getConfigValue('web_search', {});
    if (config.enabled && config.apiKey) {
      _tavilyApiKey = config.apiKey;
      return _tavilyApiKey;
    }
  } catch (e) {
    console.warn('[Tavily] Failed to load API key from DB:', e.message);
  }
  return null;
}

async function getJinaApiKey() {
  if (_jinaApiKey) return _jinaApiKey;
  try {
    // 설정 > jina_reader.apiKey에서 로드 (키 없어도 r.jina.ai는 동작함)
    const configManager = require('./config');
    const config = await configManager.getConfigValue('jina_reader', {});
    if (config.apiKey) {
      _jinaApiKey = config.apiKey;
    }
  } catch (e) {
    // 키 없어도 정상 동작 (rate limit만 다름)
  }
  return _jinaApiKey;
}

/**
 * search_web — Tavily Search API
 * 월 1000회 무료, AI 특화 검색
 */
async function searchWeb({ query, days, search_depth }) {
  try {
    const apiKey = await getTavilyApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // 검색 옵션 구성
    const searchOptions = {
      api_key: apiKey,
      query: query,
      max_results: 5,
      include_answer: 'advanced',
      search_depth: search_depth || 'advanced'
    };

    // 날짜 필터 추가 (지정된 경우)
    if (days && days > 0) {
      searchOptions.days = days;
    }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchOptions),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 결과 정리
    const results = (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: (r.content || '').substring(0, 200)
    }));

    // AI 답변 포함 (있으면)
    const response = {
      success: true, tool: 'search_web', input_summary: `"${query}" 웹 검색`,
      query,
      results
    };

    if (data.answer) {
      response.ai_answer = data.answer;
    }

    console.log(`[search_web] query="${query}" → ${results.length}건${data.answer ? ' + AI 답변' : ''} (Tavily)`);
    return response;
  } catch (e) {
    console.error('[search_web] Error:', e.message);
    return { success: false, tool: 'search_web', error: e.message };
  }
}


// ========================================
// call_worker — 소울이가 알바(워커 Role)를 자율 호출
// ========================================

/**
 * 동적 call_worker 도구 정의 생성
 * callable 워커가 없으면 null (도구 미노출)
 */
async function getCallWorkerTool() {
  try {
    const db = require('../db');
    const rows = db.db.prepare(
      'SELECT role_id, name, config FROM roles WHERE is_active = 1 AND preferred_model IS NOT NULL AND preferred_model != ?'
    ).all('');

    const callableWorkers = rows.filter(r => {
      const config = typeof r.config === 'string' ? JSON.parse(r.config || '{}') : (r.config || {});
      return config.callableByAI === true;
    });

    if (callableWorkers.length === 0) return null;

    const workerList = callableWorkers.map(r => {
      const config = typeof r.config === 'string' ? JSON.parse(r.config || '{}') : (r.config || {});
      return `- ${r.role_id}: ${r.name} (${config.purpose || ''})`;
    }).join('\n');

    return {
      name: 'call_worker',
      description: `전문 워커를 호출하여 작업 위임. 이미지 분석 등 특수 작업에 사용.\n사용 가능:\n${workerList}`,
      input_schema: {
        type: 'object',
        properties: {
          worker_id: { type: 'string', description: '워커 ID (예: vision-worker)' },
          message: { type: 'string', description: '워커에게 전달할 요청' },
          image_ids: { type: 'array', items: { type: 'string' }, description: '분석할 이미지 파일명 (대화에서 공유된 이미지)' }
        },
        required: ['worker_id', 'message']
      }
    };
  } catch (e) {
    console.warn('[call_worker] Failed to build tool definition:', e.message);
    return null;
  }
}

/**
 * call_worker 실행기
 */
async function callWorker({ worker_id, message, image_ids }, context = {}) {
  try {
    const db = require('../db');
    const { AIServiceFactory } = require('./ai-service');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // 1. Role 검증
    const row = db.db.prepare(
      'SELECT * FROM roles WHERE role_id = ? AND is_active = 1'
    ).get(worker_id);

    if (!row) {
      return { success: false, tool: 'call_worker', error: `워커 '${worker_id}'를 찾을 수 없거나 비활성 상태입니다.` };
    }

    const config = typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {});

    if (!config.callableByAI) {
      return { success: false, tool: 'call_worker', error: `워커 '${worker_id}'는 AI 호출이 허용되지 않습니다.` };
    }

    if (!row.preferred_model) {
      return { success: false, tool: 'call_worker', error: `워커 '${worker_id}'에 모델이 설정되지 않았습니다.` };
    }

    // 2. 모델 체인 (preferred + fallback)
    const modelChain = [
      { modelId: row.preferred_model, serviceId: config.serviceId },
      ...(config.fallbackModels || [])
    ].filter(m => m.modelId && m.serviceId);

    if (modelChain.length === 0) {
      return { success: false, tool: 'call_worker', error: `워커 '${worker_id}'에 유효한 모델/서비스가 없습니다.` };
    }

    // 3. 이미지 로드
    const documents = [];
    if (image_ids && image_ids.length > 0) {
      const DATA_DIR = process.env.SOUL_DATA_DIR || path.join(os.homedir(), '.soul');
      const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
      const conversationImages = context.conversationImages || {};

      for (const imageId of image_ids) {
        const filename = imageId.includes('.') ? imageId : null;
        if (!filename) {
          console.warn(`[call_worker] Invalid image id: ${imageId}`);
          continue;
        }

        // 보안: 대화 이미지 목록에 있는 것만 허용
        if (!conversationImages[filename]) {
          console.warn(`[call_worker] Image '${filename}' not in conversation`);
          continue;
        }

        const filePath = path.join(UPLOAD_DIR, filename);
        try {
          const imageData = fs.readFileSync(filePath);
          const base64 = imageData.toString('base64');
          const mediaType = conversationImages[filename].type || 'image/jpeg';
          documents.push({ type: 'image', media_type: mediaType, data: base64 });
        } catch (e) {
          console.warn(`[call_worker] Failed to read image ${filename}:`, e.message);
        }
      }
    }

    // 4. 워커 모델 호출 (fallback 체인)
    let workerResult = null;
    let usedModel = null;
    const startTime = Date.now();

    for (const modelInfo of modelChain) {
      try {
        const workerService = await AIServiceFactory.createService(modelInfo.serviceId, modelInfo.modelId);
        const result = await workerService.chat(
          [{ role: 'user', content: message }],
          {
            systemPrompt: row.system_prompt || '',
            maxTokens: config.maxTokens || 1000,
            temperature: config.temperature || 0.3,
            documents: documents.length > 0 ? documents : undefined
          }
        );

        workerResult = typeof result === 'object' && result.text !== undefined ? result.text : result;
        usedModel = modelInfo.modelId;
        break;
      } catch (err) {
        console.warn(`[call_worker] ${modelInfo.modelId} failed:`, err.message);
        continue;
      }
    }

    if (!workerResult) {
      return { success: false, tool: 'call_worker', error: `워커 '${worker_id}' 실행 실패. 모든 모델에서 오류가 발생했습니다.` };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[call_worker] ${worker_id} completed (${usedModel}, ${elapsed}ms, ${documents.length} images)`);

    return {
      success: true,
      tool: 'call_worker',
      input_summary: `워커 "${worker_id}"에게 "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}" 전달`,
      worker: worker_id,
      model: usedModel,
      result: workerResult,
      imageCount: documents.length
    };
  } catch (error) {
    console.error('[call_worker] Error:', error);
    return { success: false, tool: 'call_worker', error: error.message };
  }
}

// ============================================================
// 메시징 도구 실행 함수
// ============================================================

async function sendMessageTool(input) {
  try {
    const { getProactiveMessenger } = require('./proactive-messenger');
    const messenger = await getProactiveMessenger();
    if (messenger) {
      await messenger.sendNow({
        type: 'ai_initiated',
        message: input.message,
        priority: input.priority || 'normal'
      });
    }
    return { success: true, tool: 'send_message', input_summary: `메시지 전송 (${input.priority || 'normal'})`, message: '메시지 전송 완료' };
  } catch (error) {
    return { success: false, tool: 'send_message', error: error.message };
  }
}

async function scheduleMessageTool(input) {
  try {
    const scheduledMessages = require('./scheduled-messages');

    let delaySeconds;
    if (input.send_at) {
      const sendAtMs = new Date(input.send_at).getTime();
      delaySeconds = Math.max(1, Math.round((sendAtMs - Date.now()) / 1000));
    } else {
      delaySeconds = input.delay_seconds || 60;
    }

    const result = await scheduledMessages.schedule(input.message, delaySeconds);
    const scheduledFor = new Date(Date.now() + delaySeconds * 1000).toISOString();

    return {
      success: true, tool: 'schedule_message', input_summary: `${delaySeconds}초 후 메시지 예약`,
      schedule_id: result.scheduleId,
      scheduled_for: scheduledFor
    };
  } catch (error) {
    return { success: false, tool: 'schedule_message', error: error.message };
  }
}

async function cancelScheduleTool(input) {
  try {
    const scheduledMessages = require('./scheduled-messages');
    const result = await scheduledMessages.cancel(input.schedule_id);
    return result
      ? { success: true, tool: 'cancel_schedule', input_summary: `예약 ${input.schedule_id} 취소` }
      : { success: false, tool: 'cancel_schedule', error: '예약을 찾을 수 없음' };
  } catch (error) {
    return { success: false, tool: 'cancel_schedule', error: error.message };
  }
}

async function listSchedulesTool(input) {
  try {
    const scheduledMessages = require('./scheduled-messages');
    const pending = await scheduledMessages.list();
    return { success: true, tool: 'list_schedules', input_summary: '예약 메시지 목록 조회', scheduled: pending };
  } catch (error) {
    return { success: false, tool: 'list_schedules', error: error.message };
  }
}

// ========== 캘린더 도구 핸들러 ==========

async function getEvents({ start_date, end_date, query }) {
  try {
    const db = require('../db/sqlite');
    const Event = db.getModel('Event');

    // 날짜 파싱 (자연어 지원)
    let startDate = start_date;
    if (start_date === '오늘' || start_date === 'today') {
      startDate = new Date().toISOString().split('T')[0];
    } else if (start_date === '내일' || start_date === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      startDate = tomorrow.toISOString().split('T')[0];
    }

    let endDate = end_date || startDate;

    // DB에서 일정 조회
    const events = Event.findAll();

    let filtered = events.filter(e => {
      const eventDate = e.startTime.split('T')[0];
      return eventDate >= startDate && eventDate <= endDate;
    });

    // 쿼리 검색
    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(lowerQuery) ||
        (e.description && e.description.toLowerCase().includes(lowerQuery))
      );
    }

    return {
      success: true, tool: 'get_events', input_summary: `${startDate}~${endDate} 일정 조회`,
      count: filtered.length,
      events: filtered.map(e => ({
        eventId: e.eventId,
        title: e.title,
        description: e.description,
        start: e.startTime,
        end: e.endTime,
        location: e.location,
        reminderMinutes: e.reminderMinutes,
        tags: e.tags
      }))
    };
  } catch (error) {
    console.error('[getEvents] Error:', error);
    return { success: false, tool: 'get_events', error: error.message };
  }
}

async function createEvent({ title, start, end, description, location, reminder_minutes }) {
  try {
    const db = require('../db/sqlite');
    const Event = db.getModel('Event');

    if (!title || !start) {
      return { success: false, tool: 'create_event', error: '제목과 시작 시간은 필수입니다' };
    }

    const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // end가 없으면 start + 1시간
    let endTime = end;
    if (!endTime) {
      const startDate = new Date(start);
      startDate.setHours(startDate.getHours() + 1);
      endTime = startDate.toISOString();
    }

    Event.create({
      eventId,
      title,
      description: description || null,
      startTime: start,
      endTime: endTime,
      location: location || null,
      reminderMinutes: reminder_minutes || null,
      tags: null
    });

    return {
      success: true, tool: 'create_event', input_summary: `"${title}" 일정 생성`,
      event_id: eventId,
      message: '일정이 생성되었습니다'
    };
  } catch (error) {
    console.error('[createEvent] Error:', error);
    return { success: false, tool: 'create_event', error: error.message };
  }
}

async function updateEvent({ event_id, title, start, end, description, location }) {
  try {
    const db = require('../db/sqlite');
    const Event = db.getModel('Event');

    if (!event_id) {
      return { success: false, tool: 'update_event', error: 'event_id가 필요합니다' };
    }

    const event = Event.findOne({ eventId: event_id });
    if (!event) {
      return { success: false, tool: 'update_event', error: '일정을 찾을 수 없습니다' };
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (start !== undefined) updates.startTime = start;
    if (end !== undefined) updates.endTime = end;
    if (description !== undefined) updates.description = description;
    if (location !== undefined) updates.location = location;

    Event.update({ eventId: event_id }, updates);

    return {
      success: true, tool: 'update_event', input_summary: `일정 ${event_id} 수정`,
      message: '일정이 업데이트되었습니다'
    };
  } catch (error) {
    console.error('[updateEvent] Error:', error);
    return { success: false, tool: 'update_event', error: error.message };
  }
}

async function deleteEvent({ event_id }) {
  try {
    const db = require('../db/sqlite');
    const Event = db.getModel('Event');

    if (!event_id) {
      return { success: false, tool: 'delete_event', error: 'event_id가 필요합니다' };
    }

    const event = Event.findOne({ eventId: event_id });
    if (!event) {
      return { success: false, tool: 'delete_event', error: '일정을 찾을 수 없습니다' };
    }

    Event.delete({ eventId: event_id });

    return {
      success: true, tool: 'delete_event', input_summary: `일정 ${event_id} 삭제`,
      message: '일정이 삭제되었습니다'
    };
  } catch (error) {
    console.error('[deleteEvent] Error:', error);
    return { success: false, tool: 'delete_event', error: error.message };
  }
}

// ========== 할 일 도구 핸들러 ==========

async function manageTodo(input) {
  const { action, todo_id, title, description, due_date, priority, status, query, tags } = input;

  try {
    const db = require('../db/sqlite');
    const Todo = db.getModel('Todo');

    switch (action) {
      case 'add': {
        if (!title) {
          return { success: false, tool: 'manage_todo', error: '제목은 필수입니다' };
        }

        const todoId = `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tagsJson = tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null;

        Todo.create({
          todoId,
          title,
          description: description || null,
          status: status || 'pending',
          priority: priority || 'medium',
          dueDate: due_date || null,
          tags: tagsJson
        });

        return {
          success: true, tool: 'manage_todo', input_summary: `할일 추가 "${title}"`,
          todo_id: todoId,
          message: '할일이 추가되었습니다'
        };
      }

      case 'list': {
        let todos = Todo.findAll();

        if (query) {
          const lowerQuery = query.toLowerCase();
          todos = todos.filter(t =>
            t.title.toLowerCase().includes(lowerQuery) ||
            (t.description && t.description.toLowerCase().includes(lowerQuery))
          );
        }

        if (status) {
          todos = todos.filter(t => t.status === status);
        }

        return {
          success: true, tool: 'manage_todo', input_summary: `할일 목록 조회${query ? ` "${query}"` : ''}`,
          todos: todos.map(t => ({
            todoId: t.todoId,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            tags: t.tags,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            completedAt: t.completedAt
          }))
        };
      }

      case 'done':
      case 'complete': {
        if (!todo_id) return { success: false, tool: 'manage_todo', error: 'todo_id가 필요합니다' };
        const todo = Todo.findOne({ todoId: todo_id });
        if (!todo) return { success: false, tool: 'manage_todo', error: '할일을 찾을 수 없습니다' };

        Todo.update(
          { todoId: todo_id },
          { status: 'completed', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        );

        return { success: true, tool: 'manage_todo', input_summary: `할일 ${todo_id} 완료`, message: '할일이 완료되었습니다' };
      }

      case 'update': {
        if (!todo_id) return { success: false, tool: 'manage_todo', error: 'todo_id가 필요합니다' };
        const todo = Todo.findOne({ todoId: todo_id });
        if (!todo) return { success: false, tool: 'manage_todo', error: '할일을 찾을 수 없습니다' };

        const updates = { updatedAt: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (priority !== undefined) updates.priority = priority;
        if (due_date !== undefined) updates.dueDate = due_date;
        if (status !== undefined) {
          updates.status = status;
          if (status === 'completed' && !todo.completedAt) updates.completedAt = new Date().toISOString();
          else if (status !== 'completed') updates.completedAt = null;
        }
        if (tags !== undefined) updates.tags = tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null;

        Todo.update({ todoId: todo_id }, updates);

        return { success: true, tool: 'manage_todo', input_summary: `할일 ${todo_id} 수정`, message: '할일이 업데이트되었습니다' };
      }

      case 'delete': {
        if (!todo_id) return { success: false, tool: 'manage_todo', error: 'todo_id가 필요합니다' };
        const todo = Todo.findOne({ todoId: todo_id });
        if (!todo) return { success: false, tool: 'manage_todo', error: '할일을 찾을 수 없습니다' };

        Todo.delete({ todoId: todo_id });

        return { success: true, tool: 'manage_todo', input_summary: `할일 ${todo_id} 삭제`, message: '할일이 삭제되었습니다' };
      }

      default:
        return { success: false, tool: 'manage_todo', error: `Unknown action: ${action}` };
    }
  } catch (error) {
    console.error('[manageTodo] Error:', error);
    return { success: false, tool: 'manage_todo', error: error.message || '할일 처리 중 오류가 발생했습니다' };
  }
}

// ========== 메모 도구 핸들러 ==========

async function manageNote(input) {
  const { action, note_id, title, content, query, limit = 20, tags } = input;

  try {
    const db = require('../db/sqlite');
    const Note = db.getModel('Note');
    switch (action) {
      case 'create': {
        if (!title) {
          return { success: false, tool: 'manage_note', error: '제목은 필수입니다' };
        }

        const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tagsJson = tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null;

        Note.create({
          noteId,
          title,
          content: content || null,
          tags: tagsJson
        });

        return {
          success: true,
          tool: 'manage_note',
          input_summary: `메모 생성: "${title}"`,
          note_id: noteId,
          message: '메모가 생성되었습니다'
        };
      }

      case 'list': {
        let notes = Note.findAll();

        // 쿼리 필터링
        if (query) {
          const lowerQuery = query.toLowerCase();
          notes = notes.filter(n =>
            n.title.toLowerCase().includes(lowerQuery) ||
            (n.content && n.content.toLowerCase().includes(lowerQuery))
          );
        }

        // limit 적용
        notes = notes.slice(0, limit);

        return {
          success: true,
          tool: 'manage_note',
          input_summary: `메모 목록${query ? ` (검색: "${query}")` : ''} ${notes.length}건`,
          notes: notes.map(n => ({
            noteId: n.noteId,
            title: n.title,
            content: n.content,
            tags: n.tags,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt
          }))
        };
      }

      case 'read': {
        if (!note_id) {
          return { success: false, tool: 'manage_note', error: 'note_id가 필요합니다' };
        }

        const note = Note.findOne({ noteId: note_id });
        if (!note) {
          return { success: false, tool: 'manage_note', error: '메모를 찾을 수 없습니다' };
        }

        return {
          success: true,
          tool: 'manage_note',
          input_summary: `메모 ${note_id} 읽기`,
          note: {
            noteId: note.noteId,
            title: note.title,
            content: note.content,
            tags: note.tags,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt
          }
        };
      }

      case 'update': {
        if (!note_id) {
          return { success: false, tool: 'manage_note', error: 'note_id가 필요합니다' };
        }

        const note = Note.findOne({ noteId: note_id });
        if (!note) {
          return { success: false, tool: 'manage_note', error: '메모를 찾을 수 없습니다' };
        }

        const updates = { updatedAt: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (tags !== undefined) {
          updates.tags = tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null;
        }

        Note.update({ noteId: note_id }, updates);

        return {
          success: true,
          tool: 'manage_note',
          input_summary: `메모 ${note_id} 수정`,
          message: '메모가 업데이트되었습니다'
        };
      }

      case 'delete': {
        if (!note_id) {
          return { success: false, tool: 'manage_note', error: 'note_id가 필요합니다' };
        }

        const note = Note.findOne({ noteId: note_id });
        if (!note) {
          return { success: false, tool: 'manage_note', error: '메모를 찾을 수 없습니다' };
        }

        Note.delete({ noteId: note_id });

        return {
          success: true,
          tool: 'manage_note',
          input_summary: `메모 ${note_id} 삭제`,
          message: '메모가 삭제되었습니다'
        };
      }

      default:
        return { success: false, tool: 'manage_note', error: `Unknown action: ${action}` };
    }
  } catch (error) {
    console.error('[manageNote] Error:', error);
    return {
      success: false,
      tool: 'manage_note',
      error: error.message || '메모 처리 중 오류가 발생했습니다'
    };
  }
}

// ========== 브라우저 도구 핸들러 ==========

async function browse({ url, selector }) {
  // Jina Reader로 웹페이지 마크다운 추출 (read_url과 동일 백엔드, 더 긴 결과)
  try {
    const apiKey = await getJinaApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const headers = { 'Accept': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    if (selector) headers['X-Target-Selector'] = selector;

    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const content = (data.data?.content || data.content || '').substring(0, 8000);
    const title = data.data?.title || data.title || '';

    console.log(`[browse] url="${url}" → ${content.length}자${selector ? ` (selector: ${selector})` : ''}`);
    return { success: true, tool: 'browse', input_summary: `${url} 페이지 읽기`, title, url, content };
  } catch (e) {
    console.error('[browse] Error:', e.message);
    return { success: false, tool: 'browse', error: e.message };
  }
}

// ========== 파일시스템 도구 핸들러 ==========

const fs = require('fs');
const fsPath = require('path');
const readline = require('readline');
const { validatePath } = require('./file-security');
const { getSnapshotManager } = require('./file-snapshot');

/**
 * file_read — 스트리밍 라인 기반 파일 읽기
 */
async function fileRead({ path: filePath, offset = 0, limit = 200 }) {
  try {
    const resolved = await validatePath(filePath);

    // 파일 존재 확인
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) {
      return { success: false, tool: 'file_read', error: '파일이 아닙니다 (디렉토리일 수 있음).', path: resolved };
    }

    // 스트리밍 라인 읽기 (메모리 효율)
    const lines = [];
    let lineNum = 0;
    let totalLines = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(resolved, { encoding: 'utf-8' }),
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      totalLines++;
      if (lineNum >= offset && lineNum < offset + limit) {
        lines.push(line);
      }
      lineNum++;
      // 읽기 완료 후에도 총 라인수 파악을 위해 끝까지 진행
    }

    const content = lines.join('\n');

    return {
      success: true,
      tool: 'file_read',
      input_summary: `${filePath} (라인 ${offset}~${offset + lines.length - 1})`,
      result: {
        path: resolved,
        content,
        lineCount: lines.length,
        totalLines,
        offset,
        hasMore: offset + limit < totalLines
      }
    };
  } catch (error) {
    console.error('[file_read] Error:', error.message);
    return { success: false, tool: 'file_read', error: error.message, path: filePath };
  }
}

/**
 * file_write — 파일 쓰기 (턴 단위 스냅샷 자동)
 */
async function fileWrite({ path: filePath, content, mode = 'rewrite' }, turnId) {
  try {
    const resolved = await validatePath(filePath);

    // 부모 디렉토리 확인/생성
    const dir = fsPath.dirname(resolved);
    await fs.promises.mkdir(dir, { recursive: true });

    // 턴 단위 스냅샷 (되돌리기용)
    const snapshotMgr = getSnapshotManager();
    const snapshotId = turnId || `turn_${Date.now()}`;
    const { isNew } = await snapshotMgr.takeSnapshot(snapshotId, resolved);

    // 이전 내용 미리보기 (파인튜닝 데이터용)
    let previousPreview = null;
    if (!isNew) {
      try {
        const prev = await fs.promises.readFile(resolved, 'utf-8');
        previousPreview = prev.length > 200 ? prev.slice(0, 200) + '...' : prev;
      } catch { /* 무시 */ }
    }

    // 쓰기
    if (mode === 'append') {
      await fs.promises.appendFile(resolved, content, 'utf-8');
    } else {
      await fs.promises.writeFile(resolved, content, 'utf-8');
    }

    const stat = await fs.promises.stat(resolved);

    return {
      success: true,
      tool: 'file_write',
      input_summary: `${filePath}에 ${mode === 'append' ? '추가' : '작성'} (${Buffer.byteLength(content, 'utf-8')}바이트)`,
      result: {
        path: resolved,
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
        totalSize: stat.size,
        mode,
        isNewFile: isNew,
        snapshot_id: snapshotId
      },
      previous_state: previousPreview
    };
  } catch (error) {
    console.error('[file_write] Error:', error.message);
    return { success: false, tool: 'file_write', error: error.message, path: filePath };
  }
}

/**
 * file_list — 디렉토리 목록 (depth 지원)
 */
async function fileList({ path: dirPath, pattern, depth = 1 }) {
  try {
    const resolved = await validatePath(dirPath);

    const stat = await fs.promises.stat(resolved);
    if (!stat.isDirectory()) {
      return { success: false, tool: 'file_list', error: '디렉토리가 아닙니다.', path: resolved };
    }

    // depth 제한
    const maxDepth = Math.min(Math.max(depth, 1), 3);
    const contents = [];

    async function scanDir(currentPath, currentDepth) {
      if (currentDepth > maxDepth) return;

      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        // 숨김 파일 제외 (. 으로 시작)
        if (entry.name.startsWith('.')) continue;

        const fullPath = fsPath.join(currentPath, entry.name);
        const relativePath = fsPath.relative(resolved, fullPath);

        // 패턴 필터
        if (pattern) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
          if (!entry.isDirectory() && !regex.test(entry.name)) continue;
        }

        try {
          const entryStat = await fs.promises.stat(fullPath);
          contents.push({
            type: entry.isDirectory() ? 'directory' : 'file',
            name: entry.name,
            path: relativePath,
            size: entry.isDirectory() ? null : entryStat.size,
            modified: entryStat.mtime.toISOString()
          });

          // 하위 디렉토리 재귀
          if (entry.isDirectory() && currentDepth < maxDepth) {
            await scanDir(fullPath, currentDepth + 1);
          }
        } catch {
          // 접근 불가 파일 건너뜀
        }
      }
    }

    await scanDir(resolved, 1);

    return {
      success: true,
      tool: 'file_list',
      input_summary: `${dirPath} (depth: ${maxDepth}${pattern ? `, pattern: ${pattern}` : ''})`,
      result: {
        path: resolved,
        itemCount: contents.length,
        contents
      }
    };
  } catch (error) {
    console.error('[file_list] Error:', error.message);
    return { success: false, tool: 'file_list', error: error.message, path: dirPath };
  }
}

/**
 * file_info — 파일 메타데이터
 */
async function fileInfo({ path: filePath }) {
  try {
    const resolved = await validatePath(filePath);
    const stat = await fs.promises.stat(resolved);

    const info = {
      path: resolved,
      type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
      size: stat.size,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      permissions: (stat.mode & 0o777).toString(8)
    };

    // 텍스트 파일이면 라인수도
    if (stat.isFile() && stat.size < 10 * 1024 * 1024) { // 10MB 미만
      try {
        let lineCount = 0;
        const rl = readline.createInterface({
          input: fs.createReadStream(resolved),
          crlfDelay: Infinity
        });
        for await (const _ of rl) lineCount++;
        info.lineCount = lineCount;
      } catch { /* 바이너리 파일 등 */ }
    }

    return {
      success: true,
      tool: 'file_info',
      input_summary: `${filePath} 메타데이터 조회`,
      result: info
    };
  } catch (error) {
    console.error('[file_info] Error:', error.message);
    return { success: false, tool: 'file_info', error: error.message, path: filePath };
  }
}

/**
 * file_restore — 턴 단위 되돌리기
 */
async function fileRestore({ turn_id, list_only = false }) {
  try {
    const snapshotMgr = getSnapshotManager();

    // 목록만 조회
    if (list_only) {
      const turns = snapshotMgr.listRestorableTurns();
      return {
        success: true,
        tool: 'file_restore',
        input_summary: '되돌릴 수 있는 턴 목록 조회',
        result: {
          restorable_turns: turns,
          count: turns.length
        }
      };
    }

    // turn_id 미지정 시 가장 최근 턴
    let targetTurnId = turn_id;
    if (!targetTurnId) {
      const turns = snapshotMgr.listRestorableTurns();
      if (turns.length === 0) {
        return { success: false, tool: 'file_restore', error: '되돌릴 수 있는 변경 이력이 없습니다.' };
      }
      targetTurnId = turns[0].turnId;
    }

    const result = await snapshotMgr.restoreTurn(targetTurnId);

    return {
      success: result.restored.length > 0,
      tool: 'file_restore',
      input_summary: `턴 ${targetTurnId} 되돌리기`,
      result: {
        turn_id: targetTurnId,
        restored: result.restored,
        errors: result.errors
      }
    };
  } catch (error) {
    console.error('[file_restore] Error:', error.message);
    return { success: false, tool: 'file_restore', error: error.message };
  }
}

// ========== 클라우드 스토리지 도구 핸들러 (Google Drive) ==========

/**
 * GDrive 인스턴스 가져오기 (미연결 시 에러 반환)
 * DB config에서 자동 로드 지원
 */
async function _getGDrive() {
  const { getGDriveStorage, resetGDriveStorage } = require('./gdrive-storage');

  // 이미 인스턴스가 있으면 바로 반환
  let gdrive = getGDriveStorage();
  if (gdrive) return gdrive;

  // DB에서 config 로드 시도
  try {
    const configManager = require('./config');
    const gdriveConfig = await configManager.getConfigValue('gdrive', {});

    if (gdriveConfig.keyFile && gdriveConfig.folderId) {
      resetGDriveStorage();
      gdrive = getGDriveStorage({
        keyData: gdriveConfig.keyFile, // DB에 저장된 JSON 객체
        folderId: gdriveConfig.folderId
      });
    }
  } catch (e) {
    console.warn('[_getGDrive] DB config 로드 실패:', e.message);
  }

  if (!gdrive) {
    throw new Error('Google Drive 미연결. Cloud 패널에서 서비스 계정 키를 등록하세요.');
  }
  return gdrive;
}

async function cloudSearch({ query, file_type = 'any' }) {
  try {
    const gdrive = await _getGDrive();
    const files = await gdrive.searchFiles(query, file_type);

    return {
      success: true,
      tool: 'cloud_search',
      input_summary: `"${query}" 검색 (타입: ${file_type})`,
      result: {
        query,
        file_type,
        count: files.length,
        files
      }
    };
  } catch (error) {
    console.error('[cloud_search] Error:', error.message);
    return { success: false, tool: 'cloud_search', error: error.message };
  }
}

async function cloudRead({ file_id }) {
  try {
    const gdrive = await _getGDrive();
    const file = await gdrive.readFileById(file_id);

    return {
      success: true,
      tool: 'cloud_read',
      input_summary: `파일 ${file.name} (${file_id}) 읽기`,
      result: {
        file_id,
        name: file.name,
        mimeType: file.mimeType,
        content: file.content
      }
    };
  } catch (error) {
    console.error('[cloud_read] Error:', error.message);
    return { success: false, tool: 'cloud_read', error: error.message };
  }
}

async function cloudWrite({ title, content, folder_id, file_id, mime_type = 'text/plain' }) {
  try {
    const gdrive = await _getGDrive();
    const result = await gdrive.createOrUpdateFile(title, content, folder_id, file_id, mime_type);

    return {
      success: true,
      tool: 'cloud_write',
      input_summary: `${file_id ? '수정' : '생성'}: ${title}`,
      result: {
        file_id: result.fileId,
        title,
        webViewLink: result.webViewLink,
        action: file_id ? 'updated' : 'created'
      }
    };
  } catch (error) {
    console.error('[cloud_write] Error:', error.message);
    return { success: false, tool: 'cloud_write', error: error.message };
  }
}

async function cloudDelete({ file_id }) {
  try {
    const gdrive = await _getGDrive();
    await gdrive.trashFile(file_id);

    return {
      success: true,
      tool: 'cloud_delete',
      input_summary: `파일 ${file_id} 휴지통 이동`,
      result: {
        file_id,
        action: 'trashed'
      }
    };
  } catch (error) {
    console.error('[cloud_delete] Error:', error.message);
    return { success: false, tool: 'cloud_delete', error: error.message };
  }
}

async function cloudList({ folder_id, limit = 20 }) {
  try {
    const gdrive = await _getGDrive();
    const files = await gdrive.listFolder(folder_id, limit);

    return {
      success: true,
      tool: 'cloud_list',
      input_summary: `폴더 ${folder_id || '루트'} 목록 (최대 ${limit}개)`,
      result: {
        folder_id: folder_id || 'root',
        count: files.length,
        files
      }
    };
  } catch (error) {
    console.error('[cloud_list] Error:', error.message);
    return { success: false, tool: 'cloud_list', error: error.message };
  }
}

async function cloudMkdir({ name, parent_id }) {
  try {
    const gdrive = await _getGDrive();
    const result = await gdrive.createFolder(name, parent_id);

    return {
      success: true,
      tool: 'cloud_mkdir',
      input_summary: `폴더 "${name}" 생성`,
      result: {
        name,
        folder_id: result.folderId,
        parent_id: parent_id || 'root'
      }
    };
  } catch (error) {
    console.error('[cloud_mkdir] Error:', error.message);
    return { success: false, tool: 'cloud_mkdir', error: error.message };
  }
}

// ========== 시스템 도구 핸들러 ==========

/**
 * open_terminal — 내장 터미널 UI 열기
 * 프론트엔드에 터미널 열기 이벤트 전송
 */
async function openTerminal({ command }, options = {}) {
  try {
    const io = options.io;
    const socketId = options.socketId;

    if (!io || !socketId) {
      return {
        success: false,
        tool: 'open_terminal',
        error: 'Socket 연결이 없습니다. 터미널을 수동으로 열어주세요.'
      };
    }

    // 프론트엔드에 터미널 열기 이벤트 전송
    io.to(socketId).emit('open_terminal', {
      command: command || null
    });

    console.log(`[open_terminal] 터미널 열기 요청 (command: ${command || 'none'})`);

    return {
      success: true,
      tool: 'open_terminal',
      input_summary: command ? `터미널 열기 + "${command}" 실행` : '터미널 열기',
      message: command
        ? `터미널을 열고 "${command}" 명령을 실행합니다.`
        : '터미널을 열었습니다.'
    };
  } catch (error) {
    console.error('[open_terminal] Error:', error);
    return { success: false, tool: 'open_terminal', error: error.message };
  }
}

async function getWeather({ location, days = 1 }) {
  try {
    // 지역 결정 (생략 시 사용자 프로필에서)
    let loc = location;
    if (!loc) {
      try {
        const configManager = require('./config');
        const profiles = await configManager.getConfigValue('profiles', []);
        const active = profiles.find(p => p.isActive);
        if (active?.basicInfo?.location?.value) {
          loc = active.basicInfo.location.value;
        }
      } catch (e) { /* ignore */ }
    }
    if (!loc) loc = '서울';

    // 기상청 API 키 확인
    let kmaApiKey = null;
    try {
      const configManager = require('./config');
      const weatherConfig = await configManager.getConfigValue('weather_api', {});
      if (weatherConfig.apiKey) kmaApiKey = weatherConfig.apiKey;
    } catch (e) { /* ignore */ }

    // 기상청 API 키 있으면 기상청, 없으면 Open-Meteo 폴백
    if (kmaApiKey) {
      return await getWeatherKMA(loc, days, kmaApiKey);
    } else {
      return await getWeatherOpenMeteo(loc, days);
    }
  } catch (e) {
    console.error('[get_weather] Error:', e.message);
    return { success: false, tool: 'get_weather', error: e.message };
  }
}

/**
 * 기상청 예보 API (공공데이터포털)
 * - 단기예보 (오늘~글피): getVilageFcst
 * - 중기기온예보 (4~7일): getMidTa
 * - 중기육상예보 (4~7일): getMidLandFcst
 * - 같은 서비스키로 단기+중기 모두 호출 가능
 * - 격자 좌표(nx, ny) 사용
 */
async function getWeatherKMA(location, days, apiKey) {
  // 지역명 → 기상청 격자 좌표 + 중기예보 지역코드
  const cityGrid = {
    '서울': { nx: 60, ny: 127, midTa: '11B10101', midLand: '11B00000' },
    '부산': { nx: 98, ny: 76, midTa: '11H20201', midLand: '11H20000' },
    '인천': { nx: 55, ny: 124, midTa: '11B20201', midLand: '11B00000' },
    '대구': { nx: 89, ny: 90, midTa: '11H10701', midLand: '11H10000' },
    '대전': { nx: 67, ny: 100, midTa: '11C20401', midLand: '11C20000' },
    '광주': { nx: 58, ny: 74, midTa: '11F20501', midLand: '11F20000' },
    '울산': { nx: 102, ny: 84, midTa: '11H20101', midLand: '11H20000' },
    '세종': { nx: 66, ny: 103, midTa: '11C20404', midLand: '11C20000' },
    '수원': { nx: 60, ny: 121, midTa: '11B20601', midLand: '11B00000' },
    '성남': { nx: 63, ny: 124, midTa: '11B20605', midLand: '11B00000' },
    '고양': { nx: 57, ny: 128, midTa: '11B20302', midLand: '11B00000' },
    '용인': { nx: 64, ny: 119, midTa: '11B20612', midLand: '11B00000' },
    '창원': { nx: 91, ny: 77, midTa: '11H20301', midLand: '11H20000' },
    '제주': { nx: 52, ny: 38, midTa: '11G00201', midLand: '11G00000' },
    '천안': { nx: 63, ny: 110, midTa: '11C20301', midLand: '11C20000' },
    '전주': { nx: 63, ny: 89, midTa: '11F10201', midLand: '11F10000' },
    '청주': { nx: 69, ny: 107, midTa: '11C10301', midLand: '11C10000' },
    '포항': { nx: 102, ny: 94, midTa: '11H10201', midLand: '11H10000' },
    '춘천': { nx: 73, ny: 134, midTa: '11D10301', midLand: '11D10000' },
    '강릉': { nx: 92, ny: 131, midTa: '11D20501', midLand: '11D20000' },
    '여수': { nx: 73, ny: 66, midTa: '11F20401', midLand: '11F20000' },
    '경주': { nx: 100, ny: 91, midTa: '11H10202', midLand: '11H10000' },
    '김포': { nx: 55, ny: 126, midTa: '11B20102', midLand: '11B00000' },
    '파주': { nx: 56, ny: 131, midTa: '11B20305', midLand: '11B00000' },
  };

  const grid = cityGrid[location];
  if (!grid) {
    return { success: false, tool: 'get_weather', error: `"${location}" 지역의 기상청 좌표가 등록되지 않았습니다. 등록된 도시: ${Object.keys(cityGrid).join(', ')}` };
  }

  // base_date, base_time 계산 (가장 최근 발표 시각)
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC → KST
  const baseTimes = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
  const kstHour = kstNow.getUTCHours();
  const kstMin = kstNow.getUTCMinutes();
  const currentTime = kstHour * 100 + kstMin;

  // API 데이터는 발표시각 + 10분 후부터 제공
  let baseTime = '2300';
  let baseDate = new Date(kstNow);
  for (let i = baseTimes.length - 1; i >= 0; i--) {
    if (currentTime >= parseInt(baseTimes[i]) + 10) {
      baseTime = baseTimes[i];
      break;
    }
  }
  // 0200 이전이면 전날 2300 사용
  if (currentTime < 210) {
    baseDate.setUTCDate(baseDate.getUTCDate() - 1);
  }

  const baseDateStr = `${baseDate.getUTCFullYear()}${String(baseDate.getUTCMonth() + 1).padStart(2, '0')}${String(baseDate.getUTCDate()).padStart(2, '0')}`;

  // 단기예보 호출
  const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` +
    `?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=300&pageNo=1&dataType=JSON` +
    `&base_date=${baseDateStr}&base_time=${baseTime}&nx=${grid.nx}&ny=${grid.ny}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.response?.body?.items?.item) {
    const errMsg = data.response?.header?.resultMsg || 'API 응답 오류';
    console.error('[get_weather] KMA error:', errMsg, JSON.stringify(data.response?.header));
    return { success: false, tool: 'get_weather', error: `기상청 API 오류: ${errMsg}` };
  }

  const items = data.response.body.items.item;

  // 날짜별로 그룹핑
  const byDate = {};
  for (const item of items) {
    const d = item.fcstDate;
    if (!byDate[d]) byDate[d] = {};
    const cat = item.category;
    const time = item.fcstTime;
    const val = item.fcstValue;

    if (cat === 'TMN') byDate[d].temp_min = parseFloat(val);
    if (cat === 'TMX') byDate[d].temp_max = parseFloat(val);
    if (cat === 'POP') byDate[d].rain_chance = Math.max(byDate[d].rain_chance || 0, parseInt(val));
    if (cat === 'PCP' && val !== '강수없음') byDate[d].precipitation = val;
    if (cat === 'REH') byDate[d].humidity = byDate[d].humidity || parseInt(val);
    if (cat === 'WSD') byDate[d].wind_speed = byDate[d].wind_speed || parseFloat(val);

    // 현재 시각에 가장 가까운 TMP, SKY, PTY
    if (cat === 'TMP' && !byDate[d].temperature) byDate[d].temperature = parseFloat(val);
    if (cat === 'SKY' && !byDate[d].sky) byDate[d].sky = val;
    if (cat === 'PTY' && !byDate[d].pty) byDate[d].pty = val;
  }

  // SKY/PTY → 한국어 날씨
  const skyDesc = (sky, pty) => {
    if (pty && pty !== '0') {
      const ptyMap = { '1': '비', '2': '비/눈', '3': '눈', '4': '소나기', '5': '빗방울', '6': '빗방울/눈날림', '7': '눈날림' };
      return ptyMap[pty] || '강수';
    }
    const skyMap = { '1': '맑음', '3': '구름많음', '4': '흐림' };
    return skyMap[sky] || '맑음';
  };

  const dates = Object.keys(byDate).sort();
  const todayStr = baseDateStr;
  const todayData = byDate[todayStr] || byDate[dates[0]] || {};

  const result = {
    success: true,
    tool: 'get_weather',
    input_summary: `${location} ${days}일 예보 (기상청)`,
    source: '기상청',
    location,
    current: {
      temperature: todayData.temperature,
      humidity: todayData.humidity,
      weather: skyDesc(todayData.sky, todayData.pty),
      wind_speed: todayData.wind_speed
    },
    forecast: dates.slice(0, Math.min(days, dates.length)).map(d => {
      const fd = byDate[d];
      return {
        date: `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`,
        weather: skyDesc(fd.sky, fd.pty),
        temp_max: fd.temp_max,
        temp_min: fd.temp_min,
        rain_chance: fd.rain_chance || 0,
        precipitation: fd.precipitation || '없음'
      };
    })
  };

  // 중기예보 (4일 이후, 같은 API 키)
  if (days >= 4) {
    try {
      // 중기예보 발표시각: 06시, 18시
      const midBaseTime = kstHour >= 18 ? '1800' : '0600';
      let midBaseDate = new Date(kstNow);
      if (kstHour < 6) {
        midBaseDate.setUTCDate(midBaseDate.getUTCDate() - 1);
      }
      const midBaseDateStr = `${midBaseDate.getUTCFullYear()}${String(midBaseDate.getUTCMonth() + 1).padStart(2, '0')}${String(midBaseDate.getUTCDate()).padStart(2, '0')}`;
      const midTmFc = midBaseDateStr + midBaseTime;

      // 중기기온예보
      const midTaUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa` +
        `?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=10&pageNo=1&dataType=JSON` +
        `&regId=${grid.midTa}&tmFc=${midTmFc}`;
      const midTaRes = await fetch(midTaUrl);
      const midTaData = await midTaRes.json();

      // 중기육상예보 (날씨 상태)
      const midLandUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst` +
        `?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=10&pageNo=1&dataType=JSON` +
        `&regId=${grid.midLand}&tmFc=${midTmFc}`;
      const midLandRes = await fetch(midLandUrl);
      const midLandData = await midLandRes.json();

      const midTaItem = midTaData.response?.body?.items?.item?.[0];
      const midLandItem = midLandData.response?.body?.items?.item?.[0];

      if (midTaItem) {
        // 4~7일 후 예보 추가
        for (let d = 4; d <= Math.min(days, 7); d++) {
          const futureDate = new Date(kstNow);
          futureDate.setUTCDate(futureDate.getUTCDate() + d);
          const futureDateStr = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, '0')}-${String(futureDate.getUTCDate()).padStart(2, '0')}`;

          const midForecast = {
            date: futureDateStr,
            temp_max: midTaItem[`taMax${d}`],
            temp_min: midTaItem[`taMin${d}`],
            rain_chance: midLandItem ? midLandItem[`rnSt${d}Am`] || midLandItem[`rnSt${d}`] || 0 : 0,
            weather: midLandItem ? (midLandItem[`wf${d}Am`] || midLandItem[`wf${d}`] || '') : '',
            precipitation: '없음'
          };
          result.forecast.push(midForecast);
        }
      }
    } catch (midErr) {
      console.warn('[get_weather] 중기예보 조회 실패 (단기만 반환):', midErr.message);
    }
  }

  console.log(`[get_weather] ${location} → ${result.current.temperature}°C ${result.current.weather} (기상청, ${result.forecast.length}일)`);
  return result;
}

/**
 * Open-Meteo 폴백 (기상청 API 키 없을 때, 해외 지역)
 */
async function getWeatherOpenMeteo(location, days) {
  const koToEn = {
    '서울': 'Seoul', '부산': 'Busan', '인천': 'Incheon', '대구': 'Daegu',
    '대전': 'Daejeon', '광주': 'Gwangju', '울산': 'Ulsan', '세종': 'Sejong',
    '수원': 'Suwon', '창원': 'Changwon', '제주': 'Jeju', '천안': 'Cheonan',
    '전주': 'Jeonju', '청주': 'Cheongju', '춘천': 'Chuncheon', '강릉': 'Gangneung',
    '도쿄': 'Tokyo', '오사카': 'Osaka', '뉴욕': 'New York', '런던': 'London',
    '파리': 'Paris', '베이징': 'Beijing', '상하이': 'Shanghai', '방콕': 'Bangkok'
  };
  const searchName = koToEn[location] || location;

  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchName)}&count=1`);
  const geoData = await geoRes.json();
  if (!geoData.results?.length) {
    return { success: false, tool: 'get_weather', error: `"${location}" 위치를 찾을 수 없습니다.` };
  }

  const { latitude, longitude } = geoData.results[0];
  const forecastDays = Math.min(Math.max(days || 1, 1), 7);
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
    `&timezone=auto&forecast_days=${forecastDays}`
  );
  const weather = await weatherRes.json();

  const weatherDesc = (code) => {
    const map = {
      0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림',
      45: '안개', 48: '안개(서리)', 51: '이슬비', 53: '이슬비', 55: '이슬비',
      61: '비', 63: '비', 65: '폭우', 71: '눈', 73: '눈', 75: '폭설',
      80: '소나기', 81: '소나기', 82: '폭우', 85: '눈소나기', 86: '폭설',
      95: '천둥번개', 96: '우박', 99: '우박'
    };
    return map[code] || `코드${code}`;
  };

  const displayName = koToEn[location] ? location : geoData.results[0].name;
  const result = {
    success: true,
    tool: 'get_weather',
    input_summary: `${displayName} ${forecastDays}일 예보 (Open-Meteo)`,
    source: 'Open-Meteo',
    location: displayName,
    current: {
      temperature: weather.current.temperature_2m,
      feels_like: weather.current.apparent_temperature,
      humidity: weather.current.relative_humidity_2m,
      weather: weatherDesc(weather.current.weather_code),
      wind_speed: weather.current.wind_speed_10m
    },
    forecast: weather.daily.time.map((date, i) => ({
      date,
      weather: weatherDesc(weather.daily.weather_code[i]),
      temp_max: weather.daily.temperature_2m_max[i],
      temp_min: weather.daily.temperature_2m_min[i],
      precipitation: weather.daily.precipitation_sum[i],
      rain_chance: weather.daily.precipitation_probability_max[i]
    }))
  };

  console.log(`[get_weather] ${displayName} → ${result.current.temperature}°C ${result.current.weather} (Open-Meteo)`);
  return result;
}

/**
 * 내장 도구인지 확인
 */
function isBuiltinTool(toolName) {
  if (toolName === 'call_worker') return true;
  return builtinTools.some(t => t.name === toolName);
}

/**
 * 파인튜닝 모델용 최소 도구 스키마 생성
 * description 제거, parameter description 제거 → 토큰 대폭 절약
 * 파인튜닝 모델은 도구 사용법을 DNA로 학습했으므로 이름+파라미터 구조만 있으면 됨
 */
function getMinimalTools(tools) {
  return tools.map(t => {
    const schema = t.input_schema || { type: 'object', properties: {} };
    // properties에서 description 제거, 구조만 유지
    const minProps = {};
    if (schema.properties) {
      for (const [key, val] of Object.entries(schema.properties)) {
        const { description, ...rest } = val;
        minProps[key] = rest;
      }
    }
    return {
      name: t.name,
      description: t.description, // 도구 설명은 유지 (파라미터 설명만 제거)
      input_schema: {
        type: 'object',
        properties: minProps,
        ...(schema.required ? { required: schema.required } : {})
      }
    };
  });
}

module.exports = {
  builtinTools,
  getCallWorkerTool,
  getMinimalTools,
  executeBuiltinTool,
  isBuiltinTool
};
