import { test, expect } from './fixtures';

const allPages = [
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
  { name: 'Admin Stats', path: '/admin/stats' },
  { name: 'Admin Users', path: '/admin/users' },
];

test.describe('Global Error Check', () => {
  for (const { name, path } of allPages) {
    test(`${name} (${path}) — no JS errors, no failed requests, loads within 5s`, async ({
      page,
      errorCollector,
    }) => {
      const start = Date.now();

      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - start;

      // Page should load within 5 seconds
      expect(loadTime).toBeLessThan(5_000);

      // No console errors
      if (errorCollector.consoleErrors.length > 0) {
        console.log(`Console errors on ${path}:`, errorCollector.consoleErrors);
      }
      expect(errorCollector.consoleErrors).toHaveLength(0);

      // No failed network requests
      if (errorCollector.networkErrors.length > 0) {
        console.log(`Network errors on ${path}:`, errorCollector.networkErrors);
      }
      expect(errorCollector.networkErrors).toHaveLength(0);
    });
  }
});
