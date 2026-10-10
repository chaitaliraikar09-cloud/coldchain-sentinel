const http = require('http');
const config = require('../config');
const store = require('../utils/store');
const socketEmitter = require('../utils/socketEmitter');
const { processReading } = require('./readingPipeline');
const { checkStaleData } = require('./excursionService');

class ESP32Service {
  constructor() {
    this.pollTimer = null;
    this.isRunning = false;
    this.isPolling = false;
    this.esp32Host = config.esp32Host || '10.168.234.195';
    this.esp32Port = config.esp32Port || 80;
    this.esp32Path = config.esp32Path || '/shipment';
    this.intervalMs = config.esp32PollIntervalMs || 2000;
    this.dataSource = config.dataSource || 'esp32'; // 'esp32' | 'simulator'
    
    // Status tracking
    this.isReachable = false;
    this.isReceivingData = false;
    this.lastReadingAt = null;
    this.lastError = null;
    this.consecutiveFailures = 0;
    this.lastCheckedAt = null;
    this.deviceInfo = null;
  }

  init() {
    const settings = store.getSettings() || {};
    if (settings.dataSource) this.dataSource = settings.dataSource;
    if (settings.esp32Host) this.esp32Host = settings.esp32Host;
    if (settings.esp32Port) this.esp32Port = settings.esp32Port;
    if (settings.esp32Path) this.esp32Path = settings.esp32Path;

    console.log(`[esp32] Initializing ESP32 service (Host: ${this.esp32Host}:${this.esp32Port}${this.esp32Path}, Mode: ${this.dataSource})`);
    
    // Start polling automatically
    this.start();
  }

  setDataSource(source) {
    this.dataSource = source === 'simulator' ? 'simulator' : 'esp32';
    const settings = store.getSettings() || {};
    settings.dataSource = this.dataSource;
    store.updateSettings(settings);

    socketEmitter.emit('datasource:changed', { dataSource: this.dataSource });
    console.log(`[esp32] Data source switched to: ${this.dataSource}`);
    return this.dataSource;
  }

  setHost(host, port = 80, path = '/shipment') {
    this.esp32Host = host;
    this.esp32Port = port;
    this.esp32Path = path;
    const settings = store.getSettings() || {};
    settings.esp32Host = host;
    settings.esp32Port = port;
    settings.esp32Path = path;
    store.updateSettings(settings);
    this.verifyConnection();
  }

  start() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.isRunning = true;
    
    // Immediate verification and first poll
    this.pollDevice();

    this.pollTimer = setInterval(() => {
      this.pollDevice();
    }, this.intervalMs);

