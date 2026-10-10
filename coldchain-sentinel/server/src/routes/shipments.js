const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const store = require('../utils/store');

// GET /api/shipments
router.get('/', (req, res) => {
  const shipments = store.getShipments();
  const enriched = shipments.map(s => ({
    ...s,
    activeAlertCount: store.getAlerts({ shipmentId: s.id, status: 'ACTIVE' }).length,
    temperatureStatus: s.latestReading
      ? (s.excursionActive ? 'EXCURSION' : 'NORMAL')
      : 'NO_DATA',
  }));
  res.json({ success: true, data: enriched });
});

// GET /api/shipments/:id
router.get('/:id', (req, res) => {
  const shipment = store.getShipmentById(req.params.id);
  if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
  const alerts = store.getAlerts({ shipmentId: shipment.id });
  res.json({ success: true, data: { ...shipment, alerts } });
});

// GET /api/shipments/:id/history
router.get('/:id/history', (req, res) => {
  const shipment = store.getShipmentById(req.params.id);
  if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

  const { limit = 200 } = req.query;
  let readings = store.getReadings({ shipmentId: req.params.id });
  readings.sort((a, b) => new Date(a.serverReceivedAt) - new Date(b.serverReceivedAt));
  readings = readings.slice(-Math.min(parseInt(limit), 500));

  res.json({ success: true, data: readings });
});

// POST /api/shipments
const shipmentValidation = [
  body('name').isString().notEmpty(),
  body('product').isString().notEmpty(),
  body('origin').isString().notEmpty(),
  body('destination').isString().notEmpty(),
  body('tempMin').isFloat(),
  body('tempMax').isFloat(),
];

router.post('/', shipmentValidation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });

  const shipment = {
    id: `SHP-${uuidv4().slice(0, 4).toUpperCase()}`,
    ...req.body,
    status: 'IN_TRANSIT',
    latestReading: null,
    excursionActive: false,
    excursionDuration: 0,
    riskScore: 0,
    riskCategory: 'LOW',
    activeAlertCount: 0,
    totalReadings: 0,
    lastUpdated: null,
    createdAt: new Date().toISOString(),
  };

  store.upsertShipment(shipment);
  res.status(201).json({ success: true, data: shipment });
});

// PATCH /api/shipments/:id
router.patch('/:id', (req, res) => {
  const shipment = store.getShipmentById(req.params.id);
  if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

  const allowedFields = ['name', 'product', 'origin', 'destination', 'tempMin', 'tempMax', 'humidityMin', 'humidityMax', 'notes', 'status', 'estimatedArrival'];
  const updates = {};
  for (const f of allowedFields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const updated = store.upsertShipment({ ...shipment, ...updates, updatedAt: new Date().toISOString() });
  res.json({ success: true, data: updated });
});

module.exports = router;
