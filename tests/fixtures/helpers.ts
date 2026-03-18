import { Page, expect } from '@playwright/test';

export const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://iso-asset-hub.preview.emergentagent.com';
export const TEST_EMAIL = 'test@example.com';
export const TEST_PASSWORD = 'test123';
export const TEST_NAME = 'Test User';

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
}

export async function dismissToasts(page: Page) {
  await page.addLocatorHandler(
    page.locator('[data-sonner-toast], .Toastify__toast, [role="status"].toast, .MuiSnackbar-root'),
    async () => {
      const close = page.locator('[data-sonner-toast] [data-close], [data-sonner-toast] button[aria-label="Close"], .Toastify__close-button, .MuiSnackbar-root button');
      await close.first().click({ timeout: 2000 }).catch(() => {});
    },
    { times: 10, noWaitAfter: true }
  );
}

export async function loginUser(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByTestId('threats-page')).toBeVisible();
}

export async function registerAndLogin(page: Page, email: string, name: string, password: string) {
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('register-name-input').fill(name);
  await page.getByTestId('register-email-input').fill(email);
  await page.getByTestId('register-password-input').fill(password);
  await page.getByTestId('register-submit-button').click();
  await expect(page.getByTestId('threats-page')).toBeVisible();
}

export async function checkForErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const errorElements = Array.from(
      document.querySelectorAll('.error, [class*="error"], [id*="error"]')
    );
    return errorElements.map(el => el.textContent || '').filter(Boolean);
  });
}
