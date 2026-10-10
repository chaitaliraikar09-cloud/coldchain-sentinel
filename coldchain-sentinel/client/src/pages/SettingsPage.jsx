import React, { useState, useEffect } from 'react';
import { Wifi, Server, Clock, Cpu, CheckCircle } from 'lucide-react';
import { healthApi } from '../services/api';

export default function SettingsPage() {
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  
  // ESP32 IP configuration
  const [esp32HostInput, setEsp32HostInput] = useState('10.168.234.195');
  const [esp32PortInput, setEsp32PortInput] = useState('80');

  useEffect(() => {
    Promise.all([
      healthApi.getHealth().then(r => setHealth(r)).catch(() => {}),
      healthApi.getStatus().then(r => {
        setStatus(r.data);
        if (r.data?.esp32?.host) setEsp32HostInput(r.data.esp32.host);
        if (r.data?.esp32?.port) setEsp32PortInput(String(r.data.esp32.port));
      }).catch(() => {}),
    ]);
  }, []);

  const refreshStatus = async () => {
    const [h, s] = await Promise.all([
      healthApi.getHealth().catch(() => null),
      healthApi.getStatus().catch(() => null),
    ]);
    if (h) setHealth(h);
    if (s) setStatus(s.data);
  };

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };

  const handleSaveEsp32Host = async () => {
    setLoading(true);
    try {
      const res = await healthApi.setEsp32Host(esp32HostInput, parseInt(esp32PortInput, 10) || 80);
      showMsg(res.data?.message || 'ESP32 host config updated');
      refreshStatus();
    } catch (e) {
      showMsg('Failed to update host: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-slide-in max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings & Hardware Integration</h1>
        <p className="text-sm text-slate-500 mt-1">
          ColdChain Sentinel operates with live ESP32 Wi-Fi telemetry for shipment VAX-001
        </p>
      </div>

      {msg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs flex items-center justify-between font-medium">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="text-blue-500 hover:text-blue-800 ml-2 font-bold">✕</button>
        </div>
      )}

      {/* Active Hardware Architecture Banner */}
      <div className="clean-card p-5 border-l-4 border-l-blue-600 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={18} className="text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Live Hardware Architecture</h3>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 ml-auto tracking-wide">
            LIVE ESP32 ONLY
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Synthetic sensor generators and simulated streams are strictly isolated.
          The dashboard operates on real telemetry transmitted over Wi-Fi from the ESP32 node and forwarded via WebSockets.
        </p>
      </div>

      {/* ESP32 Hardware Configuration */}
      <div className="clean-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wifi size={18} className="text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">ESP32 Wi-Fi Target Configuration</h3>
          <span className={`ml-auto text-xs px-3 py-1 rounded-full font-semibold border ${
            status?.esp32?.reachable
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            {status?.esp32?.reachable ? '🟢 IP Reachable (Ping OK)' : '⚪ Probing Host'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600 block mb-1">ESP32 Host IP Address</label>
            <input
              type="text"
              value={esp32HostInput}
              onChange={e => setEsp32HostInput(e.target.value)}
              placeholder="10.168.234.195"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Port</label>
            <input
              type="text"
              value={esp32PortInput}
              onChange={e => setEsp32PortInput(e.target.value)}
              placeholder="80"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-3 mb-5">
          <button
            onClick={handleSaveEsp32Host}
            disabled={loading}
            className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-semibold shadow-xs disabled:opacity-50"
          >
            Update ESP32 Target
          </button>
          <button
            onClick={refreshStatus}
            className="px-4 py-2 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl transition-all font-semibold"
          >
            Check Connectivity
          </button>
        </div>

        {/* Live ESP32 Diagnostic Card */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
          <p className="text-xs font-bold text-slate-700">ESP32 Live Diagnostic Status</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400 text-[10px] font-semibold uppercase">Host & Port</p>
              <p className="font-mono text-slate-800 font-bold">{status?.esp32?.host || '10.168.234.195'}:{status?.esp32?.port || 80}</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-semibold uppercase">Reachable (Port 80)</p>
              <p className={status?.esp32?.reachable ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                {status?.esp32?.reachable ? 'YES' : 'NO'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-semibold uppercase">Live Data Ingestion</p>
              <p className={status?.esp32?.connected ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                {status?.esp32?.connected ? 'ACTIVE' : 'WAITING FOR JSON'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-semibold uppercase">Last Reading</p>
              <p className="font-mono text-slate-700 text-xs font-semibold">
                {status?.esp32?.lastReadingAt ? new Date(status.esp32.lastReadingAt).toLocaleTimeString() : 'None yet'}
              </p>
            </div>
          </div>
          {status?.esp32?.note && (
            <p className="text-[11px] text-blue-700 pt-2 border-t border-slate-200 font-mono">
              Note: {status.esp32.note}
            </p>
          )}
        </div>

        {/* ESP32 JSON Schema Documentation */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-700 mb-2">Incoming Telemetry Schema:</p>
          <pre className="p-3.5 bg-slate-900 rounded-xl font-mono text-[11px] text-slate-100 overflow-x-auto leading-relaxed">
{`{
  "shipment_id": "VAX-001",
  "temperature": 32.1,
  "humidity": 46.2,
  "air_quality_aqi": 46,
  "latitude": 19.075912,
  "longitude": 72.877701,
  "timestamp": "18s"
}`}
          </pre>
        </div>
      </div>

      {/* System Health Overview */}
      <div className="clean-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} className="text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">System Runtime & Backend Health</h3>
          <button onClick={refreshStatus} className="ml-auto text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
            <Clock size={12} /> Refresh
          </button>
        </div>
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <p className="text-slate-500 text-xs mb-1 font-medium">Server Status</p>
              <p className="text-emerald-600 font-bold">{health.status?.toUpperCase()}</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <p className="text-slate-500 text-xs mb-1 font-medium">Uptime</p>
              <p className="text-slate-900 font-mono font-bold">{health.uptime}s</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <p className="text-slate-500 text-xs mb-1 font-medium">Active WS Clients</p>
              <p className="text-slate-900 font-mono font-bold">{health.connectedClients}</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <p className="text-slate-500 text-xs mb-1 font-medium">Active Monitored Node</p>
              <p className="text-blue-600 font-mono text-xs font-bold">VAX-001</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
