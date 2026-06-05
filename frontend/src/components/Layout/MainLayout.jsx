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
import SkipToContent from '../SkipToContent';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../ui';
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
  const isBusiness = user?.app_mode === 'business';
  const tabs = isBusiness ? businessMobileTabs : personalMobileTabs;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/95 shadow-[var(--pd-shadow-nav)] backdrop-blur-md supports-[backdrop-filter]:bg-surface/90 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary mobile navigation"
      role="navigation"
    >
      <div className="grid grid-cols-5 gap-0.5 px-2 pt-1.5 pb-1">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-all',
                isActive
                  ? isBusiness ? 'text-purple-700' : 'text-accent-700'
                  : 'text-muted',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-xl transition-all',
                    isActive && (
                      isBusiness
                        ? 'bg-purple-100 text-purple-700 shadow-sm'
                        : 'bg-accent-100 text-accent-700 shadow-sm'
                    ),
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMenu}
          className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold text-muted transition-colors hover:text-foreground"
          aria-label="Open menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl">
            <Menu className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  const isBusiness = user?.app_mode === 'business';

  return (
    <div
      className={cn(
        'min-h-screen overflow-x-hidden bg-surface-subtle',
        isBusiness && 'business-edition',
      )}
      data-app-mode={user?.app_mode || 'personal'}
    >
      <SkipToContent />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-surface/95 px-3 shadow-sm backdrop-blur-md sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-ml-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="ml-1 flex min-w-0 items-center gap-2">
            <img src={logo} alt="PayDrift logo" className="h-7 w-auto rounded-md" />
            <span className="truncate text-sm font-bold tracking-tight text-foreground">PayDrift</span>
          </Link>
          {user?.is_admin && (
            <Link
              to="/admin/command-center"
              className="ml-auto rounded-lg p-2 text-muted transition-colors hover:bg-accent-50 hover:text-accent-600"
              aria-label="Command Center"
            >
              <Shield className="h-4 w-4" />
            </Link>
          )}
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 md:px-6 md:py-6 lg:max-w-[1400px] lg:pb-8 lg:mx-auto focus:outline-none"
        >
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
