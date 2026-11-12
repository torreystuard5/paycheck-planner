"""Security and data integrity regressions from the environment review."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def db_for(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute.return_value = result
    db.add = MagicMock()
    return db


@pytest.mark.asyncio
async def test_other_users_debt_is_scoped_before_mutation():
    from app.routers.paycheck_checklist import _sync_debt_payment
    user = SimpleNamespace(id=uuid4(), household_id=None)
    db = db_for(None)
    with pytest.raises(HTTPException) as err:
        await _sync_debt_payment(db, user, uuid4(), True)
    assert err.value.status_code == 404
    statement = db.execute.call_args.args[0]
    assert 'debts.user_id =' in str(statement)
    assert user.id in statement.compile().params.values()
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_household_debt_query_requires_membership():
    from app.routers.paycheck_checklist import _sync_debt_payment
    user = SimpleNamespace(id=uuid4(), household_id=uuid4())
    db = db_for(None)
    with pytest.raises(HTTPException):
        await _sync_debt_payment(db, user, uuid4(), True)
    statement = db.execute.call_args.args[0]
    assert 'debts.household_id =' in str(statement)
    assert user.household_id in statement.compile().params.values()


@pytest.mark.asyncio
async def test_legacy_activation_cannot_grant_a_plan():
    from app.routers.billing import activate_plan
    from app.schemas.referral import BillingActivateRequest
    user = SimpleNamespace(subscription_tier='early_access')
    db = AsyncMock()
    with pytest.raises(HTTPException) as err:
        await activate_plan(BillingActivateRequest(plan='bundle'), user, db)
    assert err.value.status_code == 403
    assert user.subscription_tier == 'early_access'
    db.flush.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize('account_status', ['suspended', 'closed'])
async def test_restricted_accounts_cannot_use_tokens(account_status):
    from app.utils.security import get_current_user
    user = SimpleNamespace(id=uuid4(), is_active=True, account_status=account_status)
    with patch('app.utils.security.decode_token', return_value={'type':'access', 'sub':str(user.id)}):
        with pytest.raises(HTTPException) as err:
            await get_current_user(Request({'type':'http', 'path':'/api/v1/bills'}), 'token', db_for(user))
    assert err.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize('account_status', ['suspended', 'closed'])
async def test_restricted_accounts_cannot_refresh(account_status):
    from app.routers.auth import refresh_token
    user = SimpleNamespace(id=uuid4(), is_active=True, account_status=account_status)
    with patch('app.routers.auth.decode_token', return_value={'type':'refresh', 'sub':str(user.id)}):
        with pytest.raises(HTTPException) as err:
            await refresh_token('token', db_for(user))
    assert err.value.status_code == 403


@pytest.mark.asyncio
async def test_logout_revokes_token_version():
    from app.routers.auth import logout
    user = SimpleNamespace(id=uuid4())
    db = AsyncMock()
    await logout(user, db)
    statement = db.execute.call_args.args[0]
    assert 'token_version=(users.token_version +' in str(statement)
    assert user.id in statement.compile().params.values()


@pytest.mark.asyncio
async def test_failed_login_attempt_is_committed():
    from app.routers.auth import login
    from app.schemas.user import UserLogin
    user = SimpleNamespace(password_hash='hash', failed_login_count=2)
    db = db_for(user)
    with patch('app.routers.auth.verify_password', return_value=False):
        with pytest.raises(HTTPException):
            await login(UserLogin(email='local@example.com', password='wrong'), db)
    assert user.failed_login_count == 3
    db.commit.assert_awaited_once()


def test_encryption_key_survives_cipher_recreation():
    from app.services.encryption_service import _load_cipher
    encrypted = _load_cipher().encrypt(b'vault content')
    assert _load_cipher().decrypt(encrypted) == b'vault content'


@pytest.mark.parametrize('key', [None, 'invalid'])
def test_encryption_refuses_missing_or_invalid_keys(key):
    from app.services.encryption_service import _load_cipher
    with patch('app.services.encryption_service.settings.NOTES_ENCRYPTION_KEY', key):
        with pytest.raises(RuntimeError):
            _load_cipher()


@pytest.mark.asyncio
async def test_active_subscription_recovers_tier_from_price():
    from app.services.stripe_webhook import handle_subscription_updated
    user = SimpleNamespace(subscription_tier='early_access', stripe_subscription_id='sub_1',
        subscription_started_at=None, app_mode='personal')
    db = db_for(user)
    plan_result = MagicMock()
    plan_result.scalars.return_value.all.return_value = [SimpleNamespace(tier='pro', billing_period='monthly')]
    db.execute.side_effect = [db.execute.return_value, plan_result]
    await handle_subscription_updated(db, {'id':'sub_1', 'customer':'cus_1', 'status':'active',
        'items':{'data':[{'price':{'id':'price_pro'}}]}})
    assert user.subscription_tier == 'pro'
    assert user.subscription_status == 'active'


@pytest.mark.asyncio
async def test_repeated_bill_check_does_not_log_another_payment():
    from app.routers.paycheck_checklist import _sync_bill_payment
    from datetime import date
    user = SimpleNamespace(id=uuid4(), household_id=None)
    bill = SimpleNamespace(id=uuid4(), amount=100)
    db = db_for(bill)
    existing = MagicMock()
    existing.scalar_one_or_none.return_value = uuid4()
    db.execute.side_effect = [db.execute.return_value, existing]
    with patch('app.routers.paycheck_checklist.mark_bill_cycle_paid', new=AsyncMock()):
        await _sync_bill_payment(db, user, bill.id, True, date(2026,11,15))
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_paid_invoice_recovers_plan_from_current_subscription():
    from app.services.stripe_webhook import handle_invoice_paid
    user = SimpleNamespace(subscription_tier='early_access', stripe_subscription_id='sub_1', app_mode='personal')
    db = db_for(user)
    plan_result = MagicMock()
    plan_result.scalars.return_value.all.return_value = [SimpleNamespace(tier='bundle', billing_period='annual')]
    db.execute.side_effect = [db.execute.return_value, plan_result]
    sub = {'status':'active', 'items':{'data':[{'price':{'id':'price_bundle'}}]}}
    with patch('stripe.Subscription.retrieve', return_value=sub) as retrieve:
        await handle_invoice_paid(db, {'customer':'cus_1', 'subscription':'sub_1'})
    retrieve.assert_called_once_with('sub_1')
    assert user.subscription_tier == 'bundle'
    assert user.subscription_status == 'active'


@pytest.mark.asyncio
async def test_unrelated_invoice_does_not_downgrade_current_subscription():
    from app.services.stripe_webhook import handle_invoice_payment_failed
    user = SimpleNamespace(subscription_tier='pro', stripe_subscription_id='sub_current')
    db = db_for(user)
    await handle_invoice_payment_failed(db, {'customer':'cus_1', 'subscription':'sub_old'})
    assert user.subscription_tier == 'pro'
    db.flush.assert_not_called()
