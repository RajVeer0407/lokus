import type { LaunchOptions, ConnectionInfo, StubValue } from './types.js';
import { TauriPage } from './tauri-page.js';
import { StubManager } from './stub-manager.js';

/**
 * TauriApp represents a running Tauri application connected for E2E testing.
 *
 * This class provides:
 * - Access to the main window via `firstWindow()`
 * - IPC command stubbing via `stubCommand()` and `clearStubs()`
 * - Lifecycle management via `close()`
 *
 * @example
 * ```typescript
 * import { tauri } from 'tauri-playwright-helpers';
 *
 * const app = await tauri.launch({ binary: './target/debug/my-app' });
 * const page = await app.firstWindow();
 *
 * // Stub a dialog command
 * await app.stubCommand('plugin:dialog|open', { filePaths: ['/test/file.txt'] });
 *
 * // Interact with the app
 * await page.click('button');
 *
 * // Clean up
 * await app.close();
 * ```
 */
export class TauriApp {
  private connectionInfo: ConnectionInfo;
  private mainPage: TauriPage;
  private stubManager: StubManager;
  private closed = false;

  /**
   * Creates a new TauriApp instance.
   *
   * Note: Use `tauri.launch()` instead of constructing directly.
   *
   * @param connectionInfo - Connection information including process and cleanup function
   * @param page - The main TauriPage instance
   */
  constructor(connectionInfo: ConnectionInfo, page: TauriPage) {
    this.connectionInfo = connectionInfo;
    this.mainPage = page;

    // Create stub manager with evaluate function
    this.stubManager = new StubManager(async (script: string) => {
      await this.mainPage.evaluate(script);
    });
  }

  /**
   * Get the main window of the application.
   *
   * @returns The main TauriPage for interacting with the app
   *
   * @example
   * ```typescript
   * const page = await app.firstWindow();
   * await page.click('button');
   * ```
   */
  async firstWindow(): Promise<TauriPage> {
    return this.mainPage;
  }

  /**
   * Stub a Tauri IPC command to return a specific value.
   *
   * This allows tests to mock native functionality like file dialogs,
   * file system operations, etc.
   *
   * @param command - The Tauri command to stub (e.g., 'plugin:dialog|open')
   * @param response - The value to return:
   *                   - Static value: Returned directly
   *                   - Function: Called with args, return value is used
   *                   - Error: Thrown when command is called
   *
   * @example
   * ```typescript
   * // Stub dialog to return specific files
   * await app.stubCommand('plugin:dialog|open', {
   *   filePaths: ['/test/workspace']
   * });
   *
   * // Stub with dynamic response
   * await app.stubCommand('plugin:dialog|confirm', (args) => {
   *   return args.title.includes('Delete') ? false : true;
   * });
   *
   * // Stub to throw error
   * await app.stubCommand('plugin:fs|write_file', new Error('Permission denied'));
   * ```
   */
  async stubCommand(command: string, response: StubValue): Promise<void> {
    await this.stubManager.stub(command, response);
  }

  /**
   * Remove a specific stub.
   *
   * After clearing, the command will call the real Tauri handler.
   *
   * @param command - The command to unstub (optional - clears all if not provided)
   *
   * @example
   * ```typescript
   * // Clear specific stub
   * await app.clearStubs('plugin:dialog|open');
   *
   * // Clear all stubs
   * await app.clearStubs();
   * ```
   */
  async clearStubs(command?: string): Promise<void> {
    if (command) {
      await this.stubManager.unstub(command);
    } else {
      await this.stubManager.clearAll();
    }
  }

  /**
   * Check if a command is currently stubbed.
   *
   * @param command - The command to check
   * @returns True if stubbed, false otherwise
   */
  isStubbed(command: string): boolean {
    return this.stubManager.isStubbed(command);
  }

  /**
   * Get list of currently stubbed commands.
   *
   * @returns Array of stubbed command names
   */
  getStubbedCommands(): string[] {
    return this.stubManager.getStubbedCommands();
  }

  /**
   * Get the connection mode (cdp or webdriver).
   *
   * @returns The current connection mode
   */
  getMode(): 'cdp' | 'webdriver' {
    return this.connectionInfo.mode;
  }

  /**
   * Close the application and clean up resources.
   *
   * This will:
   * - Close the browser/WebDriver connection
   * - Terminate the Tauri process
   * - Release any system resources
   *
   * @example
   * ```typescript
   * // In test teardown
   * await app.close();
   * ```
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Run cleanup function if provided
    if (this.connectionInfo.cleanup) {
      await this.connectionInfo.cleanup();
    }

    // Kill the process if it exists and wasn't handled by cleanup
    if (this.connectionInfo.process && !this.connectionInfo.process.killed) {
      this.connectionInfo.process.kill('SIGTERM');
    }
  }
}
