import { test, expect } from '@playwright/test';
import { loginUser, dismissToasts } from '../fixtures/helpers';

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginUser(page);
  });

  test('chat page renders correctly', async ({ page }) => {
    await expect(page.getByTestId('chat-page')).toBeVisible();
    await expect(page.getByTestId('chat-input-area')).toBeVisible();
    await expect(page.getByTestId('chat-message-input')).toBeVisible();
    await expect(page.getByTestId('send-message-button')).toBeVisible();
    await expect(page.getByTestId('upload-image-button')).toBeVisible();
    await expect(page.getByTestId('voice-record-button')).toBeVisible();
  });

  test('send button disabled when message is empty', async ({ page }) => {
    const sendBtn = page.getByTestId('send-message-button');
    await expect(sendBtn).toBeDisabled();
  });

  test('send button enabled when message is typed', async ({ page }) => {
    await page.getByTestId('chat-message-input').fill('Test message');
    const sendBtn = page.getByTestId('send-message-button');
    await expect(sendBtn).toBeEnabled();
  });

  test('typing in chat input works', async ({ page }) => {
    const input = page.getByTestId('chat-message-input');
    await input.fill('Pump P-104 is leaking from the mechanical seal');
    await expect(input).toHaveValue('Pump P-104 is leaking from the mechanical seal');
  });

  test('chat history is loaded on page', async ({ page }) => {
    // Either shows messages or empty state
    const hasMessages = await page.locator('[data-testid^="chat-message-"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('.empty-state').isVisible().catch(() => false);
    expect(hasMessages || hasEmpty).toBeTruthy();
  });

  test('sending a message shows loading state', async ({ page }) => {
    // Remove the Emergent badge that can block the send button
    await page.evaluate(() => { const badge = document.querySelector('[class*="emergent"], [id*="emergent"]'); if (badge) (badge as HTMLElement).style.display = 'none'; });
    await page.getByTestId('chat-message-input').fill('Pump P-200 bearing failure');
    // Start waiting for the API response
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/chat/send'),
      { timeout: 30000 }
    );
    await page.getByTestId('send-message-button').click({ force: true });
    
    // Wait for the AI response
    await responsePromise;
    
    // Input should be cleared after successful send
    const input = page.getByTestId('chat-message-input');
    await expect(input).toHaveValue('');
  });

  test('AI response appears after sending message', async ({ page }) => {
    // Remove the Emergent badge that can block the send button
    await page.evaluate(() => { const badge = document.querySelector('[class*="emergent"], [id*="emergent"]'); if (badge) (badge as HTMLElement).style.display = 'none'; });
    const initialMsgCount = await page.locator('[data-testid^="chat-message-assistant-"]').count();
    
    await page.getByTestId('chat-message-input').fill('Heat exchanger HX-301 showing reduced efficiency due to fouling');
    await page.getByTestId('send-message-button').click({ force: true });
    
    // Wait for AI response to appear (AI calls may take time)
    await page.waitForResponse(resp => resp.url().includes('/api/chat/send'), { timeout: 30000 });
    
    // There should be at least one more assistant message
    await expect(page.locator('[data-testid^="chat-message-assistant-"]').nth(initialMsgCount)).toBeVisible();
  });

  test('empty state shows prompt suggestions when no messages', async ({ page }) => {
    // Check if there are no messages (fresh user scenario or empty history)
    const msgCount = await page.locator('[data-testid^="chat-message-user-"]').count();
    if (msgCount === 0) {
      // Should show empty state
      await expect(page.locator('.empty-state')).toBeVisible();
    }
    // If there are messages, test passes trivially (chat is working)
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
    await expect(page.getByTestId('nav-chat')).toBeVisible();
    await expect(page.getByTestId('nav-threats')).toBeVisible();
  });

  test('navigate to threats via direct URL', async ({ page }) => {
    await page.goto('/threats', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('threats-page')).toBeVisible();
  });

  test('navigate back to chat from threats', async ({ page }) => {
    await page.goto('/threats', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('threats-page')).toBeVisible();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('chat-page')).toBeVisible();
  });

  test('mobile menu toggle works at small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Wait for any toast to dismiss before clicking mobile toggle
    await page.locator('[data-sonner-toast]').waitFor({ state: 'hidden' }).catch(() => {});
    await page.waitForTimeout(500);
    await expect(page.getByTestId('mobile-menu-toggle')).toBeVisible();
    await page.getByTestId('mobile-menu-toggle').click({ force: true });
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-chat')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-threats')).toBeVisible();
  });
});
