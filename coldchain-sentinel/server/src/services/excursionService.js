const { v4: uuidv4 } = require('uuid');
const store = require('../utils/store');
const socketEmitter = require('../utils/socketEmitter');

const SEVERITY = { MINOR: 'MINOR', MODERATE: 'MODERATE', CRITICAL: 'CRITICAL' };
const ALERT_STATUS = { ACTIVE: 'ACTIVE', ACKNOWLEDGED: 'ACKNOWLEDGED', RESOLVED: 'RESOLVED' };
const ALERT_TYPE = {
  TEMP_HIGH: 'TEMP_HIGH',
  TEMP_LOW: 'TEMP_LOW',
  BATTERY_LOW: 'BATTERY_LOW',
  STALE_DATA: 'STALE_DATA',
  EXCURSION_ESCALATED: 'EXCURSION_ESCALATED',
  AIR_QUALITY_HIGH: 'AIR_QUALITY_HIGH',
};

/**
 * Determine severity based on deviation and duration
 */
function computeSeverity(deviationDeg, durationMinutes) {
  if (Math.abs(deviationDeg) >= 5 || durationMinutes >= 15) return SEVERITY.CRITICAL;
  if (Math.abs(deviationDeg) >= 2 || durationMinutes >= 5) return SEVERITY.MODERATE;
  return SEVERITY.MINOR;
}

/**
 * Detect excursions and manage alerts for a reading
 */
function processExcursion(shipment, reading) {
  const { temperature, battery, shipmentId } = reading;
  const { tempMin, tempMax } = shipment;
  const events = [];
  const now = new Date();

  let excursionType = null;
  let deviation = 0;

  if (temperature > tempMax) {
    excursionType = ALERT_TYPE.TEMP_HIGH;
    deviation = temperature - tempMax;
  } else if (temperature < tempMin) {
    excursionType = ALERT_TYPE.TEMP_LOW;
    deviation = tempMin - temperature;
  }

  if (excursionType) {
    // Check if excursion was already active
    if (!shipment.excursionActive) {
      // Start new excursion
      shipment.excursionActive = true;
      shipment.excursionStartTime = now.toISOString();
      shipment.excursionType = excursionType;
      events.push({ type: 'excursion:started', data: { shipmentId, excursionType, temperature, threshold: excursionType === ALERT_TYPE.TEMP_HIGH ? tempMax : tempMin } });
    }

    // Calculate duration in minutes
    const excursionStart = new Date(shipment.excursionStartTime);
    const durationMs = now - excursionStart;
    const durationMinutes = durationMs / 60000;
    shipment.excursionDuration = (shipment.excursionDuration || 0) + 2 / 60; // accumulate ~2s per reading

    const severity = computeSeverity(deviation, durationMinutes);

    // Create or update alert (no duplicate active alerts per type)
    let alert = store.getActiveAlertByShipmentAndType(shipmentId, excursionType);
    if (!alert) {
      alert = {
        id: `ALT-${uuidv4().slice(0, 8).toUpperCase()}`,
        shipmentId,
        type: excursionType,
        severity,
        status: ALERT_STATUS.ACTIVE,
        temperature,
        threshold: excursionType === ALERT_TYPE.TEMP_HIGH ? tempMax : tempMin,
        deviation: Math.round(deviation * 100) / 100,
        durationMinutes: Math.round(durationMinutes * 10) / 10,
        message: excursionType === ALERT_TYPE.TEMP_HIGH
          ? `Temperature ${temperature}°C exceeds max ${tempMax}°C (deviation: +${deviation.toFixed(1)}°C)`
          : `Temperature ${temperature}°C below min ${tempMin}°C (deviation: -${deviation.toFixed(1)}°C)`,
        recommendedAction: excursionType === ALERT_TYPE.TEMP_HIGH
          ? 'Immediately move to refrigerated storage or nearest checkpoint'
          : 'Check insulation and heating, move to controlled environment',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        readingId: reading.id,
      };
      store.upsertAlert(alert);
      events.push({ type: 'alert:new', data: alert });
    } else {
      // Update existing alert duration and severity
      const prevSeverity = alert.severity;
      alert.durationMinutes = Math.round(durationMinutes * 10) / 10;
      alert.severity = severity;
      alert.temperature = temperature;
      alert.updatedAt = now.toISOString();
      store.upsertAlert(alert);
      events.push({ type: 'alert:updated', data: alert });
      if (severity !== prevSeverity) {
        events.push({ type: 'excursion:updated', data: { shipmentId, severity, durationMinutes: alert.durationMinutes } });
      }
    }
  } else {
    // Temperature in range - check for recovery
    if (shipment.excursionActive) {
      shipment.excursionActive = false;
      const prevType = shipment.excursionType;
      shipment.excursionType = null;

      // Resolve active excursion alert
      const activeAlert = store.getActiveAlertByShipmentAndType(shipmentId, prevType || ALERT_TYPE.TEMP_HIGH)
        || store.getActiveAlertByShipmentAndType(shipmentId, ALERT_TYPE.TEMP_LOW);
      if (activeAlert) {
        activeAlert.status = ALERT_STATUS.RESOLVED;
        activeAlert.resolvedAt = now.toISOString();
        activeAlert.updatedAt = now.toISOString();
        store.upsertAlert(activeAlert);
        events.push({ type: 'alert:updated', data: activeAlert });
      }
      events.push({ type: 'excursion:recovered', data: { shipmentId, temperature, recoveredAt: now.toISOString() } });
    }
  }

  // Low battery alert
  if (battery !== undefined && battery !== null) {
    const batteryNum = Number(battery);
    if (batteryNum <= 20) {
      let batteryAlert = store.getActiveAlertByShipmentAndType(shipmentId, ALERT_TYPE.BATTERY_LOW);
      if (!batteryAlert) {
        batteryAlert = {
          id: `ALT-${uuidv4().slice(0, 8).toUpperCase()}`,
          shipmentId,
          type: ALERT_TYPE.BATTERY_LOW,
          severity: batteryNum <= 10 ? SEVERITY.CRITICAL : SEVERITY.MINOR,
          status: ALERT_STATUS.ACTIVE,
          battery: batteryNum,
          message: `Low battery: ${batteryNum}%`,
          recommendedAction: 'Replace or charge sensor battery immediately',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          readingId: reading.id,
        };
        store.upsertAlert(batteryAlert);
        events.push({ type: 'alert:new', data: batteryAlert });
      } else {
        batteryAlert.battery = batteryNum;
        batteryAlert.updatedAt = now.toISOString();
        store.upsertAlert(batteryAlert);
      }
    } else {
      // Resolve battery alert if battery is now good
      const battAlert = store.getActiveAlertByShipmentAndType(shipmentId, ALERT_TYPE.BATTERY_LOW);
      if (battAlert) {
        battAlert.status = ALERT_STATUS.RESOLVED;
        battAlert.resolvedAt = now.toISOString();
        battAlert.updatedAt = now.toISOString();
        store.upsertAlert(battAlert);
        events.push({ type: 'alert:updated', data: battAlert });
      }
    }
  }

  // Air Quality (AQI) alert check
  const aqiVal = reading.air_quality_aqi !== undefined && reading.air_quality_aqi !== null
    ? Number(reading.air_quality_aqi)
    : (reading.airQualityAqi !== undefined && reading.airQualityAqi !== null ? Number(reading.airQualityAqi) : null);

  if (aqiVal !== null && !isNaN(aqiVal)) {
    const settings = store.getSettings() || {};
    const threshold = shipment.aqiMax || settings.airQualityThresholds?.warningAqi || 100;
    const criticalThreshold = settings.airQualityThresholds?.criticalAqi || (threshold + 50);

    if (aqiVal > threshold) {
      const aqiSeverity = aqiVal >= criticalThreshold ? SEVERITY.CRITICAL : SEVERITY.MODERATE;
      let aqiAlert = store.getActiveAlertByShipmentAndType(shipmentId, ALERT_TYPE.AIR_QUALITY_HIGH);

      if (!aqiAlert) {
        aqiAlert = {
          id: `ALT-${uuidv4().slice(0, 8).toUpperCase()}`,
          shipmentId,
          type: ALERT_TYPE.AIR_QUALITY_HIGH,
          severity: aqiSeverity,
          status: ALERT_STATUS.ACTIVE,
          airQualityAqi: aqiVal,
          aqi: aqiVal,
          threshold,
          message: `Air quality index ${aqiVal} exceeds threshold of ${threshold}`,
          recommendedAction: 'Inspect seal, storage enclosure, and ventilation for particulate or chemical ingress',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          readingId: reading.id,
        };
        store.upsertAlert(aqiAlert);
        events.push({ type: 'alert:new', data: aqiAlert });
      } else {
        aqiAlert.airQualityAqi = aqiVal;
        aqiAlert.aqi = aqiVal;
        aqiAlert.severity = aqiSeverity;
        aqiAlert.updatedAt = now.toISOString();
        store.upsertAlert(aqiAlert);
        events.push({ type: 'alert:updated', data: aqiAlert });
      }
    } else {
      // Resolve active air quality alert if back within normal limit
      const aqiAlert = store.getActiveAlertByShipmentAndType(shipmentId, ALERT_TYPE.AIR_QUALITY_HIGH);
      if (aqiAlert) {
        aqiAlert.status = ALERT_STATUS.RESOLVED;
        aqiAlert.resolvedAt = now.toISOString();
        aqiAlert.updatedAt = now.toISOString();
        store.upsertAlert(aqiAlert);
        events.push({ type: 'alert:updated', data: aqiAlert });
      }
    }
  }

  // Update active alert count
  const activeAlerts = store.getAlerts({ shipmentId, status: 'ACTIVE' });
  shipment.activeAlertCount = activeAlerts.length;

  return events;
}

