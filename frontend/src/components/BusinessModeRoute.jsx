import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { onBusinessGate } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import LoadingSpinner from './LoadingSpinner';
import BusinessTrialBanner from './BusinessTrialBanner';
import { hasBusinessAccess } from '../utils/tierAccess';

/**
 * Business Edition routes: active business access + app_mode=business.
 */
export default function BusinessModeRoute() {
  const { user, subscription } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const businessOk = hasBusinessAccess(user, subscription);
  const trialExpired = subscription?.access_state === 'trial_expired';

  useEffect(() => {
    if (!user) return;
    if (!businessOk) {
      toast('Business requires a trial or subscription.', 'error');
    } else if (trialExpired) {
      toast('Business trial ended — view-only until you subscribe.', 'error');
    } else if (user.app_mode !== 'business') {
      toast('Switch to Business mode to access this page.', 'error');
    }
  }, [user, subscription, location.pathname, toast, businessOk, trialExpired]);

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
    return <LoadingSpinner />;
  }

  if (!businessOk) {
    return <Navigate to="/business/start" replace />;
  }

  if (user.app_mode !== 'business') {
    return <Navigate to="/edition" replace />;
  }

  return (
    <>
      <BusinessTrialBanner />
      <Outlet />
    </>
  );
}
