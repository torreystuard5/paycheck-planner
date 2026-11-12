"""Regressions for entitlement forgery, webhook retries and invalid token claims."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import json

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def database(value=None):
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db.execute.return_value = result
    return db


@pytest.mark.asyncio
@pytest.mark.parametrize('token', [None, '', 'forged'])
async def test_kofi_rejects_unverified_sender(token):
    from app.routers.supporter import kofi_webhook
    from app.config import settings
    db = database()
    with patch.object(settings, 'KOFI_VERIFICATION_TOKEN', 'configured-token'):
        with pytest.raises(HTTPException) as error:
            await kofi_webhook(json.dumps({'verification_token': token, 'amount': '100'}), db)
    assert error.value.status_code == 403
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_kofi_disabled_without_configuration():
    from app.routers.supporter import kofi_webhook
    from app.config import settings
    with patch.object(settings, 'KOFI_VERIFICATION_TOKEN', None):
        with pytest.raises(HTTPException) as error:
            await kofi_webhook('{}', database())
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_kofi_verified_sender_reaches_processing():
    from app.routers.supporter import kofi_webhook
    from app.config import settings
    payload = {'verification_token': 'configured-token'}
    with patch.object(settings, 'KOFI_VERIFICATION_TOKEN', 'configured-token'), patch(
        'app.routers.supporter.process_kofi_donation', new_callable=AsyncMock
    ) as process:
        await kofi_webhook(json.dumps(payload), database())
    process.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize('amount', ['NaN', 'Infinity', '-1', '0', '99999999999999', '1.001', 'invalid'])
async def test_kofi_rejects_invalid_money(amount):
    from app.services.supporter_service import process_kofi_donation
    db = database()
    with pytest.raises(ValueError):
        await process_kofi_donation({'amount': amount, 'currency': 'USD', 'message_id': 'receipt'}, db)
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_kofi_retry_does_not_duplicate_credit():
    from app.services.supporter_service import process_kofi_donation
    db = database(uuid4())
    result = await process_kofi_donation({'amount': '20', 'currency': 'USD', 'message_id': 'receipt'}, db)
    assert result['duplicate']
    db.add.assert_not_called()
    db.commit.assert_not_awaited()
    assert 'pg_advisory_xact_lock' in str(db.execute.call_args_list[0].args[0])


@pytest.mark.asyncio
@pytest.mark.parametrize('endpoint', ['get_promo_codes', 'create_promo'])
async def test_support_email_does_not_grant_administration(endpoint):
    from app.routers import supporter
    from app.schemas.supporter import PromoCodeCreate
    user = SimpleNamespace(is_admin=False, email='spsoftwaresolutionsllc@gmail.com')
    with pytest.raises(HTTPException) as error:
        if endpoint == 'create_promo':
            await supporter.create_promo(PromoCodeCreate(code='FORGED', tier='pro'), user, database())
        else:
            await supporter.get_promo_codes(user, database())
    assert error.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize('override', [{'payment_status': 'unpaid'}, {'mode': 'payment'}, {'status': 'open'}, {'subscription': None}])
async def test_checkout_never_grants_unverified_entitlements(override):
    from app.services.stripe_webhook import handle_checkout_completed
    user = SimpleNamespace(id=uuid4(), subscription_tier='early_access')
    session = {'metadata': {'user_id': str(user.id)}, 'mode': 'subscription', 'status': 'complete',
               'payment_status': 'paid', 'customer': 'cus_1', 'subscription': 'sub_1', **override}
    db = database(user)
    await handle_checkout_completed(db, session)
    assert user.subscription_tier == 'early_access'
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_checkout_provider_failure_does_not_grant_access():
    from app.services.stripe_webhook import handle_checkout_completed
    from app.config import settings
    user = SimpleNamespace(id=uuid4(), subscription_tier='early_access')
    session = {'metadata': {'user_id': str(user.id), 'tier': 'bundle'}, 'mode': 'subscription',
               'status': 'complete', 'payment_status': 'paid', 'customer': 'cus_1', 'subscription': 'sub_1'}
    with patch.object(settings, 'STRIPE_SECRET_KEY', 'mock-key'), patch('stripe.Subscription.retrieve', side_effect=RuntimeError('offline')):
        with pytest.raises(RuntimeError):
            await handle_checkout_completed(database(user), session)
    assert user.subscription_tier == 'early_access'


@pytest.mark.asyncio
async def test_checkout_uses_verified_price_not_metadata():
    from app.services.stripe_webhook import handle_checkout_completed
    from app.config import settings
    user = SimpleNamespace(id=uuid4(), subscription_tier='early_access', app_mode='personal')
    session = {'metadata': {'user_id': str(user.id), 'tier': 'bundle'}, 'mode': 'subscription',
               'status': 'complete', 'payment_status': 'paid', 'customer': 'cus_1', 'subscription': 'sub_1'}
    sub = {'id': 'sub_1', 'customer': 'cus_1', 'status': 'active', 'items': {'data': [{'price': {'id': 'price_pro'}}]}}
    db = database(user)
    plans = MagicMock()
    plans.scalars.return_value.all.return_value = [SimpleNamespace(tier='pro', billing_period='monthly')]
    db.execute.side_effect = [db.execute.return_value, plans]
    with patch.object(settings, 'STRIPE_SECRET_KEY', 'mock-key'), patch('stripe.Subscription.retrieve', return_value=sub):
        await handle_checkout_completed(db, session)
    assert user.subscription_tier == 'pro'
    assert user.stripe_subscription_id == 'sub_1'


@pytest.mark.asyncio
@pytest.mark.parametrize('claim', ['not-a-uuid', {}, 123])
async def test_invalid_subject_is_unauthorized(claim):
    from app.utils.security import get_current_user
    db = database()
    with patch('app.utils.security.decode_token', return_value={'type': 'access', 'sub': claim}):
        with pytest.raises(HTTPException) as error:
            await get_current_user(Request({'type': 'http', 'path': '/api/v1/bills'}), 'token', db)
    assert error.value.status_code == 401
    db.execute.assert_not_awaited()


@pytest.mark.parametrize('version', ['bad', {}, float('inf')])
def test_invalid_token_version_is_unauthorized(version):
    from app.utils.security import validate_token_version
    with pytest.raises(HTTPException) as error:
        validate_token_version({'tv': version}, SimpleNamespace(token_version=0))
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_foreign_household_cannot_be_attached_to_budget():
    from app.routers.budgets import create_budget
    from app.schemas.budget import BudgetCreate
    db = database()
    with pytest.raises(HTTPException) as error:
        await create_budget(BudgetCreate(name='Foreign', household_id=uuid4()), db, SimpleNamespace(household_id=uuid4()))
    assert error.value.status_code == 403
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_foreign_bill_cannot_be_attached_to_tax_deduction():
    from app.routers.tax import create_deduction
    from app.schemas.tax import TaxDeductionCreate
    user = SimpleNamespace(id=uuid4(), household_id=uuid4())
    bill = SimpleNamespace(user_id=uuid4(), household_id=uuid4())
    db = database(bill)
    body = TaxDeductionCreate(name='Foreign', amount='10', category='Other', date='2026-11-12', tax_year=2026, bill_id=uuid4())
    with pytest.raises(HTTPException) as error:
        await create_deduction(body, db, user)
    assert error.value.status_code == 404
    db.add.assert_not_called()

@pytest.mark.parametrize('model,payload', [
    ('payment', {'amount': None}), ('payment', {'amount':'-1'}), ('payment', {'amount':'0'}),
    ('contribution', {'goal_id':str(uuid4()),'amount': None}),
    ('contribution', {'goal_id':str(uuid4()),'amount':'-1'}),
    ('schedule', {'frequency':'never'}), ('schedule', {'frequency':'weekly','day_of_week':7}),
    ('schedule', {'frequency':'monthly','day1':0}), ('schedule', {'frequency':'monthly','day1':32}),
])
def test_financial_inputs_reject_invalid_amounts_and_schedule_bounds(model,payload):
    from pydantic import ValidationError
    from app.schemas.payment import PaymentCreate
    from app.schemas.savings import ContributionCreate
    from app.schemas.paycheck_schedule import PaycheckScheduleCreate
    models = {'payment':PaymentCreate, 'contribution':ContributionCreate, 'schedule':PaycheckScheduleCreate}
    with pytest.raises(ValidationError):
        models[model](**payload)


@pytest.mark.asyncio
async def test_pin_changes_have_the_same_brute_force_limit_as_unlock():
    from app.routers.notes import setup_pin, _pin_attempts
    from app.schemas.notes import PinSetupRequest
    user = SimpleNamespace(id=uuid4(),pin_hash='existing')
    try:
        with patch('app.routers.notes.pin_context.verify', return_value=False):
            for _ in range(5):
                with pytest.raises(HTTPException) as error:
                    await setup_pin(PinSetupRequest(current_pin='1234',new_pin='5678'),database(),user)
                assert error.value.status_code == 401
            with pytest.raises(HTTPException) as error:
                await setup_pin(PinSetupRequest(current_pin='1234',new_pin='5678'),database(),user)
            assert error.value.status_code == 429
    finally:
        _pin_attempts.pop(str(user.id),None)


@pytest.mark.asyncio
async def test_pin_change_invalidates_existing_vault_session():
    from app.routers.notes import _create_notes_session_token, verify_notes_session
    user = SimpleNamespace(id=uuid4(),pin_hash='old-pin-hash')
    token, _ = _create_notes_session_token(str(user.id),5,user.pin_hash)
    assert await verify_notes_session(user,token) is user
    user.pin_hash='new-pin-hash'
    with pytest.raises(HTTPException) as error:
        await verify_notes_session(user,token)
    assert error.value.status_code == 403

@pytest.mark.parametrize('module, model, payload', [
    ('tax', 'TaxDeductionUpdate', {'date':'2026-11-12'}),
    ('business', 'SaleUpdate', {'date':'2026-11-12'}),
    ('business', 'DeductionUpdate', {'date':'2026-11-12'}),
    ('updates', 'AppUpdateUpdate', {'date':'2026-11-12','description':'Synthetic update','type':'fix'}),
])
def test_optional_date_fields_accept_calendar_dates(module, model, payload):
    import importlib
    from datetime import date
    schema = getattr(importlib.import_module('app.schemas.'+module), model)
    assert schema(**payload).date == date(2026,11,12)


@pytest.mark.asyncio
async def test_missing_business_membership_never_falls_back_to_foreign_owner_permissions():
    from app.services.business_context import load_business_context
    actor=SimpleNamespace(id=uuid4())
    with patch('app.services.business_context.resolve_business_owner_user_id',new_callable=AsyncMock,return_value=uuid4()):
        with pytest.raises(HTTPException) as error:
            await load_business_context(database(None),actor)
    assert error.value.status_code==403


def test_legacy_hs256_token_signature_is_compatible_with_pyjwt():
    import base64,hashlib,hmac,time
    from app.config import settings
    from app.utils.security import decode_token
    def segment(value):return base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).rstrip(b'=')
    payload={'sub':str(uuid4()),'type':'access','exp':int(time.time())+60}
    unsigned=segment({'alg':'HS256','typ':'JWT'})+b'.'+segment(payload)
    signature=base64.urlsafe_b64encode(hmac.new(settings.SECRET_KEY.encode(),unsigned,hashlib.sha256).digest()).rstrip(b'=')
    assert decode_token((unsigned+b'.'+signature).decode())==payload
