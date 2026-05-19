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

// ── Document upload helpers (Phase 6B) ──

export function requestUploadPresign({ filename, content_type, file_size, document_type }) {
  return api.post('/api/v1/documents/presign', { filename, content_type, file_size, document_type });
}

export function finalizeUpload({ document_id, file_size }) {
  return api.post('/api/v1/documents/finalize', { document_id, file_size });
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

export default api;
