import { test, expect, type Page, type Locator } from '@playwright/test';

const API = 'http://127.0.0.1:8000';
const today = new Date().toLocaleDateString('en-CA');
function field(scope: Page | Locator, label: string) {
  return scope.locator('label').filter({ hasText: label }).locator('..').locator('input').first();
}

test.beforeEach(async ({ page, request }) => {
  const email = `local-browser-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  const response = await request.post(`${API}/api/v1/auth/register`, { data: {
    email, password, first_name: 'Synthetic', last_name: 'Browser',
    pay_frequency: 'biweekly', next_pay_date: today, net_pay_amount: '2000.00', tos_accepted: true,
  }});
  expect(response.status()).toBe(201);
  await page.goto('/login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('Active budget is required.', { exact: false })).toHaveCount(0);
});

test('new account dashboard, paycheck entry, and budget switching', async ({ page }) => {
  await page.goto('/income');
  await page.getByRole('button', {name:'Log Paycheck',exact:true}).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('e.g. Main Job, Side Gig').fill('Browser paycheck');
  await field(dialog,'Net Amount').fill('1234.56');
  await dialog.getByRole('button',{name:'Log Paycheck',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Browser paycheck', {exact:true}).first()).toBeVisible();
  await page.goto('/budgets');
  await page.getByRole('button',{name:'Create budget',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByPlaceholder('e.g. Main Budget, Side Hustle').fill('Browser second budget');
  await dialog.getByRole('button',{name:/create/i}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Set active',exact:true}).click();
  await page.goto('/income');
  await expect(page.getByText('Browser paycheck',{exact:true})).toHaveCount(0);
});

test('bill and debt creation preserve editable workflows', async ({ page }) => {
  await page.goto('/bills');
  await page.getByRole('button',{name:'Add Bill',exact:true}).first().click();
  let dialog=page.getByRole('dialog');
  await field(dialog,'Name').fill('Browser bill');
  await field(dialog,'Amount').fill('52.45');
  await field(dialog,'Due Day').fill('15');
  await dialog.getByRole('button',{name:'Create',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Browser bill',{exact:true}).first()).toBeVisible();
  await page.goto('/debts');
  await page.getByRole('button',{name:'Add Debt',exact:true}).first().click();
  dialog=page.getByRole('dialog');
  await field(dialog,'Name').fill('Browser debt');
  await field(dialog,'Balance').fill('1000.00');
  await field(dialog,'Minimum Payment').fill('25.00');
  await dialog.getByRole('button',{name:'Create',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Browser debt',{exact:true}).first()).toBeVisible();
});

test('vault setup, encrypted note, lock and unlock', async ({ page }) => {
  await page.goto('/vault');
  await expect(page.getByRole('heading',{name:'Create Vault PIN'})).toBeVisible();
  await page.locator('input[type=password]').nth(0).fill('123456');
  await page.locator('input[type=password]').nth(1).fill('123456');
  await page.getByRole('button',{name:'Create PIN',exact:true}).click();
  await page.getByRole('button',{name:/new note/i}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByPlaceholder('Note title (optional)').fill('Browser secret note');
  await dialog.getByPlaceholder('Write your note...').fill('Synthetic encrypted content');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Browser secret note',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/lock vault/i}).click();
  await page.locator('input[type=password]').fill('123456');
  await page.getByRole('button',{name:/unlock/i}).click();
  await expect(page.getByText('Browser secret note',{exact:true})).toBeVisible();
});
