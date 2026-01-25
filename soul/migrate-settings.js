#!/usr/bin/env node

/**
 * Settings Migration Script
 * settings.json의 데이터를 MongoDB(SystemConfig)로 마이그레이션
 */

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const SystemConfig = require('./models/SystemConfig');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/soul';
const SETTINGS_PATH = path.join(__dirname, 'config', 'settings.json');

async function migrate() {
  console.log('🔄 Starting settings migration...\n');

  try {
    // MongoDB 연결
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // settings.json 읽기
    console.log('📖 Reading settings.json...');
    let settings = null;
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
      settings = JSON.parse(data);
      console.log('✅ Settings loaded\n');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️  settings.json not found - using default values\n');
        settings = {
          ai: {},
          memory: { storagePath: './memory', autoArchive: true },
          files: { storagePath: './files' },
          routing: {
            enabled: true,
            light: { modelId: 'claude-3-5-haiku-20241022', serviceId: 'anthropic' },
            medium: { modelId: 'claude-sonnet-4-20250514', serviceId: 'anthropic' },
            heavy: { modelId: 'claude-3-opus-20240229', serviceId: 'anthropic' }
          }
        };
      } else {
        throw error;
      }
    }

    // DB에 저장
    console.log('💾 Migrating to MongoDB...');
    
    const migrations = [
      { key: 'ai', value: settings.ai, description: 'AI service configuration' },
      { key: 'memory', value: settings.memory, description: 'Memory storage configuration' },
      { key: 'files', value: settings.files, description: 'File storage configuration' },
      { key: 'routing', value: settings.routing, description: 'Smart routing configuration' }
    ];

    for (const { key, value, description } of migrations) {
      await SystemConfig.findOneAndUpdate(
        { configKey: key },
        { value, description, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      console.log(`  ✅ Migrated: ${key}`);
    }

    console.log('\n✨ Migration completed successfully!');

    // 기존 settings.json 백업
    const backupPath = SETTINGS_PATH + '.backup';
    try {
      await fs.copyFile(SETTINGS_PATH, backupPath);
      console.log(`📦 Backup created: ${backupPath}`);
    } catch (error) {
      // 백업 실패는 무시
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// 실행
migrate();