    console.log(`[esp32] Polling loop started for ${this.esp32Host}:${this.esp32Port}${this.esp32Path} every ${this.intervalMs}ms`);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    this.isPolling = false;
    console.log('[esp32] Polling loop stopped');
  }

  async verifyConnection() {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: this.esp32Host,
          port: this.esp32Port,
          path: this.esp32Path || '/shipment',
          timeout: 2000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            this.isReachable = res.statusCode === 200;
            this.lastCheckedAt = new Date().toISOString();
            resolve({ reachable: this.isReachable, statusCode: res.statusCode, body });
          });
        }
      );

      req.on('error', (err) => {
        this.isReachable = false;
        this.lastError = err.message;
        this.lastCheckedAt = new Date().toISOString();
        resolve({ reachable: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        this.isReachable = false;
        this.lastError = 'Connection timeout';
        this.lastCheckedAt = new Date().toISOString();
        resolve({ reachable: false, error: 'Timeout' });
      });
    });
  }

  pollDevice() {
    if (this.isPolling) {
      return; // Prevent overlapping HTTP requests
    }
    this.isPolling = true;
    this.lastCheckedAt = new Date().toISOString();

    const options = {
      host: this.esp32Host,
      port: this.esp32Port,
      path: this.esp32Path || '/shipment',
      timeout: 1800,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'ColdChain-Sentinel-Backend',
      },
    };

    const req = http.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        this.isPolling = false;
        this.handleDeviceResponse(res.statusCode, data);
      });
    });

    req.on('error', (err) => {
      this.isPolling = false;
      this.handleConnectionError(err.message);
    });

    req.on('timeout', () => {
      req.destroy();
      this.isPolling = false;
      this.handleConnectionError('Connection timed out');
    });
  }

  handleDeviceResponse(statusCode, rawBody) {
    const now = new Date();
    this.isReachable = statusCode === 200;

    if (statusCode !== 200) {
      this.handleConnectionError(`HTTP ${statusCode}`);
      return;
    }

    this.consecutiveFailures = 0;
    this.lastError = null;

    // Check if the body contains JSON
    let parsedJson = null;
    try {
      let cleanBody = rawBody.trim();
      // Handle serial monitor prefixes like "17:00:20.593 -> { ... }"
      if (cleanBody.includes('{') && cleanBody.includes('}')) {
        const start = cleanBody.indexOf('{');
        const end = cleanBody.lastIndexOf('}');
        cleanBody = cleanBody.substring(start, end + 1);
      }
      parsedJson = JSON.parse(cleanBody);
    } catch (_) {
      parsedJson = null;
    }

    if (parsedJson && (parsedJson.temperature !== undefined || parsedJson.shipment_id || parsedJson.shipmentId)) {
      // Valid JSON telemetry record!
      this.isReceivingData = true;
      this.lastReadingAt = now.toISOString();

      // Only process into database and charts if DATA_SOURCE is esp32 (or hybrid)
      if (this.dataSource === 'esp32') {
        processReading(parsedJson, 'esp32').catch((err) => {
          console.error('[esp32] Error processing reading pipeline:', err);
        });
      }
    } else {
      console.log(`[esp32] Non-JSON or status text received from ${this.esp32Host}:${this.esp32Port}${this.esp32Path}:`, rawBody.slice(0, 100));
      this.deviceInfo = rawBody.slice(0, 100);
      this.isReceivingData = false;
    }

    this.broadcastStatus();
    this.checkStaleness();
  }

  handleConnectionError(errMsg) {
    this.consecutiveFailures++;
    this.isReachable = false;
    this.lastError = errMsg;

    this.broadcastStatus();
    this.checkStaleness();
  }

  checkStaleness() {
    const staleTimeoutMs = config.staleReadingTimeoutMs || 10000;
    const now = Date.now();

    const isStale = !this.lastReadingAt || (now - new Date(this.lastReadingAt).getTime()) > staleTimeoutMs;

    if (this.dataSource === 'esp32') {
      const vaxShipment = store.getShipmentById('VAX-001');
      if (vaxShipment) {
        const events = checkStaleData(vaxShipment, staleTimeoutMs);
        for (const e of events) {
          socketEmitter.emit(e.type, e.data);
        }
      }
    }
  }

  broadcastStatus() {
    const status = this.getStatus();
    socketEmitter.emit('esp32:status', status);
  }

  getStatus() {
    const staleTimeoutMs = config.staleReadingTimeoutMs || 10000;
    const now = Date.now();
    const isStale = !this.lastReadingAt || (now - new Date(this.lastReadingAt).getTime()) > staleTimeoutMs;

    return {
      host: this.esp32Host,
      port: this.esp32Port,
      path: this.esp32Path,
      dataSource: this.dataSource,
      reachable: this.isReachable,
      connected: this.isReachable && this.isReceivingData,
      receivingData: this.isReceivingData,
      isStale,
      lastReadingAt: this.lastReadingAt,
      lastCheckedAt: this.lastCheckedAt,
      lastError: this.lastError,
      deviceInfo: this.deviceInfo,
      staleTimeoutMs,
    };
  }
}

const esp32Service = new ESP32Service();
module.exports = esp32Service;
