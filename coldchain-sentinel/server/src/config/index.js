require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT) || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  deviceApiKey: process.env.DEVICE_API_KEY || 'change-this-development-key',
  simulatorIntervalMs: parseInt(process.env.SIMULATOR_INTERVAL_MS) || 2000,
  staleReadingTimeoutMs: parseInt(process.env.STALE_READING_TIMEOUT_MS) || 10000,
  dataDir: process.env.DATA_DIR || './data',
  maxReadingHistory: parseInt(process.env.MAX_READING_HISTORY) || 500,
  nodeEnv: process.env.NODE_ENV || 'development',
  dataSource: process.env.DATA_SOURCE || 'esp32',
  esp32Host: process.env.ESP32_HOST || '10.168.234.195',
  esp32Port: parseInt(process.env.ESP32_PORT) || 80,
  esp32Path: process.env.ESP32_PATH || '/shipment',
  esp32PollIntervalMs: parseInt(process.env.ESP32_POLL_INTERVAL_MS) || 2000,
  defaultAqiThreshold: parseInt(process.env.DEFAULT_AQI_THRESHOLD) || 100,
};

module.exports = config;
