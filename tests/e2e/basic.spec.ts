import { test, expect } from '@playwright/test';

test.describe('FastShare Basic Tests', () => {
  test('should load the application', async ({ page }) => {
    console.log('Navigating to app...');
    await page.goto('/');

    // Wait for app to load
    await page.waitForSelector('h1', { timeout: 10000 });

    // Check title
    const title = await page.locator('h1').first().textContent();
    console.log('Page title:', title);
    expect(title).toBe('FastShare');

    console.log('✓ App loaded successfully');
  });

  test('should display device list', async ({ page }) => {
    await page.goto('/');

    // Wait for device list to load
    await page.waitForSelector('h3', { timeout: 10000 });

    const heading = await page.locator('h3').first().textContent();
    expect(heading).toContain('Connected Devices');

    console.log('✓ Device list displayed');
  });

  test('should show connection status', async ({ page }) => {
    await page.goto('/');

    // Wait for connection status
    await page.waitForSelector('.connection-status', { timeout: 10000 });

    const statusText = await page.locator('.connection-status').first().textContent();
    expect(statusText).toMatch(/Connected|Disconnected/);

    console.log('✓ Connection status displayed:', statusText);
  });

  test('should display file selector', async ({ page }) => {
    await page.goto('/');

    // Wait for file selector section
    await page.waitForSelector('h3:has-text("Send File")', { timeout: 10000 });

    const fileSelector = page.locator('.file-selector');
    await expect(fileSelector).toBeVisible();

    console.log('✓ File selector displayed');
  });

  test('should show connected devices count', async ({ page }) => {
    await page.goto('/');

    // Wait for device list
    await page.waitForSelector('h3', { timeout: 10000 });

    const deviceCount = await page.locator('h3').first().textContent();
    expect(deviceCount).toMatch(/Connected Devices \(\d+\)/);

    console.log('✓ Device count displayed:', deviceCount);
  });

  test('should refresh device list', async ({ page }) => {
    await page.goto('/');

    // Wait for device list
    await page.waitForSelector('button:has-text("Refresh")', { timeout: 10000 });

    // Click refresh button
    await page.click('button:has-text("Refresh")');

    // Should still show device list
    const deviceCount = await page.locator('h3').first().textContent();
    expect(deviceCount).toContain('Connected Devices');

    console.log('✓ Device list refreshed');
  });

  test('should disable file selector when no device selected', async ({ page }) => {
    await page.goto('/');

    // Wait for file selector
    await page.waitForSelector('.file-selector input[type="file"]', { timeout: 10000 });

    // File selector should be disabled when no device is selected
    const fileInput = page.locator('.file-selector input[type="file"]');
    await expect(fileInput).toBeDisabled();

    console.log('✓ File selector disabled when no device selected');
  });
});
