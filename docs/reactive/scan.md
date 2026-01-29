# Reactive Scan

The `scan` function perform a reactive accumulation over an array of items. Unlike a standard `Array.reduce`, it is designed to be highly efficient in a reactive system, particularly when items are moved or changed, by returning a reactive array of all intermediate results.

## Overview

In a typical reactive system, calling `array.reduce(...)` inside an `effect` means the entire reduction re-runs every time the array structure or a single item changes.

Reactive `scan` solves this by maintaining a chain of **reactive intermediates**. Each item in the source array is linked to an intermediate that depends on the *previous* intermediate's result.

## Key Features

- **Fine-Grained Reactivity**: Changing a property on an item only re-computes the accumulated value for that item and its successors.
- **Move Optimization**: If a subsequence of items moves together (e.g., sorting or splicing), their intermediates are reused. As long as an item's predecessor in the array hasn't changed, its accumulated value is hit from the cache.
- **Duplicate Support**: Correctly handles multiple occurrences of the same object instance.
- **Memory Safety**: Uses `WeakMap` for intermediate storage, ensuring data is cleared when source items are garbage collected.
- **Granular Sync**: Uses per-index effects to sync results, preventing broad dependency tracking of the source array in every calculation.

## Basic Usage

```typescript
import { reactive, scan } from 'mutts/reactive'

const source = reactive([
  { id: 'A', val: 1 },
  { id: 'B', val: 2 },
  { id: 'C', val: 3 },
])

// result is a reactive array: [1, 3, 6]
const result = scan(source, (acc, item) => acc + item.val, 0)

// Updating an item only re-computes for that position and successors
source[1].val = 10
// result stays [1, 11, 14]
```

## How it Works

The implementation consists of:
1. **A Main Effect**: Tracks the structure of the source array (length and item identities). It manages a list of `Intermediate` objects and stays updated on their `prev` links.
2. **Intermediates**: Class instances that link `val` and `prev`. They expose an `acc` getter decorated with `@memoize`.
3. **Index Sync Effects**: Granular effects (one per result index) that subscribe to `indexToIntermediate[i].acc`.

This "Project-like" architecture ensures that the main loop only does structural work, while the actual logic propagation is handled by the dependency chain of the intermediates.

## API Reference

```typescript
function scan<Input extends object, Output>(
    source: readonly Input[],
    callback: (acc: Output, val: Input) => Output,
    initialValue: Output
): ScanResult<Output>
```

### Parameters
- `source`: The source array. All items must be objects (WeakKeys) to enable intermediate caching.
- `callback`: The accumulator function `(acc, val) => nextAcc`.
- `initialValue`: The value used as the accumulator for the first item.

### Returns
A reactive array of accumulated values. It includes a `[cleanup]` symbol that should be called to stop the reactive tracking.

```typescript
import { cleanup } from 'mutts/reactive'
// ...
result[cleanup]()
```

## Performance Comparison

| Operation | Standard `Array.reduce` in `effect` | Reactive `scan` |
| :--- | :--- | :--- |
| **Initial Run** | O(N) calls | O(N) calls |
| **Modify Item at `i`** | O(N) calls (entire reduction) | O(N-i) calls |
| **Append Item** | O(N+1) calls | 1 call |
| **Move Item** | O(N) calls | O(affected chain) |
