"""PayDrift Business Edition — sales, deductions, staff pay, funds, net profit."""
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business import (
    BusinessCustomer,
    BusinessDeduction,
    BusinessFund,
    BusinessFundTransaction,
    BusinessSale,
    BusinessStaff,
    BusinessStaffPayRun,
)
from app.models.user_ui_preference import UserUIPreference
from app.models.user import User
from app.schemas.business import (
    BusinessSettingsResponse,
    BusinessSettingsUpdate,
    CustomerCreate,
    CustomerResponse,
    CustomerUpdate,
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
    SaleUpdate,
    SaleSummary,
    StaffCreate,
    StaffPaySummary,
    StaffResponse,
    StaffUpdate,
    StringListResponse,
)
from app.services.business_profit import compute_net_profit
from app.services.business_context import BusinessContext, get_business_ctx

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


async def _customer_name_map(
    db: AsyncSession, user_id: UUID, customer_ids: set[UUID]
) -> dict[UUID, str]:
    if not customer_ids:
        return {}
    r = await db.execute(
        select(BusinessCustomer.id, BusinessCustomer.name).where(
            BusinessCustomer.user_id == user_id,
            BusinessCustomer.id.in_(customer_ids),
        )
    )
    return {row[0]: row[1] for row in r.all()}


# ── Sales summary (before /sales/{id}) ─────────────────────────────


