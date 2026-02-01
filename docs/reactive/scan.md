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

---

# Lift

The `lift` function transforms a callback that returns an array into a reactive array that automatically synchronizes with the source array whenever dependencies change.

## Overview

`lift` is useful when you have a reactive computation that produces an array, and you want that array to be reactive itself. It efficiently syncs only the elements that differ from the previous result, minimizing DOM updates and downstream effects.

## Basic Usage

```typescript
import { reactive, lift } from 'mutts/reactive'

const items = reactive([1, 2, 3])
const doubled = lift(() => items.map(x => x * 2))

console.log([...doubled]) // [2, 4, 6]

items.push(4)
console.log([...doubled]) // [2, 4, 6, 8]
```

## How it Works

`lift` creates a reactive array and sets up an effect that:
1. Calls the provided callback to get the source array
2. Compares the source with the current reactive array
3. Updates only the elements that have changed
4. Adjusts the length if needed

This approach is more efficient than replacing the entire array, as it preserves references to unchanged elements and triggers minimal reactive updates.

## API Reference

```typescript
function lift<Output>(
    cb: () => Output[]
): Output[] & { [cleanup]: ScopedCallback }
```

### Parameters
- `cb`: A callback function that returns an array. The callback is tracked reactively, so accessing reactive values inside it will cause the array to update when those values change.

### Returns
A reactive array that stays synchronized with the callback's result. The array includes a `[cleanup]` symbol that can be called to stop tracking.

```typescript
import { cleanup } from 'mutts/reactive'
// ...
doubled[cleanup]()
```

## Use Cases

### Dynamic Filtering

```typescript
const allItems = reactive([
  { id: 1, active: true, name: 'Item 1' },
  { id: 2, active: false, name: 'Item 2' },
  { id: 3, active: true, name: 'Item 3' },
])

const activeItems = lift(() => allItems.filter(item => item.active))

// activeItems automatically updates when items change or active status changes
allItems[1].active = true
console.log(activeItems.length) // 3
```

### Computed Transformations

```typescript
const numbers = reactive([1, 2, 3, 4, 5])
const multiplier = reactive({ value: 2 })

const scaled = lift(() => numbers.map(n => n * multiplier.value))

multiplier.value = 3
// scaled is now [3, 6, 9, 12, 15]
```

### Conditional Array Construction

```typescript
const showExtras = reactive({ value: false })
const baseItems = reactive(['A', 'B', 'C'])

const displayItems = lift(() => 
  showExtras.value 
    ? [...baseItems, 'Extra 1', 'Extra 2']
    : baseItems
)

showExtras.value = true
// displayItems is now ['A', 'B', 'C', 'Extra 1', 'Extra 2']
```

## Comparison with `scan`

| Feature | `lift` | `scan` |
| :--- | :--- | :--- |
| **Purpose** | Synchronize with a computed array | Accumulate values with intermediates |
| **Input** | Callback returning array | Source array + accumulator function |
| **Optimization** | Element-wise sync | Intermediate caching + move optimization |
| **Use Case** | Derived arrays (map, filter) | Cumulative operations (sum, reduce) |

## Performance Considerations

- **Efficient Updates**: Only changed elements are updated, not the entire array
- **Length Adjustments**: Array length changes are handled separately from element updates
- **Reference Stability**: Unchanged elements maintain their references
- **Cleanup**: Remember to call the cleanup function when the lifted array is no longer needed to prevent memory leaks
