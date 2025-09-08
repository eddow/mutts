# Modern UTility TS

Basically, just a bunch of utilities that have many versions on the web, but none fitting my needs, so that I re-created every time.

With the advent of AI, I could finally manage to have something finished and complete.

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

## [Cached](./src/cached.ts)

A decorator that provides automatic caching for getter methods with circular dependency detection. The `@cached` decorator ensures that expensive computations are only performed once per instance, with built-in protection against infinite recursion.

**Key Features:**
- Automatic result caching for getter methods
- Circular dependency detection and error reporting
- Per-instance caching (each object instance has its own cache)
- Thread-safe synchronous calculation tracking

**Use Cases:**
- Expensive computed properties
- Derived state calculations
- Performance optimization for frequently accessed values

## [Events](./src/events.ts)

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

## [PromiseChain](./src/promiseChain.ts)

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

## [Reactive](./src/reactive/)

A comprehensive reactivity system that provides fine-grained dependency tracking and automatic re-computation. Built on JavaScript Proxies with support for deep watching, computed values, and effect management.

**Key Features:**
- **Core Reactivity**: Proxy-based property access tracking with `reactive()`, `effect()`, and `computed()`
- **Deep Watching**: Automatic tracking of nested object changes with `deepWatch()`
- **Reactive Collections**: Specialized reactive versions of Array, Map, Set, WeakMap, and WeakSet
- **Back-Reference System**: Efficient change propagation through object hierarchies
- **Type Safety**: Full TypeScript support with proper type inference
- **Performance Optimized**: Lazy back-reference creation and efficient dependency tracking

**Use Cases:**
- State management systems
- UI framework reactivity
- Data synchronization
- Real-time applications
- Form validation and processing