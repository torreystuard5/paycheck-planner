import { useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  DollarSign,
  Home,
  Menu,
  Receipt,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';
import Sidebar from './Sidebar';
// EarlyAccessBanner removed (Phase 2 cleanup)
import AnnouncementBanner from '../AnnouncementBanner';
import AdminMaintenanceBanner from '../AdminMaintenanceBanner';
import Footer from '../Footer';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/PayDrift-Logo.jpg';

const personalMobileTabs = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/bills-debts', label: 'Bills & Debts', icon: Receipt },
  { to: '/income', label: 'Income', icon: DollarSign },
  { to: '/household', label: 'Household', icon: Users },
];

const businessMobileTabs = [
  { to: '/business/dashboard', label: 'Home', icon: Home },
  { to: '/business/sales', label: 'Sales', icon: TrendingUp },
  { to: '/business/deductions', label: 'Deductions', icon: Briefcase },
  { to: '/business/reports', label: 'Reports', icon: BarChart3 },
];

function MobileBottomNav({ user, onMenu }) {
  const tabs = user?.app_mode === 'business' ? businessMobileTabs : personalMobileTabs;
  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary mobile navigation"
    >
      <div className="grid grid-cols-5 px-1 pt-1">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-blue-700 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-800'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMenu}
          className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-800"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="min-w-0 lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex h-14 items-center border-b border-gray-200 bg-white px-3 sm:px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="-ml-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="ml-1 flex min-w-0 items-center gap-2">
            <img src={logo} alt="PayDrift logo" className="h-8 w-auto" />
            <span className="truncate text-sm font-semibold text-gray-900">PayDrift</span>
          </Link>
          {user?.is_admin && (
            <Link
              to="/admin/command-center"
              className="ml-auto p-2 text-gray-400 hover:text-blue-600 transition-colors"
              aria-label="Command Center"
            >
              <Shield className="h-4 w-4" />
            </Link>
          )}
        </div>

        <main className="min-w-0 px-3 py-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:px-4 md:px-6 md:pt-6 lg:pb-6">
          <AdminMaintenanceBanner />
          <AnnouncementBanner />
          <Outlet />
        </main>
        <div className="px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 md:px-6 lg:pb-0">
          <Footer />
        </div>
        <MobileBottomNav user={user} onMenu={() => setSidebarOpen(true)} />
      </div>
    </div>
  );
}
