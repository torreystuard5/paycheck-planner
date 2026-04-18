"""PayDrift Business Edition — sales, deductions, staff pay, funds, net profit."""
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business import (
    BusinessDeduction,
    BusinessFund,
    BusinessFundTransaction,
    BusinessSale,
    BusinessStaff,
    BusinessStaffPayRun,
)
from app.models.user import User
from app.schemas.business import (
    DashboardResponse,
    DeductionCreate,
    DeductionResponse,
    DeductionSummary,
    DeductionUpdate,
    FundCreate,
    FundResponse,
    FundTransactionCreate,
    FundTransactionResponse,
    FundUpdate,
    LIST_LIMIT,
    MonthlyBreakdownRow,
    NetProfitResponse,
    PayRunCreate,
    PayRunResponse,
    PayRunUpdate,
    SaleCreate,
    SaleResponse,
    SaleSummary,
    StaffCreate,
    StaffPaySummary,
    StaffResponse,
    StaffUpdate,
)
from app.utils.security import require_business_mode

router = APIRouter(prefix="/business", tags=["Business"])


def _parse_range(
    range_key: str,
    start: Optional[date],
    end: Optional[date],
) -> tuple[date, date]:
    today = date.today()
    rk = (range_key or "month").lower()
    if rk == "custom":
        if not start or not end:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="custom range requires start_date and end_date",
            )
        if start > end:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date must be on or before end_date",
            )
        return start, end
    if rk == "month":
        return date(today.year, today.month, 1), today
    if rk == "quarter":
        q = (today.month - 1) // 3
        first_m = q * 3 + 1
        return date(today.year, first_m, 1), today
    if rk == "ytd":
        return date(today.year, 1, 1), today
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="range must be month|quarter|ytd|custom",
    )


async def _recalc_fund_balance(db: AsyncSession, fund_id: UUID, user_id: UUID) -> None:
    r = await db.execute(
        select(func.coalesce(func.sum(BusinessFundTransaction.amount), 0)).where(
            BusinessFundTransaction.fund_id == fund_id,
            BusinessFundTransaction.user_id == user_id,
            BusinessFundTransaction.is_active.is_(True),
        )
    )
    total = Decimal(str(r.scalar() or 0))
    fr = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == user_id,
        )
    )
    fund = fr.scalar_one_or_none()
    if fund:
        fund.current_balance = total
        await db.flush()


async def ensure_default_business_funds(db: AsyncSession, user_id: UUID) -> None:
    for ftype, title in (
        ("contingency", "Contingency Fund"),
        ("upgrade", "Upgrade Fund"),
    ):
        r = await db.execute(
            select(BusinessFund).where(
                BusinessFund.user_id == user_id,
                BusinessFund.fund_type == ftype,
                BusinessFund.is_active.is_(True),
            )
        )
        if r.scalar_one_or_none() is None:
            db.add(
                BusinessFund(
                    user_id=user_id,
                    fund_type=ftype,
                    name=title,
                    current_balance=Decimal("0"),
                )
            )
    await db.flush()


# ── Sales summary (before /sales/{id}) ─────────────────────────────


