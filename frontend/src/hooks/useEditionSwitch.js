import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useBusinessAccess } from './useBusinessAccess';
import { activateBusinessEdition, enterPersonalEdition } from '../services/businessApi';

/**
 * Unified Personal ↔ Business edition switching (Sidebar, Settings, EditionChooser).
 */
export function useEditionSwitch() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh: refreshBusinessAccess } = useBusinessAccess();
  const [switching, setSwitching] = useState(false);

  const appMode = user?.app_mode || 'personal';

  const switchToBusiness = useCallback(async () => {
    if (appMode === 'business' || switching) return { ok: true };
    setSwitching(true);
    try {
      let data;
      try {
        ({ data } = await activateBusinessEdition(false));
      } catch (err) {
        const detail = err.response?.data?.detail;
        const code = typeof detail === 'object' ? detail?.code : null;
        if (code === 'business_upgrade_required') {
          ({ data } = await activateBusinessEdition(true));
        } else {
          throw err;
        }
      }
      updateUser(data);
      await refreshBusinessAccess();
      navigate('/business/dashboard');
      return { ok: true };
    } catch (err) {
      const detail = err.response?.data?.detail;
      const code = typeof detail === 'object' ? detail?.code : null;
      const message = typeof detail === 'object' ? detail?.message : detail;
      if (code === 'business_upgrade_required') {
        navigate('/business/start');
        return { ok: false, code };
      }
      toast(message || 'Could not switch to Business mode.', 'error');
      return { ok: false, code };
    } finally {
      setSwitching(false);
    }
  }, [appMode, switching, updateUser, refreshBusinessAccess, navigate, toast]);

  const switchToPersonal = useCallback(async () => {
    if (appMode === 'personal' || switching) return { ok: true };
    setSwitching(true);
    try {
      const { data } = await enterPersonalEdition();
      updateUser(data);
      navigate('/dashboard');
      return { ok: true };
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message;
      toast(message || 'Could not switch to Personal mode.', 'error');
      return { ok: false };
    } finally {
      setSwitching(false);
    }
  }, [appMode, switching, updateUser, navigate, toast]);

  return {
    appMode,
    switching,
    switchToBusiness,
    switchToPersonal,
  };
}
