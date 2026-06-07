"""Personal dashboard widget ids (keep in sync with frontend config)."""

DASHBOARD_WIDGET_IDS = frozenset(
    {
        "overview",
        "paycheck_plan",
        "quick_stats",
        "recent_payments",
        "household_activity",
        "whats_new",
    }
)


def sanitize_hidden_dashboard_widgets(raw: list | None) -> list[str]:
    """Return valid hidden widget ids, preserving order, deduplicated."""
    if not raw or not isinstance(raw, list):
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        if item not in DASHBOARD_WIDGET_IDS or item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out
