import { test, expect } from '@playwright/test';

test.describe('Maintenance Readiness Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.addLocatorHandler(
      page.locator('[class*="emergent"], [id*="emergent-badge"]'),
      async () => {
        await page.evaluate(() => {
          const badge = document.querySelector('[class*="emergent"], [id*="emergent-badge"]');
          if (badge) (badge as HTMLElement).style.display = 'none';
        });
      },
      { times: 3, noWaitAfter: true }
    );
  });

  test('admin can view maintenance readiness page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('test123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();

    await page.goto('/settings/maintenance-readiness', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('maintenance-readiness-page')).toBeVisible();
    await expect(page.getByText(/Strategy|Legacy|Maintenance Readiness/i).first()).toBeVisible();
  });
});
