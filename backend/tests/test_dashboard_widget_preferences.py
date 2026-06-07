from app.constants.dashboard_widgets import sanitize_hidden_dashboard_widgets


def test_sanitize_hidden_dashboard_widgets_filters_invalid_and_dedupes():
    raw = [
        "overview",
        "invalid",
        "quick_stats",
        42,
        "overview",
        "whats_new",
        "not_a_widget",
    ]
    assert sanitize_hidden_dashboard_widgets(raw) == [
        "overview",
        "quick_stats",
        "whats_new",
    ]


def test_sanitize_hidden_dashboard_widgets_empty_inputs():
    assert sanitize_hidden_dashboard_widgets(None) == []
    assert sanitize_hidden_dashboard_widgets([]) == []
    assert sanitize_hidden_dashboard_widgets("bad") == []
