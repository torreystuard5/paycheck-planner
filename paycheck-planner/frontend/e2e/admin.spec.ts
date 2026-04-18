import { test, expect } from './fixtures';

test.describe('Admin', () => {
  test('Admin Stats page loads with data', async ({ page, errorCollector }) => {
    await page.goto('/admin/stats');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Admin Stats')).toBeVisible();

    // Verify stat cards render with actual data
    await expect(page.getByText('Total Signups')).toBeVisible();
    await expect(page.getByText('Pro Subscribers')).toBeVisible();
    await expect(page.getByText('Free Users')).toBeVisible();
    await expect(page.getByText('Active Last 30 Days')).toBeVisible();
    await expect(page.getByText('Households')).toBeVisible();
    await expect(page.getByText('Support Tickets')).toBeVisible();

    // Chart section
    await expect(page.getByText(/signups.*last 7 days/i)).toBeVisible();

    expect(errorCollector.consoleErrors).toHaveLength(0);
  });

  test('Admin Users page loads with user list', async ({ page, errorCollector }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/users/i).first()).toBeVisible();

    // Should have at least the test account visible
    await expect(page.getByText('spsoftwaresolutionsllc@gmail.com')).toBeVisible({ timeout: 10_000 });

    // Table headers
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Name')).toBeVisible();

    expect(errorCollector.consoleErrors).toHaveLength(0);
  });
});
