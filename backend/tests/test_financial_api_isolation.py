"""Opt-in PostgreSQL API checks. Use only an isolated migrated *_test database.

PAYDRIFT_TEST_DATABASE_URL=postgresql+asyncpg://.../paydrift_security_test pytest -q
Each test uses a rollback transaction, including handlers that call commit().
"""
import os
from datetime import date
from contextlib import asynccontextmanager
from unittest.mock import patch
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.engine import make_url

from app.database import get_db
from app.main import app
from app.models.user import User


@pytest_asyncio.fixture
async def api_db():
    url = os.getenv('PAYDRIFT_TEST_DATABASE_URL')
    if not url:
        pytest.skip('Set PAYDRIFT_TEST_DATABASE_URL to an isolated migrated test database')
    assert make_url(url).database.endswith('_test'), 'Refusing a non-test database'
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, join_transaction_mode='create_savepoint', expire_on_commit=False) as db:
            async def override():
                yield db
            previous = dict(app.dependency_overrides)
            app.dependency_overrides[get_db] = override
            @asynccontextmanager
            async def session_scope():
                yield db
            try:
                with patch('app.main.async_session', session_scope), patch('app.middleware.request_auth.async_session', session_scope):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as api:
                        yield api, db
            finally:
                app.dependency_overrides.clear()
                app.dependency_overrides.update(previous)
        await transaction.rollback()
    await engine.dispose()


async def register(api, db):
    email = f'{uuid4().hex}@example.com'
    response = await api.post('/api/v1/auth/register', json={
        'email': email, 'password': uuid4().hex, 'first_name': 'Synthetic', 'last_name': 'Security',
        'pay_frequency': 'biweekly', 'next_pay_date': str(date.today()), 'net_pay_amount': '2000.00', 'tos_accepted': True,
    })
    assert response.status_code == 201, response.text
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    # Synthetic fixture grants only; no production provider or checkout is used.
    user.subscription_tier = 'bundle'
    await db.flush()
    return {'Authorization': 'Bearer '+response.json()['access_token']}, user


@pytest.mark.asyncio
async def test_every_financial_route_requires_authentication(api_db):
    api, _ = api_db
    prefixes = ('/api/v1/bills', '/api/v1/debts', '/api/v1/income', '/api/v1/payments',
                '/api/v1/savings', '/api/v1/paycheck-', '/api/v1/pay-periods', '/api/v1/tax',
                '/api/v1/calendar', '/api/v1/budgets', '/api/v1/business', '/api/v1/documents',
                '/api/v1/notes', '/api/v1/passwords', '/api/v1/subscriptions', '/api/v1/import', '/api/v1/export')
    checked = 0
    import re
    for path, operations in app.openapi()['paths'].items():
        # Static public role documentation contains no account or financial data.
        if path == '/api/v1/business/edition/team/permissions-matrix': continue
        if not path.startswith(prefixes):
            continue
        path = re.sub(r'\{[^}]+\}', str(uuid4()), path)
        for method in operations.keys() & {'get', 'post', 'put', 'patch', 'delete'}:
            response = await api.request(method.upper(), path, json={})
            assert response.status_code in (401, 403), (method, path, response.status_code, response.text)
            checked += 1
    assert checked >= 100, checked


