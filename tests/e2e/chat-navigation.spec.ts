import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Chat Sidebar Interface', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
  });

  test('report threat button opens chat sidebar', async ({ page }) => {
    await expect(page.getByTestId('threats-page')).toBeVisible();
    
    // Click Report Threat button
    await page.getByTestId('report-threat-button').click();
    
    // Chat sidebar should open
    await expect(page.getByTestId('chat-sidebar')).toBeVisible();
    await expect(page.getByTestId('sidebar-chat-message-input')).toBeVisible();
    await expect(page.getByTestId('sidebar-send-message-button')).toBeVisible();
  });

  test('chat sidebar has close button', async ({ page }) => {
    await page.getByTestId('report-threat-button').click();
    await expect(page.getByTestId('chat-sidebar')).toBeVisible();
    
    // Close button should exist
    const closeBtn = page.getByTestId('close-chat-sidebar');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    
    // Sidebar should close
    await expect(page.getByTestId('chat-sidebar')).not.toBeVisible();
  });

  test('send button disabled when message is empty', async ({ page }) => {
    await page.getByTestId('report-threat-button').click();
    await expect(page.getByTestId('chat-sidebar')).toBeVisible();
    
    const sendBtn = page.getByTestId('sidebar-send-message-button');
    await expect(sendBtn).toBeDisabled();
  });

  test('send button enabled when message is typed', async ({ page }) => {
    await page.getByTestId('report-threat-button').click();
    await expect(page.getByTestId('chat-sidebar')).toBeVisible();
    
    await page.getByTestId('sidebar-chat-message-input').fill('Test message');
    const sendBtn = page.getByTestId('sidebar-send-message-button');
    await expect(sendBtn).toBeEnabled();
  });

  test('typing in chat input works', async ({ page }) => {
    await page.getByTestId('report-threat-button').click();
    await expect(page.getByTestId('chat-sidebar')).toBeVisible();
    
    const input = page.getByTestId('sidebar-chat-message-input');
    await input.fill('Pump P-104 is leaking from the mechanical seal');
    await expect(input).toHaveValue('Pump P-104 is leaking from the mechanical seal');
  });
});

test.describe('Navigation and Layout', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
  });

  test('app header shows logo and user name', async ({ page }) => {
    await expect(page.getByTestId('app-logo')).toBeVisible();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await expect(page.getByTestId('logout-button')).toBeVisible();
  });

  test('desktop nav items exist in DOM', async ({ page }) => {
    await expect(page.getByTestId('desktop-nav')).toBeVisible();
    await expect(page.getByTestId('nav-threats')).toBeVisible();
    await expect(page.getByTestId('nav-library')).toBeVisible();
  });

  test('settings menu is accessible', async ({ page }) => {
    await expect(page.getByTestId('settings-menu-button')).toBeVisible();
    await page.getByTestId('settings-menu-button').click();
    await expect(page.getByTestId('equipment-manager-menu-item')).toBeVisible();
  });

  test('navigate to threats page via nav', async ({ page }) => {
    // Go to library first
    await page.getByTestId('nav-library').click();
    await expect(page.getByTestId('failure-modes-page')).toBeVisible();
    
    // Navigate back to threats
    await page.getByTestId('nav-threats').click();
    await expect(page.getByTestId('threats-page')).toBeVisible();
  });

  test('mobile menu toggle works at small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Wait for any toast to dismiss before clicking mobile toggle
    await page.locator('[data-sonner-toast]').waitFor({ state: 'hidden' }).catch(() => {});
    await page.waitForTimeout(500);
    await expect(page.getByTestId('mobile-menu-toggle')).toBeVisible();
    await page.getByTestId('mobile-menu-toggle').click({ force: true });
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-threats')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-library')).toBeVisible();
  });

  test('hierarchy toggle button exists in header', async ({ page }) => {
    await expect(page.getByTestId('hierarchy-toggle')).toBeVisible();
  });
});
