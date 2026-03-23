from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paycheck_checklist import PaycheckChecklist
from app.models.user import User
from app.schemas.paycheck_checklist import ChecklistItemOut, ChecklistToggle
from app.utils.security import get_current_user

router = APIRouter(prefix="/paycheck-checklist", tags=["Paycheck Checklist"])


@router.get("", response_model=list[ChecklistItemOut])
async def get_checklist(
    pay_period_start: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all checklist items for this user and pay period."""
    result = await db.execute(
        select(PaycheckChecklist).where(
            PaycheckChecklist.user_id == current_user.id,
            PaycheckChecklist.pay_period_start == pay_period_start,
        )
    )
    return list(result.scalars().all())


@router.put("", response_model=ChecklistItemOut)
async def toggle_checklist_item(
    body: ChecklistToggle,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle a checklist item (create if doesn't exist, update if does)."""
    result = await db.execute(
        select(PaycheckChecklist).where(
            PaycheckChecklist.user_id == current_user.id,
            PaycheckChecklist.item_type == body.item_type,
            PaycheckChecklist.item_id == body.item_id,
            PaycheckChecklist.pay_period_start == body.pay_period_start,
        )
    )
    item = result.scalar_one_or_none()

    if item is None:
        item = PaycheckChecklist(
            user_id=current_user.id,
            item_type=body.item_type,
            item_id=body.item_id,
            pay_period_start=body.pay_period_start,
            is_checked=body.is_checked,
            checked_at=datetime.now(timezone.utc) if body.is_checked else None,
        )
        db.add(item)
    else:
        item.is_checked = body.is_checked
        item.checked_at = datetime.now(timezone.utc) if body.is_checked else None

    await db.flush()
    await db.refresh(item)
    return item


@router.delete("")
async def reset_checklist(
    pay_period_start: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset/clear all checklist items for a pay period."""
    await db.execute(
        delete(PaycheckChecklist).where(
            PaycheckChecklist.user_id == current_user.id,
            PaycheckChecklist.pay_period_start == pay_period_start,
        )
    )
    return {"detail": "Checklist reset successfully"}
