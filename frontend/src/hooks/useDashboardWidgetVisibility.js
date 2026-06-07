import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DASHBOARD_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  defaultHiddenWidgets,
} from '../config/dashboardWidgets';

function storageKey(userId) {
  return `paydrift_dashboard_hidden_widgets_${userId || 'guest'}`;
}

function readHidden(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaultHiddenWidgets();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultHiddenWidgets();
  } catch {
    return defaultHiddenWidgets();
  }
}

export default function useDashboardWidgetVisibility(userId) {
  const [hiddenWidgets, setHiddenWidgets] = useState(() => readHidden(userId));

  useEffect(() => {
    setHiddenWidgets(readHidden(userId));
  }, [userId]);

  const persist = useCallback(
    (nextHidden) => {
      setHiddenWidgets(nextHidden);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(nextHidden));
      } catch {
        /* ignore quota errors */
      }
    },
    [userId],
  );

  const isVisible = useCallback(
    (widgetId) => !hiddenWidgets.includes(widgetId),
    [hiddenWidgets],
  );

  const setVisible = useCallback(
    (widgetId, visible) => {
      persist(
        visible
          ? hiddenWidgets.filter((id) => id !== widgetId)
          : hiddenWidgets.includes(widgetId)
            ? hiddenWidgets
            : [...hiddenWidgets, widgetId],
      );
    },
    [hiddenWidgets, persist],
  );

  const toggleWidget = useCallback(
    (widgetId) => {
      setVisible(widgetId, hiddenWidgets.includes(widgetId));
    },
    [hiddenWidgets, setVisible],
  );

  const resetWidgets = useCallback(() => {
    persist(defaultHiddenWidgets());
  }, [persist]);

  const applyVisibility = useCallback(
    (nextVisibility) => {
      const hidden = DASHBOARD_WIDGET_ORDER.filter((id) => !nextVisibility[id]);
      persist(hidden);
    },
    [persist],
  );

  const visibility = useMemo(
    () =>
      DASHBOARD_WIDGET_ORDER.reduce((acc, id) => {
        acc[id] = !hiddenWidgets.includes(id);
        return acc;
      }, {}),
    [hiddenWidgets],
  );

  const visibleCount = DASHBOARD_WIDGET_ORDER.length - hiddenWidgets.length;

  return {
    hiddenWidgets,
    visibility,
    isVisible,
    setVisible,
    toggleWidget,
    resetWidgets,
    applyVisibility,
    visibleCount,
    widgets: DASHBOARD_WIDGETS,
  };
}
