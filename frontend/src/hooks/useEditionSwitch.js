import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useBusinessAccess } from './useBusinessAccess';
import {
  activateBusinessEdition,
  businessEdition,
  enterPersonalEdition,
} from '../services/businessApi';
import { formatApiError } from '../utils/formatApiError';
import {
  hasBusinessAccess,
  hasPersonalHomeAccess,
  normalizePlanTier,
} from '../utils/tierAccess';

/**
 * Unified Personal ↔ Business edition switching (Sidebar, Settings, EditionChooser).
 * Always hits the server so client app_mode stays in sync with the database.
 */
export function useEditionSwitch() {
  const { user, subscription, updateUser, fetchSubscription, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh: refreshBusinessAccess } = useBusinessAccess();
  const [switching, setSwitching] = useState(false);

  const appMode = user?.app_mode || 'personal';

  const restoreUserMode = useCallback(async (fallbackMode) => {
    try {
      await refreshUser?.();
    } catch {
      updateUser({ app_mode: fallbackMode });
    }
  }, [refreshUser, updateUser]);

  const switchToBusiness = useCallback(async () => {
    if (switching) return { ok: false, reason: 'busy' };

    const tier = normalizePlanTier(user?.subscription_tier);
    setSwitching(true);
    updateUser({ app_mode: 'business' });

    try {
      let access = null;
      try {
        ({ data: access } = await businessEdition.getAccess());
      } catch {
        /* activate may still succeed for early_access / paid tiers */
      }

      const entitled =
        access?.has_business_access === true
        || hasBusinessAccess(user, subscription);

      let response;
      if (entitled) {
        response = await activateBusinessEdition(false);
      } else if (access?.can_start_trial) {
        response = await activateBusinessEdition(true);
      } else if (tier === 'early_access') {
        response = await activateBusinessEdition(false);
      } else {
        await restoreUserMode('personal');
        navigate('/business/start');
        return { ok: false, code: 'business_upgrade_required' };
      }

      const { data } = response;
      updateUser({ ...data, app_mode: data?.app_mode || 'business' });
      await refreshUser?.();
      await Promise.all([
        refreshBusinessAccess(),
        fetchSubscription?.(),
      ]);
      navigate('/business/dashboard', { replace: true });
      return { ok: true };
    } catch (err) {
      await restoreUserMode('personal');
      const detail = err.response?.data?.detail;
      const code = typeof detail === 'object' ? detail?.code : null;
      if (code === 'business_upgrade_required') {
        navigate('/business/start');
        return { ok: false, code };
      }
      toast(formatApiError(err) || 'Could not switch to Business mode.', 'error');
      return { ok: false, code };
    } finally {
      setSwitching(false);
    }
  }, [
    switching,
    user,
    subscription,
    updateUser,
    refreshBusinessAccess,
    fetchSubscription,
    refreshUser,
    navigate,
    toast,
    restoreUserMode,
  ]);

  const switchToPersonal = useCallback(async () => {
    if (switching) return { ok: false, reason: 'busy' };

    const tier = normalizePlanTier(user?.subscription_tier);
    if (!hasPersonalHomeAccess(tier)) {
      toast('Your plan does not include Personal mode.', 'error');
      return { ok: false };
    }

    setSwitching(true);
    updateUser({ app_mode: 'personal' });

    try {
      const { data } = await enterPersonalEdition();
      updateUser({ ...data, app_mode: data?.app_mode || 'personal' });
      await refreshUser?.();
      await Promise.all([
        refreshBusinessAccess(),
        fetchSubscription?.(),
      ]);
      navigate('/dashboard', { replace: true });
      return { ok: true };
    } catch (err) {
      await restoreUserMode('business');
      toast(formatApiError(err) || 'Could not switch to Personal mode.', 'error');
      return { ok: false };
    } finally {
      setSwitching(false);
    }
  }, [
    switching,
    user,
    updateUser,
    refreshBusinessAccess,
    fetchSubscription,
    refreshUser,
    navigate,
    toast,
    restoreUserMode,
  ]);

  return {
    appMode,
    switching,
    switchToBusiness,
    switchToPersonal,
  };
}
