import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Thermometer, Droplets, Battery, MapPin, AlertTriangle,
  CheckCircle, Clock, Cpu, Wind, FileText, Download, FileSpreadsheet, Shield
} from 'lucide-react';
import { shipmentsApi, alertsApi, checkpointsApi, healthApi, reportsApi } from '../services/api';
import { getSocket } from '../services/socket';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function ShipmentDetailPage() {
  const { id } = useParams();
  const [shipment, setShipment] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [reports, setReports] = useState([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [verifyModal, setVerifyModal] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState('Container seals verified intact. VVM indicator color acceptable.');
  const [inspectorName, setInspectorName] = useState('Receiving Pharmacist');
  const [verificationOutcome, setVerificationOutcome] = useState('VERIFIED');
  const [nearestCheckpoint, setNearestCheckpoint] = useState(null);
  const [esp32Status, setEsp32Status] = useState({ connected: false, reachable: false, isStale: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [shipRes, histRes, alertRes, repRes] = await Promise.allSettled([
        shipmentsApi.getById(id),
        shipmentsApi.getHistory(id, 200),
        alertsApi.getAll({ shipmentId: id }),
        reportsApi.getAll({ shipmentId: id }),
      ]);
      if (shipRes.status === 'fulfilled') setShipment(shipRes.value.data);
      if (histRes.status === 'fulfilled') setHistory(histRes.value.data || []);
      if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.data || []);
      if (repRes.status === 'fulfilled') setReports(repRes.value.data || []);

      // Load health/status for ESP32 tracking
      healthApi.getStatus().then(res => {
        if (res.data?.esp32) setEsp32Status(res.data.esp32);
      }).catch(() => {});

      // Load nearest checkpoint
      checkpointsApi.getNearest(id).then(r => setNearestCheckpoint(r.data)).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time updates
  useEffect(() => {
    const socket = getSocket();
    socket.emit('join:shipment', id);

    const onReading = ({ reading }) => {
      const readShipId = reading.shipmentId || reading.shipment_id;
      if (readShipId !== id) return;
      setHistory(prev => [...prev.slice(-199), reading]);
      setShipment(prev => prev ? { ...prev, latestReading: reading } : prev);
    };
    const onShipmentUpdated = ({ shipment: s }) => {
      if (s.id !== id) return;
      setShipment(s);
    };
    const onAlertNew = (alert) => {
      if (alert.shipmentId !== id) return;
      setAlerts(prev => [alert, ...prev]);
    };
    const onAlertUpdated = (alert) => {
      if (alert.shipmentId !== id) return;
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
    };
    const onCheckpoint = (cp) => setNearestCheckpoint(cp);
    const onEsp32Status = (st) => setEsp32Status(st);

    socket.on('reading:new', onReading);
    socket.on('shipment:updated', onShipmentUpdated);
    socket.on('alert:new', onAlertNew);
    socket.on('alert:updated', onAlertUpdated);
    socket.on('checkpoint:recommendation', onCheckpoint);
    socket.on('esp32:status', onEsp32Status);

    return () => {
      socket.emit('leave:shipment', id);
      socket.off('reading:new', onReading);
      socket.off('shipment:updated', onShipmentUpdated);
      socket.off('alert:new', onAlertNew);
      socket.off('alert:updated', onAlertUpdated);
      socket.off('checkpoint:recommendation', onCheckpoint);
      socket.off('esp32:status', onEsp32Status);
    };
  }, [id]);

  const handleAcknowledge = async (alertId) => {
    try {
      await alertsApi.acknowledge(alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' } : a));
    } catch (e) {}
  };

  const handleGenerateReport = async (type) => {
    setGeneratingReport(true);
    try {
      await reportsApi.generate({ shipmentId: id, type, generatedBy: inspectorName });
      const repRes = await reportsApi.getAll({ shipmentId: id });
      setReports(repRes.data || []);
    } catch (e) {
      alert(`Report generation failed: ${e.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleVerify = async () => {
    setGeneratingReport(true);
    try {
      const res = await shipmentsApi.verify(id, {
        verificationStatus: verificationOutcome,
        inspectionNotes,
        verifiedBy: inspectorName,
        status: 'DELIVERED',
      });
      setShipment(res.data);
      const repRes = await reportsApi.getAll({ shipmentId: id });
      setReports(repRes.data || []);
      setVerifyModal(false);
    } catch (e) {
      alert(`Verification failed: ${e.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full spinner" />
    </div>
  );

  if (error || !shipment) return (
    <div className="text-center py-20 text-slate-500">
      <p>{error || 'Shipment not found'}</p>
      <Link to="/shipments" className="text-blue-600 hover:text-blue-700 font-semibold text-sm mt-4 inline-block">← Back to Shipments</Link>
    </div>
  );

  const chartData = history.slice(-100).map(r => ({
    time: new Date(r.serverReceivedAt).toLocaleTimeString(),
    temperature: r.temperature,
    humidity: r.humidity,
    source: r.source,
  }));

  const latestReading = shipment.latestReading;
  const isVax = shipment.id === 'VAX-001';
  const isStale = isVax && (esp32Status.isStale || (!esp32Status.reachable && !esp32Status.receivingData));
  const lastKnownTimeStr = latestReading?.serverReceivedAt
    ? new Date(latestReading.serverReceivedAt).toLocaleTimeString()
    : (latestReading?.timestamp || null);

  const pos = latestReading?.latitude && latestReading?.longitude
    ? [latestReading.latitude, latestReading.longitude] : null;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Link to="/shipments" className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all shadow-2xs">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{shipment.id}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border tracking-wide ${
                isStale ? 'bg-amber-50 text-amber-700 border-amber-200' :
                shipment.excursionActive ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {isStale ? `STALE / OFFLINE (${lastKnownTimeStr || 'Awaiting'})` : shipment.excursionActive ? 'EXCURSION ACTIVE' : 'NORMAL'}
              </span>
              {latestReading?.source === 'simulator' && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                  Simulator Data
                </span>
              )}
              {latestReading?.source === 'esp32' && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                  ESP32 Device
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-1">{shipment.product} · {shipment.origin} → {shipment.destination}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleGenerateReport('CSV')}
            disabled={generatingReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-2xs"
            title="Generate and download raw telemetry CSV"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            CSV Log
          </button>
          <button
            onClick={() => handleGenerateReport('PDF')}
            disabled={generatingReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-xs"
            title="Generate clinical verification summary PDF"
          >
            <FileText size={14} />
            PDF Report
          </button>
          <button
            onClick={() => setVerifyModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-xs"
            title="Sign off arrival verification"
          >
            <Shield size={14} />
            Verify Arrival
          </button>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          {
            label: 'Temperature',
            value: latestReading?.temperature != null ? `${Number(latestReading.temperature).toFixed(1)}°C` : '—',
            icon: Thermometer,
            iconBg: 'bg-blue-50 text-blue-600',
            valColor: isStale ? 'text-amber-600' : (shipment.excursionActive ? 'text-rose-600' : 'text-slate-900'),
            sub: isStale && lastKnownTimeStr ? `⚠ Stale (Last: ${lastKnownTimeStr})` : `Safe: ${shipment.tempMin}–${shipment.tempMax}°C`,
          },
          {
            label: 'Humidity',
            value: latestReading?.humidity != null ? `${Number(latestReading.humidity).toFixed(1)}%` : '—',
            icon: Droplets,
            iconBg: 'bg-sky-50 text-sky-600',
            valColor: 'text-slate-900',
            sub: `Safe: ${shipment.humidityMin}–${shipment.humidityMax}%`,
          },
          {
            label: 'Air Quality',
            value: latestReading?.air_quality_aqi != null ? `${latestReading.air_quality_aqi} AQI` : (latestReading?.airQualityAqi != null ? `${latestReading.airQualityAqi} AQI` : '—'),
            icon: Wind,
            iconBg: 'bg-emerald-50 text-emerald-600',
            valColor: (latestReading?.air_quality_aqi || 0) > (shipment.aqiMax || 100) ? 'text-amber-600' : 'text-slate-900',
            sub: `Threshold: ${shipment.aqiMax || 100} AQI`,
          },
          {
            label: 'ESP32 Node IP',
            value: shipment.id === 'DEMO-001' ? 'Simulated' : (shipment.nodeIp || '10.168.234.195'),
            icon: Cpu,
            iconBg: 'bg-indigo-50 text-indigo-600',
            valColor: 'text-slate-900',
            sub: shipment.id === 'DEMO-001' ? 'Synthetic Demo Generator' : 'Port: 80 · Wi-Fi',
          },
          {
            label: 'Risk Score',
            value: `${shipment.riskScore ?? 0}/100`,
            icon: AlertTriangle,
            iconBg: shipment.riskScore >= 70 ? 'bg-rose-50 text-rose-600' : shipment.riskScore >= 40 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600',
            valColor: shipment.riskScore >= 70 ? 'text-rose-600' : shipment.riskScore >= 40 ? 'text-amber-600' : 'text-slate-900',
            sub: (shipment.riskCategory || 'LOW') + ' (Calculated)',
          },
        ].map(({ label, value, icon: Icon, iconBg, valColor, sub }) => (
          <div key={label} className="clean-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
                <Icon size={14} />
              </div>
              <span className="text-xs font-medium text-slate-500">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${valColor}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Timestamps */}
      <div className="clean-card p-5">
        <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Telemetry Diagnostics & Timestamps</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-slate-400 font-medium mb-1">Device Timestamp</p>
            <p className="text-slate-800 font-mono font-semibold">
              {latestReading?.timestamp
                ? (!isNaN(new Date(latestReading.timestamp).getTime())
                    ? new Date(latestReading.timestamp).toLocaleString()
                    : latestReading.timestamp)
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-slate-400 font-medium mb-1">Server Received</p>
            <p className="text-slate-800 font-mono font-semibold">{latestReading?.serverReceivedAt ? new Date(latestReading.serverReceivedAt).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="text-slate-400 font-medium mb-1">Excursion Duration</p>
            <p className={`font-mono font-bold ${shipment.excursionDuration > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
              {shipment.excursionDuration ? `${shipment.excursionDuration.toFixed(1)} min` : 'None'}
            </p>
          </div>
          <div>
            <p className="text-slate-400 font-medium mb-1">Source Stream</p>
            <p className={`font-medium font-mono text-xs ${shipment.id === 'DEMO-001' ? 'text-amber-700' : 'text-blue-700'}`}>
              {shipment.id === 'DEMO-001' ? 'Simulated Demonstration Stream' : (latestReading ? 'ESP32 Wi-Fi Hardware' : 'Waiting for Device')}
            </p>
          </div>
        </div>
      </div>

      {/* Chart + Map */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="clean-card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Temperature History</h3>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} stroke="#e2e8f0" interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} stroke="#e2e8f0" domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#0f172a', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
              <ReferenceLine y={shipment.tempMax} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={shipment.tempMin} stroke="#0284c7" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="temperature" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Temperature (°C)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="clean-card overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Last Known Location</h3>
            {pos && <p className="text-xs text-slate-500 mt-0.5">Consignment GPS coordinates</p>}
          </div>
          <div style={{ height: '220px' }}>
            {pos ? (
              <MapContainer center={pos} zoom={10} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={pos}>
                  <Popup>
                    <div>
                      <p className="font-bold text-sm">{shipment.id}</p>
                      <p className="text-xs text-slate-500">⚠ Consignment coordinates</p>
                    </div>
                  </Popup>
                </Marker>
                {nearestCheckpoint && (
                  <Marker position={[nearestCheckpoint.latitude, nearestCheckpoint.longitude]}>
                    <Popup>
                      <p className="font-bold text-sm">📍 {nearestCheckpoint.name}</p>
                      <p className="text-xs">Distance: {nearestCheckpoint.distanceKm} km (straight-line)</p>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                No location data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nearest checkpoint */}
      {nearestCheckpoint && (
        <div className="clean-card p-5 border border-blue-100 bg-blue-50/20">
          <div className="flex items-start gap-3">
            <MapPin size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Nearest Available Checkpoint</h3>
              <p className="text-slate-800 font-semibold">{nearestCheckpoint.name}</p>
              <p className="text-xs text-slate-500 mt-1">{nearestCheckpoint.address}</p>
              <p className="text-xs text-blue-600 font-medium mt-1">
                {nearestCheckpoint.distanceKm} km away (straight-line distance — not road distance)
              </p>
              <p className="text-xs text-slate-500 mt-1">Contact: {nearestCheckpoint.contact}</p>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      <div className="clean-card overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Alerts & Incidents</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 p-5 text-slate-500 text-sm">
              <CheckCircle size={18} className="text-emerald-500" />
              No alerts for this shipment — all telemetry within safe parameters
            </div>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={16} className={`mt-0.5 flex-shrink-0 ${
                    alert.severity === 'CRITICAL' ? 'text-rose-600' :
                    alert.severity === 'MODERATE' ? 'text-amber-600' : 'text-slate-400'
                  }`} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                      <span>{new Date(alert.createdAt).toLocaleString()}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        alert.severity === 'CRITICAL' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        alert.severity === 'MODERATE' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700'
                      }`}>{alert.severity}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        alert.status === 'ACTIVE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        alert.status === 'ACKNOWLEDGED' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>{alert.status}</span>
                    </div>
                    {alert.recommendedAction && (
                      <p className="text-xs text-blue-600 font-medium mt-1.5">→ {alert.recommendedAction}</p>
                    )}
                  </div>
                </div>
                {alert.status === 'ACTIVE' && (
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    className="flex-shrink-0 px-3.5 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold rounded-lg transition-all"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audit Reports Card */}
      <div className="clean-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Locally Generated Audit Reports ({reports.length})</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">Persisted in ./reports/</span>
        </div>
        <div className="p-5">
          {reports.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
              <p className="text-xs text-slate-500">No reports generated for this shipment yet.</p>
              <p className="text-[11px] text-slate-400 mt-1">Use the "CSV Log" or "PDF Report" buttons in the top header to generate.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reports.map(rep => (
                <div key={rep.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {rep.type === 'PDF' ? (
                      <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                        <FileText size={16} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                        <FileSpreadsheet size={16} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-semibold text-slate-900 truncate" title={rep.filename}>{rep.filename}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Generated {new Date(rep.generatedAt).toLocaleString()} by {rep.generatedBy || 'System'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => reportsApi.download(rep.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs transition-all flex-shrink-0 border border-blue-200/60"
                  >
                    <Download size={13} />
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
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
              Sign off physical arrival inspection for <strong>{shipment.id}</strong>. This updates status to Delivered and automatically generates official CSV and PDF audit reports.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Verification Status</label>
                <select
                  value={verificationOutcome}
                  onChange={(e) => setVerificationOutcome(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="VERIFIED">VERIFIED - Seals Intact & Temperature Compliant</option>
                  <option value="ACCEPTED_WITH_EXCURSION">ACCEPTED WITH OBSERVATION - Minor Excursion Noted</option>
                  <option value="REJECTED">REJECTED - Cold-Chain Breached / Packaging Compromised</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Inspector Name & ID</label>
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
                  placeholder="Record container seal serials, chemical VVM status, packaging conditions..."
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
                onClick={handleVerify}
                disabled={generatingReport}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                {generatingReport ? 'Generating Reports...' : 'Confirm Verification & Generate Reports'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
