import { test, expect, Page } from '@playwright/test';

const PAGE_URL = process.env.REACT_APP_BACKEND_URL || 'https://assetiq-dev.preview.emergentagent.com';

test.describe('Causal Engine - Investigation Management', () => {
  // Store investigation IDs for cleanup
  let createdInvestigationIds: string[] = [];
  
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
    
    // Login first
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email-input').fill('test@test.com');
    await page.getByTestId('login-password-input').fill('test');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();
  });
  
  test.afterEach(async ({ page }) => {
    // Cleanup created investigations via API
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (token) {
      for (const invId of createdInvestigationIds) {
        try {
          await page.request.delete(`${PAGE_URL}/api/investigations/${invId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
    createdInvestigationIds = [];
  });
  
  test('navigate to Causal Engine page', async ({ page }) => {
    await page.getByTestId('nav-causal engine').click();
    await expect(page.getByTestId('causal-engine-page')).toBeVisible();
    await expect(page.getByTestId('new-investigation-btn')).toBeVisible();
    await expect(page.getByTestId('search-investigations')).toBeVisible();
  });
  
  test('create new investigation', async ({ page }) => {
    await page.getByTestId('nav-causal engine').click();
    await expect(page.getByTestId('causal-engine-page')).toBeVisible();
    
    // Click new investigation button
    await page.getByTestId('new-investigation-btn').click();
    
    // Fill form
    const uniqueId = Date.now().toString();
    const invTitle = `TEST_Investigation_${uniqueId}`;
    await page.getByTestId('new-inv-title').fill(invTitle);
    await page.getByTestId('new-inv-description').fill('Test investigation for E2E testing');
    
    // Create
    await page.getByTestId('create-inv-btn').click();
    
    // Wait for investigation to appear in sidebar
    await expect(page.getByText(invTitle).first()).toBeVisible();
    
    // Verify overview tab is shown
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    
    // Store ID for cleanup
    const url = page.url();
    const invMatch = url.match(/inv=([a-f0-9-]+)/);
    if (invMatch) createdInvestigationIds.push(invMatch[1]);
  });
  
  test('view investigation list in sidebar', async ({ page }) => {
    // First create an investigation
    await page.getByTestId('nav-causal engine').click();
    await expect(page.getByTestId('causal-engine-page')).toBeVisible();
    
    await page.getByTestId('new-investigation-btn').click();
    const uniqueId = Date.now().toString();
    const invTitle = `TEST_Sidebar_${uniqueId}`;
    await page.getByTestId('new-inv-title').fill(invTitle);
    await page.getByTestId('new-inv-description').fill('Test sidebar display');
    await page.getByTestId('create-inv-btn').click();
    
    // Wait for it to be created and visible
    await expect(page.getByText(invTitle).first()).toBeVisible();
    
    // Search for the investigation
    await page.getByTestId('search-investigations').fill(invTitle);
    await expect(page.getByText(invTitle).first()).toBeVisible();
    
    // Clear search should show all investigations
    await page.getByTestId('search-investigations').clear();
  });
  
  test('add timeline event to investigation', async ({ page }) => {
    // Create investigation first
    await page.getByTestId('nav-causal engine').click();
    await page.getByTestId('new-investigation-btn').click();
    const uniqueId = Date.now().toString();
    await page.getByTestId('new-inv-title').fill(`TEST_Timeline_${uniqueId}`);
    await page.getByTestId('new-inv-description').fill('Test timeline');
    await page.getByTestId('create-inv-btn').click();
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    
    // Go to Timeline tab
    await page.getByTestId('tab-timeline').click();
    
    // Add event
    await page.getByTestId('add-event-btn').click();
    
    // Fill event form - looking for input fields in dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Fill time
    await dialog.locator('input').first().fill('2024-03-15 14:30');
    // Fill description
    await dialog.locator('textarea').first().fill('Equipment alarm triggered');
    
    // Submit
    await dialog.getByRole('button', { name: 'Add' }).click();
    
    // Verify event appears (timeline event has description text)
    await expect(page.getByText('Equipment alarm triggered')).toBeVisible();
    
    // Verify count updated in tab
    await expect(page.getByTestId('tab-timeline')).toContainText('1');
  });
  
  test('add failure identification', async ({ page }) => {
    // Create investigation first  
    await page.getByTestId('nav-causal engine').click();
    await page.getByTestId('new-investigation-btn').click();
    const uniqueId = Date.now().toString();
    await page.getByTestId('new-inv-title').fill(`TEST_Failure_${uniqueId}`);
    await page.getByTestId('new-inv-description').fill('Test failure identification');
    await page.getByTestId('create-inv-btn').click();
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    
    // Go to Failures tab
    await page.getByTestId('tab-failures').click();
    
    // Add failure
    await page.getByTestId('add-failure-btn').click();
    
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Fill form - Asset, Component, Failure Mode are required
    const inputs = dialog.locator('input');
    await inputs.nth(0).fill('Pump P-101');  // Asset
    await inputs.nth(1).fill('Sealing System');  // Subsystem
    await inputs.nth(2).fill('Mechanical Seal');  // Component
    await inputs.nth(3).fill('External Leakage');  // Failure Mode
    
    // Submit
    await dialog.getByRole('button', { name: 'Add' }).click();
    
    // Verify failure appears
    await expect(page.getByText('Pump P-101')).toBeVisible();
    await expect(page.getByText('External Leakage')).toBeVisible();
    
    // Verify count
    await expect(page.getByTestId('tab-failures')).toContainText('1');
  });
  
  test('add cause to causal tree and mark as root cause', async ({ page }) => {
    // Create investigation
    await page.getByTestId('nav-causal engine').click();
    await page.getByTestId('new-investigation-btn').click();
    const uniqueId = Date.now().toString();
    await page.getByTestId('new-inv-title').fill(`TEST_Causes_${uniqueId}`);
    await page.getByTestId('new-inv-description').fill('Test causal tree');
    await page.getByTestId('create-inv-btn').click();
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    
    // Go to Causes tab
    await page.getByTestId('tab-causes').click();
    
    // Add cause
    await page.getByTestId('add-cause-btn').click();
    
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Fill description
    await dialog.locator('textarea').first().fill('Material incompatibility with process fluid');
    
    // Check "Mark as Root Cause" checkbox
    await dialog.locator('input[type="checkbox"]').check();
    
    // Submit
    await dialog.getByRole('button', { name: 'Add' }).click();
    
    // Verify cause appears with ROOT CAUSE badge
    await expect(page.getByText('Material incompatibility')).toBeVisible();
    await expect(page.getByText('ROOT CAUSE')).toBeVisible();
    
    // Verify count shows in tab
    await expect(page.getByTestId('tab-causes')).toContainText('1');
  });
  
  test('add corrective action', async ({ page }) => {
    // Create investigation
    await page.getByTestId('nav-causal engine').click();
    await page.getByTestId('new-investigation-btn').click();
    const uniqueId = Date.now().toString();
    await page.getByTestId('new-inv-title').fill(`TEST_Actions_${uniqueId}`);
    await page.getByTestId('new-inv-description').fill('Test actions');
    await page.getByTestId('create-inv-btn').click();
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    
    // Go to Actions tab
    await page.getByTestId('tab-actions').click();
    
    // Add action
    await page.getByTestId('add-action-btn').click();
    
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Fill description
    await dialog.locator('textarea').first().fill('Replace mechanical seal with compatible material');
    
    // Fill owner
    const inputs = dialog.locator('input');
    await inputs.first().fill('Maintenance Team');
    
    // Submit
    await dialog.getByRole('button', { name: 'Add' }).click();
    
    // Verify action appears
    await expect(page.getByText('Replace mechanical seal')).toBeVisible();
    await expect(page.getByText('ACT-001')).toBeVisible();  // Action number
    
    // Verify count
    await expect(page.getByTestId('tab-actions')).toContainText('1');
  });
  
  test('update investigation status', async ({ page }) => {
    // Create investigation
    await page.getByTestId('nav-causal engine').click();
    await page.getByTestId('new-investigation-btn').click();
    const uniqueId = Date.now().toString();
    await page.getByTestId('new-inv-title').fill(`TEST_Status_${uniqueId}`);
    await page.getByTestId('new-inv-description').fill('Test status update');
    await page.getByTestId('create-inv-btn').click();
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    
    // Find and click status dropdown on overview
    const statusTrigger = page.locator('[role="combobox"]').first();
    await statusTrigger.click();
    
    // Select "In Progress"
    await page.getByRole('option', { name: 'In Progress' }).click();
    
    // Verify status changed in sidebar
    await expect(page.getByText('in_progress')).toBeVisible();
  });
  
  test('delete investigation', async ({ page }) => {
    // Create investigation
    await page.getByTestId('nav-causal engine').click();
    await page.getByTestId('new-investigation-btn').click();
    const uniqueId = Date.now().toString();
    const invTitle = `TEST_Delete_${uniqueId}`;
    await page.getByTestId('new-inv-title').fill(invTitle);
    await page.getByTestId('new-inv-description').fill('Test delete');
    await page.getByTestId('create-inv-btn').click();
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    
    // Click delete button (trash icon)
    await page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first().click();
    
    // Confirm delete in dialog
    await page.getByRole('button', { name: 'Delete' }).click();
    
    // Verify investigation is removed from sidebar (should show "Select an Investigation")
    await expect(page.getByText('Select an Investigation')).toBeVisible();
    
    // Verify not in list anymore
    await expect(page.getByText(invTitle)).not.toBeVisible();
  });
});
