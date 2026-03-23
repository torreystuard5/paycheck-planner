import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.routers import admin, announcements, auth, billing, bills, debts, households, import_export, income, notes, passwords, paycheck_checklist, paycheck_engine, paycheck_schedules, payments, referrals, reminders, savings, support, supporter, updates

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

# Paths exempt from the TOS version check
TOS_EXEMPT_PATHS = {
    "/api/v1/auth/accept-tos",
    "/api/v1/auth/me",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/support/auth-issue",
    "/health",
}

# Paths exempt from maintenance mode
MAINTENANCE_EXEMPT_PREFIXES = (
    "/api/v1/auth/",
    "/api/v1/admin/",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
)

# Cached maintenance mode state
_maintenance_cache: dict = {"enabled": False, "checked_at": 0.0}


@app.middleware("http")
async def tos_check_middleware(request: Request, call_next):
    # Skip preflight / non-mutating CORS requests
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in TOS_EXEMPT_PATHS or path.startswith("/docs") or path.startswith("/redoc") or path == "/openapi.json":
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return await call_next(request)

    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return await call_next(request)

    if payload.get("type") != "access":
        return await call_next(request)

    user_id = payload.get("sub")
    if not user_id:
        return await call_next(request)

    try:
        async with async_session() as session:
            result = await session.execute(select(User.tos_version).where(User.id == user_id))
            tos_version = result.scalar_one_or_none()
    except Exception:
        logger.exception("TOS middleware DB lookup failed — allowing request through")
        return await call_next(request)

    if tos_version is None or tos_version < settings.CURRENT_TOS_VERSION:
        return JSONResponse(
            status_code=403,
            content={
                "detail": "tos_required",
                "version": settings.CURRENT_TOS_VERSION,
            },
        )

    return await call_next(request)


async def _is_maintenance_mode() -> bool:
    """Check if maintenance mode is enabled, with 30-second caching."""
    now = time.time()
    if now - _maintenance_cache["checked_at"] < 30:
        return _maintenance_cache["enabled"]
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemSetting.value).where(SystemSetting.key == "maintenance_mode")
            )
            value = result.scalar_one_or_none()
            enabled = value == "true" if value else False
    except Exception:
        logger.exception("Maintenance mode DB check failed — defaulting to off")
        enabled = False
    _maintenance_cache["enabled"] = enabled
    _maintenance_cache["checked_at"] = now
    return enabled


@app.middleware("http")
async def maintenance_mode_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path

    # Always allow exempt paths
    if any(path.startswith(prefix) for prefix in MAINTENANCE_EXEMPT_PREFIXES):
        return await call_next(request)

    if not await _is_maintenance_mode():
        return await call_next(request)

    # Check if the user is an admin — admins bypass maintenance mode
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            if payload.get("type") == "access":
                user_id = payload.get("sub")
                if user_id:
                    async with async_session() as session:
                        result = await session.execute(
                            select(User.is_admin).where(User.id == user_id)
                        )
                        is_admin = result.scalar_one_or_none()
                        if is_admin:
                            return await call_next(request)
        except (JWTError, Exception):
            pass

    return JSONResponse(
        status_code=503,
        content={"detail": "System is under maintenance. Please try again later."},
    )


app.include_router(auth.router, prefix="/api/v1")
app.include_router(income.router, prefix="/api/v1")
app.include_router(bills.router, prefix="/api/v1")
app.include_router(debts.router, prefix="/api/v1")
app.include_router(savings.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(paycheck_engine.router, prefix="/api/v1")
app.include_router(paycheck_checklist.router, prefix="/api/v1")
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
app.include_router(announcements.router, prefix="/api/v1")
app.include_router(paycheck_schedules.router, prefix="/api/v1")
app.include_router(updates.router, prefix="/api/v1")


@app.on_event("startup")
async def seed_default_settings():
    """Ensure default system settings exist."""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemSetting).where(SystemSetting.key == "maintenance_mode")
            )
            if not result.scalar_one_or_none():
                session.add(SystemSetting(key="maintenance_mode", value="false"))
                await session.commit()
                logger.info("Seeded default maintenance_mode setting")
    except Exception:
        logger.exception("Error seeding default system settings")


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
