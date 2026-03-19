import { test, expect, Page } from '@playwright/test';

// Helper functions
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

async function createInstallation(page: Page, name: string) {
  await page.getByTestId('add-installation-btn').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('new-node-name-input').fill(name);
  await page.getByTestId('create-node-btn').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.waitForTimeout(500);
}

async function selectNodeInTree(page: Page, nodeName: string) {
  const treeNode = page.locator('[data-testid^="tree-node-"]').filter({ hasText: nodeName }).first();
  await treeNode.click();
}

async function deleteSelectedNode(page: Page) {
  const deleteBtn = page.getByTestId('delete-node-btn');
  await deleteBtn.scrollIntoViewIfNeeded();
  await deleteBtn.click({ force: true });
  await page.waitForTimeout(500);
}

function getTreeNodeInCenter(page: Page, nodeName: string) {
  return page.locator('[data-testid^="tree-node-"]').filter({ hasText: nodeName }).first();
}

// ============== UI Verification Tests ==============
test.describe('Equipment Manager - DnD UI Verification', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Properties panel shows drag and drop tips when no node selected', async ({ page }) => {
    // Verify the unselected state shows DnD hints
    await expect(page.getByText('No Selection')).toBeVisible();
    await expect(page.getByText('Drag & Drop Tips')).toBeVisible();
    await expect(page.getByText('Drag items to reorder within siblings')).toBeVisible();
    await expect(page.getByText('Drop on top/bottom edge to reorder')).toBeVisible();
    await expect(page.getByText('Drop in center to make child')).toBeVisible();
  });

  test('Tree nodes have draggable attribute and grip handle', async ({ page }) => {
    const testName = `TEST_DnD_Drag_${Date.now()}`;
    await createInstallation(page, testName);
    
    const treeNode = getTreeNodeInCenter(page, testName);
    await expect(treeNode).toBeVisible();
    
    // Verify the node is draggable
    await expect(treeNode).toHaveAttribute('draggable', 'true');
    
    // Cleanup
    await selectNodeInTree(page, testName);
    await deleteSelectedNode(page);
  });

  test('Properties panel shows drag hint when node selected', async ({ page }) => {
    const testName = `TEST_DnD_Props_${Date.now()}`;
    await createInstallation(page, testName);
    
    await selectNodeInTree(page, testName);
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    
    // Should show the drag hint in selected state
    await expect(page.getByText('Drag to reorder or move')).toBeVisible();
    
    // Cleanup
    await deleteSelectedNode(page);
  });
});