@pytest.mark.asyncio
async def test_foreign_household_financial_records_are_isolated(api_db):
    api, db = api_db
    owner, alice = await register(api, db)
    outsider, bob = await register(api, db)
    hh = await api.post('/api/v1/households', headers=owner, json={'name': 'Alice household'})
    assert hh.status_code == 201, hh.text
    hh2 = await api.post('/api/v1/households', headers=outsider, json={'name': 'Bob household'})
    assert hh2.status_code == 201, hh2.text
    resources = [
        ('bills', {'name':'Private bill','amount':'50.00','due_day':15,'frequency':'monthly'}, 'put'),
        ('debts', {'name':'Private debt','balance':'1000.00','minimum_payment':'25.00','interest_rate':'5.00','due_day':15}, 'put'),
        ('income', {'name':'Private income','amount':'500.00','frequency':'monthly','next_pay_date':str(date.today())}, 'put'),
        ('savings/goals', {'name':'Private savings','target_amount':'1000.00'}, 'put'),
        ('paycheck-entries', {'source_name':'Private paycheck','pay_date':str(date.today()),'net_amount':'500.00'}, 'put'),
        ('paycheck-schedules', {'frequency':'monthly','day1':15}, 'put'),
        ('tax/deductions', {'name':'Private tax','amount':'10.00','category':'Other','date':str(date.today()),'tax_year':date.today().year}, 'put'),
        ('budgets', {'name':'Private budget'}, 'patch'),
    ]
    created = {}
    for resource, body, update_method in resources:
        response = await api.post('/api/v1/'+resource, headers=owner, json=body)
        assert response.status_code == 201, (resource, response.text)
        ident = response.json()['id']
        created[resource] = ident
        query = {'tax_year': date.today().year} if resource == 'tax/deductions' else {}
        listing = await api.get('/api/v1/'+resource, headers=outsider, params=query)
        assert listing.status_code == 200, (resource, listing.text)
        assert ident not in [row['id'] for row in listing.json()], resource
        for method in ['get', update_method, 'delete']:
            # Tax deductions intentionally have no individual GET route.
            if resource in ('tax/deductions', 'paycheck-schedules') and method == 'get': continue
            response = await api.request(method.upper(), f'/api/v1/{resource}/{ident}', headers=outsider, json=body)
            assert response.status_code in (403,404), (method,resource,response.status_code,response.text)
    # Both reading a foreign budget period and writing into it must be denied.
    for path in ['pay-periods/current', 'pay-periods/next', 'pay-periods/summary']:
        response = await api.get('/api/v1/'+path, headers=outsider, params={'budget_id':created['budgets']})
        assert response.status_code == 403, response.text
    for resource, body, _ in resources:
        if resource == 'budgets': continue
        response = await api.post('/api/v1/'+resource, headers=outsider, json={**body,'budget_id':created['budgets']})
        assert response.status_code == 403, (resource,response.text)
    # Action endpoints must enforce the same household boundary as CRUD.
    for method, path, body in [
        ('PATCH',f"bills/{created['bills']}/pay",{}),
        ('PATCH',f"bills/{created['bills']}/unpay?occurrence_due_date={date.today()}",{}),
        ('PATCH',f"bills/{created['bills']}/postpone",{'postpone_until':str(date.today())}),
        ('GET',f"bills/{created['bills']}/breakdown",{}),
        ('POST',f"bills/{created['bills']}/member-payment",{'amount_paid':'1.00'}),
        ('POST',f"debts/{created['debts']}/mark-paid",{}),
        ('DELETE',f"debts/{created['debts']}/unmark-paid",{}),
        ('POST','payments',{'bill_id':created['bills'],'amount':'1.00','paid_date':str(date.today()),'pay_period_date':str(date.today())}),
        ('POST','savings/contributions',{'goal_id':created['savings/goals'],'amount':'1.00','pay_period_date':str(date.today())}),
        ('GET',f"savings/contributions/{created['savings/goals']}",{}),
    ]:
        response = await api.request(method, '/api/v1/'+path, headers=outsider, json=body)
        assert response.status_code in (403,404), (method,path,response.status_code,response.text)
    # Spoofed household references are rejected, even for a valid foreign UUID.
    response = await api.post('/api/v1/budgets', headers=outsider, json={'name':'Forged','household_id':hh.json()['id']})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_plan_activation_and_admin_routes_deny_nonadmins(api_db):
    api, db = api_db
    headers, user = await register(api, db)
    user.subscription_tier = 'early_access'
    await db.flush()
    for path, body in [('billing/activate-plan', {'plan':'bundle'}), ('supporter/create-promo', {'code':'FORGED','tier':'lifetime'})]:
        response = await api.post('/api/v1/'+path, headers=headers, json=body)
        assert response.status_code == 403, response.text
    for path in ['supporter/promo-codes','admin/users']:
        response = await api.get('/api/v1/'+path, headers=headers)
        assert response.status_code == 403, response.text
    response = await api.post('/api/v1/billing/checkout', headers=headers, json={'tier':'bundle','billing_period':'monthly'})
    assert response.status_code == 200, response.text
    assert response.json()['stripe_configured'] is False
    await db.refresh(user)
    assert user.subscription_tier == 'early_access'


