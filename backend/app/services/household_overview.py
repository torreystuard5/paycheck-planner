"""Household financial overview — single source for combined income and bill views."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.income import IncomeSource
from app.models.user import User
from app.services.household_service import get_household_members
from app.utils.budget import apply_household_budget_filter


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


async def build_household_financial_overview(
    db: AsyncSession,
    current_user: User,
    budget_id: UUID,
) -> dict:
    if not current_user.household_id:
        raise ValueError("Not in a household")

    members = await get_household_members(current_user.household_id, db)
    member_count = len(members) or 1
    name_by_id = {m.id: _member_name(m) for m in members}

    member_income = []
    combined_income = Decimal("0")
    for m in members:
        # IncomeSource has budget_id only (no household_id) — do not use apply_household_budget_filter.
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

    bill_q = select(Bill).where(
        Bill.is_active.is_(True),
        or_(
            Bill.household_id == current_user.household_id,
            Bill.user_id.in_([m.id for m in members]),
        ),
    )
    bill_q = apply_household_budget_filter(bill_q, Bill, current_user, budget_id)
    bills = list((await db.execute(bill_q)).scalars().all())

    def to_line(b: Bill) -> dict:
        share, responsible = _bill_user_share(b, member_count, current_user.id)
        aid = b.assigned_member_id or b.user_id
        due = b.postpone_until or b.start_date
        return {
            "id": b.id,
            "name": b.name,
            "amount": Decimal(str(b.amount or 0)),
            "user_share": share,
            "due_date": due,
            "is_paid": bool(b.is_paid),
            "assigned_member_id": aid,
            "assigned_member_name": name_by_id.get(aid),
            "is_household_bill": bool(b.household_id),
        }

    all_lines = []
    my_bills = []
    for b in bills:
        ln = to_line(b)
        all_lines.append(ln)
        _, responsible = _bill_user_share(b, member_count, current_user.id)
        if responsible:
            my_bills.append(ln)

    by_person_map: dict[UUID, list] = {m.id: [] for m in members}
    for b in bills:
        aid = b.assigned_member_id or b.user_id
        if aid in by_person_map:
            by_person_map[aid].append(to_line(b))

    by_person = []
    for m in members:
        lines = by_person_map.get(m.id, [])
        total = sum((ln["user_share"] for ln in lines), Decimal("0"))
        paid = sum(
            (ln["user_share"] for ln in lines if ln["is_paid"]),
            Decimal("0"),
        )
        by_person.append(
            {
                "member_id": m.id,
                "member_name": name_by_id[m.id],
                "bills": lines,
                "total": total,
                "paid_total": paid,
            }
        )

    combined_bills_total = sum((ln["user_share"] for ln in all_lines), Decimal("0"))
    combined_remaining = combined_income - combined_bills_total

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
        "combined_bills_total": combined_bills_total,
        "combined_remaining": combined_remaining,
        "member_income": member_income,
        "my_bills": my_bills,
        "by_person": by_person,
        "combined_bills_list": all_lines,
        "per_person_remaining": per_person_remaining,
    }
