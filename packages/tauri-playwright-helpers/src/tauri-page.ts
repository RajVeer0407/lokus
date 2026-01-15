import type { Page } from 'playwright';
import { By, until, WebDriver, WebElement } from 'selenium-webdriver';
import type { PageLike, ClickOptions, WaitOptions, ScreenshotOptions } from './types.js';

/**
 * Default timeout in milliseconds for wait operations
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Convert Playwright-style selectors to WebDriver-compatible selectors.
 * Returns { strategy, value } for use with WebDriver.
 *
 * Supported Playwright selectors:
 * - `text=...` -> XPath contains text
 * - `button:has-text("...")` -> XPath button with text
 * - `:has-text("...")` -> XPath element with text
 * - CSS selectors (passed through)
 */
function translateSelector(selector: string): { by: typeof By; locator: ReturnType<typeof By.css> } {
  // Handle text= selector
  if (selector.startsWith('text=')) {
    const text = selector.slice(5);
    // XPath that finds elements containing the text
    return {
      by: By,
      locator: By.xpath(`//*[contains(text(), '${text}') or contains(., '${text}')]`),
    };
  }

  // Handle :has-text() pseudo-selector
  const hasTextMatch = selector.match(/^(.+?):has-text\("([^"]+)"\)$/);
  if (hasTextMatch) {
    const [, tagOrSelector, text] = hasTextMatch;
    const tag = tagOrSelector.trim() || '*';
    // For simple tags like 'button', 'div', etc.
    if (/^[a-zA-Z]+$/.test(tag)) {
      return {
        by: By,
        locator: By.xpath(`//${tag}[contains(text(), '${text}') or contains(., '${text}')]`),
      };
    }
    // For more complex selectors, fall back to CSS + JavaScript filtering
    // This is a simplified approach
    return {
      by: By,
      locator: By.xpath(`//*[contains(text(), '${text}') or contains(., '${text}')]`),
    };
  }

  // Handle comma-separated selectors (multiple selectors)
  if (selector.includes(',')) {
    // For WebDriver, we'll use CSS selector as-is and let it handle multiple
    // Note: This may not work perfectly for all cases
    return {
      by: By,
      locator: By.css(selector.split(',')[0].trim()), // Use first selector
    };
  }

  // Default: treat as CSS selector
  return {
    by: By,
    locator: By.css(selector),
  };
}

/**
 * Type guard to check if the inner page is a Playwright Page
 */
function isPlaywrightPage(inner: PageLike): inner is Page {
  return 'locator' in inner && typeof (inner as Page).locator === 'function';
}

/**
 * Type guard to check if the inner page is a Selenium WebDriver
 */
function isWebDriver(inner: PageLike): inner is WebDriver {
  return 'findElement' in inner && typeof (inner as WebDriver).findElement === 'function';
}

/**
 * TauriLocator - Playwright-like locator for element queries
 * Works with both Playwright and Selenium backends
 */
export class TauriLocator {
  private page: TauriPage;
  private selector: string;
  private nthIndex: number | null = null;

  constructor(page: TauriPage, selector: string) {
    this.page = page;
    this.selector = selector;
  }

  /**
   * Internal method to get the effective selector with nth-child handling
   */
  private getEffectiveSelector(): string {
    if (this.nthIndex === null) {
      return this.selector;
    }
    // For nth selectors, we'll handle in the methods that use elements
    return this.selector;
  }

  /**
   * Click the element
   */
  async click(options?: ClickOptions): Promise<void> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      const locator = inner.locator(this.selector);
      if (this.nthIndex !== null) {
        await locator.nth(this.nthIndex).click(options);
      } else {
        await locator.click(options);
      }
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      const { locator } = translateSelector(this.selector);
      const elements = await inner.findElements(locator);
      const index = this.nthIndex ?? 0;
      if (elements.length <= index) {
        throw new Error(`Element not found: ${this.selector} at index ${index}`);
      }
      const element = elements[index];

