# Browser Async Polyfill

## Problem

In the browser, JavaScript's `Promise` implementation carries "sticky" context through its prototype chain. When a Promise is created inside a zone (e.g., with `asyncZone`), it inherits the zone's context. If this Promise is then returned to an outer scope, the zone context "leaks" - it remains attached to the Promise even after execution has left the zone.

## Solution

To prevent context leakage, mutts implements a **sanitization** mechanism for the browser environment:

### 1. Promise Sanitization

The `asyncHooks.sanitizePromise` function wraps any Promise returned from a zone in a new Promise created in the outer scope:

```typescript
asyncHooks.sanitizePromise = (res: any) => {
  if (res && typeof (res as any).then === 'function') {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        (res as any).then(resolve, reject)
      }, 0)
    })
  }
  return res
}
```

This breaks the sticky context chain by:
1. Creating a new Promise in the current (outer) scope
2. Using `setTimeout` to defer the resolution
3. The new Promise has no zone context from the inner scope

### 2. Promise Patching

The browser polyfill patches the global `Promise` constructor and its prototype methods (`then`, `catch`, `finally`) to capture and propagate zone context correctly through the Promise chain.

### 3. Scheduler Freezing

When the reactive system enters a broken state (unrecoverable error), all async schedulers are frozen to prevent further execution:

- `setTimeout` / `clearTimeout`
- `setInterval` / `clearInterval`
- `setImmediate` / `clearImmediate` (if available)
- `requestAnimationFrame` / `cancelAnimationFrame` (if available)
- `queueMicrotask` (if available)

This is a safety mechanism to prevent cascading errors while still allowing DOM event inspection.

## Why This is Necessary

### Node.js vs Browser

- **Node.js**: Uses `async_hooks` API which provides proper async context tracking without sticky Promise issues
- **Browser**: No native async context API, so mutts must implement its own mechanism using Promise prototype patching

### The "Sticky" Problem

```typescript
// Without sanitization:
asyncZone.with('inner-zone', async () => {
  const promise = Promise.resolve('data')
  return promise // This promise carries 'inner-zone' context
})
// In outer scope, the promise still thinks it's in 'inner-zone'

// With sanitization:
asyncZone.with('inner-zone', async () => {
  const promise = Promise.resolve('data')
  return sanitizePromise(promise) // Returns new promise without 'inner-zone' context
})
// In outer scope, the promise has no zone context
```

## Implementation Notes

- The polyfill is only applied in the browser environment
- Original functions are stored and can be restored
- The polyfill is idempotent - applying it multiple times is safe
- Symbol.species is overridden to return the patched Promise constructor
