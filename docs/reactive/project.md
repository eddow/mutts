# Reactive Register Memoization Notes

## Background

- Register entries are stored in a reactive `Map`. Updating an entry via `Map.set` marks the entire value as changed.
- Memoized computations that read through `map.get(key)` re-execute fully when the entry changes, even if only a nested property is touched.
- The goal for rendering lists in a JSX/HTML engine is to avoid rebuilding DOM nodes; only the affected properties should update.

## Evolution: From `organized` to `project`

### Initial State

- `memoize` caches results but invalidates on `Map.set`, so large effects still re-run.
- `organized` (designed for `Record` sources) creates per-key effects so downstream work reruns only for the touched key; this matches the desired behaviour.
- **Gap:** `organized` operates on plain objects: key enumeration relies on property iteration and `FoolProof.get/set`. Registers and other keyed collections (`Map`, `Register`, custom stores) need the same per-entry orchestration without converting to records.

### Completed Evolution: `project` Implementation

We implemented `project` as a generalized transformation helper that works across arrays, records, and maps:

**Key Design Decisions:**
- **Unified API:** Single `project` function with runtime dispatch to `project.array`, `project.record`, or `project.map` based on source type.
- **Access Pattern:** Callback receives a `ProjectAccess` object with `get()`, `set()`, `key`, `source`, and `value` (computed property) - similar to `organized` but returning a value instead of an effect.
- **Automatic Target Creation:** The function always creates its own reactive target container (array, record, or map) - no `baseTarget` parameter needed.
- **Per-Key Effects:** Each source key/index gets its own reactive effect that recomputes only when that specific entry changes, enabling granular updates for rendering pipelines.

**Current API:**
```typescript
project.array(source: readonly T[], apply: (access, target) => U): ProjectResult<U[]>
project.record(source: Record<K, T>, apply: (access, target) => U): ProjectResult<Record<K, U>>
project.map(source: Map<K, T>, apply: (access, target) => U): ProjectResult<Map<K, U>>
```

**Current Behavior:**
- Eager computation: all entries are computed immediately when keys are present.
- One-way transformation: callback only handles "get" (read) operations; no write-back support.
- Mutable results: returned arrays/records/maps are fully mutable.
- `ProjectAccess.old` exposes the previously computed result for each entry, enabling incremental updates and state preservation.

## Future Evolutions

### Bidirectional Transformation (Set Callback)

**Goal:** Support writing back to the source through the projected object.

**Implementation:**
- Add optional second callback parameter: `set: (access, newValue, target) => void | boolean`
- When `set` is provided, mutations to the projected object trigger the set callback.
- The callback receives the same `ProjectAccess` object plus the new value, allowing it to update the source.
- If `set` returns `false` or throws, the mutation is rejected.

**API Impact:**
```typescript
project.array(
  source: readonly T[],
  apply: (access, target) => U,
  set?: (access, newValue: U, target) => void | boolean
): ProjectResult<U[]>
```

### Readonly Results When No Set Callback

**Goal:** Make projected objects readonly when no write-back is supported.

**Implementation:**
- When `set` callback is not provided, wrap the result in a readonly proxy or use read-only array/record types.
- Prevents accidental mutations that would have no effect on the source.
- Type system should reflect readonly nature in return types.

**API Impact:**
- Return type becomes `ProjectResult<readonly U[]>` or similar when `set` is omitted.
- Arrays use `ReactiveReadOnlyArray` (already exists in `mapped.ts`).
- Records and maps need readonly wrappers or proxy-based protection.

## Implementation Notes for AI Agents

**Current State:**
- `project` is fully functional for arrays, records, maps, and registers with eager, one-way transformation.
- Tests cover per-key reactivity, key addition/removal, automatic helper selection, and `access.old` value propagation.
- The implementation follows the same per-key effect pattern as `organized` but returns computed values.

**Future Work:**
- Lazy computing requires careful effect lifecycle management to avoid memory leaks.
- Bidirectional support needs to handle edge cases (concurrent reads/writes, validation).
- Readonly enforcement should align with existing `ReactiveReadOnlyArray` patterns where possible.
- Consider whether these features should be opt-in via options object or separate function variants.

**Related Files:**
- `src/reactive/project.ts` - Main implementation
- `src/reactive/array.ts` - Reference for `ReactiveReadOnlyArray` pattern
- `src/reactive/record.ts` - Reference for `organized` pattern (different use case)
- `tests/reactive/project.test.ts` - Test coverage

