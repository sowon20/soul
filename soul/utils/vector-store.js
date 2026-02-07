/**
 * 벡터 스토어 - 멀티 서비스 임베딩 + SQLite 저장
 * recall_memory의 의미적 검색을 위한 모듈
 *
 * embedding-worker 역할에서 서비스/모델 설정을 읽어 임베딩 생성
 * 지원: OpenRouter, OpenAI, HuggingFace, Ollama
 */

const { trackCall: trackAlba } = require('./alba-stats');

// 임베딩 프로바이더 캐시
let _cachedProvider = null;

// 임베딩 호출 통계 (메모리 — 서버 재시작 시 리셋)
const _embedStats = {
  totalCalls: 0,
  totalTokens: 0,
  byCategory: {},  // { 'digest-embed': { calls: N, tokens: N }, 'recall-search': { calls: N, tokens: N }, ... }
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
  return { ..._embedStats };
}

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

/**
 * embedding-worker 역할에서 프로바이더 정보 로드
 */
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

/**
 * 프로바이더 캐시 리셋 (설정 변경 시 호출)
 */
function resetEmbeddingProvider() {
  _cachedProvider = null;
  console.log('[VectorStore] Embedding provider cache reset');
}

/**
 * OpenRouter / OpenAI 호환 임베딩
 */
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

/**
 * HuggingFace Feature Extraction 임베딩
 */
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
  // feature-extraction: [[...]] 또는 [...] 형태
  if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
  if (Array.isArray(data) && typeof data[0] === 'number') return data;
  return null;
}

