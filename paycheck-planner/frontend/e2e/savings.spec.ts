import { test, expect, cleanupTestData } from './fixtures';

test.describe('Savings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/savings');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const page = await context.newPage();
    await page.goto('/savings');
    await page.waitForLoadState('networkidle');
    await cleanupTestData(page, '/api/v1/savings/goals');
    await context.close();
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByText(/savings/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add goal/i })).toBeVisible();
  });

  test('create savings goal and verify it saves', async ({ page }) => {
    await page.getByRole('button', { name: /add goal/i }).click();

    await page.locator('input[name="name"]').fill('[TEST] Goal');
    await page.locator('input[name="target_amount"]').fill('10000.00');
    await page.locator('input[name="current_amount"]').fill('500.00');

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Goal')).toBeVisible({ timeout: 10_000 });
  });

  test('edit savings goal and verify it saves', async ({ page }) => {
    const goalText = page.getByText('[TEST] Goal').first();
    await expect(goalText).toBeVisible({ timeout: 10_000 });

    const card = goalText.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    await card.locator('button').filter({ has: page.locator('svg') }).first().click();

    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.clear();
    await nameInput.fill('[TEST] Goal Edited');

    await page.getByRole('button', { name: /update/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Goal Edited')).toBeVisible({ timeout: 10_000 });
  });

  test('delete savings goal and verify removal', async ({ page }) => {
    const goalText = page.getByText('[TEST] Goal Edited').first();
    await expect(goalText).toBeVisible({ timeout: 10_000 });

    const card = goalText.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    const deleteBtn = card.locator('button').filter({
      has: page.locator('svg.lucide-trash, svg.lucide-trash-2'),
    }).first();
    await deleteBtn.click();

    await page.getByRole('button', { name: /delete/i }).last().click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Goal Edited')).not.toBeVisible({ timeout: 5_000 });
  });
});
