"""Debt payoff calculators — snowball, avalanche, and extra-payment simulation."""

from __future__ import annotations

import copy
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

_TWO = Decimal("0.01")
_ONE_PCT = Decimal("0.1")
_ZERO = Decimal("0")
_TWELVE = Decimal("12")
_HUNDRED = Decimal("100")
_MAX_MONTHS = 360  # 30-year hard cap


def _r2(value: Decimal) -> Decimal:
    """Round to 2 decimal places."""
    return value.quantize(_TWO, rounding=ROUND_HALF_UP)


def calculate_monthly_interest(balance: Decimal, apr: Decimal) -> Decimal:
    """Return one month of interest on *balance* at the given *apr* (percentage)."""
    if balance <= 0 or apr <= 0:
        return _ZERO
    return _r2(balance * apr / _HUNDRED / _TWELVE)


def simulate_payoff(
    debts: list[dict],
    extra_payment: Decimal = _ZERO,
    strategy: str = "avalanche",
) -> dict:
    """Simulate month-by-month debt payoff using *strategy*.

    Parameters
    ----------
    debts : list[dict]
        Each dict must have keys: id, name, balance, apr, minimum_payment.
    extra_payment : Decimal
        Additional monthly amount beyond minimums.
    strategy : "snowball" | "avalanche"

    Returns
    -------
    dict with keys: strategy, months_to_payoff, total_interest_paid,
    total_amount_paid, payoff_date, monthly_breakdown (first 12 months),
    per_debt_summary.
    """
    if not debts:
        return _empty_result(strategy)

    # Deep-copy so we don't mutate the caller's data
    working = []
    for d in debts:
        working.append(
            {
                "id": d["id"],
                "name": d["name"],
                "balance": Decimal(str(d["balance"])),
                "apr": Decimal(str(d["apr"])),
                "minimum_payment": Decimal(str(d["minimum_payment"])),
                "interest_paid": _ZERO,
                "payoff_month": 0,
                "original_balance": Decimal(str(d["balance"])),
            }
        )

    # Sort by strategy
    if strategy == "snowball":
        working.sort(key=lambda d: d["balance"])
    else:  # avalanche
        working.sort(key=lambda d: d["apr"], reverse=True)

    total_interest = _ZERO
    total_paid = _ZERO
    monthly_breakdown: list[dict] = []
    month = 0

    while any(d["balance"] > 0 for d in working) and month < _MAX_MONTHS:
        month += 1
        month_interest = _ZERO
        month_paid = _ZERO
        remaining_extra = Decimal(str(extra_payment))

        # Also collect freed-up minimums from paid-off debts this round
        freed_minimum = _ZERO

        # 1. Apply minimum payments to all debts
        for d in working:
            if d["balance"] <= 0:
                if d["payoff_month"] > 0:
                    freed_minimum += d["minimum_payment"]
                continue

            payment = min(d["minimum_payment"], d["balance"])
            d["balance"] -= payment
            month_paid += payment

            if d["balance"] <= 0:
                d["balance"] = _ZERO
                if d["payoff_month"] == 0:
                    d["payoff_month"] = month
                freed_minimum += d["minimum_payment"]

        # 2. Apply extra + freed minimums to target debt (first with balance > 0)
        available_extra = remaining_extra + freed_minimum
        for d in working:
            if d["balance"] <= 0 or available_extra <= 0:
                continue
            payment = min(available_extra, d["balance"])
            d["balance"] -= payment
            month_paid += payment
            available_extra -= payment

            if d["balance"] <= 0:
                d["balance"] = _ZERO
                if d["payoff_month"] == 0:
                    d["payoff_month"] = month

        # 3. Calculate interest on remaining balances
        for d in working:
            if d["balance"] <= 0:
                continue
            interest = calculate_monthly_interest(d["balance"], d["apr"])
            d["balance"] += interest
            d["interest_paid"] += interest
            month_interest += interest

        total_interest += month_interest
        total_paid += month_paid

        # Record monthly breakdown (first 12 only)
        if month <= 12:
            monthly_breakdown.append(
                {
                    "month": month,
                    "interest_paid": _r2(month_interest),
                    "principal_paid": _r2(month_paid - month_interest) if month_paid > month_interest else _r2(month_paid),
                    "total_remaining": _r2(sum(d["balance"] for d in working)),
                    "balances": {d["name"]: _r2(d["balance"]) for d in working},
                }
            )

    # Build per-debt summary
    today = date.today()
    per_debt = []
    for d in working:
        payoff_m = d["payoff_month"] if d["payoff_month"] > 0 else month
        per_debt.append(
            {
                "name": d["name"],
                "original_balance": _r2(d["original_balance"]),
                "interest_paid": _r2(d["interest_paid"]),
                "payoff_month": payoff_m,
                "payoff_date": _add_months(today, payoff_m),
            }
        )

    return {
        "strategy": strategy,
        "months_to_payoff": month,
        "total_interest_paid": _r2(total_interest),
        "total_amount_paid": _r2(total_paid + total_interest),
        "payoff_date": _add_months(today, month),
        "monthly_breakdown": monthly_breakdown,
        "per_debt_summary": per_debt,
    }


