/** Personal dashboard widget catalog — keep in sync with backend constants. */

export const DASHBOARD_CATALOG_VERSION = 2;

export const DASHBOARD_WIDGET_CATEGORIES = [
  { key: 'core', label: 'Core', description: 'Essential dashboard sections' },
  { key: 'finance', label: 'Finance', description: 'Bills, income, savings, and debt' },
  { key: 'reports', label: 'Reports', description: 'Charts and spending insights' },
  { key: 'household', label: 'Household', description: 'Shared lists and chores' },
  { key: 'planning', label: 'Planning', description: 'Calendar and budgets' },
  { key: 'tools', label: 'Tools', description: 'Tax prep and payment history' },
];

/** Original six widgets — used for catalog migration */
export const LEGACY_DEFAULT_VISIBLE_WIDGETS = [
  'overview',
  'paycheck_plan',
  'quick_stats',
  'recent_payments',
  'household_activity',
  'whats_new',
];

export const DASHBOARD_WIDGETS = {
  overview: {
    id: 'overview',
    label: 'At a Glance',
    description: 'Income, bills, debt, and savings summary cards',
    category: 'core',
    defaultVisible: true,
    preview: { row: 'full', height: 'sm', kind: 'overview' },
    iconTone: 'brand',
    href: null,
  },
  paycheck_plan: {
    id: 'paycheck_plan',
    label: 'Current Paycheck Plan',
    description: 'Assigned bills and debts for this pay period',
    category: 'core',
    defaultVisible: true,
    preview: { row: 'plan', height: 'lg', kind: 'paycheck_plan' },
    iconTone: 'accent',
    href: null,
  },
  quick_stats: {
    id: 'quick_stats',
    label: 'Quick Stats',
    description: 'Credit utilization and monthly counts',
    category: 'core',
    defaultVisible: true,
    preview: { row: 'plan', height: 'md', kind: 'quick_stats' },
    iconTone: 'brand',
    href: null,
  },
  recent_payments: {
    id: 'recent_payments',
    label: 'Recent Activity',
    description: 'Latest bill and debt payments',
    category: 'core',
    defaultVisible: true,
    preview: { row: 'full', height: 'md', kind: 'recent_payments' },
    iconTone: 'brand',
    href: '/payments',
  },
  household_activity: {
    id: 'household_activity',
    label: 'Household Activity',
    description: 'Recent actions from household members',
    category: 'core',
    defaultVisible: true,
    requiresHousehold: true,
    preview: { row: 'full', height: 'sm', kind: 'household_activity' },
    iconTone: 'accent',
    href: '/household',
  },
  whats_new: {
    id: 'whats_new',
    label: "What's New",
    description: 'Product updates and changelog highlights',
    category: 'core',
    defaultVisible: true,
    preview: { row: 'full', height: 'md', kind: 'whats_new' },
    iconTone: 'purple',
    href: '/changelog',
  },
  bills_debts_overview: {
    id: 'bills_debts_overview',
    label: 'Bills & Debts Overview',
    description: 'Quick snapshot of active bills and debt balances',
    category: 'finance',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'bills_debts' },
    iconTone: 'debt',
    href: '/bills-debts',
  },
  savings_goals: {
    id: 'savings_goals',
    label: 'Savings Goals',
    description: 'Progress toward your savings targets',
    category: 'finance',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'savings' },
    iconTone: 'purple',
    href: '/savings',
  },
  income_summary: {
    id: 'income_summary',
    label: 'Income Summary',
    description: 'Paychecks and net income this month',
    category: 'finance',
    defaultVisible: false,
    preview: { row: 'full', height: 'sm', kind: 'income' },
    iconTone: 'brand',
    href: '/income',
  },
  upcoming_bills: {
    id: 'upcoming_bills',
    label: 'Upcoming Bills',
    description: 'Next due dates and amounts',
    category: 'finance',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'upcoming_bills' },
    iconTone: 'accent',
    href: '/bills-debts?tab=bills',
  },
  debt_snapshot: {
    id: 'debt_snapshot',
    label: 'Debt Snapshot',
    description: 'Balances, utilization, and paid status',
    category: 'finance',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'debt_snapshot' },
    iconTone: 'debt',
    href: '/bills-debts?tab=debts',
  },
  reports_spending: {
    id: 'reports_spending',
    label: 'Spending by Category',
    description: 'Top bill categories this month',
    category: 'reports',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'reports_spending' },
    iconTone: 'accent',
    href: '/reports',
  },
  reports_trends: {
    id: 'reports_trends',
    label: 'Spending Trends',
    description: 'Monthly payment trends at a glance',
    category: 'reports',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'reports_trends' },
    iconTone: 'brand',
    href: '/reports',
  },
  shopping_list: {
    id: 'shopping_list',
    label: 'Shopping List',
    description: 'Shared household shopping items',
    category: 'household',
    defaultVisible: false,
    requiresHousehold: true,
    preview: { row: 'full', height: 'md', kind: 'shopping_list' },
    iconTone: 'brand',
    href: '/household',
  },
  chore_list: {
    id: 'chore_list',
    label: 'Chore List',
    description: 'Upcoming household chores',
    category: 'household',
    defaultVisible: false,
    requiresHousehold: true,
    preview: { row: 'full', height: 'md', kind: 'chore_list' },
    iconTone: 'accent',
    href: '/household',
  },
  calendar_upcoming: {
    id: 'calendar_upcoming',
    label: 'Upcoming Calendar',
    description: 'Paychecks, bills, and debts due soon',
    category: 'planning',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'calendar' },
    iconTone: 'accent',
    href: '/calendar',
  },
  budgets_overview: {
    id: 'budgets_overview',
    label: 'Budgets Overview',
    description: 'Your budgets and active plan',
    category: 'planning',
    defaultVisible: false,
    preview: { row: 'full', height: 'sm', kind: 'budgets' },
    iconTone: 'brand',
    href: '/budgets',
  },
  tax_prep_reminder: {
    id: 'tax_prep_reminder',
    label: 'Tax Prep',
    description: 'Deductions and tax planning shortcuts',
    category: 'tools',
    defaultVisible: false,
    preview: { row: 'full', height: 'sm', kind: 'tax_prep' },
    iconTone: 'warning',
    href: '/tax-prep',
  },
  payments_history: {
    id: 'payments_history',
    label: 'Payment History',
    description: 'Recent payments with quick access to full log',
    category: 'tools',
    defaultVisible: false,
    preview: { row: 'full', height: 'md', kind: 'payments_history' },
    iconTone: 'brand',
    href: '/payments',
  },
};

