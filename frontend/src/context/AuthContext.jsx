import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { onTosRequired } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tosRequired, setTosRequired] = useState(null);

  useEffect(() => {
    onTosRequired((version) => {
      setTosRequired(version);
    });
  }, []);

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
    const token = localStorage.getItem('access_token');
    if (token) {
      api
        .get('/api/v1/auth/me')
        .then(({ data }) => {
          setUser(data);
          setIsAuthenticated(true);
          // Check if user needs to accept TOS
          if (!data.tos_version || data.tos_version < '1.0') {
            setTosRequired('1.0');
          }
        })
        .catch(() => {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setUser(null);
          setIsAuthenticated(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/api/v1/auth/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    const me = await api.get('/api/v1/auth/me');
    setUser(me.data);
    setIsAuthenticated(true);
    return me.data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/api/v1/auth/register', payload);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    const me = await api.get('/api/v1/auth/me');
    setUser(me.data);
    setIsAuthenticated(true);
    return me.data;
  };

  const logout = () => {
    api.post('/api/v1/auth/logout').catch(() => {});
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setIsAuthenticated(false);
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

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated, login, register, logout, refreshToken, tosRequired, clearTosRequired }}
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
