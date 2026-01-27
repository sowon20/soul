/**
 * API 키 관리 통합 스크립트
 *
 * 사용법:
 *   node api-keys.js setup    - 초기 API 키 설정
 *   node api-keys.js update   - API 키 업데이트
 *   node api-keys.js migrate  - 레거시 APIKey 컬렉션에서 마이그레이션
 *   node api-keys.js status   - 현재 API 키 상태 확인
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/soul';

async function connectDB() {
  await mongoose.connect(mongoUri);
  console.log('✅ MongoDB 연결됨');
  return mongoose.connection.db;
}

async function disconnectDB() {
  await mongoose.connection.close();
  console.log('🔌 MongoDB 연결 해제');
}

/**
 * 초기 API 키 설정 (APIKey 모델 사용)
 */
async function setup() {
  console.log('=== API 키 초기 설정 ===');

  const APIKey = require('../models/APIKey');

  if (process.env.ANTHROPIC_API_KEY) {
    await APIKey.saveKey('anthropic', process.env.ANTHROPIC_API_KEY);
    console.log('✅ Anthropic API 키 저장됨');
  } else {
    console.log('⚠️  ANTHROPIC_API_KEY 환경 변수가 없습니다');
  }

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here') {
    await APIKey.saveKey('openai', process.env.OPENAI_API_KEY);
    console.log('✅ OpenAI API 키 저장됨');
  }

  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_google_key_here') {
    await APIKey.saveKey('google', process.env.GOOGLE_API_KEY);
    console.log('✅ Google API 키 저장됨');
  }

  await showStatus();
}

/**
 * API 키 업데이트 (AIService 컬렉션 직접 업데이트)
 */
async function update() {
  console.log('=== API 키 업데이트 ===');

  const db = mongoose.connection.db;
  const servicesCollection = db.collection('aiservices');

  if (process.env.ANTHROPIC_API_KEY) {
    const result = await servicesCollection.updateOne(
      { serviceId: 'anthropic' },
      { $set: { apiKey: process.env.ANTHROPIC_API_KEY } }
    );
    console.log(`✅ Anthropic API 키 업데이트됨 (${result.modifiedCount}개)`);
  } else {
    console.log('⚠️  ANTHROPIC_API_KEY 환경 변수가 없습니다');
  }

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here') {
    const result = await servicesCollection.updateOne(
      { serviceId: 'openai' },
      { $set: { apiKey: process.env.OPENAI_API_KEY } }
    );
    console.log(`✅ OpenAI API 키 업데이트됨 (${result.modifiedCount}개)`);
  }

  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_google_key_here') {
    const result = await servicesCollection.updateOne(
      { serviceId: 'google' },
      { $set: { apiKey: process.env.GOOGLE_API_KEY } }
    );
    console.log(`✅ Google API 키 업데이트됨 (${result.modifiedCount}개)`);
  }

  await showStatus();
}

/**
 * 레거시 APIKey 컬렉션에서 마이그레이션
 */
async function migrate() {
  console.log('=== API 키 마이그레이션 ===');

  const db = mongoose.connection.db;
  const servicesCollection = db.collection('aiservices');
  const apikeysCollection = db.collection('apikeys');

  // APIKey 컬렉션에서 키 가져오기
  const apiKeys = await apikeysCollection.find({}).toArray();
  console.log(`📦 ${apiKeys.length}개의 API 키 발견`);

  for (const keyDoc of apiKeys) {
    const service = keyDoc.service;
    const encryptedKey = keyDoc.encryptedKey;

    if (!encryptedKey) {
      console.log(`⚠️  ${service}: 키가 비어있음, 건너뜀`);
      continue;
    }

    const result = await servicesCollection.updateOne(
      { serviceId: service },
      { $set: { apiKey: encryptedKey } }
    );

    if (result.matchedCount > 0) {
      console.log(`✅ ${service}: API 키 마이그레이션 완료`);
    } else {
      console.log(`⚠️  ${service}: 해당 서비스 없음`);
    }
  }

  // 환경변수에서 키 가져와서 초기화
  console.log('\n📝 환경변수에서 API 키 초기화');
  if (process.env.ANTHROPIC_API_KEY) {
    await servicesCollection.updateOne(
      { serviceId: 'anthropic' },
      { $set: { apiKey: process.env.ANTHROPIC_API_KEY, isActive: true } }
    );
    console.log('✅ Anthropic: 환경변수에서 설정');
  }

  // 불필요한 apiKeyRef 필드 제거
  console.log('\n🧹 정리: apiKeyRef 필드 제거');
  const cleanResult = await servicesCollection.updateMany(
    {},
    { $unset: { apiKeyRef: '' } }
  );
  console.log(`✅ ${cleanResult.modifiedCount}개 문서에서 apiKeyRef 제거`);

  // APIKey 컬렉션 삭제
  console.log('\n🗑️  APIKey 컬렉션 삭제 (더 이상 필요 없음)');
  await apikeysCollection.drop().catch(() => console.log('   (이미 삭제됨)'));

  await showStatus();
}

/**
 * 현재 API 키 상태 확인
 */
async function showStatus() {
  console.log('\n📊 현재 API 키 상태:');

  const db = mongoose.connection.db;
  const servicesCollection = db.collection('aiservices');

  const services = await servicesCollection.find({}).toArray();
  for (const service of services) {
    const hasKey = service.apiKey && service.apiKey.length > 0;
    const status = service.isActive ? '활성' : '비활성';
    const name = (service.name || service.serviceId || 'unknown').padEnd(20);
    console.log(`- ${name} [${status}]: ${hasKey ? '✓ 설정됨' : '✗ 미설정'}`);
  }
}

/**
 * 메인 실행
 */
async function main() {
  const command = process.argv[2] || 'status';

  try {
    await connectDB();

    switch (command) {
      case 'setup':
        await setup();
        break;
      case 'update':
        await update();
        break;
      case 'migrate':
        await migrate();
        break;
      case 'status':
        await showStatus();
        break;
      default:
        console.log('사용법: node api-keys.js [setup|update|migrate|status]');
    }

    await disconnectDB();
    console.log('\n✅ 완료');
  } catch (error) {
    console.error('❌ 오류:', error);
    process.exit(1);
  }
}

main();
