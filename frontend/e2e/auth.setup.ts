import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
  if (!password) {
    throw new Error('PLAYWRIGHT_TEST_PASSWORD env var is required');
  }

  // Ensure auth directory exists
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  await page.goto('/login');
  await expect(page.locator('input#email')).toBeVisible({ timeout: 15_000 });

  await page.locator('input#email').fill('spsoftwaresolutionsllc@gmail.com');
  await page.locator('input#password').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait until we're redirected away from login to the dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  // Verify we're actually logged in by checking for dashboard content
  await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10_000 });

  // Save auth state
  await page.context().storageState({ path: authFile });
});
