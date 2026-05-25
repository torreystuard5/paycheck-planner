import logging
import os
import time
from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.database import async_session, engine
from app.middleware.request_auth import get_request_user_snapshot
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.services.tier_access import has_personal_home_access, normalize_plan_tier
from app.routers import (
    admin,
    announcements,
    auth,
    billing,
    bills,
    budgets,
    business,
    business_documents,
    business_edition,
    business_reports,
    business_revenue,
    business_tax,
    calendar,
    debts,
    documents,
    households,
    import_export,
    income,
    notes,
    passwords,
    pay_periods,
    paycheck_checklist,
    paycheck_engine,
    paycheck_entries,
    paycheck_schedules,
    payments,
    referrals,
    reminders,
    savings,
    shopping_list,
    subscriptions,
    support,
    supporter,
    tax,
    unsubscribe,
    updates,
    user_preferences,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.migration_status import build_migration_status

    app.state.migration_ok = False
    try:
        async with async_session() as session:
            status = await build_migration_status(session)
            status.log_startup_summary()
            app.state.migration_ok = status.migration_ok
            app.state.migration_current = status.current
            app.state.migration_head = status.head
        from app.services.storage.r2_health import r2_config_status, r2_write_probe

        r2 = r2_config_status()
        if r2["configured"]:
            import asyncio

            probe = await asyncio.to_thread(r2_write_probe)
            if probe.get("ok"):
                logger.info("[startup] R2 document storage OK (write probe passed)")
            else:
                logger.warning(
                    "[startup] R2 env vars set but write probe failed: %s",
                    probe.get("error"),
                )
        else:
            logger.warning(
                "[startup] R2 not configured — document uploads return 503. Missing: %s",
                ", ".join(r2["missing"]),
            )
    except Exception:
        logger.exception(
            "[startup] Migration/database check failed — verify DATABASE_URL and Postgres"
        )

    try:
        from scripts.sync_public_changelog import ChangelogSyncError, sync_changelog

        inserted = await sync_changelog()
        logger.info("[startup] Changelog sync OK (%s new rows)", inserted)
    except ChangelogSyncError as exc:
        logger.error("[startup] Changelog sync skipped: %s", exc)
    except Exception:
        logger.exception("[startup] Changelog sync failed unexpectedly")

    yield
    await engine.dispose()


app = FastAPI(
    title="PayDrift API",
    version="1.0.0",
    description="Budgeting SaaS for paycheck-based financial planning",
    redirect_slashes=False,
    lifespan=lifespan,
)

# CORS: FRONTEND_URL (comma-separated) + FRONTEND_ORIGIN (dev default) + production app hosts.
# Never use allow_origins=["*"] with allow_credentials=True — browsers block credentialed XHR (login, cookies).
_PRODUCTION_APP_ORIGIN = "https://paydrift.net"
_WWW_PRODUCTION_ORIGIN = "https://www.paydrift.net"
_LEGACY_NETLIFY_ORIGIN = "https://paydrift.netlify.app"
_raw = (settings.FRONTEND_URL or "").strip()
_env_origin = (os.getenv("FRONTEND_ORIGIN") or "").strip() or None
_dev_default = _env_origin or "http://localhost:5173"

if _raw == "*":
    # Wildcard is invalid with credentials; fall back to known PayDrift frontends + dev.
    origins = []
elif _raw:
    origins = [o.strip() for o in _raw.split(",") if o.strip()]
else:
    origins = []

for _extra in (_PRODUCTION_APP_ORIGIN, _WWW_PRODUCTION_ORIGIN, _LEGACY_NETLIFY_ORIGIN, _dev_default):
    if _extra and _extra not in origins:
        origins.append(_extra)
origins = list(dict.fromkeys(origins))

# Netlify branch / deploy-preview hosts: {slug}--paydrift.netlify.app (static list only has apex host).
_NETLIFY_PAYDRIFT_ORIGIN_REGEX = r"^https://([\w-]+--)?paydrift\.netlify\.app$"

# Paths exempt from the TOS version check
# Business-only plans cannot call personal finance APIs (direct URL / tooling).
_PERSONAL_API_PREFIXES = (
    "/api/v1/income",
    "/api/v1/bills",
    "/api/v1/debts",
    "/api/v1/savings",
    "/api/v1/payments",
    "/api/v1/paycheck-plan",
    "/api/v1/pay-periods",
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
    "/api/v1/documents",
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

# Paths exempt from maintenance mode — auth bootstrap + read-only identity.
# GET /auth/me must stay reachable so the SPA can load is_admin; PUT/PATCH /me stay blocked.
MAINTENANCE_EXEMPT_PATHS_EXACT = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/validate-reset-token",
    "/api/v1/version",
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


def invalidate_maintenance_cache() -> None:
    """Force next request to re-read maintenance_mode from the database (e.g. after admin toggles it)."""
    _maintenance_cache["checked_at"] = 0.0


@app.middleware("http")
async def tos_check_middleware(request: Request, call_next):
    # Skip preflight / non-mutating CORS requests
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in TOS_EXEMPT_PATHS or path.startswith("/docs") or path.startswith("/redoc") or path == "/openapi.json":
        return await call_next(request)

    try:
        snap = await get_request_user_snapshot(request)
    except Exception:
        logger.exception("TOS middleware DB lookup failed — allowing request through")
        return await call_next(request)

    if snap is None:
        return await call_next(request)

    if snap.tos_version is None or snap.tos_version < settings.CURRENT_TOS_VERSION:
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

    try:
        snap = await get_request_user_snapshot(request)
    except Exception:
        logger.exception("business_only_personal_api_block: tier lookup failed")
        return await call_next(request)

    if snap is None:
        return await call_next(request)

    if has_personal_home_access(normalize_plan_tier(snap.subscription_tier)):
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
    # Render and load balancers often probe GET/HEAD /
    if path == "/" and request.method in ("GET", "HEAD"):
        return await call_next(request)
    if path == "/api/v1/auth/me" and request.method == "GET":
        return await call_next(request)
    if any(path.startswith(prefix) for prefix in MAINTENANCE_EXEMPT_PREFIXES):
        return await call_next(request)

    if not await _is_maintenance_mode():
        return await call_next(request)

    # Check if the user is an admin — admins bypass maintenance mode
    try:
        snap = await get_request_user_snapshot(request)
    except Exception:
        logger.exception(
            "maintenance_mode_middleware: admin lookup failed — re-raising"
        )
        raise
    if snap is not None and snap.is_admin:
        return await call_next(request)

    return JSONResponse(
        status_code=503,
        content={"detail": "System is under maintenance. Please try again later."},
    )


# Register CORS last so it wraps all other middleware. If CORSMiddleware is innermost,
# middleware that returns a Response without call_next never runs CORS — browsers then
# report "No Access-Control-Allow-Origin" even for same-origin-adjacent failures.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=_NETLIFY_PAYDRIFT_ORIGIN_REGEX,
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
app.include_router(pay_periods.router, prefix="/api/v1")
app.include_router(paycheck_checklist.router, prefix="/api/v1")
app.include_router(shopping_list.router, prefix="/api/v1")
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
app.include_router(business_edition.router, prefix="/api/v1")
app.include_router(business_documents.router, prefix="/api/v1")
app.include_router(business_tax.router, prefix="/api/v1")
app.include_router(business_revenue.router, prefix="/api/v1")
app.include_router(business_reports.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("Database error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database temporarily unavailable. Please try again shortly.",
            "code": "database_unavailable",
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


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


@app.head("/")
async def service_root_head():
    return Response(status_code=200)


@app.get("/")
async def service_root():
    return {"service": "paydrift-api", "health": "/health", "version": "/api/v1/version"}


@app.get("/health")
async def health_check():
    from app.config import APP_VERSION
    from app.services.migration_status import build_migration_status

    payload: dict = {"app_version": APP_VERSION}
    from app.services.public_changelog import CHANGELOG_PATH

    payload["changelog_file"] = "ok" if CHANGELOG_PATH.is_file() else "missing"
    from app.services.storage.r2_health import r2_config_status, r2_write_probe_cached

    r2 = r2_config_status()
    payload["uploads_storage"] = "ok" if r2["configured"] else "not_configured"
    if not r2["configured"]:
        payload["uploads_storage_missing"] = r2["missing"]
    elif r2["configured"]:
        import asyncio

        probe = await asyncio.to_thread(r2_write_probe_cached)
        payload["uploads_storage_write"] = "ok" if probe.get("ok") else "failed"
        if not probe.get("ok"):
            payload["uploads_storage_write_error"] = probe.get("error")
    try:
        async with async_session() as session:
            status = await build_migration_status(session)
        payload.update(status.to_health_payload())
        if (
            not r2["configured"]
            or payload.get("uploads_storage_write") == "failed"
        ) and payload.get("status") == "healthy":
            payload["status"] = "degraded"
        if payload.get("changelog_file") == "missing":
            payload["status"] = "degraded"
    except Exception:
        logger.exception("Health check DB probe failed")
        payload["status"] = "degraded"
        payload["db"] = "error"
        payload["migration_ok"] = False
    return payload


@app.get("/api/v1/version")
async def get_version():
    from app.config import APP_VERSION
    return {"version": APP_VERSION}
