import { spawn, type ChildProcess } from 'node:child_process';
import { Builder, Capabilities, type WebDriver } from 'selenium-webdriver';
import treeKill from 'tree-kill';
import type { Connector, LaunchOptions, ConnectionInfo, PageLike } from '../types.js';

/**
 * Default port for tauri-driver WebDriver server
 */
const DEFAULT_DRIVER_PORT = 4444;

/**
 * Default port for tauri-driver native communication
 */
const DEFAULT_NATIVE_PORT = 4445;

/**
 * Default timeout for waiting operations (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Interval for polling driver readiness (100ms)
 */
const POLL_INTERVAL = 100;

/**
 * Linux connector for Tauri applications using tauri-driver and WebDriver.
 *
 * This connector:
 * 1. Starts tauri-driver process which acts as a WebDriver server
 * 2. Waits for tauri-driver to be ready to accept connections
 * 3. Creates a Selenium WebDriver session with tauri:options capability
 * 4. Returns the WebDriver instance for automation
 *
 * tauri-driver manages the application lifecycle, so the process field
 * in ConnectionInfo will be null.
 */
export class LinuxConnector implements Connector {
  private driverProcess: ChildProcess | null = null;

  /**
   * Launch a Tauri application on Linux using tauri-driver.
   *
   * @param options - Launch options including binary path and optional configuration
   * @returns Connection info and page-like interface for automation
   */
  async launch(options: LaunchOptions): Promise<{
    connectionInfo: ConnectionInfo;
    page: PageLike;
  }> {
    const driverPort = options.debugPort ?? DEFAULT_DRIVER_PORT;
    const nativePort = driverPort + 1; // Native port is driver port + 1
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    // Start tauri-driver process
    this.driverProcess = await this.startTauriDriver(driverPort, nativePort);

    // Wait for tauri-driver to be ready
    await this.waitForDriver(driverPort, timeout);

    // Create WebDriver session
    const driver = await this.createWebDriverSession(driverPort, options);

    // Create cleanup function
    const cleanup = async (): Promise<void> => {
      await this.cleanup(driver);
    };

    return {
      connectionInfo: {
        process: null, // tauri-driver manages the app process
        cleanup,
        mode: 'webdriver',
      },
      page: driver,
    };
  }

  /**
   * Start the tauri-driver process.
   *
   * @param driverPort - Port for WebDriver server
   * @param nativePort - Port for native communication
   * @returns The spawned child process
   */
  private startTauriDriver(driverPort: number, nativePort: number): ChildProcess {
    const driverProcess = spawn('tauri-driver', [
      '--port',
      String(driverPort),
      '--native-port',
      String(nativePort),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Handle process errors
    driverProcess.on('error', (error) => {
      console.error('[LinuxConnector] Failed to start tauri-driver:', error.message);
    });

    // Log stderr for debugging
    driverProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        console.error('[tauri-driver]', message);
      }
    });

    return driverProcess;
  }

  /**
   * Wait for tauri-driver to be ready to accept connections.
   *
   * Polls the driver port until it responds or timeout is reached.
   *
   * @param port - The driver port to poll
   * @param timeout - Maximum time to wait in milliseconds
   */
  private async waitForDriver(port: number, timeout: number): Promise<void> {
    const startTime = Date.now();
    const url = `http://localhost:${port}/status`;

    while (Date.now() - startTime < timeout) {
      try {
        // Try to connect to the WebDriver status endpoint
        const response = await fetch(url);
        if (response.ok) {
          return;
        }
      } catch {
        // Connection refused or other error, keep polling
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL);
    }

    // Cleanup on timeout
    await this.killDriverProcess();
    throw new Error(
      `Timed out waiting for tauri-driver to be ready on port ${port} after ${timeout}ms`
    );
  }

  /**
   * Create a WebDriver session with tauri:options capability.
   *
   * @param port - The driver port
   * @param options - Launch options containing the binary path
   * @returns The WebDriver instance
   */
  private async createWebDriverSession(
    port: number,
    options: LaunchOptions
  ): Promise<WebDriver> {
    // Create capabilities properly for tauri-driver
    const capabilities = new Capabilities();
    capabilities.setBrowserName('wry');
    capabilities.set('tauri:options', {
      application: options.binary,
      ...(options.args && { args: options.args }),
      ...(options.env && { env: options.env }),
    });

    const driver = await new Builder()
      .usingServer(`http://localhost:${port}`)
      .withCapabilities(capabilities)
      .build();

    return driver;
  }

  /**
   * Clean up resources: quit WebDriver session and kill tauri-driver process.
   *
   * @param driver - The WebDriver instance to quit
   */
  private async cleanup(driver: WebDriver): Promise<void> {
    // Quit WebDriver session first
    try {
      await driver.quit();
    } catch (error) {
      console.error('[LinuxConnector] Error quitting WebDriver session:', error);
    }

    // Kill tauri-driver process
    await this.killDriverProcess();
  }

  /**
   * Kill the tauri-driver process and its children.
   */
  private async killDriverProcess(): Promise<void> {
    if (!this.driverProcess || this.driverProcess.pid === undefined) {
      return;
    }

    return new Promise<void>((resolve) => {
      treeKill(this.driverProcess!.pid!, 'SIGTERM', (error) => {
        if (error) {
          console.error('[LinuxConnector] Error killing tauri-driver:', error);
        }
        this.driverProcess = null;
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
