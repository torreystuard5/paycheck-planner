import os

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.database import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User

router = APIRouter(tags=["Unsubscribe"])

SECRET_KEY = os.getenv("SECRET_KEY", os.getenv("JWT_SECRET_KEY", "change-me"))
UNSUBSCRIBE_SALT = "email-unsubscribe"

_serializer = URLSafeTimedSerializer(SECRET_KEY)


def generate_unsubscribe_token(user_id: str) -> str:
    return _serializer.dumps(str(user_id), salt=UNSUBSCRIBE_SALT)


def verify_unsubscribe_token(token: str, max_age_days: int = 365) -> str | None:
    """Returns user_id string or None if invalid/expired."""
    try:
        return _serializer.loads(token, salt=UNSUBSCRIBE_SALT, max_age=max_age_days * 86400)
    except (BadSignature, SignatureExpired):
        return None


_CSS = """
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;color:#111827;}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:40px;max-width:480px;text-align:center;}
h1{font-size:1.5rem;margin-bottom:12px;}
p{color:#6b7280;line-height:1.6;}
.logo{font-weight:700;color:#2563eb;font-size:1.25rem;margin-bottom:24px;}
"""


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_user(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    user_id = verify_unsubscribe_token(token)

    if user_id is None:
        return HTMLResponse(
            content=f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid Link</title><style>{_CSS}</style></head>
            <body><div class="card"><div class="logo">PayDrift</div><h1>Invalid or Expired Link</h1><p>This unsubscribe link is no longer valid. Please contact support if you need assistance.</p></div></body></html>""",
            status_code=400,
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return HTMLResponse(
            content=f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title><style>{_CSS}</style></head>
            <body><div class="card"><div class="logo">PayDrift</div><h1>Account Not Found</h1><p>We couldn't find your account. Please contact support if you need assistance.</p></div></body></html>""",
            status_code=404,
        )

    user.email_unsubscribed = True
    user.unsubscribed_at = datetime.now(timezone.utc)

    # Log the unsubscribe action
    db.add(AdminAuditLog(
        admin_id=user.id,
        action="user_unsubscribed",
        target_type="user",
        target_id=str(user.id),
        details=None,
    ))
    await db.commit()

    return HTMLResponse(
        content=f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><style>{_CSS}</style></head>
        <body><div class="card"><div class="logo">PayDrift</div><h1>You've Been Unsubscribed</h1><p>You've been unsubscribed from PayDrift emails. You can re-subscribe from your account settings.</p></div></body></html>""",
    )