@router.get("/sales/summary", response_model=SaleSummary)
async def sales_summary(
    range_key: str = Query("month", alias="range"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)
    q = select(BusinessSale).where(
        BusinessSale.user_id == user.id,
        BusinessSale.is_active.is_(True),
        BusinessSale.sale_date >= d0,
        BusinessSale.sale_date <= d1,
    )
    r = await db.execute(q.limit(LIST_LIMIT))
    rows = r.scalars().all()
    total = Decimal("0")
    by_cat: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    by_month: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for s in rows:
        amt = Decimal(str(s.amount))
        total += amt
        key = (s.category or "Uncategorized").strip()
        by_cat[key] += amt
        mk = s.sale_date.strftime("%Y-%m")
        by_month[mk] += amt
    return SaleSummary(
        total=total,
        by_category=dict(by_cat),
        by_month=[{"month": k, "total": str(v)} for k, v in sorted(by_month.items())],
    )


@router.get("/sales", response_model=list[SaleResponse])
async def list_sales(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    q = select(BusinessSale).where(
        BusinessSale.user_id == user.id,
        BusinessSale.is_active.is_(True),
    )
    if start_date:
        q = q.where(BusinessSale.sale_date >= start_date)
    if end_date:
        q = q.where(BusinessSale.sale_date <= end_date)
    if category:
        q = q.where(BusinessSale.category == category)
    if search:
        like = f"%{search}%"
        q = q.where(
            or_(
                BusinessSale.source.ilike(like),
                BusinessSale.notes.ilike(like),
                BusinessSale.category.ilike(like),
            )
        )
    q = q.order_by(BusinessSale.sale_date.desc(), BusinessSale.created_at.desc()).limit(LIST_LIMIT)
    r = await db.execute(q)
    return [SaleResponse.from_orm_sale(s) for s in r.scalars().all()]


@router.post("/sales", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    data: SaleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    s = BusinessSale(
        user_id=user.id,
        sale_date=data.date,
        amount=data.amount,
        source=data.source,
        category=data.category,
        payment_method=data.payment_method,
        notes=data.notes,
        is_taxable=data.is_taxable,
    )
    db.add(s)
    await db.flush()
    await db.refresh(s)
    return SaleResponse.from_orm_sale(s)


@router.get("/sales/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessSale).where(
            BusinessSale.id == sale_id,
            BusinessSale.user_id == user.id,
            BusinessSale.is_active.is_(True),
        )
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    return SaleResponse.from_orm_sale(s)


@router.patch("/sales/{sale_id}", response_model=SaleResponse)
async def update_sale(
    sale_id: UUID,
    data: SaleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessSale).where(
            BusinessSale.id == sale_id,
            BusinessSale.user_id == user.id,
            BusinessSale.is_active.is_(True),
        )
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    body = data.model_dump(exclude_unset=True)
    if "date" in body:
        s.sale_date = body.pop("date")
    for k, v in body.items():
        setattr(s, k, v)
    await db.flush()
    await db.refresh(s)
    return SaleResponse.from_orm_sale(s)


@router.delete("/sales/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessSale).where(
            BusinessSale.id == sale_id,
            BusinessSale.user_id == user.id,
            BusinessSale.is_active.is_(True),
        )
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    s.is_active = False
    await db.flush()


# ── Deductions ─────────────────────────────────────────────────────


@router.get("/deductions/summary", response_model=DeductionSummary)
async def deductions_summary(
    range_key: str = Query("month", alias="range"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)
    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.user_id == user.id,
            BusinessDeduction.is_active.is_(True),
            BusinessDeduction.deduction_date >= d0,
            BusinessDeduction.deduction_date <= d1,
        ).limit(LIST_LIMIT)
    )
    rows = r.scalars().all()
    total = Decimal("0")
    by_cat: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    miles_total = Decimal("0")
    for d in rows:
        total += Decimal(str(d.amount))
        by_cat[d.category] += Decimal(str(d.amount))
        if d.is_mileage and d.miles is not None:
            miles_total += Decimal(str(d.miles))
    return DeductionSummary(total=total, by_category=dict(by_cat), total_miles=miles_total)


@router.get("/deductions", response_model=list[DeductionResponse])
async def list_deductions(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    q = select(BusinessDeduction).where(
        BusinessDeduction.user_id == user.id,
        BusinessDeduction.is_active.is_(True),
    )
    if start_date:
        q = q.where(BusinessDeduction.deduction_date >= start_date)
    if end_date:
        q = q.where(BusinessDeduction.deduction_date <= end_date)
    if category:
        q = q.where(BusinessDeduction.category == category)
    if search:
        like = f"%{search}%"
        q = q.where(
            or_(
                BusinessDeduction.vendor.ilike(like),
                BusinessDeduction.description.ilike(like),
                BusinessDeduction.category.ilike(like),
            )
        )
    q = q.order_by(BusinessDeduction.deduction_date.desc()).limit(LIST_LIMIT)
    r = await db.execute(q)
    return [DeductionResponse.from_orm_row(d) for d in r.scalars().all()]


@router.post("/deductions", response_model=DeductionResponse, status_code=status.HTTP_201_CREATED)
async def create_deduction(
    data: DeductionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    d = BusinessDeduction(
        user_id=user.id,
        deduction_date=data.date,
        amount=data.amount,
        category=data.category,
        vendor=data.vendor,
        description=data.description,
        receipt_url=data.receipt_url,
        is_mileage=data.is_mileage,
        miles=data.miles,
    )
    db.add(d)
    await db.flush()
    await db.refresh(d)
    return DeductionResponse.from_orm_row(d)


@router.get("/deductions/{deduction_id}", response_model=DeductionResponse)
async def get_deduction(
    deduction_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.id == deduction_id,
            BusinessDeduction.user_id == user.id,
            BusinessDeduction.is_active.is_(True),
        )
    )
    d = r.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Deduction not found")
    return DeductionResponse.from_orm_row(d)


@router.patch("/deductions/{deduction_id}", response_model=DeductionResponse)
async def update_deduction(
    deduction_id: UUID,
    data: DeductionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.id == deduction_id,
            BusinessDeduction.user_id == user.id,
            BusinessDeduction.is_active.is_(True),
        )
    )
    d = r.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Deduction not found")
    body = data.model_dump(exclude_unset=True)
    if "date" in body:
        d.deduction_date = body.pop("date")
    for k, v in body.items():
        setattr(d, k, v)
    await db.flush()
    await db.refresh(d)
    return DeductionResponse.from_orm_row(d)


@router.delete("/deductions/{deduction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deduction(
    deduction_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.id == deduction_id,
            BusinessDeduction.user_id == user.id,
            BusinessDeduction.is_active.is_(True),
        )
    )
    d = r.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Deduction not found")
    d.is_active = False
    await db.flush()


# ── Staff ───────────────────────────────────────────────────────────


@router.get("/staff", response_model=list[StaffResponse])
async def list_staff(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessStaff)
        .where(BusinessStaff.user_id == user.id, BusinessStaff.is_active.is_(True))
        .order_by(BusinessStaff.name)
        .limit(LIST_LIMIT)
    )
    return list(r.scalars().all())


