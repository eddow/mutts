# IterableWeak

A TypeScript library that provides `IterableWeakMap` and `IterableWeakSet` - data structures that combine the benefits of weak references with the ability to iterate over their contents.

## Overview

The `iterableWeak` module provides two classes that use weak references to store keys/values while still allowing iteration. Unlike standard `WeakMap` and `WeakSet`, these classes allow you to iterate through their contents, making them useful for scenarios where you need both weak reference semantics and iteration capabilities.

**Important Note:** The behavior of these classes is highly dependent on the garbage collector. Some entries may be collected during iteration - don't attempt to "resuscitate" them by creating new references to collected keys.

## Key Features

- **Weak References**: Keys are stored using `WeakRef`, allowing garbage collection when keys are no longer referenced
- **Iteration Support**: Unlike standard `WeakMap`/`WeakSet`, you can iterate over entries
- **Map/Set Compatibility**: Implements the standard `Map` and `Set` interfaces
- **Set Operations**: `IterableWeakSet` includes advanced set operations (union, intersection, difference, etc.)
- **Automatic Cleanup**: Garbage collected entries are automatically removed during iteration
- **Type Safety**: Full TypeScript support with proper generic types

## API Reference

### `IterableWeakMap<K, V>`

A map-like data structure that uses weak references for keys while allowing iteration.

**Generic Parameters:**
- `K`: The key type (must extend `WeakKey` - objects, functions, or symbols)
- `V`: The value type

**Example:**
```typescript
import { IterableWeakMap } from 'mutts'

const map = new IterableWeakMap<object, string>()
const key = {}
map.set(key, 'value')
```

#### Constructor

```typescript
constructor(entries?: Iterable<[K, V]>)
```

Creates a new `IterableWeakMap` instance, optionally initialized with entries.

**Parameters:**
- `entries`: Optional iterable of key-value pairs to initialize the map

**Example:**
```typescript
const key1 = {}
const key2 = {}
const map = new IterableWeakMap([
  [key1, 'value1'],
  [key2, 'value2']
])
```

#### Methods

##### `set(key: K, value: V): this`

Sets the value for the given key. If the key already exists, updates its value.

**Parameters:**
- `key`: The key to set
- `value`: The value to associate with the key

**Returns:** The map instance for chaining

**Example:**
```typescript
map.set(key, 'new value')
map.set(key1, 'value1').set(key2, 'value2')
```

##### `get(key: K): V | undefined`

Retrieves the value associated with the given key.

**Parameters:**
- `key`: The key to look up

**Returns:** The associated value, or `undefined` if the key doesn't exist

**Example:**
```typescript
const value = map.get(key)
if (value !== undefined) {
  console.log('Found:', value)
}
```

##### `has(key: K): boolean`

Checks whether a key exists in the map.

**Parameters:**
- `key`: The key to check

**Returns:** `true` if the key exists, `false` otherwise

**Example:**
```typescript
if (map.has(key)) {
  console.log('Key exists')
}
```

##### `delete(key: K): boolean`

Removes a key-value pair from the map.

**Parameters:**
- `key`: The key to remove

**Returns:** `true` if the key existed and was removed, `false` otherwise

**Example:**
```typescript
if (map.delete(key)) {
  console.log('Key removed')
}
```

##### `clear(): void`

Removes all entries from the map.

**Example:**
```typescript
map.clear()
```

##### `forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void`

Executes a callback for each key-value pair in the map.

**Parameters:**
- `callbackfn`: Function to execute for each entry
- `thisArg`: Optional value to use as `this` when executing the callback

**Example:**
```typescript
map.forEach((value, key) => {
  console.log(`${key}: ${value}`)
})
```

##### `entries(): MapIterator<[K, V]>`

Returns an iterator over key-value pairs.

**Returns:** An iterator that yields `[key, value]` tuples

**Example:**
```typescript
for (const [key, value] of map.entries()) {
  console.log(key, value)
}
```

##### `keys(): MapIterator<K>`

Returns an iterator over keys.

**Returns:** An iterator that yields keys

**Example:**
```typescript
for (const key of map.keys()) {
  console.log(key)
}
```

##### `values(): MapIterator<V>`

Returns an iterator over values.

**Returns:** An iterator that yields values

**Example:**
```typescript
for (const value of map.values()) {
  console.log(value)
}
```

##### `[Symbol.iterator](): MapIterator<[K, V]>`

Allows the map to be iterated directly using `for...of` loops.

**Example:**
```typescript
for (const [key, value] of map) {
  console.log(key, value)
}
```

#### Properties

##### `size: number`

Returns the number of entries in the map. **Note:** This property computes the size by iterating, so it may exclude garbage-collected entries.

**Example:**
```typescript
console.log(`Map has ${map.size} entries`)
```

---

### `IterableWeakSet<K>`

A set-like data structure that uses weak references for values while allowing iteration.

