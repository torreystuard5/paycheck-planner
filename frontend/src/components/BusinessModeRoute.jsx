import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import LoadingSpinner from './LoadingSpinner';
import { hasBusinessDashboardAccess } from '../utils/tierAccess';

/**
 * Business Edition routes: Business or Bundle tier, app_mode=business.
 */
export default function BusinessModeRoute() {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    if (!hasBusinessDashboardAccess(user.subscription_tier)) {
      toast('Business features are not included in your current plan.', 'error');
    } else if (user.app_mode !== 'business') {
      toast('Switch to Business mode to access this page.', 'error');
    }
  }, [user, location.pathname, toast]);

  if (!user) {
    return <LoadingSpinner />;
  }

  if (!hasBusinessDashboardAccess(user.subscription_tier)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (user.app_mode !== 'business') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
