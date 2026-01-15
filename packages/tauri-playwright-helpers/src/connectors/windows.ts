import { spawn, type ChildProcess } from 'node:child_process';
import type { Connector, LaunchOptions, ConnectionInfo, PageLike, CDPTarget } from '../types';

const DEFAULT_CDP_PORT = 9222;
const DEFAULT_TIMEOUT = 30000;
const POLL_INTERVAL = 100;

/**
 * Windows connector for Tauri applications using Chrome DevTools Protocol (CDP).
 * Uses WebView2's remote debugging capabilities to connect Playwright.
 */
export class WindowsConnector implements Connector {
  /**
   * Launch a Tauri application on Windows and connect via CDP.
   *
   * @param options - Launch options including binary path, args, env, timeout, and debug port
   * @returns Connection info and Playwright Page object
   */
  async launch(options: LaunchOptions): Promise<{
    connectionInfo: ConnectionInfo;
    page: PageLike;
  }> {
    const port = options.debugPort ?? DEFAULT_CDP_PORT;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    // Import playwright dynamically to avoid issues when not on Windows
    const { chromium } = await import('playwright');

    // Prepare environment with WebView2 debugging enabled
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...options.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    };

    // Spawn the Tauri binary as a child process
    const appProcess = spawn(options.binary, options.args ?? [], {
      env,
      stdio: 'pipe',
      detached: false,
    });

    // Track if process has exited
    let processExited = false;
    let exitError: Error | null = null;

    appProcess.on('exit', (code, signal) => {
      processExited = true;
      if (code !== 0 && code !== null) {
        exitError = new Error(`Tauri process exited with code ${code}`);
      } else if (signal) {
        exitError = new Error(`Tauri process killed by signal ${signal}`);
      }
    });

    appProcess.on('error', (err) => {
      processExited = true;
      exitError = err;
    });

    // Wait for CDP endpoint to be available
    const cdpUrl = `http://localhost:${port}/json`;
    let wsEndpoint: string | null = null;

    try {
      wsEndpoint = await this.waitForCDPEndpoint(cdpUrl, timeout, () => {
        if (processExited && exitError) {
          throw exitError;
        }
        return processExited;
      });
    } catch (error) {
      // Clean up the process on failure
      await this.killProcess(appProcess);
      throw error;
    }

    if (!wsEndpoint) {
      await this.killProcess(appProcess);
      throw new Error(`Failed to find WebSocket debugger URL at ${cdpUrl}`);
    }

    // Connect Playwright via CDP
    let browser;
    let context;
    let page;

    try {
      browser = await chromium.connectOverCDP(wsEndpoint);

      // Get the default context and page
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser contexts available after CDP connection');
      }

      context = contexts[0];
      const pages = context.pages();

      if (pages.length === 0) {
        // Wait for a page to be created
        page = await context.waitForEvent('page', { timeout: 5000 });
      } else {
        page = pages[0];
      }
    } catch (error) {
      await this.killProcess(appProcess);
      throw new Error(`Failed to connect Playwright via CDP: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Create cleanup function
    const cleanup = async (): Promise<void> => {
      try {
        await browser.close();
      } catch {
        // Browser may already be closed
      }
      await this.killProcess(appProcess);
    };

    const connectionInfo: ConnectionInfo = {
      process: appProcess,
      cleanup,
      mode: 'cdp',
    };

    return {
      connectionInfo,
      page,
    };
  }

  /**
   * Poll the CDP endpoint until it returns valid targets.
   *
   * @param url - The CDP /json endpoint URL
   * @param timeout - Maximum time to wait in milliseconds
   * @param checkProcessExited - Callback to check if process has exited
   * @returns The webSocketDebuggerUrl from the first valid target
   */
  private async waitForCDPEndpoint(
    url: string,
    timeout: number,
    checkProcessExited: () => boolean
  ): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check if process has exited unexpectedly
      if (checkProcessExited()) {
        throw new Error('Tauri process exited before CDP endpoint was available');
      }

      try {
        const response = await fetch(url);

        if (response.ok) {
          const targets = await response.json() as CDPTarget[];

          // Find a suitable target (prefer 'page' type)
          const pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
          const anyTarget = targets.find(t => t.webSocketDebuggerUrl);
          const target = pageTarget ?? anyTarget;

          if (target?.webSocketDebuggerUrl) {
            return target.webSocketDebuggerUrl;
          }
        }
      } catch {
        // CDP endpoint not ready yet, continue polling
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL);
    }

    throw new Error(
      `Timeout waiting for CDP endpoint at ${url} after ${timeout}ms. ` +
      'Ensure the Tauri application is starting correctly and WebView2 is available.'
    );
  }

  /**
   * Kill the process and its entire process tree.
   * Uses tree-kill to ensure all child processes are terminated.
   *
   * @param process - The child process to kill
   */
  private async killProcess(process: ChildProcess): Promise<void> {
    if (!process.pid || process.killed) {
      return;
    }

    return new Promise((resolve) => {
      // Import tree-kill dynamically (CommonJS module)
      import('tree-kill').then((treeKillModule) => {
        // Handle both ESM default export and CommonJS module.exports
        const treeKill = typeof treeKillModule === 'function'
          ? treeKillModule
          : (treeKillModule as { default?: typeof import('tree-kill') }).default ?? treeKillModule;

        (treeKill as typeof import('tree-kill'))(process.pid!, 'SIGTERM', (err) => {
          if (err) {
            // If tree-kill fails, try regular kill
            try {
              process.kill('SIGTERM');
            } catch {
              // Process may already be dead
            }
          }
          resolve();
        });
      }).catch(() => {
        // If tree-kill import fails, fall back to regular kill
        try {
          process.kill('SIGTERM');
        } catch {
          // Process may already be dead
        }
        resolve();
      });
    });
  }

  /**
   * Sleep for the specified duration.
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
