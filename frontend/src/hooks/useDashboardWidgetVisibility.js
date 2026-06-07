import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import {
  DASHBOARD_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  defaultHiddenWidgets,
  defaultWidgetOrder,
  hiddenWidgetListsEqual,
  isDefaultLayout,
  migrateCatalogHidden,
  sanitizeHiddenWidgets,
  sanitizeWidgetOrder,
  visibilityFromHidden,
  widgetOrderEqual,
} from '../config/dashboardWidgets';

function hiddenStorageKey(userId) {
  return `paydrift_dashboard_hidden_widgets_${userId || 'guest'}`;
}

function orderStorageKey(userId) {
  return `paydrift_dashboard_widget_order_${userId || 'guest'}`;
}

function readLocalHidden(userId) {
  try {
    const raw = localStorage.getItem(hiddenStorageKey(userId));
    if (!raw) return migrateCatalogHidden(defaultHiddenWidgets(), userId);
    return migrateCatalogHidden(sanitizeHiddenWidgets(JSON.parse(raw)), userId);
  } catch {
    return migrateCatalogHidden(defaultHiddenWidgets(), userId);
  }
}

function readLocalOrder(userId) {
  try {
    const raw = localStorage.getItem(orderStorageKey(userId));
    if (!raw) return defaultWidgetOrder();
    return sanitizeWidgetOrder(JSON.parse(raw));
  } catch {
    return defaultWidgetOrder();
  }
}

function writeLocalHidden(userId, hidden) {
  try {
    localStorage.setItem(hiddenStorageKey(userId), JSON.stringify(hidden));
  } catch {
    /* ignore quota errors */
  }
}

function writeLocalOrder(userId, order) {
  try {
    localStorage.setItem(orderStorageKey(userId), JSON.stringify(order));
  } catch {
    /* ignore quota errors */
  }
}

export default function useDashboardWidgetVisibility(userId) {
  const [hiddenWidgets, setHiddenWidgets] = useState(() => readLocalHidden(userId));
  const [widgetOrder, setWidgetOrder] = useState(() => readLocalOrder(userId));
  const [ready, setReady] = useState(!userId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHiddenWidgets(readLocalHidden(userId));
      setWidgetOrder(readLocalOrder(userId));
      setReady(true);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      setReady(false);
      const localHidden = readLocalHidden(userId);
      const localOrder = readLocalOrder(userId);

      try {
        const { data } = await api.get('/api/v1/users/me/ui-preferences');
        if (cancelled) return;

        let serverHidden = sanitizeHiddenWidgets(data.hidden_dashboard_widgets);
        let serverOrder = sanitizeWidgetOrder(data.dashboard_widget_order);
        const defaultHidden = defaultHiddenWidgets();
        const defaultOrder = defaultWidgetOrder();
        const rawServerHidden = [...serverHidden];

        const patchBody = {};
        if (
          hiddenWidgetListsEqual(serverHidden, defaultHidden)
          && !hiddenWidgetListsEqual(localHidden, defaultHidden)
        ) {
          serverHidden = localHidden;
          patchBody.hidden_dashboard_widgets = serverHidden;
        }
        if (
          widgetOrderEqual(serverOrder, defaultOrder)
          && !widgetOrderEqual(localOrder, defaultOrder)
        ) {
          serverOrder = localOrder;
          patchBody.dashboard_widget_order = serverOrder;
        }

        serverHidden = migrateCatalogHidden(serverHidden, userId);
        if (!hiddenWidgetListsEqual(serverHidden, rawServerHidden)) {
          patchBody.hidden_dashboard_widgets = serverHidden;
        }

        if (Object.keys(patchBody).length > 0) {
          try {
            await api.patch('/api/v1/users/me/ui-preferences', patchBody);
          } catch {
            /* keep migrated local values in UI even if sync fails */
          }
        }

        setHiddenWidgets(serverHidden);
        setWidgetOrder(serverOrder);
        writeLocalHidden(userId, serverHidden);
        writeLocalOrder(userId, serverOrder);
      } catch {
        if (!cancelled) {
          setHiddenWidgets(localHidden);
          setWidgetOrder(localOrder);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    async (nextHidden, nextOrder) => {
      const sanitizedHidden = sanitizeHiddenWidgets(nextHidden);
      const sanitizedOrder = sanitizeWidgetOrder(nextOrder);
      setHiddenWidgets(sanitizedHidden);
      setWidgetOrder(sanitizedOrder);
      writeLocalHidden(userId, sanitizedHidden);
      writeLocalOrder(userId, sanitizedOrder);

      if (!userId) return;

      setSaving(true);
      try {
        await api.patch('/api/v1/users/me/ui-preferences', {
          hidden_dashboard_widgets: sanitizedHidden,
          dashboard_widget_order: sanitizedOrder,
        });
      } catch {
        /* local cache remains; user can retry on next save */
      } finally {
        setSaving(false);
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
        widgetOrder,
      );
    },
    [hiddenWidgets, persist, widgetOrder],
  );

  const toggleWidget = useCallback(
    (widgetId) => {
      setVisible(widgetId, hiddenWidgets.includes(widgetId));
    },
    [hiddenWidgets, setVisible],
  );

  const resetWidgets = useCallback(() => {
    persist(defaultHiddenWidgets(), defaultWidgetOrder());
  }, [persist]);

  const applyLayout = useCallback(
    ({ visibility, order }) => {
      const hidden = DASHBOARD_WIDGET_ORDER.filter((id) => !visibility[id]);
      return persist(hidden, order);
    },
    [persist],
  );

  /** @deprecated use applyLayout */
  const applyVisibility = useCallback(
    (nextVisibility) => applyLayout({ visibility: nextVisibility, order: widgetOrder }),
    [applyLayout, widgetOrder],
  );

  const visibility = useMemo(
    () => visibilityFromHidden(hiddenWidgets),
    [hiddenWidgets],
  );

  const visibleCount = DASHBOARD_WIDGET_ORDER.length - hiddenWidgets.length;

  const layoutIsDefault = useMemo(
    () => isDefaultLayout({ visibility: visibilityFromHidden(hiddenWidgets), order: widgetOrder }),
    [hiddenWidgets, widgetOrder],
  );

  return {
    hiddenWidgets,
    widgetOrder,
    visibility,
    isVisible,
    setVisible,
    toggleWidget,
    resetWidgets,
    applyLayout,
    applyVisibility,
    visibleCount,
    layoutIsDefault,
    ready,
    saving,
    widgets: DASHBOARD_WIDGETS,
  };
}
