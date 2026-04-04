import time
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.note import Note
from app.models.user import User
from app.schemas.notes import (
    NoteCreate,
    NoteDetail,
    NoteListItem,
    NoteUpdate,
    NotesSettingsUpdate,
    PinSetupRequest,
    PinVerifyRequest,
    PinVerifyResponse,
)
from app.services.encryption_service import decrypt, encrypt
from app.utils.security import get_current_user

router = APIRouter(prefix="/notes", tags=["Notes"])

NOTES_SORT_FIELDS = {"title", "created_at", "updated_at"}

pin_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# In-memory rate limiting: {user_id_str: {"count": int, "window_start": float}}
_pin_attempts: dict[str, dict] = {}
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW = 60  # seconds


def _check_rate_limit(user_id: str) -> None:
    now = time.time()
    entry = _pin_attempts.get(user_id)
    if entry is None or now - entry["window_start"] > _RATE_LIMIT_WINDOW:
        _pin_attempts[user_id] = {"count": 0, "window_start": now}
        return
    if entry["count"] >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many PIN attempts. Try again later.",
        )


def _increment_rate_limit(user_id: str) -> None:
    entry = _pin_attempts.get(user_id)
    if entry:
        entry["count"] += 1


def _create_notes_session_token(user_id: str, ttl_minutes: int) -> tuple[str, int]:
    expires_in = ttl_minutes * 60
    exp = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    payload = {
        "user_id": user_id,
        "type": "notes_session",
        "exp": exp,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return token, expires_in


def _verify_notes_session_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "notes_session":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="notes_session_required",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="notes_session_required",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="notes_session_required",
        )


async def verify_notes_session(
    current_user: User = Depends(get_current_user),
    x_notes_session: Annotated[str | None, Header()] = None,
) -> User:
    if not x_notes_session:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="notes_session_required",
        )
    payload = _verify_notes_session_token(x_notes_session)
    if payload.get("user_id") != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="notes_session_required",
        )
    return current_user


# --- PIN endpoints (auth required, NO notes session) ---


@router.post("/pin/setup", status_code=200)
async def setup_pin(
    body: PinSetupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Determine if this is initial setup or change
    if current_user.pin_hash is not None:
        # Changing PIN — require current_pin + new_pin
        if not body.current_pin or not body.new_pin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="current_pin and new_pin are required to change PIN",
            )
        if not pin_context.verify(body.current_pin, current_user.pin_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current PIN is incorrect",
            )
        current_user.pin_hash = pin_context.hash(body.new_pin)
    else:
        # Initial setup — require pin
        pin_value = body.pin or body.new_pin
        if not pin_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="pin is required for initial setup",
            )
        current_user.pin_hash = pin_context.hash(pin_value)

    await db.flush()
    return {"message": "PIN set successfully"}


@router.post("/pin/verify", response_model=PinVerifyResponse)
async def verify_pin(
    body: PinVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id_str = str(current_user.id)
    _check_rate_limit(user_id_str)

    if not current_user.pin_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN not set up yet",
        )

    if not pin_context.verify(body.pin, current_user.pin_hash):
        _increment_rate_limit(user_id_str)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid PIN",
        )

    # Reset rate limit on success
    _pin_attempts.pop(user_id_str, None)

    ttl = current_user.notes_lock_timeout or 5
    token, expires_in = _create_notes_session_token(user_id_str, ttl)
    return PinVerifyResponse(notes_session_token=token, expires_in=expires_in)


# --- Settings (auth + notes session) ---


@router.patch("/settings", status_code=200)
async def update_notes_settings(
    body: NotesSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    current_user.notes_lock_timeout = body.lock_timeout
    await db.flush()
    return {"message": "Settings updated", "lock_timeout": body.lock_timeout}


# --- Notes CRUD (auth + notes session) ---


@router.get("", response_model=list[NoteListItem])
async def list_notes(
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    query = select(Note).where(Note.user_id == current_user.id)

    # Apply sorting
    if sort_by not in NOTES_SORT_FIELDS:
        sort_by = "created_at"
    sort_col = getattr(Note, sort_by, Note.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    result = await db.execute(query)
    return [NoteListItem.model_validate(n) for n in result.scalars().all()]


@router.get("/{note_id}", response_model=NoteDetail)
async def get_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return NoteDetail(
        id=note.id,
        title=note.title,
        content=decrypt(note.content),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.post("", response_model=NoteDetail, status_code=201)
async def create_note(
    body: NoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    note = Note(
        user_id=current_user.id,
        title=body.title,
        content=encrypt(body.content),
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return NoteDetail(
        id=note.id,
        title=note.title,
        content=decrypt(note.content),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.put("/{note_id}", response_model=NoteDetail)
async def update_note(
    note_id: int,
    body: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = encrypt(body.content)

    await db.flush()
    await db.refresh(note)
    return NoteDetail(
        id=note.id,
        title=note.title,
        content=decrypt(note.content),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.delete("/{note_id}", status_code=200)
async def delete_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(verify_notes_session),
):
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    await db.flush()
    return {"message": "Note deleted"}
