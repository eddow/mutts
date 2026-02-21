# Debugging Tools

The `mutts` reactive system provides several built-in tools to help track down synchronization issues, dependency leaks, and infinite loops. These tools are primarily exposed through the `reactiveOptions` object.

> [!WARNING]
> **Performance Cost**: Most debugging tools incur a significant performance overhead. They should be enabled only during development or within test environments. Re-running computations for discrepancy detection, in particular, effectively doubles the cost of reactive updates.

## The `reactiveOptions` Reference

The `reactiveOptions` object (exported from `mutts/reactive`) allows you to hook into the reactive system's internals.

```typescript
import { reactiveOptions } from 'mutts/reactive';
```

### Lifecycle Hooks

These hooks are called during the execution of effects and computed values.

- **`enter(effect: Function)`**: Called when an effect or memoized function starts executing.
- **`leave(effect: Function)`**: Called when an effect or memoized function finishes.
- **`touched(obj: any, evolution: Evolution)`**: Called whenever a reactive object is "touched" (accessed or modified). This is the lowest-level hook for observing system activity.

### Effect Chaining & Batching

- **`beginChain(targets: Function[]) / endChain()`**: Called when a batch of effects starts and ends its execution.
- **`maxEffectChain`**: (Default: `100`) Limits the depth of synchronous effect triggering to prevent stack overflows.
- **`maxTriggerPerBatch`**: (Default: `10`) Limits how many times a single effect can be triggered within the same batch. Useful for detecting aggressive re-computation or infinite cycles in `cycleHandling: 'production'` mode.

## Cycle Detection

`mutts` automatically detects circular dependencies (e.g., Effect A updates State X, which triggers Effect B, which updates State Y, which triggers Effect A).

### Configuration

You can control how cycles are handled via `reactiveOptions.cycleHandling`:

- **`'production'`**: High-performance FIFO mode. Disables the dependency graph and topological sorting. Uses heuristic detection via `maxEffectChain`.
- **`'development'`** (Default): Maintains direct dependency graph for early cycle detection during edge creation. Throws immediately with basic path information.
- **`'debug'`**: Full diagnostic mode with transitive closures and topological sorting. Provides detailed cycle path reporting.

### Topological vs. Flat Mode Detection
- **Detection**: Cycles are detected when the execution depth exceeds `maxEffectChain` (default 100).
- **Diagnostics**: The resulting `ReactiveError` includes a `trace` property (the recent execution sequence) and attempts to identify a repeating `cycle`.
- **Recommendation**: Use this mode only for production to minimize performance overhead.

### Cycle Handling Modes

You can configure how the system handles cycles via `reactiveOptions.cycleHandling`:

| Mode | Detection Timing | Cycle Information | Performance |
|------|-----------------|-------------------|-------------|
| `'production'` | Late (Heuristic) | Trace of last N effects | Fastest |
| `'development'` | Eager (On edge) | Exact path (DFS) | Moderate |
| `'debug'` | Structural | Transitive closures | Slowest |

#### Finding Cycle Information

When a cycle is detected, a `ReactiveError` is thrown. You can find detailed path information in the error object:

```typescript
try {
    atom(() => { /* cycle logic */ });
} catch (error) {
    if (error.code === 'Cycle detected') {
        console.log('Cycle Path:', error.cycle.join(' → '));
        console.log('Trigger Chain:', error.causalChain);
    }
}
```

- **`error.cycle`**: An array of effect names forming the cycle.
- **`error.causalChain`**: The sequence of triggers that led to the current effect.
- **`error.lineage`**: The creation stack of the effect (available in `development` or `debug` modes).

### Memoization Discrepancy Detection

The most powerful debugging tool in `mutts` is the **Discrepancy Detector**. It helps identify "missing dependencies"—reactive values used inside a computation that the system isn't tracking.

### How it Works

When `reactiveOptions.onMemoizationDiscrepancy` is set:
1. Every time a `memoize()` function is called, it checks its cache.
2. If a cached value exists, the function is immediately **executed a second time** in a completely untracked context.
3. If the results differ, your callback is triggered.

### Usage

```typescript
reactiveOptions.onMemoizationDiscrepancy = (cached, fresh, fn, args, cause) => {
    console.error(`Discrepancy in ${fn.name || 'anonymous'}!`, {
        cached,
        fresh,
        cause // 'calculation' or 'comparison'
    });
    throw new Error('Memoization discrepancy detected');
};
```

If the cause is 'comparison', it means that, at first computation, calling the function twice gives different results.

If the cause is 'calculation', it means that, when asked the value while the cache was still valid, the function returned a different result.

### `isVerificationRun`

During the "second run" of a discrepancy check, `reactiveOptions.isVerificationRun` is set to `true`. You can use this flag in your own code to avoid side effects (like incrementing counters) that should only happen once during the primary execution.

> [!IMPORTANT]
> Do not modify `isVerificationRun` manually; it is managed by the engine.

## Introspection API

For programmatic analysis of the reactive system, `mutts` provides a dedicated introspection module. This is particularly useful for AI agents and developer tools.

```typescript
import { enableIntrospection, getDependencyGraph, getMutationHistory, snapshot } from 'mutts/introspection';
```

### Enabling Introspection

