import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Shown only for admins when system_settings.maintenance_mode is true.
 * Admin routes are exempt from the maintenance middleware; this is a UX reminder to turn it off.
 */
export default function AdminMaintenanceBanner() {
  const { user } = useAuth();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!user?.is_admin) {
      setActive(false);
      return undefined;
    }
    const load = async () => {
      try {
        const { data } = await api.get('/api/v1/admin/settings');
        const row = Array.isArray(data) ? data.find((s) => s.key === 'maintenance_mode') : null;
        setActive(row?.value === 'true');
      } catch {
        setActive(false);
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [user?.is_admin]);

  if (!active) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <strong>Maintenance mode is active.</strong> Other users only see the maintenance page.{' '}
      <Link to="/admin/command-center" className="font-semibold text-amber-900 underline hover:text-amber-950">
        Open Command Center → Settings
      </Link>{' '}
      to disable it.
    </div>
  );
}
