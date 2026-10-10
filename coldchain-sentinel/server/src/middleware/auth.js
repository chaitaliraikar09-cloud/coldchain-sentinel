const config = require('../config');

/**
 * Device authentication middleware
 * Checks x-device-key header for ESP32 sensor endpoints
 * 
 * WARNING: This is a development-only authentication mechanism.
 * Do NOT use this in production without proper security review.
 */
function deviceAuth(req, res, next) {
  const deviceKey = req.headers['x-device-key'];
  if (!deviceKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing x-device-key header',
      hint: 'Include your device API key in the x-device-key header',
    });
  }
  if (deviceKey !== config.deviceApiKey) {
    return res.status(403).json({
      success: false,
      error: 'Invalid device key',
    });
  }
  next();
}

/**
 * Optional device auth - allows requests without key but marks them
 */
function optionalDeviceAuth(req, res, next) {
  const deviceKey = req.headers['x-device-key'];
  req.isAuthenticatedDevice = deviceKey && deviceKey === config.deviceApiKey;
  next();
}

module.exports = { deviceAuth, optionalDeviceAuth };
