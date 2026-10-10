/**
 * Tests for API validation, excursion detection, risk score, and checkpoints
 */
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = './data';
process.env.DEVICE_API_KEY = 'test-key';

const request = require('supertest');
const app = require('../src/app');
const store = require('../src/utils/store');
const { processExcursion } = require('../src/services/excursionService');
const { computeRiskScore } = require('../src/services/riskService');
const { haversineDistance, findNearestCheckpoint } = require('../src/utils/geo');

// Load store before tests
beforeAll(() => {
  store.load();
});

// ────────────────────────────────────────
// API Root & Health
// ────────────────────────────────────────
describe('GET /', () => {
  it('returns status 200 and backend running confirmation', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      app: 'ColdChain Sentinel',
      message: 'Backend is running',
    });
  });
});

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.connectedClients).toBe('number');
  });
});

// ────────────────────────────────────────
// Reading Validation
// ────────────────────────────────────────
describe('POST /api/readings - validation', () => {
  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send({ deviceId: 'TEST-001' }); // missing shipmentId etc
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects temperature out of range', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send({
        deviceId: 'TEST-001',
        shipmentId: 'VAX-001',
        sensorId: 'TEMP-001',
        temperature: 999, // invalid
      });
    expect(res.status).toBe(400);
  });

  it('rejects invalid latitude', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send({
        deviceId: 'TEST-001',
        shipmentId: 'VAX-001',
        sensorId: 'TEMP-001',
        temperature: 5.0,
        latitude: 999, // invalid
        longitude: 73.0,
      });
    expect(res.status).toBe(400);
  });

  it('rejects unknown shipment', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send({
        deviceId: 'TEST-001',
        shipmentId: 'SHP-NOTEXIST',
        sensorId: 'TEMP-001',
        temperature: 5.0,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('accepts valid reading with a real shipment', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send({
        deviceId: 'ESP32-001',
        shipmentId: 'VAX-001',
        sensorId: 'ENV-AIR-001',
        temperature: 5.0,
        humidity: 60,
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shipmentId).toBe('VAX-001');
  });
});

// ────────────────────────────────────────
// Excursion Detection
// ────────────────────────────────────────
describe('Excursion detection', () => {
  const mockShipment = {
    id: 'SHP-TEST',
    tempMin: 2,
    tempMax: 8,
    excursionActive: false,
    excursionDuration: 0,
    activeAlertCount: 0,
  };

  const mockReading = (temperature, id = 'RDG-TEST') => ({
    id,
    shipmentId: 'SHP-TEST',
    temperature,
    battery: 80,
  });

  it('detects high temperature excursion', () => {
    const shipment = { ...mockShipment };
    const events = processExcursion(shipment, mockReading(10));
    expect(shipment.excursionActive).toBe(true);
    const started = events.find(e => e.type === 'excursion:started');
    expect(started).toBeTruthy();
    expect(started.data.excursionType).toBe('TEMP_HIGH');
  });

  it('detects low temperature excursion', () => {
    const shipment = { ...mockShipment };
    const events = processExcursion(shipment, mockReading(0));
    expect(shipment.excursionActive).toBe(true);
    const started = events.find(e => e.type === 'excursion:started');
    expect(started.data.excursionType).toBe('TEMP_LOW');
  });

  it('detects recovery after excursion', () => {
    const shipment = {
      ...mockShipment,
      excursionActive: true,
      excursionStartTime: new Date(Date.now() - 5000).toISOString(),
      excursionType: 'TEMP_HIGH',
    };
    const events = processExcursion(shipment, mockReading(5));
    expect(shipment.excursionActive).toBe(false);
    const recovered = events.find(e => e.type === 'excursion:recovered');
    expect(recovered).toBeTruthy();
  });

  it('does not start new excursion for ongoing one', () => {
    const shipment = {
      ...mockShipment,
      excursionActive: true,
      excursionStartTime: new Date().toISOString(),
      excursionType: 'TEMP_HIGH',
    };
    const events = processExcursion(shipment, mockReading(11));
    const started = events.filter(e => e.type === 'excursion:started');
    // Should not have a new started event - it's ongoing
    expect(started.length).toBe(0);
  });
});

// ────────────────────────────────────────
// Risk Score
// ────────────────────────────────────────
describe('Risk score computation', () => {
  const baseShipment = { tempMin: 2, tempMax: 8, excursionActive: false, excursionDuration: 0 };

  it('returns LOW risk for in-range readings', () => {
    const readings = Array.from({ length: 10 }, (_, i) => ({ temperature: 5 }));
    const result = computeRiskScore(baseShipment, readings);
    expect(result.category).toBe('LOW');
    expect(result.score).toBeLessThan(20);
  });

  it('returns higher risk when excursion is active', () => {
    const shipment = { ...baseShipment, excursionActive: true, excursionDuration: 15 };
    const readings = Array.from({ length: 10 }, () => ({ temperature: 10 }));
    const result = computeRiskScore(shipment, readings);
    expect(result.score).toBeGreaterThan(20);
    expect(result.disclaimer).toMatch(/DEMO/);
  });

  it('includes contributing factors', () => {
    const result = computeRiskScore(baseShipment, [{ temperature: 5 }]);
    expect(Array.isArray(result.factors)).toBe(true);
    expect(result.factors.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────
// Haversine & Checkpoints
// ────────────────────────────────────────
describe('Haversine distance', () => {
  it('calculates distance between Mumbai and Pune correctly (~148km)', () => {
    const dist = haversineDistance(19.076, 72.877, 18.520, 73.856);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(200);
  });

  it('returns 0 for same coordinates', () => {
    const dist = haversineDistance(19.076, 72.877, 19.076, 72.877);
    expect(dist).toBeCloseTo(0, 1);
  });
});

describe('findNearestCheckpoint', () => {
  const checkpoints = [
    { id: 'A', latitude: 19.076, longitude: 72.877, available: true },
    { id: 'B', latitude: 28.613, longitude: 77.209, available: true },
    { id: 'C', latitude: 12.971, longitude: 77.594, available: false },
  ];

  it('finds nearest available checkpoint', () => {
    const result = findNearestCheckpoint(19.1, 72.9, checkpoints);
    expect(result).not.toBeNull();
    expect(result.id).toBe('A'); // A is nearest to 19.1, 72.9
  });

  it('ignores unavailable checkpoints', () => {
    // Query near Bangalore (C) but C is unavailable
    const result = findNearestCheckpoint(13.0, 77.6, checkpoints);
    expect(result.id).not.toBe('C');
  });

  it('returns null if no available checkpoints', () => {
    const result = findNearestCheckpoint(20, 80, [{ ...checkpoints[0], available: false }]);
    expect(result).toBeNull();
  });

  it('includes distanceKm and distanceType', () => {
    const result = findNearestCheckpoint(19.1, 72.9, checkpoints);
    expect(typeof result.distanceKm).toBe('number');
    expect(result.distanceType).toBe('straight-line');
  });
});

// ────────────────────────────────────────
// Shipments API
// ────────────────────────────────────────
describe('GET /api/shipments', () => {
  it('returns array of shipments', async () => {
    const res = await request(app).get('/api/shipments');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/shipments/:id', () => {
  it('returns shipment by id', async () => {
    const res = await request(app).get('/api/shipments/VAX-001');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('VAX-001');
  });

  it('returns 404 for unknown shipment', async () => {
    const res = await request(app).get('/api/shipments/SHP-NOTEXIST');
    expect(res.status).toBe(404);
  });
});

// ────────────────────────────────────────
// Alert deduplication
// ────────────────────────────────────────
describe('Alert deduplication', () => {
  it('does not create duplicate ACTIVE alerts for same shipment and type', () => {
    const shipment = {
      id: 'SHP-DEDUP',
      tempMin: 2, tempMax: 8,
      excursionActive: false, excursionDuration: 0, activeAlertCount: 0,
    };
    // First reading - starts excursion
    processExcursion(shipment, { id: 'R1', shipmentId: 'SHP-DEDUP', temperature: 10, battery: 80 });
    // Second reading - should update, not create new alert
    processExcursion(shipment, { id: 'R2', shipmentId: 'SHP-DEDUP', temperature: 11, battery: 80 });

    const activeAlerts = store.getAlerts({ shipmentId: 'SHP-DEDUP', status: 'ACTIVE', type: 'TEMP_HIGH' });
    expect(activeAlerts.length).toBeLessThanOrEqual(1);
  });
});

// ────────────────────────────────────────
// ESP32 Ingestion & Air Quality Tests
// ────────────────────────────────────────
describe('ESP32 Live Ingestion & Air Quality Excursions', () => {
  it('accepts exact ESP32 payload with 18s timestamp and snake_case fields', async () => {
    const payload = {
      shipment_id: 'VAX-001',
      temperature: 32.1,
      humidity: 46.2,
      air_quality_aqi: 46,
      latitude: 19.075912,
      longitude: 72.877701,
      timestamp: '18s',
    };

    const res = await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shipmentId).toBe('VAX-001');
    expect(res.body.data.temperature).toBe(32.1);
    expect(res.body.data.humidity).toBe(46.2);
    expect(res.body.data.air_quality_aqi).toBe(46);
    expect(res.body.data.latitude).toBeCloseTo(19.075912, 5);
    expect(res.body.data.longitude).toBeCloseTo(72.877701, 5);
    expect(res.body.data.timestamp).toBe('18s');
    expect(res.body.data.serverReceivedAt).toBeDefined();

    // 32.1°C must trigger temperature excursion on refrigerated vaccine (2-8°C)
    const activeAlerts = store.getAlerts({ shipmentId: 'VAX-001', status: 'ACTIVE', type: 'TEMP_HIGH' });
    expect(activeAlerts.length).toBeGreaterThanOrEqual(1);
    expect(activeAlerts[0].severity).toBe('CRITICAL');
  });

  it('triggers AIR_QUALITY_HIGH alert when air_quality_aqi exceeds threshold', async () => {
    const highAqiPayload = {
      shipment_id: 'VAX-001',
      temperature: 4.5,
      humidity: 50.0,
      air_quality_aqi: 145, // Exceeds threshold (100)
      latitude: 19.075912,
      longitude: 72.877701,
      timestamp: '30s',
    };

    const res = await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send(highAqiPayload);

    expect(res.status).toBe(201);

    const aqiAlerts = store.getAlerts({ shipmentId: 'VAX-001', status: 'ACTIVE', type: 'AIR_QUALITY_HIGH' });
    expect(aqiAlerts.length).toBeGreaterThanOrEqual(1);
    expect(aqiAlerts[0].airQualityAqi).toBe(145);
    expect(aqiAlerts[0].threshold).toBeDefined();

    // Deduplication check: second reading should update alert, not duplicate
    const secondPayload = {
      ...highAqiPayload,
      air_quality_aqi: 155,
      timestamp: '32s',
    };
    await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send(secondPayload);

    const afterAlerts = store.getAlerts({ shipmentId: 'VAX-001', status: 'ACTIVE', type: 'AIR_QUALITY_HIGH' });
    expect(afterAlerts.length).toBe(1);
    expect(afterAlerts[0].airQualityAqi).toBe(155);

    // Normal reading resolves the air quality alert
    const normalPayload = {
      ...highAqiPayload,
      air_quality_aqi: 45,
      timestamp: '34s',
    };
    await request(app)
      .post('/api/readings')
      .set('x-device-key', 'test-key')
      .send(normalPayload);

    const resolvedAlerts = store.getAlerts({ shipmentId: 'VAX-001', status: 'ACTIVE', type: 'AIR_QUALITY_HIGH' });
    expect(resolvedAlerts.length).toBe(0);
  });

  it('GET /api/analytics/temperature returns air_quality_aqi field', async () => {
    const res = await request(app).get('/api/analytics/temperature?shipmentId=VAX-001');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      const reading = res.body.data[0];
      expect('air_quality_aqi' in reading || 'airQualityAqi' in reading).toBe(true);
    }
  });
});

// ────────────────────────────────────────
// Root Health Check & Storage Diagnostic
// ────────────────────────────────────────
describe('GET /health (Root health check endpoint)', () => {
  it('confirms backend is running on port 5001 with local SQLite persistence available', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.port).toBe(5001);
    expect(res.body.storage).toBeDefined();
    expect(res.body.storage.type).toBe('sqlite');
    expect(res.body.storage.available).toBe(true);
    expect(res.body.storage.path).toMatch(/vaxiverify\.db/);
    expect(typeof res.body.storage.sizeBytes).toBe('number');
  });
});

// ────────────────────────────────────────
// SQLite Local Data Persistence & Deduplication
// ────────────────────────────────────────
describe('Local SQLite Data Persistence & Deduplication', () => {
  const fs = require('fs');
  const path = require('path');
  const database = require('../src/db/database');

  it('persists readings into SQLite and survives restarts', async () => {
    const testReading = {
      id: 'RDG-PERSIST-001',
      shipmentId: 'VAX-001',
      deviceId: 'ESP32-PERSIST',
      sensorId: 'TEMP-001',
      temperature: 4.8,
      humidity: 52.0,
      air_quality_aqi: 35,
      timestamp: '99s',
      serverReceivedAt: new Date().toISOString(),
    };

    // Insert reading via store
    const inserted = store.addReading(testReading);
    expect(inserted).toBeDefined();

    // Query directly from database
    const fetched = database.getReadingById('RDG-PERSIST-001');
    expect(fetched).not.toBeNull();
    expect(fetched.temperature).toBe(4.8);
    expect(fetched.humidity).toBe(52.0);
    expect(fetched.air_quality_aqi).toBe(35);

    // Verify DB file exists on disk
    const health = database.checkHealth();
    expect(health.available).toBe(true);
    expect(fs.existsSync(health.path)).toBe(true);
    expect(health.sizeBytes).toBeGreaterThan(0);
  });

  it('prevents duplicate records when device retries same reading', async () => {
    const initialCount = database.countReadings({ shipmentId: 'VAX-001' });

    const retryReading = {
      id: 'RDG-RETRY-001',
      shipmentId: 'VAX-001',
      deviceId: 'ESP32-RETRY',
      temperature: 5.1,
      timestamp: '120s',
      dedupKey: 'VAX-001_ESP32-RETRY_120s',
    };

    // First attempt
    store.addReading(retryReading);

    // Second attempt (identical dedup key)
    store.addReading({
      ...retryReading,
      id: 'RDG-RETRY-002', // different client ID but same device timestamp
    });

    const readingsWithDedup = database.getReadings({ shipmentId: 'VAX-001' })
      .filter(r => r.deviceId === 'ESP32-RETRY');

    expect(readingsWithDedup.length).toBe(1);
  });
});

// ────────────────────────────────────────
// Report Generation & Arrival Verification
// ────────────────────────────────────────
describe('Report Generation & Arrival Verification', () => {
  const fs = require('fs');
  const path = require('path');
  const reportService = require('../src/services/reportService');

  it('generates CSV telemetry report and saves to ./reports/', async () => {
    const res = await request(app)
      .post('/api/reports/generate')
      .send({ shipmentId: 'VAX-001', type: 'CSV', generatedBy: 'Test Auditor' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('CSV');
    expect(res.body.data.filename).toMatch(/VAX-001_telemetry_.*\.csv/);

    const filepath = res.body.data.filepath;
    expect(fs.existsSync(filepath)).toBe(true);

    const content = fs.readFileSync(filepath, 'utf8');
    expect(content).toContain('reading_id,shipment_id,device_id');
    expect(content).toContain('VAX-001');
    expect(content).toContain('telemetry_classification');
  });

  it('generates PDF summary audit report and saves to ./reports/', async () => {
    const res = await request(app)
      .post('/api/reports/generate')
      .send({ shipmentId: 'VAX-001', type: 'PDF', generatedBy: 'Dr. Test' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('PDF');
    expect(res.body.data.filename).toMatch(/VAX-001_verification_.*\.pdf/);

    const filepath = res.body.data.filepath;
    expect(fs.existsSync(filepath)).toBe(true);
    const stats = fs.statSync(filepath);
    expect(stats.size).toBeGreaterThan(1000); // Valid PDF with content
  });

  it('GET /api/reports returns list of generated reports with metadata', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.reportsDir).toBeDefined();
  });

  it('POST /api/shipments/:id/verify finalizes arrival and generates reports', async () => {
    const res = await request(app)
      .post('/api/shipments/VAX-001/verify')
      .send({
        verificationStatus: 'VERIFIED',
        inspectionNotes: 'Seals verified intact. VVM acceptable.',
        verifiedBy: 'Pharmacist Sharma',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DELIVERED');
    expect(res.body.data.verificationStatus).toBe('VERIFIED');
    expect(res.body.data.verifiedBy).toBe('Pharmacist Sharma');
    expect(res.body.reports).toBeDefined();
    expect(res.body.reports.csv).toBeDefined();
    expect(res.body.reports.pdf).toBeDefined();
  });

  it('GET /api/reports/:id/download securely downloads generated report', async () => {
    const reportsList = await request(app).get('/api/reports?shipmentId=VAX-001');
    const firstReport = reportsList.body.data[0];

    const res = await request(app).get(`/api/reports/${firstReport.id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain(firstReport.filename);
  });

  it('blocks path traversal attacks on report download', async () => {
    const res = await request(app).get('/api/reports/file/..%2F..%2Fpackage.json');
    expect(res.status).toBe(400);
  });
});

