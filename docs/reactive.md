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
*   **[Projections](./reactive/collections.md#projection)**: `project`, `organized`
*   **[Attend](./reactive/attend.md)**: Reactive enumeration (`attend`)
*   **[Describe](./reactive/describe.md)**: Reactive property definition (`describe`)
*   **[Scan](./reactive/scan.md)**: Reactive scan and accumulation
*   **[Resource](./reactive/resource.md)**: Async state tracking (`resource`)

## [Advanced Topics](./reactive/advanced.md)
*   **[Choosing the Right Primitive](./reactive/advanced.md#choosing-the-right-reactive-primitive)**: Comparison table of effect-value functions (memoize, lift, project, scan, etc.)
*   **[Atomic Operations](./reactive/advanced.md#atomic-operations)**: Batching and Bidirectional binding
*   **[Evolution Tracking](./reactive/advanced.md#evolution-tracking)**: History introspection
*   **[Prototype Chains](./reactive/advanced.md#prototype-chains-and-pure-objects)**: Advanced inheritance patterns
*   **[Memoization](./reactive/advanced.md#memoization)**: Caching strategies
*   **[Debugging](./reactive/advanced.md#debugging-and-development)**: Cycle detection and troubleshooting

## [Debugging and Troubleshooting](./reactive/debugging.md)
*   **[Reactive Options](./reactive/debugging.md#the-reactiveoptions-reference)**: Global debug hooks and configuration
*   **[Cycle Detection](./reactive/debugging.md#cycle-detection)**: Configuration and troubleshooting circular dependencies
*   **[Memoization Discrepancy](./reactive/debugging.md#memoization-discrepancy-detection)**: Identifying missing dependencies
*   **[Introspection API](./reactive/debugging.md#introspection-api)**: Programmatic analysis and dependency graphs

*   **[Performance](./reactive/debugging.md#performance-cost)**: Understanding the cost of debugging tools