# tauri-playwright-helpers: Architecture Plan

## Project Vision

A library that enables true E2E testing of Tauri applications using Playwright-compatible APIs, with the ability to stub native features (dialogs, file system) that can't be automated directly.

## Core Design Principles

1. **Playwright API compatibility** - Tests written for Playwright should work with minimal changes
2. **Real app testing** - Connect to actual Tauri app, not dev server mocks
3. **Stub where needed** - Only mock what can't be automated (native dialogs)
4. **Community-first** - Open source, well documented, easy to contribute

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         tauri-playwright-helpers                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      User's Test Code                               │ │
│  │                                                                      │ │
│  │  import { tauri } from 'tauri-playwright-helpers';                  │ │
│  │  const app = await tauri.launch({ binary: './app' });               │ │
│  │  const page = await app.firstWindow();                              │ │
│  │  await app.stubCommand('plugin:dialog|open', { filePaths: [...] }); │ │
│  │  await page.click('button');                                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        TauriApp Class                               │ │
│  │  - launch(options)          - Platform detection                    │ │
│  │  - firstWindow()            - Stub management                       │ │
│  │  - stubCommand(cmd, resp)   - Window management                     │ │
│  │  - close()                                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                 ┌──────────────────┴──────────────────┐                  │
│                 │         Platform Router             │                  │
│                 └──────────────────┬──────────────────┘                  │
│                          ┌─────────┴─────────┐                           │
│                          │                   │                           │
│                          ▼                   ▼                           │
│  ┌───────────────────────────┐  ┌───────────────────────────┐           │
│  │    Windows Connector      │  │     Linux Connector       │           │
│  ├───────────────────────────┤  ├───────────────────────────┤           │
│  │ - Set CDP env var         │  │ - Start tauri-driver      │           │
│  │ - Launch app              │  │ - Launch app              │           │
│  │ - connectOverCDP()        │  │ - Connect WebDriver       │           │
│  │ - Return native Page      │  │ - Wrap in TauriPage       │           │
│  └───────────────────────────┘  └───────────────────────────┘           │
│                          │                   │                           │
│                          ▼                   ▼                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        TauriPage Class                              │ │
│  │  Unified API that wraps both Playwright Page and WebDriver          │ │
│  │                                                                      │ │
│  │  - click(selector)        - fill(selector, value)                   │ │
│  │  - locator(selector)      - waitForSelector(selector)               │ │
│  │  - keyboard               - mouse                                    │ │
│  │  - screenshot()           - evaluate(fn)                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     IPC Stub Injector                               │ │
│  │                                                                      │ │
│  │  Injects script that intercepts window.__TAURI_INTERNALS__.invoke  │ │
│  │  Returns stubbed responses for configured commands                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     Real Tauri Application                          │ │
│  │  - Debug build with remote debugging enabled                        │ │
│  │  - Real Rust backend running                                        │ │
│  │  - Real IPC for non-stubbed commands                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
tauri-playwright-helpers/
├── packages/
│   └── core/
│       ├── src/
│       │   ├── index.ts              # Main exports
│       │   ├── launcher.ts           # Platform detection & launch
│       │   ├── tauri-app.ts          # TauriApp class
│       │   ├── tauri-page.ts         # Unified Page wrapper
│       │   ├── tauri-locator.ts      # Locator wrapper
│       │   ├── stub-manager.ts       # IPC stubbing logic
│       │   │
│       │   ├── connectors/
│       │   │   ├── index.ts          # Connector interface
│       │   │   ├── windows.ts        # Windows CDP connector
│       │   │   └── linux.ts          # Linux WebDriver connector
│       │   │
│       │   ├── webdriver/
│       │   │   ├── client.ts         # WebDriver client wrapper
│       │   │   ├── commands.ts       # WebDriver command impl
│       │   │   └── types.ts          # WebDriver types
│       │   │
│       │   └── scripts/
│       │       └── ipc-interceptor.ts # Injected stub script
│       │
│       ├── package.json
│       └── tsconfig.json
│
├── examples/
│   └── basic-app/                    # Example Tauri app for testing
│
├── tests/                            # Library tests
├── docs/                             # Documentation
├── .github/
│   └── workflows/
│       └── ci.yml                    # CI for the library itself
│
├── package.json                      # Monorepo root
├── pnpm-workspace.yaml
└── README.md
```

---

## Core Components

### 1. Launcher (`launcher.ts`)

```typescript
export interface LaunchOptions {
  /** Path to Tauri binary (debug build) */
  binary: string;
  /** Arguments to pass to the app */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout for app startup (ms) */
  timeout?: number;
  /** Port for debugging connection */
  debugPort?: number;
}

