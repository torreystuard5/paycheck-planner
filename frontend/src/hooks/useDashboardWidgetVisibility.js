import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import {
  DASHBOARD_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  defaultHiddenWidgets,
  hiddenWidgetListsEqual,
  sanitizeHiddenWidgets,
} from '../config/dashboardWidgets';

function storageKey(userId) {
  return `paydrift_dashboard_hidden_widgets_${userId || 'guest'}`;
}

function readLocalHidden(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaultHiddenWidgets();
    return sanitizeHiddenWidgets(JSON.parse(raw));
  } catch {
    return defaultHiddenWidgets();
  }
}

function writeLocalHidden(userId, hidden) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(hidden));
  } catch {
    /* ignore quota errors */
  }
}

export default function useDashboardWidgetVisibility(userId) {
  const [hiddenWidgets, setHiddenWidgets] = useState(() => readLocalHidden(userId));
  const [ready, setReady] = useState(!userId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHiddenWidgets(readLocalHidden(userId));
      setReady(true);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      setReady(false);
      const localHidden = readLocalHidden(userId);

      try {
        const { data } = await api.get('/api/v1/users/me/ui-preferences');
        if (cancelled) return;

        let serverHidden = sanitizeHiddenWidgets(data.hidden_dashboard_widgets);
        const defaults = defaultHiddenWidgets();

        if (
          hiddenWidgetListsEqual(serverHidden, defaults)
          && !hiddenWidgetListsEqual(localHidden, defaults)
        ) {
          serverHidden = localHidden;
          try {
            await api.patch('/api/v1/users/me/ui-preferences', {
              hidden_dashboard_widgets: serverHidden,
            });
          } catch {
            /* keep migrated local value in UI even if sync fails */
          }
        }

        setHiddenWidgets(serverHidden);
        writeLocalHidden(userId, serverHidden);
      } catch {
        if (!cancelled) setHiddenWidgets(localHidden);
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
    async (nextHidden) => {
      const sanitized = sanitizeHiddenWidgets(nextHidden);
      setHiddenWidgets(sanitized);
      writeLocalHidden(userId, sanitized);

      if (!userId) return;

      setSaving(true);
      try {
        await api.patch('/api/v1/users/me/ui-preferences', {
          hidden_dashboard_widgets: sanitized,
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
      return persist(hidden);
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
    ready,
    saving,
    widgets: DASHBOARD_WIDGETS,
  };
}
