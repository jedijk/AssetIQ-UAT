import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Failure Mode Library Page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('failure-modes-page')).toBeVisible();
  });

  test('library page renders with header and stats', async ({ page }) => {
    await expect(page.getByTestId('failure-modes-page')).toBeVisible();
    // Check header text
    await expect(page.getByText('Failure Mode Library', { exact: true })).toBeVisible();
    // Stats row: 100 failure modes, 8 categories
    await expect(page.getByText('100').first()).toBeVisible();
    await expect(page.getByText('8').first()).toBeVisible();
  });

  test('failure modes list loads with items', async ({ page }) => {
    // Wait for list to appear
    await expect(page.getByTestId('failure-modes-list')).toBeVisible();
    // Should have many items
    const items = page.locator('[data-testid^="failure-mode-"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('search input filters failure modes', async ({ page }) => {
    await expect(page.getByTestId('failure-modes-list')).toBeVisible();
    const initialCount = await page.locator('[data-testid^="failure-mode-"]').count();

    const searchInput = page.getByTestId('search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('pump');

    // Wait for filtered results
    await page.waitForTimeout(500);
    const filteredCount = await page.locator('[data-testid^="failure-mode-"]').count();
    expect(filteredCount).toBeLessThan(initialCount);
  });

  test('clearing search restores all items', async ({ page }) => {
    await expect(page.getByTestId('failure-modes-list')).toBeVisible();
    const originalCount = await page.locator('[data-testid^="failure-mode-"]').count();

    const searchInput = page.getByTestId('search-input');
    await searchInput.fill('seal');
    await page.waitForTimeout(500);

    await searchInput.clear();
    await page.waitForTimeout(500);
    const restoredCount = await page.locator('[data-testid^="failure-mode-"]').count();
    expect(restoredCount).toBe(originalCount);
  });

  test('category filter badge click filters items', async ({ page }) => {
    await expect(page.getByTestId('failure-modes-list')).toBeVisible();
    const allCount = await page.locator('[data-testid^="failure-mode-"]').count();

    // Click Rotating category badge
    await page.getByTestId('category-badge-rotating').click({ force: true });
    await page.waitForTimeout(500);

    const rotatingCount = await page.locator('[data-testid^="failure-mode-"]').count();
    expect(rotatingCount).toBeGreaterThan(0);
    expect(rotatingCount).toBeLessThan(allCount);
  });

  test('category filter dropdown works', async ({ page }) => {
    await expect(page.getByTestId('failure-modes-list')).toBeVisible();
    const categoryFilter = page.getByTestId('category-filter');
    await expect(categoryFilter).toBeVisible();
    await categoryFilter.click({ force: true });

    // Check dropdown has category options
    await expect(page.getByRole('option', { name: 'All Categories' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Rotating' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Safety' })).toBeVisible();
  });

  test('failure mode card expands to show FMEA details', async ({ page }) => {
    await expect(page.getByTestId('failure-modes-list')).toBeVisible();
    // Click the first failure mode to expand
    const firstItem = page.locator('[data-testid^="failure-mode-"]').first();
    await expect(firstItem).toBeVisible();
    await firstItem.click({ force: true });
    await page.waitForTimeout(300);

    // Should show expanded FMEA content
    await expect(page.getByText('FMEA Scores').first()).toBeVisible();
    await expect(page.getByText('Recommended Actions').first()).toBeVisible();
  });

  test('failure mode cards show RPN score', async ({ page }) => {
    await expect(page.getByTestId('failure-modes-list')).toBeVisible();
    // First item is sorted by highest RPN - should show visible RPN number
    const firstItem = page.locator('[data-testid^="failure-mode-"]').first();
    await expect(firstItem).toBeVisible();
    // RPN number should be visible in the card
    const rpnText = await firstItem.locator('span.text-lg').first().textContent();
    const rpn = parseInt(rpnText || '0');
    expect(rpn).toBeGreaterThan(0);
  });

  test('library tab is visible in desktop nav', async ({ page }) => {
    await expect(page.getByTestId('nav-library')).toBeVisible();
  });
});

test.describe('Library Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
  });

  test('nav-library link navigates to library page', async ({ page }) => {
    // Start from threats page, wait for toast to disappear before clicking nav
    await expect(page.getByTestId('threats-page')).toBeVisible();
    // Wait for any welcome toast to clear
    await page.locator('[data-sonner-toast]').waitFor({ state: 'hidden' }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('nav-library').click({ force: true });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('failure-modes-page')).toBeVisible();
  });

  test('nav tabs visible: Threats and Library', async ({ page }) => {
    await expect(page.getByTestId('desktop-nav')).toBeVisible();
    await expect(page.getByTestId('nav-threats')).toBeVisible();
    await expect(page.getByTestId('nav-library')).toBeVisible();
  });

  test('mobile nav includes library link', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByTestId('mobile-menu-toggle').click({ force: true });
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-library')).toBeVisible();
  });
});
