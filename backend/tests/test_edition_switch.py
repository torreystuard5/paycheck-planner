"""Edition switching (Personal ↔ Business) access rules."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.services.business_access import (
    business_access_payload,
    start_business_trial,
    user_can_start_business_trial,
    user_has_business_access,
)
from app.services.tier_access import (
    has_personal_home_access,
    sync_app_mode_to_subscription,
)


def _user(tier="early_access", **kwargs):
    u = MagicMock()
    u.subscription_tier = tier
    u.app_mode = kwargs.get("app_mode", "personal")
    u.business_trial_started_at = kwargs.get("business_trial_started_at")
    u.business_trial_ends_at = kwargs.get("business_trial_ends_at")
    u.business_trial_consumed = kwargs.get("business_trial_consumed", False)
    u.business_access_granted_until = kwargs.get("business_access_granted_until")
    return u


def test_early_access_can_switch_both_surfaces():
    u = _user("early_access")
    assert user_has_business_access(u)
    assert has_personal_home_access("early_access")
    payload = business_access_payload(u)
    assert payload["can_switch_editions"] is True
    assert payload["has_personal_access"] is True
    assert payload["has_business_access"] is True


def test_pro_can_switch_editions_flag():
    u = _user("pro")
    payload = business_access_payload(u)
    assert payload["can_switch_editions"] is True
    assert payload["has_personal_access"] is True
    assert not payload["has_business_access"]
    assert payload["can_start_trial"] is True


def test_pro_trial_then_business_access():
    now = datetime.now(timezone.utc)
    u = _user("pro")
    start_business_trial(u)
    assert user_has_business_access(u)
    assert not user_can_start_business_trial(u)


def test_sync_preserves_user_chosen_business_mode():
    for tier in ("early_access", "pro", "bundle"):
        u = _user(tier, app_mode="business")
        assert sync_app_mode_to_subscription(u) is False
        assert u.app_mode == "business"


def test_sync_preserves_user_chosen_personal_mode():
    u = _user("bundle", app_mode="personal")
    assert sync_app_mode_to_subscription(u) is False
    assert u.app_mode == "personal"


def test_business_only_forced_to_business_mode():
    u = _user("business", app_mode="personal")
    assert sync_app_mode_to_subscription(u) is True
    assert u.app_mode == "business"