@router.post("/staff", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    data: StaffCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    st = BusinessStaff(
        user_id=user.id,
        name=data.name,
        role=data.role,
        pay_type=data.pay_type,
        pay_rate=data.pay_rate,
    )
    db.add(st)
    await db.flush()
    await db.refresh(st)
    return st


@router.get("/staff/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == user.id,
            BusinessStaff.is_active.is_(True),
        )
    )
    st = r.scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=404, detail="Staff not found")
    return st


@router.patch("/staff/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: UUID,
    data: StaffUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == user.id,
            BusinessStaff.is_active.is_(True),
        )
    )
    st = r.scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=404, detail="Staff not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(st, k, v)
    await db.flush()
    await db.refresh(st)
    return st


@router.delete("/staff/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == user.id,
        )
    )
    st = r.scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=404, detail="Staff not found")
    pr = await db.execute(
        select(func.count())
        .select_from(BusinessStaffPayRun)
        .where(
            BusinessStaffPayRun.staff_id == staff_id,
            BusinessStaffPayRun.is_active.is_(True),
        )
    )
    cnt = pr.scalar_one()
    if cnt and cnt > 0:
        st.is_active = False
    else:
        await db.delete(st)
    await db.flush()


# ── Pay runs ───────────────────────────────────────────────────────


