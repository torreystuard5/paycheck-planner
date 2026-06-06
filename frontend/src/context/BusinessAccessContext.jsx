import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const BusinessAccessContext = createContext(null);

/** In-flight dedupe so parallel refresh() calls share one request. */
let accessInflight = null;

async function fetchBusinessAccess() {
  if (!accessInflight) {
    accessInflight = api
      .get('/api/v1/business/edition/access')
      .finally(() => {
        accessInflight = null;
      });
  }
  return accessInflight;
}

export function BusinessAccessProvider({ children }) {
  const { subscription, isAuthenticated } = useAuth();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setAccess(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const { data } = await fetchBusinessAccess();
      if (mountedRef.current) setAccess(data);
      return data;
    } catch {
      if (mountedRef.current) setAccess(null);
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setAccess(null);
      setLoading(false);
      return;
    }
    refresh();
  }, [isAuthenticated, refresh]);

  const canWrite =
    access?.can_write_business !== false && subscription?.can_write_business !== false;
  const trialExpired =
    (access?.access_state || subscription?.access_state) === 'trial_expired';
  const perms = access?.team_permissions || {};

  const can = useCallback(
    (key) => {
      if (trialExpired || !canWrite) return false;
      if (access?.team_role === 'owner' || !access?.team_role) return true;
      return Boolean(perms[key]);
    },
    [trialExpired, canWrite, access?.team_role, perms],
  );

  const value = useMemo(
    () => ({
      access,
      subscription,
      loading,
      refresh,
      canWrite: canWrite && !trialExpired,
      trialExpired,
      can,
      teamRole: access?.team_role,
    }),
    [access, subscription, loading, refresh, canWrite, trialExpired, can],
  );

  return (
    <BusinessAccessContext.Provider value={value}>
      {children}
    </BusinessAccessContext.Provider>
  );
}

export function useBusinessAccess() {
  const ctx = useContext(BusinessAccessContext);
  if (!ctx) {
    throw new Error('useBusinessAccess must be used within a BusinessAccessProvider');
  }
  return ctx;
}
