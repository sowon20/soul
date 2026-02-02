require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// SQLite 초기화
const db = require('../db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

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

    // ProactiveMessenger 초기화
    const { getProactiveMessenger } = require('../utils/proactive-messenger');
    try {
      const messenger = await getProactiveMessenger(io);
      messenger.start();
      console.log('✅ ProactiveMessenger started');
    } catch (e) {
      console.error('❌ ProactiveMessenger init failed:', e.message);
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

const PORT = process.env.PORT || 4000;

// Socket.io 연결 관리
const connectedClients = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  connectedClients.set(socket.id, { connectedAt: new Date() });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
  });
});

// io 인스턴스 글로벌 접근용
app.set('io', io);
app.set('connectedClients', connectedClients);

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
