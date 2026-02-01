/**
 * APIKey Model
 * API 키 암호화 저장 (SQLite)
 */

const { APIKey } = require('../db/models');
const crypto = require('crypto');

// 암호화 키 (환경 변수 또는 기본값)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'soul-default-encryption-key-32b';
const ALGORITHM = 'aes-256-cbc';

/**
 * API 키 암호화
 */
APIKey.encryptKey = function(apiKey) {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encryptedKey: encrypted,
    iv: iv.toString('hex')
  };
};

/**
 * API 키 복호화
 */
APIKey.decryptKey = function(encryptedKey, ivHex) {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * API 키 저장 (암호화)
 */
APIKey.saveKey = async function(service, apiKey) {
  const { encryptedKey, iv } = this.encryptKey(apiKey);

  return this.findOneAndUpdate(
    { service },
    { encryptedKey, iv },
    { upsert: true }
  );
};

/**
 * API 키 조회 (복호화)
 */
APIKey.getKey = async function(service) {
  const doc = await this.findOne({ service });
  if (!doc) return null;

  return this.decryptKey(doc.encryptedKey, doc.iv);
};

/**
 * 모든 API 키 조회 (복호화)
 */
APIKey.getAllKeys = async function() {
  const docs = await this.find({});
  const keys = {};

  for (const doc of docs) {
    if (doc.encryptedKey && doc.iv) {
      keys[doc.service] = this.decryptKey(doc.encryptedKey, doc.iv);
    }
  }

  return keys;
};

module.exports = APIKey;