@pytest.mark.asyncio
async def test_vault_pin_change_preserves_ciphertext_and_isolates_sessions(api_db):
    from app.models.note import Note
    api, db = api_db
    headers, user = await register(api, db)
    other_headers, _ = await register(api, db)
    response = await api.get('/api/v1/notes/pin/status', headers=headers)
    assert response.json()['pin_configured'] is False
    assert (await api.post('/api/v1/notes/pin/setup', headers=headers, json={'pin':'123456'})).status_code == 200
    response = await api.post('/api/v1/notes/pin/verify', headers=headers, json={'pin':'123456'})
    token = response.json()['notes_session_token']
    vault_headers = {**headers,'X-Notes-Session':token}
    response = await api.post('/api/v1/notes', headers=vault_headers, json={'title':'Synthetic','content':'Encrypted regression content'})
    assert response.status_code == 201, response.text
    ident = response.json()['id']
    row = (await db.execute(select(Note).where(Note.id==ident))).scalar_one()
    ciphertext = row.content
    assert 'Encrypted regression content' not in ciphertext
    # A vault session cannot be used with another user's bearer token.
    response = await api.get(f'/api/v1/notes/{ident}',headers={**other_headers,'X-Notes-Session':token})
    assert response.status_code == 403
    response = await api.post('/api/v1/notes/pin/setup',headers=headers,json={'current_pin':'123456','new_pin':'654321'})
    assert response.status_code == 200, response.text
    assert (await api.get(f'/api/v1/notes/{ident}',headers=vault_headers)).status_code == 403
    response = await api.post('/api/v1/notes/pin/verify',headers=headers,json={'pin':'654321'})
    new_token = response.json()['notes_session_token']
    response = await api.get(f'/api/v1/notes/{ident}',headers={**headers,'X-Notes-Session':new_token})
    assert response.status_code == 200, response.text
    assert response.json()['content'] == 'Encrypted regression content'
    await db.refresh(row)
    assert row.content == ciphertext


@pytest.mark.asyncio
async def test_registration_creates_a_usable_default_budget(api_db):
    api, db = api_db
    headers, user = await register(api,db)
    response = await api.get('/api/v1/budgets/current',headers=headers)
    assert response.status_code == 200, response.text
    budget=response.json()
    assert budget['is_default'] and budget['id']==str(user.current_budget_id)
    response=await api.get('/api/v1/pay-periods/current',headers=headers)
    assert response.status_code == 200,response.text


@pytest.mark.asyncio
async def test_refresh_body_and_logout_revoke_access_and_refresh_tokens(api_db):
    api, db = api_db
    headers, user = await register(api,db)
    from app.utils.security import build_user_token_data, create_refresh_token
    token=create_refresh_token(build_user_token_data(user))
    response=await api.post('/api/v1/auth/refresh',json={'refresh_token':token})
    assert response.status_code==200,response.text
    assert (await api.post('/api/v1/auth/logout',headers=headers)).status_code==200
    assert (await api.get('/api/v1/auth/me',headers=headers)).status_code==401
    assert (await api.post('/api/v1/auth/refresh',json={'refresh_token':token})).status_code==401
    # Tokens in query parameters are intentionally rejected to keep them out of access logs.
    assert (await api.post('/api/v1/auth/refresh',params={'refresh_token':token})).status_code==422


@pytest.mark.asyncio
async def test_business_tenants_and_team_permissions_are_isolated(api_db):
    from app.models.business_team import BusinessTeamMember
    api,db=api_db
    owner,alice=await register(api,db)
    outsider,bob=await register(api,db)
    alice.app_mode=bob.app_mode='business'
    await db.flush()
    resources=[
        ('customers',{'name':'Private customer'}),
        ('sales',{'date':str(date.today()),'amount':'100.00','source':'Private sale'}),
        ('deductions',{'date':str(date.today()),'amount':'10.00','category':'Other'}),
        ('staff',{'name':'Private staff','pay_rate':'15.00'}),
        ('funds',{'fund_type':'contingency','name':'Private fund'}),
    ]
    for resource,body in resources:
        response=await api.post('/api/v1/business/'+resource,headers=owner,json=body)
        assert response.status_code==201,(resource,response.text)
        ident=response.json()['id']
        response=await api.get('/api/v1/business/'+resource,headers=outsider)
        assert response.status_code==200,(resource,response.text)
        assert ident not in [row['id'] for row in response.json()]
        for method in ['GET','PATCH','DELETE']:
            response=await api.request(method,f'/api/v1/business/{resource}/{ident}',headers=outsider,json=body)
            assert response.status_code in (403,404),(method,resource,response.status_code,response.text)
    db.add(BusinessTeamMember(owner_user_id=alice.id,member_user_id=bob.id,role='employee',status='active',permissions={'manage_sales':False}))
    await db.flush()
    response=await api.post('/api/v1/business/sales',headers=outsider,json={'date':str(date.today()),'amount':'100.00'})
    assert response.status_code==403,response.text
    response=await api.get('/api/v1/business/staff',headers=outsider)
    assert response.status_code==403,response.text
