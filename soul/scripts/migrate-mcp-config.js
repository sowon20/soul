#!/usr/bin/env node
/**
 * migrate-mcp-config.js
 * server-config.json → MongoDB 마이그레이션
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../mcp/server-config.json');

async function migrate() {
  console.log('🔄 MCP 설정 마이그레이션 시작...');

  // MongoDB 연결
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/soul';
  await mongoose.connect(mongoUri);
  console.log('✅ MongoDB 연결됨');

  // SystemConfig 모델
  const SystemConfig = require('../models/SystemConfig');

  // 기존 파일 읽기
  let fileConfig = { servers: {}, externalServers: {} };
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    fileConfig = JSON.parse(data);
    console.log('✅ server-config.json 읽기 완료');
    console.log(`   - servers: ${Object.keys(fileConfig.servers || {}).length}개`);
    console.log(`   - externalServers: ${Object.keys(fileConfig.externalServers || {}).length}개`);
  } catch (e) {
    console.log('⚠️  server-config.json 없음 또는 읽기 실패:', e.message);
  }

  // DB에 이미 데이터가 있는지 확인
  const existing = await SystemConfig.findOne({ configKey: 'mcp_servers' });
  if (existing) {
    console.log('⚠️  DB에 이미 mcp_servers 설정이 존재합니다.');
    console.log('   기존 데이터를 덮어쓰시겠습니까? (--force 옵션 사용)');

    if (!process.argv.includes('--force')) {
      console.log('   마이그레이션 취소됨');
      await mongoose.disconnect();
      return;
    }
    console.log('   --force 옵션 감지, 덮어쓰기 진행...');
  }

  // DB에 저장
  await SystemConfig.findOneAndUpdate(
    { configKey: 'mcp_servers' },
    {
      configKey: 'mcp_servers',
      value: fileConfig,
      description: 'MCP 서버 설정 (마이그레이션됨)'
    },
    { upsert: true, new: true }
  );

  console.log('✅ DB 저장 완료');

  // 검증
  const saved = await SystemConfig.findOne({ configKey: 'mcp_servers' });
  console.log('✅ 검증:', JSON.stringify(saved.value, null, 2).substring(0, 200) + '...');

  await mongoose.disconnect();
  console.log('✅ 마이그레이션 완료!');
  console.log('');
  console.log('📌 다음 단계:');
  console.log('   1. 서버 재시작하여 테스트');
  console.log('   2. 정상 동작 확인 후 server-config.json 삭제');
}

migrate().catch(e => {
  console.error('❌ 마이그레이션 실패:', e);
  process.exit(1);
});
