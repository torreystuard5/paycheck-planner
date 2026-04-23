import logging
import os
import time
from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.services.tier_access import has_personal_home_access, normalize_plan_tier
from app.routers import admin, announcements, auth, billing, bills, budgets, business, calendar, debts, households, import_export, income, notes, passwords, paycheck_checklist, paycheck_engine, paycheck_entries, paycheck_schedules, payments, referrals, reminders, savings, subscriptions, support, supporter, tax, unsubscribe, updates, user_preferences

logger = logging.getLogger(__name__)

app = FastAPI(
    title="PayDrift API",
    version="1.0.0",
    description="Budgeting SaaS for paycheck-based financial planning",
    redirect_slashes=False,
)

# CORS: FRONTEND_URL (comma-separated) + FRONTEND_ORIGIN (dev default) + production app host
_PRODUCTION_APP_ORIGIN = "https://paydrift.net"
_raw = (settings.FRONTEND_URL or "").strip()
_env_origin = (os.getenv("FRONTEND_ORIGIN") or "").strip() or None
_dev_default = _env_origin or "http://localhost:5173"

if _raw == "*":
    origins = ["*"]
elif _raw:
    origins = [o.strip() for o in _raw.split(",") if o.strip()]
    for _extra in (_PRODUCTION_APP_ORIGIN, _dev_default):
        if _extra not in origins:
            origins.append(_extra)
    origins = list(dict.fromkeys(origins))
else:
    origins = list(dict.fromkeys([_dev_default, _PRODUCTION_APP_ORIGIN]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths exempt from the TOS version check
# Business-only plans cannot call personal finance APIs (direct URL / tooling).
_PERSONAL_API_PREFIXES = (
    "/api/v1/income",
    "/api/v1/bills",
    "/api/v1/debts",
    "/api/v1/savings",
    "/api/v1/payments",
    "/api/v1/paycheck-plan",
    "/api/v1/paycheck-checklist",
    "/api/v1/paycheck-entries",
    "/api/v1/paycheck-schedules",
    "/api/v1/households",
    "/api/v1/reminders",
    "/api/v1/import",
    "/api/v1/export",
    "/api/v1/notes",
    "/api/v1/passwords",
    "/api/v1/calendar",
    "/api/v1/tax",
    "/api/v1/referrals",
)


def _blocks_personal_finance_api(path: str) -> bool:
    for prefix in _PERSONAL_API_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return True
    return False


TOS_EXEMPT_PATHS = {
    "/api/v1/auth/accept-tos",
    "/api/v1/auth/me",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/support/auth-issue",
    "/api/v1/version",
    "/health",
}

# Paths exempt from maintenance mode — only minimal auth endpoints, not /me
MAINTENANCE_EXEMPT_PATHS_EXACT = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/health",
    "/openapi.json",
}
MAINTENANCE_EXEMPT_PREFIXES = (
    "/api/v1/admin/",
    "/api/v1/unsubscribe",
    "/docs",
    "/redoc",
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


@app.middleware("http")
async def business_only_personal_api_block(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if not _blocks_personal_finance_api(path):
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
            result = await session.execute(
                select(User.subscription_tier).where(User.id == UUID(str(user_id)))
            )
            raw_tier = result.scalar_one_or_none()
    except Exception:
        logger.exception("business_only_personal_api_block: tier lookup failed")
        return await call_next(request)

    if has_personal_home_access(normalize_plan_tier(raw_tier)):
        return await call_next(request)

    return JSONResponse(
        status_code=403,
        content={"detail": "Personal finance features are not included in your current plan."},
    )


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
    if path in MAINTENANCE_EXEMPT_PATHS_EXACT:
        return await call_next(request)
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
app.include_router(paycheck_entries.router, prefix="/api/v1")
app.include_router(paycheck_schedules.router, prefix="/api/v1")
app.include_router(updates.router, prefix="/api/v1")
app.include_router(unsubscribe.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
app.include_router(tax.router, prefix="/api/v1")
app.include_router(subscriptions.router, prefix="/api/v1")
app.include_router(user_preferences.router, prefix="/api/v1")
app.include_router(budgets.router, prefix="/api/v1")
app.include_router(business.router, prefix="/api/v1")


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


@app.get("/api/v1/version")
async def get_version():
    from app.config import APP_VERSION
    return {"version": APP_VERSION}
