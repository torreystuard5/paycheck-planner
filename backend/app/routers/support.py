import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID as PyUUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from pydantic import BaseModel, EmailStr, Field

from app.database import get_db
from app.models.support_ticket import SupportTicket
from app.models.support_ticket_reply import SupportTicketReply
from app.models.user import User
from app.services.admin_audit import get_client_ip as _get_client_ip
from app.services.admin_audit import log_admin_action
from app.schemas.support import (
    SupportTicketCreate,
    SupportTicketDetail,
    SupportTicketListResponse,
    SupportTicketRead,
    SupportTicketUpdate,
    TicketReplyCreate,
    TicketReplyRead,
)
from app.services.email_service import send_support_email, send_ticket_reply_email
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
        result = await db.execute(select(User).where(User.id == PyUUID(user_id)))
        user = result.scalar_one_or_none()
        if user and user.is_active:
            return user
    except Exception:
        pass
    return None


# ── User-facing endpoints ──────────────────────────────────────────────

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
    await db.refresh(ticket, attribute_names=["replies"])

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
async def list_my_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List only the current user's tickets, ordered by created_at DESC."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.replies))
        .where(SupportTicket.user_id == current_user.id)
        .order_by(SupportTicket.created_at.desc())
        .limit(100)
    )
    return result.scalars().all()


# ── Public auth-issue endpoint (NO auth required) ──────────────────────

class AuthIssueRequest(BaseModel):
    email: EmailStr = Field(..., max_length=320)
    message: str | None = Field(None)
    cant_access_email: bool = False


@router.post("/auth-issue", status_code=status.HTTP_201_CREATED)
async def create_auth_issue(
    data: AuthIssueRequest,
    db: AsyncSession = Depends(get_db),
):
    ticket = SupportTicket(
        user_id=None,
        name=None,
        email=data.email,
        subject="Auth / Account Issue",
        message=data.message,
        cant_access_email=data.cant_access_email,
    )
    db.add(ticket)
    await db.flush()
    return {"message": "Your request has been submitted. We'll get back to you."}


# ── Admin-facing endpoints ─────────────────────────────────────────────

TICKET_SORT_FIELDS = {"created_at", "status"}


@router.get("/all", response_model=SupportTicketListResponse)
async def list_all_tickets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: list ALL tickets from all users, with optional status filter."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    query = select(SupportTicket).options(selectinload(SupportTicket.replies))
    count_query = select(func.count(SupportTicket.id))

    if status_filter in ("open", "in_progress", "resolved"):
        query = query.where(SupportTicket.status == status_filter)
        count_query = count_query.where(SupportTicket.status == status_filter)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * per_page

    # Apply sorting
    if sort_by not in TICKET_SORT_FIELDS:
        sort_by = "created_at"
    sort_col = getattr(SupportTicket, sort_by, SupportTicket.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    rows = (
        await db.execute(
            query.offset(offset).limit(per_page)
        )
    ).scalars().all()

    return SupportTicketListResponse(
        tickets=[SupportTicketRead.model_validate(t) for t in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{ticket_id}", response_model=SupportTicketDetail)
async def get_support_ticket(
    ticket_id: PyUUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get ticket detail. Users can only see their own tickets; admins can see all."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.replies))
        .where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not current_user.is_admin and ticket.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")
    return ticket


@router.patch("/{ticket_id}", response_model=SupportTicketDetail)
async def update_support_ticket(
    ticket_id: PyUUID,
    body: SupportTicketUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: update ticket status and/or admin_notes."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.replies))
        .where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if body.status is not None:
        ticket.status = body.status
        if body.status == "resolved":
            ticket.resolved_at = datetime.now(timezone.utc)
    if body.admin_notes is not None:
        ticket.admin_notes = body.admin_notes

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_ticket",
        target_type="support_ticket",
        target_id=str(ticket_id),
        details=json.dumps({"status": body.status, "admin_notes": body.admin_notes}, default=str),
        ip_address=_get_client_ip(request),
    )

    await db.flush()
    await db.refresh(ticket, attribute_names=["replies"])
    return ticket


@router.post("/{ticket_id}/reply", response_model=TicketReplyRead, status_code=status.HTTP_201_CREATED)
async def reply_to_ticket(
    ticket_id: PyUUID,
    data: TicketReplyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    reply = SupportTicketReply(
        ticket_id=ticket_id,
        reply_message=data.message,
        replied_by=current_user.id,
    )
    db.add(reply)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="replied_to_ticket",
        target_type="support_ticket",
        target_id=str(ticket_id),
        details=json.dumps({"subject": ticket.subject}),
        ip_address=_get_client_ip(request),
    )

    await db.flush()
    await db.refresh(reply)

    try:
        await send_ticket_reply_email(
            to_email=ticket.email,
            subject=ticket.subject,
            reply_message=data.message,
        )
    except Exception:
        logger.exception("Reply email failed for ticket %s", ticket_id)

    return reply
