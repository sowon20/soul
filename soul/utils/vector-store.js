/**
 * 벡터 스토어 - 멀티 서비스 임베딩 + SQLite 저장 + HNSW 인덱싱
 * recall_memory의 의미적 검색을 위한 모듈
 *
 * Phase 1: 태그 검색 연결
 * Phase 2: 임베딩 BLOB 저장 (JSON TEXT → Float32 BLOB)
 * Phase 3: 원문 직접 임베딩 (다이제스트 대신 대화 턴 쌍)
 * Phase 4: HNSW 벡터 인덱싱 (ANN 검색)
 *
 * embedding-worker 역할에서 서비스/모델 설정을 읽어 임베딩 생성
 * 지원: OpenRouter, OpenAI, HuggingFace, Ollama
 */

const { trackCall: trackAlba } = require('./alba-stats');
const path = require('path');
const fs = require('fs');

// ============================================================
// HNSW 인덱스 (Phase 4)
// ============================================================
let _hnswIndex = null;
let _hnswIdMap = new Map();   // HNSW label → SQLite id
let _hnswNextLabel = 0;
let _hnswDimension = null;    // 첫 임베딩에서 자동 감지
const HNSW_INDEX_PATH = path.join(require('os').homedir(), '.soul', 'hnsw.index');
const HNSW_MAP_PATH = path.join(require('os').homedir(), '.soul', 'hnsw-map.json');

let HierarchicalNSW;
try {
  HierarchicalNSW = require('hnswlib-node').HierarchicalNSW;
} catch (e) {
  console.warn('[VectorStore] hnswlib-node not available, using brute-force fallback');
  HierarchicalNSW = null;
}

// 임베딩 프로바이더 캐시
let _cachedProvider = null;

// 임베딩 호출 통계 (메모리 — 서버 재시작 시 리셋)
const _embedStats = {
  totalCalls: 0,
  totalTokens: 0,
  byCategory: {},
  lastCall: null,
  startedAt: new Date().toISOString()
};

function trackEmbedCall(category, tokenEstimate) {
  _embedStats.totalCalls++;
  _embedStats.totalTokens += tokenEstimate;
  _embedStats.lastCall = new Date().toISOString();
  if (!_embedStats.byCategory[category]) {
    _embedStats.byCategory[category] = { calls: 0, tokens: 0 };
  }
  _embedStats.byCategory[category].calls++;
  _embedStats.byCategory[category].tokens += tokenEstimate;
}

function getEmbedStats() {
  return { ..._embedStats, hnswEnabled: !!_hnswIndex, hnswSize: _hnswIndex ? _hnswNextLabel : 0 };
}

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// ============================================================
// 임베딩 프로바이더
// ============================================================

async function getEmbeddingProvider() {
  if (_cachedProvider) return _cachedProvider;

  try {
    const RoleModel = require('../models/Role');
    const role = await RoleModel.findOne({ roleId: 'embedding-worker', isActive: 1 });
    if (!role) return null;

    const config = typeof role.config === 'string'
      ? JSON.parse(role.config) : (role.config || {});
    const serviceId = config.serviceId || 'openrouter';
    const model = role.preferredModel || 'qwen/qwen3-embedding-8b';

    const AIServiceModel = require('../models/AIService');
    const aiService = await AIServiceModel.findOne({ serviceId });
    if (!aiService || !aiService.apiKey) {
      console.warn(`[VectorStore] No API key for ${serviceId}`);
      return null;
    }

    _cachedProvider = {
      type: serviceId,
      apiKey: aiService.apiKey,
      model,
      baseUrl: aiService.baseUrl || null
    };
    return _cachedProvider;
  } catch (e) {
    console.warn('[VectorStore] getEmbeddingProvider failed:', e.message);
    return null;
  }
}

function resetEmbeddingProvider() {
  _cachedProvider = null;
  console.log('[VectorStore] Embedding provider cache reset');
}

// ============================================================
// 임베딩 API 호출 함수들
// ============================================================

