/**
 * 기존 메시지에 태그 일괄 생성
 *
 * 사용법:
 *   node backfill-tags.js             - alba-worker 사용 (서버 환경)
 *   node backfill-tags.js --standalone - 독립 실행 (ANTHROPIC_API_KEY 필요)
 *
 * 환경변수:
 *   JSONL_PATH 또는 MEMORY_STORAGE_PATH - 대화 파일 경로
 *   ANTHROPIC_API_KEY - standalone 모드시 필요
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');

// JSONL 경로 결정
const JSONL_PATH = process.env.JSONL_PATH ||
  (process.env.MEMORY_STORAGE_PATH
    ? `${process.env.MEMORY_STORAGE_PATH}/conversations.jsonl`
    : path.resolve(__dirname, '../../memory/conversations.jsonl'));

const isStandalone = process.argv.includes('--standalone');

/**
 * Standalone 모드: 직접 Anthropic API 호출
 */
async function generateTagsStandalone(content) {
  const Anthropic = require('@anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 환경변수 필요!');
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `메시지를 보고 검색용 태그 3-5개 생성. 한국어 명사/감정 위주. JSON 배열로만 출력.

메시지: ${content}

태그:`
      }]
    });

    const text = response.content[0].text;
    const match = text.match(/\[.*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (err) {
    console.error('API error:', err.message);
  }
  return [];
}

/**
 * Alba Worker 모드: 서버의 alba-worker 사용
 */
async function generateTagsWithAlba(alba, content) {
  return await alba.generateTags(content, {});
}

async function backfillTags() {
  console.log('=== 태그 일괄 생성 시작 ===');
  console.log(`모드: ${isStandalone ? 'Standalone (직접 API 호출)' : 'Alba Worker'}`);
  console.log(`파일: ${JSONL_PATH}`);

  // 파일 존재 확인
  if (!fs.existsSync(JSONL_PATH)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${JSONL_PATH}`);
    process.exit(1);
  }

  // JSONL 읽기
  const content = fs.readFileSync(JSONL_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  console.log(`총 ${lines.length}개 메시지\n`);

  let alba = null;
  if (!isStandalone) {
    const { getAlbaWorker } = require('../utils/alba-worker');
    alba = await getAlbaWorker();
  }

  let updated = 0;
  let skipped = 0;
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const msg = JSON.parse(lines[i]);

      // 이미 태그 있으면 스킵
      if (msg.tags && msg.tags.length > 0) {
        newLines.push(lines[i]);
        skipped++;
        continue;
      }

      const text = msg.text || msg.content || '';
      const minLength = isStandalone ? 10 : 5;

      if (text.length < minLength) {
        newLines.push(lines[i]);
        skipped++;
        continue;
      }

      // 태그 생성
      const tags = isStandalone
        ? await generateTagsStandalone(text.slice(0, 500))
        : await generateTagsWithAlba(alba, text);

      if (tags && tags.length > 0) {
        msg.tags = tags;
        newLines.push(JSON.stringify(msg));
        updated++;
        console.log(`[${i + 1}/${lines.length}] ${msg.role}: ${tags.join(', ')}`);
      } else {
        newLines.push(lines[i]);
        skipped++;
      }

      // API 속도 제한 방지
      await new Promise(r => setTimeout(r, isStandalone ? 300 : 500));

    } catch (err) {
      console.error(`Error at line ${i}:`, err.message);
      newLines.push(lines[i]);
    }
  }

  // 저장
  fs.writeFileSync(JSONL_PATH, newLines.join('\n') + '\n');

  console.log('\n=== 완료 ===');
  console.log(`업데이트: ${updated}개`);
  console.log(`스킵: ${skipped}개`);
}

backfillTags().catch(console.error);
