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

The `lift` function transforms a callback that returns an array or object into a reactive array/object that automatically synchronizes with the source whenever dependencies change.

## Overview

`lift` is useful when you have a reactive computation that produces an array or object, and you want that result to be reactive itself. It efficiently syncs only the elements that differ from the previous result, minimizing DOM updates and downstream effects.

## Basic Usage

### Array Example

```typescript
import { reactive, lift } from 'mutts/reactive'

const items = reactive([1, 2, 3])
const doubled = lift(() => items.map(x => x * 2))

console.log([...doubled]) // [2, 4, 6]

items.push(4)
console.log([...doubled]) // [2, 4, 6, 8]
```

### Object Example

```typescript
import { reactive, lift } from 'mutts/reactive'

const user = reactive({ name: 'John', age: 30 })
const profile = lift(() => ({
  displayName: user.name.toUpperCase(),
  isAdult: user.age >= 18,
  description: `${user.name} is ${user.age} years old`
}))

console.log(profile.displayName) // JOHN
console.log(profile.isAdult) // true

user.name = 'Jane'
console.log(profile.displayName) // JANE
console.log(profile.description) // Jane is 30 years old
```

## How it Works

`lift` creates a reactive array or object and sets up an effect that:
1. Calls the provided callback to get the source array or object
2. Compares the source with the current reactive result
3. Updates only the elements/properties that have changed
4. Adjusts the structure if needed (array length or object properties)

For arrays, this approach preserves references to unchanged elements and triggers minimal reactive updates. For objects, it uses `Object.assign()` to merge changes and removes properties that no longer exist in the source.

## API Reference

```typescript
function lift<Output extends (any[] | object)>(
    cb: (access: EffectAccess) => Output
): Output & { [cleanup]: ScopedCallback }
```

### Parameters
- `cb`: A callback function that returns an array or object. The callback is tracked reactively, so accessing reactive values inside it will cause the result to update when those values change. The callback receives an `EffectAccess` parameter for advanced use cases.

### Returns
A reactive array or object that stays synchronized with the callback's result. The result includes a `[cleanup]` symbol that can be called to stop tracking.

```typescript
import { cleanup } from 'mutts/reactive'
// ...
doubled[cleanup]()
profile[cleanup]()
```

## Use Cases

### Dynamic Filtering (Arrays)

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

### Computed Transformations (Arrays)

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

### Computed Object Properties

```typescript
const user = reactive({ firstName: 'John', lastName: 'Doe', age: 30 })
const settings = reactive({ theme: 'dark', language: 'en' })

const userProfile = lift(() => ({
  fullName: `${user.firstName} ${user.lastName}`,
  isMinor: user.age < 18,
  displayTheme: settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode',
  locale: settings.language.toUpperCase()
}))

user.firstName = 'Jane'
// userProfile.fullName is now 'Jane Doe'

settings.theme = 'light'
// userProfile.displayTheme is now 'Light Mode'
```

### Dynamic Object Composition

```typescript
const baseConfig = reactive({ api: 'https://api.example.com', timeout: 5000 })
const userPrefs = reactive({ retries: 3, logging: false })
const envVars = reactive({ debug: true, version: '1.0.0' })

const fullConfig = lift(() => ({
  ...baseConfig,
  ...userPrefs,
  environment: envVars.debug ? 'development' : 'production',
  version: envVars.version,
  logging: envVars.debug || userPrefs.logging
}))

envVars.debug = false
// fullConfig.environment becomes 'production'

userPrefs.logging = true
// fullConfig.logging becomes true
```

### Conditional Object Properties

```typescript
const user = reactive({ role: 'admin', permissions: ['read', 'write'] })
const showAdvanced = reactive({ value: true })

const userInterface = lift(() => {
  const base = {
    canEdit: user.permissions.includes('write'),
    userName: user.role
  }
  
  return showAdvanced.value ? {
    ...base,
    isAdmin: user.role === 'admin',
    permissionCount: user.permissions.length
  } : base
})

showAdvanced.value = false
// userInterface no longer has isAdmin and permissionCount properties
```

## Comparison with `scan`

| Feature | `lift` | `scan` |
| :--- | :--- | :--- |
| **Purpose** | Synchronize with computed arrays/objects | Accumulate values with intermediates |
| **Input** | Callback returning array/object | Source array + accumulator function |
| **Output** | Reactive array/object | Reactive array of accumulated values |
| **Optimization** | Element-wise/property-wise sync | Intermediate caching + move optimization |
| **Use Case** | Derived arrays/objects (map, filter, computed properties) | Cumulative operations (sum, reduce) |
| **Data Types** | Arrays and objects | Arrays only (object items required) |

## Comparison with Recursive Touching (Deep Touch)

When you assign a new array/object to a reactive property (`state.items = newArray`), the reactive system performs a **recursive touch** — it diffs old vs new element-by-element and fires per-index notifications on the *same proxy*. This raises the question: is `lift` redundant?

| | Recursive Touching | `lift` |
| :--- | :--- | :--- |
| **Trigger** | Direct assignment to a reactive property | Any reactive dependency change inside the callback |
| **Scope** | Same-shape replacement of one value | Arbitrary computation → stable reactive output |
| **Identity** | Same proxy, same object | Returns a **new persistent proxy** that outlives re-evaluations |
| **Use case** | `state.user = fetchedUser` — fine-grained diff on assignment | `lift(() => items.filter(x => x.active))` — derived collection |

Deep touching makes `lift` unnecessary for **replacement** patterns (`state.items = newItems`). `lift` remains essential for **derived collections** where the result is a transformation (filter, map, reshape) rather than a direct assignment — there is no single property to assign to, and the whole output is recomputed from scratch each time.

## Comparison with `memoize`

Both `lift` and `memoize` compute derived values from reactive dependencies, but they differ in evaluation strategy and output type.

| | `memoize` | `lift` |
| :--- | :--- | :--- |
| **Evaluation** | Lazy — invalidates on dep change, recomputes on next read | Eager — recomputes immediately on dep change |
| **Return type** | The raw return value of the function | A **stable reactive proxy** (array or object) |
| **Downstream reactivity** | Consumers get a new value each time (identity changes) | Consumers see per-property/per-index diffs on the *same* proxy |
| **Arguments** | Keyed by object args (WeakMap cache tree) | No args — closure over reactive deps |
| **Decorator** | Yes (`@memoize` on getters/methods) | No |
| **Cleanup** | Automatic (WeakMap GC) | Explicit `result[cleanup]()` |

**When to use which:**
- **`lift`** for derived collections where downstream consumers (e.g., `project()`, effects) benefit from per-element diffing on a stable proxy.
- **`memoize`** for parameterized caching (`memoize((user) => expensiveCompute(user))`) or lazy evaluation where recomputation should only happen on access.
- For a scalar result read in one place, they are nearly interchangeable — prefer `memoize` for its laziness and automatic cleanup.

## Performance Considerations

### Arrays
- **Efficient Updates**: Only changed elements are updated, not the entire array
- **Length Adjustments**: Array length changes are handled separately from element updates
- **Reference Stability**: Unchanged elements maintain their references

### Objects
- **Property-wise Updates**: Only changed properties are updated using `Object.assign()`
- **Property Addition/Removal**: Properties are added or removed as needed when the source object structure changes
- **Reference Stability**: The reactive object maintains its identity while properties are updated

### General
- **Cleanup**: Remember to call the cleanup function when the lifted array/object is no longer needed to prevent memory leaks
- **Type Consistency**: The callback must return the same type (array or object) on subsequent calls
