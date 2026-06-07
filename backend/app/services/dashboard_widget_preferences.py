"""Dashboard widget preference helpers."""

from app.constants.dashboard_widgets import (
    DEFAULT_DASHBOARD_WIDGET_ORDER,
    sanitize_dashboard_widget_order,
    sanitize_hidden_dashboard_widgets,
)


def ui_preferences_response(pref) -> dict:
    """Serialize user UI preferences for API responses."""
    if pref is None:
        return {
            "collapsed_sections": [],
            "hidden_dashboard_widgets": [],
            "dashboard_widget_order": list(DEFAULT_DASHBOARD_WIDGET_ORDER),
        }
    order = sanitize_dashboard_widget_order(pref.dashboard_widget_order)
    if not pref.dashboard_widget_order:
        order = list(DEFAULT_DASHBOARD_WIDGET_ORDER)
    return {
        "collapsed_sections": pref.collapsed_sections or [],
        "hidden_dashboard_widgets": sanitize_hidden_dashboard_widgets(
            pref.hidden_dashboard_widgets
        ),
        "dashboard_widget_order": order,
    }
