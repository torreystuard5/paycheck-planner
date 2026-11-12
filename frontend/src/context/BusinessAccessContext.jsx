import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import api from '../services/api';
import { useAuth } from './useAuth';

import { BusinessAccessContext } from './BusinessAccessContextValue';

export function BusinessAccessProvider({ children }) {
  const { user, subscription, isAuthenticated } = useAuth();
  return <BusinessAccessSession key={user?.id ?? 'signed-out'} subscription={subscription} isAuthenticated={isAuthenticated}>{children}</BusinessAccessSession>;
}

function BusinessAccessSession({ children, subscription, isAuthenticated }) {
  const inflight = useRef(null);
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
      if (!inflight.current) {
        inflight.current = api.get('/api/v1/business/edition/access').finally(() => { inflight.current = null; });
      }
      const { data } = await inflight.current;
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
    if (!isAuthenticated) return;
    refresh();
  }, [isAuthenticated, refresh]);

  const canWrite =
    isAuthenticated && !loading && access?.can_write_business === true && subscription?.can_write_business !== false;
  const trialExpired =
    (access?.access_state || subscription?.access_state) === 'trial_expired';

  const can = useCallback(
    (key) => {
      if (trialExpired || !canWrite) return false;
      if (access?.team_role === 'owner' || !access?.team_role) return true;
      return Boolean(access?.team_permissions?.[key]);
    },
    [trialExpired, canWrite, access?.team_role, access?.team_permissions],
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
