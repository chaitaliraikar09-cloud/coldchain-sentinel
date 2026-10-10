import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Thermometer, AlertTriangle, ArrowRight, RefreshCw, ChevronUp, ChevronDown, Wifi, Activity } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { simulatorApi, healthApi } from '../services/api';
import { getSocket } from '../services/socket';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createShipmentIcon = (excursionActive, isVax) => L.divIcon({
  className: '',
  html: `<div style="
    width: 28px; height: 28px; border-radius: 50%;
    background: ${excursionActive ? '#fb7185' : (isVax ? '#22d3ee' : '#a855f7')};
    border: 3px solid ${excursionActive ? '#f43f5e' : (isVax ? '#06b6d4' : '#9333ea')};
    box-shadow: 0 0 10px ${excursionActive ? '#fb718566' : (isVax ? '#22d3ee66' : '#a855f766')};
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; color: white; font-weight: bold;
  ">${isVax ? '📡' : '🚚'}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function ShipmentsPage() {
  const { shipments } = useApp();
  const [esp32Status, setEsp32Status] = useState({ connected: false, reachable: false, receivingData: false, isStale: false });
  const [sortField, setSortField] = useState('id');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    healthApi.getStatus().then(res => {
      if (res.data?.esp32) setEsp32Status(res.data.esp32);
    }).catch(() => {});

    const socket = getSocket();
    const handleEsp32 = (status) => setEsp32Status(status);
    socket.on('esp32:status', handleEsp32);
    return () => socket.off('esp32:status', handleEsp32);
  }, []);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // Strictly filter to exactly the two allowed shipments
  const activeShipments = shipments.filter(s => s.id === 'VAX-001' || s.id === 'DEMO-001');

  const sorted = [...activeShipments].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const mapShipments = activeShipments.filter(s => s.latestReading?.latitude && s.latestReading?.longitude);

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  // Connection badge for VAX-001
  const getVaxConnectionState = () => {
    if (esp32Status.receivingData) return { label: 'Connected', color: 'emerald', pulse: true };
    if (esp32Status.isStale || (esp32Status.reachable && !esp32Status.receivingData)) {
      return { label: 'Stale / Awaiting Telemetry', color: 'amber', pulse: false };
    }
    return { label: 'Disconnected', color: 'rose', pulse: false };
  };

  const vaxConn = getVaxConnectionState();

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Shipments</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tracking 2 Active Consignments: VAX-001 (Live ESP32 Wi-Fi) and DEMO-001 (Simulated Demo)
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`px-3.5 py-1.5 text-xs rounded-full flex items-center gap-2 font-mono font-medium border ${
            vaxConn.color === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            vaxConn.color === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700' :
            'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              vaxConn.color === 'emerald' ? 'bg-emerald-500 status-pulse' :
              vaxConn.color === 'amber' ? 'bg-amber-500' : 'bg-rose-500'
            }`} />
            VAX-001 (10.168.234.195): {vaxConn.label}
          </span>
          <span className="px-3 py-1.5 text-xs bg-slate-100 border border-slate-200 text-slate-700 rounded-full font-mono font-medium">
            DEMO-001: 🤖 Simulated
          </span>
        </div>
      </div>

      {/* Live map */}
      <div className="clean-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Consignment GPS Positions</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live geographic visualization · VAX-001 streamed from ESP32 · DEMO-001 simulated route
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
            {mapShipments.length} Active Nodes on Map
          </span>
        </div>
        <div style={{ height: '340px' }} className="p-3 bg-slate-50">
          {mapShipments.length > 0 ? (
            <MapContainer
              center={[19.0760, 72.8777]}
              zoom={11}
              style={{ height: '100%', width: '100%', borderRadius: '12px' }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mapShipments.map(s => {
                const isVax = s.id === 'VAX-001';
                return (
                  <Marker
                    key={s.id}
                    position={[s.latestReading.latitude, s.latestReading.longitude]}
                    icon={createShipmentIcon(s.excursionActive, isVax)}
                  >
                    <Popup>
                      <div className="text-slate-800 p-1">
                        <p className="font-bold text-sm flex items-center gap-1.5">
                          {s.id}
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${isVax ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
                            {isVax ? 'LIVE ESP32' : 'SIMULATED DEMO'}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600 mt-1">{s.product}</p>
                        <div className="mt-2 space-y-0.5 text-xs">
                          <p>Temp: <strong className="font-mono">{s.latestReading?.temperature?.toFixed(1)}°C</strong></p>
                          <p>Humidity: <strong className="font-mono">{s.latestReading?.humidity != null ? `${s.latestReading.humidity.toFixed(1)}%` : '—'}</strong></p>
                          <p>Air Quality: <strong className="font-mono">{s.latestReading?.air_quality_aqi != null ? `${s.latestReading.air_quality_aqi} AQI` : '—'}</strong></p>
                          <p>Status: <strong className={s.excursionActive ? 'text-rose-600' : 'text-emerald-600'}>{s.excursionActive ? 'EXCURSION' : 'NORMAL'}</strong></p>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">
                          {isVax ? `Hardware Node: ${s.nodeIp || '10.168.234.195'}` : 'Simulated demonstration coordinates'}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
              <Activity size={24} className="text-slate-300" />
              <span>Awaiting GPS coordinates for shipments...</span>
            </div>
          )}
        </div>
      </div>

      {/* Shipments table */}
      <div className="clean-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Monitored Shipments (2 Active Records)</h3>
            <p className="text-xs text-slate-500 mt-0.5">VAX-001 (Live ESP32 telemetry) and DEMO-001 (Simulated Demo)</p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200 font-mono">
            {sorted.length} Records
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                {[
                  { key: 'id', label: 'ID' },
                  { key: 'product', label: 'Product' },
                  { key: 'origin', label: 'Route' },
                  { key: null, label: 'Temperature' },
                  { key: null, label: 'Humidity' },
                  { key: null, label: 'Air Quality (AQI)' },
                  { key: null, label: 'Status' },
                  { key: 'riskScore', label: 'Risk' },
                  { key: null, label: 'Connection / Source' },
                  { key: 'lastUpdated', label: 'Last Update' },
                  { key: null, label: 'Action' },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && handleSort(key)}
                    className={key ? 'cursor-pointer hover:text-slate-900 transition-colors' : ''}
                  >
                    <span className="flex items-center gap-1">{label}{key && <SortIcon field={key} />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const temp = s.latestReading?.temperature;
                const aqi = s.latestReading?.air_quality_aqi != null ? s.latestReading.air_quality_aqi : s.latestReading?.airQualityAqi;
                const isVax = s.id === 'VAX-001';
                const isStale = isVax && (esp32Status.isStale || (!esp32Status.reachable && !esp32Status.receivingData));
                return (
                  <tr key={s.id} className={`hover:bg-slate-50/80 transition-colors ${isVax ? 'bg-blue-50/20' : ''}`}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-900 font-bold">{s.id}</span>
                        {isVax ? (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold tracking-wide">
                            LIVE ESP32
                          </span>
                        ) : (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold tracking-wide">
                            SIMULATED
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        <p className="text-slate-900 font-semibold text-xs">{s.product}</p>
                        <p className="text-slate-400 text-[10px]">{s.batchNumber}</p>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs text-slate-600">
                        <p className="font-medium">{s.origin?.slice(0, 18)}</p>
                        <p className="text-slate-400">→ {s.destination?.slice(0, 18)}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`font-mono text-sm font-bold ${
                        temp == null ? 'text-slate-400' :
                        isStale ? 'text-amber-600' :
                        s.excursionActive ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {temp != null ? `${temp.toFixed(1)}°C` : '—'}
                      </span>
                    </td>
                    <td className="text-xs text-slate-700 font-mono font-medium">
                      {s.latestReading?.humidity != null ? `${s.latestReading.humidity.toFixed(1)}%` : '—'}
                    </td>
                    <td>
                      <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                        aqi == null ? 'text-slate-400' :
                        aqi > 100 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {aqi != null ? `${aqi} AQI` : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        !s.latestReading ? 'bg-slate-100 text-slate-600' :
                        isStale ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        s.excursionActive ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          !s.latestReading ? 'bg-slate-400' :
                          isStale ? 'bg-amber-500' :
                          s.excursionActive ? 'bg-rose-500 status-pulse' : 'bg-emerald-500'
                        }`} />
                        {!s.latestReading ? 'AWAITING' : isStale ? 'STALE' : s.excursionActive ? 'EXCURSION' : 'NORMAL'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              s.riskScore >= 70 ? 'bg-rose-500' :
                              s.riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${s.riskScore || 0}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${
                          s.riskScore >= 70 ? 'text-rose-600' :
                          s.riskScore >= 40 ? 'text-amber-600' : 'text-emerald-600'
                        }`}>{s.riskScore ?? 0}</span>
                      </div>
                    </td>
                    <td>
                      {isVax ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${
                            vaxConn.color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            vaxConn.color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {vaxConn.label}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">10.168.234.195</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 w-fit">
                            🤖 DEMO
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">Simulated</span>
                        </div>
                      )}
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
