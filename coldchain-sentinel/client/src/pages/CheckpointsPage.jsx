import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, CheckCircle, XCircle, Phone, Clock } from 'lucide-react';
import { checkpointsApi } from '../services/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createCheckpointIcon = (available) => L.divIcon({
  className: '',
  html: `<div style="
    width:26px;height:26px;border-radius:50%;
    background:${available ? '#10b981' : '#6b7280'};
    border:3px solid ${available ? '#34d399' : '#9ca3af'};
    box-shadow:0 0 8px ${available ? '#10b98166' : '#6b728066'};
    display:flex;align-items:center;justify-content:center;
    font-size:11px;
  ">📍</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

export default function CheckpointsPage() {
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    checkpointsApi.getAll().then(res => {
      setCheckpoints(res.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const available = checkpoints.filter(c => c.available).length;
  const unavailable = checkpoints.filter(c => !c.available).length;

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cold Storage Facilities & Checkpoints</h1>
        <p className="text-sm text-slate-500 mt-1">Verified cold storage checkpoints and contingency diversion points</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="clean-card p-5 text-center">
          <p className="text-3xl font-bold text-slate-900">{checkpoints.length}</p>
          <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">Total Checkpoints</p>
        </div>
        <div className="clean-card p-5 text-center bg-emerald-50/40">
          <p className="text-3xl font-bold text-emerald-600">{available}</p>
          <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">Available</p>
        </div>
        <div className="clean-card p-5 text-center bg-slate-50">
          <p className="text-3xl font-bold text-slate-600">{unavailable}</p>
          <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">Unavailable</p>
        </div>
      </div>

      {/* Map */}
      <div className="clean-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Checkpoint Geographic Locations</h3>
            <p className="text-xs text-slate-500 mt-0.5">Green = Ready / Available Storage · Grey = Full or Inactive</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
            {checkpoints.length} Registered Checkpoints
          </span>
        </div>
        <div style={{ height: '360px' }} className="p-3 bg-slate-50">
          {!loading && checkpoints.length > 0 ? (
            <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%', width: '100%', borderRadius: '12px' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {checkpoints.map(cp => (
                <Marker key={cp.id} position={[cp.latitude, cp.longitude]} icon={createCheckpointIcon(cp.available)}>
                  <Popup>
                    <div className="p-1 text-slate-800">
                      <p className="font-bold text-sm mb-1">{cp.name}</p>
                      <p className="text-xs text-slate-500">{cp.address}</p>
                      <div className="mt-2 space-y-0.5 text-xs">
                        <p><strong>Status:</strong> <span className={cp.available ? 'text-emerald-600 font-semibold' : 'text-slate-500 font-semibold'}>{cp.available ? 'Available' : 'Unavailable'}</span></p>
                        <p><strong>Capacity:</strong> {cp.capacity} units</p>
                        <p><strong>Contact:</strong> {cp.contact}</p>
                        {cp.operatingHours && <p><strong>Hours:</strong> {cp.operatingHours}</p>}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading checkpoint coordinates...</div>
          )}
        </div>
      </div>

      {/* Checkpoint table */}
      <div className="clean-card overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">All Registered Checkpoints</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Type</th>
                <th>Status</th>
                <th>Capacity</th>
                <th>Hours</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map(cp => (
                <tr key={cp.id} className="hover:bg-slate-50/80 transition-colors">
                  <td>
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className={cp.available ? 'text-emerald-600' : 'text-slate-400'} />
                      <span className="font-bold text-slate-900 text-xs">{cp.name}</span>
                    </div>
                  </td>
                  <td className="text-xs text-slate-500 max-w-56 truncate">{cp.address}</td>
                  <td>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">{cp.type}</span>
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      cp.available ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {cp.available ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {cp.available ? 'Available' : 'Unavailable'}
                    </span>
                  </td>
                  <td className="text-xs text-slate-700 font-semibold">{cp.capacity} units</td>
                  <td className="text-xs text-slate-500">{cp.operatingHours || '—'}</td>
                  <td className="text-xs text-slate-600 font-mono">{cp.contact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
