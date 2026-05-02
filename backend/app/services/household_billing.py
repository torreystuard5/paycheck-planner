import asyncio
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.bill_member_payment import BillMemberPayment
from app.models.user import User


def _bill_amount_decimal(bill: Bill) -> Decimal:
    """Coerce bill.amount to Decimal; DB may return None despite server_default."""
    if bill.amount is None:
        return Decimal("0")
    return Decimal(str(bill.amount))


async def calculate_member_shares(
    bill: Bill,
    household_members: list[User],
    db: AsyncSession,
) -> list[dict]:
    """Calculate per-member shares for a household bill using split_evenly mode.

    Returns list of dicts:
      { member_id, member_name, member_share, member_paid, member_balance }
    """
    if not household_members:
        return []

    member_count = len(household_members)
    bill_amount = _bill_amount_decimal(bill)
    share_per_member = (bill_amount / member_count).quantize(Decimal("0.01"))

    # Fetch sum of payments per member for this bill
    result = await db.execute(
        select(
            BillMemberPayment.member_id,
            func.coalesce(func.sum(BillMemberPayment.amount_paid), 0).label("total_paid"),
        )
        .where(BillMemberPayment.bill_id == bill.id)
        .group_by(BillMemberPayment.member_id)
    )
    paid_map: dict[UUID, Decimal] = {}
    for row in result.all():
        paid_map[row.member_id] = Decimal(str(row.total_paid))

    shares = []
    for member in household_members:
        member_paid = paid_map.get(member.id, Decimal("0.00"))
        member_balance = share_per_member - member_paid
        name = f"{member.first_name or ''} {member.last_name or ''}".strip() or (member.email or "Member")
        shares.append({
            "member_id": member.id,
            "member_name": name,
            "share": share_per_member,
            "paid": member_paid,
            "balance": member_balance,
        })

    return shares


async def build_breakdown_dict(
    bill: Bill,
    household_members: list[User],
    db: AsyncSession,
) -> dict | None:
    """Shared breakdown payload (used by single-bill and batch endpoints)."""
    if not bill.household_id:
        return None

    member_shares = await calculate_member_shares(bill, household_members, db)

    total_paid = sum(m["paid"] for m in member_shares)
    bill_amount = _bill_amount_decimal(bill)
    total_remaining = bill_amount - total_paid

    return {
        "bill_id": bill.id,
        "total_paid": total_paid,
        "total_remaining": total_remaining,
        "members": member_shares,
    }


async def get_bill_breakdown(
    bill: Bill,
    db: AsyncSession,
) -> dict | None:
    """Return full bill breakdown with per-member shares."""
    if not bill.household_id:
        return None

    result = await db.execute(
        select(User).where(User.household_id == bill.household_id)
    )
    members = list(result.scalars().all())

    return await build_breakdown_dict(bill, members, db)


async def batch_household_breakdown_dicts(
    bills: list[Bill],
    household_id: UUID,
    db: AsyncSession,
) -> dict[UUID, dict]:
    """Build breakdowns for many bills with one household-member query and parallel aggregates."""
    if not bills:
        return {}

    result = await db.execute(select(User).where(User.household_id == household_id))
    members = list(result.scalars().all())
    if not members:
        return {}

    async def _one(bill: Bill) -> tuple[UUID, dict | None]:
        data = await build_breakdown_dict(bill, members, db)
        if data is None:
            return bill.id, None
        return bill.id, data

    pairs = await asyncio.gather(*[_one(b) for b in bills])
    out: dict[UUID, dict] = {}
    for bid, data in pairs:
        if data is not None:
            out[bid] = data
    return out
