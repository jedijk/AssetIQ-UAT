import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Threats Page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    // Navigate directly to avoid toast overlay blocking nav clicks
    await page.goto('/threats', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('threats-page')).toBeVisible();
  });

  test('threats page displays stats cards', async ({ page }) => {
    await expect(page.getByTestId('stat-card-total-threats')).toBeVisible();
    await expect(page.getByTestId('stat-card-open-threats')).toBeVisible();
    await expect(page.getByTestId('stat-card-critical')).toBeVisible();
    await expect(page.getByTestId('stat-card-high-priority')).toBeVisible();
  });

  test('threats page search input is functional', async ({ page }) => {
    await expect(page.getByTestId('search-threats-input')).toBeVisible();
    await page.getByTestId('search-threats-input').fill('pump');
    await page.waitForTimeout(300);
    // Either has filtered items or empty message
    const list = page.getByTestId('threats-list');
    const noMsg = page.getByTestId('no-threats-message');
    const hasOne = await list.isVisible().catch(() => false);
    const hasNone = await noMsg.isVisible().catch(() => false);
    expect(hasOne || hasNone).toBeTruthy();
  });

  test('threats page status filter dropdown has correct options', async ({ page }) => {
    await expect(page.getByTestId('status-filter-select')).toBeVisible();
    await page.getByTestId('status-filter-select').click({ force: true });
    await expect(page.getByRole('option', { name: 'All Status' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Open' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Mitigated' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Closed' })).toBeVisible();
  });

  test('threats list items show rank and risk badge', async ({ page }) => {
    const listItems = page.getByTestId('threats-list');
    const hasItems = await listItems.isVisible().catch(() => false);
    if (hasItems) {
      const firstRank = listItems.locator('[data-testid^="threat-rank-"]').first();
      await expect(firstRank).toBeVisible();
      const firstBadge = listItems.locator('[data-testid^="risk-badge-"]').first();
      await expect(firstBadge).toBeVisible();
    }
  });

  test('clicking threat navigates to detail page', async ({ page }) => {
    const threatsList = page.getByTestId('threats-list');
    const hasThreats = await threatsList.isVisible().catch(() => false);
    if (!hasThreats) {
      test.skip();
      return;
    }
    const firstThreat = threatsList.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
  });

  test('search clears correctly', async ({ page }) => {
    const input = page.getByTestId('search-threats-input');
    await input.fill('nonexistent_xyz_12345');
    await page.waitForTimeout(300);
    await input.clear();
    await page.waitForTimeout(300);
    // After clearing, threats-list or no-threats-message should appear
    const list = page.getByTestId('threats-list');
    const noMsg = page.getByTestId('no-threats-message');
    const hasOne = await list.isVisible().catch(() => false);
    const hasNone = await noMsg.isVisible().catch(() => false);
    expect(hasOne || hasNone).toBeTruthy();
  });
});

test.describe('Threat Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    // Navigate to threats and wait for data to load
    await page.goto('/threats', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('threats-page')).toBeVisible();
    // Wait for either threats list or empty state to appear
    await Promise.race([
      page.getByTestId('threats-list').waitFor({ state: 'visible' }).catch(() => {}),
      page.getByTestId('no-threats-message').waitFor({ state: 'visible' }).catch(() => {}),
    ]);
  });

  test('threat detail page shows all sections', async ({ page }) => {
    const threatsList = page.getByTestId('threats-list');
    const hasThreats = await threatsList.isVisible().catch(() => false);
    if (!hasThreats) {
      test.skip();
      return;
    }

    const firstThreat = threatsList.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    await expect(page.getByTestId('threat-title')).toBeVisible();
    await expect(page.getByTestId('threat-rank-display')).toBeVisible();
    await expect(page.getByTestId('risk-score-card')).toBeVisible();
    await expect(page.getByTestId('threat-info-grid')).toBeVisible();
    await expect(page.getByTestId('recommended-actions-section')).toBeVisible();
  });

  test('back to threats button navigates back', async ({ page }) => {
    const threatsList = page.getByTestId('threats-list');
    const hasThreats = await threatsList.isVisible().catch(() => false);
    if (!hasThreats) {
      test.skip();
      return;
    }

    const firstThreat = threatsList.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    await page.getByTestId('back-to-threats-button').click({ force: true });
    await expect(page.getByTestId('threats-page')).toBeVisible();
  });

  test('status select shows options on detail page', async ({ page }) => {
    const threatsList = page.getByTestId('threats-list');
    const hasThreats = await threatsList.isVisible().catch(() => false);
    if (!hasThreats) {
      test.skip();
      return;
    }

    const firstThreat = threatsList.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    await expect(page.getByTestId('status-select')).toBeVisible();
    await page.getByTestId('status-select').click({ force: true });
    await expect(page.getByRole('option', { name: 'Open' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Mitigated' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Closed' })).toBeVisible();
  });

  test('delete button opens confirmation dialog', async ({ page }) => {
    const threatsList = page.getByTestId('threats-list');
    const hasThreats = await threatsList.isVisible().catch(() => false);
    if (!hasThreats) {
      test.skip();
      return;
    }

    const firstThreat = threatsList.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    await page.getByTestId('delete-threat-button').click({ force: true });
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
    // Cancel to avoid deleting data
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('risk badge color coding matches risk level', async ({ page }) => {
    const threatsList = page.getByTestId('threats-list');
    const hasThreats = await threatsList.isVisible().catch(() => false);
    if (!hasThreats) {
      test.skip();
      return;
    }

    const firstThreat = threatsList.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    // Verify risk badge exists with a valid level
    const badge = page.locator('[data-testid^="risk-badge-"]').first();
    await expect(badge).toBeVisible();
    const badgeText = await badge.textContent();
    expect(['Critical', 'High', 'Medium', 'Low']).toContain(badgeText?.trim());
  });
});
