## Collections

### `ReactiveMap`

A reactive wrapper around JavaScript's `Map` class.

```typescript
const map = reactive(new Map([['key1', 'value1']]))

effect(() => {
    console.log('Map size:', map.size)
    console.log('Has key1:', map.has('key1'))
})

map.set('key2', 'value2') // Triggers effect
map.delete('key1')         // Triggers effect
```

**Features:**
- Tracks `size` changes
- Tracks individual key operations
- Tracks collection-wide operations via `allProps`

### `ReactiveWeakMap`

A reactive wrapper around JavaScript's `WeakMap` class.

```typescript
const weakMap = reactive(new WeakMap())
const key = { id: 1 }

effect(() => {
    console.log('Has key:', weakMap.has(key))
})

weakMap.set(key, 'value') // Triggers effect
weakMap.delete(key)        // Triggers effect
```

**Features:**
- Only tracks individual key operations
- No `size` tracking (WeakMap limitation)
- No collection-wide operations

### `ReactiveSet`

A reactive wrapper around JavaScript's `Set` class.

```typescript
const set = reactive(new Set([1, 2, 3]))

effect(() => {
    console.log('Set size:', set.size)
    console.log('Has 1:', set.has(1))
})

set.add(4)    // Triggers effect
set.delete(1) // Triggers effect
set.clear()   // Triggers effect
```

**Features:**
- Tracks `size` changes
- Tracks individual value operations
- Tracks collection-wide operations

### `ReactiveWeakSet`

A reactive wrapper around JavaScript's `WeakSet` class.

```typescript
const weakSet = reactive(new WeakSet())
const obj = { id: 1 }

effect(() => {
    console.log('Has obj:', weakSet.has(obj))
})

weakSet.add(obj)    // Triggers effect
weakSet.delete(obj) // Triggers effect
```

### Collection-Specific Reactivity

Collections provide different levels of reactivity:

```typescript
const map = reactive(new Map())

// Size tracking
effect(() => {
    console.log('Map size:', map.size)
})

// Individual key tracking
effect(() => {
    console.log('Value for key1:', map.get('key1'))
})

// Collection-wide tracking
effect(() => {
    for (const [key, value] of map) {
        // This effect depends on allProps
    }
})

// Operations trigger different effects
map.set('key1', 'value1') // Triggers size and key1 effects
map.set('key2', 'value2') // Triggers size and allProps effects
map.delete('key1')         // Triggers size, key1, and allProps effects
```

### `ReactiveArray`

A reactive wrapper around JavaScript's `Array` class with full array method support.

```typescript
const array = reactive([1, 2, 3])

effect(() => {
    console.log('Array length:', array.length)
    console.log('First element:', array[0])
})

array.push(4)    // Triggers effect
array[0] = 10    // Triggers effect
```

**Features:**
- Tracks `length` changes
- Tracks individual index operations
- Tracks collection-wide operations via `allProps`
- Supports all array methods with proper reactivity

### Array Methods

All standard array methods are supported with reactivity:

```typescript
const array = reactive([1, 2, 3])

// Mutator methods
array.push(4)           // Triggers length and allProps effects
array.pop()             // Triggers length and allProps effects
array.shift()           // Triggers length and allProps effects
array.unshift(0)        // Triggers length and allProps effects
array.splice(1, 1, 10)  // Triggers length and allProps effects
array.reverse()         // Triggers allProps effects
array.sort()            // Triggers allProps effects
array.fill(0)           // Triggers allProps effects
array.copyWithin(0, 2)  // Triggers allProps effects

// Accessor methods (immutable)
const reversed = array.toReversed()
const sorted = array.toSorted()
const spliced = array.toSpliced(1, 1)
const withNew = array.with(0, 100)
```

### Index Access

ReactiveArray supports both positive and negative index access:

```typescript
const array = reactive([1, 2, 3, 4, 5])

effect(() => {
    console.log('First element:', array[0])
    console.log('Last element:', array.at(-1))
})

array[0] = 10     // Triggers effect
array[4] = 50     // Triggers effect
```

### Length Reactivity

The `length` property is fully reactive:

```typescript
const array = reactive([1, 2, 3])

effect(() => {
    console.log('Array length:', array.length)
})

array.push(4)        // Triggers effect
array.length = 2     // Triggers effect
array[5] = 10        // Triggers effect (expands array)
```

### Array Evolution Tracking

Array operations generate specific evolution events:

```typescript
const array = reactive([1, 2, 3])
let state = getState(array)

effect(() => {
    while ('evolution' in state) {
        console.log('Array change:', state.evolution)
        state = state.next
    }
})

array.push(4)        // { type: 'bunch', method: 'push' }
array[0] = 10        // { type: 'set', prop: 0 }
array[5] = 20        // { type: 'add', prop: 5 }
```

