/**
 * MongoDB 모델 호환 레이어
 * 기존 코드가 require('../models/XXX') 하던 것을 SQLite로 연결
 *
 * 사용법:
 *   const { SystemConfig, AIService } = require('./db/models');
 */

const db = require('./index');

// DB 초기화 확인
function ensureDb() {
  if (!db.db) {
    db.init();
  }
}

/**
 * Mongoose 호환 쿼리 빌더
 * .sort(), .limit(), .select() 등 체이닝 지원
 */
class QueryBuilder {
  constructor(model, initialQuery = {}) {
    this.model = model;
    this.query = initialQuery;
    this._sort = null;
    this._limit = null;
    this._select = null;
  }

  sort(sortObj) {
    this._sort = sortObj;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  select(fields) {
    this._select = fields;
    return this;
  }

  async exec() {
    return this._execute();
  }

  // then() 지원으로 await 가능
  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(reject) {
    return this._execute().catch(reject);
  }

  _execute() {
    ensureDb();
    let results = this.model.find(this.query);

    // 정렬
    if (this._sort) {
      const sortKeys = Object.keys(this._sort);
      results.sort((a, b) => {
        for (const key of sortKeys) {
          const dir = this._sort[key];
          if (a[key] < b[key]) return dir === -1 ? 1 : -1;
          if (a[key] > b[key]) return dir === -1 ? -1 : 1;
        }
        return 0;
      });
    }

    // 제한
    if (this._limit) {
      results = results.slice(0, this._limit);
    }

    // 필드 선택 (간단 구현)
    if (this._select) {
      const fields = this._select.split(' ').filter(f => f);
      results = results.map(r => {
        const obj = {};
        for (const f of fields) {
          if (r[f] !== undefined) obj[f] = r[f];
        }
        obj.id = r.id;
        obj._id = r.id;
        return obj;
      });
    }

    return Promise.resolve(results);
  }
}

/**
 * Mongoose 스타일 모델 래퍼
 */
function createMongooseWrapper(modelName, keyField = null) {
  return {
    find(query = {}) {
      ensureDb();
      return new QueryBuilder(db[modelName], query);
    },

    findOne(query = {}) {
      ensureDb();
      const result = db[modelName].findOne(query);
      return Promise.resolve(result);
    },

    findById(id) {
      ensureDb();
      return Promise.resolve(db[modelName].findById(id));
    },

    create(data) {
      ensureDb();
      return Promise.resolve(db[modelName].create(data));
    },

    findOneAndUpdate(query, update, options = {}) {
      ensureDb();
      return Promise.resolve(db[modelName].findOneAndUpdate(query, update, options));
    },

    updateOne(query, update) {
      ensureDb();
      return Promise.resolve(db[modelName].updateOne(query, update));
    },

    updateMany(query, update) {
      ensureDb();
      const result = db[modelName].updateMany(query, update);
      return {
        exec: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
        catch: (reject) => Promise.resolve(result).catch(reject)
      };
    },

    deleteOne(query) {
      ensureDb();
      return Promise.resolve(db[modelName].deleteOne(query));
    },

    countDocuments(query = {}) {
      ensureDb();
      return Promise.resolve(db[modelName].countDocuments(query));
    }
  };
}

// 모델 export
module.exports = {
  SystemConfig: createMongooseWrapper('SystemConfig'),
  AIService: createMongooseWrapper('AIService'),
  Profile: createMongooseWrapper('Profile'),
  AgentProfile: createMongooseWrapper('AgentProfile'),
  Role: createMongooseWrapper('Role'),
  UsageStats: createMongooseWrapper('UsageStats'),
  ScheduledMessage: createMongooseWrapper('ScheduledMessage'),
  SelfRule: createMongooseWrapper('SelfRule'),
  Memory: createMongooseWrapper('Memory'),
  Message: createMongooseWrapper('Message'),
  UserProfile: createMongooseWrapper('UserProfile'),
  APIKey: createMongooseWrapper('APIKey')
};
