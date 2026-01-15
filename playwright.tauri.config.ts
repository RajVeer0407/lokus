/**
 * Playwright config for real Tauri E2E tests
 *
 * These tests run against the actual Tauri binary, not the dev server.
 * Use: npx playwright test --config=playwright.tauri.config.ts
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-tauri',
  fullyParallel: false, // Run sequentially - we're testing one app instance
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker - one Tauri app at a time
  reporter: [['html', { outputFolder: 'playwright-report-tauri' }]],
  timeout: 60000, // Longer timeout for real app

  use: {
    // No baseURL - we connect directly to the Tauri app
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // No webServer - tauri-playwright-helpers launches the app
  webServer: undefined,

  outputDir: 'test-results-tauri',
});