@router.get("/staff-pay/summary", response_model=StaffPaySummary)
async def staff_pay_summary(
    range_key: str = Query("month", alias="range"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)
    r = await db.execute(
        select(BusinessStaffPayRun, BusinessStaff.name)
        .join(BusinessStaff, BusinessStaff.id == BusinessStaffPayRun.staff_id)
        .where(
            BusinessStaffPayRun.user_id == user.id,
            BusinessStaffPayRun.is_active.is_(True),
            BusinessStaffPayRun.period_end >= d0,
            BusinessStaffPayRun.period_end <= d1,
        )
        .limit(LIST_LIMIT)
    )
    total = Decimal("0")
    by_staff: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    by_period: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for pr, name in r.all():
        np = Decimal(str(pr.net_pay))
        total += np
        by_staff[name or "Staff"] += np
        key = f"{pr.period_start}_{pr.period_end}"
        by_period[key] += np
    return StaffPaySummary(
        total_paid=total,
        by_staff=dict(by_staff),
        by_period=[{"period": k, "total": str(v)} for k, v in by_period.items()],
    )


@router.get("/staff/{staff_id}/pay-runs", response_model=list[PayRunResponse])
async def list_pay_runs(
    staff_id: UUID,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    sr = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == user.id,
        )
    )
    if not sr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Staff not found")
    q = select(BusinessStaffPayRun).where(
        BusinessStaffPayRun.staff_id == staff_id,
        BusinessStaffPayRun.user_id == user.id,
        BusinessStaffPayRun.is_active.is_(True),
    )
    if start_date:
        q = q.where(BusinessStaffPayRun.period_end >= start_date)
    if end_date:
        q = q.where(BusinessStaffPayRun.period_start <= end_date)
    q = q.order_by(BusinessStaffPayRun.period_end.desc()).limit(LIST_LIMIT)
    r = await db.execute(q)
    return list(r.scalars().all())


@router.post(
    "/staff/{staff_id}/pay-runs",
    response_model=PayRunResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pay_run(
    staff_id: UUID,
    data: PayRunCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    sr = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == user.id,
            BusinessStaff.is_active.is_(True),
        )
    )
    if not sr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Staff not found")
    pr = BusinessStaffPayRun(
        user_id=user.id,
        staff_id=staff_id,
        period_start=data.period_start,
        period_end=data.period_end,
        hours=data.hours,
        gross_pay=data.gross_pay,
        taxes_withheld=data.taxes_withheld,
        net_pay=data.net_pay,
        paid_on=data.paid_on,
        notes=data.notes,
    )
    db.add(pr)
    await db.flush()
    await db.refresh(pr)
    return pr


@router.patch("/staff/{staff_id}/pay-runs/{pay_run_id}", response_model=PayRunResponse)
async def update_pay_run(
    staff_id: UUID,
    pay_run_id: UUID,
    data: PayRunUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessStaffPayRun).where(
            BusinessStaffPayRun.id == pay_run_id,
            BusinessStaffPayRun.staff_id == staff_id,
            BusinessStaffPayRun.user_id == user.id,
            BusinessStaffPayRun.is_active.is_(True),
        )
    )
    pr = r.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Pay run not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(pr, k, v)
    await db.flush()
    await db.refresh(pr)
    return pr


@router.delete("/staff/{staff_id}/pay-runs/{pay_run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pay_run(
    staff_id: UUID,
    pay_run_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessStaffPayRun).where(
            BusinessStaffPayRun.id == pay_run_id,
            BusinessStaffPayRun.staff_id == staff_id,
            BusinessStaffPayRun.user_id == user.id,
            BusinessStaffPayRun.is_active.is_(True),
        )
    )
    pr = r.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Pay run not found")
    pr.is_active = False
    await db.flush()


# ── Funds ──────────────────────────────────────────────────────────


@router.get("/funds", response_model=list[FundResponse])
async def list_funds(
    fund_type: Optional[str] = Query(None, pattern="^(contingency|upgrade)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    await ensure_default_business_funds(db, user.id)
    q = select(BusinessFund).where(
        BusinessFund.user_id == user.id,
        BusinessFund.is_active.is_(True),
    )
    if fund_type:
        q = q.where(BusinessFund.fund_type == fund_type)
    q = q.order_by(BusinessFund.fund_type)
    r = await db.execute(q.limit(20))
    return list(r.scalars().all())


@router.post("/funds", response_model=FundResponse, status_code=status.HTTP_201_CREATED)
async def create_fund(
    data: FundCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    f = BusinessFund(
        user_id=user.id,
        fund_type=data.fund_type,
        name=data.name,
        target_amount=data.target_amount,
        monthly_contribution=data.monthly_contribution,
        notes=data.notes,
        current_balance=Decimal("0"),
    )
    db.add(f)
    await db.flush()
    await db.refresh(f)
    return f


@router.get("/funds/{fund_id}", response_model=FundResponse)
async def get_fund(
    fund_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == user.id,
            BusinessFund.is_active.is_(True),
        )
    )
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fund not found")
    return f


@router.patch("/funds/{fund_id}", response_model=FundResponse)
async def update_fund(
    fund_id: UUID,
    data: FundUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == user.id,
            BusinessFund.is_active.is_(True),
        )
    )
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fund not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(f, k, v)
    await db.flush()
    await db.refresh(f)
    return f


@router.delete("/funds/{fund_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fund(
    fund_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == user.id,
            BusinessFund.is_active.is_(True),
        )
    )
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fund not found")
    f.is_active = False
    await db.flush()


