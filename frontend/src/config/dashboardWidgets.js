/** Registry of personal dashboard widgets (Phase 1). */
export const DASHBOARD_WIDGETS = {
  overview: {
    id: 'overview',
    label: 'At a Glance',
    description: 'Income, bills, debt, and savings summary cards',
    defaultVisible: true,
  },
  paycheck_plan: {
    id: 'paycheck_plan',
    label: 'Current Paycheck Plan',
    description: 'Assigned bills and debts for this pay period',
    defaultVisible: true,
  },
  quick_stats: {
    id: 'quick_stats',
    label: 'Quick Stats',
    description: 'Credit utilization and monthly counts',
    defaultVisible: true,
  },
  recent_payments: {
    id: 'recent_payments',
    label: 'Recent Activity',
    description: 'Latest bill and debt payments',
    defaultVisible: true,
  },
  household_activity: {
    id: 'household_activity',
    label: 'Household Activity',
    description: 'Recent actions from household members',
    defaultVisible: true,
  },
  whats_new: {
    id: 'whats_new',
    label: "What's New",
    description: 'Product updates and changelog highlights',
    defaultVisible: true,
  },
};

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
