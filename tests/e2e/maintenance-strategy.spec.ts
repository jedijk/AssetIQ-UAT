import { test, expect } from '@playwright/test';

test.describe('Maintenance Strategy (library)', () => {
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

  test('library maintenance tab is reachable after login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('test123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();

    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('maintenance-strategies-tab').click();
    await expect(page.getByTestId('linked-to-equipment-toggle-maintenance')).toBeVisible();
  });
});
