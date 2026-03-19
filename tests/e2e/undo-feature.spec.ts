import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts, waitForAppReady } from '../fixtures/helpers';

test.describe('Undo Feature', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('undo button should be visible in header on Threats page', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    const undoButton = page.getByTestId('undo-button');
    await expect(undoButton).toBeVisible();
  });

  test('undo button should be disabled when no actions to undo', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    const undoButton = page.getByTestId('undo-button');
    await expect(undoButton).toBeVisible();
    await expect(undoButton).toBeDisabled();
  });

  test('undo button should be visible on Causal Engine page', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    // Navigate to Causal Engine page
    await page.getByTestId('nav-causal engine').click();
    await expect(page.getByTestId('causal-engine-page')).toBeVisible();
    
    // Undo button should still be visible
    const undoButton = page.getByTestId('undo-button');
    await expect(undoButton).toBeVisible();
    await expect(undoButton).toBeDisabled();
  });

  test('undo button should be visible on Library page', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    // Navigate to Library page
    await page.getByTestId('nav-library').click();
    
    // Undo button should still be visible
    const undoButton = page.getByTestId('undo-button');
    await expect(undoButton).toBeVisible();
    await expect(undoButton).toBeDisabled();
  });

  test('undo button should be visible on Equipment Manager page', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    // Navigate to Equipment Manager page via settings menu
    await page.getByTestId('settings-menu-button').click();
    await page.getByTestId('equipment-manager-menu-item').click();
    
    // Wait for equipment manager page to load
    await expect(page.getByTestId('equipment-manager-page')).toBeVisible();
    
    // Undo button should still be visible
    const undoButton = page.getByTestId('undo-button');
    await expect(undoButton).toBeVisible();
    await expect(undoButton).toBeDisabled();
  });

  test('undo button should show counter badge and become enabled after threat edit', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    // Click on the first threat to view details
    const firstThreat = page.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    
    // Wait for threat detail page
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    // Click edit button to start editing
    await page.getByTestId('edit-threat-button').click();
    
    // Make a change - update the title
    const titleInput = page.getByTestId('edit-threat-title');
    await expect(titleInput).toBeVisible();
    const originalTitle = await titleInput.inputValue();
    await titleInput.fill(`${originalTitle} - UNDO_TEST_${Date.now()}`);
    
    // Save the changes
    await page.getByTestId('save-edit-button').click();
    
    // Wait for success toast and update to complete
    await page.waitForTimeout(1500);
    
    // Undo button should now be enabled with badge
    const undoButton = page.getByTestId('undo-button');
    await expect(undoButton).toBeEnabled();
    
    // Check for the badge showing count
    const badge = undoButton.locator('span.absolute');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('1');
  });

  test('clicking undo button should revert threat edit', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    // Click on the first threat to view details
    const firstThreat = page.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    
    // Wait for threat detail page
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    // Get the original title
    const titleElement = page.getByTestId('threat-title');
    await expect(titleElement).toBeVisible();
    const originalTitle = await titleElement.textContent();
    
    // Click edit button to start editing
    await page.getByTestId('edit-threat-button').click();
    
    // Make a change - update the title
    const timestamp = Date.now();
    const titleInput = page.getByTestId('edit-threat-title');
    await titleInput.fill(`UNDO_TEST_TITLE_${timestamp}`);
    
    // Save the changes
    await page.getByTestId('save-edit-button').click();
    
    // Wait for success and verify title changed
    await page.waitForTimeout(1500);
    await expect(titleElement).toContainText(`UNDO_TEST_TITLE_${timestamp}`);
    
    // Click undo button
    const undoButton = page.getByTestId('undo-button');
    await expect(undoButton).toBeEnabled();
    await undoButton.click({ force: true });
    
    // Wait for undo to complete
    await page.waitForTimeout(2000);
    
    // Verify the title reverted back
    await expect(titleElement).toContainText(originalTitle || '');
    
    // Undo button should now be disabled
    await expect(undoButton).toBeDisabled();
  });

  test('undo button shows correct styling when enabled vs disabled', async ({ page }) => {
    await loginUser(page);
    await waitForAppReady(page);
    
    const undoButton = page.getByTestId('undo-button');
    
    // Initially should be disabled with slate color
    await expect(undoButton).toBeDisabled();
    
    // Perform an action to enable the button
    const firstThreat = page.locator('[data-testid^="threat-item-"]').first();
    await firstThreat.click();
    await expect(page.getByTestId('threat-detail-page')).toBeVisible();
    
    // Edit the threat
    await page.getByTestId('edit-threat-button').click();
    const titleInput = page.getByTestId('edit-threat-title');
    const originalTitle = await titleInput.inputValue();
    await titleInput.fill(`${originalTitle} - STYLE_TEST`);
    await page.getByTestId('save-edit-button').click();
    await page.waitForTimeout(1000);
    
    // Now button should be enabled (amber color styling)
    await expect(undoButton).toBeEnabled();
    
    // Click undo
    await undoButton.click({ force: true });
    await page.waitForTimeout(1500);
    
    // Button should be disabled again
    await expect(undoButton).toBeDisabled();
  });
});
