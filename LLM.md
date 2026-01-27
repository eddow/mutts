# Mutts Library Documentation

## Overview
`mutts` is the foundational utility library for Anarkai, providing a reactivity system, decorator unification, and async patterns.

## Core Modules

### 1. Reactivity (`mutts/reactive`)
*   **Proxy-based**: Uses `Proxy` to track dependencies.
*   **API**:
    *   `reactive(obj)`: Creates a reactive proxy.
    *   `effect(() => { ... })`: Runs side effects when dependencies change.
    *   `memoize(() => ...)`: Computed values.
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

### 4. Other Utilities
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


## Debugging Reactivity

Tools are built-in in order to catch common reactivity-related issues.

**Full Documentation**: [docs/reactive/debugging.md](file:///home/fmdm/dev/reactive/debugging.md)

