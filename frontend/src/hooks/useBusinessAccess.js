import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

/**
 * Business edition access + team permissions from GET /business/edition/access.
 */
export function useBusinessAccess() {
  const { subscription, fetchSubscription } = useAuth();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/business/edition/access');
      setAccess(data);
    } catch {
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    fetchSubscription?.();
  }, [refresh, fetchSubscription]);

  const canWrite =
    access?.can_write_business !== false && subscription?.can_write_business !== false;
  const trialExpired = (access?.access_state || subscription?.access_state) === 'trial_expired';
  const perms = access?.team_permissions || {};

  const can = (key) => {
    if (trialExpired || !canWrite) return false;
    if (access?.team_role === 'owner' || !access?.team_role) return true;
    return Boolean(perms[key]);
  };

  return {
    access,
    subscription,
    loading,
    refresh,
    canWrite: canWrite && !trialExpired,
    trialExpired,
    can,
    teamRole: access?.team_role,
  };
}
