const store = require('../utils/store');
const simulatorService = require('../services/simulatorService');
const socketEmitter = require('../utils/socketEmitter');
const { getLastReadingTimestamps } = require('../services/readingPipeline');

function setupSocketIO(io) {
  socketEmitter.init(io);

  io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    // Send initial state on connection
    socket.emit('system:status', {
      connected: true,
      esp32: getLastReadingTimestamps().esp32,
      simulator: simulatorService.getStatus(),
      timestamp: new Date().toISOString(),
    });

    // Allow clients to join shipment-specific rooms
    socket.on('join:shipment', (shipmentId) => {
      socket.join(`shipment:${shipmentId}`);
      console.log(`[socket] ${socket.id} joined room shipment:${shipmentId}`);
      // Send latest shipment state immediately
      const shipment = store.getShipmentById(shipmentId);
      if (shipment) {
        socket.emit('shipment:updated', { shipment });
      }
    });

    socket.on('leave:shipment', (shipmentId) => {
      socket.leave(`shipment:${shipmentId}`);
    });

    // Client can request latest state on reconnect
    socket.on('request:state', () => {
      const shipments = store.getShipments();
      const alerts = store.getAlerts({ status: 'ACTIVE' });
      const latestReadings = store.getLatestReadings();
      socket.emit('state:snapshot', { shipments, alerts, latestReadings, timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] Client disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = { setupSocketIO };
