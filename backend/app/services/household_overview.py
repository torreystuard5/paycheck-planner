"""Household financial overview — combined income, bills, and debts."""

from __future__ import annotations

import json
from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.income import IncomeSource
from app.models.user import User
from app.services.household_service import get_household_members


def _member_name(u: User) -> str:
    return f"{u.first_name or ''} {u.last_name or ''}".strip() or (u.email or "Member")


def _monthly_equiv(amount: Decimal, frequency: str) -> Decimal:
    f = (frequency or "monthly").lower()
    a = Decimal(str(amount or 0))
    if f == "weekly":
        return (a * Decimal("52") / Decimal("12")).quantize(Decimal("0.01"))
    if f == "biweekly":
        return (a * Decimal("26") / Decimal("12")).quantize(Decimal("0.01"))
    if f == "semi_monthly":
        return (a * Decimal("24") / Decimal("12")).quantize(Decimal("0.01"))
    return a.quantize(Decimal("0.01"))


def _bill_user_share(bill: Bill, member_count: int, current_user_id: UUID) -> tuple[Decimal, bool]:
    amount = Decimal(str(bill.amount or 0))
    if bill.household_id and member_count > 0:
        share = (amount / member_count).quantize(Decimal("0.01"))
        return share, True
    if bill.assigned_member_id:
        responsible = bill.assigned_member_id == current_user_id
        return (amount if responsible else Decimal("0")), responsible
    responsible = bill.user_id == current_user_id
    return (amount if responsible else Decimal("0")), responsible


def _debt_next_due(debt: Debt) -> date | None:
    postpone = getattr(debt, "postpone_until", None)
    if postpone is not None:
        if hasattr(postpone, "date"):
            return postpone.date()
        return postpone
    due_day = debt.due_day or 1
    today = date.today()
    _, max_day = monthrange(today.year, today.month)
    clamped = min(int(due_day), max_day)
    candidate = today.replace(day=clamped)
    if candidate >= today:
        return candidate
    if today.month == 12:
        y, m = today.year + 1, 1
    else:
        y, m = today.year, today.month + 1
    _, max_day = monthrange(y, m)
    return date(y, m, min(int(due_day), max_day))


