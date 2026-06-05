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
import { cn } from '../ui';
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
    <div className="relative px-3 pb-2" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-left transition-colors hover:bg-surface hover:shadow-[var(--shadow-card)]"
      >
        {activeBudget.color && (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: activeBudget.color }} />
        )}
        <span className="flex-1 truncate text-xs font-semibold text-foreground">{activeBudget.name}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform', menuOpen && 'rotate-180')} />
      </button>

      {menuOpen && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-[var(--shadow-card-hover)]">
          {budgets.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => handleSwitch(b.id)}
              disabled={!!switchingId}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors',
                b.id === activeBudget.id ? 'bg-accent-50 text-accent-700' : 'text-foreground hover:bg-surface-subtle',
                switchingId && 'opacity-60',
              )}
            >
              {b.color ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-border" />
              )}
              <span className="flex-1 truncate">{b.name}</span>
              {b.id === activeBudget.id && <Check className="h-3.5 w-3.5 shrink-0" />}
              {switchingId === b.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            </button>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); navigate('/budgets'); onClose(); }}
              className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-xs text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-5">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90">
          <img src={logo} alt="PayDrift logo" className="h-8 w-auto rounded-lg lg:h-9" />
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-base font-bold tracking-tight text-foreground">PayDrift</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              {appMode === 'business' ? 'Business' : 'Personal finance'}
            </span>
          </div>
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-subtle hover:text-foreground lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {showModeToggle && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex rounded-xl border border-border bg-surface-subtle p-1">
            <button
              type="button"
              onClick={() => handleModeSwitch('personal')}
              disabled={switching}
              className={cn(
                'flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                appMode === 'personal'
                  ? 'bg-surface text-accent-700 shadow-[var(--shadow-card)] ring-1 ring-border'
                  : 'text-muted hover:text-foreground',
                switching && 'opacity-60',
              )}
            >
              {switching && appMode !== 'personal' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Personal
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('business')}
              disabled={switching}
              className={cn(
                'flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                appMode === 'business'
                  ? 'bg-surface text-purple-700 shadow-[var(--shadow-card)] ring-1 ring-border'
                  : 'text-muted hover:text-foreground',
                switching && 'opacity-60',
              )}
            >
              {switching && appMode !== 'business' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Business
            </button>
          </div>
        </div>
      )}

      {appMode === 'personal' && <BudgetSwitcher onClose={onClose} />}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Main navigation">
        {links.map(({ to, label, icon: Icon, warm, adminOnly, small }) => {
          if (adminOnly && !user?.is_admin) return null;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl font-medium transition-all',
                  small
                    ? 'px-3 py-2 text-xs'
                    : 'min-h-[44px] px-3 py-2.5 text-sm',
                  small
                    ? isActive
                      ? 'text-accent-600'
                      : 'text-muted hover:text-foreground'
                    : isActive
                      ? 'bg-accent-50 text-accent-700 shadow-sm ring-1 ring-accent-100'
                      : warm
                        ? 'text-danger-600 hover:bg-danger-50'
                        : 'text-muted hover:bg-surface-subtle hover:text-foreground',
                )
              }
              onClick={onClose}
            >
              <Icon
                className={cn(
                  'shrink-0 transition-colors',
                  small ? 'h-4 w-4' : 'h-[18px] w-[18px]',
                )}
                strokeWidth={2}
              />
              <span className="truncate">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <div className="flex items-center gap-3 rounded-xl bg-surface-subtle/80 p-3 ring-1 ring-border/60">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-semibold text-accent-700">
            {(user?.first_name || user?.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="truncate text-caption">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <p className="text-caption mt-3 text-center">PayDrift {APP_VERSION}</p>
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
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[86vw] transform border-r border-border bg-surface transition-transform duration-300 ease-out lg:hidden',
          open ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {content}
      </aside>

      <aside className="fixed inset-y-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        {content}
      </aside>
    </>
  );
}
