require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const store = require('./utils/store');

// Routes
const healthRoutes = require('./routes/health');
const readingsRoutes = require('./routes/readings');
const shipmentsRoutes = require('./routes/shipments');
const alertsRoutes = require('./routes/alerts');
const checkpointsRoutes = require('./routes/checkpoints');
const analyticsRoutes = require('./routes/analytics');
const simulatorRoutes = require('./routes/simulator');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Initialize store
store.load();

const app = express();

// Security
app.use(helmet({ crossOriginEmbedderPolicy: false }));

// CORS
app.use(cors({
  origin: [config.clientOrigin, 'http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-key'],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, error: 'Too many requests, please slow down.' },
});
app.use('/api', limiter);

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing with size limit
app.use(express.json({ limit: '100kb' }));
app.use(express.text({ type: ['text/plain', 'text/*', 'application/text'], limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Routes
app.use('/api', healthRoutes);
app.use('/api/readings', readingsRoutes);
app.use('/api/shipments', shipmentsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/checkpoints', checkpointsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/simulator', simulatorRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    app: 'ColdChain Sentinel',
    message: 'Backend is running',
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
