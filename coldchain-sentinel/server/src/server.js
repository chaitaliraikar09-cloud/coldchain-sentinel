const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config');
const { setupSocketIO } = require('./sockets/socketHandler');
const simulatorService = require('./services/simulatorService');

const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: [config.clientOrigin, 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

setupSocketIO(io);

const esp32Service = require('./services/esp32Service');

// Start server
server.listen(config.port, () => {
  console.log(`\n🌡️  ColdChain Sentinel API Server`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Client Origin: ${config.clientOrigin}`);
  console.log(`   Data Dir: ${config.dataDir}`);
  console.log(`   Node Env: ${config.nodeEnv}`);
  console.log(`   Data Source: ${config.dataSource}`);
  console.log(`   ESP32 Target: ${config.esp32Host}:${config.esp32Port}`);

  // Initialize ESP32 service
  esp32Service.init();

  // Initialize isolated DEMO-001 simulator
  simulatorService.start();

  console.log(`\n📡 Live ESP32 Hardware Mode active: Sensor ingestion from ${config.esp32Host}:${config.esp32Port}`);
  console.log(`🤖 DEMO-001 Isolated Simulator active: Deterministic demo stream running`);

  console.log(`\n🔌 WebSocket server ready`);
  console.log(`   ESP32 endpoint: POST http://YOUR_LAN_IP:${config.port}/api/readings`);
  console.log(`   Dashboard: ${config.clientOrigin}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  simulatorService.stop();
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  simulatorService.stop();
  server.close(() => process.exit(0));
});

module.exports = server;
