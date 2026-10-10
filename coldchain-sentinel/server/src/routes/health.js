const express = require('express');
const router = express.Router();
const os = require('os');
const simulatorService = require('../services/simulatorService');
const { getLastReadingTimestamps } = require('../services/readingPipeline');
const { getConnectedCount } = require('../utils/socketEmitter');
const store = require('../utils/store');

const startTime = Date.now();

const esp32Service = require('../services/esp32Service');

// GET /api/health
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    simulatorRunning: simulatorService.isRunning(),
    esp32Status: esp32Service.getStatus(),
    connectedClients: getConnectedCount(),
  });
});

// GET /api/status
router.get('/status', (req, res) => {
  const timestamps = getLastReadingTimestamps();
  const esp32State = esp32Service.getStatus();
  const simulatorActive = simulatorService.isRunning();
  const shipments = store.getShipments();

  res.json({
    success: true,
    data: {
      server: { status: 'online', uptime: Math.round((Date.now() - startTime) / 1000) },
      esp32: {
        connected: esp32State.connected,
        reachable: esp32State.reachable,
        host: esp32State.host,
        port: esp32State.port,
        dataSource: esp32State.dataSource,
        receivingData: esp32State.receivingData,
        isStale: esp32State.isStale,
        lastReadingAt: timestamps.esp32 || esp32State.lastReadingAt,
        deviceInfo: esp32State.deviceInfo,
        lastError: esp32State.lastError,
        note: esp32State.reachable
          ? (esp32State.receivingData ? 'Live sensor telemetry streaming' : 'ESP32 verified reachable at ' + esp32State.host)
          : 'ESP32 unreachable or offline',
      },
      simulator: {
        running: simulatorActive,
        lastReadingAt: timestamps.simulator,
        status: simulatorService.getStatus(),
      },
      dataSource: esp32State.dataSource,
      database: { type: 'json-file', shipments: shipments.length },
      connectedWebSocketClients: getConnectedCount(),
    },
  });
});

// POST /api/status/datasource - Toggle between esp32 and simulator
router.post('/datasource', (req, res) => {
  const { source } = req.body;
  if (!source || !['esp32', 'simulator'].includes(source)) {
    return res.status(400).json({ success: false, error: 'Source must be "esp32" or "simulator"' });
  }

  const updatedSource = esp32Service.setDataSource(source);
  if (updatedSource === 'simulator') {
    simulatorService.start();
  } else {
    simulatorService.stop();
  }

  res.json({
    success: true,
    message: `Data source switched to ${updatedSource}`,
    dataSource: updatedSource,
  });
});

// POST /api/status/esp32-host - Update ESP32 IP
router.post('/esp32-host', async (req, res) => {
  const { host, port = 80, path = '/shipment' } = req.body;
  if (!host) {
    return res.status(400).json({ success: false, error: 'Host IP is required' });
  }
  esp32Service.setHost(host, port, path);
  const verify = await esp32Service.verifyConnection();
  res.json({
    success: true,
    message: `ESP32 host set to ${host}:${port}${path}`,
    verification: verify,
  });
});

module.exports = router;
