import { useState, useRef, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,

  PiggyBank,
  DollarSign,
  BarChart3,
  Settings,
  HelpCircle,
  LogOut,
  X,
  Wallet,
  Users,
  MessageSquare,
  Shield,
  Lock,
  CalendarDays,
  FileText,
  TrendingUp,
  PieChart,
  Banknote,
  ShieldCheck,
  ArrowUpCircle,
  Loader2,
  ScrollText,
  ChevronDown,
  Check,
  FolderOpen,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBudget } from '../../context/BudgetContext';
// tierAccess import removed — early access, mode toggle always shown
import { APP_VERSION } from '../../config';
import { BUSINESS_NAV_LINKS, filterBusinessNavLinks } from '../../config/businessNav';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
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
  { to: '/upgrade', label: 'Upgrade', icon: TrendingUp },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/support', label: 'Support', icon: HelpCircle },
  { to: '/uploads', label: 'Uploads', icon: Upload },
  { to: '/budgets', label: 'Budgets', icon: FolderOpen, small: true },
  { to: '/changelog', label: 'Changelog', icon: ScrollText, small: true },
];

const adminLinks = [
  { to: '/admin/command-center', label: 'Command Center', icon: Shield, adminOnly: true },
];

function BudgetSwitcher({ onClose }) {
  const { activeBudget, budgets, setActiveBudget } = useBudget();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSwitch = async (id) => {
    if (id === activeBudget?.id) {
      setMenuOpen(false);
      return;
    }
    setSwitchingId(id);
    try {
      await setActiveBudget(id);
    } catch { /* ignore */ }
    setSwitchingId(null);
    setMenuOpen(false);
  };

  if (!activeBudget) return null;

  return (
    <div className="px-3 pb-1 relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors min-h-[44px] text-left"
      >
        {activeBudget.color && (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeBudget.color }} />
        )}
        <span className="flex-1 text-xs font-medium text-gray-700 truncate">{activeBudget.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      {menuOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1 max-h-60 overflow-y-auto">
          {budgets.map((b) => (
            <button
              key={b.id}
              onClick={() => handleSwitch(b.id)}
              disabled={!!switchingId}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left transition-colors min-h-[44px] ${
                b.id === activeBudget.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              } ${switchingId ? 'opacity-60' : ''}`}
            >
              {b.color ? (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-300" />
              )}
              <span className="flex-1 truncate">{b.name}</span>
              {b.id === activeBudget.id && <Check className="w-3.5 h-3.5 shrink-0" />}
              {switchingId === b.id && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => { setMenuOpen(false); navigate('/budgets'); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              <Settings className="w-3.5 h-3.5" />
              Manage budgets…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ open, onClose }) {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const { can, loading: accessLoading, refresh: refreshBusinessAccess } = useBusinessAccess();

  const appMode = user?.app_mode || 'personal';
  const businessLinks =
    appMode === 'business'
      ? accessLoading
        ? BUSINESS_NAV_LINKS
        : filterBusinessNavLinks(can)
      : [];
  const baseLinks = appMode === 'business' ? businessLinks : personalLinks;
  const links = user?.is_admin ? [...baseLinks, ...adminLinks] : baseLinks;
  const showModeToggle = true; // early access: everyone can switch

  const handleModeSwitch = async (mode) => {
    if (mode === appMode || switching) return;
    setSwitching(true);
    try {
      if (mode === 'business') {
        let data;
        try {
          ({ data } = await api.post('/api/v1/business/edition/activate', { accept_trial: false }));
        } catch (err) {
          const detail = err.response?.data?.detail;
          const code = typeof detail === 'object' ? detail?.code : null;
          if (code === 'business_upgrade_required') {
            ({ data } = await api.post('/api/v1/business/edition/activate', { accept_trial: true }));
          } else {
            throw err;
          }
        }
        updateUser(data);
        await refreshBusinessAccess();
        navigate('/business/dashboard');
        onClose();
        return;
      }
      const { data } = await api.post('/api/v1/business/edition/enter-personal');
      updateUser(data);
      navigate('/dashboard');
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const code = typeof detail === 'object' ? detail?.code : null;
      if (mode === 'business' && code === 'business_upgrade_required') {
        navigate('/upgrade');
      } else if (mode === 'personal') {
        try {
          const { data } = await api.patch('/api/v1/users/me/app-mode', { app_mode: 'personal' });
          updateUser(data);
          navigate('/dashboard');
          onClose();
        } catch {
          /* ignore */
        }
      }
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
          className="lg:hidden flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600"
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

      {/* Budget Switcher — below mode toggle, personal mode only */}
      {appMode === 'personal' && <BudgetSwitcher onClose={onClose} />}

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
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[86vw] bg-white border-r border-gray-200 transform transition-transform lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
