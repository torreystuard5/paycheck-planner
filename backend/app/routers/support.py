import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID as PyUUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
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
    InternalNoteCreate,
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

TICKET_SORT_FIELDS = {"created_at", "status", "priority"}
VALID_STATUSES = ("open", "in_progress", "resolved")
VALID_PRIORITIES = ("low", "normal", "high", "urgent")


def _user_display_name(user: User | None) -> str | None:
    if not user:
        return None
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or user.email


def _reply_to_read(reply: SupportTicketReply) -> TicketReplyRead:
    author = getattr(reply, "user", None)
    return TicketReplyRead(
        id=reply.id,
        ticket_id=reply.ticket_id,
        reply_message=reply.reply_message,
        is_internal=reply.is_internal,
        replied_by=reply.replied_by,
        replied_by_name=_user_display_name(author),
        created_at=reply.created_at,
    )


def _ticket_to_read(ticket: SupportTicket) -> SupportTicketRead:
    assignee = getattr(ticket, "assignee", None)
    public_replies = [r for r in (ticket.replies or []) if not r.is_internal]
    return SupportTicketRead(
        id=ticket.id,
        user_id=ticket.user_id,
        name=ticket.name,
        email=ticket.email,
        subject=ticket.subject,
        message=ticket.message,
        status=ticket.status,
        priority=getattr(ticket, "priority", None) or "normal",
        assigned_to=ticket.assigned_to,
        assigned_to_name=_user_display_name(assignee),
        admin_notes=ticket.admin_notes,
        cant_access_email=ticket.cant_access_email,
        created_at=ticket.created_at,
        resolved_at=ticket.resolved_at,
        reply_count=len(public_replies),
    )


def _ticket_to_detail(ticket: SupportTicket, *, admin_view: bool) -> SupportTicketDetail:
    base = _ticket_to_read(ticket)
    public = []
    internal = []
    for reply in ticket.replies or []:
        item = _reply_to_read(reply)
        if reply.is_internal:
            if admin_view:
                internal.append(item)
        else:
            public.append(item)
    return SupportTicketDetail(
        **base.model_dump(),
        replies=public,
        internal_notes=internal if admin_view else [],
    )


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


async def _load_ticket(
    db: AsyncSession,
    ticket_id: PyUUID,
) -> SupportTicket | None:
    result = await db.execute(
        select(SupportTicket)
        .options(
            selectinload(SupportTicket.replies).selectinload(SupportTicketReply.user),
            selectinload(SupportTicket.assignee),
        )
        .where(SupportTicket.id == ticket_id)
    )
    return result.scalar_one_or_none()


def _apply_ticket_filters(
    query,
    *,
    status_filter: str | None,
    priority_filter: str | None,
    user_search: str | None,
    assigned_to: PyUUID | None,
    assigned_to_me: bool,
    current_user_id: PyUUID,
):
    if status_filter in VALID_STATUSES:
        query = query.where(SupportTicket.status == status_filter)
    if priority_filter in VALID_PRIORITIES:
        query = query.where(SupportTicket.priority == priority_filter)
    if user_search:
        term = f"%{user_search.strip()}%"
        query = query.where(
            or_(
                SupportTicket.email.ilike(term),
                SupportTicket.name.ilike(term),
                SupportTicket.subject.ilike(term),
            )
        )
    if assigned_to_me:
        query = query.where(SupportTicket.assigned_to == current_user_id)
    elif assigned_to is not None:
        query = query.where(SupportTicket.assigned_to == assigned_to)
    return query


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

    return _ticket_to_read(ticket)


@router.get("", response_model=list[SupportTicketRead])
async def list_my_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List only the current user's tickets, ordered by created_at DESC."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.replies), selectinload(SupportTicket.assignee))
        .where(SupportTicket.user_id == current_user.id)
        .order_by(SupportTicket.created_at.desc())
        .limit(100)
    )
    return [_ticket_to_read(t) for t in result.scalars().all()]


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