/**
 * Ollama 로컬 임베딩
 */
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

    // 토큰 추정 (한글 ~0.6, 영어 ~0.3)
    const tokenEstimate = Math.ceil(text.length * 0.5);
    trackEmbedCall(category, tokenEstimate);

    const _embedStart = Date.now();
    let result = null;
    switch (provider.type) {
      case 'openrouter':
        result = await embedWithOpenAI(text, provider.apiKey, provider.model, 'https://openrouter.ai/api/v1');
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

/**
 * 메시지 임베딩 후 SQLite에 저장
 */
async function addMessage(message) {
  try {
    const text = message.text || message.content || '';
    if (!text || text.length < 5) return;

    const embedding = await embed(text, 'digest-embed');
    if (!embedding) {
      console.warn('[VectorStore] Embedding failed, skipping');
      return;
    }

    const Message = require('../models/Message');

    // 기존 메시지면 (숫자 ID) 임베딩만 업데이트
    if (message.id && typeof message.id === 'number') {
      await Message.updateEmbedding(message.id, embedding);
      console.log(`[VectorStore] Updated embedding: ${message.id}`);
      return;
    }

    // 새 메시지로 저장 (다이제스트 요약/메모리용)
    const db = require('../db');
    if (!db.db) db.init();

    const digestId = message.id || `emb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const stmt = db.db.prepare(`
      INSERT INTO messages (session_id, role, content, embedding, timestamp, meta)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const ts = message.timestamp instanceof Date ? message.timestamp.toISOString()
      : (typeof message.timestamp === 'string' ? message.timestamp : new Date().toISOString());
    const content = typeof text === 'string' ? text : JSON.stringify(text);
    stmt.run(
      message.sessionId || 'embeddings',
      message.role || 'system',
      content,
      JSON.stringify(embedding),
      ts,
      JSON.stringify({ digestId })
    );

    console.log(`[VectorStore] Saved embedding: ${digestId} (${embedding.length}dim)`);
  } catch (error) {
    console.error('[VectorStore] Failed to add message:', error.message, '| text type:', typeof text, '| ts type:', typeof message.timestamp);
  }
}

/**
 * 유사도 검색 (SQLite cosine similarity)
 */
async function search(query, limit = 5, options = {}) {
  try {
    const queryEmbedding = await embed(query, 'recall-search');
    if (!queryEmbedding) return [];

    const Message = require('../models/Message');
    const results = await Message.findSimilar(queryEmbedding, {
      sessionId: 'embeddings',
      limit,
      minSimilarity: 0.3,
      startDate: options.startDate || null,
      endDate: options.endDate || null
    });

    return results.map(r => ({
      text: r.content,
      id: r.id,
      distance: 1 - (r.similarity || 0),
      metadata: {
        role: r.role,
        timestamp: r.timestamp
      }
    }));
  } catch (error) {
    console.error('[VectorStore] Search failed:', error.message);
    return [];
  }
}

/**
 * JSONL 파일에서 대화를 읽어 벌크 임베딩
 * - 대화 턴(user+assistant)을 하나의 청크로 묶어서 임베딩
 * - 레이트리밋 대응: 요청 간 딜레이
 * @param {string} filePath JSONL 파일 경로
 * @param {object} options { batchDelay, maxChunkChars, onProgress }
 * @returns {{ total, embedded, skipped, errors }}
 */
async function ingestJsonl(filePath, options = {}) {
  const fs = require('fs');
  const readline = require('readline');

  const {
    batchDelay = 500,
    maxChunkChars = 1500,
    onProgress = null
  } = options;

  // 1. JSONL 파싱
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

  // 2. 대화 턴 단위로 청킹 (user + assistant를 하나의 청크로)
  const chunks = [];
  let currentChunk = { texts: [], roles: [], timestamp: null };

  for (const msg of lines) {
    const text = (msg.text || msg.content || '').trim();
    const role = msg.role || 'unknown';
    if (!text || text.length < 3) continue;

    // 타임스탬프 설정 (첫 메시지 기준)
    if (!currentChunk.timestamp) {
      currentChunk.timestamp = msg.timestamp || new Date().toISOString();
    }

    // user 메시지가 나오면 이전 청크 마무리 (이전에 뭔가 있으면)
    if (role === 'user' && currentChunk.texts.length > 0) {
      chunks.push({ ...currentChunk });
      currentChunk = { texts: [], roles: [], timestamp: msg.timestamp };
    }

    // 텍스트가 너무 길면 잘라서 넣기
    const truncated = text.length > maxChunkChars
      ? text.substring(0, maxChunkChars) + '...'
      : text;

    currentChunk.texts.push(`[${role}] ${truncated}`);
    currentChunk.roles.push(role);
  }

  // 마지막 청크
  if (currentChunk.texts.length > 0) {
    chunks.push(currentChunk);
  }

  console.log(`[VectorStore] Ingest: ${lines.length} messages → ${chunks.length} chunks`);

  // 3. 벌크 임베딩
  const db = require('../db');
  if (!db.db) db.init();

  let embedded = 0;
  let skipped = 0;
  let errors = 0;

  // 파일명에서 소스 추출
  const path = require('path');
  const source = path.basename(filePath, path.extname(filePath));

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const combinedText = chunk.texts.join('\n');

    if (combinedText.length < 10) {
      skipped++;
      continue;
    }

    try {
      const embedding = await embed(combinedText, 'ingest-jsonl');
      if (!embedding) {
        skipped++;
        continue;
      }

      const stmt = db.db.prepare(`
        INSERT INTO messages (session_id, role, content, embedding, timestamp, meta)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'embeddings',
        chunk.roles.includes('user') ? 'user' : 'system',
        combinedText,
        JSON.stringify(embedding),
        chunk.timestamp,
        JSON.stringify({ source, chunkIndex: i })
      );

      embedded++;

      if (onProgress) {
        onProgress({ current: i + 1, total: chunks.length, embedded, skipped, errors });
      }

      // 레이트리밋 방지 딜레이
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, batchDelay));
      }
    } catch (err) {
      errors++;
      console.warn(`[VectorStore] Ingest chunk ${i} failed:`, err.message);

      // 429 에러면 더 오래 대기
      if (err.message.includes('429')) {
        console.log('[VectorStore] Rate limited, waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  console.log(`[VectorStore] Ingest complete: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);
  return { total: chunks.length, embedded, skipped, errors };
}

/**
 * 일별 대화 JSON 파일을 임베딩
 * conversations/YYYY-MM/YYYY-MM-DD.json 형식
 */
async function ingestDayJson(filePath, options = {}) {
  const fs = require('fs');
  const path = require('path');

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

  // ingestJsonl과 동일한 청킹 로직
  const { batchDelay = 500, maxChunkChars = 1500 } = options;
  const chunks = [];
  let currentChunk = { texts: [], roles: [], timestamp: null };

  for (const msg of messages) {
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
  if (currentChunk.texts.length > 0) chunks.push(currentChunk);

  const source = path.basename(filePath, '.json');
  console.log(`[VectorStore] Ingest day: ${source} — ${messages.length} messages → ${chunks.length} chunks`);

  const db = require('../db');
  if (!db.db) db.init();

  let embedded = 0, skipped = 0, errors = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const combinedText = chunk.texts.join('\n');
    if (combinedText.length < 10) { skipped++; continue; }

    try {
      const embedding = await embed(combinedText, 'ingest-day');
      if (!embedding) { skipped++; continue; }

      const stmt = db.db.prepare(`
        INSERT INTO messages (session_id, role, content, embedding, timestamp, meta)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'embeddings', chunk.roles.includes('user') ? 'user' : 'system',
        combinedText, JSON.stringify(embedding),
        chunk.timestamp, JSON.stringify({ source, chunkIndex: i })
      );
      embedded++;

      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, batchDelay));
    } catch (err) {
      errors++;
      console.warn(`[VectorStore] Ingest chunk ${i} failed:`, err.message);
      if (err.message.includes('429')) await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`[VectorStore] Ingest day complete: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);
  return { total: chunks.length, embedded, skipped, errors };
}

module.exports = {
  embed,
  addMessage,
  search,
  getEmbeddingProvider,
  resetEmbeddingProvider,
  ingestJsonl,
  ingestDayJson,
  getEmbedStats
};
