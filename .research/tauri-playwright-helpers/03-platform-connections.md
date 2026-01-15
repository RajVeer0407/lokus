# Platform Connection Research

## Windows: WebView2 + CDP

### How to Enable
Set environment variable before launching app:
```
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
```

Or in Tauri config:
```json
{
  "app": {
    "windows": [{
      "additionalBrowserArguments": "--remote-debugging-port=9222"
    }]
  }
}
```

### How to Connect
```javascript
// Playwright native CDP connection
const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = context.pages()[0];
```

### Status: FULLY COMPATIBLE WITH PLAYWRIGHT

---

## Linux: WebKitGTK + HTTP Inspector

### Key Discovery
WebKitGTK has TWO modes:
1. **DBus mode** (`inspector://`) - Requires WebKitGTK browser as client
2. **HTTP mode** (`WEBKIT_INSPECTOR_HTTP_SERVER`) - Works with Chromium!

### How to Enable
```bash
export WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9222
# App must have enable-developer-extras=true
./tauri-app
```

### How to Connect
The HTTP server exposes:
- `http://localhost:9222/` - List of targets (JSON)
- `http://localhost:9222/devtools/page/<id>` - Inspector UI
- `ws://localhost:9222/devtools/page/<id>` - WebSocket for protocol

### Protocol Difference
WebKitGTK uses **WebKit Inspector Protocol**, NOT CDP.
Need protocol adapter to translate.

### Status: NEEDS PROTOCOL ADAPTER

---

## macOS: WKWebView

### The Problem
- No remote debugging support built-in
- No environment variable to enable
- Safari Web Inspector requires manual pairing
- No WebDriver available (hence tauri-driver doesn't support it)

### Possible Workarounds
1. **Use Safari Technology Preview** with remote automation
2. **Build custom WKWebView wrapper** with debugging exposed
3. **Skip macOS in CI** (test Windows + Linux)

### Status: NOT FEASIBLE (without major custom work)

---

## Architecture Decision

Given the research:

### Windows
- Use Playwright's native `connectOverCDP()`
- Full Playwright API support
- No protocol translation needed

### Linux
- Build WebKit → CDP protocol adapter
- OR use tauri-driver + WebdriverIO wrapper with Playwright-like API
- Need to evaluate complexity vs. benefit

### macOS
- Frontend-only testing with mocks
- OR skip E2E on macOS
- Real E2E only on Windows/Linux

---

## Linux Deep Dive: Two Approaches

### Approach A: Protocol Adapter (Full Playwright)
```
Playwright ──CDP──▶ Adapter ──WebKit──▶ WebKitGTK
```

Pros:
- Keep Playwright tests unchanged
- Full Playwright API

Cons:
- Complex to build (see remotedebug-ios-webkit-adapter ~5000 lines)
- Must maintain as WebKit/CDP evolve

### Approach B: WebDriver Wrapper (Pragmatic)
```
Playwright-like API ──▶ WebDriver Client ──▶ tauri-driver ──▶ WebKitGTK
```

Pros:
- Uses existing tauri-driver
- Battle-tested WebDriver protocol

Cons:
- Need to wrap WebDriver in Playwright-like API
- Some Playwright features may not map

### Recommendation
Start with Approach B (WebDriver wrapper) because:
1. tauri-driver already exists and works
2. WebDriver is a standard, stable protocol
3. Can add Approach A later if needed
4. Get something working faster

---

## Environment Variables Summary

| Platform | Variable | Value |
|----------|----------|-------|
| Windows | `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` | `--remote-debugging-port=9222` |
| Linux | `WEBKIT_INSPECTOR_HTTP_SERVER` | `127.0.0.1:9222` |
| macOS | N/A | Not supported |

## Sources
- https://playwright.dev/docs/webview2
- https://people.igalia.com/aperez/Documentation/wpe-webkit/remote-inspector.html
- https://blogs.igalia.com/carlosgc/2017/05/03/webkitgtk-remote-debugging-in-2-18/
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code
