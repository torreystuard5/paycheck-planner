from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.user_ui_preference import UserUIPreference
from app.schemas.user import UserResponse
from app.services.business_access import user_has_business_access
from app.services.tier_access import (
    can_switch_app_mode,
    has_personal_home_access,
    normalize_plan_tier,
)
from app.constants.dashboard_widgets import (
    DEFAULT_DASHBOARD_WIDGET_ORDER,
    sanitize_dashboard_widget_order,
    sanitize_hidden_dashboard_widgets,
)
from app.services.dashboard_widget_preferences import ui_preferences_response
from app.utils.security import get_current_user

router = APIRouter(prefix="/users", tags=["User Preferences"])


# ── App Mode ──────────────────────────────────────────────────────

class AppModeUpdate(BaseModel):
    app_mode: str


@router.patch("/me/app-mode", response_model=UserResponse)
async def update_app_mode(
    body: AppModeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.app_mode not in ("personal", "business"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="app_mode must be 'personal' or 'business'",
        )
    tier = normalize_plan_tier(current_user.subscription_tier)
    if body.app_mode == "business" and not user_has_business_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "business_upgrade_required",
                "message": "Activate Business from the edition chooser or upgrade your plan.",
            },
        )
    if body.app_mode == "personal" and not has_personal_home_access(tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your plan does not include Personal mode",
        )
    if body.app_mode == "personal" and tier == "business" and not can_switch_app_mode(tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business-only plans cannot switch to Personal mode",
        )
    current_user.app_mode = body.app_mode
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return current_user


# ── UI Preferences ────────────────────────────────────────────────

class UIPreferencesUpdate(BaseModel):
    collapsed_sections: list[str] | None = None
    hidden_dashboard_widgets: list[str] | None = None
    dashboard_widget_order: list[str] | None = None


@router.get("/me/ui-preferences")
async def get_ui_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserUIPreference).where(UserUIPreference.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()
    return ui_preferences_response(pref)


@router.patch("/me/ui-preferences")
async def update_ui_preferences(
    body: UIPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (
        body.collapsed_sections is None
        and body.hidden_dashboard_widgets is None
        and body.dashboard_widget_order is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one preference field is required",
        )

    result = await db.execute(
        select(UserUIPreference).where(UserUIPreference.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()

    if pref:
        if body.collapsed_sections is not None:
            pref.collapsed_sections = body.collapsed_sections
        if body.hidden_dashboard_widgets is not None:
            pref.hidden_dashboard_widgets = sanitize_hidden_dashboard_widgets(
                body.hidden_dashboard_widgets
            )
        if body.dashboard_widget_order is not None:
            pref.dashboard_widget_order = sanitize_dashboard_widget_order(
                body.dashboard_widget_order
            )
    else:
        pref = UserUIPreference(
            user_id=current_user.id,
            collapsed_sections=body.collapsed_sections or [],
            hidden_dashboard_widgets=sanitize_hidden_dashboard_widgets(
                body.hidden_dashboard_widgets or []
            ),
            dashboard_widget_order=sanitize_dashboard_widget_order(
                body.dashboard_widget_order or list(DEFAULT_DASHBOARD_WIDGET_ORDER)
            ),
        )
        db.add(pref)

    await db.flush()
    return ui_preferences_response(pref)
