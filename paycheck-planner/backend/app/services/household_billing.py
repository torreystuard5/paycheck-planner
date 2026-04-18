from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.bill_member_payment import BillMemberPayment
from app.models.user import User


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
    bill_amount = Decimal(str(bill.amount))
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
        shares.append({
            "member_id": member.id,
            "member_name": f"{member.first_name} {member.last_name}".strip(),
            "share": share_per_member,
            "paid": member_paid,
            "balance": member_balance,
        })

    return shares


async def get_bill_breakdown(
    bill: Bill,
    db: AsyncSession,
) -> dict:
    """Return full bill breakdown with per-member shares."""
    if not bill.household_id:
        return None

    # Get household members
    result = await db.execute(
        select(User).where(User.household_id == bill.household_id)
    )
    members = list(result.scalars().all())

    member_shares = await calculate_member_shares(bill, members, db)

    total_paid = sum(m["paid"] for m in member_shares)
    bill_amount = Decimal(str(bill.amount))
    total_remaining = bill_amount - total_paid

    return {
        "bill_id": bill.id,
        "total_paid": total_paid,
        "total_remaining": total_remaining,
        "members": member_shares,
    }
