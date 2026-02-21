# Mutts Library Documentation

## Overview
`mutts` is the foundational utility library for Anarkai, providing a reactivity system, decorator unification, and async patterns.

## Core Modules

### 0. Environment Setup (Node vs Browser)
`mutts` has two distinct entry points to handle environment-specific behaviors (like `async_hooks` in Node vs `wrap` in Browser).

*   **Automatic Resolution**: Bundlers (Vite, Rollup, Webpack) and Node.js will automatically pick the correct entry point based on the `exports` field in `package.json`.
    *   `import { ... } from 'mutts'` -> resolves to `mutts/node` or `mutts/browser` automatically.
*   **Manual Selection**: You can force a specific environment if needed (e.g. in tests or specific build configs):
    *   `import 'mutts/node'` (side-effect import to polyfill async hooks)
    *   `import { ... } from 'mutts/node'`
    *   `import { ... } from 'mutts/browser'`

#### Development / Debug Entry Points
Each entry point has a `.dev` variant (`entry-browser.dev.ts`, `entry-node.dev.ts`) that auto-imports `debug/debug.ts`, enabling devtools without any consumer-side configuration.

*   **Conditional exports**: `package.json` uses the `"development"` condition so bundlers that support it (Vite enables it by default in dev mode) automatically resolve to the dev variant.
*   **Tests**: `vitest.config.ts` aliases `mutts` to the `.dev` entries, so tests always get debug tools.
*   **Production**: The standard (non-dev) entries contain zero debug code. No `import 'mutts/debug'` needed in consumer apps.
*   **Force dev/prod**: All 4 combinations available as explicit imports:
    *   `mutts/dev`, `mutts/prod` (browser implied)
    *   `mutts/browser/dev`, `mutts/browser/prod`
    *   `mutts/node/dev`, `mutts/node/prod`

### 1. Reactivity (`mutts/reactive`)
*   **Proxy-based**: Uses `Proxy` to track dependencies.
*   **Robust Batching**: Uses a `batchStack` to support deeply nested `batch()` and `immediate` calls. Each level manages its own sub-queue and cleanups correctly.
*   **API**:
    *   `reactive(obj)`: Creates a reactive proxy.
    *   `effect(() => { ... })`: Runs side effects when dependencies change.
    *   `memoize(() => ...)`: Computed values.
    *   `morph(source, fn)`: Efficient, lazy collection mapping with identity tracking.
    *   `reset()`: Restores the system to a clean state. Clears diagnostic lineage tracking data and active dependency stacks.
    *   **Opaque Effects**: `effect(fn, { opaque: true })` bypasses deep-touch optimizations to strict identity tracking.
    *   **`keysOf` tracking**: `Object.keys()`, `for..in`, `Map.keys()` only depend on structure (add/delete), not value changes. `Object.entries()`, `Object.values()`, `Map.entries()` still track values via `get`.

### 2. Decorators (`mutts/decorator`)
*   **Unified System**: Works with both **Legacy** (`experimentalDecorators: true`) and **Modern** (Stage 3) decorators.
*   **Usage**: Use the `decorator` helper to define decorators that adapt to the environment.
    ```ts
    const myDec = decorator({
        method(original, name) { ... },
        class(target) { ... }
    })
    ```

### 3. PromiseChain (`mutts/promiseChain`)
*   **Fluent Chaining**: Allows method chaining on promises without awaiting each step.
    ```ts
    const val = await chainPromise(api.getUser()).config.theme;
    ```

### 4. Zones (`mutts/zone`)
*   **Context Propagation**: Manages stack-based and history-aware execution contexts.
*   **Async Support**: Register zones in `asyncZone` to automatically preserve context across `Promises`, `setTimeout`, etc.
*   **Key Classes**: `Zone`, `ZoneHistory`, `ZoneAggregator`.
*   **`ZoneHistory.active` setter**: Restores both `present` and `history` from the snapshot. The async hook uses `active` getter/setter (not `enter/leave`) to snapshot and restore zone state across async boundaries — so the setter must properly restore the history set.

