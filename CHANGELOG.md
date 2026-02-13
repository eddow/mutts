# 1.0.10

## Functionality

- `when`: reactive boolean => promise
- `resource`: reactive resource

## Refactoring

- **Refactored Cleanup Mechanism**: replaced legacy `why()` with structured `CleanupReason` passed to effects and cleanup functions.
- `CleanupReason` types: `propChange`, `stopped`, `gc`, `lineage`, `error`.
- `access.reaction` now provides detailed `PropTrigger[]` info for reactions.
- **Unified Introspection**: Debug features (`gatherReasons`, `logErrors`, etc.) consolidated under `reactiveOptions.introspection`.
- **formatCleanupReason**: New debug utility for human-readable reason formatting.

## Optimisations

- reactive - overall

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
- `describe` - reactive property definition
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