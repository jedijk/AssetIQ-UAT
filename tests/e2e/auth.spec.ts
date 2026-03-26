import { test, expect } from '@playwright/test';

const PAGE_URL = process.env.REACT_APP_BACKEND_URL || 'https://risk-prioritize.preview.emergentagent.com';

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Remove emergent badge
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

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('login-logo')).toBeVisible();
    await expect(page.getByTestId('login-title')).toHaveText('Welcome back');
    await expect(page.getByTestId('login-email-input')).toBeVisible();
    await expect(page.getByTestId('login-password-input')).toBeVisible();
    await expect(page.getByTestId('login-submit-button')).toBeVisible();
    await expect(page.getByTestId('register-link')).toBeVisible();
  });

  test('register page renders correctly', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('register-logo')).toBeVisible();
    await expect(page.getByTestId('register-title')).toHaveText('Create account');
    await expect(page.getByTestId('register-name-input')).toBeVisible();
    await expect(page.getByTestId('register-email-input')).toBeVisible();
    await expect(page.getByTestId('register-password-input')).toBeVisible();
    await expect(page.getByTestId('register-submit-button')).toBeVisible();
    await expect(page.getByTestId('login-link')).toBeVisible();
  });

  test('login with valid credentials navigates to threats page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('test123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('wrongpassword');
    await page.getByTestId('login-submit-button').click();
    // Should show toast error and stay on login page
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('register with short password shows error', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('register-name-input').fill('Test User');
    await page.getByTestId('register-email-input').fill('newuser@test.com');
    await page.getByTestId('register-password-input').fill('abc');
    await page.getByTestId('register-submit-button').click();
    // Should stay on register page (validation error)
    await expect(page.getByTestId('register-form')).toBeVisible();
  });

  test('navigate between login and register pages', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('register-link').click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByTestId('register-title')).toBeVisible();
    await page.getByTestId('login-link').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-title')).toBeVisible();
  });

  test('logout works correctly', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('test123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();
    await page.getByTestId('logout-button').click({ force: true });
    await expect(page).toHaveURL(/\/login/);
  });
});