async function embedWithOpenAI(text, apiKey, model, baseUrl) {
  const url = `${baseUrl || 'https://openrouter.ai/api/v1'}/embeddings`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input: text })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding || null;
}

async function embedWithHuggingFace(text, apiKey, model) {
  const url = `https://router.huggingface.co/pipeline/feature-extraction/${model}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ inputs: text })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HuggingFace embedding error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
  if (Array.isArray(data) && typeof data[0] === 'number') return data;
  return null;
}

async function embedWithOllama(text, model) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'qwen3-embedding:8b', prompt: text })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding || null;
}

/**
 * 텍스트를 벡터로 변환 (프로바이더 자동 감지)
 */
async function embed(text, category = 'unknown') {
  try {
    const provider = await getEmbeddingProvider();

    if (!provider) {
      console.warn('[VectorStore] No embedding provider configured');
      return null;
    }

    const tokenEstimate = Math.ceil(text.length * 0.5);
    trackEmbedCall(category, tokenEstimate);

    const _embedStart = Date.now();
    let result = null;
    switch (provider.type) {
      case 'openrouter':
        result = await embedWithOpenAI(text, provider.apiKey, provider.model, 'https://openrouter.ai/api/v1');
        break;
      case 'together':
        result = await embedWithOpenAI(text, provider.apiKey, provider.model, 'https://api.together.xyz/v1');
        break;
      case 'openai':
        result = await embedWithOpenAI(text, provider.apiKey, provider.model, 'https://api.openai.com/v1');
        break;
      case 'huggingface':
        result = await embedWithHuggingFace(text, provider.apiKey, provider.model);
        break;
      case 'ollama':
        result = await embedWithOllama(text, provider.model);
        break;
      default:
        result = await embedWithOpenAI(text, provider.apiKey, provider.model, provider.baseUrl);
    }

    trackAlba('embedding-worker', {
      action: category,
      tokens: tokenEstimate,
      latencyMs: Date.now() - _embedStart,
      success: !!result,
      model: provider.model
    });

    return result;
  } catch (error) {
    console.error('[VectorStore] Embedding error:', error.message);
    return null;
  }
}

// ============================================================
// Phase 2: BLOB 변환 유틸리티
// ============================================================

/** float 배열 → Buffer (Float32 BLOB) */
function embeddingToBlob(embedding) {
  const float32 = new Float32Array(embedding);
  return Buffer.from(float32.buffer);
}

/** Buffer (Float32 BLOB) → float 배열 */
function blobToEmbedding(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  return Array.from(float32);
}

// ============================================================
// Phase 4: HNSW 인덱스 관리
// ============================================================

/**
 * HNSW 인덱스 초기화 — DB에서 기존 임베딩 로드
 */
async function initHnswIndex() {
  if (!HierarchicalNSW) return;

  try {
    const db = require('../db');
    if (!db.db) db.init();

    // DB에서 임베딩 데이터 로드
    const rows = db.db.prepare(
      'SELECT id, embedding_blob, embedding FROM embeddings WHERE embedding_blob IS NOT NULL OR embedding IS NOT NULL'
    ).all();

    if (rows.length === 0) {
      console.log('[VectorStore] No embeddings to build HNSW index');
      return;
    }

    // 첫 행에서 차원 감지
    let firstEmb = null;
    for (const row of rows) {
      if (row.embedding_blob) {
        firstEmb = blobToEmbedding(row.embedding_blob);
      } else if (row.embedding) {
        try { firstEmb = JSON.parse(row.embedding); } catch {}
      }
      if (firstEmb) break;
    }

    if (!firstEmb) {
      console.warn('[VectorStore] No valid embeddings found for HNSW');
      return;
    }

    _hnswDimension = firstEmb.length;

    // 저장된 인덱스 파일이 있으면 로드 시도
    if (fs.existsSync(HNSW_INDEX_PATH) && fs.existsSync(HNSW_MAP_PATH)) {
      try {
        const mapData = JSON.parse(fs.readFileSync(HNSW_MAP_PATH, 'utf-8'));
        // 인덱스 파일의 DB row 수와 현재 DB row 수 비교
        if (mapData.totalRows === rows.length && mapData.dimension === _hnswDimension) {
          _hnswIndex = new HierarchicalNSW('cosine', _hnswDimension);
          _hnswIndex.readIndexSync(HNSW_INDEX_PATH);
          _hnswIdMap = new Map(mapData.idMap);
          _hnswNextLabel = mapData.nextLabel;
          console.log(`[VectorStore] HNSW index loaded from file: ${_hnswNextLabel} vectors, dim=${_hnswDimension}`);
          return;
        }
        console.log('[VectorStore] HNSW index stale (row count mismatch), rebuilding...');
      } catch (e) {
        console.warn('[VectorStore] Failed to load HNSW index:', e.message);
      }
    }

    // 인덱스 재구축
    const maxElements = Math.max(rows.length * 2, 10000); // 여유 공간
    _hnswIndex = new HierarchicalNSW('cosine', _hnswDimension);
    _hnswIndex.initIndex(maxElements, 16, 200, 42); // M=16, efConstruction=200

    _hnswIdMap = new Map();
    _hnswNextLabel = 0;
    let added = 0;

    for (const row of rows) {
      let emb = null;
      if (row.embedding_blob) {
        emb = blobToEmbedding(row.embedding_blob);
      } else if (row.embedding) {
        try { emb = JSON.parse(row.embedding); } catch {}
      }

      if (!emb || emb.length !== _hnswDimension) continue;

      const label = _hnswNextLabel++;
      _hnswIndex.addPoint(emb, label);
      _hnswIdMap.set(label, row.id);
      added++;
    }

    // 인덱스 파일 저장
    _saveHnswIndex(rows.length);

    console.log(`[VectorStore] HNSW index built: ${added} vectors, dim=${_hnswDimension}, maxElements=${maxElements}`);
  } catch (e) {
    console.error('[VectorStore] HNSW init failed:', e.message);
    _hnswIndex = null;
  }
}

/** HNSW 인덱스를 파일에 저장 */
function _saveHnswIndex(totalRows) {
  if (!_hnswIndex) return;
  try {
    _hnswIndex.writeIndexSync(HNSW_INDEX_PATH);
    fs.writeFileSync(HNSW_MAP_PATH, JSON.stringify({
      totalRows,
      dimension: _hnswDimension,
      nextLabel: _hnswNextLabel,
      idMap: Array.from(_hnswIdMap.entries())
    }));
  } catch (e) {
    console.warn('[VectorStore] Failed to save HNSW index:', e.message);
  }
}

/** HNSW에 새 벡터 추가 */
function _addToHnsw(embedding, sqliteId) {
  if (!_hnswIndex || !embedding) return;

  try {
    // 차원 불일치 시 리사이즈
    if (embedding.length !== _hnswDimension) return;

    // 용량 초과 시 리사이즈
    if (_hnswNextLabel >= _hnswIndex.getMaxElements()) {
      const newMax = _hnswIndex.getMaxElements() * 2;
      _hnswIndex.resizeIndex(newMax);
      console.log(`[VectorStore] HNSW resized to ${newMax}`);
    }

    const label = _hnswNextLabel++;
    _hnswIndex.addPoint(embedding, label);
    _hnswIdMap.set(label, sqliteId);
  } catch (e) {
    console.warn('[VectorStore] HNSW addPoint failed:', e.message);
  }
}

// ============================================================
// 메시지 저장 (Phase 2: BLOB + Phase 4: HNSW)
// ============================================================

/**
 * 메시지 임베딩 후 SQLite + HNSW에 저장
 */
async function addMessage(message) {
  try {
    const text = message.text || message.content || '';
    if (!text || text.length < 5) return;

    const embedding = await embed(text, message.category || 'digest-embed');
    if (!embedding) {
      console.warn('[VectorStore] Embedding failed, skipping');
      return;
    }

    const db = require('../db');
    if (!db.db) db.init();

    // 기존 임베딩 업데이트
    if (message.embeddingId && typeof message.embeddingId === 'number') {
      db.db.prepare('UPDATE embeddings SET embedding_blob = ?, embedding = NULL WHERE id = ?')
        .run(embeddingToBlob(embedding), message.embeddingId);
      console.log(`[VectorStore] Updated embedding: ${message.embeddingId}`);
      return;
    }

    // 새 임베딩 저장 (BLOB)
    const embId = message.id || `emb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ts = message.timestamp instanceof Date ? message.timestamp.toISOString()
      : (typeof message.timestamp === 'string' ? message.timestamp : new Date().toISOString());
    const content = typeof text === 'string' ? text : JSON.stringify(text);
    const sourceDate = message.sourceDate || (ts ? ts.substring(0, 10) : null);

    const result = db.db.prepare(`
      INSERT INTO embeddings (content, embedding_blob, embedding, role, source, source_date, timestamp, meta)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(
      content,
      embeddingToBlob(embedding),
      message.role || 'system',
      message.source || 'realtime',
      sourceDate,
      ts,
      JSON.stringify({ embId, tags: message.tags || [] })
    );

    // HNSW에도 추가
    _addToHnsw(embedding, result.lastInsertRowid);

    console.log(`[VectorStore] Saved embedding: ${embId} (${embedding.length}dim, source=${message.source || 'realtime'})`);
  } catch (error) {
    console.error('[VectorStore] Failed to add message:', error.message);
  }
}

// ============================================================
// 검색 (Phase 2: BLOB + Phase 4: HNSW)
// ============================================================

/**
 * 유사도 검색 — HNSW 우선, 폴백으로 brute-force
 * @param {string} query - 검색 쿼리
 * @param {number} limit - 결과 수
 * @param {Object} options - { startDate, endDate, minSimilarity, tags }
 */
async function search(query, limit = 5, options = {}) {
  try {
    const queryEmbedding = await embed(query, 'recall-search');
    if (!queryEmbedding) return [];

    const db = require('../db');
    if (!db.db) db.init();

    const minSimilarity = options.minSimilarity || 0.3;
    const hasTimeFilter = !!(options.startDate || options.endDate);
    const hasTagFilter = !!(options.tags && options.tags.length > 0);

    // ── HNSW 경로: 시간/태그 필터 없을 때 최고 성능 ──
    if (_hnswIndex && !hasTimeFilter && !hasTagFilter) {
      return _searchWithHnsw(queryEmbedding, limit, minSimilarity, db);
    }

    // ── Brute-force 경로: 필터 있거나 HNSW 없을 때 ──
    return _searchBruteForce(queryEmbedding, limit, minSimilarity, options, db);
  } catch (error) {
    console.error('[VectorStore] Search failed:', error.message);
    return [];
  }
}

/** HNSW 기반 검색 */
function _searchWithHnsw(queryEmbedding, limit, minSimilarity, db) {
  const k = Math.min(limit * 3, _hnswIndex.getCurrentCount()); // 여유 있게 검색
  if (k === 0) return [];

  _hnswIndex.setEf(Math.max(k * 2, 50)); // efSearch 설정
  const { neighbors, distances } = _hnswIndex.searchKnn(queryEmbedding, k);

  // HNSW cosine distance → similarity 변환
  const candidates = [];
  for (let i = 0; i < neighbors.length; i++) {
    const sqliteId = _hnswIdMap.get(neighbors[i]);
    if (!sqliteId) continue;
    // hnswlib cosine distance = 1 - cosine_similarity
    const similarity = 1 - distances[i];
    if (similarity < minSimilarity) continue;
    candidates.push({ sqliteId, similarity });
  }

  if (candidates.length === 0) return [];

  // SQLite에서 메타데이터 조회
  const ids = candidates.map(c => c.sqliteId);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.db.prepare(
    `SELECT id, content, role, source, source_date, timestamp, meta FROM embeddings WHERE id IN (${placeholders})`
  ).all(...ids);

  const rowMap = new Map(rows.map(r => [r.id, r]));

  return candidates
    .map(c => {
      const row = rowMap.get(c.sqliteId);
      if (!row) return null;
      return {
        text: row.content,
        id: row.id,
        distance: 1 - c.similarity,
        metadata: {
          role: row.role,
          timestamp: row.timestamp,
          source: row.source,
          sourceDate: row.source_date,
          meta: row.meta
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/** Brute-force 검색 (시간/태그 필터 지원) */
function _searchBruteForce(queryEmbedding, limit, minSimilarity, options, db) {
  let whereClause = '(embedding_blob IS NOT NULL OR embedding IS NOT NULL)';
  const params = [];

  if (options.startDate) {
    whereClause += ' AND timestamp >= ?';
    params.push(options.startDate instanceof Date ? options.startDate.toISOString() : options.startDate);
  }
  if (options.endDate) {
    whereClause += ' AND timestamp <= ?';
    params.push(options.endDate instanceof Date ? options.endDate.toISOString() : options.endDate);
  }

  const rows = db.db.prepare(`
    SELECT id, content, embedding_blob, embedding, role, source, source_date, timestamp, meta
    FROM embeddings WHERE ${whereClause}
  `).all(...params);

  // 태그 필터
  const filterTags = options.tags || [];

  const results = rows
    .map(row => {
      // BLOB 우선, TEXT 폴백
      let emb = null;
      if (row.embedding_blob) {
        emb = blobToEmbedding(row.embedding_blob);
      } else if (row.embedding) {
        try { emb = JSON.parse(row.embedding); } catch { return null; }
      }
      if (!emb) return null;

      // 태그 필터 적용
      if (filterTags.length > 0) {
        try {
          const meta = JSON.parse(row.meta || '{}');
          const rowTags = meta.tags || [];
          const hasMatch = filterTags.some(t => rowTags.includes(t));
          if (!hasMatch) return null;
        } catch { return null; }
      }

      return {
        id: row.id,
        content: row.content,
        role: row.role,
        source: row.source,
        sourceDate: row.source_date,
        timestamp: row.timestamp,
        meta: row.meta,
        similarity: _cosineSimilarity(queryEmbedding, emb)
      };
    })
    .filter(r => r && r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results.map(r => ({
    text: r.content,
    id: r.id,
    distance: 1 - r.similarity,
    metadata: {
      role: r.role,
      timestamp: r.timestamp,
      source: r.source,
      sourceDate: r.sourceDate,
      meta: r.meta
    }
  }));
}

/** 코사인 유사도 */
function _cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// Phase 3: 원문 대화 턴 임베딩
// ============================================================

/**
 * 일별 대화 JSON에서 원문 턴 쌍(user+assistant)을 직접 임베딩
 * 다이제스트 요약 대신 원문을 보존하여 임베딩
 */
async function ingestDayConversation(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    console.log(`[VectorStore] File not found: ${filePath}`);
    return { total: 0, embedded: 0, skipped: 0, errors: 0 };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  let messages;
  try {
    messages = JSON.parse(raw);
  } catch {
    console.warn(`[VectorStore] Invalid JSON: ${filePath}`);
    return { total: 0, embedded: 0, skipped: 0, errors: 0 };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { total: 0, embedded: 0, skipped: 0, errors: 0 };
  }

  const { batchDelay = 500, maxChunkChars = 1500 } = options;
  const source = path.basename(filePath, '.json');

  const db = require('../db');
  if (!db.db) db.init();

  // 이미 임베딩된 날짜인지 확인 (중복 방지)
  const existingCount = db.db.prepare(
    "SELECT COUNT(*) as c FROM embeddings WHERE source = ? AND source_date = ?"
  ).get(`conversation:${source}`, source)?.c || 0;

  if (existingCount > 0) {
    console.log(`[VectorStore] Already embedded: ${source} (${existingCount} chunks), skipping`);
    return { total: 0, embedded: 0, skipped: existingCount, errors: 0 };
  }

  // user+assistant 턴 쌍으로 청킹
  const chunks = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    const role = msg.role || 'unknown';

    if (role === 'user') {
      const userText = (msg.content || msg.text || '').trim();
      const userTags = msg.tags || [];
      let assistantText = '';
      let assistantTags = [];

      // 다음 assistant 응답 찾기
      if (i + 1 < messages.length && (messages[i + 1].role === 'assistant')) {
        assistantText = (messages[i + 1].content || messages[i + 1].text || '').trim();
        assistantTags = messages[i + 1].tags || [];
        i += 2;
      } else {
        i++;
      }

      if (userText.length < 3) continue;

      // 텍스트 결합
      const truncUser = userText.length > maxChunkChars ? userText.substring(0, maxChunkChars) + '...' : userText;
      const truncAssist = assistantText.length > maxChunkChars ? assistantText.substring(0, maxChunkChars) + '...' : assistantText;

      let combinedText = `[user] ${truncUser}`;
      if (truncAssist) combinedText += `\n[assistant] ${truncAssist}`;

      // 태그 합치기 (중복 제거)
      const allTags = [...new Set([...userTags, ...assistantTags])];

      chunks.push({
        text: combinedText,
        tags: allTags,
        timestamp: msg.timestamp || new Date().toISOString()
      });
    } else {
      i++;
    }
  }

  // === 전처리 필터: 쓰레기 제거 ===
  const ERROR_PATTERNS = [
    '응답을 생성하지 못했어요',
    'AI 요청 형식에 문제가 있었어요',
    '죄송합니다. 오류가 발생했습니다',
    'Error:',
    'Input validation error'
  ];

  let filtered = 0;
  for (let ci = chunks.length - 1; ci >= 0; ci--) {
    let text = chunks[ci].text;

    // 1. <tool_history> 제거
    text = text.replace(/<tool_history>[\s\S]*?<\/tool_history>\s*/g, '');
    // 2. <thinking> 제거
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '');

    chunks[ci].text = text.trim();

    // 3. 에러 메시지 스킵
    const isError = ERROR_PATTERNS.some(p => text.includes(p));
    // 4. 너무 짧은 턴 스킵
    const tooShort = text.length < 30;

    if (isError || tooShort) {
      chunks.splice(ci, 1);
      filtered++;
    }
  }

  console.log(`[VectorStore] Ingest conversation: ${source} — ${messages.length} messages → ${chunks.length} turn pairs (${filtered} filtered)`);

  let embedded = 0, skipped = 0, errors = 0;

  // 5. 중복 content 방지용 해시셋
  const existingContents = new Set();
  const existRows = db.db.prepare('SELECT content FROM embeddings WHERE source LIKE ?').all(`conversation:%`);
  for (const r of existRows) {
    existingContents.add(r.content?.substring(0, 80));
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    if (chunk.text.length < 10) { skipped++; continue; }

    // 중복 체크
    const contentKey = chunk.text.substring(0, 80);
    if (existingContents.has(contentKey)) { skipped++; continue; }
    existingContents.add(contentKey);

    try {
      const embedding = await embed(chunk.text, 'ingest-conversation');
      if (!embedding) { skipped++; continue; }

      const sourceDate = chunk.timestamp ? chunk.timestamp.substring(0, 10) : source;

      const result = db.db.prepare(`
        INSERT INTO embeddings (content, embedding_blob, embedding, role, source, source_date, timestamp, meta)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
      `).run(
        chunk.text,
        embeddingToBlob(embedding),
        'user',
        `conversation:${source}`,
        sourceDate,
        chunk.timestamp,
        JSON.stringify({ tags: chunk.tags, chunkIndex: ci })
      );

      // HNSW에도 추가
      _addToHnsw(embedding, result.lastInsertRowid);
      embedded++;

      if (ci < chunks.length - 1) await new Promise(r => setTimeout(r, batchDelay));
    } catch (err) {
      errors++;
      console.warn(`[VectorStore] Ingest turn ${ci} failed:`, err.message);
      if (err.message.includes('429')) await new Promise(r => setTimeout(r, 5000));
    }
  }

  // HNSW 인덱스 저장
  if (embedded > 0) {
    const totalRows = db.db.prepare('SELECT COUNT(*) as c FROM embeddings').get()?.c || 0;
    _saveHnswIndex(totalRows);
  }

  console.log(`[VectorStore] Ingest conversation complete: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);
  return { total: chunks.length, embedded, skipped, errors };
}

