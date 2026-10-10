import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, Filter, RefreshCw } from 'lucide-react';
import { alertsApi } from '../services/api';
import { getSocket } from '../services/socket';
import { useApp } from '../context/AppContext';

const SEVERITY_OPTIONS = ['ALL', 'CRITICAL', 'MODERATE', 'MINOR'];
const STATUS_OPTIONS = ['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];

export default function AlertsPage() {
  const { clearNewAlertCount } = useApp();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState('ALL');
  const [status, setStatus] = useState('ACTIVE');
  const [summary, setSummary] = useState({});
  const [acknowledging, setAcknowledging] = useState(null);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const params = {};
      if (severity !== 'ALL') params.severity = severity;
      if (status !== 'ALL') params.status = status;
      const [alertRes, summaryRes] = await Promise.all([
        alertsApi.getAll(params),
        alertsApi.getSummary(),
      ]);
      setAlerts(alertRes.data || []);
      setSummary(summaryRes.data || {});
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    clearNewAlertCount();
    loadAlerts();
  }, [severity, status]);

  // Live updates
  useEffect(() => {
    const socket = getSocket();
    const onNew = (alert) => {
      setAlerts(prev => {
        const exists = prev.find(a => a.id === alert.id);
        if (exists) return prev;
        return [alert, ...prev];
      });
      setSummary(s => ({ ...s, active: (s.active || 0) + 1, total: (s.total || 0) + 1 }));
    };
    const onUpdated = (alert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
    };
    socket.on('alert:new', onNew);
    socket.on('alert:updated', onUpdated);
    return () => { socket.off('alert:new', onNew); socket.off('alert:updated', onUpdated); };
  }, []);

  const handleAcknowledge = async (id) => {
    setAcknowledging(id);
    try {
      const res = await alertsApi.acknowledge(id);
      setAlerts(prev => prev.map(a => a.id === id ? res.data : a));
    } catch (e) {}
    setAcknowledging(null);
  };

  const handleResolve = async (id) => {
    try {
      const res = await alertsApi.resolve(id);
      setAlerts(prev => prev.map(a => a.id === id ? res.data : a));
    } catch (e) {}
  };

  const filteredAlerts = alerts.filter(a => {
    if (status !== 'ALL' && a.status !== status) return false;
    if (severity !== 'ALL' && a.severity !== severity) return false;
    return true;
  });

  const severityConfig = {
    CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200',
    MODERATE: 'bg-amber-50 text-amber-700 border-amber-200',
    MINOR: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const statusConfig = {
    ACTIVE: 'bg-rose-50 text-rose-700 border border-rose-200',
    ACKNOWLEDGED: 'bg-blue-50 text-blue-700 border border-blue-200',
    RESOLVED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Alerts & Incidents</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time temperature excursions, air quality anomalies, and threshold warnings</p>
        </div>
        <button
          onClick={loadAlerts}
          className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all shadow-2xs"
          title="Refresh Alerts"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Alerts', value: summary.total ?? '—', color: 'text-slate-900', bg: 'bg-slate-50' },
          { label: 'Active', value: summary.active ?? '—', color: 'text-rose-600', bg: 'bg-rose-50/40' },
          { label: 'Critical Excursions', value: summary.critical ?? '—', color: 'text-rose-600', bg: 'bg-rose-50/40' },
          { label: 'Resolved', value: summary.resolved ?? '—', color: 'text-emerald-600', bg: 'bg-emerald-50/40' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`clean-card p-5 text-center ${bg}`}>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters (Clean Pill Navigation like Tabela Image 3) */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter size={15} className="text-slate-400" />
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all font-medium ${
                status === s ? 'bg-white text-blue-600 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-slate-300" />
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {SEVERITY_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all font-medium ${
                severity === s ? 'bg-white text-blue-600 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto font-medium">{filteredAlerts.length} alerts</span>
      </div>

      {/* Alerts list */}
      <div className="clean-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-14 text-slate-400">
            <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full spinner mr-3" />
            Loading alerts...
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-14 text-slate-400">
            <CheckCircle size={36} className="text-emerald-500 mb-3" />
            <p className="text-sm font-semibold text-slate-700">No alerts matching your filters</p>
            <p className="text-xs text-slate-400 mt-1">All conditions are within specified thresholds</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAlerts.map(alert => (
              <div
                key={alert.id}
                className={`p-5 transition-all ${alert.status === 'ACTIVE' ? 'hover:bg-slate-50/80' : 'opacity-75 bg-slate-50/30'}`}
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      alert.severity === 'CRITICAL' ? 'bg-rose-50 text-rose-600' :
                      alert.severity === 'MODERATE' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <AlertTriangle size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-slate-900">{alert.shipmentId}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${severityConfig[alert.severity]}`}>
                          {alert.severity}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${statusConfig[alert.status]}`}>
                          {alert.status}
                        </span>
                        <span className="text-xs text-slate-400 font-mono font-medium">{alert.type}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{alert.message}</p>
                      {alert.recommendedAction && (
                        <p className="text-xs text-blue-600 font-semibold mt-1">→ {alert.recommendedAction}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          {new Date(alert.createdAt).toLocaleString()}
                        </span>
                        {alert.durationMinutes != null && (
                          <span>Duration: <strong>{alert.durationMinutes.toFixed(1)} min</strong></span>
                        )}
                        {alert.temperature != null && (
                          <span>Temp: <strong>{alert.temperature.toFixed(1)}°C</strong></span>
                        )}
                        {(alert.airQualityAqi != null || alert.aqi != null) && (
                          <span className="text-amber-700 font-semibold">AQI: {alert.airQualityAqi ?? alert.aqi}</span>
                        )}
                        {alert.threshold != null && (
                          <span>Threshold: {alert.threshold}{alert.type === 'AIR_QUALITY_HIGH' ? ' AQI' : '°C'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {alert.status === 'ACTIVE' && (
                    <div className="flex gap-2 flex-shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={acknowledging === alert.id}
                        className="px-3.5 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold rounded-xl transition-all disabled:opacity-60"
                      >
                        {acknowledging === alert.id ? 'Ack...' : 'Acknowledge'}
                      </button>
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="px-3.5 py-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold rounded-xl transition-all"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
