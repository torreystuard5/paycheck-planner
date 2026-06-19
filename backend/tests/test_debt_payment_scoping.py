import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


def _debt(**overrides):
    now = datetime(2026, 6, 1, tzinfo=timezone.utc)
    data = {
        "id": uuid4(),
        "user_id": uuid4(),
        "household_id": None,
        "name": "Credit Card",
        "type": "credit_card",
        "balance": Decimal("500"),
        "credit_limit": Decimal("1000"),
        "apr": Decimal("19.99"),
        "minimum_payment": Decimal("50"),
        "due_day": 15,
        "auto_pay": False,
        "reminder_days": 3,
        "is_active": True,
        "is_split": False,
        "split_members": None,
        "budget_id": None,
        "postpone_until": None,
        "created_at": now,
        "updated_at": now,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _payment(debt, user_id, **overrides):
    data = {
        "id": uuid4(),
        "debt_id": debt.id,
        "user_id": user_id,
        "amount": Decimal("50"),
        "payment_date": datetime(2026, 6, 15, tzinfo=timezone.utc),
        "due_date": date(2026, 6, 15),
        "pay_period_start": date(2026, 6, 1),
        "period_month": 6,
        "period_year": 2026,
        "created_at": datetime(2026, 6, 15, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def test_create_debt_payment_stores_due_date_and_pay_period_scope():
    from app.services.debt_payment_service import create_period_debt_payment

    debt = _debt()
    user = SimpleNamespace(id=uuid4())
    db = SimpleNamespace(add=MagicMock())

    asyncio.run(
        create_period_debt_payment(
            db,
            user,
            debt,
            Decimal("50"),
            auto_log_source="test",
            today=date(2026, 6, 10),
            due_date=date(2026, 7, 15),
            pay_period_start=date(2026, 7, 1),
        )
    )

    debt_payment = db.add.call_args_list[0].args[0]
    ledger_payment = db.add.call_args_list[1].args[0]
    assert debt_payment.due_date == date(2026, 7, 15)
    assert debt_payment.pay_period_start == date(2026, 7, 1)
    assert debt_payment.period_month == 7
    assert debt_payment.period_year == 2026
    assert ledger_payment.pay_period_date == date(2026, 7, 1)


def test_checklist_debt_sync_uses_selected_pay_period_and_due_date():
    from app.routers.paycheck_checklist import _sync_debt_payment

    user = SimpleNamespace(id=uuid4(), household_id=None)
    debt = _debt(user_id=user.id)
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult([debt]),
                _FakeResult([]),
            ]
        ),
        add=MagicMock(),
        flush=AsyncMock(),
    )

    asyncio.run(
        _sync_debt_payment(
            db,
            user,
            debt.id,
            True,
            pay_period_start=date(2026, 7, 1),
            occurrence_due_date=date(2026, 7, 15),
        )
    )

    debt_payment = db.add.call_args_list[0].args[0]
    assert debt_payment.due_date == date(2026, 7, 15)
    assert debt_payment.pay_period_start == date(2026, 7, 1)


def test_debt_response_advances_next_due_after_scoped_payment():
    from app.routers.debts import _debt_to_response

    debt = _debt()
    paid_row = _payment(debt, debt.user_id, due_date=date(2026, 6, 15))
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult([paid_row]),
                _FakeResult([paid_row]),
                _FakeResult([Decimal("50")]),
            ]
        )
    )

    with patch("app.routers.debts.debt_due_date_for_period", return_value=date(2026, 6, 15)):
        response = asyncio.run(_debt_to_response(debt, db, debt.user_id))

    assert response.is_paid_this_period is True
    assert response.next_due_date == date(2026, 7, 15)
