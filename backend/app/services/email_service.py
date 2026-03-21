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
        conf = _get_mail_config()
        if conf is None:
            return False

        html_body = f"""
        <h2>New Support Request</h2>
        <p><strong>From:</strong> {user_name} ({user_email})</p>
        <p><strong>Subject:</strong> {subject}</p>
        <p><strong>Message:</strong></p>
        <p>{message}</p>
        <hr>
        <p><small>Sent at {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</small></p>
        """

        msg = MessageSchema(
            subject=f"[PayDrift Support] {subject}",
            recipients=[SUPPORT_EMAIL],
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
