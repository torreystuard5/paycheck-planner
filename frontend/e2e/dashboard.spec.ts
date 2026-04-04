import { test, expect, navigateViaSidebar } from './fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('page loads without errors', async ({ page, errorCollector }) => {
    await expect(page.getByText(/welcome/i)).toBeVisible();
    expect(errorCollector.consoleErrors).toHaveLength(0);
  });

  test('summary cards are visible', async ({ page }) => {
    await expect(page.getByText('Total Income')).toBeVisible();
    await expect(page.getByText('Total Bills')).toBeVisible();
    await expect(page.getByText('Total Debt')).toBeVisible();
    await expect(page.getByText('Savings Goals')).toBeVisible();
  });

  test('Total Income card navigates to /income', async ({ page }) => {
    await page.getByText('Total Income').click();
    await expect(page).toHaveURL(/\/income/);
  });

  test('Total Bills card navigates to /bills', async ({ page }) => {
    await page.getByText('Total Bills').click();
    await expect(page).toHaveURL(/\/bills/);
  });

  test('Total Debt card navigates to /debts', async ({ page }) => {
    await page.getByText('Total Debt').click();
    await expect(page).toHaveURL(/\/debts/);
  });

  test('Savings Goals card navigates to /savings', async ({ page }) => {
    await page.getByText('Savings Goals').click();
    await expect(page).toHaveURL(/\/savings/);
  });

  test('Refer a Friend banner is visible', async ({ page }) => {
    // Scroll down to find it; it may be the EarlyAccessBanner or a refer section
    const referText = page.getByText(/refer/i).first();
    await expect(referText).toBeVisible();
  });
});
