from datetime import date

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.transaction import Payment
from app.models.user import User
from app.services.excel_service import (
    export_all_excel,
    export_bills_csv,
    export_bills_excel,
    export_debts_csv,
    export_debts_excel,
    export_payments_csv,
    export_payments_excel,
    import_bills_csv,
    import_debts_csv,
)
from app.utils.security import get_current_user

router = APIRouter(tags=["Import/Export"])

EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CSV_CONTENT_TYPE = "text/csv"


@router.get("/export/bills")
async def export_bills(
    format: str = Query(default="excel", pattern="^(excel|csv)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill)
        .where(Bill.user_id == current_user.id, Bill.is_active.is_(True))
        .order_by(Bill.due_day)
    )
    bills = result.scalars().all()

    if format == "csv":
        buf = export_bills_csv(bills)
        return StreamingResponse(
            buf,
            media_type=CSV_CONTENT_TYPE,
            headers={"Content-Disposition": 'attachment; filename="bills_export.csv"'},
        )

    buf = export_bills_excel(bills)
    return StreamingResponse(
        buf,
        media_type=EXCEL_CONTENT_TYPE,
        headers={"Content-Disposition": 'attachment; filename="bills_export.xlsx"'},
    )


@router.get("/export/debts")
async def export_debts(
    format: str = Query(default="excel", pattern="^(excel|csv)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Debt)
        .where(Debt.user_id == current_user.id, Debt.is_active.is_(True))
        .order_by(Debt.due_day)
    )
    debts = result.scalars().all()

    if format == "csv":
        buf = export_debts_csv(debts)
        return StreamingResponse(
            buf,
            media_type=CSV_CONTENT_TYPE,
            headers={"Content-Disposition": 'attachment; filename="debts_export.csv"'},
        )

    buf = export_debts_excel(debts)
    return StreamingResponse(
        buf,
        media_type=EXCEL_CONTENT_TYPE,
        headers={"Content-Disposition": 'attachment; filename="debts_export.xlsx"'},
    )


@router.get("/export/payments")
async def export_payments(
    format: str = Query(default="excel", pattern="^(excel|csv)$"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Payment)
        .where(Payment.user_id == current_user.id)
        .options(selectinload(Payment.bill), selectinload(Payment.debt))
        .order_by(Payment.paid_date.desc())
    )
    if start_date:
        query = query.where(Payment.paid_date >= start_date)
    if end_date:
        query = query.where(Payment.paid_date <= end_date)

    result = await db.execute(query)
    payments = result.scalars().all()

    if format == "csv":
        buf = export_payments_csv(payments)
        return StreamingResponse(
            buf,
            media_type=CSV_CONTENT_TYPE,
            headers={"Content-Disposition": 'attachment; filename="payments_export.csv"'},
        )

    buf = export_payments_excel(payments)
    return StreamingResponse(
        buf,
        media_type=EXCEL_CONTENT_TYPE,
        headers={"Content-Disposition": 'attachment; filename="payments_export.xlsx"'},
    )


@router.get("/export/all")
async def export_all(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bills_result = await db.execute(
        select(Bill)
        .where(Bill.user_id == current_user.id, Bill.is_active.is_(True))
        .order_by(Bill.due_day)
    )
    bills = bills_result.scalars().all()

    debts_result = await db.execute(
        select(Debt)
        .where(Debt.user_id == current_user.id, Debt.is_active.is_(True))
        .order_by(Debt.due_day)
    )
    debts = debts_result.scalars().all()

    payments_result = await db.execute(
        select(Payment)
        .where(Payment.user_id == current_user.id)
        .options(selectinload(Payment.bill), selectinload(Payment.debt))
        .order_by(Payment.paid_date.desc())
    )
    payments = payments_result.scalars().all()

    buf = export_all_excel(bills, debts, payments)
    return StreamingResponse(
        buf,
        media_type=EXCEL_CONTENT_TYPE,
        headers={"Content-Disposition": 'attachment; filename="paycheck_planner_export.xlsx"'},
    )


@router.post("/import/bills")
async def import_bills(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    result = import_bills_csv(content, current_user.id)

    imported_count = 0
    for row_data in result["valid_rows"]:
        bill = Bill(**row_data)
        db.add(bill)
        imported_count += 1

    if imported_count:
        await db.flush()

    return {
        "imported_count": imported_count,
        "error_count": len(result["errors"]),
        "errors": result["errors"],
    }


@router.post("/import/debts")
async def import_debts(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    result = import_debts_csv(content, current_user.id)

    imported_count = 0
    for row_data in result["valid_rows"]:
        debt = Debt(**row_data)
        db.add(debt)
        imported_count += 1

    if imported_count:
        await db.flush()

    return {
        "imported_count": imported_count,
        "error_count": len(result["errors"]),
        "errors": result["errors"],
    }
