import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,

  PiggyBank,
  DollarSign,
  BarChart3,
  Settings,
  HelpCircle,
  Heart,
  LogOut,
  X,
  Wallet,
  Users,
  MessageSquare,
  Gift,
  Shield,
  Lock,
  CalendarDays,
  FileText,
  TrendingUp,
  Briefcase,
  PieChart,
  Banknote,
  ShieldCheck,
  ArrowUpCircle,
  Loader2,
  ScrollText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canSwitchAppMode } from '../../utils/tierAccess';
import { APP_VERSION } from '../../config';
import api from '../../services/api';
import logo from '../../assets/PayDrift-Logo.jpg';

const personalLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/bills-debts', label: 'Bills & Debts', icon: Receipt },
  { to: '/savings', label: 'Savings', icon: PiggyBank },
  { to: '/income', label: 'Income', icon: Wallet },
  { to: '/payments', label: 'Payments', icon: DollarSign },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/household', label: 'Household', icon: Users },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tax-prep', label: 'Tax Prep', icon: FileText },
  { to: '/vault', label: 'Secure Vault', icon: Lock },
  { to: '/refer', label: 'Refer a Friend', icon: Gift },
  { to: '/supporter', label: 'Support Us', icon: Heart, warm: true },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/support', label: 'Support', icon: HelpCircle },
  { to: '/changelog', label: 'Changelog', icon: ScrollText, small: true },
];

const businessLinks = [
  { to: '/business/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/business/sales', label: 'Sales', icon: TrendingUp },
  { to: '/business/customers', label: 'Customers', icon: Users },
  { to: '/business/deductions', label: 'Deductions', icon: Briefcase },
  { to: '/business/staff-pay', label: 'Staff Pay', icon: Banknote },
  { to: '/business/contingency-fund', label: 'Contingency Fund', icon: ShieldCheck },
  { to: '/business/upgrade-fund', label: 'Upgrade Fund', icon: ArrowUpCircle },
  { to: '/business/net-profit', label: 'Net Profit', icon: PieChart },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/support', label: 'Support', icon: HelpCircle },
];

const adminLinks = [
  { to: '/admin/command-center', label: 'Command Center', icon: Shield, adminOnly: true },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);

  const appMode = user?.app_mode || 'personal';
  const baseLinks = appMode === 'business' ? businessLinks : personalLinks;
  const links = user?.is_admin ? [...baseLinks, ...adminLinks] : baseLinks;
  const showModeToggle = canSwitchAppMode(user?.subscription_tier);

  const handleModeSwitch = async (mode) => {
    if (mode === appMode || switching) return;
    setSwitching(true);
    try {
      const { data } = await api.patch('/api/v1/users/me/app-mode', { app_mode: mode });
      updateUser(data);
      navigate(mode === 'business' ? '/business/dashboard' : '/dashboard');
    } catch {
      // silent fail
    } finally {
      setSwitching(false);
    }
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-200">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="PayDrift logo" className="h-8 w-auto lg:h-10" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-gray-900">PayDrift</span>
            <span className="text-[10px] text-gray-400 leading-tight">
              {appMode === 'business' ? 'Business Mode' : 'Budget · Bills · Savings'}
            </span>
          </div>
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden p-1 text-gray-400 hover:text-gray-600"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Mode Toggle — Bundle plans only */}
      {showModeToggle && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleModeSwitch('personal')}
              disabled={switching}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors min-h-[44px] ${
                appMode === 'personal'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              } ${switching ? 'opacity-60' : ''}`}
            >
              {switching && appMode !== 'personal' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              Personal
            </button>
            <button
              onClick={() => handleModeSwitch('business')}
              disabled={switching}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors min-h-[44px] ${
                appMode === 'business'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              } ${switching ? 'opacity-60' : ''}`}
            >
              {switching && appMode !== 'business' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              Business
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map(({ to, label, icon: Icon, warm, adminOnly, small }) => {
          if (adminOnly && !user?.is_admin) return null;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg font-medium transition-colors ${
                  small
                    ? `px-3 py-1.5 text-xs ${isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`
                    : `px-3 py-2.5 text-sm ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : warm
                            ? 'text-rose-500 hover:bg-rose-50 hover:text-rose-600'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`
                }`
              }
              onClick={onClose}
            >
              <Icon className={`shrink-0 ${small ? 'h-4 w-4' : 'h-5 w-5'}`} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            aria-label="Log out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 text-center">PayDrift {APP_VERSION}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {content}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-gray-200">
        {content}
      </aside>
    </>
  );
}
