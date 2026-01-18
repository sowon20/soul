require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const memoryRoutes = require('../routes/memory');
const aiModelsRoutes = require('../routes/ai-models');
const configRoutes = require('../routes/config');
const searchRoutes = require('../routes/search');
const contextRoutes = require('../routes/context');
const contextMgmtRoutes = require('../routes/context-management');
const analogyRoutes = require('../routes/analogy');
const nlpRoutes = require('../routes/nlp');
const panelRoutes = require('../routes/panel');
const chatRoutes = require('../routes/chat');

app.use('/api/memory', memoryRoutes);
app.use('/api/ai-models', aiModelsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/context', contextRoutes);
app.use('/api/context-mgmt', contextMgmtRoutes);
app.use('/api/analogy', analogyRoutes);
app.use('/api/nlp', nlpRoutes);
app.use('/api/panel', panelRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'soul-server' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

const PORT = process.env.PORT || 3080;

app.listen(PORT, () => {
  console.log(`🌟 Soul server running on port ${PORT}`);
});
