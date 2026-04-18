import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import LoadingSpinner from './LoadingSpinner';
import { hasPersonalHomeAccess } from '../utils/tierAccess';

/**
 * Home / personal surface: requires a plan that includes Personal (early_access, pro, bundle).
 * Command Center (/admin/*) is allowed for admins on any plan.
 */
export default function PersonalModeRoute() {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();

  const path = location.pathname;
  const adminPath = path.startsWith('/admin');
  const sharedAccountPaths =
    path.startsWith('/settings') ||
    path.startsWith('/support') ||
    path.startsWith('/supporter');

  useEffect(() => {
    if (!user || adminPath || sharedAccountPaths) return;
    if (!hasPersonalHomeAccess(user.subscription_tier)) {
      toast('Personal budgeting is not included in your current plan.', 'error');
    }
  }, [user, path, adminPath, sharedAccountPaths, toast]);

  if (!user) {
    return <LoadingSpinner />;
  }

  if (adminPath || sharedAccountPaths) {
    return <Outlet />;
  }

  if (!hasPersonalHomeAccess(user.subscription_tier)) {
    return <Navigate to="/business/dashboard" replace />;
  }

  return <Outlet />;
}