**Generic Parameters:**
- `K`: The value type (must extend `WeakKey` - objects, functions, or symbols)

**Example:**
```typescript
import { IterableWeakSet } from 'mutts'

const set = new IterableWeakSet<object>()
const value = {}
set.add(value)
```

#### Constructor

```typescript
constructor(entries?: Iterable<K>)
```

Creates a new `IterableWeakSet` instance, optionally initialized with entries.

**Parameters:**
- `entries`: Optional iterable of values to initialize the set

**Example:**
```typescript
const value1 = {}
const value2 = {}
const set = new IterableWeakSet([value1, value2])
```

#### Methods

##### `add(value: K): this`

Adds a value to the set. If the value already exists, does nothing.

**Parameters:**
- `value`: The value to add

**Returns:** The set instance for chaining

**Example:**
```typescript
set.add(value)
set.add(value1).add(value2)
```

##### `has(value: K): boolean`

Checks whether a value exists in the set.

**Parameters:**
- `value`: The value to check

**Returns:** `true` if the value exists, `false` otherwise

**Example:**
```typescript
if (set.has(value)) {
  console.log('Value exists')
}
```

##### `delete(value: K): boolean`

Removes a value from the set.

**Parameters:**
- `value`: The value to remove

**Returns:** `true` if the value existed and was removed, `false` otherwise

**Example:**
```typescript
if (set.delete(value)) {
  console.log('Value removed')
}
```

##### `clear(): void`

Removes all entries from the set.

**Example:**
```typescript
set.clear()
```

##### `forEach(callbackfn: (value: K, value2: K, set: Set<K>) => void, thisArg?: any): void`

Executes a callback for each value in the set.

**Parameters:**
- `callbackfn`: Function to execute for each entry (receives the value twice, as per Set interface)
- `thisArg`: Optional value to use as `this` when executing the callback

**Example:**
```typescript
set.forEach((value) => {
  console.log(value)
})
```

##### `entries(): SetIterator<[K, K]>`

Returns an iterator over value-value pairs (as per Set interface).

**Returns:** An iterator that yields `[value, value]` tuples

**Example:**
```typescript
for (const [value] of set.entries()) {
  console.log(value)
}
```

##### `keys(): SetIterator<K>`

Returns an iterator over values (same as `values()` for sets).

**Returns:** An iterator that yields values

**Example:**
```typescript
for (const value of set.keys()) {
  console.log(value)
}
```

##### `values(): SetIterator<K>`

Returns an iterator over values.

**Returns:** An iterator that yields values

**Example:**
```typescript
for (const value of set.values()) {
  console.log(value)
}
```

##### `[Symbol.iterator](): SetIterator<K>`

Allows the set to be iterated directly using `for...of` loops.

**Example:**
```typescript
for (const value of set) {
  console.log(value)
}
```

#### Set Operations

##### `union<U>(other: ReadonlySetLike<U>): Set<K | U>`

Computes the union of this set with another set-like object.

**Parameters:**
- `other`: A set-like object (Set, IterableWeakSet, or any object with `has()` and `keys()` methods)

**Returns:** A new `Set` containing all values from both sets

**Example:**
```typescript
const set1 = new IterableWeakSet([value1, value2])
const set2 = new Set([value2, value3])
const union = set1.union(set2)
// union contains value1, value2, value3
```

##### `intersection<U>(other: ReadonlySetLike<U>): Set<K & U>`

Computes the intersection of this set with another set-like object.

**Parameters:**
- `other`: A set-like object

**Returns:** A new `Set` containing only values present in both sets

**Example:**
```typescript
const set1 = new IterableWeakSet([value1, value2])
const set2 = new Set([value2, value3])
const intersection = set1.intersection(set2)
// intersection contains only value2
```

##### `difference<U>(other: ReadonlySetLike<U>): Set<K>`

Computes the difference (this set minus the other set).

**Parameters:**
- `other`: A set-like object

**Returns:** A new `Set` containing values in this set but not in the other

**Example:**
```typescript
const set1 = new IterableWeakSet([value1, value2])
const set2 = new Set([value2, value3])
const difference = set1.difference(set2)
// difference contains only value1
```

##### `symmetricDifference<U>(other: ReadonlySetLike<U>): Set<K | U>`

Computes the symmetric difference (values in either set but not in both).

**Parameters:**
- `other`: A set-like object

**Returns:** A new `Set` containing values in either set but not in both

**Example:**
```typescript
const set1 = new IterableWeakSet([value1, value2])
const set2 = new Set([value2, value3])
const symDiff = set1.symmetricDifference(set2)
// symDiff contains value1 and value3
```

##### `isSubsetOf(other: ReadonlySetLike<unknown>): boolean`

Checks if this set is a subset of another set-like object.

**Parameters:**
- `other`: A set-like object

**Returns:** `true` if all values in this set are also in the other set

