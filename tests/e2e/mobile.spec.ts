import { test, expect, devices } from '@playwright/test';
import { dismissToasts } from '../fixtures/helpers';

// iPhone viewport on Chromium (matches playwright.config single-browser setup)
test.use({
  ...devices['iPhone 13'],
  defaultBrowserType: 'chromium',
});

test.describe('Mobile viewport', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
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

  test('login and my tasks page work on mobile', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('login-form')).toBeVisible();
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('test123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();

    await page.goto('/my-tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('filter-open')).toBeVisible();
    await expect(page.getByTestId('task-search')).toBeVisible();
  });
});
