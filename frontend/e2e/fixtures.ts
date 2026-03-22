import { test as base, expect, type Page } from '@playwright/test';

type ConsoleError = { type: string; text: string; url: string };
type NetworkError = { url: string; status: number; method: string };

type ErrorCollector = {
  consoleErrors: ConsoleError[];
  networkErrors: NetworkError[];
};

export const test = base.extend<{ errorCollector: ErrorCollector }>({
  errorCollector: async ({ page }, use) => {
    const consoleErrors: ConsoleError[] = [];
    const networkErrors: NetworkError[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known benign console errors
        if (
          text.includes('favicon') ||
          text.includes('manifest') ||
          text.includes('Download the React DevTools') ||
          text.includes('Third-party cookie') ||
          text.includes('net::ERR_')
        ) {
          return;
        }
        consoleErrors.push({ type: msg.type(), text, url: page.url() });
      }
    });

    page.on('response', (response) => {
      const status = response.status();
      const url = response.url();
      // Ignore expected 4xx for optional endpoints and assets
      if (
        status >= 400 &&
        !url.includes('favicon') &&
        !url.includes('manifest') &&
        !url.includes('/api/v1/households/me') &&  // 404 if no household
        !url.includes('/api/v1/households/activity') &&
        !url.includes('/api/v1/paycheck-plan')  // may 404 if no plan
      ) {
        networkErrors.push({
          url,
          status,
          method: response.request().method(),
        });
      }
    });

    await use({ consoleErrors, networkErrors });
  },
});

export { expect };

/**
 * Open the mobile sidebar by tapping the menu button.
 */
export async function openMobileSidebar(page: Page) {
  const menuBtn = page.locator('button').filter({ has: page.locator('svg.lucide-menu') });
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
    // Wait for the sidebar to animate in
    await page.waitForTimeout(300);
  }
}

/**
 * Navigate via the mobile sidebar.
 */
export async function navigateViaSidebar(page: Page, linkText: string) {
  await openMobileSidebar(page);
  await page.getByRole('link', { name: linkText }).first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Get an authenticated API helper for cleanup/setup operations.
 */
export function getApiBase(page: Page): string {
  const base = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://paydrift.netlify.app';
  // The frontend proxies /api to the backend in dev, but in production
  // we need to call the backend directly
  return 'https://paydrift-api.onrender.com';
}

/**
 * Delete all test data items matching prefix via API.
 */
export async function cleanupTestData(page: Page, endpoint: string, nameField = 'name') {
  const apiBase = getApiBase(page);
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (!token) return;

  try {
    const response = await page.request.get(`${apiBase}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok()) return;

    const data = await response.json();
    const items = Array.isArray(data) ? data : data.items || data.results || [];

    for (const item of items) {
      const name = item[nameField] || '';
      if (name.startsWith('[TEST]')) {
        await page.request.delete(`${apiBase}${endpoint}/${item.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  } catch {
    // Cleanup is best-effort
  }
}
