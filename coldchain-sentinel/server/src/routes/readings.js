const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const store = require('../utils/store');
const { processReading } = require('../services/readingPipeline');
const { optionalDeviceAuth } = require('../middleware/auth');

// Normalization middleware for ESP32 payload
const normalizePayload = (req, res, next) => {
  if (typeof req.body === 'string') {
    try {
      let clean = req.body.trim();
      if (clean.includes('{') && clean.includes('}')) {
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        clean = clean.substring(start, end + 1);
      }
      req.body = JSON.parse(clean);
    } catch (_) {}
  }
  if (req.body && typeof req.body === 'object') {
    if (req.body.shipment_id && !req.body.shipmentId) {
      req.body.shipmentId = req.body.shipment_id;
    }
    if (!req.body.shipmentId) {
      req.body.shipmentId = 'VAX-001';
    }
    if (req.body.device_id && !req.body.deviceId) {
      req.body.deviceId = req.body.device_id;
    }
    if (!req.body.deviceId) {
      req.body.deviceId = `ESP32-${req.body.shipmentId || '001'}`;
    }
    if (req.body.sensor_id && !req.body.sensorId) {
      req.body.sensorId = req.body.sensor_id;
    }
    if (!req.body.sensorId) {
      req.body.sensorId = 'ENV-AIR-001';
    }
    if (req.body.air_quality_aqi !== undefined && req.body.airQualityAqi === undefined) {
      req.body.airQualityAqi = req.body.air_quality_aqi;
    }
  }
  next();
};

// Validation rules for POST /readings
const readingValidation = [
  body('shipmentId').isString().notEmpty().withMessage('shipmentId is required'),
  body('deviceId').optional().isString(),
  body('sensorId').optional().isString(),
  body('temperature').isFloat({ min: -50, max: 100 }).withMessage('temperature must be a number between -50 and 100'),
  body('humidity').optional().isFloat({ min: 0, max: 100 }).withMessage('humidity must be 0-100'),
  body('air_quality_aqi').optional().isFloat({ min: 0, max: 1000 }).withMessage('air_quality_aqi must be 0-1000'),
  body('airQualityAqi').optional().isFloat({ min: 0, max: 1000 }).withMessage('airQualityAqi must be 0-1000'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('latitude must be -90 to 90'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('longitude must be -180 to 180'),
  body('battery').optional().isFloat({ min: 0, max: 100 }).withMessage('battery must be 0-100'),
  body('timestamp').optional(),
];

// POST /api/readings - Accept reading from ESP32
router.post('/', normalizePayload, optionalDeviceAuth, readingValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }

  // Check shipment exists or auto-register VAX-001
  const shipmentId = req.body.shipmentId;
  const shipment = store.getShipmentById(shipmentId);
  if (!shipment && shipmentId !== 'VAX-001' && !shipmentId.startsWith('VAX-')) {
    return res.status(400).json({
      success: false,
      error: `Shipment '${shipmentId}' not found`,
    });
  }

  try {
    const result = await processReading(req.body, 'esp32');
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    return res.status(201).json({
      success: true,
      message: 'Reading accepted',
      data: {
        ...result.reading,
        status: result.shipment.excursionActive ? 'EXCURSION' : 'NORMAL',
        readingId: result.reading.id,
      },
    });
  } catch (err) {
    console.error('[readings] Pipeline error:', err);
    return res.status(500).json({ success: false, error: 'Internal processing error' });
  }
});

// GET /api/readings - Paginated reading history
router.get('/', (req, res) => {
  const { shipmentId, deviceId, sensorId, from, to, limit = 100, page = 1 } = req.query;
  const filters = {};
  if (shipmentId) filters.shipmentId = shipmentId;
  if (deviceId) filters.deviceId = deviceId;
  if (sensorId) filters.sensorId = sensorId;
  if (from) filters.from = from;
  if (to) filters.to = to;

  let readings = store.getReadings(filters);
  // Sort newest first
  readings.sort((a, b) => new Date(b.serverReceivedAt) - new Date(a.serverReceivedAt));

  const limitNum = Math.min(parseInt(limit) || 100, 500);
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const total = readings.length;
  const totalPages = Math.ceil(total / limitNum);
  const start = (pageNum - 1) * limitNum;
  const paged = readings.slice(start, start + limitNum);

  res.json({
    success: true,
    data: paged,
    pagination: { total, page: pageNum, limit: limitNum, totalPages },
  });
});

// GET /api/readings/latest - Latest reading per shipment or by shipmentId
router.get('/latest', (req, res) => {
  const { shipmentId } = req.query;
  if (shipmentId) {
    const reading = store.getLatestReadingByShipment(shipmentId);
    return res.json({ success: true, data: reading });
  }
  const readings = store.getLatestReadings();
  res.json({ success: true, data: readings });
});

// GET /api/readings/:id - Single reading
router.get('/:id', (req, res) => {
  const reading = store.getReadingById(req.params.id);
  if (!reading) return res.status(404).json({ success: false, error: 'Reading not found' });
  res.json({ success: true, data: reading });
});

module.exports = router;
