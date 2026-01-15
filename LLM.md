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