/**
 * Check for stale data and create/resolve alerts
 */
function checkStaleData(shipment, staleTimeoutMs) {
  if (!shipment.lastUpdated) return [];
  const events = [];
  const now = new Date();
  const timeSinceUpdate = now - new Date(shipment.lastUpdated);

  if (timeSinceUpdate > staleTimeoutMs) {
    const existing = store.getActiveAlertByShipmentAndType(shipment.id, ALERT_TYPE.STALE_DATA);
    if (!existing) {
      const alert = {
        id: `ALT-${uuidv4().slice(0, 8).toUpperCase()}`,
        shipmentId: shipment.id,
        type: ALERT_TYPE.STALE_DATA,
        severity: SEVERITY.MODERATE,
        status: ALERT_STATUS.ACTIVE,
        message: `No data received for ${Math.round(timeSinceUpdate / 1000)}s`,
        recommendedAction: 'Check device connectivity and power',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      store.upsertAlert(alert);
      events.push({ type: 'alert:new', data: alert });
    }
  } else {
    // Resolve stale alert
    const staleAlert = store.getActiveAlertByShipmentAndType(shipment.id, ALERT_TYPE.STALE_DATA);
    if (staleAlert) {
      staleAlert.status = ALERT_STATUS.RESOLVED;
      staleAlert.resolvedAt = now.toISOString();
      staleAlert.updatedAt = now.toISOString();
      store.upsertAlert(staleAlert);
      events.push({ type: 'alert:updated', data: staleAlert });
    }
  }

  return events;
}

module.exports = { processExcursion, checkStaleData, ALERT_TYPE, SEVERITY, ALERT_STATUS };
