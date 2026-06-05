"""Tests for percent-above-minimum debt payoff estimates."""

from decimal import Decimal

from app.services.debt_calculator import (
    estimate_payoff_months_extra_percent,
    simulate_extra_payment_percents,
)


def test_estimate_payoff_faster_with_extra_percent():
    baseline = estimate_payoff_months_extra_percent(
        Decimal("1000"), Decimal("12"), Decimal("100"), Decimal("0")
    )
    boosted = estimate_payoff_months_extra_percent(
        Decimal("1000"), Decimal("12"), Decimal("100"), Decimal("25")
    )
    assert baseline is not None
    assert boosted is not None
    assert boosted < baseline


def test_simulate_extra_payment_percents_includes_defaults():
    debts = [
        {
            "id": "1",
            "name": "Card",
            "balance": Decimal("2000"),
            "apr": Decimal("18"),
            "minimum_payment": Decimal("75"),
        }
    ]
    results = simulate_extra_payment_percents(debts)
    percents = [r["extra_percent"] for r in results]
    assert Decimal("0") in percents
    assert Decimal("10") in percents
    assert Decimal("25") in percents
    assert Decimal("50") in percents

    baseline = next(r for r in results if r["extra_percent"] == Decimal("0"))
    boosted = next(r for r in results if r["extra_percent"] == Decimal("25"))
    assert boosted["months_to_payoff"] <= baseline["months_to_payoff"]
    assert boosted["months_saved_vs_minimum"] >= 0
