import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.error || err.message || 'API error';
    return Promise.reject(new Error(message));
  }
);

export const healthApi = {
  getHealth: () => api.get('/health'),
  getRootHealth: () => axios.get('http://localhost:5001/health').then(r => r.data),
  getStatus: () => api.get('/status'),
  setDataSource: (source) => api.post('/status/datasource', { source }),
  setEsp32Host: (host, port) => api.post('/status/esp32-host', { host, port }),
};

export const shipmentsApi = {
  getAll: () => api.get('/shipments'),
  getById: (id) => api.get(`/shipments/${id}`),
  getHistory: (id, limit = 200) => api.get(`/shipments/${id}/history?limit=${limit}`),
  create: (data) => api.post('/shipments', data),
  update: (id, data) => api.patch(`/shipments/${id}`, data),
  verify: (id, data) => api.post(`/shipments/${id}/verify`, data),
};

export const reportsApi = {
  getAll: (params = {}) => api.get('/reports', { params }),
  generate: (data) => api.post('/reports/generate', data),
  getDownloadUrl: (id) => `${API_BASE}/reports/${id}/download`,
  download: (id) => {
    window.open(`${API_BASE}/reports/${id}/download`, '_blank');
  },
};

export const readingsApi = {
  getAll: (params = {}) => api.get('/readings', { params }),
  getLatest: (shipmentId) => api.get('/readings/latest', { params: shipmentId ? { shipmentId } : {} }),
  getById: (id) => api.get(`/readings/${id}`),
  postReading: (data, deviceKey) => api.post('/readings', data, {
    headers: { 'x-device-key': deviceKey || 'change-this-development-key' },
  }),
};

export const alertsApi = {
  getAll: (params = {}) => api.get('/alerts', { params }),
  getSummary: () => api.get('/alerts/summary'),
  getById: (id) => api.get(`/alerts/${id}`),
  acknowledge: (id, data) => api.patch(`/alerts/${id}/acknowledge`, data),
  resolve: (id, data) => api.patch(`/alerts/${id}/resolve`, data),
};

export const checkpointsApi = {
  getAll: () => api.get('/checkpoints'),
  getNearest: (shipmentId) => api.get(`/checkpoints/nearest?shipmentId=${shipmentId}`),
  getById: (id) => api.get(`/checkpoints/${id}`),
  create: (data) => api.post('/checkpoints', data),
  update: (id, data) => api.patch(`/checkpoints/${id}`, data),
};

export const analyticsApi = {
  getOverview: () => api.get('/analytics/overview'),
  getTemperature: (params = {}) => api.get('/analytics/temperature', { params }),
  getExcursions: () => api.get('/analytics/excursions'),
  getRisk: () => api.get('/analytics/risk'),
};

export const simulatorApi = {
  getStatus: () => api.get('/simulator/status'),
  start: (intervalMs) => api.post('/simulator/start', { intervalMs }),
  stop: () => api.post('/simulator/stop'),
  reset: () => api.post('/simulator/reset'),
  injectExcursion: (shipmentId, type) => api.post('/simulator/inject-excursion', { shipmentId, type }),
};

export default api;
