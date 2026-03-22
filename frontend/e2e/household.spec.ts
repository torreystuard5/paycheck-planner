import { test, expect } from './fixtures';

test.describe('Household', () => {
  test('page loads without errors', async ({ page, errorCollector }) => {
    await page.goto('/household');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/household/i).first()).toBeVisible();

    // The page should show either the household dashboard or the create/join options
    const hasHousehold = await page.getByText(/members/i).isVisible().catch(() => false);
    const hasCreate = await page.getByText(/create household/i).isVisible().catch(() => false);

    expect(hasHousehold || hasCreate).toBeTruthy();
    expect(errorCollector.consoleErrors).toHaveLength(0);
  });
});