### Array-Specific Reactivity Patterns

```typescript
const array = reactive([1, 2, 3])

// Track specific indices
effect(() => {
    console.log('First two elements:', array[0], array[1])
})

// Track length changes
effect(() => {
    console.log('Array size changed to:', array.length)
})

// Track all elements (via iteration)
effect(() => {
    for (const item of array) {
        // This effect depends on allProps
    }
})

// Track specific array methods
effect(() => {
    const lastElement = array.at(-1)
    console.log('Last element:', lastElement)
})
```

### Performance Considerations

ReactiveArray is optimized for common array operations:

```typescript
// Efficient: Direct index access
effect(() => {
    console.log(array[0]) // Only tracks index 0
})

// Efficient: Length tracking
effect(() => {
    console.log(array.length) // Only tracks length
})

// Less efficient: Iteration tracks all elements
effect(() => {
    array.forEach(item => console.log(item)) // Tracks allProps
})
```

### `Register`

`Register` is an ordered, array-like collection that keeps a stable mapping between keys and values. It is useful when you need array semantics (indexable access, ordering, iteration) but also require identity preservation by key—ideal for UI lists keyed by IDs or when you want to memoise entries across reorders.

```typescript
import { Register } from 'mutts/reactive'

// Create a register where the key comes from the `id` field
const list = new Register(({id}: { id: number }) => id, [
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
])

effect(() => {
    console.log('Length:', list.length)
    console.log('First label:', list[0]?.label)
})

// Push uses the key function to keep identities stable
list.push({ id: 3, label: 'Charlie' })

// Replacing with the same key updates watchers without creating a new identity
list[0] = { id: 1, label: 'Alpha (updated)' }

// Access by key
const second = list.get(2) // { id: 2, label: 'Bravo' }

// Duplicate keys share value identity
list.push({ id: 2, label: 'Bravo (new data)' })
console.log(list[1] === list[2]) // true
```

**Highlights:**

- Fully indexable (`list[0]`, `list.at(-1)`, `list.length`, iteration, etc.) thanks to the shared `Indexable` infrastructure.
- Complete array surface forwarding (`map`, `filter`, `reduce`, `concat`, `reverse`, `sort`, `fill`, `copyWithin`, and more) with reactivity preserved.
- Stable key/value map under the hood allows quick lookups via `get()`, `hasKey()`, and `indexOfKey()`.
- When the same key appears multiple times, all slots reference the same underlying value instance, making deduplication and memoisation straightforward.
- Reordering operations emit index-level touches so list reactivity remains predictable in rendered UIs.

### Register-specific API (beyond Array)

The `Register` exposes additional methods and behaviors that standard arrays do not have:

- `get(key)` / `set(key, value)`
  - `get(key: K): T | undefined` returns the latest value for a key.
  - `set(key: K, value: T): void` updates the value for an existing key (no-op if key absent).
  - Example:
  ```typescript
  list.set(2, { id: 2, label: 'Bravo (updated)' })
  const v = list.get(2)
  ```

- `hasKey(key)` / `indexOfKey(key)`
  - `hasKey(key: K): boolean` whether the key is present in any slot.
  - `indexOfKey(key: K): number` first index at which the key appears, or `-1`.

- `remove(key)` / `removeAt(index)`
  - `remove(key: K): void` removes all occurrences of `key` from the register.
  - `removeAt(index: number): T | undefined` removes a single slot by index and returns its value.

- `keep(predicate)`
  - `keep(predicate: (value: T) => boolean): void` keeps only items for which the predicate returns `true`; items for which it returns `false` are removed. The predicate is evaluated once per distinct key; duplicate keys follow the same decision.

- `update(...values)`
  - `update(...values: T[]): void` updates existing entries by their key; ignores values whose key is not yet present.

- `upsert(insert, ...values)`
  - `upsert(insert: (value: T) => void, ...values: T[]): void` updates by key when present, otherwise calls `insert(value)` so you can decide how to insert (e.g. `push`, `unshift`, or `splice`).
  - Example:
  ```typescript
  list.upsert(v => list.push(v), { id: 4, label: 'Delta' }, { id: 2, label: 'Bravo (again)' })
  ```

- `entries()`
  - Iterates `[number, value]` pairs in index order: `IterableIterator<[number, T | undefined]>`.

- `keys` / `values`
  - `keys: ArrayIterator<number>` provides the index iterator (mirrors `Array#keys()`).
  - `values: IterableIterator<T>` provides an iterator of values (same as default iteration).

