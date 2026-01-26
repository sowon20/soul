/**
 * 기존 메시지에 태그 일괄 생성 (독립 실행)
 * 사용: ANTHROPIC_API_KEY=sk-xxx node backfill-tags-standalone.js
 */
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const JSONL_PATH = '/Volumes/sowon-cloud/memory/conversations.jsonl';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY 환경변수 필요!');
  console.log('사용법: ANTHROPIC_API_KEY=sk-xxx node backfill-tags-standalone.js');
  process.exit(1);
}

const client = new Anthropic({ apiKey });

async function generateTags(content) {
  try {
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
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

async function backfillTags() {
  console.log('=== 태그 일괄 생성 시작 ===');
  
  const content = fs.readFileSync(JSONL_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  console.log(`총 ${lines.length}개 메시지`);
  
  let updated = 0;
  let skipped = 0;
  const newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    try {
      const msg = JSON.parse(lines[i]);
      
      if (msg.tags && msg.tags.length > 0) {
        newLines.push(lines[i]);
        skipped++;
        continue;
      }
      
      const text = msg.text || msg.content || '';
      if (text.length < 10) {
        newLines.push(lines[i]);
        skipped++;
        continue;
      }
      
      const tags = await generateTags(text.slice(0, 500));
      
      if (tags && tags.length > 0) {
        msg.tags = tags;
        newLines.push(JSON.stringify(msg));
        updated++;
        console.log(`[${i+1}/${lines.length}] ${msg.role}: ${tags.join(', ')}`);
      } else {
        newLines.push(lines[i]);
        skipped++;
      }
      
      // API 속도 제한
      await new Promise(r => setTimeout(r, 300));
      
    } catch (err) {
      console.error(`Error at line ${i}:`, err.message);
      newLines.push(lines[i]);
    }
  }
  
  fs.writeFileSync(JSONL_PATH, newLines.join('\n') + '\n');
  
  console.log('=== 완료 ===');
  console.log(`업데이트: ${updated}개, 스킵: ${skipped}개`);
}

backfillTags().catch(console.error);
