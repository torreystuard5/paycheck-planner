import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.user import User
from app.routers import admin, auth, billing, bills, debts, households, import_export, income, notes, passwords, paycheck_engine, payments, referrals, reminders, savings, support, supporter

logger = logging.getLogger(__name__)

app = FastAPI(
    title="PayDrift API",
    version="1.0.0",
    description="Budgeting SaaS for paycheck-based financial planning",
    redirect_slashes=False,
)

# Build CORS origins list from FRONTEND_URL (supports comma-separated values)
_raw = settings.FRONTEND_URL.strip()
if _raw:
    origins = [o.strip() for o in _raw.split(",") if o.strip()]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(income.router, prefix="/api/v1")
app.include_router(bills.router, prefix="/api/v1")
app.include_router(debts.router, prefix="/api/v1")
app.include_router(savings.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(paycheck_engine.router, prefix="/api/v1")
app.include_router(households.router, prefix="/api/v1")
app.include_router(support.router, prefix="/api/v1")
app.include_router(reminders.router, prefix="/api/v1")
app.include_router(import_export.router, prefix="/api/v1")
app.include_router(supporter.router, prefix="/api/v1")
app.include_router(referrals.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(passwords.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.on_event("startup")
async def promote_initial_admin():
    email = settings.INITIAL_ADMIN_EMAIL
    if not email:
        logger.info("INITIAL_ADMIN_EMAIL not set, skipping admin promotion")
        return

    try:
        async with async_session() as session:
            result = await session.execute(
                select(User).where(User.email == email)
            )
            user = result.scalar_one_or_none()

            if user is None:
                logger.warning("INITIAL_ADMIN_EMAIL %s not found in database, skipping", email)
                return

            if user.is_admin:
                logger.info("User %s is already an admin, no action needed", email)
                return

            user.is_admin = True
            await session.commit()
            logger.info("Promoted %s to admin", email)
    except Exception:
        logger.exception("Error promoting initial admin %s", email)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
