import logging
import os
from datetime import date, datetime
from decimal import Decimal

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "spsoftwaresolutionsllc@gmail.com")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Support-specific SMTP overrides (fall back to main SMTP settings)
SUPPORT_SMTP_HOST = os.getenv("SUPPORT_SMTP_HOST", SMTP_HOST)
SUPPORT_SMTP_PORT = int(os.getenv("SUPPORT_SMTP_PORT", str(SMTP_PORT)))
SUPPORT_SMTP_USER = os.getenv("SUPPORT_SMTP_USER", SMTP_USER)
SUPPORT_SMTP_PASSWORD = os.getenv("SUPPORT_SMTP_PASSWORD", SMTP_PASSWORD)
SUPPORT_NOTIFICATION_EMAIL = os.getenv("SUPPORT_NOTIFICATION_EMAIL", SUPPORT_EMAIL)


def _get_mail_config() -> ConnectionConfig | None:
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured — email sending disabled")
        return None
    return ConnectionConfig(
        MAIL_USERNAME=SMTP_USER,
        MAIL_PASSWORD=SMTP_PASSWORD,
        MAIL_FROM=SMTP_USER,
        MAIL_PORT=SMTP_PORT,
        MAIL_SERVER=SMTP_HOST,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


async def send_support_email(
    subject: str, message: str, user_email: str, user_name: str
) -> bool:
    try:
        if not SUPPORT_SMTP_USER or not SUPPORT_SMTP_PASSWORD:
            logger.warning("Support SMTP credentials not configured — email sending disabled")
            return False
        conf = ConnectionConfig(
            MAIL_USERNAME=SUPPORT_SMTP_USER,
            MAIL_PASSWORD=SUPPORT_SMTP_PASSWORD,
            MAIL_FROM=SUPPORT_SMTP_USER,
            MAIL_PORT=SUPPORT_SMTP_PORT,
            MAIL_SERVER=SUPPORT_SMTP_HOST,
            MAIL_STARTTLS=True,
            MAIL_SSL_TLS=False,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )

        now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
        html_body = f"""
        <h2>New Support Request</h2>
        <p><strong>From:</strong> {user_name} ({user_email})</p>
        <p><strong>Subject:</strong> {subject}</p>
        <p><strong>Message:</strong></p>
        <p>{message}</p>
        <hr>
        <p><small>Sent at {now_str}</small></p>
        """

        msg = MessageSchema(
            subject=f"New PayDrift support request: {subject}",
            recipients=[SUPPORT_NOTIFICATION_EMAIL],
            body=html_body,
            subtype=MessageType.html,
            reply_to=[user_email],
        )

        fm = FastMail(conf)
        await fm.send_message(msg)
        logger.info("Support email sent for user %s", user_email)
        return True
    except Exception:
        logger.exception("Failed to send support email")
        return False


async def send_ticket_reply_email(
    to_email: str, subject: str, reply_message: str
) -> bool:
    try:
        if not SUPPORT_SMTP_USER or not SUPPORT_SMTP_PASSWORD:
            logger.warning("Support SMTP credentials not configured — email sending disabled")
            return False
        conf = ConnectionConfig(
            MAIL_USERNAME=SUPPORT_SMTP_USER,
            MAIL_PASSWORD=SUPPORT_SMTP_PASSWORD,
            MAIL_FROM=SUPPORT_SMTP_USER,
            MAIL_PORT=SUPPORT_SMTP_PORT,
            MAIL_SERVER=SUPPORT_SMTP_HOST,
            MAIL_STARTTLS=True,
            MAIL_SSL_TLS=False,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )

        html_body = f"""
        <h2>Re: {subject}</h2>
        <p>{reply_message}</p>
        <hr>
        <p><small>PayDrift Support Team</small></p>
        """

        msg = MessageSchema(
            subject=f"Re: {subject}",
            recipients=[to_email],
            body=html_body,
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        await fm.send_message(msg)
        logger.info("Ticket reply email sent to %s", to_email)
        return True
    except Exception:
        logger.exception("Failed to send ticket reply email to %s", to_email)
        return False


async def send_bill_reminder(
    user_email: str,
    user_name: str,
    bill_name: str,
    amount: Decimal,
    due_date: date,
    days_until_due: int,
) -> bool:
    try:
        conf = _get_mail_config()
        if conf is None:
            return False

        html_body = f"""
        <h2>Bill Reminder</h2>
        <p>Hi {user_name},</p>
        <p>This is a friendly reminder that your bill <strong>{bill_name}</strong> is due
        in <strong>{days_until_due} day{'s' if days_until_due != 1 else ''}</strong>.</p>
        <ul>
            <li><strong>Amount:</strong> ${amount:,.2f}</li>
            <li><strong>Due Date:</strong> {due_date.strftime('%B %d, %Y')}</li>
        </ul>
        <p><a href="{FRONTEND_URL}/dashboard">View your budget</a></p>
        <hr>
        <p><small>PayDrift — Keeping your finances on track</small></p>
        """

        msg = MessageSchema(
            subject=f"Reminder: {bill_name} due in {days_until_due} days",
            recipients=[user_email],
            body=html_body,
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        await fm.send_message(msg)
        logger.info("Bill reminder sent to %s for %s", user_email, bill_name)
        return True
    except Exception:
        logger.exception("Failed to send bill reminder for %s", bill_name)
        return False


async def send_password_reset_email(
    to_email: str, user_name: str, reset_token: str
) -> bool:
    try:
        conf = _get_mail_config()
        if conf is None:
            return False

        # Use first origin from FRONTEND_URL (comma-separated list)
        frontend_base = FRONTEND_URL.split(",")[0].strip()
        reset_link = f"{frontend_base}/reset-password?token={reset_token}"

        html_body = f"""
        <h2>Password Reset Request</h2>
        <p>Hi {user_name},</p>
        <p>We received a request to reset your password. Click the link below to set a new password:</p>
        <p><a href="{reset_link}" style="display:inline-block;padding:10px 24px;background-color:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a></p>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break:break-all;color:#6b7280;font-size:14px;">{reset_link}</p>
        <p>This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
        <hr>
        <p><small>PayDrift — Keeping your finances on track</small></p>
        """

        msg = MessageSchema(
            subject="Reset your PayDrift password",
            recipients=[to_email],
            body=html_body,
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        await fm.send_message(msg)
        logger.info("Password reset email sent to %s", to_email)
        return True
    except Exception:
        logger.exception("Failed to send password reset email to %s", to_email)
        return False


async def send_debt_reminder(
    user_email: str,
    user_name: str,
    debt_name: str,
    minimum_payment: Decimal,
    due_date: date,
    days_until_due: int,
) -> bool:
    try:
        conf = _get_mail_config()
        if conf is None:
            return False

        html_body = f"""
        <h2>Debt Payment Reminder</h2>
        <p>Hi {user_name},</p>
        <p>This is a friendly reminder that your debt payment for <strong>{debt_name}</strong>
        is due in <strong>{days_until_due} day{'s' if days_until_due != 1 else ''}</strong>.</p>
        <ul>
            <li><strong>Minimum Payment:</strong> ${minimum_payment:,.2f}</li>
            <li><strong>Due Date:</strong> {due_date.strftime('%B %d, %Y')}</li>
        </ul>
        <p><a href="{FRONTEND_URL}/dashboard">View your budget</a></p>
        <hr>
        <p><small>PayDrift — Keeping your finances on track</small></p>
        """

        msg = MessageSchema(
            subject=f"Reminder: {debt_name} due in {days_until_due} days",
            recipients=[user_email],
            body=html_body,
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        await fm.send_message(msg)
        logger.info("Debt reminder sent to %s for %s", user_email, debt_name)
        return True
    except Exception:
        logger.exception("Failed to send debt reminder for %s", debt_name)
        return False
