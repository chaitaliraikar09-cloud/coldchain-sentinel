import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { analyticsApi, shipmentsApi } from '../services/api';
import { getSocket } from '../services/socket';
import { TrendingUp, Thermometer, Droplets, Wind, Clock, RefreshCw } from 'lucide-react';

const RANGES = [
  { value: '15m', label: '15 min' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
];

export default function AnalyticsPage() {
  const [shipments, setShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState('VAX-001');
  const [range, setRange] = useState('1h');
  const [tempData, setTempData] = useState([]);
  const [excursionData, setExcursionData] = useState([]);
  const [riskData, setRiskData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [shipRes, excRes, riskRes] = await Promise.all([
        shipmentsApi.getAll(),
        analyticsApi.getExcursions(),
        analyticsApi.getRisk(),
      ]);
      setShipments(shipRes.data || []);
      setExcursionData(excRes.data || []);
      setRiskData(riskRes.data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadTemp = useCallback(async () => {
    setLoading(true);
    try {
      const params = { range };
      if (selectedShipment) params.shipmentId = selectedShipment;
      const res = await analyticsApi.getTemperature(params);
      let data = res.data || [];
      // Enforce strict separation: VAX-001 only actual ESP32 readings, DEMO-001 only simulated
      if (selectedShipment === 'VAX-001') {
        data = data.filter(d => d.source !== 'simulator');
      } else if (selectedShipment === 'DEMO-001') {
        data = data.filter(d => d.source === 'simulator');
      }
      setTempData(data);
    } catch (e) {
      console.error(e);
      setTempData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedShipment, range]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadTemp(); }, [loadTemp]);

  // Real-time update on new incoming readings (deduplicated by timestamp/id)
  useEffect(() => {
    const socket = getSocket();
    const handler = ({ reading }) => {
      const readingShipment = reading.shipmentId || reading.shipment_id;
      if (readingShipment === selectedShipment) {
        // Enforce strict isolation
        if (selectedShipment === 'VAX-001' && reading.source === 'simulator') return;
        if (selectedShipment === 'DEMO-001' && reading.source === 'esp32') return;

        setTempData(prev => {
          const exists = prev.some(p => (
            p.time === reading.serverReceivedAt ||
            (p.deviceTime && p.deviceTime === reading.timestamp)
          ));
          if (exists) return prev;
          const mapped = {
            time: reading.serverReceivedAt,
            deviceTime: reading.timestamp,
            temperature: reading.temperature,
            humidity: reading.humidity,
            air_quality_aqi: reading.air_quality_aqi !== undefined ? reading.air_quality_aqi : reading.airQualityAqi,
            shipmentId: readingShipment,
            source: reading.source,
            sourceLabel: reading.sourceLabel,
          };
          return [...prev.slice(-299), mapped];
        });
      }
    };
    socket.on('reading:new', handler);
    return () => socket.off('reading:new', handler);
  }, [selectedShipment]);

  // Normalized chart data with unique timestamps
  const chartData = tempData
    .filter((d, idx, arr) => arr.findIndex(item => item.time === d.time) === idx)
    .map(d => {
      const dateObj = new Date(d.time);
      const formattedTime = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : (d.deviceTime || 'Now');
      return {
        time: formattedTime,
        rawTime: d.time,
        deviceTime: d.deviceTime,
        temperature: d.temperature != null ? Number(d.temperature) : null,
        humidity: d.humidity != null ? Number(d.humidity) : null,
        air_quality_aqi: d.air_quality_aqi != null ? Number(d.air_quality_aqi) : null,
        shipment: d.shipmentId,
        source: d.source,
      };
    });

  const selectedShipmentObj = shipments.find(s => s.id === selectedShipment);
  const tempMin = selectedShipmentObj?.tempMin ?? 2;
  const tempMax = selectedShipmentObj?.tempMax ?? 8;
  const aqiThreshold = selectedShipmentObj?.aqiMax ?? 100;
  const isDemo = selectedShipment === 'DEMO-001';

  // Custom tooltips (Clean SaaS light styling)
  const TempTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;
    const inRange = v >= tempMin && v <= tempMax;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl text-slate-800">
        <p className="text-[11px] text-slate-400 mb-1">{payload[0].payload.time} ({payload[0].payload.shipment})</p>
        <p className="text-base font-bold text-blue-600">{v != null ? `${v.toFixed(2)} °C` : '—'}</p>
        <p className={`text-xs mt-1 font-medium ${inRange ? 'text-emerald-600' : 'text-rose-600'}`}>
          {inRange ? '✓ Within Safe Cold-Chain Range' : '⚠ Temperature Excursion Detected'}
        </p>
      </div>
    );
  };

  const HumTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl text-slate-800">
        <p className="text-[11px] text-slate-400 mb-1">{payload[0].payload.time} ({payload[0].payload.shipment})</p>
        <p className="text-base font-bold text-sky-600">{v != null ? `${v.toFixed(1)} % RH` : '—'}</p>
        <p className="text-xs text-slate-500 mt-0.5">Relative Humidity</p>
      </div>
    );
  };

  const AqiTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;
    const isNormal = v <= aqiThreshold;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl text-slate-800">
        <p className="text-[11px] text-slate-400 mb-1">{payload[0].payload.time} ({payload[0].payload.shipment})</p>
        <p className="text-base font-bold text-emerald-600">{v != null ? `${v} AQI` : '—'}</p>
        <p className={`text-xs mt-1 font-medium ${isNormal ? 'text-emerald-600' : 'text-amber-600'}`}>
          {isNormal ? '✓ Air Quality Normal' : `⚠ Exceeds Safe Threshold (${aqiThreshold} AQI)`}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Environmental Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live multi-metric time series: Temperature (°C), Humidity (% RH), and Air Quality (AQI)
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Shipment Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="shipment-selector" className="text-xs text-slate-500 font-medium">
              Shipment:
            </label>
            <select
              id="shipment-selector"
              value={selectedShipment}
              onChange={(e) => setSelectedShipment(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold cursor-pointer shadow-2xs"
            >
              <option value="VAX-001">VAX-001 (Live ESP32)</option>
              <option value="DEMO-001">DEMO-001 (Simulated)</option>
            </select>
          </div>

          {/* Time Range Filter Buttons (Inspired by Image 3 Tab selector) */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1 text-xs rounded-lg transition-all font-medium ${
                  range === r.value
                    ? 'bg-white text-blue-600 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { loadAll(); loadTemp(); }}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all shadow-2xs"
            title="Refresh Analytics"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Graph 1: Temperature (°C) */}
      <div className="clean-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Thermometer size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Temperature (°C) Time Series</h3>
                {isDemo ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    SIMULATED DEMO
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    LIVE ESP32
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Target Range: {tempMin}°C – {tempMax}°C · Monitored Consignment: {selectedShipment}</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200 font-mono">
            {chartData.length} Data Points
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-52 text-slate-400 text-sm">Loading temperature history...</div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-slate-400 text-sm gap-2">
            <Thermometer size={24} className="text-slate-300" />
            <span>
              {selectedShipment === 'VAX-001'
                ? `Waiting for initial ESP32 temperature readings for VAX-001 in range (${range})...`
                : `No simulated temperature readings found for DEMO-001 in range (${range}).`}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" unit="°C" domain={['auto', 'auto']} />
              <Tooltip content={<TempTooltip />} />
              <ReferenceLine y={tempMax} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `Max ${tempMax}°C`, fill: '#d97706', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={tempMin} stroke="#0284c7" strokeDasharray="4 4" label={{ value: `Min ${tempMin}°C`, fill: '#0284c7', fontSize: 10, position: 'right' }} />
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={chartData.length < 30 ? { r: 3, fill: '#2563eb' } : false}
                activeDot={{ r: 5, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                name="Temperature (°C)"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Graph 2: Humidity (% RH) */}
      <div className="clean-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <Droplets size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Humidity (% RH) Time Series</h3>
                {isDemo && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    SIMULATED DEMO
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Relative Humidity percentage · Target: 30%–70% RH</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 font-semibold border border-sky-200 font-mono">
            {chartData.length} Data Points (% RH)
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading humidity history...</div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
            <Droplets size={24} className="text-slate-300" />
            <span>
              {selectedShipment === 'VAX-001'
                ? `Waiting for initial ESP32 humidity readings for VAX-001 in range (${range})...`
                : `No simulated humidity readings found for DEMO-001 in range (${range}).`}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" domain={[0, 100]} unit="%" />
              <Tooltip content={<HumTooltip />} />
              <Line
                type="monotone"
                dataKey="humidity"
                stroke="#0284c7"
                strokeWidth={2.5}
                dot={chartData.length < 30 ? { r: 3, fill: '#0284c7' } : false}
                activeDot={{ r: 5, fill: '#0284c7', stroke: '#fff', strokeWidth: 2 }}
                name="Humidity (%)"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Graph 3: Air Quality (reported AQI) */}
      <div className="clean-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Wind size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Air Quality (Reported AQI) Time Series</h3>
                {isDemo ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    SIMULATED DEMO
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    LIVE SENSOR STREAM
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Gas & Particulate Index reported by sensor · Threshold: {aqiThreshold} AQI
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 font-mono">
            {chartData.length} Data Points (AQI)
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading air quality history...</div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
            <Wind size={24} className="text-slate-300" />
            <span>
              {selectedShipment === 'VAX-001'
                ? `Waiting for initial ESP32 air quality readings for VAX-001 in range (${range})...`
                : `No simulated air quality readings found for DEMO-001 in range (${range}).`}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" domain={['auto', 'auto']} unit=" AQI" />
              <Tooltip content={<AqiTooltip />} />
              <ReferenceLine
                y={aqiThreshold}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: `Alert Threshold: ${aqiThreshold} AQI`, fill: '#d97706', fontSize: 10, position: 'right' }}
              />
              <Line
                type="monotone"
                dataKey="air_quality_aqi"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={chartData.length < 30 ? { r: 3, fill: '#10b981' } : false}
                activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                name="Air Quality AQI"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom Insights: Excursion Duration & Risk Score Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Excursion duration by shipment */}
        <div className="clean-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock size={16} />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Excursion Duration by Shipment</h3>
          </div>
          {excursionData.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No excursions recorded yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={excursionData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="shipmentId" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="#e2e8f0" unit=" min" />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#0f172a', fontSize: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="totalDuration" name="Duration (min)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Risk score comparison */}
        <div className="clean-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <TrendingUp size={16} />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Viability Risk Score Index</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Calculated 0–100 risk rating based on thermal deviation, excursion duration, and exposure frequency
          </p>
          {riskData.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">Loading risk data...</div>
          ) : (
            <div className="space-y-3">
              {riskData.map(r => (
                <div key={r.shipmentId} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-700 w-24 flex-shrink-0 font-mono">{r.shipmentId}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        r.score >= 70 ? 'bg-rose-500' :
                        r.score >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${r.score}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-12 text-right ${
                    r.score >= 70 ? 'text-rose-600' :
                    r.score >= 40 ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {r.score}/100
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
