from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.password import Password
from app.models.user import User
from app.routers.notes import verify_notes_session
from app.schemas.passwords import (
    PasswordCreate,
    PasswordDetail,
    PasswordListItem,
    PasswordUpdate,
)
from app.services.encryption_service import decrypt, encrypt

router = APIRouter(prefix="/passwords", tags=["Passwords"])

PASSWORDS_SORT_FIELDS = {"site_name", "username", "created_at"}


@router.get("", response_model=list[PasswordListItem])
async def list_passwords(
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    query = select(Password).where(Password.user_id == current_user.id)

    # Apply sorting — note: username is encrypted so we can only sort by site_name or timestamps
    if sort_by not in PASSWORDS_SORT_FIELDS:
        sort_by = "created_at"
    sort_col = getattr(Password, sort_by, Password.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        PasswordListItem(
            id=p.id,
            site_name=p.site_name,
            username=decrypt(p.username),
            url=p.url,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in rows
    ]


@router.get("/{password_id}", response_model=PasswordDetail)
async def get_password(
    password_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    result = await db.execute(
        select(Password).where(
            Password.id == password_id, Password.user_id == current_user.id
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Password entry not found")
    return PasswordDetail(
        id=p.id,
        site_name=p.site_name,
        username=decrypt(p.username),
        password=decrypt(p.password),
        url=p.url,
        notes=decrypt(p.notes),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.post("", response_model=PasswordDetail, status_code=201)
async def create_password(
    body: PasswordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    p = Password(
        user_id=current_user.id,
        site_name=body.site_name,
        username=encrypt(body.username),
        password=encrypt(body.password),
        url=body.url,
        notes=encrypt(body.notes),
    )
    db.add(p)
    await db.flush()
    await db.refresh(p)
    return PasswordDetail(
        id=p.id,
        site_name=p.site_name,
        username=decrypt(p.username),
        password=decrypt(p.password),
        url=p.url,
        notes=decrypt(p.notes),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.put("/{password_id}", response_model=PasswordDetail)
async def update_password(
    password_id: int,
    body: PasswordUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    result = await db.execute(
        select(Password).where(
            Password.id == password_id, Password.user_id == current_user.id
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Password entry not found")

    if body.site_name is not None:
        p.site_name = body.site_name
    if body.username is not None:
        p.username = encrypt(body.username)
    if body.password is not None:
        p.password = encrypt(body.password)
    if body.url is not None:
        p.url = body.url
    if body.notes is not None:
        p.notes = encrypt(body.notes)

    await db.flush()
    await db.refresh(p)
    return PasswordDetail(
        id=p.id,
        site_name=p.site_name,
        username=decrypt(p.username),
        password=decrypt(p.password),
        url=p.url,
        notes=decrypt(p.notes),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.delete("/{password_id}", status_code=200)
async def delete_password(
    password_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    result = await db.execute(
        select(Password).where(
            Password.id == password_id, Password.user_id == current_user.id
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Password entry not found")
    await db.delete(p)
    await db.flush()
    return {"message": "Password entry deleted"}