- `clear()`
  - Removes all entries and disposes internal key-tracking effects.

- `toArray()` / `toString()`
  - `toArray(): T[]` materializes the current values into a plain array.
  - `toString(): string` returns a concise description like `[Register length=3]`.

Notes:
- Direct length modification via `list.length = n` is not supported; use `splice` instead.
- Assigning to an index (`list[i] = value`) uses the key function to bind that slot to `value`’s key.

## Class Reactivity

## Projection

### `project()`

`project()` provides a unified API for transforming reactive collections (arrays, records, and maps) into new reactive collections. Each source entry gets its own reactive effect that recomputes only when that specific entry changes, enabling granular updates perfect for rendering pipelines.

#### Basic Usage

```typescript
import { cleanup, project, reactive } from 'mutts/reactive'

// Arrays
const users = reactive([{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }])
const names = project.array(users, ({ get }) => get()?.name.toUpperCase() ?? '')

console.log(names) // ['JOHN', 'JANE']

users[0].name = 'Johnny'
console.log(names[0]) // 'JOHNNY' - only index 0 recomputed

// Records
const scores = reactive({ math: 90, science: 85 })
const grades = project.record(scores, ({ get }) => {
  const score = get()
  return score >= 90 ? 'A' : score >= 80 ? 'B' : 'C'
})

console.log(grades.math) // 'A'
scores.math = 88
console.log(grades.math) // 'B' - only math key recomputed

// Maps
const inventory = reactive(new Map([
  ['apples', { count: 10 }],
  ['oranges', { count: 5 }]
]))
const totals = project.map(inventory, ({ get }) => get()?.count ?? 0)

console.log(totals.get('apples')) // 10
inventory.get('apples')!.count = 15
console.log(totals.get('apples')) // 15 - only 'apples' key recomputed
```

#### Automatic Type Selection

You can use `project()` directly and it will automatically select the appropriate helper based on the source type:

```typescript
// Automatically uses project.array
const doubled = project([1, 2, 3], ({ get }) => get() * 2)

// Automatically uses project.record
const upper = project({ a: 'hello', b: 'world' }, ({ get }) => get()?.toUpperCase() ?? '')

// Automatically uses project.map
const counts = project(new Map([['x', 1], ['y', 2]]), ({ get }) => get() * 2)
```

#### Access Object

The callback receives a `ProjectAccess` object with:

- **`get()`**: Function that returns the current source value for this key/index
- **`set(value)`**: Function to update the source value (if the source is mutable)
- **`key`**: The current key or index
- **`source`**: Reference to the original source collection
- **`old`**: Previously computed result for this entry (undefined on first run)
- **`value`**: Computed property that mirrors `get()` (for convenience)

```typescript
const transformed = project.array(items, (access) => {
  // Access the source value
  const item = access.get()
  
  // Access the key/index
  console.log(`Processing index ${access.key}`)

  // Leverage previous result
  console.log(`Previous result: ${access.old}`)
  
  // Transform and return
  return item.value * 2
})
```

#### Per-Entry Reactivity

Each entry in the source collection gets its own reactive effect. When only one entry changes, only that entry's projection recomputes:

```typescript
const users = reactive([
  { id: 1, name: 'John', score: 100 },
  { id: 2, name: 'Jane', score: 200 },
  { id: 3, name: 'Bob', score: 150 }
])

let computeCount = 0
const summaries = project.array(users, ({ get }) => {
  computeCount++
  const user = get()
  return `${user.name}: ${user.score}`
})

console.log(computeCount) // 3 (initial computation)

// Modify only the first user
users[0].score = 150
console.log(summaries[0]) // 'John: 150'
console.log(computeCount) // 4 (only index 0 recomputed)

// Add a new user
users.push({ id: 4, name: 'Alice', score: 175 })
console.log(computeCount) // 5 (only new index 3 computed)
```

#### Key Addition and Removal

`project()` automatically handles keys being added or removed from the source:

```typescript
const source = reactive({ a: 1, b: 2 })
const doubled = project.record(source, ({ get }) => get() * 2)

console.log(doubled.a) // 2
console.log(doubled.b) // 4

// Add new key
source.c = 3
console.log(doubled.c) // 6 (automatically computed)

// Remove key
delete source.a
console.log('a' in doubled) // false (automatically removed)
```

#### Cleanup

The returned object includes a `cleanup` symbol that stops all reactive effects:

```typescript
const result = project.array(items, ({ get }) => get() * 2)

// Later, when done
result[cleanup]() // Stops all effects and cleans up
```

#### Use Cases