def compare_strategies(debts: list[dict], extra_payment: Decimal = _ZERO) -> dict:
    """Run both snowball and avalanche and return a side-by-side comparison."""
    snowball = simulate_payoff(debts, extra_payment, strategy="snowball")
    avalanche = simulate_payoff(debts, extra_payment, strategy="avalanche")

    snow_interest = snowball["total_interest_paid"]
    aval_interest = avalanche["total_interest_paid"]
    interest_savings = abs(snow_interest - aval_interest)

    if avalanche["months_to_payoff"] < snowball["months_to_payoff"]:
        faster = "avalanche"
    elif snowball["months_to_payoff"] < avalanche["months_to_payoff"]:
        faster = "snowball"
    else:
        faster = "avalanche" if aval_interest <= snow_interest else "snowball"

    months_saved = abs(snowball["months_to_payoff"] - avalanche["months_to_payoff"])

    return {
        "snowball": snowball,
        "avalanche": avalanche,
        "interest_savings": _r2(interest_savings),
        "faster_strategy": faster,
        "months_saved": months_saved,
    }


def estimate_payoff_months_extra_percent(
    balance: Decimal,
    apr: Decimal,
    minimum_payment: Decimal,
    extra_percent: Decimal = _ZERO,
) -> int | None:
    """Months to pay off one balance paying (1 + extra_percent/100) × minimum monthly."""
    bal = Decimal(str(balance))
    min_pay = Decimal(str(minimum_payment))
    pct = Decimal(str(extra_percent))
    if bal <= 0:
        return 0
    if min_pay <= 0:
        return None
    payment = _r2(min_pay * (Decimal("1") + pct / _HUNDRED))
    if payment <= 0:
        return None

    month = 0
    while bal > _ZERO and month < _MAX_MONTHS:
        month += 1
        interest = calculate_monthly_interest(bal, apr)
        principal = payment - interest
        if principal <= 0:
            return None
        bal -= principal
        if bal < _ZERO:
            bal = _ZERO
    return month if month < _MAX_MONTHS else None


def simulate_extra_payment_percents(
    debts: list[dict],
    extra_percents: list[Decimal] | None = None,
    strategy: str = "avalanche",
) -> list[dict]:
    """Run payoff simulation for paying X% more than each debt's minimum."""
    if extra_percents is None:
        extra_percents = [Decimal("0"), Decimal("10"), Decimal("25"), Decimal("50")]

    baseline = simulate_payoff(debts, _ZERO, strategy=strategy)
    baseline_interest = baseline["total_interest_paid"]
    baseline_months = baseline["months_to_payoff"]

    results: list[dict] = []
    for pct in extra_percents:
        pct_dec = Decimal(str(pct))
        if pct_dec <= 0:
            results.append(
                {
                    "extra_percent": _r2(_ZERO),
                    "effective_extra_amount": _r2(_ZERO),
                    "months_to_payoff": baseline_months,
                    "total_interest": baseline_interest,
                    "interest_saved_vs_minimum": _r2(_ZERO),
                    "months_saved_vs_minimum": 0,
                }
            )
            continue

        total_extra = sum(
            Decimal(str(d["minimum_payment"])) * pct_dec / _HUNDRED for d in debts
        )
        sim = simulate_payoff(debts, total_extra, strategy=strategy)
        results.append(
            {
                "extra_percent": _r2(pct_dec),
                "effective_extra_amount": _r2(total_extra),
                "months_to_payoff": sim["months_to_payoff"],
                "total_interest": sim["total_interest_paid"],
                "interest_saved_vs_minimum": _r2(
                    baseline_interest - sim["total_interest_paid"]
                ),
                "months_saved_vs_minimum": max(0, baseline_months - sim["months_to_payoff"]),
            }
        )
    return results


def simulate_extra_payments(
    debts: list[dict],
    extra_amounts: list[Decimal] | None = None,
) -> list[dict]:
    """Run avalanche simulation for each extra amount and compare to minimum-only."""
    if extra_amounts is None:
        extra_amounts = [Decimal("0"), Decimal("50"), Decimal("100"), Decimal("200"), Decimal("500")]

    baseline = simulate_payoff(debts, _ZERO, strategy="avalanche")
    baseline_interest = baseline["total_interest_paid"]

    results: list[dict] = []
    for amt in extra_amounts:
        sim = simulate_payoff(debts, Decimal(str(amt)), strategy="avalanche")
        results.append(
            {
                "extra_amount": _r2(Decimal(str(amt))),
                "months_to_payoff": sim["months_to_payoff"],
                "total_interest": sim["total_interest_paid"],
                "interest_saved_vs_minimum": _r2(baseline_interest - sim["total_interest_paid"]),
            }
        )

    return results


# ── Helpers ────────────────────────────────────────────────────────


def _add_months(src: date, months: int) -> date:
    import calendar

    month = src.month - 1 + months
    year = src.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(src.day, max_day))


def _empty_result(strategy: str) -> dict:
    today = date.today()
    return {
        "strategy": strategy,
        "months_to_payoff": 0,
        "total_interest_paid": _ZERO,
        "total_amount_paid": _ZERO,
        "payoff_date": today,
        "monthly_breakdown": [],
        "per_debt_summary": [],
    }
