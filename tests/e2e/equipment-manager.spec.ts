import { test, expect, Page } from '@playwright/test';

// Helpers
async function loginUser(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email-input').fill('test@test.com');
  await page.getByTestId('login-password-input').fill('test');
  await page.getByTestId('login-submit-button').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

async function navigateToEquipmentManager(page: Page) {
  await page.getByTestId('settings-menu-button').click();
  await expect(page.getByTestId('equipment-manager-menu-item')).toBeVisible();
  await page.getByTestId('equipment-manager-menu-item').click();
  await expect(page.getByTestId('equipment-manager-page')).toBeVisible();
}

async function dismissToasts(page: Page) {
  await page.addLocatorHandler(
    page.locator('[data-sonner-toast], .Toastify__toast'),
    async () => {
      const close = page.locator('[data-sonner-toast] [data-close], [data-sonner-toast] button[aria-label="Close"]');
      await close.first().click({ timeout: 2000 }).catch(() => {});
    },
    { times: 10, noWaitAfter: true }
  );
}

async function selectNodeInTree(page: Page, nodeName: string) {
  // Use the specific tree-node testid to avoid matching properties panel
  const treeNode = page.locator('[data-testid^="tree-node-"]').filter({ hasText: nodeName }).first();
  await treeNode.click();
}

async function createInstallation(page: Page, name: string) {
  await page.getByTestId('add-installation-btn').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('new-node-name-input').fill(name);
  await page.getByTestId('create-node-btn').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.waitForTimeout(500);
}

async function deleteSelectedNode(page: Page) {
  await page.getByTestId('delete-node-btn').click();
  await page.waitForTimeout(500);
}

test.describe('Equipment Manager Page - Layout and Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
  });

  test('Settings menu shows Equipment Manager option', async ({ page }) => {
    await page.getByTestId('settings-menu-button').click();
    await expect(page.getByTestId('equipment-manager-menu-item')).toBeVisible();
    await expect(page.getByTestId('equipment-manager-menu-item')).toHaveText(/Equipment Manager/);
  });

  test('Equipment Manager page loads with three-panel layout', async ({ page }) => {
    await navigateToEquipmentManager(page);
    
    // Verify three-panel layout exists
    await expect(page.getByTestId('equipment-manager-page')).toBeVisible();
    
    // Left panel - Libraries with tabs
    await expect(page.getByRole('tab', { name: 'Equipment' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Criticality' })).toBeVisible();
    
    // Center panel - Hierarchy tree or empty state
    await expect(page.getByTestId('hierarchy-search-input')).toBeVisible();
    await expect(page.getByTestId('add-installation-btn')).toBeVisible();
    
    // Right panel - Properties (initially shows no selection)
    await expect(page.getByText('No Selection')).toBeVisible();
  });

  test('Direct URL navigation to Equipment Manager after login', async ({ page }) => {
    // Navigate to equipment manager after logged in
    await page.goto('/equipment-manager', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('equipment-manager-page')).toBeVisible();
  });
});

test.describe('Equipment Manager - Equipment Types Library', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Equipment types library displays all 20 ISO 14224 types', async ({ page }) => {
    // Ensure Equipment tab is active
    await page.getByRole('tab', { name: 'Equipment' }).click();
    
    // Check for first few equipment types
    await expect(page.locator('[data-testid="library-item-pump_centrifugal"]')).toBeVisible();
    await expect(page.locator('[data-testid="library-item-pump_reciprocating"]')).toBeVisible();
    await expect(page.locator('[data-testid="library-item-compressor_centrifugal"]')).toBeVisible();
    await expect(page.locator('[data-testid="library-item-turbine_gas"]')).toBeVisible();
    
    // Count library items (should be 20)
    const libraryItems = page.locator('[data-testid^="library-item-"]');
    await expect(libraryItems).toHaveCount(20);
  });

  test('Equipment library items are draggable', async ({ page }) => {
    await page.getByRole('tab', { name: 'Equipment' }).click();
    
    // Check first library item has draggable attribute
    const firstItem = page.locator('[data-testid^="library-item-"]').first();
    await expect(firstItem).toHaveAttribute('draggable', 'true');
  });
});

