/** Registry of personal dashboard widgets (Phase 1). */
export const DASHBOARD_WIDGETS = {
  overview: {
    id: 'overview',
    label: 'At a Glance',
    description: 'Income, bills, debt, and savings summary cards',
    defaultVisible: true,
    preview: { row: 'full', height: 'sm' },
    iconTone: 'brand',
  },
  paycheck_plan: {
    id: 'paycheck_plan',
    label: 'Current Paycheck Plan',
    description: 'Assigned bills and debts for this pay period',
    defaultVisible: true,
    preview: { row: 'plan', height: 'lg' },
    iconTone: 'accent',
  },
  quick_stats: {
    id: 'quick_stats',
    label: 'Quick Stats',
    description: 'Credit utilization and monthly counts',
    defaultVisible: true,
    preview: { row: 'plan', height: 'md' },
    iconTone: 'brand',
  },
  recent_payments: {
    id: 'recent_payments',
    label: 'Recent Activity',
    description: 'Latest bill and debt payments',
    defaultVisible: true,
    preview: { row: 'full', height: 'md' },
    iconTone: 'brand',
  },
  household_activity: {
    id: 'household_activity',
    label: 'Household Activity',
    description: 'Recent actions from household members',
    defaultVisible: true,
    preview: { row: 'full', height: 'sm' },
    iconTone: 'accent',
  },
  whats_new: {
    id: 'whats_new',
    label: "What's New",
    description: 'Product updates and changelog highlights',
    defaultVisible: true,
    preview: { row: 'full', height: 'md' },
    iconTone: 'purple',
  },
};

/** paycheck_plan + quick_stats render side-by-side on large screens */
export const DASHBOARD_WIDGET_PLAN_ROW = ['paycheck_plan', 'quick_stats'];

export const DASHBOARD_WIDGET_ORDER = [
  'overview',
  'paycheck_plan',
  'quick_stats',
  'recent_payments',
  'household_activity',
  'whats_new',
];

export function defaultHiddenWidgets() {
  return DASHBOARD_WIDGET_ORDER.filter(
    (id) => !DASHBOARD_WIDGETS[id].defaultVisible,
  );
}
