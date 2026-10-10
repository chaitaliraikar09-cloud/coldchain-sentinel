const fs = require('fs');
const path = require('path');
const config = require('../config');

const DATA_DIR = path.resolve(config.dataDir);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read a JSON file atomically
 */
function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] Error reading ${filename}:`, err.message);
    return null;
  }
}

/**
 * Write a JSON file atomically using a temp file then rename
 */
function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (renameErr) {
      // Windows / OneDrive safe fallback: write directly to destination
      fs.writeFileSync(filePath, content, 'utf8');
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    }
    return true;
  } catch (err) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    } catch (directErr) {
      console.error(`[store] Error writing ${filename}:`, directErr.message);
      return false;
    }
  }
}

// In-memory store with file-backed persistence
const store = {
  _data: {
    shipments: [],
    readings: [],
    alerts: [],
    checkpoints: [],
    settings: {},
  },

  load() {
    this._data.shipments = readJSON('shipments.json') || [];
    this._data.readings = readJSON('readings.json') || [];
    this._data.alerts = readJSON('alerts.json') || [];
    this._data.checkpoints = readJSON('checkpoints.json') || [];
    this._data.settings = readJSON('settings.json') || {};
    console.log(`[store] Loaded: ${this._data.shipments.length} shipments, ${this._data.readings.length} readings, ${this._data.alerts.length} alerts, ${this._data.checkpoints.length} checkpoints`);
  },

  save(collection) {
    if (this._data[collection] !== undefined) {
      writeJSON(`${collection}.json`, this._data[collection]);
    }
  },

  getShipments() { return [...this._data.shipments]; },
  getShipmentById(id) { return this._data.shipments.find(s => s.id === id) || null; },
  upsertShipment(shipment) {
    const idx = this._data.shipments.findIndex(s => s.id === shipment.id);
    if (idx >= 0) {
      this._data.shipments[idx] = { ...this._data.shipments[idx], ...shipment };
    } else {
      this._data.shipments.push(shipment);
    }
    this.save('shipments');
    return this.getShipmentById(shipment.id);
  },

  getReadings(filters = {}) {
    let readings = [...this._data.readings];
    if (filters.shipmentId) {
      readings = readings.filter(r => r.shipmentId === filters.shipmentId || r.shipment_id === filters.shipmentId);
    }
    if (filters.deviceId) readings = readings.filter(r => r.deviceId === filters.deviceId);
    if (filters.sensorId) readings = readings.filter(r => r.sensorId === filters.sensorId);
    if (filters.from) {
      const fromTime = new Date(filters.from).getTime();
      readings = readings.filter(r => {
        const ts = new Date(r.serverReceivedAt || r.timestamp).getTime();
        return !isNaN(ts) && ts >= fromTime;
      });
    }
    if (filters.to) {
      const toTime = new Date(filters.to).getTime();
      readings = readings.filter(r => {
        const ts = new Date(r.serverReceivedAt || r.timestamp).getTime();
        return !isNaN(ts) && ts <= toTime;
      });
    }
    return readings;
  },
  getReadingById(id) { return this._data.readings.find(r => r.id === id) || null; },
  getLatestReadings() {
    const latestMap = {};
    for (const r of this._data.readings) {
      if (!latestMap[r.shipmentId] || new Date(r.serverReceivedAt) > new Date(latestMap[r.shipmentId].serverReceivedAt)) {
        latestMap[r.shipmentId] = r;
      }
    }
    return Object.values(latestMap);
  },
  getLatestReadingByShipment(shipmentId) {
    const readings = this._data.readings.filter(r => r.shipmentId === shipmentId);
    if (!readings.length) return null;
    return readings.reduce((latest, r) =>
      new Date(r.serverReceivedAt) > new Date(latest.serverReceivedAt) ? r : latest
    );
  },
  addReading(reading) {
    this._data.readings.push(reading);
    // Bound history per shipment
    const maxHistory = config.maxReadingHistory;
    const shipmentReadings = this._data.readings.filter(r => r.shipmentId === reading.shipmentId);
    if (shipmentReadings.length > maxHistory) {
      // Remove oldest readings for this shipment
      const toRemove = shipmentReadings.length - maxHistory;
      let removed = 0;
      this._data.readings = this._data.readings.filter(r => {
        if (r.shipmentId === reading.shipmentId && removed < toRemove) {
          removed++;
          return false;
        }
        return true;
      });
    }
    this.save('readings');
    return reading;
  },

  getAlerts(filters = {}) {
    let alerts = [...this._data.alerts];
    if (filters.shipmentId) alerts = alerts.filter(a => a.shipmentId === filters.shipmentId);
    if (filters.severity) alerts = alerts.filter(a => a.severity === filters.severity);
    if (filters.status) alerts = alerts.filter(a => a.status === filters.status);
    if (filters.type) alerts = alerts.filter(a => a.type === filters.type);
    return alerts;
  },
  getAlertById(id) { return this._data.alerts.find(a => a.id === id) || null; },
  getActiveAlertByShipmentAndType(shipmentId, type) {
    return this._data.alerts.find(a =>
      a.shipmentId === shipmentId &&
      a.type === type &&
      a.status === 'ACTIVE'
    ) || null;
  },
  upsertAlert(alert) {
    const idx = this._data.alerts.findIndex(a => a.id === alert.id);
    if (idx >= 0) {
      this._data.alerts[idx] = { ...this._data.alerts[idx], ...alert };
    } else {
      this._data.alerts.push(alert);
    }
    this.save('alerts');
    return this.getAlertById(alert.id);
  },

  getCheckpoints() { return [...this._data.checkpoints]; },
  getCheckpointById(id) { return this._data.checkpoints.find(c => c.id === id) || null; },
  upsertCheckpoint(checkpoint) {
    const idx = this._data.checkpoints.findIndex(c => c.id === checkpoint.id);
    if (idx >= 0) {
      this._data.checkpoints[idx] = { ...this._data.checkpoints[idx], ...checkpoint };
    } else {
      this._data.checkpoints.push(checkpoint);
    }
    this.save('checkpoints');
    return this.getCheckpointById(checkpoint.id);
  },

  getSettings() { return { ...this._data.settings }; },
  updateSettings(updates) {
    this._data.settings = { ...this._data.settings, ...updates };
    this.save('settings');
    return this._data.settings;
  },
};

module.exports = store;
