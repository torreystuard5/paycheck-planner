import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Menu, Shield } from 'lucide-react';
import Sidebar from './Sidebar';
import EarlyAccessBanner from '../EarlyAccessBanner';
import AnnouncementBanner from '../AnnouncementBanner';
import Footer from '../Footer';
import { useAuth } from '../../context/AuthContext';
import { normalizePlanTier } from '../../utils/tierAccess';
import logo from '../../assets/PayDrift-Logo.jpg';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <EarlyAccessBanner />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex items-center h-14 bg-white border-b border-gray-200 px-4 lg:hidden gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-700 shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2 min-w-0 shrink">
            <img src={logo} alt="PayDrift logo" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-gray-900 truncate">PayDrift</span>
          </Link>
          <div className="flex-1 min-w-0" />
          {user && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 max-w-[4.5rem] truncate">
                {normalizePlanTier(user.subscription_tier)}
              </span>
              {normalizePlanTier(user.subscription_tier) === 'early_access' && (
                <Link to="/upgrade" className="text-[11px] font-medium text-blue-600 whitespace-nowrap">
                  Upgrade
                </Link>
              )}
            </div>
          )}
          {user?.is_admin && (
            <Link
              to="/admin/command-center"
              className="p-2 text-gray-400 hover:text-blue-600 transition-colors shrink-0"
              aria-label="Command Center"
            >
              <Shield className="h-4 w-4" />
            </Link>
          )}
        </div>

        <main className="p-4 md:p-6">
          <AnnouncementBanner />
          <Outlet />
        </main>
        <div className="px-4 md:px-6">
          <Footer />
        </div>
      </div>
    </div>
  );
}
