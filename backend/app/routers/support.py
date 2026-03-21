import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.services.email_service import send_support_email
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Support"])


class SupportTicketCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1)


class SupportTicketResponse(BaseModel):
    id: UUID
    user_id: UUID
    subject: str
    message: str
    status: str
    created_at: datetime
    email_sent: bool = False

    model_config = {"from_attributes": True}


@router.post("", response_model=SupportTicketResponse, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    data: SupportTicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = SupportTicket(
        user_id=current_user.id,
        subject=data.subject,
        message=data.message,
    )
    db.add(ticket)
    await db.flush()
    await db.refresh(ticket)

    email_sent = False
    try:
        email_sent = await send_support_email(
            subject=data.subject,
            message=data.message,
            user_email=current_user.email,
            user_name=f"{current_user.first_name} {current_user.last_name}",
        )
    except Exception:
        logger.exception("Email send failed for support ticket %s", ticket.id)

    response = SupportTicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        subject=ticket.subject,
        message=ticket.message,
        status=ticket.status,
        created_at=ticket.created_at,
        email_sent=email_sent,
    )
    return response
