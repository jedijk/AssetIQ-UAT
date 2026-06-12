# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication Flows >> login page renders correctly
- Location: e2e/auth.spec.ts:20:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('login-logo')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('login-logo')

```

```yaml
- iframe
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const PAGE_URL = process.env.REACT_APP_BACKEND_URL || 'https://action-lockup-bug.preview.emergentagent.com';
  4  | 
  5  | test.describe('Authentication Flows', () => {
  6  |   test.beforeEach(async ({ page }) => {
  7  |     // Remove emergent badge
  8  |     await page.addLocatorHandler(
  9  |       page.locator('[class*="emergent"], [id*="emergent-badge"]'),
  10 |       async () => {
  11 |         await page.evaluate(() => {
  12 |           const badge = document.querySelector('[class*="emergent"], [id*="emergent-badge"]');
  13 |           if (badge) (badge as HTMLElement).style.display = 'none';
  14 |         });
  15 |       },
  16 |       { times: 3, noWaitAfter: true }
  17 |     );
  18 |   });
  19 | 
  20 |   test('login page renders correctly', async ({ page }) => {
  21 |     await page.goto('/login', { waitUntil: 'domcontentloaded' });
> 22 |     await expect(page.getByTestId('login-logo')).toBeVisible();
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  23 |     await expect(page.getByTestId('login-title')).toHaveText('Welcome back');
  24 |     await expect(page.getByTestId('login-email-input')).toBeVisible();
  25 |     await expect(page.getByTestId('login-password-input')).toBeVisible();
  26 |     await expect(page.getByTestId('login-submit-button')).toBeVisible();
  27 |     await expect(page.getByTestId('register-link')).toBeVisible();
  28 |   });
  29 | 
  30 |   test('register page renders correctly', async ({ page }) => {
  31 |     await page.goto('/register', { waitUntil: 'domcontentloaded' });
  32 |     await expect(page.getByTestId('register-logo')).toBeVisible();
  33 |     await expect(page.getByTestId('register-title')).toHaveText('Create account');
  34 |     await expect(page.getByTestId('register-name-input')).toBeVisible();
  35 |     await expect(page.getByTestId('register-email-input')).toBeVisible();
  36 |     await expect(page.getByTestId('register-password-input')).toBeVisible();
  37 |     await expect(page.getByTestId('register-submit-button')).toBeVisible();
  38 |     await expect(page.getByTestId('login-link')).toBeVisible();
  39 |   });
  40 | 
  41 |   test('login with valid credentials navigates to threats page', async ({ page }) => {
  42 |     await page.goto('/login', { waitUntil: 'domcontentloaded' });
  43 |     await page.getByTestId('login-email-input').fill('test@example.com');
  44 |     await page.getByTestId('login-password-input').fill('test123');
  45 |     await page.getByTestId('login-submit-button').click();
  46 |     await expect(page.getByTestId('threats-page')).toBeVisible();
  47 |   });
  48 | 
  49 |   test('login with invalid credentials shows error', async ({ page }) => {
  50 |     await page.goto('/login', { waitUntil: 'domcontentloaded' });
  51 |     await page.getByTestId('login-email-input').fill('test@example.com');
  52 |     await page.getByTestId('login-password-input').fill('wrongpassword');
  53 |     await page.getByTestId('login-submit-button').click();
  54 |     // Should show toast error and stay on login page
  55 |     await expect(page.getByTestId('login-form')).toBeVisible();
  56 |   });
  57 | 
  58 |   test('unauthenticated user redirected to login', async ({ page }) => {
  59 |     await page.goto('/', { waitUntil: 'domcontentloaded' });
  60 |     await expect(page).toHaveURL(/\/login/);
  61 |   });
  62 | 
  63 |   test('register with short password shows error', async ({ page }) => {
  64 |     await page.goto('/register', { waitUntil: 'domcontentloaded' });
  65 |     await page.getByTestId('register-name-input').fill('Test User');
  66 |     await page.getByTestId('register-email-input').fill('newuser@test.com');
  67 |     await page.getByTestId('register-password-input').fill('abc');
  68 |     await page.getByTestId('register-submit-button').click();
  69 |     // Should stay on register page (validation error)
  70 |     await expect(page.getByTestId('register-form')).toBeVisible();
  71 |   });
  72 | 
  73 |   test('navigate between login and register pages', async ({ page }) => {
  74 |     await page.goto('/login', { waitUntil: 'domcontentloaded' });
  75 |     await page.getByTestId('register-link').click();
  76 |     await expect(page).toHaveURL(/\/register/);
  77 |     await expect(page.getByTestId('register-title')).toBeVisible();
  78 |     await page.getByTestId('login-link').click();
  79 |     await expect(page).toHaveURL(/\/login/);
  80 |     await expect(page.getByTestId('login-title')).toBeVisible();
  81 |   });
  82 | 
  83 |   test('logout works correctly', async ({ page }) => {
  84 |     await page.goto('/login', { waitUntil: 'domcontentloaded' });
  85 |     await page.getByTestId('login-email-input').fill('test@example.com');
  86 |     await page.getByTestId('login-password-input').fill('test123');
  87 |     await page.getByTestId('login-submit-button').click();
  88 |     await expect(page.getByTestId('threats-page')).toBeVisible();
  89 |     await page.getByTestId('logout-button').click({ force: true });
  90 |     await expect(page).toHaveURL(/\/login/);
  91 |   });
  92 | });
  93 | 
```