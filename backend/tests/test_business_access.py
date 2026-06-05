"""Business Edition access and net profit helpers."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from app.services.business_access import (
    business_access_state,
    start_business_trial,
    user_can_start_business_trial,
    user_has_business_access,
)
from app.services.business_profit import compute_net_profit
from app.services.tier_access import sync_app_mode_to_subscription


def _user(tier="early_access", **kwargs):
    u = MagicMock()
    u.subscription_tier = tier
    u.business_trial_started_at = kwargs.get("business_trial_started_at")
    u.business_trial_ends_at = kwargs.get("business_trial_ends_at")
    u.business_trial_consumed = kwargs.get("business_trial_consumed", False)
    u.business_access_granted_until = kwargs.get("business_access_granted_until")
    return u


def test_early_access_has_business():
    u = _user("early_access")
    assert user_has_business_access(u)
    assert business_access_state(u) == "early_access"


def test_pro_needs_trial():
    u = _user("pro")
    assert not user_has_business_access(u)
    assert user_can_start_business_trial(u)


def test_trial_active():
    now = datetime.now(timezone.utc)
    u = _user(
        "pro",
        business_trial_started_at=now,
        business_trial_ends_at=now + timedelta(days=5),
        business_trial_consumed=True,
    )
    assert user_has_business_access(u)
    assert business_access_state(u) == "trial_active"


def test_start_trial_marks_consumed():
    u = _user("pro")
    start_business_trial(u)
    assert u.business_trial_consumed is True
    assert u.business_trial_ends_at is not None


def test_sync_preserves_business_mode_for_early_access():
    u = _user("early_access")
    u.app_mode = "business"
    assert sync_app_mode_to_subscription(u) is False
    assert u.app_mode == "business"


def test_sync_preserves_business_mode_for_pro():
    u = _user("pro")
    u.app_mode = "business"
    assert sync_app_mode_to_subscription(u) is False
    assert u.app_mode == "business"


def test_sync_forces_business_for_business_only_plan():
    u = _user("business")
    u.app_mode = "personal"
    assert sync_app_mode_to_subscription(u) is True
    assert u.app_mode == "business"


# Integration test for compute_net_profit requires a live DB fixture (add when configured).
