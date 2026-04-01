import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/PayDrift-Logo.jpg';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/debts', label: 'Debts', icon: CreditCard },
  { to: '/savings', label: 'Savings', icon: PiggyBank },
  { to: '/income', label: 'Income', icon: Wallet },
  { to: '/payments', label: 'Payments', icon: DollarSign },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/household', label: 'Household', icon: Users },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/vault', label: 'Secure Vault', icon: Lock },
  { to: '/refer', label: 'Refer a Friend', icon: Gift },
  { to: '/supporter', label: 'Support Us', icon: Heart, warm: true },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/support', label: 'Support', icon: HelpCircle },
  { to: '/admin/tickets', label: 'Support Tickets', icon: MessageSquare, adminOnly: true },
  { to: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
  { to: '/admin/command-center', label: 'Command Center', icon: Shield, adminOnly: true },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-200">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="PayDrift logo" className="h-8 w-auto lg:h-10" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-gray-900">PayDrift</span>
            <span className="text-[10px] text-gray-400 leading-tight">Budget · Bills · Savings</span>
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

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.filter(l => (!l.adminOnly || user?.is_admin) && (!l.proOnly || user?.is_supporter || user?.subscription_tier === 'lifetime')).map(({ to, label, icon: Icon, warm }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : warm
                    ? 'text-rose-500 hover:bg-rose-50 hover:text-rose-600'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
            onClick={onClose}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </NavLink>
        ))}
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
