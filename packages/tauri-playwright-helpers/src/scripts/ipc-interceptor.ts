/**
 * IPC Interceptor Script
 *
 * This module exports a function that returns a script string for injection
 * into a Tauri webview. The script intercepts Tauri IPC calls and allows
 * them to be stubbed for testing purposes.
 */

/**
 * Returns the interceptor script to inject into the Tauri webview.
 *
 * The script:
 * 1. Saves the original `window.__TAURI_INTERNALS__.invoke` function
 * 2. Creates `window.__TAURI_TEST_STUBS__` object for stub storage
 * 3. Overrides invoke to check stubs before calling the original
 * 4. Handles stub functions, errors (via __isError__ marker), and static values
 * 5. Logs stubbed calls to console for debugging
 *
 * @returns The interceptor script as a string
 */
export function getInterceptorScript(): string {
  return `
(function() {
  // Bail out if already initialized
  if (window.__TAURI_TEST_INTERCEPTOR_INSTALLED__) {
    return;
  }

  // Ensure __TAURI_INTERNALS__ exists (it should in a Tauri app)
  if (!window.__TAURI_INTERNALS__) {
    console.warn('[tauri-test] window.__TAURI_INTERNALS__ not found. IPC interceptor not installed.');
    return;
  }

  // Save original invoke function
  const originalInvoke = window.__TAURI_INTERNALS__.invoke;

  // Initialize stub storage
  window.__TAURI_TEST_STUBS__ = window.__TAURI_TEST_STUBS__ || {};

  // Override invoke with our interceptor
  window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
    const stub = window.__TAURI_TEST_STUBS__[cmd];

    // Check if we have a stub for this command
    if (stub !== undefined) {
      console.log('[tauri-test] Stubbed IPC call:', cmd, args);

      // Handle function stubs
      if (typeof stub === 'function') {
        try {
          const result = await stub(args);
          console.log('[tauri-test] Stub function returned:', result);
          return result;
        } catch (error) {
          console.log('[tauri-test] Stub function threw:', error);
          throw error;
        }
      }

      // Handle error stubs (serialized as { __isError__: true, message: '...' })
      if (stub && typeof stub === 'object' && stub.__isError__) {
        const error = new Error(stub.message);
        console.log('[tauri-test] Stub throwing error:', error.message);
        throw error;
      }

      // Handle static value stubs
      console.log('[tauri-test] Stub returning static value:', stub);
      return stub;
    }

    // No stub found, call original invoke
    return originalInvoke.call(window.__TAURI_INTERNALS__, cmd, args);
  };

  // Mark as installed to prevent double-initialization
  window.__TAURI_TEST_INTERCEPTOR_INSTALLED__ = true;

  console.log('[tauri-test] IPC interceptor installed');
})();
`.trim();
}
