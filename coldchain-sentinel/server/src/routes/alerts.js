const express = require('express');
const router = express.Router();
const store = require('../utils/store');

// GET /api/alerts
router.get('/', (req, res) => {
  const { shipmentId, severity, status, type } = req.query;
  const filters = {};
  if (shipmentId) filters.shipmentId = shipmentId;
  if (severity) filters.severity = severity;
  if (status) filters.status = status;
  if (type) filters.type = type;

  let alerts = store.getAlerts(filters);
  alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, data: alerts });
});

// GET /api/alerts/summary
router.get('/summary', (req, res) => {
  const all = store.getAlerts();
  const summary = {
    total: all.length,
    active: all.filter(a => a.status === 'ACTIVE').length,
    critical: all.filter(a => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length,
    acknowledged: all.filter(a => a.status === 'ACKNOWLEDGED').length,
    resolved: all.filter(a => a.status === 'RESOLVED').length,
  };
  res.json({ success: true, data: summary });
});

// GET /api/alerts/:id
router.get('/:id', (req, res) => {
  const alert = store.getAlertById(req.params.id);
  if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });
  res.json({ success: true, data: alert });
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', (req, res) => {
  const alert = store.getAlertById(req.params.id);
  if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });
  if (alert.status !== 'ACTIVE') return res.status(400).json({ success: false, error: 'Alert is not active' });

  const updated = store.upsertAlert({
    ...alert,
    status: 'ACKNOWLEDGED',
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: req.body.acknowledgedBy || 'dashboard-user',
  });

  const socketEmitter = require('../utils/socketEmitter');
  socketEmitter.emit('alert:updated', updated);

  res.json({ success: true, data: updated });
});

// PATCH /api/alerts/:id/resolve
router.patch('/:id/resolve', (req, res) => {
  const alert = store.getAlertById(req.params.id);
  if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });

  const updated = store.upsertAlert({
    ...alert,
    status: 'RESOLVED',
    resolvedAt: new Date().toISOString(),
    resolvedBy: req.body.resolvedBy || 'dashboard-user',
    resolutionNotes: req.body.notes || '',
  });

  const socketEmitter = require('../utils/socketEmitter');
  socketEmitter.emit('alert:updated', updated);

  res.json({ success: true, data: updated });
});

module.exports = router;
