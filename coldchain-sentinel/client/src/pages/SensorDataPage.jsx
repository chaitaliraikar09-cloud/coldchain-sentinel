import React, { useState, useEffect, useCallback } from 'react';
import { Database, Search, Download, RefreshCw, Eye, Filter } from 'lucide-react';
import { readingsApi } from '../services/api';
import { getSocket } from '../services/socket';

export default function SensorDataPage() {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReading, setSelectedReading] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('');
  const LIMIT = 20;

  const loadReadings = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: LIMIT, page };
      if (search) params.shipmentId = search;
      if (sourceFilter) params.source = sourceFilter;
      const res = await readingsApi.getAll(params);
      setReadings(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, search, sourceFilter]);

  useEffect(() => { loadReadings(); }, [loadReadings]);

  // Live prepend new readings
  useEffect(() => {
    const socket = getSocket();
    const handler = ({ reading }) => {
      if (page === 1) {
        setReadings(prev => [reading, ...prev.slice(0, LIMIT - 1)]);
        setTotal(t => t + 1);
      }
    };
    socket.on('reading:new', handler);
    return () => socket.off('reading:new', handler);
  }, [page]);

  const exportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Server Received', 'Device ID', 'Shipment ID', 'Sensor ID', 'Temperature', 'Humidity', 'Air Quality AQI', 'Latitude', 'Longitude', 'Battery', 'Source', 'Status'];
    const rows = readings.map(r => [
      r.id, r.timestamp, r.serverReceivedAt, r.deviceId, r.shipmentId || r.shipment_id, r.sensorId,
      r.temperature, r.humidity, r.air_quality_aqi != null ? r.air_quality_aqi : (r.airQualityAqi != null ? r.airQualityAqi : ''),
      r.latitude, r.longitude, r.battery, r.source, r.validationStatus
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sensor-data-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sensor Telemetry Feed</h1>
          <p className="text-sm text-slate-500 mt-1">{total} recorded telemetry points · Real-time streaming via Socket.IO</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadReadings}
            className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all shadow-2xs"
            title="Refresh Feed"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold rounded-xl transition-all shadow-2xs"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search shipment ID..."
            className="pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 shadow-2xs font-medium"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 text-xs rounded-xl border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-2 font-mono font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-500 status-pulse" />
            Live ESP32 Node (10.168.234.195)
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="clean-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table min-w-max">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Device ID</th>
                <th>Shipment</th>
                <th>Sensor</th>
                <th>Temp (°C)</th>
                <th>Humidity (%)</th>
                <th>Air Quality</th>
                <th>Lat / Lon</th>
                <th>Source</th>
                <th>Status</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-14 text-slate-400">Loading live telemetry records...</td></tr>
              ) : readings.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-14 text-slate-400">Waiting for ESP32 sensor telemetry...</td></tr>
              ) : readings.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  <td>
                    <div>
                      <p className="font-mono text-xs text-slate-900 font-semibold">{new Date(r.serverReceivedAt).toLocaleTimeString()}</p>
                      <p className="font-mono text-[10px] text-slate-400">dev: {r.timestamp}</p>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-slate-600 font-medium">{r.deviceId}</td>
                  <td className="font-mono text-xs text-blue-600 font-bold">{r.shipmentId}</td>
                  <td className="font-mono text-[10px] text-slate-500">{r.sensorId}</td>
                  <td>
                    <span className={`font-mono text-sm font-bold ${
                      r.temperature > 8 || r.temperature < 2 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {r.temperature?.toFixed(2)}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-slate-700 font-semibold">{r.humidity?.toFixed(1) ?? '—'}</td>
                  <td>
                    <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded-md ${
                      (r.air_quality_aqi ?? r.airQualityAqi) > 100
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : (r.air_quality_aqi ?? r.airQualityAqi) > 50
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {(r.air_quality_aqi ?? r.airQualityAqi) != null ? `${r.air_quality_aqi ?? r.airQualityAqi} AQI` : '—'}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-slate-500">
                    {r.latitude && r.longitude ? `${r.latitude}, ${r.longitude}` : '—'}
                  </td>
                  <td>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                      ESP32
                    </span>
                  </td>
                  <td>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                      {r.validationStatus || 'ACCEPTED'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setSelectedReading(r)}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                      title="Inspect JSON"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50/50">
          <span className="text-xs text-slate-500 font-medium">Page {page} of {totalPages} · {total} total records</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 hover:bg-slate-50 font-semibold transition-all shadow-2xs"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 hover:bg-slate-50 font-semibold transition-all shadow-2xs"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* JSON modal */}
      {selectedReading && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setSelectedReading(null)}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Raw Telemetry Payload: {selectedReading.id}</h3>
              <button onClick={() => setSelectedReading(null)} className="text-slate-400 hover:text-slate-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-slate-100">Close</button>
            </div>
            <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto leading-relaxed">
              {JSON.stringify(selectedReading, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
