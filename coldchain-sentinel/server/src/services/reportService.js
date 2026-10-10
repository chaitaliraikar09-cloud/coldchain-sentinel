const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const store = require('../utils/store');

// Ensure reports directory exists
const REPORTS_DIR = path.resolve(config.reportsDir);
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function getTimestampString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(date);
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

/**
 * Generate CSV Telemetry Report
 */
async function generateCsvReport(shipmentId, generatedBy = 'System') {
  const shipment = store.getShipmentById(shipmentId);
  if (!shipment) {
    throw new Error(`Shipment ${shipmentId} not found`);
  }

  const readings = store.getReadings({ shipmentId });
  const ts = getTimestampString();
  const filename = `${shipment.id}_telemetry_${ts}.csv`;
  const filepath = path.join(REPORTS_DIR, filename);

  const headers = [
    'reading_id',
    'shipment_id',
    'device_id',
    'sensor_id',
    'device_timestamp',
    'server_received_at',
    'temperature_c',
    'humidity_pct',
    'air_quality_aqi',
    'latitude',
    'longitude',
    'battery_pct',
    'source_provenance',
    'telemetry_classification',
    'gps_classification',
    'validation_status'
  ];

  const rows = readings.map((r) => {
    const isSimulated = r.source === 'simulator';
    return [
      r.id,
      shipment.id,
      r.deviceId || 'ESP32-NODE',
      r.sensorId || 'ENV-AIR-001',
      r.timestamp || r.deviceTimestamp || '',
      r.serverReceivedAt || '',
      r.temperature != null ? Number(r.temperature).toFixed(2) : '',
      r.humidity != null ? Number(r.humidity).toFixed(1) : '',
      r.air_quality_aqi != null ? r.air_quality_aqi : (r.airQualityAqi != null ? r.airQualityAqi : ''),
      r.latitude != null ? Number(r.latitude).toFixed(6) : '',
      r.longitude != null ? Number(r.longitude).toFixed(6) : '',
      r.battery != null ? Number(r.battery).toFixed(1) : '',
      r.source || 'esp32',
      isSimulated ? 'SIMULATED_TELEMETRY' : 'MEASURED_HARDWARE',
      isSimulated ? 'SIMULATED_GPS' : 'MEASURED_HARDWARE_GPS',
      r.validationStatus || 'VALID'
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');

  try {
    fs.writeFileSync(filepath, csvContent, 'utf8');
    const stats = fs.statSync(filepath);

    const reportRecord = {
      id: `RPT-CSV-${uuidv4().slice(0, 8).toUpperCase()}`,
      shipmentId: shipment.id,
      type: 'CSV',
      filename,
      filepath,
      fileSize: stats.size,
      generatedAt: new Date().toISOString(),
      generatedBy,
      status: 'READY',
      errorMessage: null,
    };

    store.saveReport(reportRecord);
    return reportRecord;
  } catch (err) {
    console.error('[reportService] Failed to generate CSV report:', err);
    const failedRecord = {
      id: `RPT-CSV-${uuidv4().slice(0, 8).toUpperCase()}`,
      shipmentId: shipment.id,
      type: 'CSV',
      filename,
      filepath,
      fileSize: 0,
      generatedAt: new Date().toISOString(),
      generatedBy,
      status: 'FAILED',
      errorMessage: err.message,
    };
    try { store.saveReport(failedRecord); } catch (_) {}
    throw err;
  }
}

/**
 * Generate PDF Verification Summary Report
 */
async function generatePdfReport(shipmentId, options = {}) {
  const shipment = store.getShipmentById(shipmentId);
  if (!shipment) {
    throw new Error(`Shipment ${shipmentId} not found`);
  }

  const readings = store.getReadings({ shipmentId });
  const alerts = store.getAlerts({ shipmentId });
  const ts = getTimestampString();
  const filename = `${shipment.id}_verification_${ts}.pdf`;
  const filepath = path.join(REPORTS_DIR, filename);
  const generatedBy = options.generatedBy || 'System';

  // Calculate telemetry metrics
  let minTemp = Infinity;
  let maxTemp = -Infinity;
  let sumTemp = 0;
  let tempCount = 0;
  let minHumidity = Infinity;
  let maxHumidity = -Infinity;
  let maxAqi = -Infinity;
  let simulatedCount = 0;
  let measuredCount = 0;

  for (const r of readings) {
    if (r.source === 'simulator') {
      simulatedCount++;
    } else {
      measuredCount++;
    }

    if (r.temperature != null && !isNaN(r.temperature)) {
      const t = Number(r.temperature);
      if (t < minTemp) minTemp = t;
      if (t > maxTemp) maxTemp = t;
      sumTemp += t;
      tempCount++;
    }

    if (r.humidity != null && !isNaN(r.humidity)) {
      const h = Number(r.humidity);
      if (h < minHumidity) minHumidity = h;
      if (h > maxHumidity) maxHumidity = h;
    }

    const aqi = r.air_quality_aqi ?? r.airQualityAqi;
    if (aqi != null && !isNaN(aqi)) {
      const a = Number(aqi);
      if (a > maxAqi) maxAqi = a;
    }
  }

  const avgTemp = tempCount > 0 ? (sumTemp / tempCount).toFixed(2) : 'N/A';
  const hasReadings = tempCount > 0;
  const periodStart = readings[0]?.serverReceivedAt || 'N/A';
  const periodEnd = readings[readings.length - 1]?.serverReceivedAt || 'N/A';
  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE');

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 45, size: 'A4' });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // --- Header ---
      doc.rect(45, 45, doc.page.width - 90, 4).fill('#0ea5e9'); // Sky blue accent bar
      doc.moveDown(0.8);

      doc.fontSize(20).font('Helvetica-Bold').fillColor('#0f172a').text('VaxiVerify - ColdChain Sentinel');
      doc.fontSize(11).font('Helvetica').fillColor('#475569').text('Official Vaccine Cold-Chain Verification & Integrity Audit Report');
      doc.moveDown(0.5);

      // Report Metadata Box
      doc.rect(45, doc.y, doc.page.width - 90, 36).fillAndStroke('#f8fafc', '#e2e8f0');
      const boxY = doc.y + 8;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155');
      doc.text(`Shipment ID: ${shipment.id}`, 55, boxY);
      doc.text(`Generated At: ${new Date().toISOString()}`, 220, boxY);
      doc.text(`Generated By: ${generatedBy}`, 420, boxY);

      doc.font('Helvetica').fillColor('#64748b');
      doc.text(`Batch: ${shipment.batchNumber || 'BN-2026-X1'}`, 55, boxY + 14);
      doc.text(`Product: ${shipment.product || shipment.name}`, 220, boxY + 14);
      doc.text(`Verification: ${shipment.verificationStatus || 'PENDING_INSPECTION'}`, 420, boxY + 14);

      doc.y = boxY + 36;
      doc.moveDown(1);

      // --- Prominent Clinical & Regulatory Disclaimer ---
      doc.rect(45, doc.y, doc.page.width - 90, 52).fillAndStroke('#fff7ed', '#fdba74'); // Warm warning banner
      const discY = doc.y + 6;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#c2410c')
        .text('MANDATORY REGULATORY CLINICAL DISCLAIMER:', 55, discY);
      doc.fontSize(8).font('Helvetica').fillColor('#7c2d12')
        .text(
          'Sensor telemetry within acceptable parameters does NOT independently confirm that vaccines are viable, safe, or suitable for human administration. A physical inspection of tamper-evident container seals, chemical VVM (Vaccine Vial Monitor) status, packaging integrity, and authorized personnel sign-off is mandatory before release.',
          55,
          discY + 13,
          { width: doc.page.width - 110, lineGap: 2 }
        );

      doc.y = discY + 54;
      doc.moveDown(1);

      // --- Section 1: Shipment & Route Parameters ---
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('1. Shipment Specification & Thresholds');
      doc.fontSize(9).font('Helvetica').fillColor('#334155');
      doc.moveDown(0.3);

      const paramsText = [
        `• Origin: ${shipment.origin || 'Central Cold Storage'}  ->  Destination: ${shipment.destination || 'Regional Distribution Centre'}`,
        `• Target Temperature Band: ${shipment.tempMin}°C to ${shipment.tempMax}°C (Configured Cold Chain Specification)`,
        `• Humidity Tolerances: ${shipment.humidityMin || 30}% to ${shipment.humidityMax || 70}% RH`,
        `• Maximum Air Quality Index (AQI): <= ${shipment.aqiMax || 100}`,
        `• Current Shipment Status: ${shipment.status || 'IN_TRANSIT'}`,
        `• Reporting Window: ${periodStart} to ${periodEnd}`
      ];
      paramsText.forEach(p => doc.text(p));
      doc.moveDown(0.8);

      // --- Section 2: Data Provenance & Integrity Classification ---
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('2. Telemetry Provenance & Sensor Data Breakdown');
      doc.fontSize(9).font('Helvetica').fillColor('#334155');
      doc.moveDown(0.3);

      doc.text(`• Total Telemetry Records Collected: ${readings.length}`);
      doc.text(`• Measured Hardware Readings (ESP32 Live Sensors): ${measuredCount} records`);
      doc.text(`• Simulated Telemetry Readings: ${simulatedCount} records ${simulatedCount > 0 ? '(Explicitly flagged in audit trail)' : ''}`);
      doc.text(`• Telemetry Data Gaps / Missing Readings: ${readings.length === 0 ? 'ALERT - NO READINGS RECORDED' : 'Continuous monitoring active'}`);
      doc.moveDown(0.8);

      // --- Section 3: Environmental Metrics & Excursion Audit ---
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('3. Environmental Metrics & Temperature Excursion Analysis');
      doc.fontSize(9).font('Helvetica').fillColor('#334155');
      doc.moveDown(0.3);

      if (hasReadings) {
        doc.text(`• Observed Temperature Range: Min: ${minTemp.toFixed(2)}°C | Max: ${maxTemp.toFixed(2)}°C | Mean: ${avgTemp}°C`);
        doc.text(`• Observed Humidity Range: Min: ${minHumidity !== Infinity ? minHumidity.toFixed(1) : 'N/A'}% | Max: ${maxHumidity !== -Infinity ? maxHumidity.toFixed(1) : 'N/A'}%`);
        doc.text(`• Maximum Observed AQI: ${maxAqi !== -Infinity ? maxAqi : 'N/A'}`);
      } else {
        doc.fillColor('#dc2626').text('• No telemetry records available for this shipment.');
      }

      // Check for excursion violations
      const isExcursion = hasReadings && (minTemp < shipment.tempMin || maxTemp > shipment.tempMax);
      doc.moveDown(0.4);

      if (isExcursion || shipment.excursionActive || activeAlerts.length > 0) {
        doc.rect(45, doc.y, doc.page.width - 90, 45).fillAndStroke('#fef2f2', '#f87171');
        const alertY = doc.y + 6;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#b91c1c')
          .text('CRITICAL NOTICE: UNRESOLVED TEMPERATURE EXCURSION OR SENSOR ALERTS RECORDED', 55, alertY);
        doc.fontSize(8).font('Helvetica').fillColor('#991b1b')
          .text(
            `Recorded Min: ${minTemp.toFixed(1)}°C, Max: ${maxTemp.toFixed(1)}°C (Threshold: ${shipment.tempMin}°C - ${shipment.tempMax}°C). Total Active Alerts: ${activeAlerts.length}. Comprehensive risk evaluation required before clinical release.`,
            55,
            alertY + 14,
            { width: doc.page.width - 110 }
          );
        doc.y = alertY + 46;
      } else {
        doc.rect(45, doc.y, doc.page.width - 90, 26).fillAndStroke('#f0fdf4', '#86efac');
        const okY = doc.y + 6;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#15803d')
          .text('TEMPERATURE COMPLIANCE: Telemetry within configured thresholds (2°C - 8°C)', 55, okY);
        doc.y = okY + 26;
      }

      doc.moveDown(1);

      // --- Section 4: Arrival Verification & Physical Inspection Results ---
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('4. Arrival Verification & Physical Inspection Record');
      doc.fontSize(9).font('Helvetica').fillColor('#334155');
      doc.moveDown(0.3);

      const verStatus = shipment.verificationStatus || 'PENDING_INSPECTION';
      const isVerified = verStatus === 'VERIFIED' || verStatus === 'ACCEPTED';

      doc.text(`• Verification Outcome: ${verStatus}`);
      doc.text(`• Inspection Finalized At: ${shipment.verifiedAt || 'Pending physical inspection'}`);
      doc.text(`• Verified / Inspected By: ${shipment.verifiedBy || 'Pending assignment'}`);
      doc.text(`• Physical Inspection Notes: ${shipment.inspectionNotes || 'No inspection notes entered yet.'}`);

      if (!isVerified) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#d97706')
          .text('ATTENTION: Arrival verification has not been completed. Final release pending receiver inspection sign-off.');
      }

      doc.moveDown(1.5);

      // --- Signatures & Audit Trail Footer ---
      doc.rect(45, doc.y, doc.page.width - 90, 60).stroke('#cbd5e1');
      const sigY = doc.y + 8;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b');
      doc.text('Cold-Chain Quality Auditor Signature:', 55, sigY);
      doc.text('Receiving Pharmacist / Officer Signature:', 320, sigY);

      doc.moveTo(55, sigY + 38).lineTo(250, sigY + 38).stroke('#94a3b8');
      doc.moveTo(320, sigY + 38).lineTo(520, sigY + 38).stroke('#94a3b8');

      doc.text('Date: ________________________', 55, sigY + 42);
      doc.text('Date: ________________________', 320, sigY + 42);

      // End of document
      doc.end();

      stream.on('finish', () => {
        const stats = fs.statSync(filepath);
        const reportRecord = {
          id: `RPT-PDF-${uuidv4().slice(0, 8).toUpperCase()}`,
          shipmentId: shipment.id,
          type: 'PDF',
          filename,
          filepath,
          fileSize: stats.size,
          generatedAt: new Date().toISOString(),
          generatedBy,
          status: 'READY',
          errorMessage: null,
        };
        store.saveReport(reportRecord);
        resolve(reportRecord);
      });

      stream.on('error', (streamErr) => {
        console.error('[reportService] PDF write stream error:', streamErr);
        reject(streamErr);
      });
    } catch (docErr) {
      console.error('[reportService] PDF generation exception:', docErr);
      reject(docErr);
    }
  });
}

/**
 * Generate both CSV & PDF reports for shipment completion/verification
 */
async function generateAllReports(shipmentId, generatedBy = 'System') {
  const results = { csv: null, pdf: null, errors: [] };
  try {
    results.csv = await generateCsvReport(shipmentId, generatedBy);
  } catch (e) {
    results.errors.push(`CSV generation failed: ${e.message}`);
  }
  try {
    results.pdf = await generatePdfReport(shipmentId, { generatedBy });
  } catch (e) {
    results.errors.push(`PDF generation failed: ${e.message}`);
  }
  return results;
}

module.exports = {
  REPORTS_DIR,
  generateCsvReport,
  generatePdfReport,
  generateAllReports,
  getReports: (filters) => store.getReports(filters),
  getReportById: (id) => store.getReportById(id),
};
