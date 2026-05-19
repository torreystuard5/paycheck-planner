import { createContext, useContext, useEffect, useState } from 'react';
import api, { onTosRequired, setMaintenanceModeForced, MAINTENANCE_MODE_DETAIL } from '../services/api';

function isMaintenance503(err) {
  return (
    err?.response?.status === 503 &&
    err?.response?.data?.detail === MAINTENANCE_MODE_DETAIL
  );
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tosRequired, setTosRequired] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    onTosRequired((version) => {
      setTosRequired(version);
    });
  }, []);

  const fetchSubscription = async () => {
    try {
      const { data } = await api.get('/api/v1/subscriptions/status');
      setSubscription(data);
    } catch {
      // not critical
    }
  };

  const clearTosRequired = async () => {
    setTosRequired(null);
    try {
      const { data } = await api.get('/api/v1/auth/me');
      setUser(data);
    } catch {
      // ignore
    }
    // Force a re-render of all pages so they refetch data
    window.location.href = '/dashboard';
  };

  useEffect(() => {
    const init = async () => {
      // Version gate — force re-login when backend version changes
      try {
        const { data: vData } = await api.get('/api/v1/version');
        const serverVersion = vData?.version;
        const localVersion = localStorage.getItem('app_version');
        if (serverVersion && serverVersion !== localVersion) {
          localStorage.setItem('app_version', serverVersion);
          const hadToken = !!localStorage.getItem('access_token');
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          if (hadToken) {
            setLoading(false);
            return; // will show login since isAuthenticated is false
          }
        }
      } catch {
        // version endpoint unreachable — continue normally
      }

      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const { data } = await api.get('/api/v1/auth/me');
          setUser({ ...data, app_mode: data.app_mode || 'personal' });
          setIsAuthenticated(true);
          if (data.is_admin) {
            setMaintenanceModeForced(false);
          }
          if (!data.tos_version || data.tos_version < '1.0') {
            setTosRequired('1.0');
          }
        } catch (err) {
          if (isMaintenance503(err)) {
            // Keep session; maintenance overlay is set by the API interceptor.
            setUser(null);
            setIsAuthenticated(false);
          } else {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            setUser(null);
            setIsAuthenticated(false);
          }
        }
        try {
          await fetchSubscription();
        } catch {
          // optional — must not clear session (e.g. maintenance 503 for non-subscription paths)
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/api/v1/auth/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);

    const me = await api.get('/api/v1/auth/me');
    setUser({ ...me.data, app_mode: me.data.app_mode || 'personal' });
    setIsAuthenticated(true);
    if (me.data.is_admin) {
      setMaintenanceModeForced(false);
    }
    try {
      await fetchSubscription();
    } catch {
      /* ignore */
    }
    return me.data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/api/v1/auth/register', payload);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    const me = await api.get('/api/v1/auth/me');
    setUser({ ...me.data, app_mode: me.data.app_mode || 'personal' });
    setIsAuthenticated(true);
    if (me.data.is_admin) {
      setMaintenanceModeForced(false);
    }
    try {
      await fetchSubscription();
    } catch {
      /* ignore */
    }
    return me.data;
  };

  const logout = () => {
    api.post('/api/v1/auth/logout').catch(() => {});
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('active_budget_id');
    setUser(null);
    setIsAuthenticated(false);
    setSubscription(null);
  };

  const refreshToken = async () => {
    const rt = localStorage.getItem('refresh_token');
    if (!rt) return;
    const { data } = await api.post('/api/v1/auth/refresh', null, {
      params: { refresh_token: rt },
    });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
  };

  const updateUser = (updated) => setUser(updated ? { ...updated, app_mode: updated.app_mode || 'personal' } : updated);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        login,
        register,
        logout,
        refreshToken,
        tosRequired,
        clearTosRequired,
        subscription,
        fetchSubscription,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