### 5. Other Utilities
*   **Destroyable**: Resource management with `Symbol.dispose` support.
*   **Mixin**: Efficient class composition with caching.
*   **Indexable**: Classes with array-like `[0]` access.

## Reactivity: `morph` vs `map`

When transforming collections (Arrays, Maps, Records) for reactive contexts, **prefer `morph` over `.map()`**.

### The Concept

Think of standard `Array.map` as a **batch factory assembly line**:
1.  You put raw materials (array `A`) at the start.
2.  You turn on the machine.
3.  It produces a completely new batch of finished products (array `Y`).
4.  If **one** raw material changes, you have to run the *entire* assembly line again to get a fresh batch.

`morph(A, cb)` is like assigning a **dedicated worker** for *each item* in your collection.
1.  **Lazy & Live**: It creates a permanent, identity-stable connection between Source `A` and Result `Y`. Elements are computed only when accessed.
2.  **Surgical Precision**: `morph` tracks the source via `arrayDiff` (for arrays) or key tracking (for records/maps).
    *   If you change item #5 in `A`, **only** item #5 in `Y` is re-evaluated.
    *   Items #1-4 and #6-100 are left completely alone or shifted efficiently.
3.  **Result**: You get the transformational power of `.map()` with the efficiency of fine-grained reactivity and lazy evaluation.

### Summary

*   `A.map(cb)` = **Snapshot**. "Here is what A looks like *right now*, transformed." Re-running it rebuilds everything.
*   `morph(A, cb)` = **Subscription**. "Keep Y transformed to match A, efficiently and lazily, and only do the bare minimum work needed to stay in sync."

Use `morph` whenever you want the result to update reactively and efficiently without rebuilding the entire collection.

## Reactivity Philosophy: Affirmative vs. Legacy Events

`mutts` promotes an **"Affirmative" (Indicative)** framework over a traditional **Imperative/Event-driven** one.

### The "Affirmative" Framework
In `mutts`, you define **what things are**, not **when things happen**. 
*   **State is Truth**: Your data model is the single source of truth.
*   **Derivation**: Derived values (UI, computed properties) automatically align with that truth.
*   **Declarative**: You declare `Y = f(X)`. You do *not* say "When X changes, update Y". The system ensures `Y` is always consistent with `X`.

### The Role of Events
**Events are considered Legacy Concepts.**

*   **When to use Events**: Only use events when interacting with legacy APIs, external systems, or widely accepted standards (e.g., DOM events like `click`, `keydown`).
*   **When to avoid Events**: Do not use events for internal state synchronization. If you find yourself emitting an event to trigger a state update elsewhere in your application, you are likely fighting the framework.
*   **Migration**: All internal application logic should be expressible via reactive derivations (`memoize`, `morph`, `effect`) rather than transient event pulses.


## `optionCall` — Defensive Option Hook Invocation

All user-extensible option hooks in `options` (e.g. `touched`, `enter`, `leave`, `beginChain`, `skipRunningEffect`, `onMemoizationDiscrepancy`, `garbageCollected`) are called via `optionCall('name', ...args)` instead of `options.name(...)`. This wraps each call in try/catch so a throwing user callback cannot crash the reactive engine. `options.warn(...)` is the exception — it's called directly since it's the error reporter for `optionCall` itself.

## Cleanup Semantics: `link`, `unlink`, `attend`, `morph`

When a reactive bunch (`attend`, `morph`, …) is **cleaned up**, all its inner effects are disposed. There is no need to manually undo work done by those effects — cleanup means the owner is being removed from concern entirely.

- `link(owner, ...deps)`: builds a cleanup tree. Dependencies can be **functions** (called with `CleanupReason`) or **objects** (recursively `unlink`ed). When `unlink(owner)` is called, all deps are disposed.
- `unlink(obj, reason?)`: disposes an object's cleanup deps. Safe to call twice (second is a no-op).
- `attend(enumerate, callback)` returns a cleanup. Each per-key callback can return a cleanup too. All are called when the attend is disposed.
- `morph(source, callback)` disposes per-item effects when items are removed or the result itself is cleaned up.

