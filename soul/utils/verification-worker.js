/**
 * Verification Worker (검증 알바)
 * 도구 실행 결과를 검증하여 AI의 거짓/날조를 감지
 */

const { AIServiceFactory } = require('./ai-service');
const { trackCall } = require('./alba-stats');
const Memory = require('../models/Memory');

// === 시스템 프롬프트 ===
const VERIFICATION_SYSTEM_PROMPT = `당신은 AI 도구 실행 검증관입니다.
AI가 도구를 호출한 뒤 반환된 결과가 진짜인지 판별합니다.

## 핵심 원칙
당신은 "도구가 정상 작동했는가"만 판별합니다.
"결과가 질문에 유용한가"는 판별 대상이 아닙니다.

## 판별 기준
1. 도구가 실행되었고 결과 데이터가 존재하는가?
2. result가 빈값([], {}, null, "")인데 AI가 결과를 꾸며낼 위험이 있는가?
3. result가 에러인데 성공으로 포장할 위험이 있는가?

## pass vs fail 기준 (엄격히 지켜야 함)
- result에 데이터가 있으면 → pass (관련성이 낮아도 도구는 정상 작동한 것)
- result가 found:true, count:N (N>0) → pass
- result가 [], {}, null, "", found:false, count:0 → fail (빈 결과)
- result가 에러 메시지 → fail

## 절대 하지 말 것
- 검색/메모리 결과의 "주제 관련성"으로 fail 주지 마라
- recall_memory가 5건 반환했는데 주제와 안 맞아도 → pass (도구는 정상 작동)
- 결과가 존재하면 무조건 pass. 관련성 판단은 AI의 몫이지 검증관의 몫이 아님

## memo 작성 규칙
20자 이내로 압축. 핵심만. 예시:
- pass: "5건 조회, 결과 정상"
- pass: "프로필 저장 일치"
- fail: "result:[]. 날조 위험"
- fail: "결과 0건. 링크 불가"
- note: "1건 조회, 관련성 낮음"

## 응답 형식 (JSON 한 줄만 출력, 다른 텍스트 절대 금지)
{"verdict":"pass","memo":"5건 조회, 정상"}

verdict:
- "pass": 정상 실행, 결과 신뢰 가능
- "fail": 날조/거짓 감지 (빈 결과, 결과 조작, 미실행)
- "note": 확실한 거짓은 아니나 참고 사항 있음`;

// === 설정 ===
// 검증 알바 설정 — DB에 등록된 알바 설정이 있으면 그걸 우선 사용
const VERIFICATION_CONFIG = {
  roleId: 'verification-worker',
  primaryModel: 'openai/gpt-oss-20b:free',
  serviceId: 'openrouter',
  temperature: 0.1,
  maxTokens: 300,
  fallbackModels: [
    { modelId: 'google/gemini-2.0-flash-exp:free', serviceId: 'openrouter' },
    { modelId: 'meta-llama/llama-4-scout:free', serviceId: 'openrouter' }
  ]
};

/**
 * DB에서 검증 알바 설정 읽기 (UI에서 모델 변경 시 즉시 반영)
 */
async function getVerificationConfig() {
  try {
    const db = require('../db');
    if (!db.db) db.init();
    const role = db.Role.findOne({ roleId: 'verification-worker' });
    if (role && role.preferredModel) {
      const roleConfig = typeof role.config === 'string' ? JSON.parse(role.config) : (role.config || {});
      return {
        primaryModel: role.preferredModel,
        serviceId: roleConfig.serviceId || VERIFICATION_CONFIG.serviceId,
        temperature: roleConfig.temperature ?? VERIFICATION_CONFIG.temperature,
        maxTokens: roleConfig.maxTokens ?? VERIFICATION_CONFIG.maxTokens,
        fallbackModels: roleConfig.fallbackModels || VERIFICATION_CONFIG.fallbackModels
      };
    }
  } catch (e) {
    console.warn('[Verify] DB 설정 읽기 실패, 기본값 사용:', e.message);
  }
  return VERIFICATION_CONFIG;
}

// === 스킵 대상 도구 ===
const SKIP_VERIFICATION_TOOLS = new Set([
  'get_profile',              // 읽기 전용, 날조 위험 없음
  'list_scheduled_messages',  // 단순 목록 조회
]);

/**
 * 검증 응답 파싱
 */
function parseVerificationResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        verdict: ['pass', 'fail', 'note'].includes(parsed.verdict) ? parsed.verdict : 'pass',
        memo: (parsed.memo || '').substring(0, 30)
      };
    }
  } catch (e) {
    // JSON 파싱 실패 → 키워드 감지
  }

  const lower = (text || '').toLowerCase();
  if (lower.includes('fail') || lower.includes('거짓') || lower.includes('날조') || lower.includes('조작')) {
    return { verdict: 'fail', memo: text.substring(0, 30) };
  }
  if (lower.includes('note') || lower.includes('참고') || lower.includes('의심') || lower.includes('재검토')) {
    return { verdict: 'note', memo: text.substring(0, 30) };
  }
  return { verdict: 'pass', memo: text.substring(0, 30) };
}

