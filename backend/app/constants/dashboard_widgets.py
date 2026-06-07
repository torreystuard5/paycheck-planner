"""Personal dashboard widget ids (keep in sync with frontend config)."""

DASHBOARD_WIDGET_IDS = frozenset(
    {
        "overview",
        "paycheck_plan",
        "quick_stats",
        "recent_payments",
        "household_activity",
        "whats_new",
        "bills_debts_overview",
        "savings_goals",
        "income_summary",
        "upcoming_bills",
        "debt_snapshot",
        "reports_spending",
        "reports_trends",
        "shopping_list",
        "chore_list",
        "calendar_upcoming",
        "budgets_overview",
        "tax_prep_reminder",
        "payments_history",
    }
)

DEFAULT_DASHBOARD_WIDGET_ORDER = [
    "overview",
    "paycheck_plan",
    "quick_stats",
    "recent_payments",
    "household_activity",
    "whats_new",
    "bills_debts_overview",
    "savings_goals",
    "income_summary",
    "upcoming_bills",
    "debt_snapshot",
    "reports_spending",
    "reports_trends",
    "shopping_list",
    "chore_list",
    "calendar_upcoming",
    "budgets_overview",
    "tax_prep_reminder",
    "payments_history",
]


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


def sanitize_dashboard_widget_order(raw: list | None) -> list[str]:
    """Valid widget order containing each known widget exactly once."""
    if not raw or not isinstance(raw, list):
        return list(DEFAULT_DASHBOARD_WIDGET_ORDER)

    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        if item not in DASHBOARD_WIDGET_IDS or item in seen:
            continue
        seen.add(item)
        out.append(item)

    for widget_id in DEFAULT_DASHBOARD_WIDGET_ORDER:
        if widget_id not in seen:
            out.append(widget_id)

    return out
