/**
 * tauri-playwright-helpers
 *
 * E2E testing helpers for Tauri applications with Playwright-compatible API.
 *
 * This library enables true E2E testing of Tauri applications by:
 * - Connecting to real Tauri apps (not mocked dev servers)
 * - Providing Playwright-like API for interaction
 * - Allowing stubbing of native features (dialogs, file system, etc.)
 *
 * @example
 * ```typescript
 * import { tauri, TauriApp, TauriPage } from 'tauri-playwright-helpers';
 *
 * // Launch the app
 * const app = await tauri.launch({
 *   binary: './target/debug/my-app',
 * });
 *
 * // Get the main window
 * const page = await app.firstWindow();
 *
 * // Stub a dialog command
 * await app.stubCommand('plugin:dialog|open', {
 *   filePaths: ['/test/workspace']
 * });
 *
 * // Interact with the app
 * await page.click('button:has-text("Open")');
 * await page.waitForSelector('.file-tree');
 *
 * // Clean up
 * await app.close();
 * ```
 *
 * @packageDocumentation
 */

// Main exports
export { tauri, launch } from './launcher.js';
export { TauriApp } from './tauri-app.js';
export { TauriPage, TauriLocator } from './tauri-page.js';
export { StubManager } from './stub-manager.js';

// Types
export type {
  LaunchOptions,
  ClickOptions,
  WaitOptions,
  ScreenshotOptions,
  StubValue,
  ConnectionInfo,
  Connector,
  PageLike,
  ElementLike,
  CDPTarget,
} from './types.js';

// Connectors (for advanced usage)
export { WindowsConnector } from './connectors/windows.js';
export { LinuxConnector } from './connectors/linux.js';

// Scripts (for advanced usage)
export { getInterceptorScript } from './scripts/ipc-interceptor.js';
