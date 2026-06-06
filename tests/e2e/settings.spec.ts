import { test, expect } from '@playwright/test';
import { dismissToasts } from '../fixtures/helpers';

test.describe('Settings smoke', () => {
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
    await dismissToasts(page);
  });

  test('settings hub and preferences page load without error', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('test123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();

    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings\/preferences/);

    await expect(page.getByTestId('settings-back-btn')).toBeVisible();
    await expect(page.getByTestId('settings-search')).toBeVisible();
    await expect(page.getByTestId('settings-nav-general')).toBeVisible();
    await expect(page.getByTestId('timezone-auto-detect-switch')).toBeVisible();
  });

  test('settings navigation loads notifications page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('test123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();

    await page.goto('/settings/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('settings-back-btn')).toBeVisible();
    await expect(page.getByTestId('settings-nav-notifications')).toBeVisible();
  });
});
