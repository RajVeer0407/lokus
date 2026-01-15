# Tauri IPC Internals Research

## How Tauri IPC Works

### Entry Point
```javascript
window.__TAURI_INTERNALS__.invoke(cmd, args)
```

This is wrapped by `@tauri-apps/api/core` as `invoke()`.

### Transport Mechanisms

1. **Primary: Custom Protocol** (`ipc://`)
   - Uses Fetch API to send to `ipc://localhost/<cmd>`
   - Faster, more reliable

2. **Fallback: postMessage**
   - Uses `window.postMessage()` with structured data
   - For CSP/CORS restricted environments

### Message Structure
```javascript
{
  cmd: "command_name",
  callback: 123,        // Success callback ID
  error: 124,           // Error callback ID
  payload: { ... },     // Arguments
  invoke_key: "..."     // Security token
}
```

### Callback System
- Each invoke creates unique callback IDs
- Callbacks stored in `Map<number, (data) => void>`
- Response triggers callback execution

### Security: Invoke Key
- Random string generated at app startup
- Must be included in every IPC message
- Prevents unauthorized IPC from injected scripts

## Interception Points for Testing

### 1. Override `__TAURI_INTERNALS__.invoke` (Recommended)
```javascript
const original = window.__TAURI_INTERNALS__.invoke;
window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
  if (stubs[cmd]) return stubs[cmd];
  return original(cmd, args);
};
```

### 2. Use Tauri's Built-in Mocking
```javascript
import { mockIPC } from '@tauri-apps/api/mocks';

mockIPC((cmd, args) => {
  if (cmd === 'plugin:dialog|open') {
    return { filePaths: ['/test/path'] };
  }
});
```

### 3. Monkey-patch at Protocol Level
Could intercept the Fetch call to `ipc://localhost/*`

## Plugin Command Format

Plugins use special command format:
```
plugin:<plugin_name>|<command>
```

Examples:
- `plugin:dialog|open` - Open file dialog
- `plugin:fs|read_file` - Read file
- `plugin:shell|execute` - Execute command

## Key Files in Tauri Source

- `crates/tauri/src/ipc/protocol.rs` - Rust IPC handling
- `crates/tauri/scripts/core.js` - JS initialization
- `crates/tauri/scripts/ipc-protocol.js` - JS protocol impl
- `packages/api/src/core.ts` - TypeScript API

## What This Means for Our Library

1. **Easy to intercept** - Just override `__TAURI_INTERNALS__.invoke`
2. **Plugin format known** - Can stub specific plugin commands
3. **Works same on all platforms** - JS layer is consistent
4. **Invoke key issue** - Need to preserve it for real calls

### Stub Implementation Strategy
```javascript
(function() {
  const stubs = {};
  const original = window.__TAURI_INTERNALS__.invoke;

  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    const stub = stubs[cmd];
    if (stub !== undefined) {
      console.log(`[stub] ${cmd}`, args);
      return typeof stub === 'function' ? stub(args) : stub;
    }
    return original(cmd, args);
  };

  // API for test framework to set stubs
  window.__TAURI_TEST_STUBS__ = stubs;
})();
```

## Sources
- https://v2.tauri.app/concept/inter-process-communication/
- https://v2.tauri.app/develop/tests/mocking/
- https://github.com/tauri-apps/tauri (source code)