Introspection features (like history tracking) are memory-intensive and disabled by default.

```typescript
// Enable history tracking (default size: 50)
enableIntrospection({ historySize: 100 });
```

### Dependency Graph

You can retrieve the full dependency graph to understand how objects and effects are linked.

```typescript
const graph = getDependencyGraph();
// Returns: { nodes: Array<EffectNode | ObjectNode>, edges: Array<GraphEdge> }
```

### Mutation History

If `enableHistory` is on, you can inspect the sequence of mutations that have occurred.

```typescript
const history = getMutationHistory();
// Each record contains type, property, old/new values, and causal source.
```

## Structured Error Handling

When the reactive system encounters a critical failure (like a cycle or max depth exceeded), it throws a `ReactiveError` containing rich diagnostic information.

### `ReactiveErrorCode`

Always check `error.debugInfo.code` to identify the failure type:
- `Cycle detected`: A circular dependency was found.
- `Max depth exceeded`: The synchronous effect chain reached `maxEffectChain`.
- `Max reaction exceeded`: An effect was triggered too many times in a single batch.
- `Write in computed`: An attempt was made to modify reactive state inside a `memoize` function.
- `Tracking error`: Internal inconsistency detected in the active dependency stack.
- `Broken effects`: The system has entered an unrecoverable "broken" state after a root-level panic. Call `reset()` to recover.

### Rich Debug Info

The `debugInfo` property on `ReactiveError` includes:
- **`causalChain`**: A string array describing the logical path of modifications leading to the error.
- **`creationStack`**: The stack trace of where the effect was originally created, helping you locate the source in your code.
- **`cycle`**: (For `CYCLE_DETECTED`) The names of the effects that form the loop.
- **`lineage`**: Detailed source-to-sink dependency traces for debugging (requires `lineages` introspection).

## Best Practices for Debugging

### Naming Effects

Always provide a name for your effects to make debug logs and error messages readable:

```typescript
effect(() => {
    // ...
}, { name: 'UpdateSidebarCounter' });

// Or

effect.named('UpdateSidebarCounter')(() => {
    // ...
});
```


### Activation & Deactivation

Since these are runtime options, you can toggle them based on your environment:

```typescript
if (process.env.NODE_ENV === 'development') {
    reactiveOptions.cycleHandling = 'debug';
    reactiveOptions.onMemoizationDiscrepancy = myHandler;
    enableIntrospection();
} else {
    // Ensure they are off in production for performance
    reactiveOptions.onMemoizationDiscrepancy = undefined;
    reactiveOptions.cycleHandling = 'production';
}
```

## Advanced Debugging (`mutts/debug`)

For a deeper look into the reactivity graph and execution flow, you can import the `mutts/debug` module. Simply importing it enables several background tracking features.

```typescript
import 'mutts/debug';
```

### Reaction Reasons (`CleanupReason`)

When an effect or watcher re-runs, it receives a `reaction` property (in `EffectAccess`) that describes *why* it was triggered. This is also passed to the `cleanup` function.

```typescript
effect(({ reaction }) => {
    if (reaction && typeof reaction === 'object') {
        if (reaction.type === 'propChange') {
            console.log('Triggered by:', reaction.triggers.map(t => t.evolution.prop));
        }
    }
    
    return (reason) => {
        // reason is also a CleanupReason
        if (reason?.type === 'stopped') console.log('Effect manually stopped');
    };
});
```

#### `formatCleanupReason`

A built-in utility to turn a `CleanupReason` into an inspectable console log array.

```typescript
import { formatCleanupReason } from 'mutts';

effect(()=> {
    ...
    return (reason)=> {
        if (reason) console.log(...formatCleanupReason(reason));
    }
});
```

### Lineage Tracking

Lineage tracking allows you to see the "causal path" of an effect—not just the current stack trace, but the stack traces of all parent effects that created the current execution.

When an effect is created, it is assigned a `lineage` property that contains the stack traces of all parent effects that lead to its creation.

- **`logLineage()`**: Prints a formatted, interactive tree of the current effect's lineage to the console.
- **`captureLineage()`**: Captures the current lineage as a structured object.

#### Lineage Options

You can control how lineages are captured via `reactiveOptions.introspection.gatherReasons.lineages`:
- `'none'`: Disable lineage capture.
- `'touch'`: Capture lineage when a property is accessed (default).
- `'dependency'`: Capture lineage when a dependency is recorded.
- `'both'`: Capture both.

### The `__MUTTS_DEBUG__` Global

When `mutts/debug` is active (or after calling `enableDevTools()`), a global `__MUTTS_DEBUG__` object is exposed in the environment (Node.js `global` or Browser `window`).

This object provides low-level access to the graph, lineage capture, and renaming utilities:
- `__MUTTS_DEBUG__.getGraph()`: Returns the full reactivity graph.
- `__MUTTS_DEBUG__.logLineage()`: logs the current lineage.
- `__MUTTS_DEBUG__.browserLineage`: captures lineage for the DevTools panel.

### Custom DevTools Formatters

`mutts/debug` automatically registers [Custom Formatters](https://bit.ly/chrome-extension-custom-formatters) in Chrome. This makes lineage objects and reactive proxies appear as clean, structured trees in the console instead of opaque Proxy objects.
