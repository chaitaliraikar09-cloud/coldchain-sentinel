const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const reportService = require('../services/reportService');
const store = require('../utils/store');

// GET /api/reports - List all generated reports
router.get('/', (req, res) => {
  const { shipmentId, type } = req.query;
  const filters = {};
  if (shipmentId) filters.shipmentId = shipmentId;
  if (type) filters.type = type.toUpperCase();

  const reports = reportService.getReports(filters);
  res.json({
    success: true,
    data: reports,
    reportsDir: reportService.REPORTS_DIR,
    count: reports.length,
  });
});

// POST /api/reports/generate - Manually trigger report generation
router.post('/generate', async (req, res) => {
  const { shipmentId, type = 'PDF', generatedBy = 'Operator' } = req.body;
  if (!shipmentId) {
    return res.status(400).json({ success: false, error: 'shipmentId is required' });
  }

  const shipment = store.getShipmentById(shipmentId);
  if (!shipment) {
    return res.status(404).json({ success: false, error: `Shipment ${shipmentId} not found` });
  }

  try {
    const reportType = (type || 'PDF').toUpperCase();
    if (reportType === 'CSV') {
      const report = await reportService.generateCsvReport(shipmentId, generatedBy);
      return res.status(201).json({ success: true, message: 'CSV report generated successfully', data: report });
    } else if (reportType === 'PDF') {
      const report = await reportService.generatePdfReport(shipmentId, { generatedBy });
      return res.status(201).json({ success: true, message: 'PDF report generated successfully', data: report });
    } else if (reportType === 'ALL') {
      const results = await reportService.generateAllReports(shipmentId, generatedBy);
      return res.status(201).json({
        success: true,
        message: 'Telemetry and verification reports generated',
        data: results,
      });
    } else {
      return res.status(400).json({ success: false, error: `Invalid report type "${type}". Use CSV, PDF, or ALL` });
    }
  } catch (err) {
    console.error('[reports] Generation failure:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate report',
      message: err.message,
    });
  }
});

// GET /api/reports/:id/download - Secure download endpoint by report ID
router.get('/:id/download', (req, res) => {
  const report = reportService.getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ success: false, error: 'Report record not found' });
  }

  // Security: prevent path traversal by using basename
  const safeFilename = path.basename(report.filename);
  const targetPath = path.join(reportService.REPORTS_DIR, safeFilename);

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ success: false, error: 'Report file no longer exists on disk' });
  }

  const contentType = report.type === 'PDF' ? 'application/pdf' : 'text/csv';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  const stream = fs.createReadStream(targetPath);
  stream.pipe(res);
});

// GET /api/reports/file/:filename - Direct file download with strict sanitization
router.get('/file/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  // Block any traversal attempt
  if (safeFilename !== req.params.filename || !safeFilename.match(/^[a-zA-Z0-9_\-\.]+$/)) {
    return res.status(400).json({ success: false, error: 'Invalid report filename' });
  }

  const targetPath = path.join(reportService.REPORTS_DIR, safeFilename);
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ success: false, error: 'Report file not found' });
  }

  const ext = path.extname(safeFilename).toLowerCase();
  const contentType = ext === '.pdf' ? 'application/pdf' : 'text/csv';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  fs.createReadStream(targetPath).pipe(res);
});

module.exports = router;
