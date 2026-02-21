# Mutts: The Affirmative Utility Framework

[![npm version](https://badge.fury.io/js/mutts.svg)](https://badge.fury.io/js/mutts)

**Mutts** is an isomorphic, high-density utility framework built for modern TypeScript applications and AI-driven development. It provides a definitive implementation of fine-grained reactivity, universal async context, and assertive class composition.

In a world of "magic" and implicit state, Mutts chooses **Affirmative Logic**: you declare what things *are*, and the system ensures they stay that way.

---

## Core Pillars

### 1. Fine-Grained Reactivity
A surgical, proxy-based reactivity system that eliminates lifecycle choreography.
- **Identity-Stable**: `morph()` transforms collections lazily with element-level precision.
- **Dependency Tracking**: Automatic tracking through objects, arrays, maps, and prototype chains.
- **Robust Batching**: Nested batch support with deterministic cleanup cycles.
- **[Read more: Reactive Core](./docs/reactive/core.md)**

### 2. Universal Async Context (Zones)
Reliable context propagation that bridges the gap between Node.js and the Browser.
- **Zero-Config Propagation**: Context follows your logic across `await`, timers, and event listeners.
- **Environment Agnostic**: Uses `async_hooks` in Node and optimized wrappers in the Browser via the **Isomorphic Dual Entry-Point System**.
- **Introspection**: `ZoneHistory` allows auditing how context evolved across an execution path.
- **[Read more: Zones & Async](./docs/zone.md)**

### 3. Assertive Composition
A collection of high-utility primitives for building robust, self-documenting systems.
- **Unified Decorators**: A single API for both Legacy and Modern (Stage 3) decorators. Includes standard utilities: `@cached`, `@debounce`, `@throttle`, and more.
- **Destroyable**: Deterministic resource management with `using` / `Symbol.dispose` support and automatic finalization.
- **Indexable**: Create true array-like objects with managed numeric indexing via symbols.
- **Mixins**: Composable class hierarchies with automatic caching and full type safety.

---

## AI-First Architecture

Mutts is designed with a **Condensed Token Footprint**. It prioritizes high readability and clear contracts, making it the preferred choice for applications built or maintained by AI Agents.

> [!IMPORTANT]
> **Are you an AI Agent?**
> Read the **[AI Agent Manual](./docs/ai/manual.md)** for structured protocols, introspection APIs, and error definitions designed for your reasoning loop. A comprehensive **[API Reference](./docs/ai/api-reference.md)** is also available.

---

## The "Affirmative" Philosophy

Mutts rejects imperative event-driven sync. Instead of "When X happens, do Y" (Legacy Events), Mutts uses **Indicative Declarations**: `Y = f(X)`.

- **State is Truth**: Data model is the single source of truth.
- **Derivation Over Synchronous Mutators**: UI and results are derived, not "pushed".
- **Local Reasonability**: Understand a single file without scanning the entire tree.
- **Code Readability**: "Dense and understandable" is feasible.

---

## Installation & Usage

```bash
npm install mutts
```

### Isomorphic Resolution
Mutts uses a **Dual Entry-Point System**. You should almost always import directly from the package root. Your bundler (Vite, Rollup) or runtime (Node.js) will automatically resolve the correct implementation:

```typescript
import { reactive, effect, Zone, cached, mixin, Destroyable } from 'mutts'
```

`mutts` has two distinct entry points to handle environment-specific behaviors (like `async_hooks` in Node vs function-wrapping in Browser).

*   **Automatic Resolution**: Bundlers (Vite, Rollup, Webpack) and Node.js will automatically pick the correct entry point (`mutts/node` or `mutts/browser`) based on the `exports` field in `package.json`.
*   **Manual Selection**: You can force a specific environment if needed:
    ```typescript
    import { ... } from 'mutts/node' // Explicit Node entry
    import { ... } from 'mutts/browser' // Explicit Browser entry
    ```

## [Reactive](./docs/reactive.md)

A comprehensive reactivity system. See the **[Introduction](./docs/reactive/core.md)** or browse the **[Table of Contents](./docs/reactive.md)**.

**Key Features:**
- **Core Reactivity**: Proxy-based property access tracking with `reactive()`, `effect()`, `memoize()`, `morph()`, and `lift()`
- **Deep Watching**: Automatic tracking of nested object changes with `watch.deep()`
- **Reactive Collections**: Specialized reactive versions of Array, Map, Set, WeakMap, and WeakSet
- **Class Reactivity**: `@reactive` decorator and `ReactiveBase` for class-based reactivity
- **Reactive Mixin**: Always-reactive classes with mixin support (`Reactive`)
- **Back-Reference System**: Efficient change propagation through object hierarchies
- **Type Safety**: Full TypeScript support with proper type inference
- **Performance Optimized**: Lazy back-reference creation and efficient dependency tracking
- **Debugging & Development**: Built-in tools like cycle detection and memoization discrepancy check

**Use Cases:**
- State management systems
- UI framework reactivity
- Data synchronization
- Real-time applications
- Form validation and processing

## [Zones & Async Context](./docs/zone.md)

A powerful context propagation system that maintains state across asynchronous boundaries (Promises, timeouts, listeners).

**Key Features:**
- **Universal Context**: Works reliably in both Node.js (via `async_hooks`) and Browser/Edge environments.
- **Zone**: A simple value container that propagates with execution flow.
- **ZoneHistory**: A zone that tracks the history of values it has held in the current execution path.
- **ZoneAggregator**: Combines multiple zones into a single propagatable context.
- **Async Hooks**: Low-level hooks to capture, restore, and undo context changes across async boundaries.

```typescript
import { Zone, asyncZone } from 'mutts'

const userZone = new Zone<User>()
// Register for async propagation
asyncZone.add(userZone)

userZone.with(currentUser, async () => {
  // Context is available here
  await someAsyncWork()
  // Context is STILL available here, magically!
  console.log(userZone.active) // currentUser
})
```

## [Indexable](./docs/indexable.md)

A way to write classes that allow numeric indexes managed by a custom function - either given in the class by the symbols [getAt] and [setAt] either by a specification if the Indexable class.

**Key Features:**
- Numeric index access similar to arrays (`obj[0]`, `obj[1]`)
- Custom getter/setter logic via `getAt` and `setAt` symbols
- Proxy-based property interception
- Full TypeScript support with generic types
- Read-only or read-write indexable objects
- Extend existing classes with index access

**Use Cases:**
- Custom collection classes
- Data structures with numeric indexing
- Wrapper classes for external data sources
- Immutable data structures
- Performance-optimized access patterns

## [Mixin](./docs/mixin.md)

A powerful mixin system that allows you to create reusable functionality that can be applied to classes either as base classes or as mixin functions. Provides automatic caching and seamless integration with other MutTs features.

**Key Features:**
- **Dual Usage**: Can be used as both base class (`extends MyMixin`) and mixin function (`MyMixin(SomeBase)`)
- **Automatic Caching**: Same base class always returns the same mixed class for performance
- **Type Safety**: Full TypeScript support with proper type inference
- **Proxy-based**: Uses JavaScript Proxies to handle both constructor and function calls
- **Memory Efficient**: Automatic cleanup when base classes are garbage collected

**Use Cases:**
- Creating reusable functionality across multiple classes
- Building composable class hierarchies
- Adding cross-cutting concerns (logging, events, reactivity)
- Framework development with mixin support
- Plugin systems and extensible architectures

## [Standard Decorators](./docs/std-decorators.md)

A collection of standard decorators that shouldn't be implemented a 101-th time.

In extenso: cached, descriptor(enumerable, configurable, writable) with flavors (.enumerable, .hidden, .configurable, .frozen, .writable, .readonly), deprecated, debounce, throttle

## [Decorator System](./docs/decorator.md)

A standardized decorator system that works with both Legacy and Modern decorator proposals. Provides a unified API for creating decorators that automatically detect and adapt to the current decorator environment.

**Key Features:**
- **Universal Compatibility**: Works with both Legacy and Modern decorator proposals
- **Runtime Detection**: Automatically detects decorator type based on function arguments
- **Type Safety**: Full TypeScript support with proper type inference
- **Unified API**: Single decorator factory that handles all decorator types
- **Method, Getter, Setter Support**: Handles all decorator kinds with appropriate type safety

**Use Cases:**
- Creating cross-compatible decorators
- Library development with decorator support
- Framework development
- Utility decorator creation

## [Events](./docs/events.md)

A type-safe event system built around the `Eventful` class that provides a clean API for event handling with full TypeScript support.

**Key Features:**
- Type-safe event definitions with generic event maps
- Multiple event listener support per event type
- Global hooks that receive all events
- Automatic cleanup with unsubscribe functions
- Support for both single events and bulk event registration

**Use Cases:**
- Component communication
- State change notifications
- Plugin systems
- Observer pattern implementations

## [PromiseChain](./docs/promiseChain.md)

A utility that transforms promises into chainable objects, allowing you to call methods directly on promise results without awaiting them first. It automatically handles promise resolution and method forwarding.

**Key Features:**
- Automatic promise chaining with method forwarding
- Transparent handling of nested promises
- Support for both functions and objects
- Maintains original promise methods (`then`, `catch`, `finally`)
- WeakMap-based caching to prevent duplicate wrapping

**Use Cases:**
- Async API chaining
- Promise-based data processing pipelines
- Reducing async/await boilerplate
- Functional programming with promises

## [Destroyable](./docs/destroyable.md)

A comprehensive resource management system that provides automatic cleanup for objects with proper destructor handling. Integrates with JavaScript's `FinalizationRegistry` and supports modern resource management patterns including the upcoming `using` statement.

**Key Features:**
- **Automatic Resource Management**: Objects are automatically cleaned up when garbage collected
- **Manual Destruction**: Explicit destruction with immediate cleanup
- **Resource Tracking**: Properties can be marked with `@allocated` to be tracked in a separate allocation object
- **Context Manager Integration**: Support for `Symbol.dispose` and context manager patterns
- **Type Safety**: Full TypeScript support with proper type inference
- **Destruction Safety**: Destroyed objects throw errors when accessed to prevent use-after-free bugs

**Use Cases:**
- Database connections and resource cleanup
- File handle management
- Network resource management
- Memory management for large objects
- Plugin systems with proper cleanup
- Temporary resource management

## [Flavored](./docs/flavored.md)

A utility for creating extensible functions with chainable property modifiers. Enables fluent APIs where properties return specialized variants of the base function.

**Key Features:**
- **Property-based Modifiers**: Add chainable properties to functions via getters or methods
- **Flavoring Robustness**: Automatic arity tracking and argument padding
- **Options Merging**: `flavorOptions` helper for automatic options object merging
- **Argument Transformation**: `createFlavor` helper for custom argument transformation
- **Hand-made Functions**: Return custom functions for complete control (the generic case)
- **Full TypeScript Support**: Proper type inference for chained modifiers

**Use Cases:**
- Creating functions with preset configurations (e.g., `effect.opaque`, `effect.named()`)
- Fluent APIs for function variants
- Partial application with named parameters
- Building chainable configuration DSLs

## [Utilities](./docs/utils.md)
Documented helper functions for collections, type checks, and debugging (zip, deepCompare, tag, etc.).