test.describe('Equipment Manager - Criticality Profiles Library', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Criticality tab displays all 4 levels', async ({ page }) => {
    await page.getByRole('tab', { name: 'Criticality' }).click();
    
    // Check all 4 criticality items in library
    await expect(page.locator('[data-testid="library-item-safety_critical"]')).toBeVisible();
    await expect(page.locator('[data-testid="library-item-production_critical"]')).toBeVisible();
    await expect(page.locator('[data-testid="library-item-medium"]')).toBeVisible();
    await expect(page.locator('[data-testid="library-item-low"]')).toBeVisible();
  });

  test('Criticality distribution chart displays correctly', async ({ page }) => {
    await page.getByRole('tab', { name: 'Criticality' }).click();
    
    // Check for distribution chart heading
    await expect(page.getByText('Criticality Distribution')).toBeVisible();
  });
});

test.describe('Equipment Manager - Node Creation', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Create new installation node', async ({ page }) => {
    const testName = `TEST_Installation_${Date.now()}`;
    
    // Create installation
    await createInstallation(page, testName);
    
    // Node should appear in tree
    const treeNode = page.locator('[data-testid^="tree-node-"]').filter({ hasText: testName });
    await expect(treeNode).toBeVisible();
    
    // Cleanup - select and delete
    await selectNodeInTree(page, testName);
    await deleteSelectedNode(page);
  });

  test('Create child node under selected node', async ({ page }) => {
    // First, create a test installation
    const installName = `TEST_Parent_${Date.now()}`;
    await createInstallation(page, installName);
    
    // Select the installation
    await selectNodeInTree(page, installName);
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    
    // Click Add Child
    await page.getByTestId('add-child-btn').click();
    
    // Dialog should open for adding Unit (next level)
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Add Unit/ })).toBeVisible();
    
    // Fill and create
    const childName = `TEST_Unit_${Date.now()}`;
    await page.getByTestId('new-node-name-input').fill(childName);
    await page.getByTestId('create-node-btn').click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // Cleanup - select parent and delete (cascades)
    await selectNodeInTree(page, installName);
    await deleteSelectedNode(page);
  });
});

test.describe('Equipment Manager - Node Selection and Properties', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Selecting node shows properties panel', async ({ page }) => {
    // Create test node
    const testName = `TEST_Props_${Date.now()}`;
    await createInstallation(page, testName);
    
    // Select node
    await selectNodeInTree(page, testName);
    
    // Properties panel should show selected node info
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    
    // Should show discipline label (use exact match to avoid dropdown text)
    await expect(page.getByTestId('properties-panel').getByText('Discipline', { exact: true })).toBeVisible();
    
    // Should show criticality label
    await expect(page.getByTestId('properties-panel').getByText('Criticality', { exact: true })).toBeVisible();
    
    // Should show metadata
    await expect(page.getByTestId('properties-panel').getByText('Metadata')).toBeVisible();
    
    // Cleanup
    await deleteSelectedNode(page);
  });

  test('Edit node name via properties panel edit button', async ({ page }) => {
    // Create test node
    const originalName = `TEST_Edit_${Date.now()}`;
    await createInstallation(page, originalName);
    
    // Select node
    await selectNodeInTree(page, originalName);
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    
    // There should be an edit button in properties panel header
    const editBtn = page.getByTestId('properties-panel').locator('button').filter({ has: page.locator('svg') }).first();
    await expect(editBtn).toBeVisible();
    
    // Cleanup
    await deleteSelectedNode(page);
  });
});

test.describe('Equipment Manager - Criticality Assignment', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Assign criticality to node via properties panel', async ({ page }) => {
    // Create test node
    const testName = `TEST_Crit_${Date.now()}`;
    await createInstallation(page, testName);
    
    // Select node
    await selectNodeInTree(page, testName);
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    
    // Find and click Safety Critical button in properties panel criticality section
    const safetyCriticalBtn = page.getByTestId('properties-panel').locator('button').filter({ hasText: 'Safety Critical' });
    await safetyCriticalBtn.click();
    
    // Wait for mutation
    await page.waitForTimeout(1000);
    
    // Verify criticality details appear in properties panel
    await expect(page.getByTestId('properties-panel').getByText('Criticality Details')).toBeVisible();
    
    // Cleanup
    await deleteSelectedNode(page);
  });
});

