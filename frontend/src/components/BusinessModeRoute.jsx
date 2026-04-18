import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import LoadingSpinner from './LoadingSpinner';

/**
 * Wraps Business Edition routes: requires app_mode=business; otherwise redirects to personal dashboard with toast.
 */
export default function BusinessModeRoute() {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();

  useEffect(() => {
    if (user && user.app_mode !== 'business') {
      toast('Switch to Business mode to access this page.', 'error');
    }
  }, [user, location.pathname, toast]);

  if (!user) {
    return <LoadingSpinner />;
  }

  if (user.app_mode !== 'business') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
