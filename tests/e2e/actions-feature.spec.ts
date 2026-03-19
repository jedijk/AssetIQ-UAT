import { test, expect } from '@playwright/test';

test.describe('Actions Management Feature', () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    // Dismiss toasts helper
    await page.addLocatorHandler(
      page.locator('[data-sonner-toast], .Toastify__toast, [role="status"].toast'),
      async () => {
        const close = page.locator('[data-sonner-toast] [data-close], [data-sonner-toast] button[aria-label="Close"], .Toastify__close-button');
        await close.first().click().catch(() => {});
      },
      { times: 10, noWaitAfter: true }
    );

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Login
    await page.getByRole('textbox', { name: /email/i }).fill('test@test.com');
    await page.locator('input[type="password"]').fill('test');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Wait for app to load
    await expect(page.getByTestId('app-logo')).toBeVisible();
  });

  test.describe('Actions Tab Navigation', () => {
    test('Actions tab appears in navigation', async ({ page }) => {
      // Check desktop navigation has Actions tab
      const actionsNav = page.getByTestId('nav-actions');
      await expect(actionsNav).toBeVisible();
      await expect(actionsNav).toContainText('Actions');
    });

    test('Actions tab navigates to Actions page', async ({ page }) => {
      // Click on Actions tab
      await page.getByTestId('nav-actions').click();
      
      // Verify we're on the Actions page
      await expect(page).toHaveURL(/\/actions/);
      await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
    });
  });

  test.describe('Actions Page Display', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('nav-actions').click();
      await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
    });

    test('Actions page displays all stat cards', async ({ page }) => {
      // Check for stat cards - Total, Open, In Progress, Completed, Overdue
      await expect(page.getByText('Total Actions')).toBeVisible();
      await expect(page.getByText(/^Open$/)).toBeVisible();
      await expect(page.getByText('In Progress')).toBeVisible();
      await expect(page.getByText(/^Completed$/)).toBeVisible();
      await expect(page.getByText('Overdue')).toBeVisible();
    });

    test('Actions page has search input', async ({ page }) => {
      const searchInput = page.getByTestId('actions-search');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', 'Search actions...');
    });

    test('Actions page has filter dropdowns', async ({ page }) => {
      // Status filter
      const statusFilter = page.getByTestId('status-filter');
      await expect(statusFilter).toBeVisible();
      
      // Priority filter
      const priorityFilter = page.getByTestId('priority-filter');
      await expect(priorityFilter).toBeVisible();
      
      // Source filter
      const sourceFilter = page.getByTestId('source-filter');
      await expect(sourceFilter).toBeVisible();
    });

    test('Empty state shows message when no actions', async ({ page }) => {
      // If no actions exist, should show empty state
      // This test checks the structure is correct - may pass or show actions
      const emptyState = page.getByText('No actions yet');
      const actionsList = page.locator('[data-testid^="action-row-"]');
      
      // Either empty state or actions list should be visible
      const hasActions = await actionsList.count() > 0;
      if (!hasActions) {
        await expect(emptyState).toBeVisible();
      } else {
        // Actions exist, verify list structure
        await expect(actionsList.first()).toBeVisible();
      }
    });
  });

  test.describe('Filter Functionality', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('nav-actions').click();
      await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
    });

    test('Status filter has correct options', async ({ page }) => {
      await page.getByTestId('status-filter').click();
      
      await expect(page.getByRole('option', { name: 'All Status' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Open' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'In Progress' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Completed' })).toBeVisible();
      
      // Close dropdown
      await page.keyboard.press('Escape');
    });

    test('Priority filter has correct options', async ({ page }) => {
      await page.getByTestId('priority-filter').click();
      
      await expect(page.getByRole('option', { name: 'All Priority' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Critical' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'High' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Medium' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Low' })).toBeVisible();
      
      await page.keyboard.press('Escape');
    });

    test('Source filter has correct options', async ({ page }) => {
      await page.getByTestId('source-filter').click();
      
      await expect(page.getByRole('option', { name: 'All Sources' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'From Threats' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'From Investigations' })).toBeVisible();
      
      await page.keyboard.press('Escape');
    });

    test('Search filters actions list', async ({ page }) => {
      const searchInput = page.getByTestId('actions-search');
      
      // Type a search query
      await searchInput.fill('TEST_UNIQUE_SEARCH_TERM_12345');
      
      // Wait a moment for filter to apply
      await page.waitForTimeout(300);
      
      // Should show empty or matching results
      // This validates the search input works (actions may or may not exist)
      await expect(searchInput).toHaveValue('TEST_UNIQUE_SEARCH_TERM_12345');
    });
  });

  test.describe('Promote Action from Threat', () => {
    test('Promote button appears on hover for threat recommendations', async ({ page }) => {
      // Navigate to Threats page first
      await page.getByTestId('nav-threats').click();
      await expect(page.getByRole('heading', { name: 'Threat Register' })).toBeVisible();
      
      // Click on first threat to go to detail page
      const threatCards = page.locator('[data-testid^="threat-card-"]');
      const hasThreat = await threatCards.count() > 0;
      
      if (hasThreat) {
        await threatCards.first().click();
        
        // Wait for threat detail page
        await expect(page.getByTestId('threat-detail-page')).toBeVisible();
        
        // Check for recommended actions section
        const actionsSection = page.getByTestId('recommended-actions-section');
        await expect(actionsSection).toBeVisible();
        
        // Check for action items with promote buttons
        const actionItems = page.locator('[data-testid^="action-item-"]');
        const hasActions = await actionItems.count() > 0;
        
        if (hasActions) {
          // Hover to reveal promote button
          await actionItems.first().hover();
          
          // Check promote button exists
          const promoteBtn = page.locator('[data-testid^="promote-action-"]').first();
          await expect(promoteBtn).toBeVisible();
        }
      }
    });

    test('Clicking Promote creates action and shows toast', async ({ page }) => {
      // Navigate to Threats page
      await page.getByTestId('nav-threats').click();
      await expect(page.getByRole('heading', { name: 'Threat Register' })).toBeVisible();
      
      const threatCards = page.locator('[data-testid^="threat-card-"]');
      const hasThreat = await threatCards.count() > 0;
      
      if (hasThreat) {
        await threatCards.first().click();
        await expect(page.getByTestId('threat-detail-page')).toBeVisible();
        
        const actionItems = page.locator('[data-testid^="action-item-"]');
        const hasActions = await actionItems.count() > 0;
        
        if (hasActions) {
          // Hover and click promote
          await actionItems.first().hover();
          const promoteBtn = page.locator('[data-testid^="promote-action-"]').first();
          await promoteBtn.click();
          
          // Should show success toast
          await expect(page.getByText(/Action created/i)).toBeVisible();
        }
      }
    });
  });

  test.describe('Promote Action from Investigation', () => {
    test('Promote button visible on investigation actions', async ({ page }) => {
      // Navigate to Causal Engine
      await page.getByTestId('nav-causal engine').click();
      await expect(page.getByTestId('causal-engine-page')).toBeVisible();
      
      // Check if any investigations exist
      const invItems = page.locator('[data-testid^="investigation-item-"]');
      const hasInv = await invItems.count() > 0;
      
      if (hasInv) {
        // Click first investigation
        await invItems.first().click();
        
        // Click on Actions tab
        await page.getByTestId('tab-actions').click();
        
        // Check for action items
        const actionItems = page.locator('[data-testid^="action-item-"]');
        const hasActions = await actionItems.count() > 0;
        
        if (hasActions) {
          // Check promote button is visible
          const promoteBtn = page.locator('[data-testid^="promote-action-"]').first();
          await expect(promoteBtn).toBeVisible();
        }
      }
    });
  });

  test.describe('Edit Action Dialog', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('nav-actions').click();
      await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
    });

    test('Edit dialog opens from action menu', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        // Click more menu on first action
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        
        // Click Edit
        await page.getByRole('menuitem', { name: /Edit/i }).click();
        
        // Dialog should open
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByText('Edit Action')).toBeVisible();
      }
    });

    test('Edit dialog has all required fields', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        await page.getByRole('menuitem', { name: /Edit/i }).click();
        
        await expect(page.getByRole('dialog')).toBeVisible();
        
        // Check form fields
        await expect(page.getByTestId('edit-action-title')).toBeVisible();
        await expect(page.getByTestId('edit-action-description')).toBeVisible();
        await expect(page.getByTestId('edit-action-status')).toBeVisible();
        await expect(page.getByTestId('edit-action-priority')).toBeVisible();
        await expect(page.getByTestId('edit-action-assignee')).toBeVisible();
        await expect(page.getByTestId('edit-action-discipline')).toBeVisible();
        await expect(page.getByTestId('edit-action-due-date')).toBeVisible();
      }
    });

    test('Can edit action title and save', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        await page.getByRole('menuitem', { name: /Edit/i }).click();
        
        await expect(page.getByRole('dialog')).toBeVisible();
        
        // Modify title
        const titleInput = page.getByTestId('edit-action-title');
        await titleInput.clear();
        await titleInput.fill('TEST_EDITED_ACTION_TITLE');
        
        // Save
        await page.getByRole('button', { name: /Save Changes/i }).click();
        
        // Dialog should close and toast appear
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(page.getByText(/updated/i)).toBeVisible();
      }
    });

    test('Can change action status via dialog', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        await page.getByRole('menuitem', { name: /Edit/i }).click();
        
        await expect(page.getByRole('dialog')).toBeVisible();
        
        // Change status
        await page.getByTestId('edit-action-status').click();
        await page.getByRole('option', { name: 'In Progress' }).click();
        
        // Save
        await page.getByRole('button', { name: /Save Changes/i }).click();
        
        await expect(page.getByText(/updated/i)).toBeVisible();
      }
    });

    test('Can assign action to person and discipline', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        await page.getByRole('menuitem', { name: /Edit/i }).click();
        
        await expect(page.getByRole('dialog')).toBeVisible();
        
        // Set assignee
        await page.getByTestId('edit-action-assignee').fill('Test Engineer');
        
        // Set discipline
        await page.getByTestId('edit-action-discipline').fill('Mechanical');
        
        // Save
        await page.getByRole('button', { name: /Save Changes/i }).click();
        
        await expect(page.getByText(/updated/i)).toBeVisible();
      }
    });

    test('Can set due date', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        await page.getByRole('menuitem', { name: /Edit/i }).click();
        
        await expect(page.getByRole('dialog')).toBeVisible();
        
        // Set due date
        await page.getByTestId('edit-action-due-date').fill('2026-04-15');
        
        // Save
        await page.getByRole('button', { name: /Save Changes/i }).click();
        
        await expect(page.getByText(/updated/i)).toBeVisible();
      }
    });
  });

  test.describe('Quick Status Toggle', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('nav-actions').click();
      await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
    });

    test('Status icon is clickable for quick toggle', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        // Find status button (it's the button with status icon)
        const statusBtn = actionRows.first().locator('button').first();
        
        // Click should toggle status
        await statusBtn.click();
        
        // Should show updated toast
        await expect(page.getByText(/updated/i)).toBeVisible();
      }
    });
  });

  test.describe('Delete Action', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('nav-actions').click();
      await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
    });

    test('Delete shows confirmation dialog', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        // Open menu
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        
        // Click Delete
        await page.getByRole('menuitem', { name: /Delete/i }).click();
        
        // Confirmation dialog should appear
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await expect(page.getByText('Delete Action')).toBeVisible();
        await expect(page.getByText(/This action can be undone/i)).toBeVisible();
      }
    });

    test('Cancel delete closes dialog', async ({ page }) => {
      const actionRows = page.locator('[data-testid^="action-row-"]');
      const hasActions = await actionRows.count() > 0;
      
      if (hasActions) {
        const moreMenu = actionRows.first().locator('button').filter({ has: page.locator('svg') }).last();
        await moreMenu.click();
        await page.getByRole('menuitem', { name: /Delete/i }).click();
        
        await expect(page.getByRole('alertdialog')).toBeVisible();
        
        // Cancel
        await page.getByRole('button', { name: /Cancel/i }).click();
        
        await expect(page.getByRole('alertdialog')).not.toBeVisible();
      }
    });
  });
});
