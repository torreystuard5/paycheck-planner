import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.support import SupportTicketCreate, SupportTicketRead
from app.services.email_service import send_support_email
from app.utils.security import get_current_user, decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Support"])


async def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Extract user from token if present, otherwise return None."""
    if not authorization:
        return None
    try:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
        from uuid import UUID as PyUUID
        result = await db.execute(select(User).where(User.id == PyUUID(user_id)))
        user = result.scalar_one_or_none()
        if user and user.is_active:
            return user
    except Exception:
        pass
    return None


@router.post("", response_model=SupportTicketRead, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    data: SupportTicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    ticket = SupportTicket(
        user_id=current_user.id if current_user else None,
        name=data.name,
        email=data.email,
        subject=data.subject,
        message=data.message,
    )
    db.add(ticket)
    await db.flush()
    await db.refresh(ticket)

    try:
        await send_support_email(
            subject=data.subject,
            message=data.message,
            user_email=data.email,
            user_name=data.name,
        )
    except Exception:
        logger.exception("Email send failed for support ticket %s", ticket.id)

    return ticket


@router.get("", response_model=list[SupportTicketRead])
async def list_support_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SupportTicket)
        .order_by(SupportTicket.created_at.desc())
        .limit(100)
    )
    return result.scalars().all()
