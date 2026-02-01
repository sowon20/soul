/**
 * Database Abstraction Layer
 * 환경변수에 따라 SQLite 또는 Oracle 사용
 *
 * ORACLE_PASSWORD 환경변수가 있으면 Oracle 사용
 * 없으면 SQLite 사용 (로컬 개발용)
 */

const useOracle = !!process.env.ORACLE_PASSWORD;

if (useOracle) {
  console.log('[DB] Using Oracle Database');
  module.exports = require('./oracle');
} else {
  console.log('[DB] Using SQLite Database');
  module.exports = require('./sqlite');
}
