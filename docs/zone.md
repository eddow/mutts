# Zones (`mutts/zone`)

Zones provide a high-performance **context management system** that follows the execution flow, ensuring your variables "stay put" even across asynchronous boundaries like `Promises`, `setTimeout`, or `queueMicrotask`.

## Basic Usage

A `Zone` represents a piece of storage that is scoped to the current execution block.

```typescript
import { Zone } from 'mutts/zone';

const myZone = new Zone<string>();

myZone.with("context-value", () => {
    // Inside this function, the zone is active
    console.log(myZone.active); // "context-value"
});

console.log(myZone.active); // undefined
```

## Async Propagation

By default, zones are lost when an async operation yields control (e.g., after `await`). To fix this, `mutts` provides `configureAsyncZone()`.

```typescript
import { configureAsyncZone, asyncZone, Zone } from 'mutts/zone';

const requestId = new Zone<string>();

// 1. Tell the global aggregator to track this zone
asyncZone.add(requestId);

// 2. Patch global async primitives (once per app)
configureAsyncZone();

// 3. Usage
requestId.with("req-123", async () => {
    await somePromise();
    // Context is automatically preserved across await!
    console.log(requestId.active); // "req-123"
});
```

## Core API

### `AZone<T>` (Abstract)
The base class for all zone implementations.
- `active: T | undefined`: The current value in the zone.
- `with<R>(value: T, fn: () => R): R`: Executes `fn` with `value` set as active.
- `root<R>(fn: () => R): R`: Executes `fn` with the zone cleared (undefined).
- `zoned: FunctionWrapper`: A getter that returns a function which, when called, restores the zone to its **current** state.

### `Zone<T>`
Simple stack-based storage.

### `ZoneHistory<T>`
A zone wrapper that maintains a `history` of previously active values in the current stack. 
- Useful for **Cycle Detection**.
- Prevents re-entering the same value if already in the history.
- `present: AZone<T>`: Access the current value without the history overhead.

### `ZoneAggregator`
Combines multiple zones into one.
- Entering an aggregator (with `.with()`) enters all its member zones.
- `asyncZone` is a global aggregator used for the async patches.

## Manual Context Bridging

If you are using an API that `mutts` doesn't automatically patch, you can use the `.zoned` capture mechanism:

```typescript
const wrap = myZone.zoned; // Snapshot the current context

// Pass the wrapper to an unmanaged callback
externalLib.on('event', () => {
    wrap(() => {
        console.log("Context is back:", myZone.active);
    });
});
```

## Integration with Reactivity

The `mutts` reactivity system uses zones internally to track the `activeEffect`. 
- Every `effect()` execution runs inside the `effectHistory` zone.
- Circular dependency detection is powered by `ZoneHistory`.
- Async effects survive `await` because `effectHistory` is a member of the global `asyncZone`.
