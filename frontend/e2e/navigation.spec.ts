import { test, expect, openMobileSidebar } from './fixtures';

const sidebarLinks = [
  { name: 'Dashboard', path: '/dashboard' },
  { name: 'Bills', path: '/bills' },
  { name: 'Debts', path: '/debts' },
  { name: 'Savings', path: '/savings' },
  { name: 'Income', path: '/income' },
  { name: 'Payments', path: '/payments' },
  { name: 'Reports', path: '/reports' },
  { name: 'Household', path: '/household' },
  { name: 'Settings', path: '/settings' },
  { name: 'Support', path: '/support' },
];

const adminLinks = [
  { name: 'Users', path: '/admin/users' },
  { name: 'Admin Stats', path: '/admin/stats' },
];

test.describe('Navigation', () => {
  test('every sidebar link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    for (const link of [...sidebarLinks, ...adminLinks]) {
      await openMobileSidebar(page);

      // Use link role to find the navigation link
      const navLink = page.getByRole('link', { name: link.name, exact: false }).first();
      await expect(navLink).toBeVisible();
      await navLink.click();

      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(new RegExp(link.path));
    }
  });

  test('no 404 pages for valid routes', async ({ page }) => {
    const routes = [
      '/dashboard', '/bills', '/debts', '/savings', '/income',
      '/payments', '/reports', '/household', '/settings', '/support',
      '/admin/stats', '/admin/users',
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // Verify we're NOT on the 404 page
      const notFoundText = page.getByText(/page not found|404/i);
      await expect(notFoundText).not.toBeVisible({ timeout: 3_000 });
    }
  });
});
