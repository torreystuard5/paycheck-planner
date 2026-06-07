from app.constants.dashboard_widgets import (
    DEFAULT_DASHBOARD_WIDGET_ORDER,
    sanitize_dashboard_widget_order,
    sanitize_hidden_dashboard_widgets,
)


def test_sanitize_dashboard_widget_order_fills_missing_and_dedupes():
    raw = ["whats_new", "invalid", "overview", "whats_new", "paycheck_plan"]
    result = sanitize_dashboard_widget_order(raw)
    assert result[:3] == ["whats_new", "overview", "paycheck_plan"]
    assert set(result) == set(DEFAULT_DASHBOARD_WIDGET_ORDER)
    assert len(result) == len(DEFAULT_DASHBOARD_WIDGET_ORDER)


def test_sanitize_dashboard_widget_order_empty_uses_default():
    assert sanitize_dashboard_widget_order(None) == DEFAULT_DASHBOARD_WIDGET_ORDER


def test_sanitize_hidden_dashboard_widgets_filters_invalid_and_dedupes():
    raw = [
        "overview",
        "invalid",
        "quick_stats",
        42,
        "overview",
        "whats_new",
        "not_a_widget",
        "savings_goals",
    ]
    assert sanitize_hidden_dashboard_widgets(raw) == [
        "overview",
        "quick_stats",
        "whats_new",
        "savings_goals",
    ]


def test_sanitize_hidden_dashboard_widgets_empty_inputs():
    assert sanitize_hidden_dashboard_widgets(None) == []
    assert sanitize_hidden_dashboard_widgets([]) == []
    assert sanitize_hidden_dashboard_widgets("bad") == []
