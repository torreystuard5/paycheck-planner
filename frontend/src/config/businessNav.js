import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Briefcase,
  Banknote,
  ShieldCheck,
  ArrowUpCircle,
  PieChart,
  FileText,
  BarChart3,
  Upload,
  DollarSign,
  Settings,
  HelpCircle,
} from 'lucide-react';

/** Business sidebar links with permission keys (mirrors backend business_context). */
export const BUSINESS_NAV_LINKS = [
  { to: '/business/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { to: '/business/sales', label: 'Sales', icon: TrendingUp, permission: 'manage_sales' },
  { to: '/business/customers', label: 'Customers', icon: Users, permission: 'manage_sales' },
  { to: '/business/deductions', label: 'Deductions', icon: Briefcase, permission: 'manage_deductions' },
  { to: '/business/staff-pay', label: 'Staff Pay', icon: Banknote, permission: 'manage_staff_pay' },
  { to: '/business/contingency-fund', label: 'Contingency Fund', icon: ShieldCheck, permission: 'manage_funds' },
  { to: '/business/upgrade-fund', label: 'Upgrade Fund', icon: ArrowUpCircle, permission: 'manage_funds' },
  { to: '/business/net-profit', label: 'Net Profit', icon: PieChart, permission: 'view_dashboard' },
  { to: '/business/tax-prep', label: 'Tax Prep', icon: FileText, permission: 'view_tax_prep' },
  { to: '/business/reports', label: 'Reports', icon: BarChart3, permission: 'view_dashboard' },
  { to: '/business/documents', label: 'Documents', icon: Upload, permission: 'manage_deductions' },
  { to: '/business/team', label: 'Team', icon: Users, permission: 'manage_team' },
  { to: '/business/revenue', label: 'Payments', icon: DollarSign, permission: 'manage_subscription' },
  { to: '/edition', label: 'Switch edition', icon: Briefcase, small: true, permission: null },
  { to: '/settings', label: 'Settings', icon: Settings, permission: null },
  { to: '/support', label: 'Support', icon: HelpCircle, permission: null },
];

export function filterBusinessNavLinks(can) {
  return BUSINESS_NAV_LINKS.filter((link) => {
    if (!link.permission) return true;
    return can(link.permission);
  });
}