**Example:**
```typescript
const set1 = new IterableWeakSet([value1, value2])
const set2 = new Set([value1, value2, value3])
console.log(set1.isSubsetOf(set2)) // true
```

##### `isSupersetOf(other: ReadonlySetLike<unknown>): boolean`

Checks if this set is a superset of another set-like object.

**Parameters:**
- `other`: A set-like object

**Returns:** `true` if all values in the other set are also in this set

**Example:**
```typescript
const set1 = new IterableWeakSet([value1, value2, value3])
const set2 = new Set([value1, value2])
console.log(set1.isSupersetOf(set2)) // true
```

##### `isDisjointFrom(other: ReadonlySetLike<unknown>): boolean`

Checks if this set has no values in common with another set-like object.

**Parameters:**
- `other`: A set-like object

**Returns:** `true` if the sets have no common values

**Example:**
```typescript
const set1 = new IterableWeakSet([value1, value2])
const set2 = new Set([value3, value4])
console.log(set1.isDisjointFrom(set2)) // true
```

#### Properties

##### `size: number`

Returns the number of entries in the set. **Note:** This property computes the size by iterating, so it may exclude garbage-collected entries.

**Example:**
```typescript
console.log(`Set has ${set.size} entries`)
```

## Usage Examples

### Basic Map Usage

```typescript
import { IterableWeakMap } from 'mutts'

// Create a map
const cache = new IterableWeakMap<object, string>()

// Store values
const obj1 = { id: 1 }
const obj2 = { id: 2 }
cache.set(obj1, 'data1')
cache.set(obj2, 'data2')

// Retrieve values
console.log(cache.get(obj1)) // 'data1'

// Iterate over entries
for (const [key, value] of cache) {
  console.log(key, value)
}

// Check existence
if (cache.has(obj1)) {
  console.log('Object is cached')
}
```

### Basic Set Usage

```typescript
import { IterableWeakSet } from 'mutts'

// Create a set
const tracked = new IterableWeakSet<object>()

// Add values
const obj1 = { id: 1 }
const obj2 = { id: 2 }
tracked.add(obj1)
tracked.add(obj2)

// Check membership
if (tracked.has(obj1)) {
  console.log('Object is tracked')
}

// Iterate over values
for (const obj of tracked) {
  console.log(obj)
}
```

### Set Operations

```typescript
import { IterableWeakSet } from 'mutts'

const set1 = new IterableWeakSet<object>()
const set2 = new Set<object>()

const a = { id: 'a' }
const b = { id: 'b' }
const c = { id: 'c' }

set1.add(a)
set1.add(b)
set2.add(b)
set2.add(c)

// Union: all values from both sets
const union = set1.union(set2)
console.log(union.size) // 3

// Intersection: values in both sets
const intersection = set1.intersection(set2)
console.log(intersection.size) // 1 (only b)

// Difference: values in set1 but not in set2
const difference = set1.difference(set2)
console.log(difference.size) // 1 (only a)

// Symmetric difference: values in either set but not both
const symDiff = set1.symmetricDifference(set2)
console.log(symDiff.size) // 2 (a and c)
```

### Garbage Collection Behavior

```typescript
import { IterableWeakSet } from 'mutts'

const set = new IterableWeakSet<object>()

// Create objects
let obj1: object | null = { id: 1 }
const obj2 = { id: 2 }

set.add(obj1)
set.add(obj2)

console.log(set.size) // 2

// Remove reference to obj1
obj1 = null

// Force garbage collection (Node.js with --expose-gc)
if (global.gc) {
  global.gc()
  
  // After GC, obj1 may be collected
  // The size will reflect this on next iteration
  console.log(set.size) // May be 1 or 2 depending on GC timing
}
```

## Important Notes

### Garbage Collection

- **Non-deterministic behavior**: The garbage collector may collect entries at any time
- **Size property**: The `size` property iterates through entries, so it may exclude collected entries
- **Don't resuscitate**: If an entry is collected during iteration, don't try to recreate it
- **Iteration safety**: During iteration, collected entries are automatically cleaned up

### Type Constraints

- Keys/values must extend `WeakKey` (objects, functions, or symbols)
- Primitive values (strings, numbers, booleans) cannot be used as keys/values
- This is a limitation of JavaScript's `WeakRef` API

### Performance Considerations

- The `size` property requires iteration, so it's O(n) rather than O(1)
- Iteration automatically cleans up collected entries, which adds overhead
- For large collections, consider caching the size if needed frequently

## Use Cases

- **Cache Management**: Store cached data with automatic cleanup when keys are garbage collected
- **Event Listener Tracking**: Track objects that have event listeners without preventing garbage collection
- **Observer Patterns**: Maintain weak references to observers while still being able to iterate
- **Memory-Efficient Collections**: Collections that automatically clean up when objects are no longer referenced
- **Set Operations**: Advanced set operations on weakly-referenced collections

