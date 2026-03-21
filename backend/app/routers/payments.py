from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.transaction import Payment
from app.models.user import User
from app.schemas.payment import PaymentCreate, PaymentResponse
from app.services.household_service import log_activity
from app.utils.security import get_current_user

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entity_name = "payment"
    # Validate that the bill or debt belongs to the current user or household
    if data.bill_id:
        result = await db.execute(select(Bill).where(Bill.id == data.bill_id))
        bill = result.scalar_one_or_none()
        if not bill:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bill not found or does not belong to you",
            )
        if bill.user_id != current_user.id and (
            not current_user.household_id or bill.household_id != current_user.household_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bill not found or does not belong to you",
            )
        entity_name = bill.name

    if data.debt_id:
        result = await db.execute(select(Debt).where(Debt.id == data.debt_id))
        debt_obj = result.scalar_one_or_none()
        if not debt_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Debt not found or does not belong to you",
            )
        if debt_obj.user_id != current_user.id and (
            not current_user.household_id or debt_obj.household_id != current_user.household_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Debt not found or does not belong to you",
            )
        entity_name = debt_obj.name

    payment = Payment(
        user_id=current_user.id,
        bill_id=data.bill_id,
        debt_id=data.debt_id,
        amount=data.amount,
        paid_date=data.paid_date,
        pay_period_date=data.pay_period_date,
        is_extra=data.is_extra,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="paid",
                entity_type="payment",
                entity_name=entity_name,
                details=f"${data.amount}",
                db=db,
            )
        except Exception:
            pass

    return payment


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    pay_period_date: date | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        from app.services.household_service import get_household_members
        members = await get_household_members(current_user.household_id, db)
        member_ids = [m.id for m in members]
        query = select(Payment).where(Payment.user_id.in_(member_ids))
    else:
        query = select(Payment).where(Payment.user_id == current_user.id)

    if pay_period_date:
        query = query.where(Payment.pay_period_date == pay_period_date)
    if start_date:
        query = query.where(Payment.paid_date >= start_date)
    if end_date:
        query = query.where(Payment.paid_date <= end_date)

    query = query.order_by(Payment.paid_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.user_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(
    payment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.user_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    await db.delete(payment)
    await db.flush()