- **Rendering Lists**: Transform data models into view models for JSX/HTML rendering, with only changed items recomputing
- **Derived Collections**: Create computed views of source data that stay in sync
- **Data Transformation**: Convert between collection types while maintaining reactivity
- **Performance Optimization**: Avoid full recomputation when only a few entries change

## Record Organization

### `organized()`

```typescript
import { cleanup, organized, reactive } from 'mutts/reactive'

const source = reactive<Record<string, number>>({ apples: 1, oranges: 2 })

const doubled = organized(source, (access, target) => {
  target[access.key] = access.get() * 2
  return () => delete target[access.key] // optional cleanup per key
})

console.log(doubled.apples) // 2

source.oranges = 5
console.log(doubled.oranges) // 10

delete source.apples
doubled[cleanup]() // run all remaining key cleanups (here deletes oranges)
```

#### Signature

```typescript
function organized<
  Source extends Record<PropertyKey, any>,
  Target extends object = Record<PropertyKey, any>
>(
  source: Source,
  apply: (access: OrganizedAccess<Source, keyof Source>, target: Target) => ScopedCallback | void,
  baseTarget?: Target
): Target & { [cleanup]: ScopedCallback }
```

- **source**: Any object with consistent value type. If it is not already reactive, `organized()` wraps it transparently.
- **apply**: Called once per own property. It receives the *stable* `target` object plus an accessor describing the property:
  - `access.key` → the original property key
  - `access.get()` / `access.set(value)` → always respect source getters/setters
  - `access.value` → convenience getter/setter backed by the same logic
  Return a cleanup to dispose per-key resources (event handlers, nested effects, bucket entries, …).
- **baseTarget** *(optional)*: Provide an initial object (e.g. `{ buckets: {}, cleanups: new Map() }`). It becomes reactive and is returned.
- **return value**: The same `target`, augmented with the `[cleanup]` symbol. Call `target[cleanup]()` to stop all per-key effects and run the stored cleanups.

Under the hood there is:

- A child effect per key that re-runs whenever that key’s value changes, automatically reusing and replacing the cleanup you returned.
- Automatic disposal when keys disappear or when `target[cleanup]()` is invoked.

#### Re-creating `mapped`-style records

```typescript
const metrics = reactive({ success: 3, errors: 1 })

const readable = organized(metrics, (access, target) => {
  target[access.key] = `${String(access.key)}: ${access.get()}`
  return () => delete target[access.key]
})

console.log(readable.success) // "success: 3"
metrics.errors = 4
console.log(readable.errors)  // "errors: 4"
```

#### Partitioning into buckets

`organized()` also covers the “partition” helper use case: classify properties into groups while keeping leftovers around.

```typescript
const props = reactive({
  'if:visible': true,
  'onClick': () => console.log('click'),
  'class:warning': true,
})

type Buckets = {
  events: Record<string, Function>
  classes: Record<string, boolean>
  plain: Record<string, unknown>
}

const buckets = organized(
  props,
  (access, target) => {
    const match = String(access.key).match(/^([^:]+):(.+)$/)
    if (!match) {
      target.plain[String(access.key)] = access.get()
      return () => delete target.plain[String(access.key)]
    }

    const [, group, name] = match
    if (group === 'if') {
      target.plain[name] = access.get()
      return () => delete target.plain[name]
    }
    if (group === 'class') {
      target.classes[name] = Boolean(access.get())
      return () => delete target.classes[name]
    }
    if (group === 'on') {
      target.events[name] = access.get() as Function
      return () => delete target.events[name]
    }
  },
  { events: {}, classes: {}, plain: {} } satisfies Buckets
)
```

Every cleanup removes the entry it created, keeping each bucket in sync with the current source props. This is the same pattern you can use to build a `partitioned()` helper or to manage “mounted” cleanup callbacks keyed by property.

#### Feeding other data structures

Because the target can be anything, you can build `Map`s, arrays of keys, or richer objects:

```typescript
const registry = organized(
  reactive({ foo: 1 }),
  (access, target) => {
    target.entries.set(access.key, access.get())
    target.allKeys.add(access.key)
    return () => {
      target.entries.delete(access.key)
      target.allKeys.delete(access.key)
    }
  },
  { entries: new Map<PropertyKey, number>(), allKeys: new Set<PropertyKey>() }
)
```

This flexibility makes `organized()` a good base for higher-level utilities such as `mappedKeys`, `partitioned`, or “group by” helpers: implement the logic once inside `apply`, export the tailored function, and reuse the same underlying reactive infrastructure.

> **Tip:** If you only need a simple per-key transform with the same shape, return a new record and skip custom `baseTarget`. When you need buckets, metadata, or parallel cleanup tracking, seed `baseTarget` with the structures you plan to mutate.

