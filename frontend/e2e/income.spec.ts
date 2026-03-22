import { test, expect, cleanupTestData } from './fixtures';

test.describe('Income', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/income');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const page = await context.newPage();
    await page.goto('/income');
    await page.waitForLoadState('networkidle');
    await cleanupTestData(page, '/api/v1/income');
    await context.close();
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByText(/income/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add paycheck/i })).toBeVisible();
  });

  test('add income and verify it saves', async ({ page }) => {
    await page.getByRole('button', { name: /add paycheck/i }).click();

    await page.locator('input[name="name"]').fill('[TEST] Income');
    await page.locator('input[name="amount"]').fill('3500.00');
    await page.locator('select[name="frequency"]').selectOption('monthly');

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Income')).toBeVisible({ timeout: 10_000 });
  });

  test('edit income and verify it saves', async ({ page }) => {
    const incomeText = page.getByText('[TEST] Income').first();
    await expect(incomeText).toBeVisible({ timeout: 10_000 });

    // Click edit button on the income card
    const card = incomeText.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    await card.locator('button').filter({ has: page.locator('svg') }).first().click();

    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.clear();
    await nameInput.fill('[TEST] Income Edited');

    await page.getByRole('button', { name: /update/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Income Edited')).toBeVisible({ timeout: 10_000 });
  });

  test('delete income and verify removal', async ({ page }) => {
    const incomeText = page.getByText('[TEST] Income Edited').first();
    await expect(incomeText).toBeVisible({ timeout: 10_000 });

    const card = incomeText.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    const deleteBtn = card.locator('button').filter({
      has: page.locator('svg.lucide-trash, svg.lucide-trash-2'),
    }).first();
    await deleteBtn.click();

    // Confirm delete
    await page.getByRole('button', { name: /delete/i }).last().click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Income Edited')).not.toBeVisible({ timeout: 5_000 });
  });
});