export async function launch(options: LaunchOptions): Promise<TauriApp> {
  const platform = process.platform;
  const connector = getConnector(platform);
  return connector.launch(options);
}
```

### 2. Windows Connector (`connectors/windows.ts`)

```typescript
export class WindowsConnector implements Connector {
  async launch(options: LaunchOptions): Promise<TauriApp> {
    const port = options.debugPort || 9222;

    // Set CDP environment variable
    const env = {
      ...process.env,
      ...options.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    };

    // Launch the app
    const proc = spawn(options.binary, options.args || [], { env });

    // Wait for CDP to be available
    await this.waitForCdp(port, options.timeout);

    // Connect Playwright via CDP
    const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
    const context = browser.contexts()[0];
    const page = await this.waitForPage(context);

    return new TauriApp({
      process: proc,
      page: new TauriPage(page, 'cdp'),
      connector: this,
    });
  }

  private async waitForCdp(port: number, timeout = 30000): Promise<void> {
    // Poll http://localhost:{port}/json until available
  }

  private async waitForPage(context: BrowserContext): Promise<Page> {
    // Wait for first page or create new one
  }
}
```

### 3. Linux Connector (`connectors/linux.ts`)

```typescript
export class LinuxConnector implements Connector {
  private driverProcess: ChildProcess | null = null;

  async launch(options: LaunchOptions): Promise<TauriApp> {
    const driverPort = 4444;
    const nativePort = 4445;

    // Start tauri-driver
    this.driverProcess = spawn('tauri-driver', [
      '--port', String(driverPort),
      '--native-port', String(nativePort),
    ]);

    await this.waitForDriver(driverPort);

    // Create WebDriver session
    const driver = await new Builder()
      .usingServer(`http://localhost:${driverPort}`)
      .withCapabilities({
        'tauri:options': {
          application: options.binary,
        },
      })
      .build();

    // Wrap in TauriPage
    const page = new TauriPage(driver, 'webdriver');

    return new TauriApp({
      process: null, // WebDriver manages the app
      page,
      connector: this,
      cleanup: () => this.cleanup(driver),
    });
  }

  private async cleanup(driver: WebDriver): Promise<void> {
    await driver.quit();
    this.driverProcess?.kill();
  }
}
```

### 4. TauriPage (`tauri-page.ts`)

```typescript
export class TauriPage {
  private inner: Page | WebDriver;
  private mode: 'cdp' | 'webdriver';
  private stubManager: StubManager;

  constructor(inner: Page | WebDriver, mode: 'cdp' | 'webdriver') {
    this.inner = inner;
    this.mode = mode;
    this.stubManager = new StubManager(this);
  }

  // Playwright-compatible API

  async click(selector: string, options?: ClickOptions): Promise<void> {
    if (this.mode === 'cdp') {
      await (this.inner as Page).click(selector, options);
    } else {
      const element = await this.findElement(selector);
      await element.click();
    }
  }

  async fill(selector: string, value: string): Promise<void> {
    if (this.mode === 'cdp') {
      await (this.inner as Page).fill(selector, value);
    } else {
      const element = await this.findElement(selector);
      await element.clear();
      await element.sendKeys(value);
    }
  }

  locator(selector: string): TauriLocator {
    return new TauriLocator(this, selector);
  }

  async waitForSelector(selector: string, options?: WaitOptions): Promise<void> {
    if (this.mode === 'cdp') {
      await (this.inner as Page).waitForSelector(selector, options);
    } else {
      const timeout = options?.timeout || 30000;
      await (this.inner as WebDriver).wait(
        until.elementLocated(By.css(selector)),
        timeout
      );
    }
  }

  async evaluate<R>(fn: () => R): Promise<R>;
  async evaluate<R, Arg>(fn: (arg: Arg) => R, arg: Arg): Promise<R>;
  async evaluate<R>(fn: Function, arg?: any): Promise<R> {
    if (this.mode === 'cdp') {
      return (this.inner as Page).evaluate(fn as any, arg);
    } else {
      const script = arg !== undefined
        ? `return (${fn.toString()})(${JSON.stringify(arg)})`
        : `return (${fn.toString()})()`;
      return (this.inner as WebDriver).executeScript(script);
    }
  }

  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    if (this.mode === 'cdp') {
      return (this.inner as Page).screenshot(options);
    } else {
      const base64 = await (this.inner as WebDriver).takeScreenshot();
      const buffer = Buffer.from(base64, 'base64');
      if (options?.path) {
        await fs.writeFile(options.path, buffer);
      }
      return buffer;
    }
  }

  // Keyboard and mouse

  get keyboard(): TauriKeyboard {
    return new TauriKeyboard(this);
  }

  get mouse(): TauriMouse {
    return new TauriMouse(this);
  }

  // Internal methods

  private async findElement(selector: string): Promise<WebElement> {
    return (this.inner as WebDriver).findElement(By.css(selector));
  }

  async injectScript(script: string): Promise<void> {
    await this.evaluate((s) => {
      const scriptEl = document.createElement('script');
      scriptEl.textContent = s;
      document.head.appendChild(scriptEl);
    }, script);
  }
}
```

### 5. IPC Stub Manager (`stub-manager.ts`)

```typescript
export class StubManager {
  private page: TauriPage;
  private stubs: Map<string, StubValue> = new Map();
  private injected = false;

