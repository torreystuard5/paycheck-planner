"""Central pay-period planning: calendar, natural/effective assignment, pull-forward."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pay_period_item_override import PayPeriodItemOverride
from app.models.paycheck_checklist import PaycheckChecklist
from app.models.user import User
from app.services.pay_period_constants import OVERRIDE_PULL_FORWARD
from app.services.paycheck_data import (
    fetch_paycheck_entries,
    fetch_scoped_bills_debts,
    get_paid_bill_map,
    get_paid_debt_ids_in_window,
    household_member_ids,
    resolve_anchor_income,
)
from app.services.bill_cycles import local_today
from app.services.paycheck_assignment import (
    apply_effective_lists,
    enrich_assigned_item,
    parse_item_due_date,
)
from app.services.paycheck_engine import (
    assign_bills_to_paycheck,
    build_paycheck_plan,
    generate_pay_dates,
    get_pay_period_window,
    occurrence_key,
)
from app.services.paycheck_planning_state import (
    build_current_paycheck_plan,
    build_paycheck_planning_state,
)


async def load_active_overrides(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> list[PayPeriodItemOverride]:
    clauses = [
        PayPeriodItemOverride.revoked_at.is_(None),
        PayPeriodItemOverride.budget_id == budget_id,
    ]
    if user.household_id:
        clauses.append(PayPeriodItemOverride.household_id == user.household_id)
    else:
        clauses.append(PayPeriodItemOverride.household_id.is_(None))
        clauses.append(PayPeriodItemOverride.created_by_user_id == user.id)

    result = await db.execute(select(PayPeriodItemOverride).where(and_(*clauses)))
    return list(result.scalars().all())


async def _build_natural_for_period(
    bills: list[Any],
    debts: list[Any],
    window_start: date,
    window_end: date,
    current_date: date,
    paid_bill_map: dict,
    paid_debt_ids: set[UUID],
) -> list[dict]:
    return assign_bills_to_paycheck(
        bills,
        debts,
        window_start,
        window_end,
        current_date,
        paid_debt_ids=paid_debt_ids,
        paid_bill_map=paid_bill_map,
    )


async def build_pay_calendar_context(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> dict[str, Any]:
    """Resolve anchor income, pay dates, and period windows for current + next."""
    income = await resolve_anchor_income(db, user, budget_id)
    entries = await fetch_paycheck_entries(db, user, budget_id)
    bills, debts = await fetch_scoped_bills_debts(db, user, budget_id)
    member_ids = await household_member_ids(db, user)

    income_sources = [income] if income else []
    today = local_today(user)
    plan = await build_paycheck_plan(
        user=user,
        income_sources=income_sources,
        bills=bills,
        debts=debts,
        num_periods=2,
        current_date=today,
        paycheck_entries=entries,
        paid_debt_ids=set(),
        db=db,
        user_ids=member_ids,
        get_paid_bill_ids_fn=get_paid_bill_map,
    )

    paychecks = plan.get("paychecks") or []
    if len(paychecks) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pay periods available. Add an income source with a pay date for this budget.",
        )

    current_pc = paychecks[0]
    current_start = current_pc["paycheck_date"]
    next_start = paychecks[1]["paycheck_date"] if len(paychecks) > 1 else None

    pay_dates = generate_pay_dates(current_start, plan["pay_frequency"], 3)
    if len(pay_dates) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to compute pay period boundaries.",
        )

    current_end = get_pay_period_window(pay_dates[0], pay_dates[1])[1]
    next_end = (
        get_pay_period_window(pay_dates[1], pay_dates[2])[1]
        if len(pay_dates) > 2 and next_start
        else current_end
    )

    overall_end = next_end if next_start else current_end
    paid_bill_map = await get_paid_bill_map(
        db,
        member_ids,
        [b.id for b in bills],
        current_start,
        overall_end,
        bills=bills,
        user=user,
    )

    return {
        "budget_id": budget_id,
        "pay_frequency": plan["pay_frequency"],
        "currency": plan.get("currency", "USD"),
        "bills": bills,
        "debts": debts,
        "entries": entries,
        "income_sources": income_sources,
        "current_start": current_start,
        "current_end": current_end,
        "next_start": next_start,
        "next_end": next_end,
        "current_paycheck_amount": current_pc["paycheck_amount"],
        "next_paycheck_amount": paychecks[1]["paycheck_amount"] if len(paychecks) > 1 else None,
        "paid_bill_map": paid_bill_map,
        "member_ids": member_ids,
    }


def _period_totals(items: list[dict], paycheck_amount: Decimal) -> dict[str, Any]:
    total_due = sum((Decimal(str(i["amount"])) for i in items), Decimal("0"))
    paid_amount = sum(
        (Decimal(str(i["amount"])) for i in items if i.get("is_paid")),
        Decimal("0"),
    )
    still_owed = total_due - paid_amount
    remaining = paycheck_amount - still_owed
    paid_count = sum(1 for i in items if i.get("is_paid"))
    return {
        "total_due": total_due,
        "total_paid": paid_amount,
        "total_still_owed": still_owed,
        "remaining": remaining,
        "paid_count": paid_count,
        "item_count": len(items),
        "status": "on_track" if remaining >= 0 else "over_budget",
    }


async def build_period_view(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    label: Literal["current", "next"],
) -> dict[str, Any]:
    ctx = await build_pay_calendar_context(db, user, budget_id)
    today = date.today()

    if label == "next" and not ctx["next_start"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No next pay period is available for this budget.",
        )

    current_start = ctx["current_start"]
    current_end = ctx["current_end"]
    next_start = ctx["next_start"]
    next_end = ctx["next_end"]

    paid_current = await get_paid_debt_ids_in_window(
        db, [d.id for d in ctx["debts"]], current_start, current_end
    )
    natural_current = await _build_natural_for_period(
        ctx["bills"],
        ctx["debts"],
        current_start,
        current_end,
        today,
        ctx["paid_bill_map"],
        paid_current,
    )

    natural_next: list[dict] = []
    if next_start:
        paid_next = await get_paid_debt_ids_in_window(
            db, [d.id for d in ctx["debts"]], next_start, next_end
        )
        natural_next = await _build_natural_for_period(
            ctx["bills"],
            ctx["debts"],
            next_start,
            next_end,
            today,
            ctx["paid_bill_map"],
            paid_next,
        )

    overrides = await load_active_overrides(db, user, budget_id)
    current_items, next_items = apply_effective_lists(
        natural_current,
        natural_next,
        current_start,
        next_start or current_start,
        overrides,
    )

    if label == "current":
        items = current_items
        period_start, period_end = current_start, current_end
        paycheck_amount = Decimal(str(ctx["current_paycheck_amount"]))
    else:
        items = next_items
        period_start, period_end = next_start, next_end
        paycheck_amount = Decimal(str(ctx["next_paycheck_amount"] or 0))

    totals = _period_totals(items, paycheck_amount)
    return {
        "meta": {
            "period_start": period_start,
            "period_end": period_end,
            "paycheck_date": period_start,
            "label": label,
        },
        "paycheck_amount": paycheck_amount,
        "assigned_items": items,
        **totals,
    }


async def get_period_summary(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> dict[str, Any]:
    ctx = await build_pay_calendar_context(db, user, budget_id)
    return {
        "budget_id": budget_id,
        "pay_frequency": ctx["pay_frequency"],
        "current": {
            "period_start": ctx["current_start"],
            "period_end": ctx["current_end"],
            "paycheck_date": ctx["current_start"],
            "label": "current",
        },
        "next": (
            {
                "period_start": ctx["next_start"],
                "period_end": ctx["next_end"],
                "paycheck_date": ctx["next_start"],
                "label": "next",
            }
            if ctx["next_start"]
            else None
        ),
    }


async def _clear_checklist_for_occurrence(
    db: AsyncSession,
    item_type: str,
    item_id: UUID,
) -> None:
    await db.execute(
        delete(PaycheckChecklist).where(
            PaycheckChecklist.item_type == item_type,
            PaycheckChecklist.item_id == item_id,
        )
    )


async def pull_forward(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    item_type: str,
    item_id: UUID,
    occurrence_due_date: date,
) -> PayPeriodItemOverride:
    ctx = await build_pay_calendar_context(db, user, budget_id)
    if not ctx["next_start"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No next pay period is available.",
        )

    today = date.today()
    paid_next = await get_paid_debt_ids_in_window(
        db, [d.id for d in ctx["debts"]], ctx["next_start"], ctx["next_end"]
    )
    natural_next = await _build_natural_for_period(
        ctx["bills"],
        ctx["debts"],
        ctx["next_start"],
        ctx["next_end"],
        today,
        ctx["paid_bill_map"],
        paid_next,
    )

    key = occurrence_key(item_type, item_id, occurrence_due_date)
    natural_by_key = {
        occurrence_key(i["item_type"], i["id"], parse_item_due_date(i)): i for i in natural_next
    }
    if key not in natural_by_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item is not assigned to the next pay period for this occurrence.",
        )
    target_item = natural_by_key[key]
    if target_item.get("is_paid"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paid items cannot be pulled into the current pay period.",
        )
    if target_item.get("is_overdue"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Overdue items cannot be pulled forward; they belong in the current period via carry-forward.",
        )

    existing = await db.execute(
        select(PayPeriodItemOverride).where(
            PayPeriodItemOverride.item_type == item_type,
            PayPeriodItemOverride.item_id == item_id,
            PayPeriodItemOverride.occurrence_due_date == occurrence_due_date,
            PayPeriodItemOverride.revoked_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This occurrence is already pulled into the current period.",
        )

    row = PayPeriodItemOverride(
        household_id=user.household_id,
        budget_id=budget_id,
        item_type=item_type,
        item_id=item_id,
        occurrence_due_date=occurrence_due_date,
        natural_period_start=ctx["next_start"],
        effective_period_start=ctx["current_start"],
        override_type=OVERRIDE_PULL_FORWARD,
        created_by_user_id=user.id,
    )
    db.add(row)
    await _clear_checklist_for_occurrence(db, item_type, item_id)
    await db.flush()
    await db.refresh(row)
    return row


async def revert_pull_forward(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    item_type: str,
    item_id: UUID,
    occurrence_due_date: date,
) -> PayPeriodItemOverride:
    result = await db.execute(
        select(PayPeriodItemOverride).where(
            PayPeriodItemOverride.item_type == item_type,
            PayPeriodItemOverride.item_id == item_id,
            PayPeriodItemOverride.occurrence_due_date == occurrence_due_date,
            PayPeriodItemOverride.budget_id == budget_id,
            PayPeriodItemOverride.revoked_at.is_(None),
            PayPeriodItemOverride.override_type == OVERRIDE_PULL_FORWARD,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active pull-forward override for this occurrence.",
        )
    if user.household_id and row.household_id != user.household_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found.")
    if not user.household_id and row.created_by_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found.")

    row.revoked_at = datetime.now(timezone.utc)
    await _clear_checklist_for_occurrence(db, item_type, item_id)
    await db.flush()
    await db.refresh(row)
    return row


async def revert_pull_forward_by_id(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    override_id: UUID,
) -> PayPeriodItemOverride:
    result = await db.execute(
        select(PayPeriodItemOverride).where(
            PayPeriodItemOverride.id == override_id,
            PayPeriodItemOverride.budget_id == budget_id,
            PayPeriodItemOverride.revoked_at.is_(None),
            PayPeriodItemOverride.override_type == OVERRIDE_PULL_FORWARD,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found.")
    return await revert_pull_forward(
        db,
        user,
        budget_id,
        row.item_type,
        row.item_id,
        row.occurrence_due_date,
    )


async def build_upcoming_paycheck_response(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    upcoming_count: int = 3,
) -> dict[str, Any]:
    """Current paycheck + next N periods with effective assignments."""
    periods = max(2, 1 + upcoming_count)
    plan = await build_full_paycheck_plan_response(db, user, budget_id, periods=periods)
    paychecks = plan.get("paychecks") or []
    current = paychecks[0] if paychecks else None
    upcoming = paychecks[1 : 1 + upcoming_count] if len(paychecks) > 1 else []
    return {
        "budget_id": budget_id,
        "pay_frequency": plan.get("pay_frequency"),
        "currency": plan.get("currency"),
        "current": current,
        "upcoming": upcoming,
    }


async def build_full_paycheck_plan_response(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    periods: int = 4,
) -> dict[str, Any]:
    """Budget-scoped paycheck plan with effective assignments for period 0/1."""
    income = await resolve_anchor_income(db, user, budget_id)
    entries = await fetch_paycheck_entries(db, user, budget_id)
    bills, debts = await fetch_scoped_bills_debts(db, user, budget_id)
    member_ids = await household_member_ids(db, user)

    income_sources = [income] if income else []
    today = local_today(user)
    plan = await build_paycheck_plan(
        user=user,
        income_sources=income_sources,
        bills=bills,
        debts=debts,
        num_periods=periods,
        current_date=today,
        paycheck_entries=entries,
        paid_debt_ids=set(),
        db=db,
        user_ids=member_ids,
        get_paid_bill_ids_fn=get_paid_bill_map,
    )

    overrides = await load_active_overrides(db, user, budget_id)
    paychecks = plan.get("paychecks") or []
    planning: dict[str, Any] | None = None
    ctx: dict[str, Any] | None = None

    if paychecks:
        try:
            ctx = await build_pay_calendar_context(db, user, budget_id)
            planning = await build_paycheck_planning_state(
                db,
                user,
                budget_id,
                ctx=ctx,
                overrides=overrides,
                today=today,
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "paycheck planning state failed; using base plan assignments"
            )
            try:
                anchor = paychecks[0]["paycheck_date"]
                all_dates = generate_pay_dates(
                    anchor, plan["pay_frequency"], min(len(paychecks) + 1, 4)
                )
                if len(all_dates) >= 2:
                    current_end = get_pay_period_window(all_dates[0], all_dates[1])[1]
                    next_start = all_dates[1] if len(all_dates) > 1 else None
                    next_end = (
                        get_pay_period_window(all_dates[1], all_dates[2])[1]
                        if next_start and len(all_dates) > 2
                        else current_end
                    )
                    overall_end = next_end if next_start else current_end
                    fallback_paid_bill_map = await get_paid_bill_map(
                        db,
                        member_ids,
                        [b.id for b in bills],
                        anchor,
                        overall_end,
                        bills=bills,
                        user=user,
                    )
                    fallback_ctx = {
                        "budget_id": budget_id,
                        "pay_frequency": plan["pay_frequency"],
                        "bills": bills,
                        "debts": debts,
                        "income_sources": income_sources,
                        "current_start": anchor,
                        "current_end": current_end,
                        "next_start": next_start,
                        "next_end": next_end,
                        "member_ids": member_ids,
                        "paid_bill_map": fallback_paid_bill_map,
                    }
                    planning = await build_paycheck_planning_state(
                        db,
                        user,
                        budget_id,
                        ctx=fallback_ctx,
                        overrides=overrides,
                        today=today,
                    )
                    ctx = fallback_ctx
            except Exception:
                logging.getLogger(__name__).exception(
                    "paycheck planning fallback also failed; using base plan assignments"
                )

    if paychecks and planning and ctx:
        current_items = planning["assigned_items"]
        next_items = planning["next_period_items"]

        anchor = paychecks[0]["paycheck_date"]
        all_dates = generate_pay_dates(anchor, plan["pay_frequency"], len(paychecks) + 1)

        extended_bill_map = None
        if len(paychecks) > 2 and len(all_dates) >= 3:
            ext_start = all_dates[2]
            tail = min(len(paychecks) - 1, len(all_dates) - 2)
            ext_end = get_pay_period_window(all_dates[tail], all_dates[tail + 1])[1]
            extended_bill_map = await get_paid_bill_map(
                db,
                member_ids,
                [b.id for b in bills],
                ext_start,
                ext_end,
                bills=bills,
                user=user,
            )

        for i, pc in enumerate(paychecks):
            if i == 0:
                items = current_items
            elif i == 1:
                items = next_items
            else:
                if i + 1 >= len(all_dates):
                    items = []
                else:
                    ws, we = get_pay_period_window(all_dates[i], all_dates[i + 1])
                    paid_d = await get_paid_debt_ids_in_window(
                        db, [d.id for d in debts], ws, we
                    )
                    paid_bill_map = ctx.get("paid_bill_map") or extended_bill_map
                    if paid_bill_map is None:
                        paid_bill_map = await get_paid_bill_map(
                            db,
                            member_ids,
                            [b.id for b in bills],
                            ws,
                            we,
                            bills=bills,
                            user=user,
                        )
                    items = await _build_natural_for_period(
                        bills,
                        debts,
                        ws,
                        we,
                        today,
                        paid_bill_map,
                        paid_d,
                    )
                    items = [
                        enrich_assigned_item(
                            it,
                            natural_period_start=pc["paycheck_date"],
                            effective_period_start=pc["paycheck_date"],
                            pulled_forward=False,
                        )
                        for it in items
                    ]

            total_due = sum((Decimal(str(x["amount"])) for x in items), Decimal("0"))
            remaining = Decimal(str(pc["paycheck_amount"])) - total_due
            period_end = (
                get_pay_period_window(all_dates[i], all_dates[i + 1])[1]
                if i + 1 < len(all_dates)
                else ctx["current_end"]
            )
            paychecks[i] = {
                **pc,
                "assigned_items": items,
                "total_due": total_due,
                "remaining": remaining,
                "status": "on_track" if remaining >= 0 else "over_budget",
                "pay_period_start": pc["paycheck_date"],
                "period_start": pc["paycheck_date"],
                "period_end": period_end,
                "is_current": i == 0,
                "is_next": i == 1,
            }

        plan["paychecks"] = paychecks

        paycheck_meta = paychecks[0]
        plan["current_paycheck"] = build_current_paycheck_plan(
            planning,
            paycheck_meta=paycheck_meta,
            ctx=ctx,
        )
    elif paychecks:
        empty_current = {
            "paycheck_context": {
                "pay_period_start": paychecks[0]["paycheck_date"],
                "pay_period_end": None,
                "next_paycheck_date": None,
                "budget_id": budget_id,
                "household_id": user.household_id,
                "user_id": user.id,
            },
            "paycheck_date": paychecks[0]["paycheck_date"],
            "pay_period_start": paychecks[0]["paycheck_date"],
            "pay_period_end": None,
            "next_paycheck_date": None,
            "paycheck_amount": paychecks[0]["paycheck_amount"],
            "total_due": paychecks[0].get("total_due", Decimal("0")),
            "remaining": paychecks[0].get("remaining", Decimal("0")),
            "status": paychecks[0].get("status", "on_track"),
            "assigned_items": paychecks[0].get("assigned_items") or [],
            "assigned_paid_count": sum(
                1 for i in (paychecks[0].get("assigned_items") or []) if i.get("is_paid")
            ),
            "assigned_total_count": len(paychecks[0].get("assigned_items") or []),
            "assigned_paid_amount": Decimal("0"),
            "assigned_total_amount": Decimal("0"),
            "assigned_still_owed": Decimal("0"),
            "assigned_progress_percent": 0.0,
        }
        assigned = empty_current["assigned_items"]
        empty_current["assigned_total_amount"] = sum(
            (Decimal(str(i["amount"])) for i in assigned), Decimal("0")
        )
        empty_current["assigned_paid_amount"] = sum(
            (Decimal(str(i["amount"])) for i in assigned if i.get("is_paid")),
            Decimal("0"),
        )
        empty_current["assigned_still_owed"] = (
            empty_current["assigned_total_amount"] - empty_current["assigned_paid_amount"]
        )
        if empty_current["assigned_total_count"]:
            empty_current["assigned_progress_percent"] = round(
                100.0
                * empty_current["assigned_paid_count"]
                / empty_current["assigned_total_count"],
                1,
            )
        plan["current_paycheck"] = empty_current
    else:
        plan["current_paycheck"] = None

    plan["budget_id"] = budget_id
    return plan
