import type { LaunchOptions, Connector } from './types.js';
import { TauriApp } from './tauri-app.js';
import { TauriPage } from './tauri-page.js';

/**
 * Get the appropriate connector for the current platform.
 *
 * @returns A connector instance for the current OS
 * @throws Error if the platform is not supported
 */
async function getConnector(): Promise<Connector> {
  const platform = process.platform;

  switch (platform) {
    case 'win32': {
      const { WindowsConnector } = await import('./connectors/windows.js');
      return new WindowsConnector();
    }
    case 'linux': {
      const { LinuxConnector } = await import('./connectors/linux.js');
      return new LinuxConnector();
    }
    case 'darwin':
      throw new Error(
        'macOS is not currently supported for E2E testing.\n' +
        'WKWebView does not expose a remote debugging interface.\n\n' +
        'Options:\n' +
        '- Run E2E tests on Linux or Windows\n' +
        '- Use mock-based testing on macOS\n' +
        '- See: https://github.com/tauri-apps/tauri/discussions/10123'
      );
    default:
      throw new Error(
        `Unsupported platform: ${platform}.\n` +
        'tauri-playwright-helpers supports Windows (win32) and Linux.'
      );
  }
}

/**
 * Launch a Tauri application for E2E testing.
 *
 * This function:
 * 1. Detects the current platform
 * 2. Uses the appropriate connector (CDP for Windows, WebDriver for Linux)
 * 3. Launches the Tauri binary
 * 4. Connects to the webview
 * 5. Returns a TauriApp instance for testing
 *
 * @param options - Launch configuration
 * @returns A TauriApp instance connected to the running application
 *
 * @example
 * ```typescript
 * import { tauri } from 'tauri-playwright-helpers';
 *
 * // Launch the app
 * const app = await tauri.launch({
 *   binary: './target/debug/my-tauri-app',
 *   timeout: 30000,
 * });
 *
 * // Get the main window
 * const page = await app.firstWindow();
 *
 * // Interact with the app
 * await page.click('button#start');
 *
 * // Clean up
 * await app.close();
 * ```
 */
export async function launch(options: LaunchOptions): Promise<TauriApp> {
  // Validate options
  if (!options.binary) {
    throw new Error('options.binary is required - provide the path to your Tauri binary');
  }

  // Get platform-specific connector
  const connector = await getConnector();

  // Launch the app and connect
  const { connectionInfo, page: innerPage } = await connector.launch(options);

  // Wrap in TauriPage
  const tauriPage = new TauriPage(innerPage, connectionInfo.mode);

  // Create and return TauriApp
  return new TauriApp(connectionInfo, tauriPage);
}

/**
 * The main tauri object for launching applications.
 *
 * @example
 * ```typescript
 * import { tauri } from 'tauri-playwright-helpers';
 *
 * const app = await tauri.launch({ binary: './target/debug/app' });
 * ```
 */
export const tauri = {
  launch,
};
