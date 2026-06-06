import { test, expect } from '@playwright/test';
import { dismissToasts, loginUser } from '../fixtures/helpers';

test.describe('My Tasks', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
  });

  test('my tasks page loads with filters', async ({ page }) => {
    await page.goto('/my-tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('filter-open')).toBeVisible();
    await expect(page.getByTestId('task-search')).toBeVisible();
    await expect(page.getByTestId('discipline-filter')).toBeVisible();
  });

  test('can switch between task filter tabs', async ({ page }) => {
    await page.goto('/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('filter-overdue').click();
    await expect(page.getByTestId('filter-overdue')).toHaveAttribute('data-state', 'active');
    await page.getByTestId('filter-adhoc').click();
    await expect(page.getByTestId('filter-adhoc')).toHaveAttribute('data-state', 'active');
  });
});
