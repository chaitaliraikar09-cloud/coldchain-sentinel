import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Wifi, WifiOff, Bell, Clock, User, LogOut, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export default function TopNav({ onMenuClick }) {
  const { connected, connectionStatus, lastReadingTime, newAlertCount, simulatorStatus } = useApp();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString();
  };

  const statusConfig = {
    connected: { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'API Connected', Icon: Wifi },
    connecting: { color: 'text-amber-400', bg: 'bg-amber-500', label: 'Connecting...', Icon: Wifi },
    disconnected: { color: 'text-rose-400', bg: 'bg-rose-500', label: 'Disconnected', Icon: WifiOff },
  };
  const status = statusConfig[connectionStatus] || statusConfig.disconnected;

  return (
    <header className="flex items-center gap-4 px-6 py-3.5 bg-white border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex-shrink-0 z-10">
      {/* Menu toggle */}
      <button
        onClick={onMenuClick}
        className="text-slate-500 hover:text-slate-800 transition-colors p-2 rounded-xl hover:bg-slate-100"
        title="Toggle menu"
      >
        <Menu size={19} />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search shipments, checkpoints, telemetry..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-100/80 hover:bg-slate-100 border border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-slate-800 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 ml-auto">
        {/* Simulator indicator */}
        {simulatorStatus?.running && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200/70 text-purple-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-purple-500 status-pulse" />
            <span>Simulator Demo</span>
          </div>
        )}

        {/* Connection status */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
          connected ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' : 'bg-rose-50 text-rose-700 border-rose-200/80'
        }`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 status-pulse' : 'bg-rose-500'}`} />
          <span className="hidden sm:inline">{connected ? 'Live Connected' : 'Disconnected'}</span>
        </div>

        {/* Last reading timestamp */}
        {lastReadingTime && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/60">
            <Clock size={13} className="text-slate-400" />
            <span className="font-mono">{formatTime(lastReadingTime)}</span>
          </div>
        )}

        {/* Notification bell */}
        <button
          onClick={() => navigate('/alerts')}
          className="relative text-slate-500 hover:text-slate-800 transition-colors p-2 rounded-xl hover:bg-slate-100"
          title="Alerts"
        >
          <Bell size={19} />
          {newAlertCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 bg-rose-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold shadow-xs">
              {newAlertCount > 9 ? '9+' : newAlertCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(o => !o)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-700"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-xs">
              {user?.name?.[0] || 'A'}
            </div>
            <span className="text-xs font-semibold hidden sm:block text-slate-800">{user?.name}</span>
            <ChevronDown size={14} className="hidden sm:block text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-slide-in">
              <div className="p-3.5 border-b border-slate-100 bg-slate-50/50">
                <p className="text-xs font-bold text-slate-900">{user?.name || 'Administrator'}</p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email || 'admin@coldchain.demo'}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
