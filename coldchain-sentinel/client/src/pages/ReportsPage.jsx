import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Download, RefreshCw, CheckCircle, AlertTriangle,
  Database, Server, Shield, FileSpreadsheet, ExternalLink, HardDrive, Filter
} from 'lucide-react';
import { reportsApi, shipmentsApi, healthApi } from '../services/api';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState('VAX-001');
  const [inspectorName, setInspectorName] = useState('Quality Officer');
  const [backendHealth, setBackendHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [notification, setNotification] = useState(null);
  const [verifyModal, setVerifyModal] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState('Physical seals verified intact. VVM indicator color acceptable.');
  const [verificationOutcome, setVerificationOutcome] = useState('VERIFIED');

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [reportsRes, shipmentsRes, healthRes] = await Promise.allSettled([
        reportsApi.getAll(),
        shipmentsApi.getAll(),
        healthApi.getHealth(),
      ]);

      if (reportsRes.status === 'fulfilled' && reportsRes.value.success) {
        setReports(reportsRes.value.data || []);
      }
      if (shipmentsRes.status === 'fulfilled' && shipmentsRes.value.success) {
        setShipments(shipmentsRes.value.data || []);
        if (shipmentsRes.value.data?.length && !selectedShipment) {
          setSelectedShipment(shipmentsRes.value.data[0].id);
        }
      }
      if (healthRes.status === 'fulfilled' && healthRes.value.success) {
        setBackendHealth(healthRes.value);
      }
    } catch (err) {
      showNotification('error', `Failed to load reports: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedShipment]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async (type) => {
    if (!selectedShipment) {
      showNotification('error', 'Please select a shipment');
      return;
    }
    setGenerating(true);
    try {
      const res = await reportsApi.generate({
        shipmentId: selectedShipment,
        type,
        generatedBy: inspectorName || 'System',
      });
      showNotification('success', `${type} report generated successfully and saved locally to ./reports/`);
      await loadData();
    } catch (err) {
      showNotification('error', `Report generation failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleArrivalVerification = async () => {
    if (!selectedShipment) return;
    setGenerating(true);
    try {
      const res = await shipmentsApi.verify(selectedShipment, {
        verificationStatus: verificationOutcome,
        inspectionNotes,
        verifiedBy: inspectorName,
        status: 'DELIVERED',
      });
      setVerifyModal(false);
      showNotification('success', `Arrival verification recorded for ${selectedShipment}. Reports automatically generated.`);
      await loadData();
    } catch (err) {
      showNotification('error', `Verification failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const filteredReports = reports.filter(r => {
    if (filterType === 'ALL') return true;
    return r.type === filterType;
  });

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Audit Reports & Local Persistence</h1>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              PORT 5001 ACTIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Persisted SQLite storage with automatic CSV raw telemetry & PDF regulatory verification reports saved to <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-slate-700">./reports/</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVerifyModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-all"
          >
            <Shield size={14} />
            Finalize Arrival Verification
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200/80 transition-all"
            title="Refresh reports"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border text-xs font-medium transition-all ${
          notification.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {notification.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Persistence Diagnostic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Backend & Port Card */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Backend Service</span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Port 5001
            </span>
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Server size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Node.js / Express API</p>
              <p className="text-[11px] text-slate-500">http://localhost:5001/health</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
            Uptime: {backendHealth?.uptime ? `${Math.round(backendHealth.uptime / 60)} mins` : 'Active'} | Socket: Connected
          </p>
        </div>

        {/* SQLite Database Card */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Local Persistence</span>
            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              SQLite WAL
            </span>
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Database size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">vaxiverify.db</p>
              <p className="text-[11px] text-slate-500 truncate">
                {backendHealth?.storage?.sizeBytes ? formatFileSize(backendHealth.storage.sizeBytes) : 'Local Storage Ready'}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100 truncate" title="server/data/vaxiverify.db">
            Location: <code className="text-slate-700">server/data/vaxiverify.db</code>
          </p>
        </div>

        {/* Reports Output Folder Card */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Report Repository</span>
            <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
              {reports.length} Reports Saved
            </span>
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <HardDrive size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Local Disk Output</p>
              <p className="text-[11px] text-slate-500 truncate">Directory: ./reports/</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
            CSV (Raw Telemetry) &amp; PDF (Audit Reports)
          </p>
        </div>
      </div>

      {/* Manual Report Generation Controls */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <FileText size={16} className="text-blue-600" />
          Generate New Shipment Audit Report
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Target Shipment</label>
            <select
              value={selectedShipment}
              onChange={(e) => setSelectedShipment(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} - {s.product || s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Inspector / Operator Sign-Off</label>
            <input
              type="text"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="e.g. Lead Pharmacist / Quality Officer"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => handleGenerate('CSV')}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all border border-slate-200"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" />
              Generate CSV
            </button>
            <button
              onClick={() => handleGenerate('PDF')}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-xs"
            >
              <FileText size={14} />
              Generate PDF
            </button>
            <button
              onClick={() => handleGenerate('ALL')}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-all"
            >
              Generate Both
            </button>
          </div>
        </div>

        {/* Regulatory Banner */}
        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-900 flex items-start gap-2.5">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Regulatory Notice:</span> Sensor data within specification (2°C - 8°C) does NOT independently verify vaccine potency. Container seals, packaging physical state, and cold-pack conditions must be manually inspected before administration.
          </div>
        </div>
      </div>

      {/* Generated Reports Table */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">Locally Stored Reports ({filteredReports.length})</h2>
            <span className="text-[11px] text-slate-500 font-medium">Persisted in ./reports/</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
            {['ALL', 'PDF', 'CSV'].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  filterType === t ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl">
            <FileText size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-medium text-slate-600">No reports generated yet</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Select a shipment above and click "Generate CSV" or "Generate PDF"
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="pb-2.5 font-medium">Report File</th>
                  <th className="pb-2.5 font-medium">Type</th>
                  <th className="pb-2.5 font-medium">Shipment</th>
                  <th className="pb-2.5 font-medium">Generated At</th>
                  <th className="pb-2.5 font-medium">File Size</th>
                  <th className="pb-2.5 font-medium">Generated By</th>
                  <th className="pb-2.5 font-medium text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 font-mono font-medium text-slate-900 flex items-center gap-2">
                      {report.type === 'PDF' ? (
                        <FileText size={16} className="text-rose-500 flex-shrink-0" />
                      ) : (
                        <FileSpreadsheet size={16} className="text-emerald-500 flex-shrink-0" />
                      )}
                      <span className="truncate max-w-[260px]" title={report.filename}>
                        {report.filename}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        report.type === 'PDF'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {report.type}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-slate-900">{report.shipmentId}</td>
                    <td className="py-3 text-slate-500">
                      {new Date(report.generatedAt).toLocaleString()}
                    </td>
                    <td className="py-3 font-mono text-slate-600">{formatFileSize(report.fileSize)}</td>
                    <td className="py-3 text-slate-600">{report.generatedBy || 'System'}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => reportsApi.download(report.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs transition-all border border-blue-200/60"
                      >
                        <Download size={13} />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Arrival Verification Modal */}
      {verifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Finalize Arrival Verification</h3>
              </div>
              <button
                onClick={() => setVerifyModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Record physical seal inspection and cold chain hand-over for shipment <strong>{selectedShipment}</strong>. This automatically finalizes status and writes audit reports to disk.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Verification Outcome</label>
                <select
                  value={verificationOutcome}
                  onChange={(e) => setVerificationOutcome(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="VERIFIED">VERIFIED - Seals Intact &amp; Temperature Compliant</option>
                  <option value="ACCEPTED_WITH_EXCURSION">ACCEPTED WITH OBSERVATION - Minor Excursion Logged</option>
                  <option value="REJECTED">REJECTED - Cold-Chain Breached or Seals Damaged</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Inspector Name &amp; ID</label>
                <input
                  type="text"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Physical Inspection Notes</label>
                <textarea
                  rows={3}
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  placeholder="Record packaging conditions, physical seal serial numbers, VVM indicator status..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setVerifyModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleArrivalVerification}
                disabled={generating}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                {generating ? 'Processing...' : 'Confirm Verification & Generate Reports'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