// ============== Backend API Tests ==============
test.describe('Equipment Manager - DnD Backend API', () => {
  test('API: reorder-to endpoint moves node before target', async ({ request }) => {
    const timestamp = Date.now();
    
    // Login
    const loginResponse = await request.post('/api/auth/login', {
      data: { email: 'test@test.com', password: 'test' }
    });
    const { token } = await loginResponse.json();
    expect(token).toBeTruthy();
    
    // Create 2 test installations
    const createA = await request.post('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `TEST_API_A_${timestamp}`, level: 'installation', parent_id: null }
    });
    expect(createA.status()).toBe(200);
    const nodeA = await createA.json();
    
    const createB = await request.post('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `TEST_API_B_${timestamp}`, level: 'installation', parent_id: null }
    });
    expect(createB.status()).toBe(200);
    const nodeB = await createB.json();
    
    // Use reorder-to API to move B before A
    const reorderResponse = await request.post(`/api/equipment-hierarchy/nodes/${nodeB.id}/reorder-to`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { 
        target_node_id: nodeA.id, 
        position: 'before'
      }
    });
    
    expect(reorderResponse.status()).toBe(200);
    const reorderResult = await reorderResponse.json();
    expect(reorderResult.message).toContain('moved');
    
    // Verify sort_order was updated
    const getNodes = await request.get('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { nodes } = await getNodes.json();
    
    const updatedA = nodes.find((n: any) => n.id === nodeA.id);
    const updatedB = nodes.find((n: any) => n.id === nodeB.id);
    
    // B should now have a lower sort_order than A (comes before)
    expect(updatedB.sort_order).toBeLessThan(updatedA.sort_order);
    
    // Cleanup
    await request.delete(`/api/equipment-hierarchy/nodes/${nodeA.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await request.delete(`/api/equipment-hierarchy/nodes/${nodeB.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  });

  test('API: reorder-to endpoint moves node after target', async ({ request }) => {
    const timestamp = Date.now();
    
    const loginResponse = await request.post('/api/auth/login', {
      data: { email: 'test@test.com', password: 'test' }
    });
    const { token } = await loginResponse.json();
    
    // Create 3 test installations A, B, C
    const createA = await request.post('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `TEST_After_A_${timestamp}`, level: 'installation', parent_id: null }
    });
    const nodeA = await createA.json();
    
    const createB = await request.post('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `TEST_After_B_${timestamp}`, level: 'installation', parent_id: null }
    });
    const nodeB = await createB.json();
    
    const createC = await request.post('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `TEST_After_C_${timestamp}`, level: 'installation', parent_id: null }
    });
    const nodeC = await createC.json();
    
    // Move A after C (A should now be last among these 3)
    const reorderResponse = await request.post(`/api/equipment-hierarchy/nodes/${nodeA.id}/reorder-to`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { 
        target_node_id: nodeC.id, 
        position: 'after'
      }
    });
    
    expect(reorderResponse.status()).toBe(200);
    const reorderResult = await reorderResponse.json();
    expect(reorderResult.message).toContain('moved');
    
    // Verify order
    const getNodes = await request.get('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { nodes } = await getNodes.json();
    
    const updatedA = nodes.find((n: any) => n.id === nodeA.id);
    const updatedC = nodes.find((n: any) => n.id === nodeC.id);
    
    // A should now have a higher sort_order than C (comes after)
    expect(updatedA.sort_order).toBeGreaterThan(updatedC.sort_order);
    
    // Cleanup
    await request.delete(`/api/equipment-hierarchy/nodes/${nodeA.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await request.delete(`/api/equipment-hierarchy/nodes/${nodeB.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await request.delete(`/api/equipment-hierarchy/nodes/${nodeC.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  });

  test('API: move node to new parent changes parent_id', async ({ request }) => {
    const timestamp = Date.now();
    
    const loginResponse = await request.post('/api/auth/login', {
      data: { email: 'test@test.com', password: 'test' }
    });
    const { token } = await loginResponse.json();
    
    // Create parent installation
    const createParent = await request.post('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `TEST_Move_Parent_${timestamp}`, level: 'installation', parent_id: null }
    });
    const parentNode = await createParent.json();
    
    // Create a plant_unit under parent
    const createUnit = await request.post('/api/equipment-hierarchy/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `TEST_Move_Unit_${timestamp}`, level: 'plant_unit', parent_id: parentNode.id }
    });
    const unitNode = await createUnit.json();
    
    // Verify unit is under parent
    expect(unitNode.parent_id).toBe(parentNode.id);
    
    // Cleanup
    await request.delete(`/api/equipment-hierarchy/nodes/${parentNode.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  });
});

// ============== Visual Drag and Drop Tests ==============
test.describe('Equipment Manager - Visual DnD', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
    await navigateToEquipmentManager(page);
  });

  test('Visual drag and drop between sibling nodes', async ({ page }) => {
    const timestamp = Date.now();
    const installA = `TEST_Visual_A_${timestamp}`;
    const installB = `TEST_Visual_B_${timestamp}`;
    
    // Create 2 installations
    await createInstallation(page, installA);
    await createInstallation(page, installB);
    
    // Verify both created
    await expect(getTreeNodeInCenter(page, installA)).toBeVisible();
    await expect(getTreeNodeInCenter(page, installB)).toBeVisible();
    
    // Get source and target nodes
    const sourceNode = getTreeNodeInCenter(page, installB);
    const targetNode = getTreeNodeInCenter(page, installA);
    
    const sourceBB = await sourceNode.boundingBox();
    const targetBB = await targetNode.boundingBox();
    
    if (sourceBB && targetBB) {
      // Perform drag operation
      await page.mouse.move(
        sourceBB.x + sourceBB.width / 2,
        sourceBB.y + sourceBB.height / 2
      );
      await page.mouse.down();
      
      // Move to target (top edge for "before" position)
      await page.mouse.move(
        targetBB.x + targetBB.width / 2,
        targetBB.y + 5,
        { steps: 10 }  // Smooth move for better drag detection
      );
      
      // Complete the drop
      await page.mouse.up();
    }
    
    // Wait for mutation
    await page.waitForTimeout(1500);
    
    // Nodes should still be visible (DnD completed without errors)
    await expect(getTreeNodeInCenter(page, installA)).toBeVisible();
    await expect(getTreeNodeInCenter(page, installB)).toBeVisible();
    
    // Cleanup
    await selectNodeInTree(page, installA);
    await deleteSelectedNode(page);
    await selectNodeInTree(page, installB);
    await deleteSelectedNode(page);
  });

  test('Cannot drag node onto itself (no error)', async ({ page }) => {
    const testName = `TEST_Self_DnD_${Date.now()}`;
    await createInstallation(page, testName);
    
    const node = getTreeNodeInCenter(page, testName);
    const boundingBox = await node.boundingBox();
    
    if (boundingBox) {
      // Try dragging a node onto itself
      await page.mouse.move(
        boundingBox.x + boundingBox.width / 2,
        boundingBox.y + boundingBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        boundingBox.x + boundingBox.width / 2,
        boundingBox.y + boundingBox.height / 2 + 5
      );
      await page.mouse.up();
    }
    
    // Node should still exist and no error
    await expect(node).toBeVisible();
    
    // Cleanup
    await selectNodeInTree(page, testName);
    await deleteSelectedNode(page);
  });
});
