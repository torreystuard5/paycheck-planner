import { DASHBOARD_WIDGETS } from '../config/dashboardWidgets';

/**
 * Build render sections from user widget order.
 * Consecutive plan-row widgets (paycheck plan + quick stats) share one grid row.
 */
export function buildDashboardSections(widgetOrder, visibility) {
  const sections = [];
  let index = 0;

  while (index < widgetOrder.length) {
    const widgetId = widgetOrder[index];
    if (!visibility[widgetId]) {
      index += 1;
      continue;
    }

    if (DASHBOARD_WIDGETS[widgetId]?.preview?.row === 'plan') {
      const planIds = [];
      while (
        index < widgetOrder.length
        && DASHBOARD_WIDGETS[widgetOrder[index]]?.preview?.row === 'plan'
        && visibility[widgetOrder[index]]
      ) {
        planIds.push(widgetOrder[index]);
        index += 1;
      }
      if (planIds.length > 0) {
        sections.push({ type: 'plan-row', ids: planIds });
      }
      continue;
    }

    sections.push({ type: 'widget', id: widgetId });
    index += 1;
  }

  return sections;
}

/**
 * Walk widget order for preview blocks (visible widgets only).
 */
export function buildPreviewSections(widgetOrder, visibility) {
  const sections = [];
  let index = 0;

  while (index < widgetOrder.length) {
    const widgetId = widgetOrder[index];
    if (!visibility[widgetId]) {
      index += 1;
      continue;
    }

    if (DASHBOARD_WIDGETS[widgetId]?.preview?.row === 'plan') {
      const planIds = [];
      while (
        index < widgetOrder.length
        && DASHBOARD_WIDGETS[widgetOrder[index]]?.preview?.row === 'plan'
        && visibility[widgetOrder[index]]
      ) {
        planIds.push(widgetOrder[index]);
        index += 1;
      }
      if (planIds.length > 0) {
        sections.push({ type: 'plan-row', ids: planIds });
      }
      continue;
    }

    sections.push({ type: 'widget', id: widgetId });
    index += 1;
  }

  return sections;
}
