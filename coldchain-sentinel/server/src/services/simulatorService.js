/**
 * Isolated Simulator Service for DEMO-001
 * Operates EXCLUSIVELY on DEMO-001 (Simulated Demo Shipment).
 * Real ESP32 hardware telemetry for VAX-001 is completely isolated.
 */

const store = require('../utils/store');
const { processReading } = require('./readingPipeline');

const DEMO_SHIPMENT_ID = 'DEMO-001';

class SimulatorService {
  constructor() {
    this.timer = null;
    this.step = 0;
    this.intervalMs = 4000; // Generate simulated reading every 4 seconds
    this.isRunningState = false;
    this.injectedExcursion = null; // { type, remainingSteps }
  }

  seedInitialHistory() {
    // Only seed DEMO-001 if it has fewer than 5 readings
    const existing = store.getReadings({ shipmentId: DEMO_SHIPMENT_ID });
    if (existing.length >= 10) return;

    const now = Date.now();
    const count = 25; // 25 historical points across the last 25 minutes
    console.log(`[simulator] Seeding ${count} isolated demonstration data points for ${DEMO_SHIPMENT_ID}...`);

    for (let i = count; i >= 1; i--) {
      const pastTime = new Date(now - i * 60 * 1000).toISOString();
      const temp = parseFloat((5.1 + Math.sin(i * 0.35) * 0.45).toFixed(2));
      const hum = parseFloat((52.0 + Math.cos(i * 0.28) * 3.5).toFixed(1));
      const aqi = Math.round(38 + Math.sin(i * 0.4) * 6);

      const reading = {
        id: `RDG-SIM-${1000 + i}`,
        deviceId: 'SIM-DEVICE-01',
        shipmentId: DEMO_SHIPMENT_ID,
        shipment_id: DEMO_SHIPMENT_ID,
        sensorId: 'SIM-ENV-01',
        temperature: temp,
        humidity: hum,
        air_quality_aqi: aqi,
        latitude: parseFloat((19.0760 + (count - i) * 0.0012).toFixed(6)),
        longitude: parseFloat((72.8777 + (count - i) * 0.0015).toFixed(6)),
        battery: 95,
        timestamp: pastTime,
        serverReceivedAt: pastTime,
        source: 'simulator',
        sourceLabel: 'Simulated Demo',
        outOfOrder: false,
        validationStatus: 'ACCEPTED',
        rawPayload: { isSimulated: true, shipment_id: DEMO_SHIPMENT_ID, temperature: temp, humidity: hum, air_quality_aqi: aqi },
      };

      store.addReading(reading);
    }

    const latest = store.getLatestReadingByShipment(DEMO_SHIPMENT_ID);
    const demoShipment = store.getShipmentById(DEMO_SHIPMENT_ID);
    if (demoShipment && latest) {
      store.upsertShipment({
        ...demoShipment,
        latestReading: latest,
        lastUpdated: latest.serverReceivedAt,
        lastServerReceiptAt: latest.serverReceivedAt,
        totalReadings: count,
      });
    }
    console.log(`[simulator] Initial demonstration history seeded for ${DEMO_SHIPMENT_ID}`);
  }

  start(intervalMs = 4000) {
    if (this.isRunningState) {
      return { success: true, message: 'Simulator already running', running: true };
    }

    this.seedInitialHistory();
    this.intervalMs = Math.max(intervalMs || 4000, 2000);
    this.isRunningState = true;

    // Run first tick after small offset
    setTimeout(() => {
      if (this.isRunningState) this.tick();
    }, 1500);

    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);

    console.log(`[simulator] Isolated DEMO-001 simulator running every ${this.intervalMs}ms`);
    return { success: true, message: 'Simulator started for DEMO-001', running: true };
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunningState = false;
    console.log('[simulator] Simulator stopped');
    return { success: true, message: 'Simulator stopped', running: false };
  }

  reset() {
    this.step = 0;
    this.injectedExcursion = null;
    return { success: true, message: 'Simulator reset', running: this.isRunningState };
  }

  injectExcursion(shipmentId, type) {
    if (shipmentId !== DEMO_SHIPMENT_ID) {
      return {
        success: false,
        error: `Cannot inject excursion into '${shipmentId}'. Excursion injection is only permitted on simulated shipment '${DEMO_SHIPMENT_ID}'.`,
      };
    }

    this.injectedExcursion = {
      type, // 'high_temp', 'low_temp', 'high_aqi'
      remainingSteps: 5,
    };

    console.log(`[simulator] Injected simulated excursion '${type}' into ${DEMO_SHIPMENT_ID} for 5 cycles`);
    return { success: true, message: `Injected excursion '${type}' into ${DEMO_SHIPMENT_ID}` };
  }

  async tick() {
    try {
      this.step++;
      const now = new Date();

      // Deterministic base readings
      let temp = parseFloat((5.0 + Math.sin(this.step * 0.15) * 0.45).toFixed(2));
      let hum = parseFloat((51.5 + Math.cos(this.step * 0.12) * 3.0).toFixed(1));
      let aqi = Math.round(40 + Math.sin(this.step * 0.18) * 6);

      // Handle injected excursion
      if (this.injectedExcursion && this.injectedExcursion.remainingSteps > 0) {
        if (this.injectedExcursion.type === 'high_temp') {
          temp = 10.4;
        } else if (this.injectedExcursion.type === 'low_temp') {
          temp = 0.5;
        } else if (this.injectedExcursion.type === 'high_aqi') {
          aqi = 145;
        }
        this.injectedExcursion.remainingSteps--;
        if (this.injectedExcursion.remainingSteps <= 0) {
          this.injectedExcursion = null;
        }
      }

      // Route progression between coordinates
      const lat = parseFloat((19.0760 + ((this.step * 0.0005) % 0.03)).toFixed(6));
      const lon = parseFloat((72.8777 + ((this.step * 0.0007) % 0.04)).toFixed(6));

      const payload = {
        shipment_id: DEMO_SHIPMENT_ID,
        shipmentId: DEMO_SHIPMENT_ID,
        deviceId: 'SIM-DEVICE-01',
        sensorId: 'SIM-ENV-01',
        temperature: temp,
        humidity: hum,
        air_quality_aqi: aqi,
        latitude: lat,
        longitude: lon,
        battery: 92,
        timestamp: now.toISOString(),
      };

      await processReading(payload, 'simulator');
    } catch (err) {
      console.error('[simulator] Error generating simulated reading:', err.message);
    }
  }

  getStatus() {
    return {
      running: this.isRunningState,
      step: this.step,
      interval: this.intervalMs,
      shipmentId: DEMO_SHIPMENT_ID,
      injectedExcursion: this.injectedExcursion,
      disabled: false,
    };
  }

  isRunning() {
    return this.isRunningState;
  }
}

const simulatorService = new SimulatorService();
module.exports = simulatorService;
