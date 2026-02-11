require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// 프로세스 크래시 방지 — 에러 로그만 남기고 서버 유지
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');

// SQLite 초기화
const db = require('../db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// WebSocket 서버 (TTS 스트리밍용)
const wss = new WebSocket.Server({ noServer: true });

// 글로벌로 io 접근 가능하게 (도구 실행 상태 전송용)
global.io = io;

// Database Initialization
(async () => {
  try {
    await db.init();
    console.log('✅ Database initialized');

    // 기본 AI 서비스 초기화
    const AIService = require('../models/AIService');
    await AIService.initializeBuiltinServices();

    // 에이전트 프로필 로드 (DB에서)
    const { getAgentProfileManager } = require('../utils/agent-profile');
    const profileManager = getAgentProfileManager();
    await profileManager.initialize();

    // 기본 역할(알바) 초기화
    const Role = require('../models/Role');
    await Role.initializeDefaultRoles();
    console.log('✅ Role system initialized');

    // 예약 메시지 복구 (서버 재시작 후)
    const { restoreScheduledMessages } = require('../utils/scheduled-messages');
    await restoreScheduledMessages();
    console.log('✅ Scheduled messages restored');

    // mDNS 서비스 (soul.local 자동 검색)
    const dnsService = require('../utils/dns-service');
    await dnsService.startFromConfig();
    console.log('✅ DNS service started');

    // DDNS 서비스 (외부 접속용 동적 DNS)
    const ddnsService = require('../utils/ddns-service');
    await ddnsService.startAutoUpdate();
    console.log('✅ DDNS service initialized');

    // === 임베딩 헬스체크 & 자동 복구 ===
    try {
      const embCount = db.db.prepare('SELECT COUNT(*) as c FROM embeddings').get()?.c || 0;
      console.log(`📊 Embeddings: ${embCount} entries`);

      // 대화 파일 중 임베딩이 없는 날짜를 찾아 자동 인제스트
      const fs = require('fs');
      const pathMod = require('path');
      const os = require('os');
      const basePath = pathMod.join(os.homedir(), '.soul');
      const convDir = pathMod.join(basePath, 'conversations');

      if (fs.existsSync(convDir)) {
        const months = fs.readdirSync(convDir).filter(d => /^\d{4}-\d{2}$/.test(d));
        let missingFiles = [];

        // 이미 인제스트된 날짜 목록
        const existingDates = new Set(
          db.db.prepare("SELECT DISTINCT source_date FROM embeddings WHERE source_date IS NOT NULL")
            .all().map(r => r.source_date)
        );

        for (const month of months) {
          const monthDir = pathMod.join(convDir, month);
          const files = fs.readdirSync(monthDir).filter(f => f.endsWith('.json'));
          for (const f of files) {
            const dateStr = f.replace('.json', ''); // YYYY-MM-DD
            if (!existingDates.has(dateStr)) {
              missingFiles.push(pathMod.join(monthDir, f));
            }
          }
        }

        if (missingFiles.length > 0) {
          console.log(`⚠️  ${missingFiles.length} conversation files without embeddings — starting auto-recovery...`);
          // 비동기 인제스트 (서버 시작 차단 안 함)
          (async () => {
            const vectorStore = require('../utils/vector-store');
            const provider = await vectorStore.getEmbeddingProvider();
            if (!provider) {
              console.warn('⚠️  No embedding provider configured — skipping auto-recovery');
              return;
            }
            let totalEmbedded = 0;
            for (const filePath of missingFiles) {
              try {
                const result = await vectorStore.ingestDayJson(filePath, { batchDelay: 300 });
                totalEmbedded += result.embedded;
                console.log(`  ✅ Ingested ${pathMod.basename(filePath)}: ${result.embedded} embeddings`);
              } catch (e) {
                console.warn(`  ❌ Failed ${pathMod.basename(filePath)}: ${e.message}`);
              }
            }
            console.log(`🎉 Auto-recovery complete: ${totalEmbedded} total embeddings created`);
          })().catch(e => console.error('❌ Auto-recovery failed:', e.message));
        }
      }
    } catch (e) {
      console.warn('⚠️  Embedding health check failed:', e.message);
    }
    console.log('✅ Embedding health check done');

    // 임베딩 쓰레기 정리 (tool_history, 에러 메시지 등)
    try {
      const garbageCount = db.db.prepare(
        "SELECT COUNT(*) as c FROM embeddings WHERE content LIKE '%<tool_history>%' OR content LIKE '%<thinking>%' OR content LIKE '%응답을 생성하지 못했어요%' OR content LIKE '%AI 요청 형식에 문제가 있었어요%'"
      ).get()?.c || 0;
      if (garbageCount > 0) {
        db.db.prepare(
          "DELETE FROM embeddings WHERE content LIKE '%<tool_history>%' OR content LIKE '%<thinking>%' OR content LIKE '%응답을 생성하지 못했어요%' OR content LIKE '%AI 요청 형식에 문제가 있었어요%'"
        ).run();
        console.log(`🗑️  Cleaned ${garbageCount} garbage embeddings (tool_history/thinking/errors)`);
        // HNSW 인덱스 파일 삭제 (재빌드 필요)
        const _fs = require('fs');
        const _path = require('path');
        const _os = require('os');
        const hnswPath = _path.join(_os.homedir(), '.soul', 'hnsw.index');
        const mapPath = _path.join(_os.homedir(), '.soul', 'hnsw-map.json');
        try { if (_fs.existsSync(hnswPath)) _fs.unlinkSync(hnswPath); } catch {}
        try { if (_fs.existsSync(mapPath)) _fs.unlinkSync(mapPath); } catch {}
      }
    } catch (e) {
      console.warn('⚠️  Embedding cleanup failed:', e.message);
    }

    // HNSW 벡터 인덱스 초기화 (비동기, 서버 시작 차단 안 함)
    (async () => {
      try {
        const vectorStore = require('../utils/vector-store');
        await vectorStore.initHnswIndex();
        console.log('✅ HNSW vector index ready');
      } catch (e) {
        console.warn('⚠️  HNSW init failed (brute-force fallback):', e.message);
      }
    })().catch(() => {});

    // 임베딩 스케줄러 시작 (매일 7AM KST — 어제 대화 자동 임베딩)
    try {
      const { scheduleEmbedding } = require('../utils/embedding-scheduler');
      scheduleEmbedding();
      console.log('✅ Embedding scheduler started');
    } catch (e) {
      console.warn('⚠️  Embedding scheduler failed:', e.message);
    }

    // ProactiveMessenger — DB에서 이전 상태 복구
    try {
      const proactiveSetting = db.db.prepare(
        "SELECT value FROM system_configs WHERE config_key = 'proactive_enabled'"
      ).get();
      const wasEnabled = proactiveSetting ? JSON.parse(proactiveSetting.value)?.enabled : false;

      if (wasEnabled) {
        const { getProactiveMessenger } = require('../utils/proactive-messenger');
        const messenger = await getProactiveMessenger(io);
        messenger.start();
        console.log('✅ ProactiveMessenger restored (was enabled)');
      } else {
        console.log('ℹ️  ProactiveMessenger OFF (toggle in settings to enable)');
      }
    } catch (e) {
      console.warn('⚠️  ProactiveMessenger restore failed:', e.message);
    }
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
})();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const memoryRoutes = require('../routes/memory');
const aiModelsRoutes = require('../routes/ai-models');
const aiServicesRoutes = require('../routes/ai-services');
const configRoutes = require('../routes/config');
const searchRoutes = require('../routes/search');
const contextRoutes = require('../routes/context');
const contextMgmtRoutes = require('../routes/context-management');
const analogyRoutes = require('../routes/analogy');
const nlpRoutes = require('../routes/nlp');
const panelRoutes = require('../routes/panel');
const chatRoutes = require('../routes/chat');
const chatSimpleRoutes = require('../routes/chat-simple');
const memoryAdvancedRoutes = require('../routes/memory-advanced');
const workersRoutes = require('../routes/workers');
const notificationsRoutes = require('../routes/notifications');
const nlpAdvancedRoutes = require('../routes/nlp-advanced');
const profileRoutes = require('../routes/profile');
const rolesRoutes = require('../routes/roles');
const mcpRoutes = require('../routes/mcp');
const googleHomeRoutes = require('../routes/google-home');
const storageRoutes = require('../routes/storage');
const filesystemRoutes = require('../routes/filesystem');
const bootstrapRoutes = require('../routes/bootstrap');
const filesRoutes = require('../routes/files');
const ttsRoutes = require('../routes/tts');
const billingRoutes = require('../routes/billing');

app.use('/api/memory', memoryRoutes);
app.use('/api/ai-models', aiModelsRoutes);
app.use('/api/ai-services', aiServicesRoutes);
app.use('/api/config', configRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/context', contextRoutes);
app.use('/api/context-mgmt', contextMgmtRoutes);
app.use('/api/analogy', analogyRoutes);
app.use('/api/nlp', nlpRoutes);
app.use('/api/panel', panelRoutes);
app.use('/api/chat-simple', chatSimpleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/memory-advanced', memoryAdvancedRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/nlp-advanced', nlpAdvancedRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/google-home', googleHomeRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/filesystem', filesystemRoutes);
app.use('/api/bootstrap', bootstrapRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/billing', billingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'soul-server' });
});

// Serve static files from client (production: dist, dev: src)
const clientPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../../client/dist')
  : path.join(__dirname, '../../client');
app.use(express.static(clientPath));

// Serve index.html for all non-API routes (SPA routing)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '../../client/dist/index.html')
    : path.join(__dirname, '../../client/index.html');
  res.sendFile(indexPath);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

const PORT = process.env.PORT || 5041;

// Socket.io 연결 관리
const connectedClients = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  connectedClients.set(socket.id, { connectedAt: new Date() });

  // ── 터미널 이벤트 ──
  const terminalService = require('../utils/terminal-service');

  // 터미널 세션 시작 (캔버스 열 때)
  socket.on('terminal:start', ({ sessionId, cols, rows } = {}) => {
    try {
      const session = terminalService.getOrCreateSession({
        sessionId: sessionId || 'default',
        cols: cols || 80,
        rows: rows || 24
      });
      terminalService.attachSocket(session.id, socket.id);

      // 기존 버퍼 전송 (재연결 시 복원)
      const buffer = terminalService.getBuffer(session.id);
      socket.emit('terminal:started', {
        sessionId: session.id,
        buffer,
        alive: session.alive
      });
    } catch (e) {
      socket.emit('terminal:error', { message: e.message });
    }
  });

  // 사용자 직접 입력 (키보드 → PTY)
  socket.on('terminal:input', ({ sessionId, data }) => {
    try {
      terminalService.writeToSession(sessionId || 'default', data);
    } catch (e) {
      // 세션 없으면 무시
    }
  });

  // 터미널 크기 변경
  socket.on('terminal:resize', ({ sessionId, cols, rows }) => {
    terminalService.resizeSession(sessionId || 'default', cols, rows);
  });

  // 터미널 세션 분리 (캔버스 닫을 때 — PTY는 유지)
  socket.on('terminal:detach', ({ sessionId }) => {
    terminalService.detachSocket(sessionId || 'default', socket.id);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
    terminalService.detachSocketFromAll(socket.id);
  });
});

// io 인스턴스 글로벌 접근용
app.set('io', io);
app.set('connectedClients', connectedClients);

// WebSocket 업그레이드 핸들러 (TTS 스트리밍)
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/tts/stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket TTS 연결 처리
wss.on('connection', async (ws, request) => {
  console.log('🎙️ TTS WebSocket connected');

  const { handleWebSocketTTS } = require('../routes/tts');
  await handleWebSocketTTS(ws, request);
});

server.listen(PORT, () => {
  console.log(`🌟 Soul server running on port ${PORT}`);

  // Cloud Run keep-alive: 5분마다 self-ping
  if (process.env.NODE_ENV === 'production' && process.env.SELF_URL) {
    const PING_INTERVAL = 5 * 60 * 1000; // 5분
    setInterval(async () => {
      try {
        const res = await fetch(`${process.env.SELF_URL}/api/health`);
        console.log(`🏓 Self-ping: ${res.status}`);
      } catch (err) {
        console.error('❌ Self-ping failed:', err.message);
      }
    }, PING_INTERVAL);
    console.log('🏓 Self-ping enabled (every 5min)');
  }
});
