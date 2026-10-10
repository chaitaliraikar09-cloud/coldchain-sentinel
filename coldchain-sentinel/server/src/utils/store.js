const fs = require('fs');
const path = require('path');
const config = require('../config');
const database = require('../db/database');

const DATA_DIR = path.resolve(config.dataDir);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (renameErr) {
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

const store = {
  _settings: {},

  load() {
    this._settings = readJSON('settings.json') || {};
    const shipments = database.getShipments();
    const readingsCount = database.countReadings();
    const alerts = database.getAlerts();
    const checkpoints = database.getCheckpoints();
    console.log(`[store] SQLite persistent store ready: ${shipments.length} shipments, ${readingsCount} readings, ${alerts.length} alerts, ${checkpoints.length} checkpoints`);
  },

  getShipments() {
    return database.getShipments();
  },

  getShipmentById(id) {
    return database.getShipmentById(id);
  },

  upsertShipment(shipment) {
    return database.upsertShipment(shipment);
  },

  getReadings(filters = {}) {
    return database.getReadings(filters);
  },

  getReadingById(id) {
    return database.getReadingById(id);
  },

  getLatestReadings() {
    return database.getLatestReadings();
  },

  getLatestReadingByShipment(shipmentId) {
    return database.getLatestReadingByShipment(shipmentId);
  },

  addReading(reading) {
    const inserted = database.insertReading(reading);
    return inserted || reading;
  },

  getAlerts(filters = {}) {
    return database.getAlerts(filters);
  },

  getAlertById(id) {
    return database.getAlertById(id);
  },

  getActiveAlertByShipmentAndType(shipmentId, type) {
    return database.getActiveAlertByShipmentAndType(shipmentId, type);
  },

  upsertAlert(alert) {
    return database.upsertAlert(alert);
  },

  getCheckpoints() {
    return database.getCheckpoints();
  },

  getCheckpointById(id) {
    return database.getCheckpointById(id);
  },

  upsertCheckpoint(checkpoint) {
    return database.upsertCheckpoint(checkpoint);
  },

  getReports(filters = {}) {
    return database.getReports(filters);
  },

  getReportById(id) {
    return database.getReportById(id);
  },

  saveReport(report) {
    return database.saveReport(report);
  },

  getSettings() {
    return { ...this._settings };
  },

  updateSettings(updates) {
    this._settings = { ...this._settings, ...updates };
    writeJSON('settings.json', this._settings);
    return this._settings;
  },

  checkHealth() {
    return database.checkHealth();
  },
};

module.exports = store;
