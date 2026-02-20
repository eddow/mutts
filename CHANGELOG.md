# 1.0.10

## Functionality

- **`morph(source, fn)`**: lazy, identity-stable reactive mapping for Arrays, Maps, and Records. Tracks source mutations via specialized diffing/traversal, computes elements on access with per-item effects for dependency tracking.
- **`morph.pure`**: flavored variant that skips per-item effects — for pure callbacks with no external reactive dependencies. Returns a plain object/array for non-reactive sources.
- **`memoize.lenient`**: flavored variant that gracefully handles non-WeakKey arguments (primitives, `null`, `undefined`) by falling back to recomputation instead of throwing.
- **`arrayDiff`**: Myers' diff algorithm for array reconciliation.

## Bugfixes & Stability

- **Refactored Batching System**: Replaced the global batch queue with a robust `batchStack`. Nested `batch()` and `immediate` calls now manage their own sub-queues correctly, preventing cross-contamination and premature cleanup.
- **Cleanup Timing Fix**: Effect cleanup moved to execution-time. This ensures that `CleanupReason` (including lineage stacks) is accurately captured and remains available during the entire cleanup process.
- **Enhanced Test Isolation**: Added `resetTracking()` (integrated into `reset()`) to clear diagnostic lineage data, preventing state leakage between tests.
- **Refined Panic Logic**: The system now only enters a "broken" state (`BROKEN_EFFECTS`) when an unrecoverable error escapes the root batch. Nested effects can safely propagate errors for recovery without compromising system stability.
- **Deep-Touch Safety**: Added safety checks in property notification loops to prevent panics during complex structural updates.
- **Morph Stability**: Fixed infinite recursion (`RangeError`) in cleanup and improved stability of item effects during collection shifts.

## Refactoring

- **`memoize`** is now a `flavored` function (decorator support preserved).
- **`morph`** is a `flavored` function exported from `mutts/reactive`. Split into specialized internal implementations for efficiency.
- **`project`**: Removed deprecated API (replaced by `morph`).
- **`when`**: reactive boolean => promise
- **`resource`**: reactive resource
- **Refactored Cleanup Mechanism**: replaced legacy `why()` with structured `CleanupReason` passed to effects and cleanup functions.
- `CleanupReason` types: `propChange`, `stopped`, `gc`, `lineage`, `error`, `multiple`.
- `CleanupReason` cumulation: multiple reasons triggering an effect in the same batch are now preserved and merged into a `multiple` reason type.
- `access.reaction` now provides detailed `PropTrigger[]` info for reactions.
- **Unified Introspection**: Debug features (`gatherReasons`, `logErrors`, etc.) consolidated under `reactiveOptions.introspection`.
- **formatCleanupReason**: New debug utility for human-readable reason formatting.
- **Removed `describe`**: niche API replaced by `lift` with descriptor-aware diffing.

## Optimisations

- reactive - overall
- **`keysOf` tracking**: `Object.keys()`, `for..in`, `Map.keys()` now only re-run on structural changes (key add/delete), not value changes. `Object.entries()`, `Object.values()`, `Map.entries()` still track values.

# 1.0.9

## Functionality

- `flavored`: shortcut to give "flavors" to functions
- events now accept the `button.on.click(cb)` syntax
- lineage debugging
- lift objects

### Reactive
- `effect` now has a `named` and `opaque` "flavored" property
- `onEffectThrow` - effect throw/catch feature
- typings: `ScopedCallback` became `EffectTrigger` and `EffectCleanup`
- `describe` - reactive property definition (removed in 1.0.10)
- `attend` - reactive enumeration

## Refactoring

- `resolve` -> `lift` (array buffering - renaming)
- `trackedEffect` -> `onEffectTrigger`
- Cycle detection algorithms update (now, modes are `'production' | 'development' | 'debug'`)

# 1.0.8

## TODOs

- arrays indexing on change

## Finishing touches

- The async hooks have been corrected and are working as expected: tests have been set to run on node and browser

# 1.0.7

## Functionality

- Effects dependencies tracking really seems to have only one effect: early cycle detection, but a huge cost in terms of performance. It has been rendered optional.

## Refactoring

- prototype forwarding -> metaProtos
- ReflectGet/ReflectSet -> FoolProof.get/set
- removed old mapped/reduced, rewrote `scan`
- zoning made a double-entry point, there are 2 ways to hook an `await` (node/browser)

## Bugfixes

- biDi now uses `programmaticallySetValue` to prevent circular updates instead of hacking in the batch
- added `toJSON` to reactive arrays