      if (options?.delay) {
        const actions = inner.actions({ async: true });
        await actions.move({ origin: element }).press().pause(options.delay).release().perform();
      } else {
        await element.click();
      }
    }
  }

  /**
   * Fill the element with a value (clears existing content first)
   */
  async fill(value: string): Promise<void> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      const locator = inner.locator(this.selector);
      if (this.nthIndex !== null) {
        await locator.nth(this.nthIndex).fill(value);
      } else {
        await locator.fill(value);
      }
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      const { locator } = translateSelector(this.selector);
      const elements = await inner.findElements(locator);
      const index = this.nthIndex ?? 0;
      if (elements.length <= index) {
        throw new Error(`Element not found: ${this.selector} at index ${index}`);
      }
      const element = elements[index];
      await element.clear();
      await element.sendKeys(value);
    }
  }

  /**
   * Get the inner text of the element
   */
  async innerText(): Promise<string> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      const locator = inner.locator(this.selector);
      if (this.nthIndex !== null) {
        return await locator.nth(this.nthIndex).innerText();
      }
      return await locator.innerText();
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      const { locator } = translateSelector(this.selector);
      const elements = await inner.findElements(locator);
      const index = this.nthIndex ?? 0;
      if (elements.length <= index) {
        throw new Error(`Element not found: ${this.selector} at index ${index}`);
      }
      const element = elements[index];
      return await element.getText();
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Get the text content of the element (includes hidden text)
   */
  async textContent(): Promise<string | null> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      const locator = inner.locator(this.selector);
      if (this.nthIndex !== null) {
        return await locator.nth(this.nthIndex).textContent();
      }
      return await locator.textContent();
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      const { locator } = translateSelector(this.selector);
      const elements = await inner.findElements(locator);
      const index = this.nthIndex ?? 0;
      if (elements.length <= index) {
        return null;
      }
      const element = elements[index];
      // Use JavaScript to get textContent which includes hidden text
      const driver = inner;
      return await driver.executeScript<string | null>(
        'return arguments[0].textContent',
        element
      );
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Check if the element is visible
   */
  async isVisible(): Promise<boolean> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      const locator = inner.locator(this.selector);
      if (this.nthIndex !== null) {
        return await locator.nth(this.nthIndex).isVisible();
      }
      return await locator.isVisible();
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      try {
        const { locator } = translateSelector(this.selector);
        const elements = await inner.findElements(locator);
        const index = this.nthIndex ?? 0;
        if (elements.length <= index) {
          return false;
        }
        const element = elements[index];
        return await element.isDisplayed();
      } catch {
        return false;
      }
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Count matching elements
   */
  async count(): Promise<number> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      return await inner.locator(this.selector).count();
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      const { locator } = translateSelector(this.selector);
      const elements = await inner.findElements(locator);
      return elements.length;
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Return a locator for the first matching element
   */
  first(): TauriLocator {
    return this.nth(0);
  }

  /**
   * Return a locator for the last matching element
   */
  last(): TauriLocator {
    const locator = new TauriLocator(this.page, this.selector);
    locator.nthIndex = -1; // Special marker for "last"
    return locator;
  }

  /**
   * Return a locator for the nth matching element
   */
  nth(index: number): TauriLocator {
    const locator = new TauriLocator(this.page, this.selector);
    locator.nthIndex = index;
    return locator;
  }

  /**
   * Internal: Get the resolved index for element arrays
   * Handles negative indices (like -1 for last)
   */
  private async resolveIndex(elements: WebElement[]): Promise<number> {
    if (this.nthIndex === null) {
      return 0;
    }
    if (this.nthIndex < 0) {
      return elements.length + this.nthIndex;
    }
    return this.nthIndex;
  }
}

/**
 * TauriPage - Unified wrapper providing Playwright-like API over both
 * Playwright Page and Selenium WebDriver backends
 */
export class TauriPage {
  private inner: PageLike;
  private mode: 'cdp' | 'webdriver';

  constructor(inner: PageLike, mode: 'cdp' | 'webdriver') {
    this.inner = inner;
    this.mode = mode;
  }