**CleanupReason**: Cleanup functions and inner effects receive a `CleanupReason` object:
- `{ type: 'propChange', triggers: PropTrigger[] }`: triggered by reactive property change.
- `{ type: 'stopped' }`: manually stopped or parent effect disposed.
- `{ type: 'gc' }`: garbage collected by the system.
- `{ type: 'lineage', parent: CleanupReason }`: child effect stopped because parent was stopped.
- `{ type: 'error', error: any }`: stopped due to an unhandled error in the effect chain.

**Reaction Reason**: The `access.reaction` property in `effect` contains the `CleanupReason` if the effect is a reaction:
```typescript
effect(({ reaction }) => {
  if (reaction && typeof reaction === 'object') {
    console.log('Reaction reason:', reaction.type);
    if (reaction.type === 'propChange') {
      reaction.triggers.forEach(t => console.log('Changed:', t.prop));
    }
  }
})
```

## Reactivity: Prototype Chains & Scope Objects (Structural Stability Contract)

Some consumers (notably Pounce) model scopes using `Object.create(parent)` chains. Property reads then follow the JavaScript prototype lookup rules: a `get` may resolve to the first ancestor that *owns* the property.

To keep inherited reads performant, `mutts` tracks dependencies for inherited properties using **two-point tracking**:

1. The **leaf** object being read (the receiver of the `get`).
2. The **owning ancestor** where the property is found.

This design relies on a contract:

**Structural stability**: in a prototype-chain of reactive objects, the *presence* of keys on each level is fixed at creation time. Keys may change value, but intermediate levels must not later gain or lose keys that would shadow/unshadow a property.

### What breaks if you violate the contract

If an intermediate object later adds or deletes an own property that changes prototype resolution (shadowing/unshadowing), effects that previously read the inherited property may not be re-run, because they intentionally do not depend on every intermediate level.

### Recommended pattern

- Create scope objects with all relevant keys declared up-front (it is fine for values to be `undefined`).
- Avoid dynamically adding/removing properties on intermediate scopes in a prototype chain.
- If you need dynamic key presence, prefer a plain reactive record (no prototype chain) or a dedicated collection (`Map`/`Set`) that explicitly models dynamic membership.

## Debugging Reactivity

Tools are built-in in order to catch common reactivity-related issues.

### Effect Lineage
Track the creation history of effects intertwined with JS stack traces. This is particularly useful for debugging complex chains of effects.

- `getLineage()`: Returns a structured lineage (`LineageSegment[]`) of the current execution.
- `showLineagePanel()`: Displays a floating real-time visualization panel in the browser.
- **Improved Isolation**: Lineage data is now correctly cleared by `reset()`, ensuring no diagnostic leakage between tests.
- **Rich Console**: In Chrome, `__MUTTS_DEBUG__` (via DevTools) provides an interactive, expandable view with clickable source links.
- To enable lineage tracking, set `reactiveOptions.introspection.enableHistory = true`.

