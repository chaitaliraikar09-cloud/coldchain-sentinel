const express = require('express');
const router = express.Router();
const store = require('../utils/store');
const { computeRiskScore } = require('../services/riskService');

// GET /api/analytics/overview
router.get('/overview', (req, res) => {
  const shipments = store.getShipments();
  const alerts = store.getAlerts();
  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE');

  const total = shipments.length;
  const withinRange = shipments.filter(s => s.latestReading && !s.excursionActive).length;
  const excursions = shipments.filter(s => s.excursionActive).length;
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'CRITICAL').length;
  const requiresIntervention = shipments.filter(s => s.riskScore >= 40).length;

  res.json({
    success: true,
    data: {
      totalShipments: total,
      shipmentsWithinRange: withinRange,
      activeExcursions: excursions,
      criticalAlerts,
      shipmentsRequiringIntervention: requiresIntervention,
      totalActiveAlerts: activeAlerts.length,
      totalAlerts: alerts.length,
    },
  });
});

// GET /api/analytics/temperature?shipmentId=SHP-1001&range=1h
router.get('/temperature', (req, res) => {
  const { shipmentId, range = '1h' } = req.query;

  const rangeMap = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 };
  const minutes = rangeMap[range] || 60;
  const since = new Date(Date.now() - minutes * 60 * 1000);

  const filters = { from: since.toISOString() };
  if (shipmentId) filters.shipmentId = shipmentId;

  let readings = store.getReadings(filters);
  readings.sort((a, b) => new Date(a.serverReceivedAt) - new Date(b.serverReceivedAt));

  const data = readings.map(r => ({
    time: r.serverReceivedAt,
    deviceTime: r.timestamp,
    temperature: r.temperature,
    humidity: r.humidity,
    air_quality_aqi: r.air_quality_aqi !== undefined && r.air_quality_aqi !== null
      ? r.air_quality_aqi
      : (r.airQualityAqi !== undefined && r.airQualityAqi !== null ? r.airQualityAqi : null),
    shipmentId: r.shipmentId,
    source: r.source,
    sourceLabel: r.sourceLabel,
  }));

  res.json({ success: true, data, range, shipmentId: shipmentId || 'all' });
});

// GET /api/analytics/excursions
router.get('/excursions', (req, res) => {
  const shipments = store.getShipments();
  const alerts = store.getAlerts();

  const excursionAlerts = alerts.filter(a => a.type === 'TEMP_HIGH' || a.type === 'TEMP_LOW');
  const byShipment = {};

  for (const alert of excursionAlerts) {
    if (!byShipment[alert.shipmentId]) {
      byShipment[alert.shipmentId] = { shipmentId: alert.shipmentId, count: 0, totalDuration: 0, maxSeverity: 'MINOR' };
    }
    byShipment[alert.shipmentId].count++;
    byShipment[alert.shipmentId].totalDuration += alert.durationMinutes || 0;
    if (alert.severity === 'CRITICAL') byShipment[alert.shipmentId].maxSeverity = 'CRITICAL';
    else if (alert.severity === 'MODERATE' && byShipment[alert.shipmentId].maxSeverity !== 'CRITICAL') {
      byShipment[alert.shipmentId].maxSeverity = 'MODERATE';
    }
  }

  res.json({ success: true, data: Object.values(byShipment) });
});

// GET /api/analytics/risk
router.get('/risk', (req, res) => {
  const shipments = store.getShipments();
  const riskData = shipments.map(s => {
    const recentReadings = store.getReadings({ shipmentId: s.id }).slice(-50);
    const risk = computeRiskScore(s, recentReadings);
    return {
      shipmentId: s.id,
      name: s.name,
      ...risk,
    };
  });

  res.json({ success: true, data: riskData });
});

module.exports = router;