// ============================================================
// 레거시 ingest 함수 (기존 호환 유지)
// ============================================================

async function ingestJsonl(filePath, options = {}) {
  const readline = require('readline');

  const {
    batchDelay = 500,
    maxChunkChars = 1500,
    onProgress = null
  } = options;

  const lines = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed));
    } catch { /* skip malformed */ }
  }

  if (lines.length === 0) {
    return { total: 0, embedded: 0, skipped: 0, errors: 0 };
  }

  const chunks = [];
  let currentChunk = { texts: [], roles: [], timestamp: null };

  for (const msg of lines) {
    const text = (msg.text || msg.content || '').trim();
    const role = msg.role || 'unknown';
    if (!text || text.length < 3) continue;

    if (!currentChunk.timestamp) {
      currentChunk.timestamp = msg.timestamp || new Date().toISOString();
    }

    if (role === 'user' && currentChunk.texts.length > 0) {
      chunks.push({ ...currentChunk });
      currentChunk = { texts: [], roles: [], timestamp: msg.timestamp };
    }

    const truncated = text.length > maxChunkChars
      ? text.substring(0, maxChunkChars) + '...'
      : text;

    currentChunk.texts.push(`[${role}] ${truncated}`);
    currentChunk.roles.push(role);
  }

  if (currentChunk.texts.length > 0) {
    chunks.push(currentChunk);
  }

  console.log(`[VectorStore] Ingest: ${lines.length} messages → ${chunks.length} chunks`);

  const db = require('../db');
  if (!db.db) db.init();

  let embedded = 0, skipped = 0, errors = 0;
  const source = path.basename(filePath, path.extname(filePath));

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const combinedText = chunk.texts.join('\n');

    if (combinedText.length < 10) { skipped++; continue; }

    try {
      const embedding = await embed(combinedText, 'ingest-jsonl');
      if (!embedding) { skipped++; continue; }

      const sourceDate = chunk.timestamp ? chunk.timestamp.substring(0, 10) : null;
      const result = db.db.prepare(`
        INSERT INTO embeddings (content, embedding_blob, embedding, role, source, source_date, timestamp, meta)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
      `).run(
        combinedText,
        embeddingToBlob(embedding),
        chunk.roles.includes('user') ? 'user' : 'system',
        `ingest-jsonl:${source}`,
        sourceDate,
        chunk.timestamp,
        JSON.stringify({ source, chunkIndex: i })
      );

      _addToHnsw(embedding, result.lastInsertRowid);
      embedded++;

      if (onProgress) {
        onProgress({ current: i + 1, total: chunks.length, embedded, skipped, errors });
      }

      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, batchDelay));
      }
    } catch (err) {
      errors++;
      console.warn(`[VectorStore] Ingest chunk ${i} failed:`, err.message);
      if (err.message.includes('429')) {
        console.log('[VectorStore] Rate limited, waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  console.log(`[VectorStore] Ingest complete: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);
  return { total: chunks.length, embedded, skipped, errors };
}

/** 레거시 호환 — ingestDayJson은 이제 ingestDayConversation으로 위임 */
async function ingestDayJson(filePath, options = {}) {
  return ingestDayConversation(filePath, options);
}

// ============================================================
// HNSW 인덱스 리빌드 (수동/스케줄러용)
// ============================================================

async function rebuildHnswIndex() {
  _hnswIndex = null;
  _hnswIdMap = new Map();
  _hnswNextLabel = 0;
  await initHnswIndex();
}

module.exports = {
  embed,
  addMessage,
  search,
  getEmbeddingProvider,
  resetEmbeddingProvider,
  ingestJsonl,
  ingestDayJson,
  ingestDayConversation,
  getEmbedStats,
  initHnswIndex,
  rebuildHnswIndex,
  // Phase 2 유틸리티 (마이그레이션용)
  embeddingToBlob,
  blobToEmbedding
};