**Full Documentation**: [docs/reactive/debugging.md](file:///home/fmdm/dev/reactive/debugging.md)

## Circular Dependencies & Bundle Optimization

Circular dependencies in `mutts` can lead to significant bundle bloat and performance issues, especially when they bridge the gap between "Core" logic and "Debug" tools.

### The Problem
If a Core module (e.g., `effects.ts`, `project.ts`) imports a value from the Debug module (e.g., `debug.ts`), and the Debug module imports back from Core (e.g., `types.ts`, `registry.ts`), a cycle is formed. 
Tools like Rollup will bundle these modules together to resolve the cycle. This means:
1.  **Tree-Shaking Fails**: Debug code (and its dependencies like UI renderers) gets included in the production bundle.
2.  **Bundle Bloat**: Your minimal 5KB library can jump to 500KB+.
3.  **Performance Hit**: Evaluation time increases significantly.

### Solution Pattern: Dependency Injection Hook
To break these cycles, use a **Hook Interface** pattern.

1.  **Define a Hook Interface**: Create a lightweight file (e.g., `debug-hooks.ts`) that defines the interface for the functionality you need from the other module.
    ```typescript
    // debug-hooks.ts
    export interface DebugHooks {
        onEffectCreated: (effect: Effect) => void;
    }
    export const debugHooks: DebugHooks = {
        onEffectCreated: () => {} // No-op default
    };
    export function setDebugHooks(hooks: Partial<DebugHooks>) {
        Object.assign(debugHooks, hooks);
    }
    ```

2.  **Consume the Hook in Core**: Import *only* the hook interface/object in your Core module.
    ```typescript
    // effects.ts (Core)
    import { debugHooks } from './debug-hooks';

    function createEffect() {
        // ... logic ...
        debugHooks.onEffectCreated(effect);
    }
    ```

3.  **Inject the Implementation**: In the Debug module (or entry point), import the setter and inject the real implementation.
    ```typescript
    // debug.ts
    import { setDebugHooks } from './debug-hooks';

    function realDebugHandler(effect) {
        console.log('Effect created:', effect);
    }

    setDebugHooks({
        onEffectCreated: realDebugHandler
    });
    ```

### Rule of Thumb
- **Core** should never import **Debug**.
- **Debug** can import **Core** (types, registry, utils).
- If Core needs to trigger Debug logic, use a **Hook**.

## Proxy Performance — Trap Cascade Prevention

When reactive proxies form prototype chains (e.g. pounce scope objects via `Object.create(base)`), any operation that walks the prototype chain through proxies triggers trap cascades. Key patterns to avoid:

1. **Never use `in` or `Reflect.has` on a proxy** when checking metadata — use `Object.hasOwn` + `Object.getPrototypeOf` walk on raw targets instead.
2. **Never store metadata as symbol properties on reactive objects** — use external `WeakMap`/`WeakSet` keyed by the raw target. Symbol property access (`obj[sym]`) triggers the `get` trap and cascades through proxy prototype chains.
3. **Fast-path counters** — for features used by few objects (deep watchers, `@unreactive`), guard the check with a counter so the common case (counter === 0) skips the lookup entirely.
4. **Two-Point Tracking** — for inherited property reads on null-proto chains, only call `dependant()` on the leaf and the owning ancestor, not every intermediate level.
5. **Inline `Reflect.get` for non-arrays** — the proxy `get` handler can call `Reflect.get` directly for non-array objects, skipping the `FoolProof.get` → array patch → original `FoolProof.get` chain (3 function calls saved per read).
6. **`markWithRoot` uses `rootFunctions` WeakMap** — avoids `Object.defineProperty` on every effect creation (which mutates V8 hidden classes). `getRoot` walks the WeakMap chain instead of symbol properties.
7. **`isOwnAccessor` skip for null-proto** — `Object.getPrototypeOf(obj) === null` means no accessors, so skip the expensive `Object.getOwnPropertyDescriptor` calls.

## Presets

Three presets are available for `reactiveOptions`, mirroring Pounce's preset pattern:

*   **`prodPreset`**: Zero introspection (`introspection: null`), `cycleHandling: 'production'`, `maxEffectReaction: 'throw'`. Minimal overhead for production.
*   **`devPreset`**: Introspection enabled with touch lineages, `cycleHandling: 'development'`, `maxEffectReaction: 'warn'`. Good balance for development.
*   **`debugPreset`**: Full lineage capture (`'both'`), `cycleHandling: 'debug'`, `maxEffectReaction: 'debug'`, larger history (200). Maximum diagnostics.

```ts
import { reactiveOptions, devPreset } from 'mutts'
Object.assign(reactiveOptions, devPreset)
```

