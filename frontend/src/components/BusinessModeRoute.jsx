import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { onBusinessGate } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBusinessAccess } from '../hooks/useBusinessAccess';
import { useToast } from './Toast';
import LoadingSpinner from './LoadingSpinner';
import BusinessTrialBanner from './BusinessTrialBanner';
import BusinessRouteErrorBoundary from './BusinessRouteErrorBoundary';
import {
  hasBusinessAccess,
  hasPersonalHomeAccess,
  normalizePlanTier,
} from '../utils/tierAccess';

/**
 * Business Edition routes: active business access + app_mode=business (business-only plans exempt).
 */
export default function BusinessModeRoute() {
  const { user, subscription } = useAuth();
  const { access, loading: accessLoading } = useBusinessAccess();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const tier = normalizePlanTier(user?.subscription_tier);
  const businessOnly = tier === 'business';
  const businessOk =
    access?.has_business_access === true
    || hasBusinessAccess(user, subscription);
  const trialExpired =
    access?.access_state === 'trial_expired'
    || subscription?.access_state === 'trial_expired';
  const inBusinessMode = user?.app_mode === 'business' || businessOnly;

  useEffect(() => {
    if (!user) return;
    if (!businessOk) {
      toast('Business requires a trial or subscription.', 'error');
    } else if (trialExpired) {
      toast('Business trial ended — view-only until you subscribe.', 'error');
    } else if (!inBusinessMode && !hasPersonalHomeAccess(tier)) {
      toast('Switch to Business mode to access this page.', 'error');
    }
  }, [user, subscription, location.pathname, toast, businessOk, trialExpired, inBusinessMode, tier]);

  useEffect(() => {
    return onBusinessGate((code) => {
      if (code === 'business_trial_expired') {
        toast('Trial ended — subscribe to save changes.', 'error');
        navigate('/upgrade');
      } else if (code === 'business_upgrade_required') {
        toast('Business subscription required.', 'error');
        navigate('/business/start');
      } else if (code === 'business_permission_denied') {
        toast('You do not have permission for that action.', 'error');
      }
    });
  }, [toast, navigate]);

  if (!user) {
    return <LoadingSpinner label="Loading account" />;
  }

  const awaitingAccess =
    accessLoading && access == null && !hasBusinessAccess(user, subscription);
  if (awaitingAccess) {
    return <LoadingSpinner label="Loading business access" />;
  }

  if (!businessOk) {
    return <Navigate to="/business/start" replace />;
  }

  if (!inBusinessMode) {
    const fallback = hasPersonalHomeAccess(tier) ? '/edition' : '/business/start';
    return <Navigate to={fallback} replace state={{ preferBusiness: true }} />;
  }

  return (
    <>
      <BusinessTrialBanner />
      <BusinessRouteErrorBoundary>
        <Outlet />
      </BusinessRouteErrorBoundary>
    </>
  );
}
