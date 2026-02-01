/**
 * 벡터 스토어 - ChromaDB + Ollama 임베딩
 * recall_memory의 의미적 검색을 위한 모듈
 *
 * Phase 1.7: qwen3-embedding:8b 사용 (한국어 지원 우수)
 */

const path = require('path');

let chromaClient = null;
let collection = null;

const COLLECTION_NAME = 'soul_memories_v2';  // qwen3-embedding:8b 용 (4096차원)
const CHROMA_HOST = process.env.CHROMA_HOST || 'localhost';
const CHROMA_PORT = process.env.CHROMA_PORT || 8000;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBED_MODEL = 'qwen3-embedding:8b';  // 4096차원, 한국어 우수

/**
 * ChromaDB 컬렉션 가져오기
 */
async function getCollection() {
  if (collection) return collection;

  console.log('[VectorStore] Connecting to ChromaDB...');

  const { ChromaClient } = require('chromadb');

  // HTTP 클라이언트 모드 (서버 필요)
  chromaClient = new ChromaClient({
    host: CHROMA_HOST,
    port: CHROMA_PORT
  });

  // 컬렉션 생성 또는 가져오기
  collection = await chromaClient.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { description: 'Soul conversation memories' }
  });

  const count = await collection.count();
  console.log(`[VectorStore] Collection ready, ${count} documents`);

  return collection;
}

/**
 * Ollama로 텍스트를 벡터로 변환 (qwen3-embedding:8b)
 */
async function embed(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        prompt: text
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding || null;

  } catch (error) {
    console.error('[VectorStore] Embedding error:', error.message);
    return null;
  }
}

/**
 * 메시지 저장 (임베딩 + ChromaDB)
 */
async function addMessage(message) {
  try {
    const col = await getCollection();
    const text = message.text || message.content || '';

    if (!text || text.length < 5) return; // 너무 짧은 건 스킵

    const embedding = await embed(text);
    if (!embedding) {
      console.warn('[VectorStore] Embedding failed, skipping message');
      return;
    }

    await col.add({
      ids: [message.id],
      embeddings: [embedding],
      documents: [text],
      metadatas: [{
        role: message.role,
        timestamp: message.timestamp?.toString() || new Date().toISOString(),
        tags: JSON.stringify(message.tags || [])
      }]
    });

    console.log(`[VectorStore] Added message: ${message.id}`);
  } catch (error) {
    console.error('[VectorStore] Failed to add message:', error.message);
  }
}

/**
 * 유사도 검색
 */
async function search(query, limit = 5) {
  try {
    const col = await getCollection();
    const queryEmbedding = await embed(query);
    
    const results = await col.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit
    });
    
    if (!results.documents?.[0]) return [];
    
    return results.documents[0].map((doc, i) => ({
      text: doc,
      id: results.ids[0][i],
      distance: results.distances?.[0]?.[i] || 0,
      metadata: results.metadatas?.[0]?.[i] || {}
    }));
  } catch (error) {
    console.error('[VectorStore] Search failed:', error.message);
    return [];
  }
}

/**
 * 기존 메시지 일괄 마이그레이션
 */
async function migrateFromJSONL(messages) {
  console.log(`[VectorStore] Migrating ${messages.length} messages...`);
  
  const col = await getCollection();
  const existingCount = await col.count();
  
  if (existingCount > 0) {
    console.log(`[VectorStore] Already has ${existingCount} documents, skipping migration`);
    return { migrated: 0, skipped: existingCount };
  }
  
  let migrated = 0;
  const batchSize = 50;
  
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const validBatch = batch.filter(m => (m.text || m.content)?.length >= 10);
    
    if (validBatch.length === 0) continue;
    
    const embeddings = await Promise.all(
      validBatch.map(m => embed(m.text || m.content))
    );
    
    await col.add({
      ids: validBatch.map(m => m.id || `msg_${i}_${Math.random().toString(36).slice(2)}`),
      embeddings,
      documents: validBatch.map(m => m.text || m.content),
      metadatas: validBatch.map(m => ({
        role: m.role,
        timestamp: m.timestamp?.toString() || '',
        tags: JSON.stringify(m.tags || [])
      }))
    });
    
    migrated += validBatch.length;
    console.log(`[VectorStore] Migrated ${migrated}/${messages.length}`);
  }
  
  return { migrated, skipped: 0 };
}

/**
 * 컬렉션 초기화 (테스트용)
 */
async function clearCollection() {
  try {
    if (chromaClient) {
      await chromaClient.deleteCollection({ name: COLLECTION_NAME });
      collection = null;
      console.log('[VectorStore] Collection cleared');
    }
  } catch (error) {
    console.error('[VectorStore] Clear failed:', error.message);
  }
}

module.exports = {
  embed,
  addMessage,
  search,
  migrateFromJSONL,
  clearCollection,
  getCollection
};
