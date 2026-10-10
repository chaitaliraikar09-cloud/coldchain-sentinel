import React, { useEffect, useState } from 'react';
import {
  Truck, Thermometer, AlertTriangle, Activity, Zap, Wifi,
  TrendingUp, TrendingDown, ArrowRight, RefreshCw, Wind, Droplets, ShieldCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyticsApi, healthApi } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getSocket } from '../services/socket';
import { Link } from 'react-router-dom';

function KPICard({ label, value, icon: Icon, color, subtext, trend }) {
  const colorMap = {
    cyan: { iconBg: 'bg-sky-50 text-sky-600', text: 'text-sky-600', border: 'border-slate-200/80' },
    green: { iconBg: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600', border: 'border-slate-200/80' },
    red: { iconBg: 'bg-rose-50 text-rose-600', text: 'text-rose-600', border: 'border-rose-200' },
    amber: { iconBg: 'bg-amber-50 text-amber-600', text: 'text-amber-600', border: 'border-amber-200' },
    purple: { iconBg: 'bg-purple-50 text-purple-600', text: 'text-purple-600', border: 'border-slate-200/80' },
    blue: { iconBg: 'bg-blue-50 text-blue-600', text: 'text-blue-600', border: 'border-slate-200/80' },
  };

  const scheme = colorMap[color] || colorMap.cyan;

  return (
    <div className={`clean-card p-5 border ${scheme.border} hover:shadow-md transition-all duration-300`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${scheme.iconBg} flex items-center justify-center font-semibold`}>
          <Icon size={18} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
            trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}>
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1 truncate">{value ?? '—'}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {subtext && <p className="text-xs text-slate-400 mt-1 truncate">{subtext}</p>}
      </div>
    </div>
  );
}

function LiveTempChart({ readings, tempMin = 2, tempMax = 8 }) {
  const data = readings.slice(-60).map(r => ({
    time: new Date(r.serverReceivedAt).toLocaleTimeString(),
    temp: r.temperature,
    shipment: r.shipmentId || r.shipment_id,
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;
    const inRange = v >= tempMin && v <= tempMax;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl text-slate-800">
        <p className="text-xs text-slate-400 mb-1">{payload[0].payload.time}</p>
        <p className={`text-sm font-bold ${inRange ? 'text-emerald-600' : 'text-rose-600'}`}>
          {v?.toFixed(2)}°C
        </p>
        <p className={`text-xs font-medium ${inRange ? 'text-emerald-600' : 'text-rose-600'}`}>
          {inRange ? '✓ In Safe Range' : '⚠ Temperature Excursion'}
        </p>
      </div>
    );
  };

  if (!data.length) return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
      No readings yet — awaiting telemetry...
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" domain={['auto', 'auto']} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={tempMax} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `Max ${tempMax}°C`, fill: '#d97706', fontSize: 10 }} />
        <ReferenceLine y={tempMin} stroke="#0284c7" strokeDasharray="4 4" label={{ value: `Min ${tempMin}°C`, fill: '#0284c7', fontSize: 10 }} />
        <Line
          type="monotone"
          dataKey="temp"
          stroke="#2563eb"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function OverviewPage() {
  const { shipments, alerts, overview, lastReadingTime, connected } = useApp();
  const [liveReadings, setLiveReadings] = useState([]);
  const [esp32Status, setEsp32Status] = useState({ connected: false, reachable: false, lastReadingAt: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load health/status
    healthApi.getStatus().then(res => {
      if (res.data?.esp32) setEsp32Status(res.data.esp32);
    }).catch(() => {});

    setLoading(false);
  }, []);

  // Listen to live readings & esp32 status
  useEffect(() => {
    const socket = getSocket();
    const readingHandler = ({ reading }) => {
      setLiveReadings(prev => [...prev.slice(-99), reading]);
    };
    const esp32Handler = (status) => {
      setEsp32Status(status);
    };
    socket.on('reading:new', readingHandler);
    socket.on('esp32:status', esp32Handler);
    return () => {
      socket.off('reading:new', readingHandler);
      socket.off('esp32:status', esp32Handler);
    };
  }, []);

  const vaxShipment = shipments.find(s => s.id === 'VAX-001');
  const vaxLiveReadings = liveReadings.filter(r => (r.shipmentId === 'VAX-001' || r.shipment_id === 'VAX-001') && r.source !== 'simulator');
  const latestVaxReading = vaxLiveReadings.length > 0 ? vaxLiveReadings[vaxLiveReadings.length - 1] : vaxShipment?.latestReading;

  const currentTemp = latestVaxReading?.temperature;
  const currentHumidity = latestVaxReading?.humidity;
  const currentAqi = latestVaxReading?.air_quality_aqi != null ? latestVaxReading.air_quality_aqi : latestVaxReading?.airQualityAqi;

  const isVaxStale = esp32Status.isStale || (!esp32Status.reachable && !esp32Status.receivingData);
  const lastKnownTimeStr = latestVaxReading?.serverReceivedAt
    ? new Date(latestVaxReading.serverReceivedAt).toLocaleTimeString()
    : (latestVaxReading?.timestamp || null);

  const activeShipments = shipments.filter(s => s.id === 'VAX-001' || s.id === 'DEMO-001').length;
  const inRange = shipments.filter(s => s.latestReading && !s.excursionActive).length;
  const excursions = shipments.filter(s => s.excursionActive).length;
  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time cold-chain monitoring with live air quality telemetry
            {lastReadingTime && <span className="ml-2 text-slate-400">· Updated {new Date(lastReadingTime).toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={`px-3 py-1.5 rounded-full border font-mono font-medium ${
            esp32Status.reachable
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            ESP32: {esp32Status.reachable ? '10.168.234.195 (Reachable)' : '10.168.234.195 (Offline)'}
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 status-pulse' : 'bg-rose-500'}`} />
            <span className={`font-semibold ${connected ? 'text-emerald-700' : 'text-rose-700'}`}>
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Disconnected banner */}
      {!connected && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rose-800">Dashboard Disconnected</p>
            <p className="text-xs text-rose-600">Not receiving live data. Ensure the backend server is running on port 5001.</p>
          </div>
        </div>
      )}

      {/* Quick Summary Section (Inspired by Taskify Image 1) */}
      <div className="summary-banner p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Quick Summary</h2>
          <span className="text-xs text-slate-500 font-medium">All Monitored Consignments</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <KPICard
            label="Active Shipments"
            value={activeShipments}
            icon={Truck}
            color="cyan"
            subtext="VAX-001 Live ESP32 Node"
          />
          <KPICard
            label="Latest Temperature"
            value={currentTemp != null ? `${Number(currentTemp).toFixed(1)}°C` : '—'}
            icon={Thermometer}
            color={isVaxStale ? 'amber' : (currentTemp != null && (currentTemp < 2 || currentTemp > 8) ? 'red' : 'green')}
            subtext={
              isVaxStale && lastKnownTimeStr
                ? `⚠ Stale (Last: ${lastKnownTimeStr})`
                : (currentTemp != null && (currentTemp < 2 || currentTemp > 8)
                    ? '⚠ Excursion Active'
                    : currentTemp != null ? 'Safe 2°C–8°C' : 'Waiting for ESP32')
            }
          />
          <KPICard
            label="Latest Humidity"
            value={currentHumidity != null ? `${Number(currentHumidity).toFixed(1)}%` : '—'}
            icon={Droplets}
            color="blue"
            subtext={currentHumidity != null ? 'Target 30%–70%' : 'Waiting for ESP32'}
          />
          <KPICard
            label="Air Quality (AQI)"
            value={currentAqi != null ? `${currentAqi} AQI` : '—'}
            icon={Wind}
            color={currentAqi != null && currentAqi > 100 ? 'amber' : 'green'}
            subtext={currentAqi != null && currentAqi > 100 ? '⚠ Elevated AQI' : currentAqi != null ? 'Normal Atmosphere' : 'Waiting for ESP32'}
          />
          <KPICard
            label="Active Alerts"
            value={activeAlerts}
            icon={AlertTriangle}
            color={activeAlerts > 0 ? (criticalAlerts > 0 ? 'red' : 'amber') : 'green'}
            subtext={`${criticalAlerts} critical`}
          />
          <KPICard
            label="ESP32 Wi-Fi Node"
            value={esp32Status.connected ? 'Online' : (esp32Status.reachable ? 'Reachable' : 'Offline')}
            icon={Wifi}
            color={esp32Status.connected ? 'green' : (esp32Status.reachable ? 'cyan' : 'rose')}
            subtext="10.168.234.195:80"
          />
        </div>
      </div>

      {/* VAX-001 Live Telemetry Focus Card (Inspired by Critical Project Card in Taskify Image 1) */}
      {vaxShipment && (
        <div className="clean-card p-5 border border-slate-200/90 hover:shadow-md transition-all">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shadow-2xs">
                VAX
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 text-sm">Shipment VAX-001 (Live ESP32 Monitored)</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide border ${
                    !vaxShipment.latestReading
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : vaxShipment.excursionActive
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {!vaxShipment.latestReading ? 'WAITING FOR SENSOR' : vaxShipment.excursionActive ? 'EXCURSION' : 'NORMAL'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono font-medium border border-slate-200">
                    Node: 10.168.234.195
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {vaxShipment.product} · {vaxShipment.origin} → {vaxShipment.destination}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5 sm:gap-6 text-xs flex-wrap">
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] font-semibold tracking-wider">TEMP</span>
                <span className={`font-mono font-bold text-sm ${vaxShipment.latestReading?.temperature > 8 ? 'text-rose-600' : 'text-blue-600'}`}>
                  {vaxShipment.latestReading?.temperature != null ? `${Number(vaxShipment.latestReading.temperature).toFixed(1)}°C` : '—'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] font-semibold tracking-wider">HUMIDITY</span>
                <span className="font-mono font-bold text-sm text-slate-800">
                  {vaxShipment.latestReading?.humidity != null ? `${Number(vaxShipment.latestReading.humidity).toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] font-semibold tracking-wider">AIR QUALITY</span>
                <span className="font-mono font-bold text-sm text-emerald-600">
                  {vaxShipment.latestReading?.air_quality_aqi != null ? `${vaxShipment.latestReading.air_quality_aqi} AQI` : '—'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] font-semibold tracking-wider">RISK SCORE</span>
                <span className={`font-mono font-bold text-sm ${vaxShipment.riskScore >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {vaxShipment.riskScore ?? 0}/100
                </span>
              </div>
              <Link
                to="/shipments/VAX-001"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all text-xs shadow-xs"
              >
                View Telemetry →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Live chart + active alerts panel */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Live temperature chart */}
        <div className="clean-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Live Temperature Feed</h3>
              <p className="text-xs text-slate-500 mt-0.5">All monitored shipments · Last 60 readings</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-100">
              {liveReadings.length} readings
            </span>
          </div>
          <LiveTempChart readings={liveReadings} />
        </div>

        {/* Active alerts panel */}
        <div className="clean-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Active Alerts</h3>
              <p className="text-xs text-slate-500 mt-0.5">Issues requiring operator attention</p>
            </div>
            <Link to="/alerts" className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
            {alerts.filter(a => a.status === 'ACTIVE').length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Activity size={28} className="mb-2 text-emerald-500" />
                <p className="text-sm font-medium text-slate-600">All systems normal</p>
                <p className="text-xs text-slate-400">No active excursions detected</p>
              </div>
            ) : (
              alerts.filter(a => a.status === 'ACTIVE').slice(0, 8).map(alert => (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 p-3 rounded-xl text-xs border transition-all ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                      : alert.severity === 'MODERATE'
                        ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <AlertTriangle size={14} className={
                    alert.severity === 'CRITICAL' ? 'text-rose-600 mt-0.5 flex-shrink-0' :
                    alert.severity === 'MODERATE' ? 'text-amber-600 mt-0.5 flex-shrink-0' :
                    'text-slate-500 mt-0.5 flex-shrink-0'
                  } />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate text-slate-900">{alert.shipmentId}</p>
                    <p className="text-slate-600 mt-0.5 truncate">{alert.message}</p>
                  </div>
                  <span className={`ml-auto flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    alert.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' :
                    alert.severity === 'MODERATE' ? 'bg-amber-100 text-amber-800' :
                    'bg-slate-200 text-slate-700'
                  }`}>
                    {alert.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Shipments table */}
      <div className="clean-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Live Shipment Status</h3>
            <p className="text-xs text-slate-500 mt-0.5">Real-time status of monitored vaccine batches</p>
          </div>
          <Link to="/shipments" className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Shipment ID</th>
                <th>Product</th>
                <th>Temperature</th>
                <th>Humidity</th>
                <th>Air Quality</th>
                <th>Status</th>
                <th>Risk Score</th>
                <th>Last Update</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shipments.filter(s => s.id === 'VAX-001' || s.id === 'DEMO-001').map(s => {
                const temp = s.latestReading?.temperature;
                const inRange = !s.excursionActive;
                const isVax = s.id === 'VAX-001';
                return (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-900 font-bold">{s.id}</span>
                        {isVax ? (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold tracking-wide">
                            LIVE
                          </span>
                        ) : (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold tracking-wide">
                            DEMO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-slate-800 font-medium max-w-40 truncate">{s.product}</td>
                    <td>
                      <span className={`font-mono text-sm font-bold ${
                        temp === undefined || temp === null ? 'text-slate-400' :
                        !inRange ? 'text-rose-600 font-bold' : 'text-emerald-600'
                      }`}>
                        {temp !== undefined && temp !== null ? `${temp.toFixed(1)}°C` : '—'}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-slate-700 font-semibold">
                      {s.latestReading?.humidity != null ? `${s.latestReading.humidity.toFixed(1)}%` : '—'}
                    </td>
                    <td>
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {s.latestReading?.air_quality_aqi != null ? `${s.latestReading.air_quality_aqi} AQI` : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        !s.latestReading ? 'bg-slate-100 text-slate-600' :
                        s.excursionActive ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          !s.latestReading ? 'bg-slate-400' :
                          s.excursionActive ? 'bg-rose-500 status-pulse' : 'bg-emerald-500'
                        }`} />
                        {!s.latestReading ? 'No Data' : s.excursionActive ? 'EXCURSION' : 'NORMAL'}
                      </span>
                    </td>
                    <td>
                      <span className={`text-xs font-bold ${
                        s.riskScore >= 70 ? 'text-rose-600' :
                        s.riskScore >= 40 ? 'text-amber-600' :
                        'text-emerald-600'
                      }`}>
                        {s.riskScore ?? 0}/100
                      </span>
                    </td>
                    <td className="text-xs text-slate-500 font-medium">
                      {s.lastUpdated ? new Date(s.lastUpdated).toLocaleTimeString() : '—'}
                    </td>
                    <td>
                      <Link
                        to={`/shipments/${s.id}`}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-all"
                      >
                        Details <ArrowRight size={11} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
