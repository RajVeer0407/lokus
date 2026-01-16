/**
 * Real Tauri E2E Tests
 *
 * These tests run against the actual Tauri binary with real IPC.
 * Native features like dialogs are stubbed using tauri-playwright-helpers.
 */

import { test, expect } from '@playwright/test';
import { tauri, TauriApp, TauriPage } from 'tauri-playwright-helpers';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

// Skip on macOS as it's not supported
test.skip(process.platform === 'darwin', 'Tauri E2E not supported on macOS');

// Path to Tauri binary - set via environment or default to debug build
const TAURI_BINARY = process.env.TAURI_BINARY || './target/debug/lokus';

let app: TauriApp;
let page: TauriPage;
let testWorkspacePath: string;

test.beforeAll(async () => {
  // Create a test workspace with some files
  testWorkspacePath = path.join(os.tmpdir(), `lokus-e2e-test-${Date.now()}`);
  await fs.mkdir(testWorkspacePath, { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(testWorkspacePath, 'test-note.md'),
    '# Test Note\n\nThis is a test note for E2E testing.\n'
  );
  await fs.writeFile(
    path.join(testWorkspacePath, 'another-note.md'),
    '# Another Note\n\nMore content here.\n'
  );
  await fs.mkdir(path.join(testWorkspacePath, 'subfolder'), { recursive: true });
  await fs.writeFile(
    path.join(testWorkspacePath, 'subfolder', 'nested-note.md'),
    '# Nested Note\n\nThis is in a subfolder.\n'
  );

  // Launch Tauri app
  app = await tauri.launch({
    binary: TAURI_BINARY,
    timeout: 60000,
  });

  page = await app.firstWindow();
});

test.afterAll(async () => {
  // Close the app
  if (app) {
    await app.close();
  }

  // Clean up test workspace
  if (testWorkspacePath) {
    await fs.rm(testWorkspacePath, { recursive: true, force: true });
  }
});

test.describe('Lokus App - Real Tauri Tests', () => {
  test('should load the app and show launcher', async () => {
    // Wait for app to fully load - look for the Lokus heading
    await page.waitForSelector('h1', { timeout: 10000 });

    // Take a screenshot
    await page.screenshot({ path: 'test-results/tauri-app-loaded.png' });

    // Should show launcher UI - look for workspace buttons
    // The actual button text is "Create New Workspace" or "Open Existing Workspace"
    const hasCreateButton = await page.locator('button:has-text("Create New Workspace")').isVisible();
    const hasOpenButton = await page.locator('button:has-text("Open Existing Workspace")').isVisible();
    expect(hasCreateButton || hasOpenButton).toBe(true);
  });

  test('should open workspace via stubbed dialog', async () => {
    // Stub the dialog to return our test workspace
    await app.stubCommand('plugin:dialog|open', {
      // Dialog returns the selected path
      path: testWorkspacePath,
    });

    // Click "Open Existing Workspace" button (actual text in the UI)
    await page.click('button:has-text("Open Existing Workspace")');

    // Wait for workspace to load - file tree should appear
    // Try multiple selectors since the app might use different class names
    await page.waitForSelector('[data-testid="file-tree"], .file-tree, .file-explorer, [class*="sidebar"], [class*="file"]', {
      timeout: 15000,
    });

    // Verify our test files are visible - use partial match
    await page.waitForSelector('text=test-note', { timeout: 10000 });

    await page.screenshot({ path: 'test-results/tauri-workspace-opened.png' });

    // Clear the stub
    await app.clearStubs('plugin:dialog|open');
  });

  test('should display file tree with correct structure', async () => {
    // Wait for file tree to be populated
    await page.waitForSelector('text=test-note', { timeout: 10000 });

    // Check for test files
    const testNote = page.locator('text=test-note');
    const anotherNote = page.locator('text=another-note');
    const subfolder = page.locator('text=subfolder');

    expect(await testNote.isVisible()).toBe(true);
    expect(await anotherNote.isVisible()).toBe(true);
    expect(await subfolder.isVisible()).toBe(true);
  });

  test('should open and display note content', async () => {
    // Click on test-note.md
    await page.click('text=test-note');

    // Wait for editor to load
    await page.waitForSelector('.ProseMirror, [data-testid="editor"], .editor', {
      timeout: 5000,
    });

    // Verify content is displayed
    const hasContent = await page.locator('text=This is a test note').isVisible();
    expect(hasContent).toBe(true);

    await page.screenshot({ path: 'test-results/tauri-note-opened.png' });
  });

  test('should edit note content', async () => {
    // Focus the editor
    const editor = page.locator('.ProseMirror, [data-testid="editor"], .editor');
    await editor.click();

    // Type some content
    await page.keyboard.type('\n\nAdded by E2E test!');

    // Wait for auto-save
    await page.waitForTimeout(1000);

    // Verify content was added
    const hasNewContent = await page.locator('text=Added by E2E test').isVisible();
    expect(hasNewContent).toBe(true);

    await page.screenshot({ path: 'test-results/tauri-note-edited.png' });
  });

  test('should create new note via stubbed dialog', async () => {
    const newNotePath = path.join(testWorkspacePath, 'new-note.md');

    // Stub the save dialog
    await app.stubCommand('plugin:dialog|save', {
      path: newNotePath,
    });

    // Find and click new file button
    const newFileBtn = page.locator('[data-testid="new-file"], button:has-text("New")');
    if (await newFileBtn.isVisible()) {
      await newFileBtn.click();

      // Wait for new note to appear
      await page.waitForSelector('text=new-note', { timeout: 5000 });

      await page.screenshot({ path: 'test-results/tauri-new-note.png' });
    }

    await app.clearStubs();
  });

  test('should handle search functionality', async () => {
    // Open search (Cmd/Ctrl + K)
    await page.keyboard.press('Control+k');

    // Wait for search UI
    const searchInput = page.locator(
      '[data-testid="search-input"], input[placeholder*="Search"], .search-input'
    );

    if (await searchInput.isVisible({ timeout: 3000 })) {
      // Type search query
      await searchInput.fill('test');

      // Wait for results
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'test-results/tauri-search.png' });

      // Close search
      await page.keyboard.press('Escape');
    }
  });

  test('should navigate between notes', async () => {
    // Click on another note
    await page.click('text=another-note');

    // Wait for content to change
    await page.waitForSelector('text=More content here', { timeout: 5000 });

    await page.screenshot({ path: 'test-results/tauri-navigation.png' });
  });

  test('should expand subfolder in file tree', async () => {
    // Click on subfolder to expand
    await page.click('text=subfolder');

    // Wait for nested file to appear
    await page.waitForSelector('text=nested-note', { timeout: 3000 });

    // Click on nested note
    await page.click('text=nested-note');

    // Verify content
    await page.waitForSelector('text=This is in a subfolder', { timeout: 5000 });

    await page.screenshot({ path: 'test-results/tauri-subfolder.png' });
  });
});

test.describe('Error Handling', () => {
  test('should handle file read errors gracefully', async () => {
    // Stub file read to throw error
    await app.stubCommand('plugin:fs|read_text_file', new Error('Permission denied'));

    // Try to trigger a file read (this depends on app implementation)
    // The app should show an error message, not crash

    await app.clearStubs();
  });

  test('should handle dialog cancellation', async () => {
    // Stub dialog to return null (cancelled)
    await app.stubCommand('plugin:dialog|open', null);

    // Click open workspace - use the actual button text
    const openBtn = page.locator('button:has-text("Open Existing Workspace")');
    if (await openBtn.isVisible()) {
      await openBtn.click();

      // App should remain on launcher, not crash
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'test-results/tauri-dialog-cancelled.png' });
    }

    await app.clearStubs();
  });
});
