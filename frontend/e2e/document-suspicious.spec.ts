import { test, expect } from './fixtures';

test.describe('Document drawer - suspicious paystub', () => {
  test('shows warning when parsed paystub is suspicious and allows override', async ({ page }) => {
    const fakeDoc = {
      id: 'test-doc-1',
      document_type: 'paystub',
      original_filename: 'paystub.pdf',
      created_at: new Date().toISOString(),
      status: 'completed',
      parsed_json: {
        employer_name: 'TinyCo',
        pay_date: '2026-01-01',
        gross_amount: '18000.00',
        net_amount: '200.00',
        is_suspicious: true,
        sanity_errors: ['gross_too_large_vs_net'],
      },
    };

    // Stub the documents list and detail endpoints
    await page.route('**/api/v1/documents', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([fakeDoc]),
      });
    });

    await page.route('**/api/v1/documents/test-doc-1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fakeDoc),
      });
    });

    // Stub confirm endpoint
    await page.route('**/api/v1/documents/test-doc-1/confirm-paystub', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto('/uploads');
    await page.waitForLoadState('networkidle');

    // Open document details
    await page.getByTitle('Details').click();

    // Expect the suspicious warning to be visible
    await expect(page.getByText('Suspicious paystub detected')).toBeVisible();
    await expect(page.getByText('Gross is implausibly large compared to net pay')).toBeVisible();

    // Ensure amounts are editable: change net amount and confirm
    const netInput = page.locator('input[placeholder="Net pay"]');
    await expect(netInput).toBeVisible();
    await netInput.fill('250.00');

    await page.getByRole('button', { name: /Confirm paycheck entry/i }).click();

    // Confirm success toast appears
    await expect(page.getByText('Paycheck entry added')).toBeVisible();
  });
});
