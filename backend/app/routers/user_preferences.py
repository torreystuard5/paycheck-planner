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
    collapsed_sections: list[str]


@router.get("/me/ui-preferences")
async def get_ui_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserUIPreference).where(UserUIPreference.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()
    return {"collapsed_sections": pref.collapsed_sections if pref else []}


@router.patch("/me/ui-preferences")
async def update_ui_preferences(
    body: UIPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserUIPreference).where(UserUIPreference.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()

    if pref:
        pref.collapsed_sections = body.collapsed_sections
    else:
        pref = UserUIPreference(
            user_id=current_user.id,
            collapsed_sections=body.collapsed_sections,
        )
        db.add(pref)

    await db.flush()
    return {"collapsed_sections": pref.collapsed_sections}
