from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.income import IncomeSource
from app.models.paystub_upload import PaystubUpload
from app.models.user import User
from app.schemas.income import IncomeCreate, IncomeResponse, IncomeUpdate
from app.schemas.paystub import (
    PaystubConfirmRequest,
    PaystubHistoryItem,
    PaystubOcrResponse,
    PaystubUploadResponse,
)
from app.services.paystub_service import run_ocr_on_file, save_upload_file
from app.utils.security import get_current_user

router = APIRouter(prefix="/income", tags=["Income Sources"])

INCOME_SORT_FIELDS = {"source", "amount", "pay_date", "created_at"}


@router.post("", response_model=IncomeResponse, status_code=status.HTTP_201_CREATED)
async def create_income(
    data: IncomeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income = IncomeSource(
        user_id=current_user.id,
        name=data.name,
        amount=data.amount,
        frequency=data.frequency,
        next_pay_date=data.next_pay_date,
    )
    db.add(income)
    await db.flush()
    await db.refresh(income)
    return income


@router.get("", response_model=list[IncomeResponse])
async def list_income(
    active_only: bool = True,
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(IncomeSource).where(IncomeSource.user_id == current_user.id)
    if active_only:
        query = query.where(IncomeSource.is_active.is_(True))

    if sort_by not in INCOME_SORT_FIELDS:
        sort_by = "created_at"
    col_map = {"source": "name", "pay_date": "next_pay_date"}
    sort_col = getattr(IncomeSource, col_map.get(sort_by, sort_by), IncomeSource.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/paystub-upload", response_model=PaystubUploadResponse)
async def paystub_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 15MB)")
    try:
        rel, ft = save_upload_file(current_user.id, file.filename or "upload", raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    row = PaystubUpload(
        user_id=current_user.id,
        file_path=rel,
        file_type=ft,
        ocr_status="uploaded",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return PaystubUploadResponse(id=row.id, status="processing")


@router.post("/paystub-ocr/{file_id}", response_model=PaystubOcrResponse)
async def paystub_ocr(
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaystubUpload).where(PaystubUpload.id == file_id, PaystubUpload.user_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Upload not found")
    row.ocr_status = "processing"
    await db.flush()

    ocr_out = run_ocr_on_file(row.file_path, row.file_type)
    extracted = ocr_out.get("extracted") or {}
    if ocr_out.get("error"):
        row.ocr_status = "failed"
        row.ocr_result = ocr_out
        await db.flush()
        return PaystubOcrResponse(
            id=row.id,
            ocr_status=row.ocr_status,
            extracted=extracted,
            manual_entry_allowed=True,
        )

    row.ocr_status = "completed"
    row.ocr_result = ocr_out
    await db.flush()
    return PaystubOcrResponse(
        id=row.id,
        ocr_status=row.ocr_status,
        extracted=extracted,
        manual_entry_allowed=True,
    )


@router.get("/paystub-uploads", response_model=list[PaystubHistoryItem])
async def list_paystub_uploads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaystubUpload)
        .where(PaystubUpload.user_id == current_user.id)
        .order_by(PaystubUpload.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        PaystubHistoryItem(
            id=r.id,
            file_type=r.file_type,
            ocr_status=r.ocr_status,
            income_id=r.income_id,
            created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
        )
        for r in rows
    ]


@router.post("/paystub-confirm", response_model=IncomeResponse)
async def paystub_confirm(
    body: PaystubConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaystubUpload).where(
            PaystubUpload.id == body.upload_id,
            PaystubUpload.user_id == current_user.id,
        )
    )
    upload = result.scalar_one_or_none()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    income = IncomeSource(
        user_id=current_user.id,
        name=body.employer_name[:100],
        amount=body.net_pay,
        frequency="monthly",
        next_pay_date=body.pay_date,
    )
    db.add(income)
    await db.flush()
    await db.refresh(income)
    upload.income_id = income.id
    upload.ocr_status = "completed"
    if upload.ocr_result is None:
        upload.ocr_result = {}
    upload.ocr_result["confirmed"] = {
        "employer_name": body.employer_name,
        "pay_period_start": body.pay_period_start.isoformat() if body.pay_period_start else None,
        "pay_period_end": body.pay_period_end.isoformat() if body.pay_period_end else None,
        "gross_pay": str(body.gross_pay) if body.gross_pay is not None else None,
        "net_pay": str(body.net_pay),
        "taxes_withheld": str(body.taxes_withheld) if body.taxes_withheld is not None else None,
        "pay_date": body.pay_date.isoformat() if body.pay_date else None,
    }
    await db.flush()
    return income


@router.get("/{income_id}", response_model=IncomeResponse)
async def get_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.id == income_id,
            IncomeSource.user_id == current_user.id,
        )
    )
    income = result.scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")
    return income


@router.put("/{income_id}", response_model=IncomeResponse)
async def update_income(
    income_id: UUID,
    data: IncomeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.id == income_id,
            IncomeSource.user_id == current_user.id,
        )
    )
    income = result.scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(income, field, value)

    await db.flush()
    await db.refresh(income)
    return income


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.id == income_id,
            IncomeSource.user_id == current_user.id,
        )
    )
    income = result.scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")

    income.is_active = False
    await db.flush()
