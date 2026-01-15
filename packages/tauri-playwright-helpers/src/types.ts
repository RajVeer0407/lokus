import type { Page, BrowserContext, Browser } from 'playwright';
import type { WebDriver, WebElement } from 'selenium-webdriver';
import type { ChildProcess } from 'node:child_process';

/**
 * Options for launching a Tauri application
 */
export interface LaunchOptions {
  /** Path to the Tauri binary (debug build recommended) */
  binary: string;
  /** Arguments to pass to the application */
  args?: string[];
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds for app startup (default: 30000) */
  timeout?: number;
  /** Port for debugging connection (default: 9222 for Windows, 4444 for Linux) */
  debugPort?: number;
}

/**
 * Options for clicking an element
 */
export interface ClickOptions {
  /** Number of clicks (default: 1) */
  clickCount?: number;
  /** Time to wait between mousedown and mouseup in ms */
  delay?: number;
  /** Mouse button: 'left', 'right', or 'middle' */
  button?: 'left' | 'right' | 'middle';
  /** Modifier keys to press during click */
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
  /** Position relative to element's padding box */
  position?: { x: number; y: number };
  /** Maximum time to wait in ms (default: 30000) */
  timeout?: number;
  /** Whether to bypass actionability checks */
  force?: boolean;
}

/**
 * Options for waiting operations
 */
export interface WaitOptions {
  /** Maximum time to wait in ms (default: 30000) */
  timeout?: number;
  /** Wait for element to be visible, hidden, attached, or detached */
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
}

/**
 * Options for taking screenshots
 */
export interface ScreenshotOptions {
  /** Path to save the screenshot */
  path?: string;
  /** Screenshot type: 'png' or 'jpeg' */
  type?: 'png' | 'jpeg';
  /** Quality for jpeg (0-100) */
  quality?: number;
  /** Capture full page or just viewport */
  fullPage?: boolean;
}

/**
 * Value for stubbing a Tauri command
 * Can be:
 * - A static value to return
 * - A function that receives args and returns a value
 * - An Error to throw
 */
export type StubValue = unknown | ((args: unknown) => unknown | Promise<unknown>) | Error;

/**
 * Internal connection info for TauriApp
 */
export interface ConnectionInfo {
  /** The spawned app process (if applicable) */
  process: ChildProcess | null;
  /** Cleanup function to call on close */
  cleanup?: () => Promise<void>;
  /** Connection mode */
  mode: 'cdp' | 'webdriver';
}

/**
 * Connector interface for platform-specific implementations
 */
export interface Connector {
  /** Launch the Tauri application and return connection info */
  launch(options: LaunchOptions): Promise<{
    connectionInfo: ConnectionInfo;
    page: PageLike;
  }>;
}

/**
 * Union type for underlying page implementations
 */
export type PageLike = Page | WebDriver;

/**
 * Union type for underlying element implementations
 */
export type ElementLike = ReturnType<Page['locator']> | WebElement;

/**
 * Result from the CDP /json/list endpoint
 */
export interface CDPTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl?: string;
}
