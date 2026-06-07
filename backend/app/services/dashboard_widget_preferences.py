"""Dashboard widget preference helpers."""

from app.constants.dashboard_widgets import sanitize_hidden_dashboard_widgets


def ui_preferences_response(pref) -> dict:
    """Serialize user UI preferences for API responses."""
    if pref is None:
        return {
            "collapsed_sections": [],
            "hidden_dashboard_widgets": [],
        }
    return {
        "collapsed_sections": pref.collapsed_sections or [],
        "hidden_dashboard_widgets": sanitize_hidden_dashboard_widgets(
            pref.hidden_dashboard_widgets
        ),
    }
