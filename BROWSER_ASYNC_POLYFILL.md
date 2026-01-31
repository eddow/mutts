# Async Hooks (Browser)

**Status (Jan 2026)**: Browsers (Chrome/V8, Firefox) lack a native public API for `AsyncContext` or `Zone` propagation. To support zones in the browser, `mutts` implements a complex polyfill in `src/async/browser.ts`.

## The "Sticky Promise" Problem

To propagate context across `await` points, the polyfill relies on **"Sticky Promises"**.
*   **Mechanism**: When a Promise is created, we capture the current Zone context and attach it to the Promise instance.
*   **Propagation**: When `.then()` is called (or `await` resumes), we restore that captured context.

This creates a dilemma:
1.  **Inside the Zone**: This is perfect. `await` resumes in the correct zone.
2.  **Leaving the Zone**: If `zone.with(() => { return someInnerPromise })` returns that sticky Promise to the outer world, the outer code will *inherit* the inner zone context when it awaits that Promise. This causes **Context Leaks**.

## The Solution: Return Value Sanitization

In `src/zone.ts`, we implement a "Hack" to prevent this leak:

```typescript
// inside AZone.with
if (res && typeof (res as any).then === 'function') {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            (res as any).then(resolve, reject)
        }, 0)
    })
}
```

*   **What it does**: It intercepts any Promise returning from the zone and resolves a *new* Promise using `setTimeout`.
*   **Why**: This forces the resolution to happen in a **Macrotask**. This breaks the native Microtask chain, preventing the outer code from inheriting the inner Zone's context via V8's native Promise chaining optimization.
*   **Result**: The outer Promise captures the *outer* context (undefined/root). The boundary is sealed.

## Known Limitations & Nuances
1.  **Triple Microtask Deferral**: In `src/async/browser.ts`, the `undo` operation (restoring context) is deferred by 3 microtasks. This is to ensure it runs *after* native Promise resolution reactions, preventing race conditions where context is cleared too early.
2.  **Recursion Guard**: We patch global `Promise`. To prevent infinite recursion if patched multiple times (e.g. extensively in tests), we cache originals using `Symbol.for('mutts.originals')`.

**Future Outlook**: This entire polyfill should be deleted when the [TC39 Async Context](https://github.com/tc39/proposal-async-context) proposal lands in browsers.
