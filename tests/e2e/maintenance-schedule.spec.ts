import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Maintenance Schedule (library)', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('maintenance-strategies-tab').click();
  });

  test('maintenance strategy tab loads schedule controls', async ({ page }) => {
    await expect(page.getByTestId('linked-to-equipment-toggle-maintenance')).toBeVisible();
    // Strategy manager or schedule sub-view should render without error
    await expect(page.locator('body')).not.toContainText('Element type is invalid');
  });
});
