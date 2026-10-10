const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');


// Database path in server/data/vaxiverify.db
const DATA_DIR = path.resolve(config.dataDir);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'vaxiverify.db');

class LocalDatabase {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.init();
  }

  init() {
    try {
      this.db = new DatabaseSync(DB_PATH);
      // Enable WAL mode if available for high concurrency
      try { this.db.exec('PRAGMA journal_mode = WAL;'); } catch (_) {}
      try { this.db.exec('PRAGMA foreign_keys = OFF;'); } catch (_) {}

      this._createTables();
      this._seedIfEmpty();
      this.isReady = true;
      console.log(`[database] SQLite local persistence initialized at: ${DB_PATH}`);
    } catch (err) {
      console.error('[database] Failed to initialize SQLite database:', err.message);
      this.isReady = false;
    }
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY,
        product TEXT NOT NULL,
        batch_number TEXT,
        origin TEXT,
        destination TEXT,
        temp_min REAL DEFAULT 2.0,
        temp_max REAL DEFAULT 8.0,
        humidity_min REAL DEFAULT 30.0,
        humidity_max REAL DEFAULT 70.0,
        aqi_max INTEGER DEFAULT 100,
        status TEXT DEFAULT 'IN_TRANSIT',
        risk_score INTEGER DEFAULT 0,
        risk_category TEXT DEFAULT 'LOW',
        excursion_active INTEGER DEFAULT 0,
        excursion_duration REAL DEFAULT 0,
        verification_status TEXT DEFAULT 'PENDING_INSPECTION',
        inspection_notes TEXT,
        verified_at TEXT,
        verified_by TEXT,
        node_ip TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS readings (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL,
        device_id TEXT,
        sensor_id TEXT,
        temperature REAL NOT NULL,
        humidity REAL,
        air_quality_aqi INTEGER,
        latitude REAL,
        longitude REAL,
        battery REAL,
        source TEXT DEFAULT 'esp32',
        source_label TEXT,
        validation_status TEXT DEFAULT 'VALID',
        device_timestamp TEXT,
        server_received_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        dedup_key TEXT UNIQUE,
        FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_readings_shipment_time ON readings(shipment_id, server_received_at);
      CREATE INDEX IF NOT EXISTS idx_readings_dedup ON readings(dedup_key);

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        temperature REAL,
        air_quality_aqi INTEGER,
        threshold REAL,
        duration_minutes REAL,
        recommended_action TEXT,
        created_at TEXT NOT NULL,
        acknowledged_at TEXT,
        resolved_at TEXT,
        FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_shipment_status ON alerts(shipment_id, status);

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        type TEXT DEFAULT 'WAREHOUSE',
        available INTEGER DEFAULT 1,
        capacity INTEGER DEFAULT 1000,
        contact TEXT,
        operating_hours TEXT
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL,
        type TEXT NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        file_size INTEGER,
        generated_at TEXT NOT NULL,
        generated_by TEXT DEFAULT 'System',
        status TEXT DEFAULT 'READY',
        error_message TEXT,
        FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_reports_shipment ON reports(shipment_id, generated_at);
    `);
  }

  _seedIfEmpty() {
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM shipments');
      const count = countStmt.get().count;
      if (count > 0) return; // Already has data

      console.log('[database] Seeding SQLite database from initial JSON data files...');

      // Seed shipments
      const shipmentsFile = path.join(DATA_DIR, 'shipments.json');
      if (fs.existsSync(shipmentsFile)) {
        const raw = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
        const stmt = this.db.prepare(`
          INSERT INTO shipments (
            id, product, batch_number, origin, destination,
            temp_min, temp_max, humidity_min, humidity_max, aqi_max,
            status, risk_score, risk_category, excursion_active, excursion_duration,
            verification_status, inspection_notes, node_ip, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of raw) {
          stmt.run(
            s.id,
            s.product || 'Unknown',
            s.batchNumber || null,
            s.origin || null,
            s.destination || null,
            s.tempMin ?? 2.0,
            s.tempMax ?? 8.0,
            s.humidityMin ?? 30.0,
            s.humidityMax ?? 70.0,
            s.aqiMax ?? 100,
            s.status || 'IN_TRANSIT',
            s.riskScore ?? 0,
            s.riskCategory || 'LOW',
            s.excursionActive ? 1 : 0,
            s.excursionDuration ?? 0,
            s.verificationStatus || 'PENDING_INSPECTION',
            s.inspectionNotes || null,
            s.nodeIp || null,
            s.createdAt || new Date().toISOString(),
            s.updatedAt || new Date().toISOString()
          );
        }
      }

      // Seed checkpoints
      const checkpointsFile = path.join(DATA_DIR, 'checkpoints.json');
      if (fs.existsSync(checkpointsFile)) {
        const raw = JSON.parse(fs.readFileSync(checkpointsFile, 'utf8'));
        const stmt = this.db.prepare(`
          INSERT INTO checkpoints (id, name, address, latitude, longitude, type, available, capacity, contact, operating_hours)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of raw) {
          stmt.run(
            c.id, c.name, c.address || null,
            c.latitude, c.longitude,
            c.type || 'WAREHOUSE',
            c.available ? 1 : 0,
            c.capacity || 1000,
            c.contact || null,
            c.operatingHours || null
          );
        }
      }

      // Seed alerts
      const alertsFile = path.join(DATA_DIR, 'alerts.json');
      if (fs.existsSync(alertsFile)) {
        const raw = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
        const stmt = this.db.prepare(`
          INSERT INTO alerts (
            id, shipment_id, type, severity, message, status,
            temperature, air_quality_aqi, threshold, duration_minutes, recommended_action,
            created_at, acknowledged_at, resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of raw) {
          stmt.run(
            a.id, a.shipmentId, a.type, a.severity, a.message, a.status || 'ACTIVE',
            a.temperature ?? null, a.airQualityAqi ?? a.aqi ?? null,
            a.threshold ?? null, a.durationMinutes ?? null, a.recommendedAction || null,
            a.createdAt || new Date().toISOString(),
            a.acknowledgedAt || null, a.resolvedAt || null
          );
        }
      }

      // Seed readings (up to initial 500)
      const readingsFile = path.join(DATA_DIR, 'readings.json');
      if (fs.existsSync(readingsFile)) {
        const raw = JSON.parse(fs.readFileSync(readingsFile, 'utf8'));
        const stmt = this.db.prepare(`
          INSERT OR IGNORE INTO readings (
            id, shipment_id, device_id, sensor_id, temperature, humidity, air_quality_aqi,
            latitude, longitude, battery, source, source_label, validation_status,
            device_timestamp, server_received_at, created_at, dedup_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of raw) {
          const shipId = r.shipmentId || r.shipment_id;
          const dedup = `${shipId}_${r.timestamp || r.deviceTimestamp}_${r.temperature}_${r.serverReceivedAt}`;
          stmt.run(
            r.id,
            shipId,
            r.deviceId || null,
            r.sensorId || null,
            r.temperature,
            r.humidity ?? null,
            r.air_quality_aqi ?? r.airQualityAqi ?? null,
            r.latitude ?? null,
            r.longitude ?? null,
            r.battery ?? null,
            r.source || 'esp32',
            r.sourceLabel || null,
            r.validationStatus || 'VALID',
            r.timestamp || r.deviceTimestamp || null,
            r.serverReceivedAt || new Date().toISOString(),
            r.serverReceivedAt || new Date().toISOString(),
            dedup
          );
        }
      }

      console.log('[database] Initial seeding complete.');
    } catch (seedErr) {
      console.error('[database] Seeding warning:', seedErr.message);
    }
  }

  // --- Shipments ---
  getShipments() {
    const rows = this.db.prepare('SELECT * FROM shipments ORDER BY id ASC').all();
    return rows.map(r => this._mapShipment(r));
  }

  getShipmentById(id) {
    const row = this.db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
    return row ? this._mapShipment(row) : null;
  }

  upsertShipment(s) {
    const existing = this.getShipmentById(s.id);
    const now = new Date().toISOString();
    const product = s.product || s.name || existing?.product || 'Generic Vaccine Batch';
    if (existing) {
      const merged = { ...existing, ...s, product, updatedAt: now };
      this.db.prepare(`
        UPDATE shipments SET
          product = ?, batch_number = ?, origin = ?, destination = ?,
          temp_min = ?, temp_max = ?, humidity_min = ?, humidity_max = ?, aqi_max = ?,
          status = ?, risk_score = ?, risk_category = ?, excursion_active = ?, excursion_duration = ?,
          verification_status = ?, inspection_notes = ?, verified_at = ?, verified_by = ?,
          node_ip = ?, updated_at = ?
        WHERE id = ?
      `).run(
        merged.product, merged.batchNumber || null, merged.origin || null, merged.destination || null,
        merged.tempMin ?? 2.0, merged.tempMax ?? 8.0, merged.humidityMin ?? 30.0, merged.humidityMax ?? 70.0, merged.aqiMax ?? 100,
        merged.status || 'IN_TRANSIT', merged.riskScore ?? 0, merged.riskCategory || 'LOW', merged.excursionActive ? 1 : 0, merged.excursionDuration ?? 0,
        merged.verificationStatus || 'PENDING_INSPECTION', merged.inspectionNotes || null, merged.verifiedAt || null, merged.verifiedBy || null,
        merged.nodeIp || null, now, merged.id
      );
      return this.getShipmentById(s.id);
    } else {
      this.db.prepare(`
        INSERT INTO shipments (
          id, product, batch_number, origin, destination,
          temp_min, temp_max, humidity_min, humidity_max, aqi_max,
          status, risk_score, risk_category, excursion_active, excursion_duration,
          verification_status, inspection_notes, verified_at, verified_by,
          node_ip, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        s.id, product, s.batchNumber || null, s.origin || null, s.destination || null,
        s.tempMin ?? 2.0, s.tempMax ?? 8.0, s.humidityMin ?? 30.0, s.humidityMax ?? 70.0, s.aqiMax ?? 100,
        s.status || 'IN_TRANSIT', s.riskScore ?? 0, s.riskCategory || 'LOW', s.excursionActive ? 1 : 0, s.excursionDuration ?? 0,
        s.verificationStatus || 'PENDING_INSPECTION', s.inspectionNotes || null, s.verifiedAt || null, s.verifiedBy || null,
        s.nodeIp || null, s.createdAt || now, now
      );
      return this.getShipmentById(s.id);
    }
  }

  // --- Telemetry Readings ---
  insertReading(r) {
    if (!r.id) {
      r.id = `RDG-${uuidv4().slice(0, 8).toUpperCase()}`;
    }
    if (r.temperature == null || isNaN(r.temperature)) {
      throw new Error('Invalid reading record: Valid temperature is required');
    }

    const shipId = r.shipmentId || r.shipment_id || 'VAX-001';
    // Auto-create shipment if non-existent
    if (!this.getShipmentById(shipId)) {
      this.upsertShipment({ id: shipId, product: 'Generic Vaccine Batch' });
    }

    const devTs = r.timestamp || r.deviceTimestamp || '';
    let dedup = r.dedupKey;
    if (!dedup) {
      if (devTs) {
        dedup = `${shipId}_${r.deviceId || 'node'}_${devTs}`;
      } else {
        dedup = `${shipId}_${r.deviceId || 'node'}_${r.serverReceivedAt || Date.now()}_${r.id}`;
      }
    }
    const now = new Date().toISOString();
    const serverReceived = r.serverReceivedAt || now;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO readings (
        id, shipment_id, device_id, sensor_id, temperature, humidity, air_quality_aqi,
        latitude, longitude, battery, source, source_label, validation_status,
        device_timestamp, server_received_at, created_at, dedup_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      r.id,
      shipId,
      r.deviceId || null,
      r.sensorId || null,
      Number(r.temperature),
      r.humidity != null ? Number(r.humidity) : null,
      r.air_quality_aqi != null ? Number(r.air_quality_aqi) : (r.airQualityAqi != null ? Number(r.airQualityAqi) : null),
      r.latitude != null ? Number(r.latitude) : null,
      r.longitude != null ? Number(r.longitude) : null,
      r.battery != null ? Number(r.battery) : null,
      r.source || 'esp32',
      r.sourceLabel || null,
      r.validationStatus || 'VALID',
      devTs || null,
      serverReceived,
      now,
      dedup
    );

    return result.changes > 0 ? r : null; // returns null if duplicate prevented
  }

  getReadings(filters = {}) {
    let sql = 'SELECT * FROM readings WHERE 1=1';
    const params = [];

    if (filters.shipmentId) {
      sql += ' AND shipment_id = ?';
      params.push(filters.shipmentId);
    }
    if (filters.deviceId) {
      sql += ' AND device_id = ?';
      params.push(filters.deviceId);
    }
    if (filters.sensorId) {
      sql += ' AND sensor_id = ?';
      params.push(filters.sensorId);
    }
    if (filters.source) {
      sql += ' AND source = ?';
      params.push(filters.source);
    }
    if (filters.from) {
      sql += ' AND server_received_at >= ?';
      params.push(new Date(filters.from).toISOString());
    }
    if (filters.to) {
      sql += ' AND server_received_at <= ?';
      params.push(new Date(filters.to).toISOString());
    }

    sql += ' ORDER BY server_received_at ASC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(Number(filters.limit));
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(Number(filters.offset));
      }
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(r => this._mapReading(r));
  }

  getReadingById(id) {
    const row = this.db.prepare('SELECT * FROM readings WHERE id = ?').get(id);
    return row ? this._mapReading(row) : null;
  }

  getLatestReadingByShipment(shipmentId) {
    const row = this.db.prepare(`
      SELECT * FROM readings WHERE shipment_id = ? ORDER BY server_received_at DESC LIMIT 1
    `).get(shipmentId);
    return row ? this._mapReading(row) : null;
  }

  getLatestReadings() {
    const rows = this.db.prepare(`
      SELECT r.* FROM readings r
      INNER JOIN (
        SELECT shipment_id, MAX(server_received_at) as max_ts
        FROM readings GROUP BY shipment_id
      ) latest ON r.shipment_id = latest.shipment_id AND r.server_received_at = latest.max_ts
    `).all();
    return rows.map(r => this._mapReading(r));
  }

  countReadings(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM readings WHERE 1=1';
    const params = [];
    if (filters.shipmentId) {
      sql += ' AND shipment_id = ?';
      params.push(filters.shipmentId);
    }
    if (filters.source) {
      sql += ' AND source = ?';
      params.push(filters.source);
    }
    const row = this.db.prepare(sql).get(...params);
    return row?.count || 0;
  }

  // --- Alerts ---
  getAlerts(filters = {}) {
    let sql = 'SELECT * FROM alerts WHERE 1=1';
    const params = [];

    if (filters.shipmentId) {
      sql += ' AND shipment_id = ?';
      params.push(filters.shipmentId);
    }
    if (filters.severity) {
      sql += ' AND severity = ?';
      params.push(filters.severity);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map(r => this._mapAlert(r));
  }

  getAlertById(id) {
    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    return row ? this._mapAlert(row) : null;
  }

  getActiveAlertByShipmentAndType(shipmentId, type) {
    const row = this.db.prepare(`
      SELECT * FROM alerts WHERE shipment_id = ? AND type = ? AND status = 'ACTIVE' LIMIT 1
    `).get(shipmentId, type);
    return row ? this._mapAlert(row) : null;
  }

  upsertAlert(a) {
    const shipId = a.shipmentId || a.shipment_id;
    if (shipId && !this.getShipmentById(shipId)) {
      this.upsertShipment({ id: shipId, product: 'Vaccine Shipment ' + shipId });
    }

    const existing = this.getAlertById(a.id);
    const now = new Date().toISOString();
    if (existing) {
      const aqiVal = a.airQualityAqi !== undefined ? a.airQualityAqi : (a.air_quality_aqi !== undefined ? a.air_quality_aqi : (a.aqi !== undefined ? a.aqi : existing.airQualityAqi));
      const tempVal = a.temperature !== undefined ? a.temperature : existing.temperature;
      const severityVal = a.severity || existing.severity;
      const messageVal = a.message || existing.message;
      const thresholdVal = a.threshold !== undefined ? a.threshold : existing.threshold;
      const durationVal = a.durationMinutes !== undefined ? a.durationMinutes : existing.durationMinutes;
      const actionVal = a.recommendedAction || existing.recommendedAction;
      const statusVal = a.status || existing.status;

      this.db.prepare(`
        UPDATE alerts SET
          severity = ?, message = ?, status = ?,
          temperature = ?, air_quality_aqi = ?, threshold = ?, duration_minutes = ?,
          recommended_action = ?, acknowledged_at = ?, resolved_at = ?
        WHERE id = ?
      `).run(
        severityVal,
        messageVal,
        statusVal,
        tempVal,
        aqiVal,
        thresholdVal,
        durationVal,
        actionVal,
        statusVal === 'ACKNOWLEDGED' ? (a.acknowledgedAt || now) : existing.acknowledgedAt,
        statusVal === 'RESOLVED' ? (a.resolvedAt || now) : existing.resolvedAt,
        a.id
      );
      return this.getAlertById(a.id);
    } else {
      this.db.prepare(`
        INSERT INTO alerts (
          id, shipment_id, type, severity, message, status,
          temperature, air_quality_aqi, threshold, duration_minutes, recommended_action,
          created_at, acknowledged_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        a.id, shipId, a.type, a.severity, a.message, a.status || 'ACTIVE',
        a.temperature ?? null, a.airQualityAqi ?? a.air_quality_aqi ?? a.aqi ?? null,
        a.threshold ?? null, a.durationMinutes ?? null, a.recommendedAction || null,
        a.createdAt || now, a.acknowledgedAt || null, a.resolvedAt || null
      );
      return this.getAlertById(a.id);
    }
  }

  // --- Checkpoints ---
  getCheckpoints() {
    const rows = this.db.prepare('SELECT * FROM checkpoints ORDER BY name ASC').all();
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      type: r.type,
      available: Boolean(r.available),
      capacity: r.capacity,
      contact: r.contact,
      operatingHours: r.operating_hours,
    }));
  }

  getCheckpointById(id) {
    const r = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id);
    return r ? {
      id: r.id,
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      type: r.type,
      available: Boolean(r.available),
      capacity: r.capacity,
      contact: r.contact,
      operatingHours: r.operating_hours,
    } : null;
  }

  upsertCheckpoint(c) {
    this.db.prepare(`
      INSERT INTO checkpoints (id, name, address, latitude, longitude, type, available, capacity, contact, operating_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, address=excluded.address, latitude=excluded.latitude, longitude=excluded.longitude,
        type=excluded.type, available=excluded.available, capacity=excluded.capacity, contact=excluded.contact,
        operating_hours=excluded.operating_hours
    `).run(
      c.id, c.name, c.address || null, c.latitude, c.longitude,
      c.type || 'WAREHOUSE', c.available ? 1 : 0, c.capacity || 1000,
      c.contact || null, c.operatingHours || null
    );
    return this.getCheckpointById(c.id);
  }

  // --- Reports ---
  saveReport(r) {
    this.db.prepare(`
      INSERT INTO reports (id, shipment_id, type, filename, filepath, file_size, generated_at, generated_by, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status, error_message=excluded.error_message, file_size=excluded.file_size
    `).run(
      r.id, r.shipmentId, r.type, r.filename, r.filepath,
      r.fileSize || 0, r.generatedAt || new Date().toISOString(),
      r.generatedBy || 'System', r.status || 'READY', r.errorMessage || null
    );
    return this.getReportById(r.id);
  }

  getReports(filters = {}) {
    let sql = 'SELECT * FROM reports WHERE 1=1';
    const params = [];
    if (filters.shipmentId) {
      sql += ' AND shipment_id = ?';
      params.push(filters.shipmentId);
    }
    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }
    sql += ' ORDER BY generated_at DESC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map(r => ({
      id: r.id,
      shipmentId: r.shipment_id,
      type: r.type,
      filename: r.filename,
      filepath: r.filepath,
      fileSize: r.file_size,
      generatedAt: r.generated_at,
      generatedBy: r.generated_by,
      status: r.status,
      errorMessage: r.error_message,
    }));
  }

  getReportById(id) {
    const r = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    return r ? {
      id: r.id,
      shipmentId: r.shipment_id,
      type: r.type,
      filename: r.filename,
      filepath: r.filepath,
      fileSize: r.file_size,
      generatedAt: r.generated_at,
      generatedBy: r.generated_by,
      status: r.status,
      errorMessage: r.error_message,
    } : null;
  }

  // --- Health Diagnostic ---
  checkHealth() {
    try {
      if (!this.db) return { available: false, error: 'Database not initialized' };
      const row = this.db.prepare('SELECT 1 as alive').get();
      const stats = fs.statSync(DB_PATH);
      return {
        available: row?.alive === 1,
        type: 'sqlite',
        path: DB_PATH,
        sizeBytes: stats.size,
        lastModified: stats.mtime.toISOString(),
      };
    } catch (e) {
      return { available: false, error: e.message };
    }
  }

  // --- Entity mappers ---
  _mapShipment(r) {
    return {
      id: r.id,
      name: r.product,
      product: r.product,
      batchNumber: r.batch_number,
      origin: r.origin,
      destination: r.destination,
      tempMin: r.temp_min,
      tempMax: r.temp_max,
      humidityMin: r.humidity_min,
      humidityMax: r.humidity_max,
      aqiMax: r.aqi_max,
      status: r.status,
      riskScore: r.risk_score,
      riskCategory: r.risk_category,
      excursionActive: Boolean(r.excursion_active),
      excursionDuration: r.excursion_duration,
      verificationStatus: r.verification_status,
      inspectionNotes: r.inspection_notes,
      verifiedAt: r.verified_at,
      verifiedBy: r.verified_by,
      nodeIp: r.node_ip,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      latestReading: this.getLatestReadingByShipment(r.id),
    };
  }

  _mapReading(r) {
    return {
      id: r.id,
      shipmentId: r.shipment_id,
      deviceId: r.device_id,
      sensorId: r.sensor_id,
      temperature: r.temperature,
      humidity: r.humidity,
      air_quality_aqi: r.air_quality_aqi,
      airQualityAqi: r.air_quality_aqi,
      latitude: r.latitude,
      longitude: r.longitude,
      battery: r.battery,
      source: r.source,
      sourceLabel: r.source_label,
      validationStatus: r.validation_status,
      timestamp: r.device_timestamp,
      deviceTimestamp: r.device_timestamp,
      serverReceivedAt: r.server_received_at,
      createdAt: r.created_at,
    };
  }

  _mapAlert(r) {
    return {
      id: r.id,
      shipmentId: r.shipment_id,
      type: r.type,
      severity: r.severity,
      message: r.message,
      status: r.status,
      temperature: r.temperature,
      airQualityAqi: r.air_quality_aqi,
      aqi: r.air_quality_aqi,
      threshold: r.threshold,
      durationMinutes: r.duration_minutes,
      recommendedAction: r.recommended_action,
      createdAt: r.created_at,
      acknowledgedAt: r.acknowledged_at,
      resolvedAt: r.resolved_at,
    };
  }
}

// Singleton database instance
const database = new LocalDatabase();

module.exports = database;