@router.get("/funds/{fund_id}/transactions", response_model=list[FundTransactionResponse])
async def list_fund_transactions(
    fund_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    fr = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == user.id,
        )
    )
    if not fr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Fund not found")
    r = await db.execute(
        select(BusinessFundTransaction)
        .where(
            BusinessFundTransaction.fund_id == fund_id,
            BusinessFundTransaction.user_id == user.id,
            BusinessFundTransaction.is_active.is_(True),
        )
        .order_by(BusinessFundTransaction.tx_date.desc())
        .limit(LIST_LIMIT)
    )
    return [FundTransactionResponse.from_orm_row(t) for t in r.scalars().all()]


@router.post(
    "/funds/{fund_id}/transactions",
    response_model=FundTransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_fund_transaction(
    fund_id: UUID,
    data: FundTransactionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    fr = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == user.id,
            BusinessFund.is_active.is_(True),
        )
    )
    if not fr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Fund not found")
    t = BusinessFundTransaction(
        user_id=user.id,
        fund_id=fund_id,
        tx_date=data.date,
        amount=data.amount,
        kind=data.kind,
        note=data.note,
    )
    db.add(t)
    await db.flush()
    await _recalc_fund_balance(db, fund_id, user.id)
    await db.refresh(t)
    return FundTransactionResponse.from_orm_row(t)