export const DASHBOARD_WIDGET_PLAN_ROW = ['paycheck_plan', 'quick_stats'];

export const DASHBOARD_WIDGET_ORDER = [
  'overview',
  'paycheck_plan',
  'quick_stats',
  'recent_payments',
  'household_activity',
  'whats_new',
  'bills_debts_overview',
  'savings_goals',
  'income_summary',
  'upcoming_bills',
  'debt_snapshot',
  'reports_spending',
  'reports_trends',
  'shopping_list',
  'chore_list',
  'calendar_upcoming',
  'budgets_overview',
  'tax_prep_reminder',
  'payments_history',
];

export function getCategoryMeta(categoryKey) {
  return DASHBOARD_WIDGET_CATEGORIES.find((c) => c.key === categoryKey);
}

export function widgetsInCategory(categoryKey) {
  return DASHBOARD_WIDGET_ORDER.filter((id) => DASHBOARD_WIDGETS[id].category === categoryKey);
}

export function defaultHiddenWidgets() {
  return DASHBOARD_WIDGET_ORDER.filter((id) => !DASHBOARD_WIDGETS[id].defaultVisible);
}

export function defaultWidgetOrder() {
  return [...DASHBOARD_WIDGET_ORDER];
}

export function visibilityFromHidden(hidden = []) {
  return DASHBOARD_WIDGET_ORDER.reduce((acc, id) => {
    acc[id] = !hidden.includes(id);
    return acc;
  }, {});
}

export function sanitizeHiddenWidgets(raw) {
  if (!Array.isArray(raw)) return defaultHiddenWidgets();
  const seen = new Set();
  return raw.filter((id) => {
    if (!DASHBOARD_WIDGETS[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function sanitizeWidgetOrder(raw) {
  if (!Array.isArray(raw)) return defaultWidgetOrder();
  const seen = new Set();
  const out = raw.filter((id) => {
    if (!DASHBOARD_WIDGETS[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  DASHBOARD_WIDGET_ORDER.forEach((id) => {
    if (!seen.has(id)) out.push(id);
  });
  return out;
}

export function hiddenWidgetListsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function widgetOrderEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function defaultDashboardLayout() {
  return {
    visibility: visibilityFromHidden(defaultHiddenWidgets()),
    order: defaultWidgetOrder(),
  };
}

export function isDefaultLayout({ visibility, order }) {
  const defaults = defaultDashboardLayout();
  return (
    widgetOrderEqual(order, defaults.order)
    && DASHBOARD_WIDGET_ORDER.every((id) => visibility[id] === defaults.visibility[id])
  );
}

export function migrateCatalogHidden(hidden, userId) {
  const key = `paydrift_dashboard_catalog_v${DASHBOARD_CATALOG_VERSION}_${userId || 'guest'}`;
  if (localStorage.getItem(key)) return hidden;
  const optionalHidden = DASHBOARD_WIDGET_ORDER.filter(
    (id) => !DASHBOARD_WIDGETS[id].defaultVisible,
  );
  localStorage.setItem(key, '1');
  return [...new Set([...sanitizeHiddenWidgets(hidden), ...optionalHidden])];
}
