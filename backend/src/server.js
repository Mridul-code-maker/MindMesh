const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth');
const datasetRoutes = require('./routes/datasets');
const pipelineRoutes = require('./routes/pipelines');
const runRoutes = require('./routes/runs');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});
app.set('io', io);

// Global Middlewares
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: true,
  credentials: true
}));

// Keep-Alive Endpoint
app.get('/api/v1/keep-alive', (req, res) => {
  res.json({
    success: true,
    message: 'MindMesh Orchestrator Engine is Active.',
    timestamp: new Date().toISOString()
  });
});

// Mount API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/datasets', datasetRoutes);
app.use('/api/v1/pipelines', pipelineRoutes);
app.use('/api/v1/runs', runRoutes);

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log('Socket client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Socket client disconnected:', socket.id);
  });
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`MindMesh Core Engine running on port ${PORT}`);
  console.log(`====================================================`);
});
