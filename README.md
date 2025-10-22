# Modern UTility TS

[![npm version](https://badge.fury.io/js/mutts.svg)](https://badge.fury.io/js/mutts)

Basically, just a bunch of utilities that have many versions on the web, but none fitting my needs, so that I re-created every time.

With the advent of AI, I could finally manage to have something finished and complete.

## Installation

```bash
npm install mutts
```

## Usage

### Import from Built Modules

```typescript
// Import from built modules (recommended for production)
import { reactive, effect, Reactive } from 'mutts'
import { mixin } from 'mutts/mixin'
import { cached } from 'mutts/std-decorators'
import { Destroyable, allocated } from 'mutts/destroyable'
```

### Import from Source Files

```typescript
// Import directly from source TypeScript files (for development/custom builds)
import { reactive, effect, Reactive } from 'mutts/src'
import { mixin } from 'mutts/src/mixin'
import { cached } from 'mutts/src/std-decorators'
import { Destroyable, allocated } from 'mutts/src/destroyable'
```

**Note:** When importing from source files, you'll need to configure your build system (TypeScript, Vite, Webpack, etc.) to handle TypeScript compilation and module resolution. The source files are published alongside the built modules, so you can import directly from the `src` directory.

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

In extenso: cached, describe(enumerable, configurable, writable), deprecated, debounce, throttle

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

## [Reactive](./docs/reactive.md)

A comprehensive reactivity system that provides fine-grained dependency tracking and automatic re-computation. Built on JavaScript Proxies with support for deep watching, computed values, and effect management.

**Key Features:**
- **Core Reactivity**: Proxy-based property access tracking with `reactive()`, `effect()`, and `computed()`
- **Deep Watching**: Automatic tracking of nested object changes with `deepWatch()`
- **Reactive Collections**: Specialized reactive versions of Array, Map, Set, WeakMap, and WeakSet
- **Class Reactivity**: `@reactive` decorator and `ReactiveBase` for class-based reactivity
- **Reactive Mixin**: Always-reactive classes with mixin support (`Reactive`)
- **Back-Reference System**: Efficient change propagation through object hierarchies
- **Type Safety**: Full TypeScript support with proper type inference
- **Performance Optimized**: Lazy back-reference creation and efficient dependency tracking

**Use Cases:**
- State management systems
- UI framework reactivity
- Data synchronization
- Real-time applications
- Form validation and processing