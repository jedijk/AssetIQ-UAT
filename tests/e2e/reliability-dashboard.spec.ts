import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Reliability Intelligence Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await page.goto('/reliability', { waitUntil: 'domcontentloaded' });
  });

  test('dashboard loads executive KPIs', async ({ page }) => {
    await expect(page.getByTestId('ril-dashboard')).toBeVisible();
    await expect(page.getByTestId('ril-dashboard-title')).toHaveText('Reliability Intelligence');
    await expect(page.getByTestId('ril-executive-kpis')).toBeVisible();
    await expect(page.getByText('Reliability Score', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Strategy Coverage', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('ril-kpi-reliability-edges')).toBeVisible();
  });

  test('knowledge graph KPI opens ontology dialog', async ({ page }) => {
    await page.getByTestId('ril-kpi-reliability-edges').click();
    await expect(page.getByTestId('reliability-knowledge-graph-dialog')).toBeVisible();
    await expect(page.getByTestId('reliability-knowledge-graph-svg')).toBeVisible();
  });
});
