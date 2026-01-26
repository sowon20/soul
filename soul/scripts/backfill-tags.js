/**
 * 기존 메시지에 태그 일괄 생성
 */
const fs = require('fs');
const path = require('path');

// alba-worker 경로
const { getAlbaWorker } = require('../utils/alba-worker');

const JSONL_PATH = '/Volumes/sowon-cloud/memory/conversations.jsonl';

async function backfillTags() {
  console.log('=== 태그 일괄 생성 시작 ===');
  
  // JSONL 읽기
  const content = fs.readFileSync(JSONL_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  console.log(`총 ${lines.length}개 메시지`);
  
  const alba = await getAlbaWorker();
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
      if (text.length < 5) {
        newLines.push(lines[i]);
        skipped++;
        continue;
      }
      
      // 태그 생성
      const tags = await alba.generateTags(text, {});
      
      if (tags && tags.length > 0) {
        msg.tags = tags;
        newLines.push(JSON.stringify(msg));
        updated++;
        console.log(`[${i+1}/${lines.length}] ${msg.role}: ${tags.join(', ')}`);
      } else {
        newLines.push(lines[i]);
        skipped++;
      }
      
      // API 속도 제한 방지
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.error(`Error at line ${i}:`, err.message);
      newLines.push(lines[i]);
    }
  }
  
  // 저장
  fs.writeFileSync(JSONL_PATH, newLines.join('\n') + '\n');
  
  console.log('=== 완료 ===');
  console.log(`업데이트: ${updated}개`);
  console.log(`스킵: ${skipped}개`);
}

backfillTags().catch(console.error);
