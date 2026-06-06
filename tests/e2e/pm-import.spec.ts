import { test, expect } from '@playwright/test';
import { dismissToasts, loginUser } from '../fixtures/helpers';

test.describe('Custom PM Import (library)', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('failure-modes-page')).toBeVisible();
  });

  test('pm import tab is reachable', async ({ page }) => {
    await page.getByTestId('pm-import-tab').click();
    await expect(page.getByTestId('pm-import-panel')).toBeVisible();
    await expect(page.getByText('Custom PM Import')).toBeVisible();
  });

  test('pm import panel shows task table or empty state', async ({ page }) => {
    await page.getByTestId('pm-import-tab').click();
    await expect(page.getByTestId('pm-import-panel')).toBeVisible();
    const importButton = page.getByRole('button', { name: /Import PM Plan/i });
    await expect(importButton).toBeVisible();
  });
});
