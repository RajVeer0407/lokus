# tauri-playwright-helpers

E2E testing helpers for Tauri applications with Playwright-compatible API.

## Features

- **Real App Testing** - Connect to actual Tauri applications, not mocked dev servers
- **Playwright-like API** - Familiar API for interaction (`click`, `fill`, `locator`, etc.)
- **IPC Stubbing** - Mock native features like dialogs and file system operations
- **Cross-Platform** - Works on Windows (via CDP) and Linux (via WebDriver)

## Installation

```bash
npm install tauri-playwright-helpers
# or
pnpm add tauri-playwright-helpers
```

### Prerequisites

- **Windows**: No additional setup required (uses WebView2 CDP)
- **Linux**: Install `tauri-driver`:
  ```bash
  cargo install tauri-driver
  ```

## Quick Start

```typescript
import { tauri } from 'tauri-playwright-helpers';

// Launch your Tauri app
const app = await tauri.launch({
  binary: './target/debug/my-app',
});

// Get the main window
const page = await app.firstWindow();

// Stub a dialog command (for testing file operations)
await app.stubCommand('plugin:dialog|open', {
  filePaths: ['/test/workspace']
});

// Interact with the app
await page.click('button:has-text("Open Workspace")');
await page.waitForSelector('.file-tree');

// Clean up
await app.close();
```

## API Reference

### `tauri.launch(options)`

Launch a Tauri application for testing.

```typescript
interface LaunchOptions {
  binary: string;        // Path to Tauri binary (debug build)
  args?: string[];       // Arguments to pass to the app
  env?: Record<string, string>;  // Environment variables
  timeout?: number;      // Startup timeout in ms (default: 30000)
  debugPort?: number;    // Debug port (default: 9222 for Windows, 4444 for Linux)
}

const app = await tauri.launch({
  binary: './target/debug/my-app',
  timeout: 30000,
});
```

### `TauriApp`

The main application instance.

```typescript
// Get the main window
const page = await app.firstWindow();

// Stub IPC commands
await app.stubCommand('plugin:dialog|open', { filePaths: ['/path'] });
await app.stubCommand('plugin:fs|read_file', new Error('Not found'));
await app.stubCommand('plugin:dialog|confirm', (args) => args.title.includes('OK'));

// Clear stubs
await app.clearStubs('plugin:dialog|open');  // Clear specific
await app.clearStubs();                       // Clear all

// Check stub status
app.isStubbed('plugin:dialog|open');  // true/false
app.getStubbedCommands();             // ['plugin:dialog|open', ...]

// Close the app
await app.close();
```

### `TauriPage`

Playwright-compatible page API.

```typescript
// Navigation and interaction
await page.goto('http://localhost:1420');
await page.click('button');
await page.fill('input', 'text');
await page.type('input', 'text', { delay: 100 });

// Waiting
await page.waitForSelector('.element');
await page.waitForSelector('.element', { state: 'hidden' });
await page.waitForTimeout(1000);

// Locators
const button = page.locator('button.submit');
await button.click();
await button.fill('text');
const text = await button.innerText();
const visible = await button.isVisible();
const count = await button.count();

// Chaining
await page.locator('.item').first().click();
await page.locator('.item').nth(2).click();
await page.locator('.item').last().click();

// Evaluation
const title = await page.evaluate(() => document.title);
const result = await page.evaluate((x) => x * 2, 21);

// Screenshots
const buffer = await page.screenshot();
await page.screenshot({ path: 'screenshot.png' });

// Page info
await page.title();
await page.url();
await page.content();
```

## Common Stub Commands

| Command | Description |
|---------|-------------|
| `plugin:dialog\|open` | File open dialog |
| `plugin:dialog\|save` | File save dialog |
| `plugin:dialog\|confirm` | Confirmation dialog |
| `plugin:dialog\|message` | Message dialog |
| `plugin:fs\|read_file` | Read file contents |
| `plugin:fs\|write_file` | Write file contents |
| `plugin:fs\|exists` | Check if path exists |
| `plugin:shell\|execute` | Execute shell command |

## Platform Support

| Platform | Backend | Status |
|----------|---------|--------|
| Windows | CDP (WebView2) | Supported |
| Linux | WebDriver (tauri-driver) | Supported |
| macOS | - | Not supported |

macOS is not supported because WKWebView does not expose a remote debugging interface.

## Using with Test Frameworks

### Playwright Test

```typescript
import { test, expect } from '@playwright/test';
import { tauri } from 'tauri-playwright-helpers';

test.describe('My App', () => {
  let app;
  let page;

  test.beforeAll(async () => {
    app = await tauri.launch({ binary: './target/debug/my-app' });
    page = await app.firstWindow();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('should open workspace', async () => {
    await app.stubCommand('plugin:dialog|open', {
      filePaths: ['/test/workspace']
    });

    await page.click('button:has-text("Open")');
    await expect(page.locator('.file-tree')).toBeVisible();
  });
});
```

### Vitest

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { tauri } from 'tauri-playwright-helpers';

describe('My App', () => {
  let app;
  let page;

  beforeAll(async () => {
    app = await tauri.launch({ binary: './target/debug/my-app' });
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should open workspace', async () => {
    await app.stubCommand('plugin:dialog|open', {
      filePaths: ['/test/workspace']
    });

    await page.click('button:has-text("Open")');
    expect(await page.locator('.file-tree').isVisible()).toBe(true);
  });
});
```

## CI Configuration

### GitHub Actions (Linux)

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y webkit2gtk-4.1 webkit2gtk-driver
          cargo install tauri-driver

      - name: Build app
        run: cargo tauri build --debug

      - name: Run E2E tests
        uses: coactions/setup-xvfb@v1
        with:
          run: npm run test:e2e
```

### GitHub Actions (Windows)

```yaml
jobs:
  e2e:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build app
        run: cargo tauri build --debug

      - name: Run E2E tests
        run: npm run test:e2e
```

## License

MIT
