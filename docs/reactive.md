# Reactive System Documentation

The Mutts Reactive System documentation has been split into focused sections for better readability.

## [Core Concepts](./reactive/core.md)
*   **[Core API](./reactive/core.md#core-api)**: `reactive`, `effect`, `unwrap`
*   **[Effect System](./reactive/core.md#effect-system)**: Dependency tracking, cleanups, async effects
*   **[Class Reactivity](./reactive/core.md#class-reactivity)**: Decorators and functional syntax

## [Collections](./reactive/collections.md)
*   **[Reactive Collections](./reactive/collections.md#collections)**: Map, Set, WeakMap, WeakSet
*   **[Reactive Arrays](./reactive/collections.md#reactivearray)**: Full array method support
*   **[Register](./reactive/collections.md#register)**: ID-keyed ordered collections
*   **[Projections](./reactive/collections.md#projection)**: `project`, `mapped`, `organized`

## [Advanced Topics](./reactive/advanced.md)
*   **[Atomic Operations](./reactive/advanced.md#atomic-operations)**: Batching and Bidirectional binding
*   **[Evolution Tracking](./reactive/advanced.md#evolution-tracking)**: History introspection
*   **[Prototype Chains](./reactive/advanced.md#prototype-chains-and-pure-objects)**: Advanced inheritance patterns
*   **[Memoization](./reactive/advanced.md#memoization)**: Caching strategies
*   **[Debugging](./reactive/advanced.md#debugging-and-development)**: Cycle detection and troubleshooting

## Debugging tools

The reactive system is currently in a gamma state. The interface is quite fixed, the debugging tools are in place but :
- still unfinished
- not deactivatable
- harming the performances of the application