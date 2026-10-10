const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const store = require('../utils/store');
const { findNearestCheckpoint } = require('../utils/geo');

// GET /api/checkpoints
router.get('/', (req, res) => {
  const checkpoints = store.getCheckpoints();
  res.json({ success: true, data: checkpoints });
});

// GET /api/checkpoints/nearest?shipmentId=SHP-1001
router.get('/nearest', (req, res) => {
  const { shipmentId } = req.query;
  if (!shipmentId) return res.status(400).json({ success: false, error: 'shipmentId is required' });

  const shipment = store.getShipmentById(shipmentId);
  if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

  const latest = store.getLatestReadingByShipment(shipmentId);
  if (!latest || !latest.latitude || !latest.longitude) {
    return res.status(404).json({ success: false, error: 'No valid coordinates available for this shipment' });
  }

  const checkpoints = store.getCheckpoints();
  const nearest = findNearestCheckpoint(latest.latitude, latest.longitude, checkpoints);

  if (!nearest) return res.status(404).json({ success: false, error: 'No available checkpoints found' });

  res.json({
    success: true,
    data: {
      ...nearest,
      note: 'Distance is straight-line (Haversine), not road distance',
    },
  });
});

// GET /api/checkpoints/:id
router.get('/:id', (req, res) => {
  const cp = store.getCheckpointById(req.params.id);
  if (!cp) return res.status(404).json({ success: false, error: 'Checkpoint not found' });
  res.json({ success: true, data: cp });
});

// POST /api/checkpoints
router.post('/', (req, res) => {
  const { name, address, latitude, longitude, type, capacity, contact } = req.body;
  if (!name || !latitude || !longitude) {
    return res.status(400).json({ success: false, error: 'name, latitude, longitude required' });
  }
  const cp = {
    id: `CHK-${uuidv4().slice(0, 3).toUpperCase()}`,
    name, address, latitude, longitude, type: type || 'SECONDARY',
    available: true, capacity: capacity || 50, contact: contact || '',
    createdAt: new Date().toISOString(),
  };
  store.upsertCheckpoint(cp);
  res.status(201).json({ success: true, data: cp });
});

// PATCH /api/checkpoints/:id
router.patch('/:id', (req, res) => {
  const cp = store.getCheckpointById(req.params.id);
  if (!cp) return res.status(404).json({ success: false, error: 'Checkpoint not found' });

  const allowedFields = ['name', 'address', 'available', 'capacity', 'contact', 'operatingHours', 'unavailabilityReason'];
  const updates = {};
  for (const f of allowedFields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const updated = store.upsertCheckpoint({ ...cp, ...updates, updatedAt: new Date().toISOString() });
  res.json({ success: true, data: updated });
});

module.exports = router;