  constructor(page: TauriPage) {
    this.page = page;
  }

  async stub(command: string, response: StubValue): Promise<void> {
    this.stubs.set(command, response);
    await this.syncStubs();
  }

  async clear(command?: string): Promise<void> {
    if (command) {
      this.stubs.delete(command);
    } else {
      this.stubs.clear();
    }
    await this.syncStubs();
  }

  private async syncStubs(): Promise<void> {
    if (!this.injected) {
      await this.injectInterceptor();
      this.injected = true;
    }

    const stubsObj = Object.fromEntries(this.stubs);
    await this.page.evaluate((stubs) => {
      (window as any).__TAURI_TEST_STUBS__ = stubs;
    }, stubsObj);
  }

  private async injectInterceptor(): Promise<void> {
    await this.page.evaluate(() => {
      // Store original
      const internals = (window as any).__TAURI_INTERNALS__;
      if (!internals) return;

      const originalInvoke = internals.invoke;
      const stubs: Record<string, any> = {};
      (window as any).__TAURI_TEST_STUBS__ = stubs;

      // Override invoke
      internals.invoke = async (cmd: string, args: any) => {
        const stub = stubs[cmd];
        if (stub !== undefined) {
          console.log(`[tauri-test] Stubbed: ${cmd}`, args);
          if (typeof stub === 'function') return stub(args);
          if (stub instanceof Error) throw stub;
          return stub;
        }
        return originalInvoke.call(internals, cmd, args);
      };

      console.log('[tauri-test] IPC interceptor installed');
    });
  }
}

type StubValue = any | ((args: any) => any) | Error;
```

---

## API Reference

### `tauri.launch(options)`

```typescript
const app = await tauri.launch({
  binary: './target/debug/my-app',
  args: ['--some-flag'],
  env: { TEST_MODE: 'true' },
  timeout: 30000,
  debugPort: 9222,
});
```

### `app.firstWindow()`

```typescript
const page = await app.firstWindow();
```

### `app.stubCommand(command, response)`

```typescript
// Stub dialog to return specific files
await app.stubCommand('plugin:dialog|open', {
  filePaths: ['/test/workspace']
});

// Stub with function for dynamic responses
await app.stubCommand('plugin:fs|read_text_file', (args) => {
  return `Contents of ${args.path}`;
});

// Stub to throw error
await app.stubCommand('plugin:fs|write_file', new Error('Permission denied'));
```

### `app.clearStubs()`

```typescript
await app.clearStubs(); // Clear all
await app.clearStubs('plugin:dialog|open'); // Clear specific
```

### `page` (Playwright-compatible)

```typescript
await page.click('button');
await page.fill('input', 'text');
await page.locator('.item').click();
await page.waitForSelector('.loaded');
await page.screenshot({ path: 'test.png' });
await page.keyboard.press('Enter');
await page.evaluate(() => document.title);
```

---

## Implementation Phases

### Phase 1: MVP (4-6 weeks)
- [ ] Windows CDP connector
- [ ] Linux WebDriver connector
- [ ] Basic TauriPage API (click, fill, locator, waitForSelector)
- [ ] IPC stub injection
- [ ] Basic documentation

### Phase 2: Full API (3-4 weeks)
- [ ] Complete Playwright Page API coverage
- [ ] TauriLocator with assertions
- [ ] Keyboard and mouse APIs
- [ ] Screenshot/video
- [ ] Multi-window support

### Phase 3: Polish (2-3 weeks)
- [ ] Error messages and debugging
- [ ] Performance optimization
- [ ] CI/CD examples
- [ ] Comprehensive docs
- [ ] Example projects

### Phase 4: Ecosystem (Ongoing)
- [ ] Playwright Test integration
- [ ] GitHub Action
- [ ] VS Code extension
- [ ] Community contributions

---

## Open Questions

1. **WebDriver library choice**: Use `selenium-webdriver` or `webdriverio`?
   - selenium-webdriver is more established
   - webdriverio has better async/await support

2. **Protocol adapter later?**: Should we plan for adding a WebKit→CDP adapter?
   - Would enable full Playwright on Linux
   - Significant complexity

3. **macOS strategy**:
   - Skip macOS entirely?
   - Frontend-only tests on macOS?
   - Investigate Safari WebDriver?

4. **Monorepo vs single package**:
   - Start simple with single package
   - Split later if needed (e.g., separate WebDriver wrapper)

---

## Success Criteria

1. **Works on Windows + Linux** with Tauri v2
2. **Playwright-compatible API** for common operations
3. **IPC stubbing** for dialogs and native features
4. **Good documentation** with examples
5. **CI-ready** with GitHub Actions examples
6. **Active community** adoption
