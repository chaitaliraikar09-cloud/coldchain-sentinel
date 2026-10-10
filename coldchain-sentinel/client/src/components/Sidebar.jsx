import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Truck, BarChart3, AlertTriangle,
  MapPin, Database, Settings, Thermometer, ChevronLeft, ChevronRight, LogOut, Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

const NAV_ITEMS = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/shipments', label: 'Live Shipments', icon: Truck },
  { path: '/analytics', label: 'Temperature Analytics', icon: BarChart3 },
  { path: '/alerts', label: 'Alerts & Incidents', icon: AlertTriangle },
  { path: '/checkpoints', label: 'Checkpoints', icon: MapPin },
  { path: '/sensor-data', label: 'Sensor Data', icon: Database },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ open, onToggle }) {
  const { logout, user } = useAuth();
  const { newAlertCount, clearNewAlertCount } = useApp();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className="flex flex-col transition-all duration-300 ease-in-out bg-white border-r border-slate-200/80 shadow-[1px_0_4px_rgba(0,0,0,0.02)]"
      style={{
        width: open ? '250px' : '72px',
        minHeight: '100vh',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center px-4 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-500/20 text-white">
            <Thermometer size={20} className="text-white" />
          </div>
          {open && (
            <div className="overflow-hidden">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">ColdChain</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60">
                  LIVE
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 whitespace-nowrap">Sentinel Monitor</p>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="ml-auto text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            onClick={() => { if (path === '/alerts') clearNewAlertCount(); }}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 group relative ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
              }`
            }
          >
            <Icon size={19} className="flex-shrink-0" />
            {open && (
              <span className="text-sm whitespace-nowrap tracking-tight">{label}</span>
            )}
            {/* Alert badge */}
            {path === '/alerts' && newAlertCount > 0 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[11px] rounded-full flex items-center justify-center font-bold shadow-xs">
                {newAlertCount > 9 ? '9+' : newAlertCount}
              </span>
            )}
            {/* Tooltip when collapsed */}
            {!open && (
              <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity shadow-md">
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-100 p-3 bg-slate-50/50">
        {open ? (
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white font-semibold text-xs shadow-xs">
              {user?.name?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">{user?.name || 'Administrator'}</p>
              <p className="text-[11px] text-slate-500 truncate">{user?.role || 'Admin User'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors p-1.5 rounded-lg"
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center p-2.5 text-slate-400 hover:text-rose-600 transition-colors rounded-xl hover:bg-rose-50 group relative"
            title="Logout"
          >
            <LogOut size={18} />
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity shadow-md">
              Logout
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
