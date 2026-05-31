import axios from 'axios';

/** Production API when VITE_API_URL is unset (e.g. misconfigured local build). */
const FALLBACK_API_BASE = 'https://paydrift-api.onrender.com';

let baseURL = (import.meta.env.VITE_API_URL || '').trim() || FALLBACK_API_BASE;
// Prevent mixed-content errors: upgrade http to https in production
if (baseURL.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:') {
  baseURL = baseURL.replace('http://', 'https://');
}

const api = axios.create({
  baseURL,
});

/** Absolute API URL (avoids axios baseURL + path merge dropping `/upload`). */
export function apiUrl(path) {
  const root = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '') || FALLBACK_API_BASE;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}${suffix}`;
}

const multipartConfig = {
  // Let the browser set Content-Type with boundary (required for multipart).
  headers: { 'Content-Type': undefined },
};

// TOS required state — shared globally
let tosRequiredCallback = null;
export function onTosRequired(cb) {
  tosRequiredCallback = cb;
}

/** Must match FastAPI JSONResponse `detail` for maintenance lockout (see backend `maintenance_mode_middleware`). */
export const MAINTENANCE_MODE_DETAIL =
  'System is under maintenance. Please try again later.';

// Maintenance mode state — shared globally
let maintenanceCallback = null;
export function onMaintenanceMode(cb) {
  maintenanceCallback = cb;
}

// Business trial / upgrade prompts
let businessGateCallback = null;
export function onBusinessGate(cb) {
  businessGateCallback = cb;
}

function _businessGateDetail(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const code = detail.code;
  if (
    code === 'business_trial_expired' ||
    code === 'business_upgrade_required' ||
    code === 'business_permission_denied'
  ) {
    return code;
  }
  return null;
}

/** Clear or set the global maintenance UI flag (e.g. after /auth/me confirms an admin). */
export function setMaintenanceModeForced(value) {
  if (maintenanceCallback) maintenanceCallback(!!value);
}

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — attempt silent refresh, then redirect on failure
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Intercept 503 maintenance mode responses (ignore unrelated 503s)
    if (
      error.response?.status === 503 &&
      error.response?.data?.detail === MAINTENANCE_MODE_DETAIL &&
      maintenanceCallback
    ) {
      maintenanceCallback(true);
      return Promise.reject(error);
    }

    // Intercept TOS-required 403 responses
    if (
      error.response?.status === 403 &&
      error.response?.data?.detail === 'tos_required' &&
      tosRequiredCallback
    ) {
      tosRequiredCallback(error.response.data.version);
      return Promise.reject(error);
    }

    const bizCode = _businessGateDetail(error.response?.data?.detail);
    if (error.response?.status === 403 && bizCode && businessGateCallback) {
      businessGateCallback(bizCode);
    }

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch(Promise.reject);
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/api/v1/auth/refresh`,
          null,
          { params: { refresh_token: refreshToken } }
        );
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        processQueue(null, data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Document upload helpers (server-side upload is the primary production path) ──

/** Server-side upload (API → R2). Preferred over presign; no bucket CORS required. */
export function uploadDocumentFile(file, document_type) {
  const form = new FormData();
  form.append('file', file);
  form.append('document_type', document_type);
  return api.post(apiUrl('/api/v1/documents/upload'), form, multipartConfig);
}

export function listDocuments(params = {}) {
  return api.get('/api/v1/documents', { params });
}

export function getDocument(id) {
  return api.get(`/api/v1/documents/${id}`);
}

export function deleteDocument(id) {
  return api.delete(`/api/v1/documents/${id}`);
}

export function linkDocument(id, { entity_type, entity_id }) {
  return api.post(`/api/v1/documents/${id}/link`, { entity_type, entity_id });
}

export function createBillFromOcr(id, body = {}) {
  return api.post(`/api/v1/documents/${id}/create-bill-from-ocr`, body);
}

// Business document uploads (same R2 flow, owner-scoped)
export function uploadBusinessDocumentFile(file, document_type) {
  const form = new FormData();
  form.append('file', file);
  form.append('document_type', document_type);
  return api.post(apiUrl('/api/v1/business/documents/upload'), form, multipartConfig);
}

export function listBusinessDocuments(params = {}) {
  return api.get('/api/v1/business/documents', { params });
}

export function getBusinessDocument(id) {
  return api.get(`/api/v1/business/documents/${id}`);
}

export function deleteBusinessDocument(id) {
  return api.delete(`/api/v1/business/documents/${id}`);
}

export function linkBusinessDocument(id, { entity_type, entity_id }) {
  return api.post(`/api/v1/business/documents/${id}/link`, { entity_type, entity_id });
}

export function confirmPaystubFromDocument(id, body) {
  return api.post(`/api/v1/documents/${id}/confirm-paystub`, body);
}

export default api;
