/**
 * Database Abstraction Layer
 *
 * 로컬 설정 파일(~/.soul/storage-config.json)에서 저장소 타입을 읽어
 * SQLite 또는 Oracle 사용
 *
 * 설정 파일이 없거나 type이 'local'이면 SQLite 사용
 * type이 'oracle'이면 Oracle 사용
 * Oracle 연결 실패 시 자동으로 SQLite로 폴백
 */

const { getMemoryStorageType } = require('../utils/local-config');

// 저장소 타입 결정
const storageType = getMemoryStorageType();
const useOracle = storageType === 'oracle';

let dbModule;

if (useOracle) {
  console.log('[DB] Using Oracle Database (from storage-config.json)');
  try {
    dbModule = require('./oracle');
  } catch (error) {
    console.error('[DB] Failed to load Oracle module:', error.message);
    console.log('[DB] Falling back to SQLite...');
    dbModule = require('./sqlite');
  }
} else {
  console.log('[DB] Using SQLite Database (from storage-config.json)');
  dbModule = require('./sqlite');
}

// Oracle init 래퍼 - 실패 시 SQLite로 폴백
const originalInit = dbModule.init;
dbModule.init = async function(...args) {
  try {
    return await originalInit.apply(this, args);
  } catch (error) {
    if (useOracle) {
      console.error('[DB] Oracle initialization failed:', error.message);
      console.log('[DB] Falling back to SQLite...');

      // SQLite 모듈로 교체
      const sqliteModule = require('./sqlite');
      Object.assign(dbModule, sqliteModule);

      // SQLite 초기화
      return await sqliteModule.init.apply(sqliteModule, args);
    }
    throw error;
  }
};

module.exports = dbModule;
