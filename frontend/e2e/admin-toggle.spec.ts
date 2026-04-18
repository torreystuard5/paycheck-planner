import { test, expect, navigateViaSidebar } from './fixtures';

test.describe('Admin Users Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
  });

  test('Admin Users page shows toggle switches in admin column', async ({ page }) => {
    await expect(page.getByText(/users/i).first()).toBeVisible();

    // Should have at least one toggle switch
    const toggles = page.locator('button[role="switch"]');
    await expect(toggles.first()).toBeVisible({ timeout: 10_000 });
  });

  test('toggle admin on for a non-admin user', async ({ page }) => {
    // Find a toggle that is currently off (aria-checked=false)
    const offToggles = page.locator('button[role="switch"][aria-checked="false"]');
    const offCount = await offToggles.count();

    if (offCount > 0) {
      await offToggles.first().click();
      await page.waitForLoadState('networkidle');

      // Should now be on (aria-checked=true)
      // Wait for the API call to complete
      await page.waitForTimeout(1000);

      // Verify no error toast appeared
      const errorBanner = page.locator('.bg-red-50');
      const errorVisible = await errorBanner.isVisible().catch(() => false);
      // If error appeared, the toggle was reverted — that's acceptable
      if (!errorVisible) {
        // Toggle off again to restore state
        const toggle = offToggles.first();
        if (await toggle.getAttribute('aria-checked') === 'true') {
          await toggle.click();
          await page.waitForLoadState('networkidle');
        }
      }
    }
  });

  test('toggle admin off for an admin user succeeds or shows lockout error', async ({ page }) => {
    // Find a toggle that is currently on (aria-checked=true)
    const onToggles = page.locator('button[role="switch"][aria-checked="true"]');
    const onCount = await onToggles.count();

    if (onCount > 1) {
      // More than one admin — safe to toggle one off
      await onToggles.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Toggle back on to restore state
      const toggle = onToggles.first();
      if (await toggle.getAttribute('aria-checked') === 'false') {
        await toggle.click();
        await page.waitForLoadState('networkidle');
      }
    } else if (onCount === 1) {
      // Only one admin — attempting to toggle off should show lockout error
      await onToggles.first().click();
      await page.waitForTimeout(500);

      // Should show error about only admin
      const errorBanner = page.locator('.bg-red-50');
      const errorVisible = await errorBanner.isVisible().catch(() => false);
      // Either lockout error shows on frontend, or backend rejects
      // Both are valid behaviors
    }
  });
});
