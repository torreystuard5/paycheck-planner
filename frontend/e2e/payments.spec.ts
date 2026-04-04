import { test, expect } from './fixtures';

test.describe('Payments', () => {
  test('page loads without errors', async ({ page, errorCollector }) => {
    await page.goto('/payments');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/payment/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /record payment/i })).toBeVisible();

    expect(errorCollector.consoleErrors).toHaveLength(0);
  });
});
