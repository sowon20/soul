/**
 * MongoDB messages → JSONL 마이그레이션 스크립트
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/soul';
const OUTPUT_PATH = path.join(__dirname, '../../memory/conversations.jsonl');

// Message 스키마 (간단히)
const messageSchema = new mongoose.Schema({
  sessionId: String,
  role: String,
  content: String,
  timestamp: Date,
  tokens: Number,
  metadata: Object
}, { collection: 'messages' });

const Message = mongoose.model('Message', messageSchema);

async function migrate() {
  console.log('🚀 MongoDB → JSONL 마이그레이션 시작');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB 연결됨');
    
    // 전체 메시지 조회 (시간순)
    const messages = await Message.find().sort({ timestamp: 1 }).lean();
    console.log(`📊 총 ${messages.length}개 메시지 발견`);
    
    // 디렉토리 생성
    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // JSONL 형식으로 변환
    const lines = messages.map(msg => {
      const timestamp = new Date(msg.timestamp).toISOString();
      const id = `${timestamp.replace(/[:.]/g, '-')}_${msg.role}`;
      
      return JSON.stringify({
        id,
        role: msg.role,
        text: msg.content,
        timestamp,
        tags: msg.metadata?.tags || [],
        thought: msg.metadata?.thought || null,
        emotion: msg.metadata?.emotion || null,
        tokens: msg.tokens || 0
      });
    });
    
    // 파일 쓰기
    fs.writeFileSync(OUTPUT_PATH, lines.join('\n') + '\n');
    console.log(`✅ ${OUTPUT_PATH} 저장 완료`);
    console.log(`📝 ${lines.length}개 라인 작성됨`);
    
    // 샘플 출력
    console.log('\n📋 샘플 (처음 3개):');
    lines.slice(0, 3).forEach(line => console.log(line));
    
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB 연결 해제');
  }
}

migrate();