  /**
   * Get the underlying page implementation
   */
  getInner(): PageLike {
    return this.inner;
  }

  /**
   * Get the current mode
   */
  getMode(): 'cdp' | 'webdriver' {
    return this.mode;
  }

  /**
   * Navigate to a URL
   */
  async goto(url: string): Promise<void> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      await this.inner.goto(url);
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      await this.inner.get(url);
    }
  }

  /**
   * Click an element by selector
   */
  async click(selector: string, options?: ClickOptions): Promise<void> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      await this.inner.click(selector, options);
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
      const { locator } = translateSelector(selector);
      await this.inner.wait(until.elementLocated(locator), timeout);
      const element = await this.inner.findElement(locator);

      if (options?.delay) {
        const actions = this.inner.actions({ async: true });
        await actions.move({ origin: element }).press().pause(options.delay).release().perform();
      } else {
        await element.click();
      }
    }
  }

  /**
   * Fill an input element (clears existing content first)
   */
  async fill(selector: string, value: string): Promise<void> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      await this.inner.fill(selector, value);
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      const { locator } = translateSelector(selector);
      const element = await this.inner.findElement(locator);
      await element.clear();
      await element.sendKeys(value);
    }
  }

  /**
   * Type text into an element character by character
   */
  async type(selector: string, text: string, options?: { delay?: number }): Promise<void> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      await this.inner.type(selector, text, options);
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      const { locator } = translateSelector(selector);
      const element = await this.inner.findElement(locator);
      const delay = options?.delay ?? 0;

      if (delay > 0) {
        // Type character by character with delay
        for (const char of text) {
          await element.sendKeys(char);
          await this.waitForTimeout(delay);
        }
      } else {
        await element.sendKeys(text);
      }
    }
  }

  /**
   * Wait for an element matching the selector to appear
   */
  async waitForSelector(selector: string, options?: WaitOptions): Promise<void> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const state = options?.state ?? 'visible';

    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      await this.inner.waitForSelector(selector, { timeout, state });
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      const { locator } = translateSelector(selector);
      switch (state) {
        case 'attached':
          await this.inner.wait(until.elementLocated(locator), timeout);
          break;
        case 'detached':
          await this.inner.wait(until.stalenessOf(await this.inner.findElement(locator)), timeout);
          break;
        case 'visible':
          await this.inner.wait(until.elementLocated(locator), timeout);
          const element = await this.inner.findElement(locator);
          await this.inner.wait(until.elementIsVisible(element), timeout);
          break;
        case 'hidden':
          try {
            const el = await this.inner.findElement(locator);
            await this.inner.wait(until.elementIsNotVisible(el), timeout);
          } catch {
            // Element not found means it's hidden
          }
          break;
      }
    }
  }

  /**
   * Wait for a specified amount of time
   */
  async waitForTimeout(ms: number): Promise<void> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      await this.inner.waitForTimeout(ms);
    } else {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  /**
   * Create a locator for querying elements
   */
  locator(selector: string): TauriLocator {
    return new TauriLocator(this, selector);
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate<R>(fn: string | (() => R)): Promise<R>;
  async evaluate<R, Arg>(fn: string | ((arg: Arg) => R), arg: Arg): Promise<R>;
  async evaluate<R, Arg>(fn: string | ((arg?: Arg) => R), arg?: Arg): Promise<R> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      if (arg !== undefined) {
        // Use type assertion to work around Playwright's complex generic types
        return await (this.inner.evaluate as Function)(fn, arg);
      }
      return await (this.inner.evaluate as Function)(fn);
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      let script: string;
      if (typeof fn === 'string') {
        script = fn;
      } else {
        // Convert function to string and wrap it
        if (arg !== undefined) {
          script = `return (${fn.toString()})(arguments[0])`;
        } else {
          script = `return (${fn.toString()})()`;
        }
      }

      if (arg !== undefined) {
        return await this.inner.executeScript<R>(script, arg);
      }
      return await this.inner.executeScript<R>(script);
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Take a screenshot of the page
   */
  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      return await this.inner.screenshot(options);
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      const base64 = await this.inner.takeScreenshot();
      const buffer = Buffer.from(base64, 'base64');

      if (options?.path) {
        const fs = await import('node:fs/promises');
        await fs.writeFile(options.path, buffer);
      }

      return buffer;
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Get the page title
   */
  async title(): Promise<string> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      return await this.inner.title();
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      return await this.inner.getTitle();
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Get the current URL
   */
  async url(): Promise<string> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      return this.inner.url();
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      return await this.inner.getCurrentUrl();
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Get the full HTML content of the page
   */
  async content(): Promise<string> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      return await this.inner.content();
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      return await this.inner.getPageSource();
    }
    throw new Error('Invalid page mode');
  }

  /**
   * Inject a script into the page
   */
  async injectScript(script: string): Promise<void> {
    if (this.mode === 'cdp' && isPlaywrightPage(this.inner)) {
      await this.inner.addScriptTag({ content: script });
    } else if (this.mode === 'webdriver' && isWebDriver(this.inner)) {
      await this.inner.executeScript(script);
    }
  }

  /**
   * Keyboard interface for typing and key presses
   */
  get keyboard(): TauriKeyboard {
    return new TauriKeyboard(this);
  }
}

