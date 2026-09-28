import axios from 'axios';

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

// Handle response & 401 unauth
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
    if (error.response?.status === 401) {
      localStorage.removeItem('mosa_token');
      localStorage.removeItem('mosa_user');
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/password', data),
  logout: () => api.post('/auth/logout'),
};

export const wsControlApi = {
  issueTicket: (warehouseId, requestedCommands, deviceId, purpose) => api.post('/ws-control-ticket', {
    warehouse_id: Number(warehouseId),
    ...(deviceId ? { device_id: Number(deviceId) } : {}),
    ...(purpose ? { purpose } : {}),
    requested_commands: requestedCommands,
  }, { silentMutation: true }),
};

export const userApi = {
  getUsers: (params) => api.get('/users', { params }),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  toggleStatus: (id) => api.patch(`/users/${id}/toggle-status`),
  getRolesAndPermissions: () => api.get('/roles-permissions'),
  createRole: (data) => api.post('/roles', data),
  updateRole: (id, data) => api.put(`/roles/${id}`, data),
  deleteRole: (id) => api.delete(`/roles/${id}`),
  toggleRolePermission: (id, module_key, is_allowed) => api.patch(`/roles/${id}/toggle-permission`, { module_key, is_allowed }),
};

export const masterApi = {
  getPrincipals: () => api.get('/principals'),
  createPrincipal: (data) => api.post('/principals', data),
  getProjects: () => api.get('/projects'),
  createProject: (data) => api.post('/projects', data),
  getWarehouses: () => api.get('/warehouses'),
  createWarehouse: (data) => api.post('/warehouses', data),
  updateWarehouse: (id, data) => api.put(`/warehouses/${id}`, data),
  getItems: () => api.get('/items'),
  createItem: (data) => api.post('/items', data),
  getVehicles: () => api.get('/vehicles'),
  createVehicle: (data) => api.post('/vehicles', data),
};

export const tagApi = {
  getTags: (params) => api.get('/tags', { params }),
  reserveTags: (data) => api.post('/tags/reserve', data),
  enrollTags: (data) => api.post('/tags/enroll', data),
  getTag: (epc) => api.get(`/tags/${epc}`),
  updateStatus: (epc, status, notes) => api.patch(`/tags/${epc}/status`, { status, notes }),
  deleteTag: (epc) => api.delete(`/tags/${epc}`),
  reactivateTag: (epc) => api.post(`/tags/${epc}/reactivate`),
  bulkDeleteTags: (epcs) => api.post('/tags/bulk-delete', { epcs }),
};

export const spkApi = {
  getSpks: (params) => api.get('/spks', { params }),
  createSpk: (data) => api.post('/spks', data),
  getSpk: (id) => api.get(`/spks/${id}`),
  updatePaymentStatus: (id, data) => api.patch(`/spks/${id}/payment-status`, data),
};

export const deliveryApi = {
  getDeliveries: (params) => api.get('/deliveries', { params }),
  recordDispatchScan: (data) => api.post('/deliveries/dispatch-scan', data),
  recordReceivingScan: (id, data) => api.post(`/deliveries/${id}/receiving-scan`, data),
  approveDelivery: (id) => api.post(`/deliveries/${id}/approve`),
};

export const workOrderApi = {
  getWorkOrders: (params) => api.get('/work-orders', { params }),
  createWorkOrder: (data) => api.post('/work-orders', data),
  getWorkOrder: (id) => api.get(`/work-orders/${id}`),
  approveWorkOrder: (id) => api.post(`/work-orders/${id}/approve`),
  reportPrepared: (id, preparedItems, notes) => api.post(`/work-orders/${id}/report-prepared`, { prepared_items: preparedItems, notes }),
  reportInstalled: (id, data) => api.patch(`/work-orders/${id}/report-installed`, data),
};

export const gateApi = {
  getTransactions: (params) => api.get('/gate/transactions', { params }),
  requestGateSession: (data) => api.post('/gate/transactions', data),
  approveTransaction: (id) => api.post(`/gate/transactions/${id}/approve`),
  rejectTransaction: (id, rejection_reason) => api.post(`/gate/transactions/${id}/reject`, { rejection_reason }),
  cancelTransaction: (id, reason) => api.post(`/gate/transactions/${id}/cancel`, { reason }),
  finalizePartial: (id, notes) => api.post(`/gate/transactions/${id}/finalize-partial`, { notes }),
  adjustItems: (id, items) => api.post(`/gate/transactions/${id}/adjust-items`, { items }),
  getLiveFeed: (warehouseId) => api.get('/gate/live-feed', { params: { warehouse_id: warehouseId } }),
  triggerGateEvent: (data) => api.post('/gate/event', data),
  deleteEvent: (id) => api.delete(`/gate/events/${id}`),
  clearHistory: (warehouseId) => api.delete('/gate/events', { params: { warehouse_id: warehouseId }, data: { warehouse_id: warehouseId } }),
};

export const returnApi = {
  requestReturn: (data) => api.post('/returns/request', data),
  verifyReturn: (txId, data) => api.post(`/returns/${txId}/verify`, data),
};

export const reportApi = {
  getStocks: (params) => api.get('/reports/stocks', { params }),
  getStockCard: (params) => api.get('/reports/stock-card', { params }),
  getAuditTrail: (params) => api.get('/reports/audit-trail', { params }),
  getDashboardKpis: () => api.get('/reports/dashboard-kpis'),
  reconcileStockOpname: (warehouseId, scannedEpcs) => api.post('/reports/stock-opname', { warehouse_id: warehouseId, scanned_epcs: scannedEpcs }),
};

export const uploadApi = {
  uploadFile: (file, folder = 'delivery_proofs') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    return api.post('/upload', formData);
  },
};

export const approvalApi = {
  getRequests: (params) => api.get('/approvals', { params }),
  getRequest: (id) => api.get(`/approvals/${id}`),
  processAction: (id, data) => api.post(`/approvals/${id}/action`, data),
  getTemplates: () => api.get('/approval-templates'),
  createTemplate: (data) => api.post('/approval-templates', data),
  updateTemplate: (id, data) => api.put(`/approval-templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/approval-templates/${id}`),
  getConfigs: () => api.get('/approval-configs'),
  saveConfig: (data) => api.post('/approval-configs', data),
  deleteConfig: (id) => api.delete(`/approval-configs/${id}`),
};

export const devicesApi = {
  getDevices: (params) => api.get('/devices', { params }),
  pairDevice: (data) => api.post('/devices', data),
  updateDevice: (id, data) => api.put(`/devices/${id}`, data),
  deleteDevice: (id) => api.delete(`/devices/${id}`),
  testConnection: (data) => api.post('/devices/test-connection', data),
  getStatus: () => api.get('/devices/status'),
  sendHeartbeat: (data) => api.post('/devices/heartbeat', data),
};

export default api;
