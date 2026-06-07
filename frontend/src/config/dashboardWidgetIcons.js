import {
  Activity,
  BarChart3,
  Calendar,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  PiggyBank,
  Receipt,
  Rocket,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

export const WIDGET_ICONS = {
  overview: DollarSign,
  paycheck_plan: Calendar,
  quick_stats: TrendingUp,
  recent_payments: Activity,
  household_activity: Users,
  whats_new: Rocket,
  bills_debts_overview: FileText,
  savings_goals: PiggyBank,
  income_summary: Wallet,
  upcoming_bills: Receipt,
  debt_snapshot: CreditCard,
  reports_spending: BarChart3,
  reports_trends: TrendingUp,
  shopping_list: ShoppingCart,
  chore_list: ClipboardList,
  calendar_upcoming: CalendarDays,
  budgets_overview: DollarSign,
  tax_prep_reminder: FileText,
  payments_history: Activity,
};

export function getWidgetIcon(widgetId) {
  return WIDGET_ICONS[widgetId] || FileText;
}
