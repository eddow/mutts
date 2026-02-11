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

### 1. Reactivity (`mutts/reactive`)
*   **Proxy-based**: Uses `Proxy` to track dependencies.
*   **API**:
    *   `reactive(obj)`: Creates a reactive proxy.
    *   `effect(() => { ... })`: Runs side effects when dependencies change.
    *   `memoize(() => ...)`: Computed values.
    *   `project(array, itemEffect)`: Efficient array-to-collection mapping. (reactive .map)
    *   `scan(array, callback, initialValue)`: Reactive scan/accumulation (optimized for moves).
    *   **Opaque Effects**: `effect(fn, { opaque: true })` bypasses deep-touch optimizations to strict identity tracking.

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

## Reactivity: `project` vs `map`

When transforming collections (Arrays, Maps, Sets) for reactive contexts, **prefer `project` over `.map()`**.

### The Concept

Think of standard `Array.map` as a **batch factory assembly line**:
1.  You put raw materials (array `A`) at the start.
2.  You turn on the machine.
3.  It produces a completely new batch of finished products (array `Y`).
4.  If **one** raw material changes, you have to run the *entire* assembly line again to get a fresh batch.

`project(A, cb)` is like assigning a **dedicated worker** for *each item* in your collection.
1.  **Live Connection**: It creates a permanent, live connection between Source `A` and Result `Y`. `Y` is a mirror that reflects `A`.
2.  **Surgical Precision**: `project` sets up an individual "effect" (watcher) for every single key/index.
    *   If you change item #5 in `A`, **only** item #5 in `Y` is re-calculated.
    *   Items #1-4 and #6-100 are left completely alone.
3.  **Result**: You get the transformational power of `.map()` with the efficiency of fine-grained reactivity.

### Summary

*   `A.map(cb)` = **Snapshot**. "Here is what A looks like *right now*, transformed." Re-running it rebuilds everything.
*   `project(A, cb)` = **Subscription**. "Keep Y transformed to match A, forever, and only do the bare minimum work needed to stay in sync."

Use `project` whenever you want the result to update reactively and efficiently without rebuilding the entire collection.

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
*   **Migration**: All internal application logic should be expressible via reactive derivations (`memoize`, `project`, `effect`) rather than transient event pulses.


## `optionCall` — Defensive Option Hook Invocation

All user-extensible option hooks in `options` (e.g. `touched`, `enter`, `leave`, `beginChain`, `skipRunningEffect`, `onMemoizationDiscrepancy`, `garbageCollected`) are called via `optionCall('name', ...args)` instead of `options.name(...)`. This wraps each call in try/catch so a throwing user callback cannot crash the reactive engine. `options.warn(...)` is the exception — it's called directly since it's the error reporter for `optionCall` itself.

## Cleanup Semantics: `cleanedBy`, `attend`, `project`

When a reactive bunch (`attend`, `project`, `scan`, …) is **cleaned up**, all its inner effects are disposed. There is no need to manually undo work done by those effects — cleanup means the owner is being removed from concern entirely.

- `cleanedBy(owner, cleanup)`: ties the cleanup to the owner's lifecycle. When the owner is disposed, the cleanup runs.
- `attend(enumerate, callback)` returns a cleanup. Each per-key callback can return a cleanup too. All are called when the attend is disposed.
- `project(source, callback)` similarly disposes per-item effects when items are removed or the projection itself is cleaned up.

**Key rule**: cleanup functions should release *reactive subscriptions*, not undo *side effects* on the owner. For example, if `attend` sets DOM attributes on an element, there is no need to reset those attributes in cleanup — the element itself is being removed.

## Debugging Reactivity

Tools are built-in in order to catch common reactivity-related issues.

### Effect Lineage
Track the creation history of effects intertwined with JS stack traces. This is particularly useful for debugging complex chains of effects.

- `getLineage()`: Returns a structured lineage (`LineageSegment[]`) of the current execution.
- `showLineagePanel()`: Displays a floating real-time visualization panel in the browser.
- **Rich Console**: In Chrome, `mutate.lineage` (via DevTools) provides an interactive, expandable view with clickable source links.
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

