"""Credit efficiency scoring — utilization, paydown recommendations, interest projections."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.services.debt_calculator import calculate_monthly_interest

_TWO = Decimal("0.01")
_ONE_PCT = Decimal("0.1")
_ZERO = Decimal("0")
_HUNDRED = Decimal("100")


def _r2(value: Decimal) -> Decimal:
    return value.quantize(_TWO, rounding=ROUND_HALF_UP)


def _r1(value: Decimal) -> Decimal:
    return value.quantize(_ONE_PCT, rounding=ROUND_HALF_UP)


def _tier_and_color(pct: Decimal) -> tuple[str, str]:
    """Return (tier, color) for a utilization percentage."""
    if pct < 10:
        return "excellent", "green"
    if pct < 30:
        return "good", "green"
    if pct < 50:
        return "fair", "yellow"
    if pct < 75:
        return "poor", "orange"
    return "critical", "red"


def calculate_utilization(debts: list[dict]) -> dict:
    """Calculate credit utilization for credit-card debts.

    Parameters
    ----------
    debts : list[dict]
        Each dict should have: id, name, type, balance, credit_limit (may be None).

    Returns
    -------
    dict with keys: cards (per-card details), total_balance, total_limit,
    overall_utilization_pct, overall_tier, overall_color.
    """
    cards: list[dict] = []
    total_balance = _ZERO
    total_limit = _ZERO

    for d in debts:
        if d.get("type") != "credit_card":
            continue
        limit = d.get("credit_limit")
        if limit is None or Decimal(str(limit)) <= 0:
            continue

        balance = Decimal(str(d["balance"]))
        credit_limit = Decimal(str(limit))
        util_pct = _r1(balance / credit_limit * _HUNDRED) if credit_limit > 0 else _ZERO
        tier, color = _tier_and_color(util_pct)

        cards.append(
            {
                "id": d["id"],
                "name": d["name"],
                "balance": _r2(balance),
                "credit_limit": _r2(credit_limit),
                "utilization_pct": util_pct,
                "tier": tier,
                "color": color,
            }
        )
        total_balance += balance
        total_limit += credit_limit

    if total_limit > 0:
        overall_pct = _r1(total_balance / total_limit * _HUNDRED)
    else:
        overall_pct = _ZERO

    overall_tier, overall_color = _tier_and_color(overall_pct)

    return {
        "cards": cards,
        "total_balance": _r2(total_balance),
        "total_limit": _r2(total_limit),
        "overall_utilization_pct": overall_pct,
        "overall_tier": overall_tier,
        "overall_color": overall_color,
    }


def recommend_paydown_priority(
    debts: list[dict],
    available_amount: Decimal,
) -> list[dict]:
    """Recommend which card to pay down for the biggest utilization impact.

    For each credit card, calculate how much overall utilization drops if the
    user applies *available_amount* to that single card.
    """
    available = Decimal(str(available_amount))

    # Filter to credit cards with valid limits
    cc_debts = [
        d
        for d in debts
        if d.get("type") == "credit_card"
        and d.get("credit_limit") is not None
        and Decimal(str(d["credit_limit"])) > 0
    ]

    if not cc_debts:
        return []

    total_balance = sum(Decimal(str(d["balance"])) for d in cc_debts)
    total_limit = sum(Decimal(str(d["credit_limit"])) for d in cc_debts)

    if total_limit <= 0:
        return []

    current_overall = _r1(total_balance / total_limit * _HUNDRED)

    recommendations: list[dict] = []
    for d in cc_debts:
        balance = Decimal(str(d["balance"]))
        credit_limit = Decimal(str(d["credit_limit"]))
        current_util = _r1(balance / credit_limit * _HUNDRED) if credit_limit > 0 else _ZERO

        payment = min(available, balance)
        new_balance = balance - payment
        projected_util = _r1(new_balance / credit_limit * _HUNDRED) if credit_limit > 0 else _ZERO

        # Overall utilization after applying payment to this card
        new_total_balance = total_balance - payment
        projected_overall = _r1(new_total_balance / total_limit * _HUNDRED)
        util_drop = _r1(current_overall - projected_overall)

        recommendations.append(
            {
                "card_name": d["name"],
                "current_utilization": current_util,
                "projected_utilization": projected_util,
                "utilization_drop": util_drop,
                "recommended_payment": _r2(payment),
            }
        )

    # Sort by highest utilization drop first
    recommendations.sort(key=lambda r: r["utilization_drop"], reverse=True)
    return recommendations


def project_interest_over_time(
    debts: list[dict],
    months: int = 12,
) -> list[dict]:
    """Project interest accrual over *months* assuming only minimum payments.

    Parameters
    ----------
    debts : list[dict]
        Each dict should have: name, balance, apr, minimum_payment.
    months : int
        Number of months to project.

    Returns
    -------
    List of dicts with: month, monthly_interest, cumulative_interest,
    total_remaining_balance.
    """
    if not debts:
        return [
            {
                "month": m,
                "monthly_interest": _ZERO,
                "cumulative_interest": _ZERO,
                "total_remaining_balance": _ZERO,
            }
            for m in range(1, months + 1)
        ]

    # Working copy
    working = [
        {
            "balance": Decimal(str(d["balance"])),
            "apr": Decimal(str(d["apr"])),
            "minimum_payment": Decimal(str(d["minimum_payment"])),
        }
        for d in debts
    ]

    cumulative = _ZERO
    projections: list[dict] = []

    for m in range(1, months + 1):
        month_interest = _ZERO

        for d in working:
            if d["balance"] <= 0:
                continue

            # Apply minimum payment
            payment = min(d["minimum_payment"], d["balance"])
            d["balance"] -= payment

            # Accrue interest
            interest = calculate_monthly_interest(d["balance"], d["apr"])
            d["balance"] += interest
            month_interest += interest

            if d["balance"] < 0:
                d["balance"] = _ZERO

        cumulative += month_interest
        total_remaining = sum(d["balance"] for d in working)

        projections.append(
            {
                "month": m,
                "monthly_interest": _r2(month_interest),
                "cumulative_interest": _r2(cumulative),
                "total_remaining_balance": _r2(total_remaining),
            }
        )

    return projections
