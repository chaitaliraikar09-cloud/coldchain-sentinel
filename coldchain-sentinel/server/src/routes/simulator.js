const express = require('express');
const router = express.Router();
const simulatorService = require('../services/simulatorService');

// GET /api/simulator/status
router.get('/status', (req, res) => {
  res.json({ success: true, data: simulatorService.getStatus() });
});

// POST /api/simulator/start
router.post('/start', (req, res) => {
  const { intervalMs } = req.body;
  const result = simulatorService.start(intervalMs);
  res.json(result);
});

// POST /api/simulator/stop
router.post('/stop', (req, res) => {
  const result = simulatorService.stop();
  res.json(result);
});

// POST /api/simulator/reset
router.post('/reset', (req, res) => {
  const result = simulatorService.reset();
  res.json(result);
});

// POST /api/simulator/inject-excursion
router.post('/inject-excursion', (req, res) => {
  const { shipmentId, type } = req.body;
  if (!shipmentId || !type) {
    return res.status(400).json({ success: false, error: 'shipmentId and type are required' });
  }
  const result = simulatorService.injectExcursion(shipmentId, type);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

module.exports = router;