/**
 * 도구 실행 결과 검증
 * @param {Object} params
 * @param {string} params.toolName - 도구 이름
 * @param {Object} params.input - 도구 입력
 * @param {*} params.result - 도구 실행 결과
 * @param {string} params.userMessage - 사용자 원본 메시지
 * @returns {{ verdict: 'pass'|'fail'|'note'|'skip', memo: string }}
 */
async function verifyToolResult({ toolName, input, result, userMessage }) {
  // 스킵 대상 확인
  if (SKIP_VERIFICATION_TOOLS.has(toolName)) {
    return { verdict: 'skip', memo: null };
  }

  // DB에서 알바 설정 읽기 (UI에서 모델 변경 시 즉시 반영)
  const config = await getVerificationConfig();

  // 검증 프롬프트 구성 (컴팩트)
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  const resultPreview = resultStr.substring(0, 500);
  const inputStr = JSON.stringify(input).substring(0, 300);
  const userMsg = (userMessage || '').substring(0, 200);

  const prompt = `도구: ${toolName}
입력: ${inputStr}
결과: ${resultPreview}
사용자 메시지: ${userMsg}

이 도구 실행 결과를 검증하세요.`;

  // 모델 체인 (DB 설정 > 기본값)
  const models = [
    { modelId: config.primaryModel, serviceId: config.serviceId },
    ...config.fallbackModels
  ];

  const startTime = Date.now();

  for (const modelInfo of models) {
    try {
      const vService = await AIServiceFactory.createService(modelInfo.serviceId, modelInfo.modelId);
      const vResult = await vService.chat(
        [{ role: 'user', content: prompt }],
        {
          systemPrompt: VERIFICATION_SYSTEM_PROMPT,
          maxTokens: VERIFICATION_CONFIG.maxTokens,
          temperature: VERIFICATION_CONFIG.temperature,
          tools: null,
          toolExecutor: null
        }
      );

      const text = typeof vResult === 'object' ? (vResult.text || vResult.content || JSON.stringify(vResult)) : vResult;
      const parsed = parseVerificationResponse(text);
      const latency = Date.now() - startTime;

      // 알바 통계 기록
      trackCall('verification-worker', {
        action: 'verify',
        tokens: 0,
        latencyMs: latency,
        success: true,
        model: modelInfo.modelId,
        detail: `${toolName}: ${parsed.verdict} — ${parsed.memo}`
      });

      console.log(`[Verify] ${parsed.verdict === 'pass' ? '✅' : parsed.verdict === 'fail' ? '❌' : '📝'} ${toolName}: ${parsed.memo} (${latency}ms, ${modelInfo.modelId})`);

      return parsed;
    } catch (err) {
      console.warn(`[Verify] ${modelInfo.modelId} 실패: ${err.message}`);
      trackCall('verification-worker', {
        action: 'verify',
        latencyMs: Date.now() - startTime,
        success: false,
        model: modelInfo.modelId,
        detail: err.message
      });
      continue; // 다음 모델 시도
    }
  }

  // 모든 모델 실패 → 기본 통과 (차단 방지)
  console.warn('[Verify] 모든 검증 모델 실패 — 기본 통과');
  return { verdict: 'pass', memo: '검증 서비스 불가 — 기본 통과' };
}

/**
 * 거짓말 기록 메모리 저장
 * @param {Object} params
 * @param {string} params.toolName
 * @param {Object} params.input
 * @param {*} params.result
 * @param {string} params.memo
 * @param {number} params.failCount
 */
async function saveLieRecord({ toolName, input, result, memo, failCount }) {
  try {
    const db = require('../db');
    if (!db.db) db.init();

    const key = `lie_${toolName}_${Date.now()}`;
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

    await Memory.upsert('lie_record', key, {
      toolName,
      input: JSON.stringify(input).substring(0, 500),
      resultPreview: resultStr.substring(0, 500),
      verificationMemo: memo,
      failCount,
      timestamp: new Date().toISOString()
    }, {
      importance: 9,
      tags: ['거짓', 'verification', 'tool_misuse', toolName],
      category: 'verification'
    });

    console.log(`[Verify] 거짓 기록 저장: ${key}`);
  } catch (e) {
    console.error('[Verify] 거짓 기록 저장 실패:', e.message);
  }
}

module.exports = {
  verifyToolResult,
  saveLieRecord,
  SKIP_VERIFICATION_TOOLS,
  VERIFICATION_CONFIG,
  VERIFICATION_SYSTEM_PROMPT
};
