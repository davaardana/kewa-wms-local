import axios from 'axios';
import { normalizeEpc, normalizeEpcList } from './rfidContract';

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    if (window.location.port !== '5173') {
      return '/api';
    }
    if (window.location.hostname) {
      return `http://${window.location.hostname}:8000/api`;
    }
  }
  return 'http://127.0.0.1:8000/api';
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Attach token & track mutating requests
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  const method = (config.method || '').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !config.silentMutation) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mosa-mutation-start'));
    }
  }
  const token = localStorage.getItem('mosa_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response & 401 unauth / 403 forbidden / 500 server error
api.interceptors.response.use(
  (response) => {
    const method = (response.config?.method || '').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !response.config?.silentMutation) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mosa-mutation-end'));
      }
    }
    return response;
  },
  (error) => {
    const method = (error.config?.method || '').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !error.config?.silentMutation) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mosa-mutation-end'));
      }
    }

    const status = error.response?.status;

    if (status === 401) {
      localStorage.removeItem('mosa_token');
      localStorage.removeItem('mosa_user');
      if (typeof window !== 'undefined') window.location.reload();
    }

    if (status === 403) {
      const msg = error.response?.data?.message || 'Akses ditolak. Anda tidak memiliki izin untuk tindakan ini.';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mosa-toast', { detail: { message: msg, type: 'error' } }));
      }
    }

    if (status === 404 || status === 405) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mosa-http-error', {
          detail: { status },
        }));
      }
    }

    if (status >= 500) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mosa-toast', {
          detail: { message: 'Terjadi kesalahan server. Silakan coba lagi.', type: 'error' }
        }));
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  login:         (email, password) => api.post('/auth/login', { email, password }),
  me:            ()                => api.get('/auth/me'),
  updateProfile: (data)            => api.put('/auth/profile', data),
  changePassword:(data)            => api.put('/auth/password', data),
  logout:        ()                => api.post('/auth/logout'),
};

// ── WebSocket Control Ticket ──────────────────────────────────
export const wsControlApi = {
  issueTicket: (warehouseId, requestedCommands, deviceId, purpose) => api.post('/ws-control-ticket', {
    warehouse_id: Number(warehouseId),
    ...(deviceId ? { device_id: Number(deviceId) } : {}),
    ...(purpose ? { purpose } : {}),
    requested_commands: requestedCommands,
  }, { silentMutation: true }),
};

// ── User & Role Management ────────────────────────────────────
export const userApi = {
  getUsers:           (params)                      => api.get('/users', { params }),
  createUser:         (data)                        => api.post('/users', data),
  updateUser:         (id, data)                    => api.put(`/users/${id}`, data),
  deleteUser:         (id)                          => api.delete(`/users/${id}`),
  toggleStatus:       (id)                          => api.patch(`/users/${id}/toggle-status`),
  getRolesAndPermissions: ()                        => api.get('/roles-permissions'),
  createRole:         (data)                        => api.post('/roles', data),
  updateRole:         (id, data)                    => api.put(`/roles/${id}`, data),
  deleteRole:         (id)                          => api.delete(`/roles/${id}`),
  toggleRolePermission:(id, module_key, is_allowed) => api.patch(`/roles/${id}/toggle-permission`, { module_key, is_allowed }),
};

// ── Master Data (Gudang & Item) ───────────────────────────────
export const masterApi = {
  getWarehouses:   ()              => api.get('/warehouses'),
  createWarehouse: (data)          => api.post('/warehouses', data),
  updateWarehouse: (id, data)      => api.put(`/warehouses/${id}`, data),
  getItems:        ()              => api.get('/items'),
  createItem:      (data)          => api.post('/items', data),
};

// ── RFID Tags ─────────────────────────────────────────────────
export const tagApi = {
  getTags:        (params)         => api.get('/tags', { params }),
  reserveTags:    (data)           => api.post('/tags/reserve', data),
  enrollTags:     (data)           => api.post('/tags/enroll', {
    ...data,
    ...(data.epc ? { epc: normalizeEpc(data.epc) } : {}),
    ...(data.epc_list ? { epc_list: normalizeEpcList(data.epc_list) } : {}),
  }),
  getTag:         (epc)            => api.get(`/tags/${epc}`),
  updateStatus:   (epc, status, notes) => api.patch(`/tags/${normalizeEpc(epc)}/status`, { status, notes }),
  deleteTag:      (epc)            => api.delete(`/tags/${normalizeEpc(epc)}`),
  reactivateTag:  (epc)            => api.post(`/tags/${normalizeEpc(epc)}/reactivate`),
  bulkDeleteTags: (epcs)           => api.post('/tags/bulk-delete', { epcs: normalizeEpcList(epcs) }),
};

// ── Shipping Documents (core alur bisnis) ─────────────────────
// PM: buat, approve, cancel
// PIC: assign-tags, scan-tag, batch-scan, complete
export const shippingApi = {
  getDocuments:    (params)        => api.get('/shipping-documents', { params }),
  createDocument:  (data)          => api.post('/shipping-documents', data),
  getDocument:     (id)            => api.get(`/shipping-documents/${id}`),
  approveDocument: (id)            => api.post(`/shipping-documents/${id}/approve`),
  assignTags:      (id, tags)      => api.post(`/shipping-documents/${id}/assign-tags`, { tags }),
  scanTag:         (id, epc)       => api.post(`/shipping-documents/${id}/scan-tag`, { epc: normalizeEpc(epc) }),
  batchScanTags:   (id, epcs)      => api.post(`/shipping-documents/${id}/batch-scan`, { epcs: normalizeEpcList(epcs) }),
  completeDocument:(id)            => api.post(`/shipping-documents/${id}/complete`),
  cancelDocument:  (id)            => api.post(`/shipping-documents/${id}/cancel`),
};

// ── Gate Monitor (Live Feed & Event Logs) ─────────────────────
export const gateApi = {
  getLiveFeed:       (warehouseId)   => api.get('/gate/live-feed', { params: { warehouse_id: warehouseId } }),
  triggerGateEvent:  (payload)       => api.post('/gate/event', payload),
  deleteEvent:       (id)            => api.delete(`/gate/events/${id}`),
  clearHistory:      (warehouseId)   => api.delete('/gate/events', { params: { warehouse_id: warehouseId }, data: { warehouse_id: warehouseId } }),
};

// ── Device Management ─────────────────────────────────────────
export const devicesApi = {
  getDevices:      (params)        => api.get('/devices', { params }),
  pairDevice:      (data)          => api.post('/devices', data),
  updateDevice:    (id, data)      => api.put(`/devices/${id}`, data),
  deleteDevice:    (id)            => api.delete(`/devices/${id}`),
  testConnection:  (data)          => api.post('/devices/test-connection', data),
  getStatus:       ()              => api.get('/devices/status'),
  sendHeartbeat:   (data)          => api.post('/devices/heartbeat', data),
};

// ── File Upload ───────────────────────────────────────────────
export const uploadApi = {
  uploadFile: (file, folder = 'shipping_docs') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    return api.post('/upload', formData);
  },
};

// ── Reports & Audit Trail ─────────────────────────────────────
export const reportApi = {
  getStocks:           (params)              => api.get('/reports/stocks', { params }),
  getStockCard:        (params)              => api.get('/reports/stock-card', { params }),
  getAuditTrail:       (params)              => api.get('/reports/audit-trail', { params }),
  getDashboardKpis:    ()                    => api.get('/reports/dashboard-kpis'),
  reconcileStockOpname:(warehouseId, epcs)  => api.post('/reports/stock-opname', { warehouse_id: warehouseId, scanned_epcs: epcs }),
};

export default api;
