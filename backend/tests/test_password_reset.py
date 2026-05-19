"""Password reset token lifecycle and login gating."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.services.password_reset_service import (
    RESET_TOKEN_EXPIRY_HOURS,
    apply_reset_token_to_user,
    assert_reset_token_valid,
    complete_password_reset,
    generate_reset_token,
)
from app.utils.security import hash_password, verify_password


def _user(*, must_reset=False, token=None, expires=None):
    return SimpleNamespace(
        id=uuid4(),
        email="user@example.com",
        first_name="Test",
        is_active=True,
        password_hash=hash_password("oldpassword1"),
        reset_token=token,
        reset_token_expires=expires,
        must_reset_password=must_reset,
        failed_login_count=3,
    )


class TestPasswordResetToken(unittest.TestCase):
    def test_generate_token_is_unique(self):
        a = generate_reset_token()
        b = generate_reset_token()
        self.assertNotEqual(a, b)
        self.assertGreaterEqual(len(a), 32)

    def test_apply_token_sets_expiry_and_optional_must_reset(self):
        user = _user()
        token = generate_reset_token()
        apply_reset_token_to_user(user, token=token, require_must_reset=True)
        self.assertEqual(user.reset_token, token)
        self.assertTrue(user.must_reset_password)
        self.assertIsNotNone(user.reset_token_expires)
        delta = user.reset_token_expires - datetime.now(timezone.utc)
        self.assertGreater(delta, timedelta(hours=RESET_TOKEN_EXPIRY_HOURS - 0.1))
        self.assertLess(delta, timedelta(hours=RESET_TOKEN_EXPIRY_HOURS + 0.1))

    def test_expired_token_rejected(self):
        user = _user(
            token="abc",
            expires=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        with self.assertRaises(Exception):
            assert_reset_token_valid(user)

    def test_complete_reset_clears_token_and_must_reset(self):
        user = _user(token="abc", must_reset=True)
        complete_password_reset(user, "newpassword1")
        self.assertIsNone(user.reset_token)
        self.assertIsNone(user.reset_token_expires)
        self.assertFalse(user.must_reset_password)
        self.assertEqual(user.failed_login_count, 0)
        self.assertTrue(verify_password("newpassword1", user.password_hash))
        self.assertFalse(verify_password("oldpassword1", user.password_hash))


if __name__ == "__main__":
    unittest.main()