@router.delete("/funds/{fund_id}/transactions/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fund_transaction(
    fund_id: UUID,
    tx_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    r = await db.execute(
        select(BusinessFundTransaction).where(
            BusinessFundTransaction.id == tx_id,
            BusinessFundTransaction.fund_id == fund_id,
            BusinessFundTransaction.user_id == user.id,
            BusinessFundTransaction.is_active.is_(True),
        )
    )
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t.is_active = False
    await db.flush()
    await _recalc_fund_balance(db, fund_id, user.id)


# ── Net profit & dashboard ───────────────────────────────────────────


def _month_iter(d0: date, d1: date):
    y, m = d0.year, d0.month
    while date(y, m, 1) <= d1:
        last = calendar.monthrange(y, m)[1]
        ms = date(y, m, 1)
        me = date(y, m, last)
        yield ms, me
        if m == 12:
            y += 1
            m = 1
        else:
            m += 1


@router.get("/net-profit", response_model=NetProfitResponse)
async def net_profit(
    range_key: str = Query("ytd", alias="range"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)

    async def sum_sales(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessSale.amount), 0)).where(
                BusinessSale.user_id == user.id,
                BusinessSale.is_active.is_(True),
                BusinessSale.sale_date >= a,
                BusinessSale.sale_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_ded(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessDeduction.amount), 0)).where(
                BusinessDeduction.user_id == user.id,
                BusinessDeduction.is_active.is_(True),
                BusinessDeduction.deduction_date >= a,
                BusinessDeduction.deduction_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_pay(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessStaffPayRun.net_pay), 0)).where(
                BusinessStaffPayRun.user_id == user.id,
                BusinessStaffPayRun.is_active.is_(True),
                BusinessStaffPayRun.period_end >= a,
                BusinessStaffPayRun.period_end <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_fund_dep(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessFundTransaction.amount), 0)).where(
                BusinessFundTransaction.user_id == user.id,
                BusinessFundTransaction.is_active.is_(True),
                BusinessFundTransaction.kind == "deposit",
                BusinessFundTransaction.amount > 0,
                BusinessFundTransaction.tx_date >= a,
                BusinessFundTransaction.tx_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    ts = await sum_sales(d0, d1)
    td = await sum_ded(d0, d1)
    tp = await sum_pay(d0, d1)
    tfc = await sum_fund_dep(d0, d1)
    net = ts - td - tp

    monthly: list[MonthlyBreakdownRow] = []
    for ms, me in _month_iter(d0, d1):
        a = max(ms, d0)
        b = min(me, d1)
        if a > b:
            continue
        s = await sum_sales(a, b)
        dd = await sum_ded(a, b)
        pp = await sum_pay(a, b)
        monthly.append(
            MonthlyBreakdownRow(
                month=a.strftime("%Y-%m"),
                sales=s,
                deductions=dd,
                staff_pay=pp,
                net=s - dd - pp,
            )
        )

    return NetProfitResponse(
        range_start=d0,
        range_end=d1,
        total_sales=ts,
        total_deductions=td,
        total_staff_pay=tp,
        total_fund_contributions=tfc,
        net_profit=net,
        monthly=monthly,
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def business_dashboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_business_mode),
):
    await ensure_default_business_funds(db, user.id)
    today = date.today()
    mtd0 = date(today.year, today.month, 1)

    async def sum_sales(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessSale.amount), 0)).where(
                BusinessSale.user_id == user.id,
                BusinessSale.is_active.is_(True),
                BusinessSale.sale_date >= a,
                BusinessSale.sale_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_ded(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessDeduction.amount), 0)).where(
                BusinessDeduction.user_id == user.id,
                BusinessDeduction.is_active.is_(True),
                BusinessDeduction.deduction_date >= a,
                BusinessDeduction.deduction_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_pay(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessStaffPayRun.net_pay), 0)).where(
                BusinessStaffPayRun.user_id == user.id,
                BusinessStaffPayRun.is_active.is_(True),
                BusinessStaffPayRun.period_end >= a,
                BusinessStaffPayRun.period_end <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    ms = await sum_sales(mtd0, today)
    md = await sum_ded(mtd0, today)
    mp = await sum_pay(mtd0, today)
    mnet = ms - md - mp

    fr = await db.execute(
        select(BusinessFund).where(
            BusinessFund.user_id == user.id,
            BusinessFund.is_active.is_(True),
            BusinessFund.fund_type == "contingency",
        )
    )
    cf = fr.scalar_one_or_none()
    fr2 = await db.execute(
        select(BusinessFund).where(
            BusinessFund.user_id == user.id,
            BusinessFund.is_active.is_(True),
            BusinessFund.fund_type == "upgrade",
        )
    )
    uf = fr2.scalar_one_or_none()

    rs = await db.execute(
        select(BusinessSale)
        .where(BusinessSale.user_id == user.id, BusinessSale.is_active.is_(True))
        .order_by(BusinessSale.sale_date.desc())
        .limit(5)
    )
    rd = await db.execute(
        select(BusinessDeduction)
        .where(BusinessDeduction.user_id == user.id, BusinessDeduction.is_active.is_(True))
        .order_by(BusinessDeduction.deduction_date.desc())
        .limit(5)
    )
    rp = await db.execute(
        select(BusinessStaffPayRun)
        .where(BusinessStaffPayRun.user_id == user.id, BusinessStaffPayRun.is_active.is_(True))
        .order_by(BusinessStaffPayRun.period_end.desc())
        .limit(5)
    )

    return DashboardResponse(
        mtd_sales=ms,
        mtd_deductions=md,
        mtd_staff_pay=mp,
        mtd_net_profit=mnet,
        contingency_fund=cf,
        upgrade_fund=uf,
        recent_sales=[SaleResponse.from_orm_sale(s) for s in rs.scalars().all()],
        recent_deductions=[DeductionResponse.from_orm_row(d) for d in rd.scalars().all()],
        recent_pay_runs=list(rp.scalars().all()),
    )
