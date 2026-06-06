import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Intelligence Map (library)', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
  });

  test('intelligence map tab loads', async ({ page }) => {
    await page.getByTestId('intelligence-map-tab').click();
    await expect(page.getByText('Intelligence Map', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Failure Modes', { exact: false }).first()).toBeVisible();
  });
});
