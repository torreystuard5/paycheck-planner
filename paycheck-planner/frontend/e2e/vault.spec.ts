import { test, expect, navigateViaSidebar, getApiBase } from './fixtures';

const TEST_PIN = '1234';
const NEW_PIN = '5678';

/**
 * Helper: get an authenticated vault session token via API for cleanup.
 */
async function getVaultSession(page: import('@playwright/test').Page, pin: string) {
  const apiBase = getApiBase(page);
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (!token) return null;
  try {
    const res = await page.request.post(`${apiBase}/api/v1/notes/pin/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { pin },
    });
    if (res.ok()) {
      const data = await res.json();
      return data.notes_session_token;
    }
  } catch {}
  return null;
}

/**
 * Cleanup: delete all test notes and passwords.
 */
async function cleanupVault(page: import('@playwright/test').Page, sessionToken: string) {
  const apiBase = getApiBase(page);
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (!token || !sessionToken) return;

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Notes-Session': sessionToken,
  };

  // Clean notes
  try {
    const res = await page.request.get(`${apiBase}/api/v1/notes`, { headers });
    if (res.ok()) {
      const data = await res.json();
      const notes = Array.isArray(data) ? data : data.notes || [];
      for (const note of notes) {
        if ((note.title || '').startsWith('[TEST]')) {
          await page.request.delete(`${apiBase}/api/v1/notes/${note.id}`, { headers });
        }
      }
    }
  } catch {}

  // Clean passwords
  try {
    const res = await page.request.get(`${apiBase}/api/v1/passwords`, { headers });
    if (res.ok()) {
      const data = await res.json();
      const passwords = Array.isArray(data) ? data : data.passwords || [];
      for (const pw of passwords) {
        if ((pw.site_name || '').startsWith('[TEST]')) {
          await page.request.delete(`${apiBase}/api/v1/passwords/${pw.id}`, { headers });
        }
      }
    }
  } catch {}
}

/**
 * Try resetting PIN back to TEST_PIN after tests.
 */
async function resetPin(page: import('@playwright/test').Page, currentPin: string, newPin: string) {
  const apiBase = getApiBase(page);
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (!token) return;
  try {
    await page.request.post(`${apiBase}/api/v1/notes/pin/setup`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { current_pin: currentPin, new_pin: newPin },
    });
  } catch {}
}

test.describe('Secure Vault', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/vault');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const page = await context.newPage();
    await page.goto('/vault');
    await page.waitForLoadState('networkidle');

    // Try to get session and cleanup
    let session = await getVaultSession(page, TEST_PIN);
    if (!session) {
      session = await getVaultSession(page, NEW_PIN);
      // Reset PIN back to TEST_PIN
      if (session) {
        await resetPin(page, NEW_PIN, TEST_PIN);
      }
    }
    if (session) {
      await cleanupVault(page, session);
    }
    await context.close();
  });

  test('PIN setup or verify screen appears', async ({ page }) => {
    // Should see either "Create Vault PIN" or "Unlock Vault"
    const setupHeading = page.getByText('Create Vault PIN');
    const verifyHeading = page.getByText('Unlock Vault');
    await expect(setupHeading.or(verifyHeading)).toBeVisible({ timeout: 10_000 });
  });

  test('PIN setup or verify flow enters vault', async ({ page }) => {
    const setupHeading = page.getByText('Create Vault PIN');
    const verifyHeading = page.getByText('Unlock Vault');

    const heading = setupHeading.or(verifyHeading);
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const isSetup = await setupHeading.isVisible().catch(() => false);

    if (isSetup) {
      // Fill setup form
      const inputs = page.locator('input[type="password"]');
      await inputs.first().fill(TEST_PIN);
      await inputs.nth(1).fill(TEST_PIN);
      await page.getByRole('button', { name: /create pin/i }).click();
    } else {
      // Fill verify form
      await page.locator('input[type="password"]').fill(TEST_PIN);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await page.waitForLoadState('networkidle');
    // Vault content should appear with tabs
    await expect(page.getByText('Secure Vault')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Notes')).toBeVisible();
    await expect(page.getByText('Passwords')).toBeVisible();
  });

  test('navigate away and back requires PIN', async ({ page }) => {
    // Enter vault
    const setupHeading = page.getByText('Create Vault PIN');
    const verifyHeading = page.getByText('Unlock Vault');
    await expect(setupHeading.or(verifyHeading)).toBeVisible({ timeout: 10_000 });

    if (await setupHeading.isVisible().catch(() => false)) {
      const inputs = page.locator('input[type="password"]');
      await inputs.first().fill(TEST_PIN);
      await inputs.nth(1).fill(TEST_PIN);
      await page.getByRole('button', { name: /create pin/i }).click();
    } else {
      await page.locator('input[type="password"]').fill(TEST_PIN);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await expect(page.getByText('Secure Vault')).toBeVisible({ timeout: 10_000 });

    // Navigate away
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate back
    await page.goto('/vault');
    await page.waitForLoadState('networkidle');

    // Should require PIN again
    await expect(page.getByText('Unlock Vault')).toBeVisible({ timeout: 10_000 });
  });

  test('wrong PIN shows error', async ({ page }) => {
    // Should be on verify screen (PIN already set from prior tests)
    const verifyHeading = page.getByText('Unlock Vault');
    const setupHeading = page.getByText('Create Vault PIN');
    await expect(setupHeading.or(verifyHeading)).toBeVisible({ timeout: 10_000 });

    if (await verifyHeading.isVisible().catch(() => false)) {
      await page.locator('input[type="password"]').fill('9999');
      await page.getByRole('button', { name: /unlock/i }).click();
      await expect(page.getByText(/incorrect pin/i)).toBeVisible({ timeout: 10_000 });
    }
  });

  test('Notes tab: create, view, edit, delete note', async ({ page }) => {
    // Unlock vault
    const setupHeading = page.getByText('Create Vault PIN');
    const verifyHeading = page.getByText('Unlock Vault');
    await expect(setupHeading.or(verifyHeading)).toBeVisible({ timeout: 10_000 });

    if (await setupHeading.isVisible().catch(() => false)) {
      const inputs = page.locator('input[type="password"]');
      await inputs.first().fill(TEST_PIN);
      await inputs.nth(1).fill(TEST_PIN);
      await page.getByRole('button', { name: /create pin/i }).click();
    } else {
      await page.locator('input[type="password"]').fill(TEST_PIN);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await expect(page.getByText('Secure Vault')).toBeVisible({ timeout: 10_000 });

    // Create note
    await page.getByRole('button', { name: /new note/i }).click();
    await expect(page.getByText('New Note')).toBeVisible();

    await page.locator('input[type="text"]').fill('[TEST] My Note');
    await page.locator('textarea').fill('Test note content');
    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] My Note')).toBeVisible({ timeout: 10_000 });

    // View/edit note
    await page.getByText('[TEST] My Note').click();
    await expect(page.getByText('Edit Note')).toBeVisible({ timeout: 10_000 });

    const titleInput = page.locator('input[type="text"]');
    await titleInput.clear();
    await titleInput.fill('[TEST] My Note Edited');
    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] My Note Edited')).toBeVisible({ timeout: 10_000 });

    // Delete note
    await page.getByText('[TEST] My Note Edited').click();
    await expect(page.getByText('Edit Note')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /delete/i }).first().click();

    // Confirm delete dialog
    await expect(page.getByText('Delete Note')).toBeVisible();
    await page.getByRole('button', { name: /delete/i }).last().click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] My Note Edited')).not.toBeVisible({ timeout: 5_000 });
  });

  test('Passwords tab: create, view, show/hide, copy, generate, edit, delete', async ({ page }) => {
    // Unlock vault
    const setupHeading = page.getByText('Create Vault PIN');
    const verifyHeading = page.getByText('Unlock Vault');
    await expect(setupHeading.or(verifyHeading)).toBeVisible({ timeout: 10_000 });

    if (await setupHeading.isVisible().catch(() => false)) {
      const inputs = page.locator('input[type="password"]');
      await inputs.first().fill(TEST_PIN);
      await inputs.nth(1).fill(TEST_PIN);
      await page.getByRole('button', { name: /create pin/i }).click();
    } else {
      await page.locator('input[type="password"]').fill(TEST_PIN);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await expect(page.getByText('Secure Vault')).toBeVisible({ timeout: 10_000 });

    // Switch to Passwords tab
    await page.getByText('Passwords').click();

    // Create password
    await page.getByRole('button', { name: /new password/i }).click();
    await expect(page.getByText('New Password')).toBeVisible();

    // Fill form
    const inputs = page.locator('.space-y-4 input[type="text"]');
    await inputs.nth(0).fill('[TEST] Example Site');
    await inputs.nth(1).fill('https://example.com');
    await inputs.nth(2).fill('testuser@example.com');

    // Generate password
    await page.getByRole('button', { name: /generate/i }).click();
    // Password field should be populated (show password to verify)
    const passwordInput = page.locator('input[type="text"]').last();
    await expect(passwordInput).not.toHaveValue('');

    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Example Site')).toBeVisible({ timeout: 10_000 });

    // View password entry
    await page.getByText('[TEST] Example Site').click();
    await expect(page.getByText('Password Details')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('testuser@example.com')).toBeVisible();

    // Password should be hidden by default
    await expect(page.getByText('••••••••••••')).toBeVisible();

    // Show/hide toggle
    const eyeButtons = page.locator('button[title="Show"], button[title="Hide"]');
    await eyeButtons.first().click();
    // After clicking show, dots should be replaced with actual password
    await expect(page.getByText('••••••••••••')).not.toBeVisible({ timeout: 5_000 });

    // Copy username
    const copyButtons = page.locator('button[title="Copy Username"]');
    if (await copyButtons.count() > 0) {
      await copyButtons.first().click();
    }

    // Copy password
    const copyPwButtons = page.locator('button[title="Copy Password"]');
    if (await copyPwButtons.count() > 0) {
      await copyPwButtons.first().click();
    }

    // Edit password
    await page.getByRole('button', { name: /edit/i }).click();
    await expect(page.getByText('Edit Password')).toBeVisible({ timeout: 10_000 });

    const siteNameInput = page.locator('.space-y-4 input[type="text"]').first();
    await siteNameInput.clear();
    await siteNameInput.fill('[TEST] Example Site Edited');
    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Example Site Edited')).toBeVisible({ timeout: 10_000 });

    // Delete password
    await page.getByText('[TEST] Example Site Edited').click();
    await expect(page.getByText('Password Details')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /delete/i }).first().click();

    await expect(page.getByText('Delete Password')).toBeVisible();
    await page.getByRole('button', { name: /delete/i }).last().click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Example Site Edited')).not.toBeVisible({ timeout: 5_000 });
  });

  test('change PIN works', async ({ page }) => {
    // Unlock vault
    const setupHeading = page.getByText('Create Vault PIN');
    const verifyHeading = page.getByText('Unlock Vault');
    await expect(setupHeading.or(verifyHeading)).toBeVisible({ timeout: 10_000 });

    if (await setupHeading.isVisible().catch(() => false)) {
      const inputs = page.locator('input[type="password"]');
      await inputs.first().fill(TEST_PIN);
      await inputs.nth(1).fill(TEST_PIN);
      await page.getByRole('button', { name: /create pin/i }).click();
    } else {
      await page.locator('input[type="password"]').fill(TEST_PIN);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await expect(page.getByText('Secure Vault')).toBeVisible({ timeout: 10_000 });

    // Open settings
    await page.locator('button[title="Vault Settings"]').click();
    await expect(page.getByText('Vault Settings')).toBeVisible();

    // Change PIN
    const pinInputs = page.locator('input[type="password"]');
    await pinInputs.nth(0).fill(TEST_PIN);
    await pinInputs.nth(1).fill(NEW_PIN);
    await pinInputs.nth(2).fill(NEW_PIN);
    await page.getByRole('button', { name: /change pin/i }).click();

    await expect(page.getByText(/pin changed successfully/i)).toBeVisible({ timeout: 10_000 });

    // Reset back to original PIN
    await pinInputs.nth(0).fill(NEW_PIN);
    await pinInputs.nth(1).fill(TEST_PIN);
    await pinInputs.nth(2).fill(TEST_PIN);
    await page.getByRole('button', { name: /change pin/i }).click();

    await expect(page.getByText(/pin changed successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test('lock timeout setting can be changed', async ({ page }) => {
    // Unlock vault
    const setupHeading = page.getByText('Create Vault PIN');
    const verifyHeading = page.getByText('Unlock Vault');
    await expect(setupHeading.or(verifyHeading)).toBeVisible({ timeout: 10_000 });

    if (await setupHeading.isVisible().catch(() => false)) {
      const inputs = page.locator('input[type="password"]');
      await inputs.first().fill(TEST_PIN);
      await inputs.nth(1).fill(TEST_PIN);
      await page.getByRole('button', { name: /create pin/i }).click();
    } else {
      await page.locator('input[type="password"]').fill(TEST_PIN);
      await page.getByRole('button', { name: /unlock/i }).click();
    }

    await expect(page.getByText('Secure Vault')).toBeVisible({ timeout: 10_000 });

    // Verify timer is visible
    await expect(page.locator('[data-testid="lock-timer"]')).toBeVisible();

    // Open settings and change timeout
    await page.locator('button[title="Vault Settings"]').click();
    await expect(page.getByText('Vault Settings')).toBeVisible();

    const select = page.locator('[data-testid="lock-timeout-select"]');
    await select.selectOption('3');
    await page.waitForLoadState('networkidle');

    // Verify the select value changed
    await expect(select).toHaveValue('3');
  });
});