/**
 * TauriKeyboard - Keyboard interface for key presses
 */
export class TauriKeyboard {
  private page: TauriPage;

  constructor(page: TauriPage) {
    this.page = page;
  }

  /**
   * Press a key or key combination
   * @param key - Key to press (e.g., 'Enter', 'Control+k', 'Meta+a')
   */
  async press(key: string): Promise<void> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      await inner.keyboard.press(key);
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      const actions = inner.actions({ async: true });
      const { Key } = await import('selenium-webdriver');

      // Parse the key combination
      const parts = key.split('+');
      const modifiers: string[] = [];
      let mainKey = parts[parts.length - 1];

      for (let i = 0; i < parts.length - 1; i++) {
        modifiers.push(parts[i].toLowerCase());
      }

      // Map key names to Selenium keys
      const keyMap: Record<string, string> = {
        'enter': Key.ENTER,
        'escape': Key.ESCAPE,
        'tab': Key.TAB,
        'backspace': Key.BACK_SPACE,
        'delete': Key.DELETE,
        'arrowup': Key.ARROW_UP,
        'arrowdown': Key.ARROW_DOWN,
        'arrowleft': Key.ARROW_LEFT,
        'arrowright': Key.ARROW_RIGHT,
        'home': Key.HOME,
        'end': Key.END,
        'pageup': Key.PAGE_UP,
        'pagedown': Key.PAGE_DOWN,
        'space': Key.SPACE,
        'control': Key.CONTROL,
        'alt': Key.ALT,
        'shift': Key.SHIFT,
        'meta': Key.META,
      };

      // Press modifiers
      for (const mod of modifiers) {
        const modKey = keyMap[mod] || mod;
        await actions.keyDown(modKey);
      }

      // Press main key
      const resolvedKey = keyMap[mainKey.toLowerCase()] || mainKey;
      await actions.keyDown(resolvedKey).keyUp(resolvedKey);

      // Release modifiers in reverse order
      for (const mod of modifiers.reverse()) {
        const modKey = keyMap[mod] || mod;
        await actions.keyUp(modKey);
      }

      await actions.perform();
    }
  }

  /**
   * Type text character by character
   * @param text - Text to type
   * @param options - Optional delay between keystrokes
   */
  async type(text: string, options?: { delay?: number }): Promise<void> {
    const inner = this.page.getInner();
    const mode = this.page.getMode();

    if (mode === 'cdp' && isPlaywrightPage(inner)) {
      await inner.keyboard.type(text, options);
    } else if (mode === 'webdriver' && isWebDriver(inner)) {
      const delay = options?.delay ?? 0;
      const actions = inner.actions({ async: true });

      for (const char of text) {
        await actions.sendKeys(char).perform();
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }
}