test.describe('Equipment Manager - Discipline Assignment', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Assign discipline to node', async ({ page }) => {
    // Create test node
    const testName = `TEST_Disc_${Date.now()}`;
    await createInstallation(page, testName);
    
    // Select node
    await selectNodeInTree(page, testName);
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    
    // Find and click discipline dropdown
    const disciplineSelect = page.getByTestId('properties-panel').getByRole('combobox');
    await disciplineSelect.click();
    
    // Select mechanical
    await page.getByRole('option', { name: 'mechanical' }).click();
    
    // Wait for update
    await page.waitForTimeout(1000);
    
    // Verify discipline is set (dropdown should now show mechanical)
    await expect(disciplineSelect).toHaveText('mechanical');
    
    // Cleanup
    await deleteSelectedNode(page);
  });
});

test.describe('Equipment Manager - Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Search filters hierarchy nodes', async ({ page }) => {
    // Create test node with unique name
    const testName = `UNIQUE_SEARCH_${Date.now()}`;
    await createInstallation(page, testName);
    
    // Use search
    await page.getByTestId('hierarchy-search-input').fill('UNIQUE_SEARCH');
    await page.waitForTimeout(500);
    
    // Our node should be visible
    const treeNode = page.locator('[data-testid^="tree-node-"]').filter({ hasText: testName });
    await expect(treeNode).toBeVisible();
    
    // Clear search
    await page.getByTestId('hierarchy-search-input').fill('');
    await page.waitForTimeout(300);
    
    // Cleanup
    await selectNodeInTree(page, testName);
    await deleteSelectedNode(page);
  });
});

test.describe('Equipment Manager - Delete Operations', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Delete node removes from hierarchy', async ({ page }) => {
    // Create test node
    const testName = `TEST_Delete_${Date.now()}`;
    await createInstallation(page, testName);
    
    // Verify node exists
    const treeNode = page.locator('[data-testid^="tree-node-"]').filter({ hasText: testName });
    await expect(treeNode).toBeVisible();
    
    // Select and delete
    await selectNodeInTree(page, testName);
    await deleteSelectedNode(page);
    
    // Node should be gone
    await expect(treeNode).not.toBeVisible();
  });
});

test.describe('Equipment Manager - ISO 14224 Hierarchy', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Create full ISO 14224 hierarchy: Installation -> Unit -> System -> Equipment', async ({ page }) => {
    const timestamp = Date.now();
    const installName = `TEST_ISO_Install_${timestamp}`;
    
    // Create Installation
    await createInstallation(page, installName);
    
    // Select and add Unit
    await selectNodeInTree(page, installName);
    await page.getByTestId('add-child-btn').click();
    await expect(page.getByRole('heading', { name: /Add Unit/ })).toBeVisible();
    await page.getByTestId('new-node-name-input').fill(`TEST_ISO_Unit_${timestamp}`);
    await page.getByTestId('create-node-btn').click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.waitForTimeout(500);
    
    // Expand installation to see unit
    const expandBtn = page.locator('[data-testid^="tree-node-"]').filter({ hasText: installName }).locator('button').first();
    await expandBtn.click();
    await page.waitForTimeout(300);
    
    // Select Unit and add System
    await selectNodeInTree(page, `TEST_ISO_Unit_${timestamp}`);
    await page.getByTestId('add-child-btn').click();
    await expect(page.getByRole('heading', { name: /Add System/ })).toBeVisible();
    await page.getByTestId('new-node-name-input').fill(`TEST_ISO_System_${timestamp}`);
    await page.getByTestId('create-node-btn').click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.waitForTimeout(500);
    
    // Cleanup - delete root cascades
    await selectNodeInTree(page, installName);
    await deleteSelectedNode(page);
  });
});
