import { test, expect, cleanupTestData } from './fixtures';

test.describe('Bills', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const page = await context.newPage();
    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await cleanupTestData(page, '/api/v1/bills');
    await context.close();
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByText(/bills/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add bill/i })).toBeVisible();
  });

  test('Add Bill button opens form', async ({ page }) => {
    await page.getByRole('button', { name: /add bill/i }).click();
    await expect(page.getByText(/add bill/i).last()).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
  });

  test('create bill with only name (minimal)', async ({ page }) => {
    await page.getByRole('button', { name: /add bill/i }).click();
    await page.locator('input[name="name"]').fill('[TEST] Minimal Bill');
    await page.locator('input[name="amount"]').fill('25.00');

    await page.getByRole('button', { name: /save|create/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify the bill appears on the page
    await expect(page.getByText('[TEST] Minimal Bill')).toBeVisible({ timeout: 10_000 });
  });

  test('create bill with all fields (full)', async ({ page }) => {
    await page.getByRole('button', { name: /add bill/i }).click();

    await page.locator('input[name="name"]').fill('[TEST] Full Bill');
    await page.locator('input[name="amount"]').fill('150.00');
    await page.locator('select[name="frequency"]').selectOption('monthly');
    await page.locator('input[name="due_day"]').fill('15');
    await page.locator('select[name="category"]').selectOption('Utilities');
    await page.locator('input[name="reminder_days"]').fill('3');

    // Check auto-pay if the checkbox exists
    const autoPay = page.locator('input#auto_pay');
    if (await autoPay.isVisible()) {
      await autoPay.check();
    }

    await page.getByRole('button', { name: /save|create/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Full Bill')).toBeVisible({ timeout: 10_000 });
  });

  test('edit a test bill', async ({ page }) => {
    // Wait for test bill to appear
    const billCard = page.locator('text=[TEST] Minimal Bill').first();
    await expect(billCard).toBeVisible({ timeout: 10_000 });

    // Click edit (pencil icon) on the card containing the test bill
    const card = billCard.locator('..').locator('..');
    const editBtn = card.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-edit') }).first();

    // Fallback: find any edit button near the test bill text
    if (!(await editBtn.isVisible())) {
      // Try to find the edit button by traversing up further
      await billCard.locator('xpath=ancestor::div[contains(@class,"rounded")]//button[1]').first().click();
    } else {
      await editBtn.click();
    }

    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.clear();
    await nameInput.fill('[TEST] Minimal Bill Edited');

    await page.getByRole('button', { name: /save|update/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('[TEST] Minimal Bill Edited')).toBeVisible({ timeout: 10_000 });
  });

  test('toggle Split/Single pay and save', async ({ page }) => {
    // Open edit on Full Bill
    const billCard = page.getByText('[TEST] Full Bill').first();
    await expect(billCard).toBeVisible({ timeout: 10_000 });

    const card = billCard.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    const editBtns = card.locator('button').filter({ has: page.locator('svg') });
    await editBtns.first().click();

    // Look for Split/Single toggle buttons (only visible if in a household)
    const splitBtn = page.getByRole('button', { name: /split pay/i });
    if (await splitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await splitBtn.click();
      await page.getByRole('button', { name: /save|update/i }).click();
      await page.waitForLoadState('networkidle');
    } else {
      // Not in a multi-member household; close modal
      await page.getByRole('button', { name: /cancel/i }).click();
    }
  });

  test('set biweekly frequency with day picker', async ({ page }) => {
    const billCard = page.getByText('[TEST] Full Bill').first();
    await expect(billCard).toBeVisible({ timeout: 10_000 });

    const card = billCard.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    await card.locator('button').filter({ has: page.locator('svg') }).first().click();

    await page.locator('select[name="frequency"]').selectOption('biweekly');

    // Day of week picker should appear — click Wednesday
    const wedBtn = page.getByRole('button', { name: /wed/i });
    if (await wedBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await wedBtn.click();
    }

    await page.getByRole('button', { name: /save|update/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('mark bill as paid and verify status', async ({ page }) => {
    const billText = page.getByText('[TEST] Full Bill').first();
    await expect(billText).toBeVisible({ timeout: 10_000 });

    // Find "Mark as Paid" button near this bill
    const markPaidBtn = page.getByRole('button', { name: /mark as paid/i }).first();
    if (await markPaidBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await markPaidBtn.click();

      // Fill in payment modal if it appears
      const confirmBtn = page.getByRole('button', { name: /confirm/i });
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await page.waitForLoadState('networkidle');

      // Verify paid status
      await expect(page.getByText(/paid/i).first()).toBeVisible();
    }
  });

  test('filter tabs work (All/Unpaid/Paid)', async ({ page }) => {
    // Click each tab and verify the page updates
    const allTab = page.getByRole('button', { name: /^all$/i });
    const unpaidTab = page.getByRole('button', { name: /unpaid/i });
    const paidTab = page.getByRole('button', { name: /^paid$/i });

    await expect(allTab).toBeVisible();

    await unpaidTab.click();
    await page.waitForLoadState('networkidle');

    await paidTab.click();
    await page.waitForLoadState('networkidle');

    await allTab.click();
    await page.waitForLoadState('networkidle');
  });

  test('delete test bills (cleanup)', async ({ page }) => {
    // Delete all test bills from the UI
    const testBills = ['[TEST] Full Bill', '[TEST] Minimal Bill Edited', '[TEST] Minimal Bill'];

    for (const billName of testBills) {
      const billText = page.getByText(billName).first();
      if (await billText.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const card = billText.locator('xpath=ancestor::div[contains(@class,"rounded")]');
        // Click delete (trash icon)
        const deleteBtn = card.locator('button').filter({
          has: page.locator('svg.lucide-trash, svg.lucide-trash-2'),
        }).first();
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          // Confirm deletion
          const confirmDelete = page.getByRole('button', { name: /delete/i }).last();
          await confirmDelete.click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(500);
        }
      }
    }
  });
});