@router.get("/sales/summary", response_model=SaleSummary)
async def sales_summary(
    range_key: str = Query("month", alias="range"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)
    q = select(BusinessSale).where(
        BusinessSale.user_id == ctx.owner_id,
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


@router.get("/sales/category-options", response_model=StringListResponse)
async def sales_category_options(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessSale.category)
        .where(
            BusinessSale.user_id == ctx.owner_id,
            BusinessSale.is_active.is_(True),
            BusinessSale.category.isnot(None),
            BusinessSale.category != "",
        )
        .distinct()
        .limit(200)
    )
    vals = sorted({row[0].strip() for row in r.all() if row[0]})
    return StringListResponse(values=vals)


@router.get("/sales", response_model=list[SaleResponse])
async def list_sales(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    q = select(BusinessSale).where(
        BusinessSale.user_id == ctx.owner_id,
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
        cust_match = exists(
            select(1)
            .select_from(BusinessCustomer)
            .where(
                BusinessCustomer.id == BusinessSale.customer_id,
                BusinessCustomer.user_id == ctx.owner_id,
                or_(
                    BusinessCustomer.name.ilike(like),
                    BusinessCustomer.company.ilike(like),
                    BusinessCustomer.email.ilike(like),
                ),
            )
        )
        q = q.where(
            or_(
                BusinessSale.source.ilike(like),
                BusinessSale.notes.ilike(like),
                BusinessSale.category.ilike(like),
                cust_match,
            )
        )
    q = q.order_by(BusinessSale.sale_date.desc(), BusinessSale.created_at.desc()).limit(LIST_LIMIT)
    r = await db.execute(q)
    rows = list(r.scalars().all())
    cids = {s.customer_id for s in rows if getattr(s, "customer_id", None)}
    cmap = await _customer_name_map(db, ctx.owner_id, cids)
    return [SaleResponse.from_orm_sale(s, cmap.get(s.customer_id)) for s in rows]


@router.post("/sales", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    data: SaleCreate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_sales")

    src = data.source
    cust_name: Optional[str] = None
    if data.customer_id:
        cr = await db.execute(
            select(BusinessCustomer).where(
                BusinessCustomer.id == data.customer_id,
                BusinessCustomer.user_id == ctx.owner_id,
                BusinessCustomer.is_active.is_(True),
            )
        )
        cust = cr.scalar_one_or_none()
        if not cust:
            raise HTTPException(status_code=400, detail="Customer not found")
        cust_name = cust.name
        if not src:
            src = cust.name
    s = BusinessSale(
        user_id=ctx.owner_id,
        customer_id=data.customer_id,
        sale_date=data.date,
        amount=data.amount,
        source=src,
        category=data.category,
        payment_method=data.payment_method,
        notes=data.notes,
        is_taxable=data.is_taxable,
    )
    db.add(s)
    await db.flush()
    await db.refresh(s)
    return SaleResponse.from_orm_sale(s, cust_name)


@router.get("/sales/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessSale).where(
            BusinessSale.id == sale_id,
            BusinessSale.user_id == ctx.owner_id,
            BusinessSale.is_active.is_(True),
        )
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    cmap = await _customer_name_map(db, ctx.owner_id, {s.customer_id} if s.customer_id else set())
    return SaleResponse.from_orm_sale(s, cmap.get(s.customer_id))


@router.patch("/sales/{sale_id}", response_model=SaleResponse)
async def update_sale(
    sale_id: UUID,
    data: SaleUpdate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_sales")

    r = await db.execute(
        select(BusinessSale).where(
            BusinessSale.id == sale_id,
            BusinessSale.user_id == ctx.owner_id,
            BusinessSale.is_active.is_(True),
        )
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    body = data.model_dump(exclude_unset=True)
    if "date" in body:
        s.sale_date = body.pop("date")
    if "customer_id" in body:
        new_cid = body.pop("customer_id")
        if new_cid:
            cr = await db.execute(
                select(BusinessCustomer).where(
                    BusinessCustomer.id == new_cid,
                    BusinessCustomer.user_id == ctx.owner_id,
                    BusinessCustomer.is_active.is_(True),
                )
            )
            if not cr.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Customer not found")
        s.customer_id = new_cid
    for k, v in body.items():
        setattr(s, k, v)
    await db.flush()
    await db.refresh(s)
    cmap = await _customer_name_map(db, ctx.owner_id, {s.customer_id} if s.customer_id else set())
    return SaleResponse.from_orm_sale(s, cmap.get(s.customer_id))


@router.delete("/sales/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_sales")

    r = await db.execute(
        select(BusinessSale).where(
            BusinessSale.id == sale_id,
            BusinessSale.user_id == ctx.owner_id,
            BusinessSale.is_active.is_(True),
        )
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    s.is_active = False
    await db.flush()


# ── Business settings (profile, mileage, fiscal year) ───────────────


async def _get_or_create_owner_pref(db: AsyncSession, owner_id: UUID) -> UserUIPreference:
    r = await db.execute(
        select(UserUIPreference).where(UserUIPreference.user_id == owner_id)
    )
    pref = r.scalar_one_or_none()
    if not pref:
        pref = UserUIPreference(user_id=owner_id, collapsed_sections=[])
        db.add(pref)
        await db.flush()
    return pref


def _pref_to_settings(pref: UserUIPreference | None) -> BusinessSettingsResponse:
    rate = Decimal("0.7000")
    if pref and pref.business_mileage_rate_per_mile is not None:
        rate = Decimal(str(pref.business_mileage_rate_per_mile))
    fiscal = 1
    if pref and getattr(pref, "fiscal_year_start_month", None):
        fiscal = int(pref.fiscal_year_start_month)
    return BusinessSettingsResponse(
        mileage_rate_per_mile=rate,
        business_name=getattr(pref, "business_name", None) if pref else None,
        business_tagline=getattr(pref, "business_tagline", None) if pref else None,
        fiscal_year_start_month=fiscal,
    )


@router.get("/settings", response_model=BusinessSettingsResponse)
async def get_business_settings(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(UserUIPreference).where(UserUIPreference.user_id == ctx.owner_id)
    )
    pref = r.scalar_one_or_none()
    return _pref_to_settings(pref)


@router.patch("/settings", response_model=BusinessSettingsResponse)
async def patch_business_settings(
    data: BusinessSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require_owner()
    pref = await _get_or_create_owner_pref(db, ctx.owner_id)
    if data.mileage_rate_per_mile is not None:
        pref.business_mileage_rate_per_mile = data.mileage_rate_per_mile
    if data.business_name is not None:
        pref.business_name = data.business_name.strip() or None
    if data.business_tagline is not None:
        pref.business_tagline = data.business_tagline.strip() or None
    if data.fiscal_year_start_month is not None:
        pref.fiscal_year_start_month = data.fiscal_year_start_month
    await db.flush()
    await db.refresh(pref)
    return _pref_to_settings(pref)


# ── Customers ──────────────────────────────────────────────────────


@router.get("/customers", response_model=list[CustomerResponse])
async def list_customers(
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    query = select(BusinessCustomer).where(
        BusinessCustomer.user_id == ctx.owner_id,
        BusinessCustomer.is_active.is_(True),
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(
            or_(
                BusinessCustomer.name.ilike(like),
                BusinessCustomer.email.ilike(like),
                BusinessCustomer.company.ilike(like),
            )
        )
    query = query.order_by(BusinessCustomer.name).limit(LIST_LIMIT)
    r = await db.execute(query)
    return list(r.scalars().all())


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_sales")

    c = BusinessCustomer(
        user_id=ctx.owner_id,
        name=data.name.strip(),
        email=(data.email or "").strip() or None,
        phone=(data.phone or "").strip() or None,
        address=(data.address or "").strip() or None,
        company=(data.company or "").strip() or None,
        notes=(data.notes or "").strip() or None,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessCustomer).where(
            BusinessCustomer.id == customer_id,
            BusinessCustomer.user_id == ctx.owner_id,
            BusinessCustomer.is_active.is_(True),
        )
    )
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c


@router.patch("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: UUID,
    data: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_sales")

    r = await db.execute(
        select(BusinessCustomer).where(
            BusinessCustomer.id == customer_id,
            BusinessCustomer.user_id == ctx.owner_id,
            BusinessCustomer.is_active.is_(True),
        )
    )
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None and isinstance(v, str):
            v = v.strip()
        setattr(c, k, v)
    await db.flush()
    await db.refresh(c)
    return c


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_sales")

    r = await db.execute(
        select(BusinessCustomer).where(
            BusinessCustomer.id == customer_id,
            BusinessCustomer.user_id == ctx.owner_id,
            BusinessCustomer.is_active.is_(True),
        )
    )
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    pr = await db.execute(
        select(func.count())
        .select_from(BusinessSale)
        .where(
            BusinessSale.customer_id == customer_id,
            BusinessSale.user_id == ctx.owner_id,
            BusinessSale.is_active.is_(True),
        )
    )
    n = int(pr.scalar_one() or 0)
    if n > 0:
        c.is_active = False
    else:
        await db.delete(c)
    await db.flush()


# ── Deductions ─────────────────────────────────────────────────────


@router.get("/deductions/summary", response_model=DeductionSummary)
async def deductions_summary(
    range_key: str = Query("month", alias="range"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)
    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    q = select(BusinessDeduction).where(
        BusinessDeduction.user_id == ctx.owner_id,
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


@router.get("/deductions/vendor-options", response_model=StringListResponse)
async def deduction_vendor_options(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessDeduction.vendor)
        .where(
            BusinessDeduction.user_id == ctx.owner_id,
            BusinessDeduction.is_active.is_(True),
            BusinessDeduction.vendor.isnot(None),
            BusinessDeduction.vendor != "",
        )
        .distinct()
        .limit(500)
    )
    vals = sorted({row[0].strip() for row in r.all() if row[0]})
    return StringListResponse(values=vals)


@router.get("/deductions/category-options", response_model=StringListResponse)
async def deduction_category_options(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessDeduction.category)
        .where(
            BusinessDeduction.user_id == ctx.owner_id,
            BusinessDeduction.is_active.is_(True),
        )
        .distinct()
        .limit(200)
    )
    vals = sorted({row[0].strip() for row in r.all() if row[0]})
    return StringListResponse(values=vals)


@router.post("/deductions", response_model=DeductionResponse, status_code=status.HTTP_201_CREATED)
async def create_deduction(
    data: DeductionCreate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_deductions")

    d = BusinessDeduction(
        user_id=ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.id == deduction_id,
            BusinessDeduction.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_deductions")

    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.id == deduction_id,
            BusinessDeduction.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_deductions")

    r = await db.execute(
        select(BusinessDeduction).where(
            BusinessDeduction.id == deduction_id,
            BusinessDeduction.user_id == ctx.owner_id,
            BusinessDeduction.is_active.is_(True),
        )
    )
    d = r.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Deduction not found")
    d.is_active = False
    await db.flush()


# ── Staff ───────────────────────────────────────────────────────────


@router.get("/staff/role-options", response_model=StringListResponse)
async def staff_role_options(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessStaff.role)
        .where(
            BusinessStaff.user_id == ctx.owner_id,
            BusinessStaff.is_active.is_(True),
            BusinessStaff.role.isnot(None),
            BusinessStaff.role != "",
        )
        .distinct()
        .limit(200)
    )
    vals = sorted({row[0].strip() for row in r.all() if row[0]})
    return StringListResponse(values=vals)


@router.get("/staff", response_model=list[StaffResponse])
async def list_staff(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessStaff)
        .where(BusinessStaff.user_id == ctx.owner_id, BusinessStaff.is_active.is_(True))
        .order_by(BusinessStaff.name)
        .limit(LIST_LIMIT)
    )
    return list(r.scalars().all())


@router.post("/staff", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    data: StaffCreate,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_staff_pay")

    st = BusinessStaff(
        user_id=ctx.owner_id,
        name=data.name,
        role=data.role,
        pay_type=data.pay_type,
        pay_rate=data.pay_rate,
        pay_frequency=data.pay_frequency,
        anchor_date=data.anchor_date,
        tax_rate=data.tax_rate,
    )
    db.add(st)
    await db.flush()
    await db.refresh(st)
    return st


@router.get("/staff/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_staff_pay")

    r = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_staff_pay")

    r = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)
    r = await db.execute(
        select(BusinessStaffPayRun, BusinessStaff.name)
        .join(BusinessStaff, BusinessStaff.id == BusinessStaffPayRun.staff_id)
        .where(
            BusinessStaffPayRun.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    sr = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == ctx.owner_id,
        )
    )
    if not sr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Staff not found")
    q = select(BusinessStaffPayRun).where(
        BusinessStaffPayRun.staff_id == staff_id,
        BusinessStaffPayRun.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_staff_pay")

    sr = await db.execute(
        select(BusinessStaff).where(
            BusinessStaff.id == staff_id,
            BusinessStaff.user_id == ctx.owner_id,
            BusinessStaff.is_active.is_(True),
        )
    )
    if not sr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Staff not found")
    pr = BusinessStaffPayRun(
        user_id=ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_staff_pay")

    r = await db.execute(
        select(BusinessStaffPayRun).where(
            BusinessStaffPayRun.id == pay_run_id,
            BusinessStaffPayRun.staff_id == staff_id,
            BusinessStaffPayRun.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_staff_pay")

    r = await db.execute(
        select(BusinessStaffPayRun).where(
            BusinessStaffPayRun.id == pay_run_id,
            BusinessStaffPayRun.staff_id == staff_id,
            BusinessStaffPayRun.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    await ensure_default_business_funds(db, ctx.owner_id)
    q = select(BusinessFund).where(
        BusinessFund.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_funds")

    f = BusinessFund(
        user_id=ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    r = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_funds")

    r = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_funds")

    r = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    fr = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == ctx.owner_id,
        )
    )
    if not fr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Fund not found")
    r = await db.execute(
        select(BusinessFundTransaction)
        .where(
            BusinessFundTransaction.fund_id == fund_id,
            BusinessFundTransaction.user_id == ctx.owner_id,
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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_funds")

    fr = await db.execute(
        select(BusinessFund).where(
            BusinessFund.id == fund_id,
            BusinessFund.user_id == ctx.owner_id,
            BusinessFund.is_active.is_(True),
        )
    )
    if not fr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Fund not found")
    amt = data.amount
    if data.kind == "deposit":
        store_amt = abs(amt)
    elif data.kind == "withdrawal":
        store_amt = -abs(amt)
    else:
        store_amt = amt
    t = BusinessFundTransaction(
        user_id=ctx.owner_id,
        fund_id=fund_id,
        tx_date=data.date,
        amount=store_amt,
        kind=data.kind,
        note=data.note,
    )
    db.add(t)
    await db.flush()
    await _recalc_fund_balance(db, fund_id, ctx.owner_id)
    await db.refresh(t)
    return FundTransactionResponse.from_orm_row(t)


@router.delete("/funds/{fund_id}/transactions/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fund_transaction(
    fund_id: UUID,
    tx_id: UUID,
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    ctx.require("manage_funds")

    r = await db.execute(
        select(BusinessFundTransaction).where(
            BusinessFundTransaction.id == tx_id,
            BusinessFundTransaction.fund_id == fund_id,
            BusinessFundTransaction.user_id == ctx.owner_id,
            BusinessFundTransaction.is_active.is_(True),
        )
    )
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t.is_active = False
    await db.flush()
    await _recalc_fund_balance(db, fund_id, ctx.owner_id)


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
    ctx: BusinessContext = Depends(get_business_ctx),
):
    d0, d1 = _parse_range(range_key, start_date, end_date)

    async def sum_sales(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessSale.amount), 0)).where(
                BusinessSale.user_id == ctx.owner_id,
                BusinessSale.is_active.is_(True),
                BusinessSale.sale_date >= a,
                BusinessSale.sale_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_ded(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessDeduction.amount), 0)).where(
                BusinessDeduction.user_id == ctx.owner_id,
                BusinessDeduction.is_active.is_(True),
                BusinessDeduction.deduction_date >= a,
                BusinessDeduction.deduction_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_pay(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessStaffPayRun.net_pay), 0)).where(
                BusinessStaffPayRun.user_id == ctx.owner_id,
                BusinessStaffPayRun.is_active.is_(True),
                BusinessStaffPayRun.period_end >= a,
                BusinessStaffPayRun.period_end <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_fund_dep(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessFundTransaction.amount), 0)).where(
                BusinessFundTransaction.user_id == ctx.owner_id,
                BusinessFundTransaction.is_active.is_(True),
                BusinessFundTransaction.kind == "deposit",
                BusinessFundTransaction.amount > 0,
                BusinessFundTransaction.tx_date >= a,
                BusinessFundTransaction.tx_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    totals = await compute_net_profit(db, ctx.owner_id, d0, d1)

    monthly: list[MonthlyBreakdownRow] = []
    for ms, me in _month_iter(d0, d1):
        a = max(ms, d0)
        b = min(me, d1)
        if a > b:
            continue
        m = await compute_net_profit(db, ctx.owner_id, a, b)
        monthly.append(
            MonthlyBreakdownRow(
                month=a.strftime("%Y-%m"),
                sales=m["total_sales"],
                deductions=m["total_deductions"],
                staff_pay=m["total_staff_pay"],
                net=m["net_profit"],
            )
        )

    return NetProfitResponse(
        range_start=d0,
        range_end=d1,
        total_sales=totals["total_sales"],
        total_deductions=totals["total_deductions"],
        total_staff_pay=totals["total_staff_pay"],
        total_fund_contributions=totals["total_fund_contributions"],
        net_profit=totals["net_profit"],
        monthly=monthly,
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def business_dashboard(
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    await ensure_default_business_funds(db, ctx.owner_id)
    today = date.today()
    mtd0 = date(today.year, today.month, 1)

    async def sum_sales(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessSale.amount), 0)).where(
                BusinessSale.user_id == ctx.owner_id,
                BusinessSale.is_active.is_(True),
                BusinessSale.sale_date >= a,
                BusinessSale.sale_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_ded(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessDeduction.amount), 0)).where(
                BusinessDeduction.user_id == ctx.owner_id,
                BusinessDeduction.is_active.is_(True),
                BusinessDeduction.deduction_date >= a,
                BusinessDeduction.deduction_date <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    async def sum_pay(a: date, b: date) -> Decimal:
        r = await db.execute(
            select(func.coalesce(func.sum(BusinessStaffPayRun.net_pay), 0)).where(
                BusinessStaffPayRun.user_id == ctx.owner_id,
                BusinessStaffPayRun.is_active.is_(True),
                BusinessStaffPayRun.period_end >= a,
                BusinessStaffPayRun.period_end <= b,
            )
        )
        return Decimal(str(r.scalar() or 0))

    week0 = today - timedelta(days=today.weekday())
    ts_today = await sum_sales(today, today)
    ts_week = await sum_sales(week0, today)
    profit_mtd = await compute_net_profit(db, ctx.owner_id, mtd0, today)
    ms = profit_mtd["total_sales"]
    md = profit_mtd["total_deductions"]
    mp = profit_mtd["total_staff_pay"]
    mnet = profit_mtd["net_profit"]

    fr = await db.execute(
        select(BusinessFund).where(
            BusinessFund.user_id == ctx.owner_id,
            BusinessFund.is_active.is_(True),
            BusinessFund.fund_type == "contingency",
        )
    )
    cf = fr.scalar_one_or_none()
    fr2 = await db.execute(
        select(BusinessFund).where(
            BusinessFund.user_id == ctx.owner_id,
            BusinessFund.is_active.is_(True),
            BusinessFund.fund_type == "upgrade",
        )
    )
    uf = fr2.scalar_one_or_none()

    rs = await db.execute(
        select(BusinessSale)
        .where(BusinessSale.user_id == ctx.owner_id, BusinessSale.is_active.is_(True))
        .order_by(BusinessSale.sale_date.desc())
        .limit(5)
    )
    dash_sales = list(rs.scalars().all())
    dcids = {s.customer_id for s in dash_sales if getattr(s, "customer_id", None)}
    dcmap = await _customer_name_map(db, ctx.owner_id, dcids)
    rd = await db.execute(
        select(BusinessDeduction)
        .where(BusinessDeduction.user_id == ctx.owner_id, BusinessDeduction.is_active.is_(True))
        .order_by(BusinessDeduction.deduction_date.desc())
        .limit(5)
    )
    rp = await db.execute(
        select(BusinessStaffPayRun)
        .where(BusinessStaffPayRun.user_id == ctx.owner_id, BusinessStaffPayRun.is_active.is_(True))
        .order_by(BusinessStaffPayRun.period_end.desc())
        .limit(5)
    )

    return DashboardResponse(
        today_sales=ts_today,
        week_sales=ts_week,
        mtd_sales=ms,
        mtd_deductions=md,
        mtd_staff_pay=mp,
        mtd_net_profit=mnet,
        total_deductions_mtd=md,
        contingency_fund=cf,
        upgrade_fund=uf,
        recent_sales=[
            SaleResponse.from_orm_sale(s, dcmap.get(s.customer_id)) for s in dash_sales
        ],
        recent_deductions=[DeductionResponse.from_orm_row(d) for d in rd.scalars().all()],
        recent_pay_runs=list(rp.scalars().all()),
    )