@router.get("/all", response_model=SupportTicketListResponse)
async def list_all_tickets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    user_search: str | None = Query(None, alias="user"),
    assigned_to: PyUUID | None = Query(None),
    assigned_to_me: bool = Query(False),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: list ALL tickets with filters for status, priority, user search, and assignment."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    base = select(SupportTicket)
    base = _apply_ticket_filters(
        base,
        status_filter=status_filter,
        priority_filter=priority,
        user_search=user_search,
        assigned_to=assigned_to,
        assigned_to_me=assigned_to_me,
        current_user_id=current_user.id,
    )

    count_query = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    status_counts: dict[str, int] = {}
    for st in VALID_STATUSES:
        st_query = select(func.count(SupportTicket.id)).where(SupportTicket.status == st)
        st_query = _apply_ticket_filters(
            st_query,
            status_filter=None,
            priority_filter=priority,
            user_search=user_search,
            assigned_to=assigned_to,
            assigned_to_me=assigned_to_me,
            current_user_id=current_user.id,
        )
        status_counts[st] = (await db.execute(st_query)).scalar() or 0

    if sort_by not in TICKET_SORT_FIELDS:
        sort_by = "created_at"
    sort_col = getattr(SupportTicket, sort_by, SupportTicket.created_at)
    order = sort_col.desc() if sort_order == "desc" else sort_col.asc()

    query = (
        base.options(
            selectinload(SupportTicket.replies),
            selectinload(SupportTicket.assignee),
        )
        .order_by(order)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(query)).scalars().all()

    return SupportTicketListResponse(
        tickets=[_ticket_to_read(t) for t in rows],
        total=total,
        page=page,
        per_page=per_page,
        status_counts=status_counts,
    )


@router.get("/{ticket_id}", response_model=SupportTicketDetail)
async def get_support_ticket(
    ticket_id: PyUUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get ticket detail. Users can only see their own tickets; admins can see all."""
    ticket = await _load_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not current_user.is_admin and ticket.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")
    return _ticket_to_detail(ticket, admin_view=current_user.is_admin)


@router.patch("/{ticket_id}", response_model=SupportTicketDetail)
async def update_support_ticket(
    ticket_id: PyUUID,
    body: SupportTicketUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: update ticket status, priority, assignment, and/or admin_notes."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    ticket = await _load_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    changes: dict = {}
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates:
        ticket.status = updates["status"]
        changes["status"] = updates["status"]
        if updates["status"] == "resolved":
            ticket.resolved_at = datetime.now(timezone.utc)
        elif ticket.resolved_at is not None:
            ticket.resolved_at = None
    if "priority" in updates:
        ticket.priority = updates["priority"]
        changes["priority"] = updates["priority"]
    if "assigned_to" in updates:
        ticket.assigned_to = updates["assigned_to"]
        changes["assigned_to"] = str(updates["assigned_to"]) if updates["assigned_to"] else None
    if "admin_notes" in updates:
        ticket.admin_notes = updates["admin_notes"]
        changes["admin_notes"] = updates["admin_notes"]

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="updated_ticket",
        target_type="support_ticket",
        target_id=str(ticket_id),
        details=json.dumps(changes, default=str),
        ip_address=_get_client_ip(request),
    )

    await db.flush()
    ticket = await _load_ticket(db, ticket_id)
    return _ticket_to_detail(ticket, admin_view=True)


@router.post("/{ticket_id}/assign-me", response_model=SupportTicketDetail)
async def assign_ticket_to_me(
    ticket_id: PyUUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: assign ticket to the current admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    ticket = await _load_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.assigned_to = current_user.id
    if ticket.status == "open":
        ticket.status = "in_progress"

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="assigned_ticket",
        target_type="support_ticket",
        target_id=str(ticket_id),
        details=json.dumps({"assigned_to": str(current_user.id)}),
        ip_address=_get_client_ip(request),
    )

    await db.flush()
    ticket = await _load_ticket(db, ticket_id)
    return _ticket_to_detail(ticket, admin_view=True)


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

    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Reply message is required")

    ticket = await _load_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    reply = SupportTicketReply(
        ticket_id=ticket_id,
        reply_message=data.message.strip(),
        replied_by=current_user.id,
        is_internal=False,
    )
    db.add(reply)

    if ticket.status == "open":
        ticket.status = "in_progress"

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
    reply.user = current_user

    try:
        await send_ticket_reply_email(
            to_email=ticket.email,
            subject=ticket.subject,
            reply_message=data.message,
        )
    except Exception:
        logger.exception("Reply email failed for ticket %s", ticket_id)

    return _reply_to_read(reply)


@router.post("/{ticket_id}/internal-note", response_model=TicketReplyRead, status_code=status.HTTP_201_CREATED)
async def add_internal_note(
    ticket_id: PyUUID,
    data: InternalNoteCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: add an internal note (not visible to the user, no email sent)."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    ticket = await _load_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    note = SupportTicketReply(
        ticket_id=ticket_id,
        reply_message=data.message.strip(),
        replied_by=current_user.id,
        is_internal=True,
    )
    db.add(note)

    log_admin_action(
        db,
        admin_id=current_user.id,
        action="added_ticket_note",
        target_type="support_ticket",
        target_id=str(ticket_id),
        details=json.dumps({"preview": data.message[:120]}),
        ip_address=_get_client_ip(request),
    )

    await db.flush()
    await db.refresh(note)
    note.user = current_user
    return _reply_to_read(note)
