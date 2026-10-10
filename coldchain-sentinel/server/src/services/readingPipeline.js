const { v4: uuidv4 } = require('uuid');
const store = require('../utils/store');
const socketEmitter = require('../utils/socketEmitter');
const { processExcursion } = require('./excursionService');
const { computeRiskScore } = require('./riskService');
const { findNearestCheckpoint } = require('../utils/geo');
const config = require('../config');

// Track timestamps of last readings by source
const lastReadingTimestamps = {
  esp32: null,   // Last time a reading with source='esp32' arrived
  simulator: null, // Last time simulator sent a reading
};

/**
 * Process a validated sensor reading through the full pipeline.
 * Used by both the REST endpoint (real ESP32) and the simulator.
 */
async function processReading(rawReading, source = 'esp32') {
  const now = new Date();
  const shipmentId = rawReading.shipment_id || rawReading.shipmentId || 'VAX-001';

  // Strict isolation: simulator cannot touch VAX-001; esp32 cannot touch DEMO-001
  if (shipmentId === 'VAX-001' && source === 'simulator') {
    console.warn('[pipeline] Blocked attempt by simulator to write to VAX-001');
    return { success: false, error: 'Simulator cannot write to VAX-001' };
  }
  if (shipmentId === 'DEMO-001' && source === 'esp32') {
    console.warn('[pipeline] Blocked attempt by ESP32 to write to DEMO-001');
    return { success: false, error: 'ESP32 cannot write to DEMO-001' };
  }

  // Validate temperature is a valid number
  const tempNum = Number(rawReading.temperature);
  if (rawReading.temperature === undefined || rawReading.temperature === null || isNaN(tempNum)) {
    return { success: false, error: 'Invalid or missing temperature reading' };
  }

  // Get or auto-register shipment
  let shipment = store.getShipmentById(shipmentId);
  if (!shipment) {
    if (shipmentId === 'VAX-001' || shipmentId.startsWith('VAX-') || source === 'esp32') {
      shipment = {
        id: shipmentId,
        name: `Live Consignment ${shipmentId}`,
        product: 'COVID-19 mRNA Vaccine (Live Monitored)',
        manufacturer: 'BioGuard Labs',
        batchNumber: `BATCH-${shipmentId}`,
        origin: 'Mumbai Vaccine Depot',
        destination: 'Navi Mumbai Cold Center',
        tempMin: 2,
        tempMax: 8,
        humidityMin: 30,
        humidityMax: 70,
        aqiMax: 100,
        status: 'IN_TRANSIT',
        deviceId: rawReading.deviceId || rawReading.device_id || 'ESP32-001',
        sensorId: rawReading.sensorId || rawReading.sensor_id || 'ENV-AIR-001',
        startTime: now.toISOString(),
        estimatedArrival: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
        notes: 'Live ESP32 Wi-Fi hardware monitored consignment',
        latestReading: null,
        excursionActive: false,
        excursionStartTime: null,
        excursionDuration: 0,
        riskScore: 0,
        riskCategory: 'LOW',
        activeAlertCount: 0,
        totalReadings: 0,
      };
      store.upsertShipment(shipment);
    } else {
      return { success: false, error: `Shipment ${shipmentId} not found` };
    }
  }

  // Timestamp handling - preserve original timestamp string (e.g. "18s" or ISO)
  const rawTs = rawReading.timestamp != null ? String(rawReading.timestamp) : now.toISOString();
  let parsedDeviceTs = null;
  const parsedCandidate = new Date(rawTs);
  if (!isNaN(parsedCandidate.getTime())) {
    parsedDeviceTs = parsedCandidate;
  }

  const latestReading = store.getLatestReadingByShipment(shipmentId);
  if (latestReading && latestReading.serverReceivedAt && parsedDeviceTs) {
    const latestServerTs = new Date(latestReading.serverReceivedAt);
    if (parsedDeviceTs < latestServerTs) {
      rawReading._outOfOrder = true;
    }
  }

  // Air quality AQI extraction
  const aqiValue = rawReading.air_quality_aqi !== undefined && rawReading.air_quality_aqi !== null
    ? Number(rawReading.air_quality_aqi)
    : (rawReading.airQualityAqi !== undefined && rawReading.airQualityAqi !== null ? Number(rawReading.airQualityAqi) : null);

  // Construct enriched reading preserving all mandatory fields
  const reading = {
    id: `RDG-${uuidv4().slice(0, 8).toUpperCase()}`,
    deviceId: rawReading.deviceId || rawReading.device_id || 'ESP32-001',
    shipmentId,
    shipment_id: shipmentId, // Preserved explicitly for ESP32 contract
    sensorId: rawReading.sensorId || rawReading.sensor_id || 'ENV-AIR-001',
    temperature: tempNum,
    humidity: rawReading.humidity != null ? Number(rawReading.humidity) : null,
    air_quality_aqi: aqiValue,
    latitude: rawReading.latitude != null ? Number(rawReading.latitude) : null,
    longitude: rawReading.longitude != null ? Number(rawReading.longitude) : null,
    battery: rawReading.battery != null ? Number(rawReading.battery) : null,
    timestamp: rawTs, // Original ESP32 timestamp preserved
    serverReceivedAt: now.toISOString(), // Server-side receipt timestamp
    source, // 'esp32' or 'simulator'
    sourceLabel: source === 'esp32' ? 'ESP32 Device' : 'Backend Simulator',
    outOfOrder: rawReading._outOfOrder || false,
    validationStatus: 'ACCEPTED',
    rawPayload: rawReading,
  };

  // Store reading
  store.addReading(reading);

  // Update last reading timestamps by source
  if (source === 'esp32') {
    lastReadingTimestamps.esp32 = now.toISOString();
  } else {
    lastReadingTimestamps.simulator = now.toISOString();
  }

  // Process excursion detection and alerts
  const excursionEvents = processExcursion(shipment, reading);

  // Compute risk score from last 50 readings for this shipment
  const recentReadings = store.getReadings({ shipmentId }).slice(-50);
  const riskResult = computeRiskScore(shipment, recentReadings);

  // Find nearest checkpoint if we have coordinates
  let nearestCheckpoint = null;
  if (reading.latitude && reading.longitude) {
    const checkpoints = store.getCheckpoints();
    nearestCheckpoint = findNearestCheckpoint(reading.latitude, reading.longitude, checkpoints);
  }

  // Update shipment state
  const updatedShipment = {
    ...shipment,
    latestReading: reading,
    lastUpdated: now.toISOString(),
    lastDeviceTimestamp: reading.timestamp,
    lastServerReceiptAt: now.toISOString(),
    riskScore: riskResult.score,
    riskCategory: riskResult.category,
    totalReadings: (shipment.totalReadings || 0) + 1,
    nearestCheckpoint,
  };

  store.upsertShipment(updatedShipment);

  // Broadcast via Socket.IO
  socketEmitter.emit('reading:new', {
    reading,
    source,
    sourceLabel: reading.sourceLabel,
  });
  socketEmitter.emit('shipment:updated', {
    shipment: updatedShipment,
    riskScore: riskResult,
    nearestCheckpoint,
  });
  socketEmitter.emitToShipment(shipmentId, 'shipment:updated', {
    shipment: updatedShipment,
    riskScore: riskResult,
    nearestCheckpoint,
  });

  for (const event of excursionEvents) {
    socketEmitter.emit(event.type, event.data);
  }

  if (nearestCheckpoint) {
    socketEmitter.emitToShipment(shipmentId, 'checkpoint:recommendation', nearestCheckpoint);
  }

  return {
    success: true,
    reading,
    shipment: updatedShipment,
    riskScore: riskResult,
    nearestCheckpoint,
    excursionEvents,
  };
}

function getLastReadingTimestamps() {
  return { ...lastReadingTimestamps };
}

module.exports = { processReading, getLastReadingTimestamps };