def _debt_user_share(
    debt: Debt, member_count: int, current_user_id: UUID
) -> tuple[Decimal, bool, Decimal | None]:
    amount = Decimal(str(debt.minimum_payment or 0))
    full = amount
    if debt.is_split:
        split_count = 1
        raw = debt.split_members
        if raw:
            try:
                parsed = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(parsed, list) and parsed:
                    split_count = len(parsed)
            except (json.JSONDecodeError, TypeError):
                pass
        if split_count <= 1 and debt.household_id and member_count > 1:
            split_count = member_count
        if split_count > 1:
            share = (amount / split_count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            return share, True, full
    if debt.household_id and member_count > 0:
        share = (amount / member_count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return share, True, full
    responsible = debt.user_id == current_user_id
    return (amount if responsible else Decimal("0")), responsible, full if responsible else None


def _debt_assignee_ids(debt: Debt, member_ids: list[UUID]) -> list[UUID]:
    """Which household members own a row in by-person debt lists."""
    if debt.is_split and debt.split_members:
        try:
            parsed = json.loads(debt.split_members) if isinstance(debt.split_members, str) else debt.split_members
            if isinstance(parsed, list) and parsed:
                out: list[UUID] = []
                for raw in parsed:
                    try:
                        uid = raw if isinstance(raw, UUID) else UUID(str(raw))
                    except (TypeError, ValueError):
                        continue
                    if uid in member_ids:
                        out.append(uid)
                if out:
                    return out
        except (json.JSONDecodeError, TypeError):
            pass
    if debt.user_id in member_ids:
        return [debt.user_id]
    return []


def _overview_obligation_filter(model, household_id: UUID, budget_id: UUID, member_ids: list[UUID]):
    """Household overview: shared items respect budget; each member's personal items always show."""
    return or_(
        and_(
            model.household_id == household_id,
            or_(model.budget_id == budget_id, model.budget_id.is_(None)),
        ),
        and_(model.household_id.is_(None), model.user_id.in_(member_ids)),
    )


async def _paid_debt_ids_this_month(
    db: AsyncSession,
    debt_ids: list[UUID],
) -> set[UUID]:
    if not debt_ids:
        return set()
    today = date.today()
    try:
        result = await db.execute(
            select(DebtPayment.debt_id).where(
                DebtPayment.debt_id.in_(debt_ids),
                DebtPayment.period_month == today.month,
                DebtPayment.period_year == today.year,
            )
        )
        return {row[0] for row in result.all()}
    except (ProgrammingError, DBAPIError):
        return set()


async def build_household_financial_overview(
    db: AsyncSession,
    current_user: User,
    budget_id: UUID,
) -> dict:
    if not current_user.household_id:
        raise ValueError("Not in a household")

    members = await get_household_members(current_user.household_id, db)
    member_count = len(members) or 1
    member_ids = [m.id for m in members]
    name_by_id = {m.id: _member_name(m) for m in members}

    member_income = []
    combined_income = Decimal("0")
    for m in members:
        q = select(IncomeSource).where(
            IncomeSource.user_id == m.id,
            IncomeSource.is_active.is_(True),
            IncomeSource.budget_id == budget_id,
        )
        rows = list((await db.execute(q)).scalars().all())
        monthly = sum((_monthly_equiv(r.amount, r.frequency) for r in rows), Decimal("0"))
        combined_income += monthly
        member_income.append(
            {
                "member_id": m.id,
                "member_name": name_by_id[m.id],
                "monthly_income": monthly,
                "sources": [
                    {
                        "id": str(r.id),
                        "name": r.name,
                        "amount": str(r.amount),
                        "frequency": r.frequency,
                        "next_pay_date": r.next_pay_date.isoformat() if r.next_pay_date else None,
                    }
                    for r in rows
                ],
            }
        )

    hh_id = current_user.household_id
    bill_q = select(Bill).where(
        Bill.is_active.is_(True),
        _overview_obligation_filter(Bill, hh_id, budget_id, member_ids),
    )
    bills = list((await db.execute(bill_q)).scalars().all())

    debt_q = select(Debt).where(
        Debt.is_active.is_(True),
        _overview_obligation_filter(Debt, hh_id, budget_id, member_ids),
    )
    debts = [
        d
        for d in (await db.execute(debt_q)).scalars().all()
        if Decimal(str(d.balance or 0)) > 0
    ]
    paid_debt_ids = await _paid_debt_ids_this_month(db, [d.id for d in debts])

    def bill_line(b: Bill) -> dict:
        share, _ = _bill_user_share(b, member_count, current_user.id)
        aid = b.assigned_member_id or b.user_id
        due = b.postpone_until or b.start_date
        return {
            "id": b.id,
            "name": b.name or "Untitled bill",
            "item_type": "bill",
            "amount": Decimal(str(b.amount or 0)),
            "user_share": share,
            "due_date": due,
            "is_paid": bool(b.is_paid),
            "assigned_member_id": aid,
            "assigned_member_name": name_by_id.get(aid),
            "is_household_bill": bool(b.household_id),
        }

    def debt_line(d: Debt) -> dict:
        share, responsible, full = _debt_user_share(d, member_count, current_user.id)
        aid = d.user_id
        return {
            "id": d.id,
            "name": d.name or "Untitled debt",
            "item_type": "debt",
            "amount": full or Decimal(str(d.minimum_payment or 0)),
            "user_share": share,
            "due_date": _debt_next_due(d),
            "is_paid": d.id in paid_debt_ids,
            "assigned_member_id": aid,
            "assigned_member_name": name_by_id.get(aid),
            "is_household_bill": bool(d.household_id),
        }

    all_lines: list[dict] = []
    my_obligations: list[dict] = []

    for b in bills:
        ln = bill_line(b)
        all_lines.append(ln)
        _, responsible = _bill_user_share(b, member_count, current_user.id)
        if responsible:
            my_obligations.append(ln)

    for d in debts:
        ln = debt_line(d)
        all_lines.append(ln)
        _, responsible, _ = _debt_user_share(d, member_count, current_user.id)
        if responsible:
            my_obligations.append(ln)

    by_person_map: dict[UUID, list] = {m.id: [] for m in members}
    for b in bills:
        aid = b.assigned_member_id or b.user_id
        if aid in by_person_map:
            by_person_map[aid].append(bill_line(b))
    for d in debts:
        for aid in _debt_assignee_ids(d, member_ids):
            if aid in by_person_map:
                by_person_map[aid].append(debt_line(d))

    by_person = []
    for m in members:
        lines = by_person_map.get(m.id, [])
        total = sum((ln["user_share"] for ln in lines), Decimal("0"))
        paid = sum((ln["user_share"] for ln in lines if ln["is_paid"]), Decimal("0"))
        by_person.append(
            {
                "member_id": m.id,
                "member_name": name_by_id[m.id],
                "bills": lines,
                "total": total,
                "paid_total": paid,
            }
        )

    combined_obligations_total = sum((ln["user_share"] for ln in all_lines), Decimal("0"))
    combined_remaining = combined_income - combined_obligations_total

    per_person_remaining = []
    income_by_id = {row["member_id"]: row["monthly_income"] for row in member_income}
    for group in by_person:
        mid = group["member_id"]
        inc = income_by_id.get(mid, Decimal("0"))
        owed = group["total"]
        per_person_remaining.append(
            {
                "member_id": mid,
                "member_name": group["member_name"],
                "income": inc,
                "bills": owed,
                "remaining": inc - owed,
            }
        )

    return {
        "budget_id": budget_id,
        "household_id": current_user.household_id,
        "combined_income": combined_income,
        "combined_bills_total": combined_obligations_total,
        "combined_remaining": combined_remaining,
        "member_income": member_income,
        "my_bills": my_obligations,
        "by_person": by_person,
        "combined_bills_list": all_lines,
        "per_person_remaining": per_person_remaining,
    }
