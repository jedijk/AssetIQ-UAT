import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Intelligence Thread (library)', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
  });

  test('intelligence thread tab loads', async ({ page }) => {
    await page.getByTestId('intelligence-map-tab').click();
    await expect(page.getByText('Intelligence Thread', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Failure Modes', { exact: false }).first()).toBeVisible();
    await expect(
      page.getByTestId('intelligence-map-reliability-edges').or(page.getByText('Knowledge Graph').first())
    ).toBeVisible();
  });

  test('knowledge graph card opens ontology dialog', async ({ page }) => {
    await page.getByTestId('intelligence-map-tab').click();
    await page.getByTestId('intelligence-map-reliability-edges').click();
    await expect(page.getByTestId('reliability-knowledge-graph-dialog')).toBeVisible();
    await expect(page.getByTestId('reliability-knowledge-graph-svg')).toBeVisible();
  });
});
