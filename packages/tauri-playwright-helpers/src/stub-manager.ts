import type { StubValue } from './types.js';
import { getInterceptorScript } from './scripts/ipc-interceptor.js';

/**
 * Serialized stub value for transmission to the browser context.
 * Error objects are converted to a special format since they can't be JSON serialized.
 */
interface SerializedStub {
  __isError__: true;
  message: string;
}

/**
 * Manages IPC command stubs for Tauri testing.
 *
 * The StubManager allows tests to mock Tauri IPC commands (like dialogs, file system
 * operations, etc.) by intercepting calls to `window.__TAURI_INTERNALS__.invoke`
 * and returning controlled values.
 *
 * @example
 * ```typescript
 * const stubManager = new StubManager(async (script) => {
 *   await page.evaluate(script);
 * });
 *
 * // Stub a dialog to return a file path
 * await stubManager.stub('plugin:dialog|open', '/path/to/file.txt');
 *
 * // Stub a command to throw an error
 * await stubManager.stub('plugin:fs|read_file', new Error('File not found'));
 *
 * // Stub with a function for dynamic responses
 * await stubManager.stub('plugin:dialog|confirm', (args) => {
 *   return args.title.includes('Delete') ? false : true;
 * });
 * ```
 */
export class StubManager {
  private evaluateFn: (script: string) => Promise<void>;
  private stubs: Map<string, StubValue> = new Map();
  private interceptorInstalled = false;

  /**
   * Creates a new StubManager.
   *
   * @param evaluateFn - Function to evaluate scripts in the page context.
   *                     Typically wraps `page.evaluate()` from Playwright or similar.
   */
  constructor(evaluateFn: (script: string) => Promise<void>) {
    this.evaluateFn = evaluateFn;
  }

  /**
   * Gets the interceptor script that needs to be injected into the page.
   *
   * This script sets up the IPC interception mechanism. It should be injected
   * before any stubs are set, typically during page initialization.
   *
   * @returns The interceptor script as a string
   */
  getInterceptorScript(): string {
    return getInterceptorScript();
  }

  /**
   * Ensures the interceptor is installed in the page.
   */
  private async ensureInterceptor(): Promise<void> {
    if (!this.interceptorInstalled) {
      await this.evaluateFn(this.getInterceptorScript());
      this.interceptorInstalled = true;
    }
  }

  /**
   * Serializes a stub value for transmission to the browser.
   *
   * Error objects are converted to `{ __isError__: true, message: '...' }` format
   * since Error objects cannot be JSON serialized directly.
   *
   * Function stubs are converted to string representations that will be
   * evaluated in the browser context.
   *
   * @param value - The stub value to serialize
   * @returns The serialized value
   */
  private serializeStubValue(value: StubValue): unknown {
    if (value instanceof Error) {
      return {
        __isError__: true,
        message: value.message,
      } as SerializedStub;
    }

    // For functions, we need to convert to string and eval in browser
    if (typeof value === 'function') {
      return value;
    }

    return value;
  }

  /**
   * Stubs a Tauri IPC command to return a specific value.
   *
   * @param command - The command to stub (e.g., 'plugin:dialog|open', 'plugin:fs|read_file')
   * @param response - The value to return when the command is called:
   *                   - Static value: Returned directly
   *                   - Function: Called with args, return value is used
   *                   - Error: Thrown when command is called
   *
   * @example
   * ```typescript
   * // Static value
   * await stubManager.stub('plugin:dialog|open', '/selected/file.txt');
   *
   * // Error response
   * await stubManager.stub('plugin:fs|read_file', new Error('Permission denied'));
   *
   * // Dynamic function
   * await stubManager.stub('plugin:dialog|confirm', (args) => {
   *   return args.message.includes('delete') ? false : true;
   * });
   * ```
   */
  async stub(command: string, response: StubValue): Promise<void> {
    await this.ensureInterceptor();

    // Store locally for tracking
    this.stubs.set(command, response);

    const serialized = this.serializeStubValue(response);

    // Build the script to set the stub
    if (typeof response === 'function') {
      // For functions, we need to serialize the function code
      const fnString = response.toString();
      const script = `window.__TAURI_TEST_STUBS__[${JSON.stringify(command)}] = ${fnString};`;
      await this.evaluateFn(script);
    } else {
      // For other values, use JSON serialization
      const script = `window.__TAURI_TEST_STUBS__[${JSON.stringify(command)}] = ${JSON.stringify(serialized)};`;
      await this.evaluateFn(script);
    }
  }

  /**
   * Removes a stub for a specific command.
   *
   * After unstubbing, calls to the command will pass through to the
   * original Tauri IPC handler.
   *
   * @param command - The command to unstub
   *
   * @example
   * ```typescript
   * await stubManager.stub('plugin:dialog|open', '/mock/path');
   * // ... test code ...
   * await stubManager.unstub('plugin:dialog|open');
   * // Command now calls real Tauri handler
   * ```
   */
  async unstub(command: string): Promise<void> {
    // Remove from local tracking
    this.stubs.delete(command);

    // Remove from browser context
    const script = `delete window.__TAURI_TEST_STUBS__[${JSON.stringify(command)}];`;
    await this.evaluateFn(script);
  }

  /**
   * Clears all stubs.
   *
   * After clearing, all IPC calls will pass through to the original
   * Tauri handlers.
   *
   * @example
   * ```typescript
   * // In test teardown
   * await stubManager.clearAll();
   * ```
   */
  async clearAll(): Promise<void> {
    // Clear local tracking
    this.stubs.clear();

    // Clear in browser context
    const script = `window.__TAURI_TEST_STUBS__ = {};`;
    await this.evaluateFn(script);
  }

  /**
   * Gets a list of all currently stubbed commands.
   *
   * @returns Array of command names that are currently stubbed
   */
  getStubbedCommands(): string[] {
    return Array.from(this.stubs.keys());
  }

  /**
   * Checks if a specific command is currently stubbed.
   *
   * @param command - The command to check
   * @returns True if the command is stubbed, false otherwise
   */
  isStubbed(command: string): boolean {
    return this.stubs.has(command);
  }
}
