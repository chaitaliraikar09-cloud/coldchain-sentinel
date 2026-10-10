import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { connectSocket, getSocket } from '../services/socket';
import { shipmentsApi, alertsApi, analyticsApi } from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected' | 'connecting' | 'disconnected'
  const [shipments, setShipments] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [latestReadings, setLatestReadings] = useState({});
  const [overview, setOverview] = useState(null);
  const [simulatorStatus, setSimulatorStatus] = useState({ running: false });
  const [esp32Status, setEsp32Status] = useState({ connected: false });
  const [lastReadingTime, setLastReadingTime] = useState(null);
  const [readingCount, setReadingCount] = useState(0);
  const [newAlertCount, setNewAlertCount] = useState(0);

  // Load initial state from REST API
  const loadInitialState = useCallback(async () => {
    try {
      const [shipmentsRes, alertsRes, overviewRes] = await Promise.allSettled([
        shipmentsApi.getAll(),
        alertsApi.getAll({ status: 'ACTIVE' }),
        analyticsApi.getOverview(),
      ]);
      if (shipmentsRes.status === 'fulfilled') setShipments(shipmentsRes.value.data || []);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data || []);
      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value.data || null);
    } catch (err) {
      console.error('[context] Failed to load initial state:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialState();

    const socket = connectSocket();
    setConnectionStatus('connecting');

    socket.on('connect', () => {
      setConnected(true);
      setConnectionStatus('connected');
      // Request full state snapshot on (re)connect to recover missed events
      socket.emit('request:state');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('state:snapshot', ({ shipments: s, alerts: a, latestReadings: lr }) => {
      if (s) setShipments(s);
      if (a) setAlerts(a);
      if (lr) {
        const map = {};
        lr.forEach(r => { map[r.shipmentId] = r; });
        setLatestReadings(map);
      }
    });

    socket.on('reading:new', ({ reading }) => {
      const shipId = reading.shipmentId || reading.shipment_id;
      setLatestReadings(prev => ({ ...prev, [shipId]: reading }));
      setShipments(prev => prev.map(s => s.id === shipId ? { ...s, latestReading: reading, lastUpdated: reading.serverReceivedAt } : s));
      setLastReadingTime(reading.serverReceivedAt);
      setReadingCount(c => c + 1);
    });

    socket.on('shipment:updated', ({ shipment }) => {
      setShipments(prev => prev.map(s => s.id === shipment.id ? { ...s, ...shipment } : s));
    });

    socket.on('alert:new', (alert) => {
      setAlerts(prev => {
        const exists = prev.find(a => a.id === alert.id);
        if (exists) return prev;
        return [alert, ...prev];
      });
      setNewAlertCount(c => c + 1);
      // Reload overview
      analyticsApi.getOverview().then(r => setOverview(r.data)).catch(() => {});
    });

    socket.on('alert:updated', (alert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
    });

    socket.on('esp32:status', (status) => {
      setEsp32Status(status);
    });

    socket.on('system:status', (status) => {
      if (status.esp32) setEsp32Status(prev => ({ ...prev, ...status.esp32 }));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('state:snapshot');
      socket.off('reading:new');
      socket.off('shipment:updated');
      socket.off('alert:new');
      socket.off('alert:updated');
      socket.off('esp32:status');
      socket.off('system:status');
    };
  }, [loadInitialState]);

  const clearNewAlertCount = () => setNewAlertCount(0);

  return (
    <AppContext.Provider value={{
      connected, connectionStatus,
      shipments, setShipments,
      alerts, setAlerts,
      latestReadings,
      overview, setOverview,
      simulatorStatus, setSimulatorStatus,
      esp32Status, setEsp32Status,
      lastReadingTime,
      readingCount,
      newAlertCount, clearNewAlertCount,
      loadInitialState,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
