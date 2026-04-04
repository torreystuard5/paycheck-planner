import { test, expect, cleanupTestData } from './fixtures';

test.describe('Debts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/debts');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const page = await context.newPage();
    await page.goto('/debts');
    await page.waitForLoadState('networkidle');
    await cleanupTestData(page, '/api/v1/debts');
    await context.close();
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByText(/debts/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add debt/i })).toBeVisible();
  });

  test('add debt and verify it saves', async ({ page }) => {
    await page.getByRole('button', { name: /add debt/i }).click();

    await page.locator('input[name="name"]').fill('[TEST] Debt');
    await page.locator('select[name="debt_type"]').selectOption('credit card');
    await page.locator('input[name="balance"]').fill('5000.00');
    await page.locator('input[name="credit_limit"]').fill('10000.00');
    await page.locator('input[name="apr"]').fill('19.99');
    await page.locator('input[name="minimum_payment"]').fill('100.00');
    await page.locator('input[name="due_day"]').fill('20');

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Debt')).toBeVisible({ timeout: 10_000 });
  });

  test('edit debt and verify it saves', async ({ page }) => {
    const debtText = page.getByText('[TEST] Debt').first();
    await expect(debtText).toBeVisible({ timeout: 10_000 });

    const card = debtText.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    await card.locator('button').filter({ has: page.locator('svg') }).first().click();

    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.clear();
    await nameInput.fill('[TEST] Debt Edited');

    await page.getByRole('button', { name: /update/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Debt Edited')).toBeVisible({ timeout: 10_000 });
  });

  test('delete debt and verify removal', async ({ page }) => {
    const debtText = page.getByText('[TEST] Debt Edited').first();
    await expect(debtText).toBeVisible({ timeout: 10_000 });

    const card = debtText.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    const deleteBtn = card.locator('button').filter({
      has: page.locator('svg.lucide-trash, svg.lucide-trash-2'),
    }).first();
    await deleteBtn.click();

    await page.getByRole('button', { name: /delete/i }).last().click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Debt Edited')).not.toBeVisible({ timeout: 5_000 });
  });
});
