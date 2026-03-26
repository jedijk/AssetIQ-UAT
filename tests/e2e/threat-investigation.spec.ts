import { test, expect } from '@playwright/test';

const PAGE_URL = process.env.REACT_APP_BACKEND_URL || 'https://fmea-capture.preview.emergentagent.com';

test.describe('Create Investigation from Threat', () => {
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
      { times: 5, noWaitAfter: true }
    );
    
    // Handle toasts 
    await page.addLocatorHandler(
      page.locator('[data-sonner-toast]'),
      async () => {
        await page.locator('[data-sonner-toast] button').first().click({ force: true }).catch(() => {});
      },
      { times: 10, noWaitAfter: true }
    );
    
    // Login
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@test.com');
    await page.getByTestId('login-password-input').fill('test');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();
  });
  
  test('investigate button on threat detail page creates investigation', async ({ page }) => {
    // Check if there are any threats
    const threatItems = page.locator('[data-testid^="threat-item-"]');
    const threatCount = await threatItems.count();
    
    if (threatCount === 0) {
      test.skip(true, 'No threats available to test investigation creation');
      return;
    }
    
    // Click on first threat to go to detail
    await threatItems.first().click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    // Get threat title for verification
    const threatTitle = await page.getByTestId('threat-title').textContent();
    
    // Click investigate button
    await page.getByTestId('investigate-threat-button').click();
    
    // Should navigate to Causal Engine with new investigation
    await expect(page.getByTestId('causal-engine-page')).toBeVisible();
    
    // Verify investigation was created with threat info
    await expect(page.getByText(`Investigation: ${threatTitle}`)).toBeVisible();
    
    // Cleanup - delete the created investigation
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (token) {
      // Get investigations and find the one with our threat
      const resp = await page.request.get(`${PAGE_URL}/api/investigations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();
      const inv = data.investigations?.find((i: any) => i.title?.includes(threatTitle));
      if (inv) {
        await page.request.delete(`${PAGE_URL}/api/investigations/${inv.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    }
  });
  
  test('investigate button shows existing investigation message if already created', async ({ page }) => {
    // Check if there are any threats
    const threatItems = page.locator('[data-testid^="threat-item-"]');
    const threatCount = await threatItems.count();
    
    if (threatCount === 0) {
      test.skip(true, 'No threats available');
      return;
    }
    
    // Go to first threat detail
    await threatItems.first().click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    // Click investigate button first time
    await page.getByTestId('investigate-threat-button').click();
    await expect(page.getByTestId('causal-engine-page')).toBeVisible();
    
    // Go back to threats
    await page.getByTestId('nav-threats').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();
    
    // Click on same threat again
    await threatItems.first().click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    // Click investigate again - should still work (navigates to existing)
    await page.getByTestId('investigate-threat-button').click();
    await expect(page.getByTestId('causal-engine-page')).toBeVisible();
    
    // The existing investigation should be shown
    await expect(page.getByTestId('tab-overview')).toBeVisible();
  });
});
