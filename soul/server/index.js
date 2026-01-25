require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/soul')
.then(async () => {
  console.log('✅ MongoDB connected');

  // 기본 AI 서비스 초기화
  const AIService = require('../models/AIService');
  await AIService.initializeBuiltInServices();

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
})
.catch(err => console.error('❌ MongoDB connection error:', err));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'soul-server' });
});

// Serve static files from client
app.use(express.static(path.join(__dirname, '../../client')));

// Serve index.html for all non-API routes (SPA routing)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../client/index.html'));
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

// ProactiveMessenger 초기화
const { getProactiveMessenger } = require('../utils/proactive-messenger');
mongoose.connection.once('open', async () => {
  try {
    const messenger = await getProactiveMessenger(io);
    messenger.start();
    console.log('✅ ProactiveMessenger started');
  } catch (e) {
    console.error('❌ ProactiveMessenger init failed:', e.message);
  }
});

server.listen(PORT, () => {
  console.log(`🌟 Soul server running on port ${PORT}`);
});
