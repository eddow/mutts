# Reactive Documentation

## Table of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
- [Core API](#core-api)
- [Effect System](#effect-system)
- [Evolution Tracking](#evolution-tracking)
- [Collections](#collections)
- [ReactiveArray](#reactivearray)
- [Class Reactivity](#class-reactivity)
- [Reactive Mixin](#reactive-mixin-for-always-reactive-classes)
- [Non-Reactive System](#non-reactive-system)
- [Computed Properties](#computed-properties)
- [Atomic Operations](#atomic-operations)
- [Advanced Patterns](#advanced-patterns)
- [Debugging and Development](#debugging-and-development)
- [API Reference](#api-reference)

## Introduction

### What is Reactivity?

Reactivity is a programming paradigm where the system automatically tracks dependencies between data and automatically updates when data changes. This library provides a powerful, lightweight reactive system for JavaScript/TypeScript applications.

### Core Concepts

- **Reactive Objects**: Plain JavaScript objects wrapped with reactive capabilities
- **Effects**: Functions that automatically re-run when their dependencies change
- **Dependencies**: Reactive properties that an effect depends on
- **Atomic Operations**: Batching multiple state changes to execute effects only once
- **Evolution Tracking**: Built-in change history for reactive objects
- **Collections**: Reactive wrappers for Array, Map, Set, WeakMap, and WeakSet

### Basic Example

```typescript
import { reactive, effect } from 'mutts/reactive'

// Create a reactive object
const user = reactive({ name: "John", age: 30 })

// Create an effect that depends on user properties
effect(() => {
    console.log(`User: ${user.name}, Age: ${user.age}`)
})

// When properties change, the effect automatically re-runs
user.name = "Jane"  // Triggers effect
user.age = 25       // Triggers effect
```

## Getting Started

### Installation

```bash
npm install mutts
```

### Basic Usage

```typescript
import { reactive, effect } from 'mutts/reactive'

// Make an object reactive
const state = reactive({
    count: 0,
    message: "Hello"
})

// Create reactive effects
effect(() => {
    console.log(`Count: ${state.count}`)
})

effect(() => {
    console.log(`Message: ${state.message}`)
})

// Changes trigger effects automatically
state.count++        // Triggers first effect
state.message = "Hi" // Triggers second effect
```

### Hello World Example

```typescript
import { reactive, effect } from 'mutts/reactive'

// Simple counter
const counter = reactive({ value: 0 })

effect(() => {
    document.body.innerHTML = `Count: ${counter.value}`
})

// Button click handler
document.getElementById('increment').onclick = () => {
    counter.value++
}
```

## Core API

### `reactive()`

Makes an object reactive by wrapping it in a proxy.

```typescript
function reactive<T extends Record<PropertyKey, any>>(target: T): T
```

**Parameters:**
- `target`: The object to make reactive

**Returns:** A reactive proxy of the original object

**Example:**
```typescript
const obj = { count: 0 }
const reactiveObj = reactive(obj)

// reactiveObj is now reactive
effect(() => {
    console.log(reactiveObj.count) // Tracks dependency
})

reactiveObj.count = 5 // Triggers effect
```

**Note:** The same object will always return the same proxy instance.

### `effect()`

Creates a reactive effect that automatically re-runs when dependencies change.

```typescript
function effect(
    fn: (dep: DependencyFunction, ...args: any[]) => (ScopedCallback | undefined | void),
    ...args: any[]
): ScopedCallback
```

**Parameters:**
- `fn`: The effect function that provides dependencies and may return a cleanup function
- `...args`: Additional arguments that are forwarded to the effect function

**Returns:** A cleanup function to stop the effect

**Example:**
```typescript
const state = reactive({ count: 0, mood: 'happy' })

const cleanup = effect(() => {
    console.log(`Count is: ${state.count}`)
    // Optional cleanup called before next run
    return () => console.log('Cleaning up...')
})

state.count++   // Does trigger: 1- the cleaning, 2- the effect
state.mood = 'surprised' // Does not trigger the effect

// Later...
cleanup() // Stops the effect
```

**Using effect with arguments (useful in loops):**
```typescript
const items = reactive([{ id: 1 }, { id: 2 }, { id: 3 }])

// Create effects in a loop, passing loop variables
for (let i = 0; i < items.length; i++) {
    effect((dep, index) => {
        console.log(`Item ${index}:`, items[index])
    }, i) // Pass the loop variable as argument
}
```

### `unwrap()`

Gets the original, non-reactive object from a reactive proxy.

```typescript
function unwrap<T>(proxy: T): T
```

**Example:**
```typescript
const original = { count: 0 }
const reactive = reactive(original)
const unwrapped = unwrap(reactive)

console.log(unwrapped === original) // true
console.log(unwrapped === reactive) // false
```

### `isReactive()`

Checks if an object is a reactive proxy.

```typescript
function isReactive(obj: any): boolean
```

### `isNonReactive()`

Checks if an object is marked as non-reactive.

```typescript
function isNonReactive(obj: any): boolean
```

## Effect System

### Basic Effects

Effects are the core of the reactive system. They automatically track dependencies and re-run when those dependencies change.

```typescript
const state = reactive({ count: 0, name: "John" })

effect(() => {
    // This effect depends on state.count
    console.log(`Count: ${state.count}`)
})

// Only changing count triggers the effect
state.count = 5     // Triggers effect
state.name = "Jane" // Does NOT trigger effect
```

### Effect Cleanup

Effects return cleanup functions that you can call to stop tracking dependencies.

```typescript
const state = reactive({ count: 0 })

const stopEffect = effect(() => {
    console.log(`Count: ${state.count}`)
})

// Later...
stopEffect() // Stops the effect

state.count = 10 // No longer triggers the effect
```

### Automatic Effect Cleanup

The reactive system provides **automatic cleanup** for effects, making memory management much easier. You **do not** have to call the cleanup function in most cases, but you **may** want to, especially if your effects have side effects like timers, DOM manipulation, or event listeners.

#### How Automatic Cleanup Works

1. **Parent-Child Cleanup**: When an effect is created inside another effect, it becomes a "child" of the parent effect. When the parent effect is cleaned up, it also cleans up its child effects.

2. **Garbage Collection Cleanup**: For top-level effects (not created inside other effects), the system uses JavaScript's garbage collection to automatically clean them up when their cleanup function no longer referenced.

#### Examples

**Parent-Child Cleanup:**
```typescript
const state = reactive({ a: 1, b: 2 })

const stopParent = effect(() => {
    state.a
    
    // Child effect - tied to the parent lifecycle
    effect(() => {
        state.b
        return () => console.log('Child cleanup')
    })
    
    return () => console.log('Parent cleanup')
})

// Cleans up both parent and child
stopParent() // Logs (order may vary): "Child cleanup", then "Parent cleanup"
```

**Garbage Collection Cleanup:**
```typescript
const state = reactive({ value: 1 })

// Top-level effect - automatically cleaned up via garbage collection
effect(() => {
    state.value
    return () => console.log('GC cleanup')
})

// No explicit cleanup needed - will be cleaned up when garbage collected
```

**When You Should Store Cleanup Functions:**

While cleanup can be automatic via GC, you should **store and remember** cleanup functions both to prevent the effect from being garbage-collected (keeping it alive) and to perform immediate cleanup when needed. If you don't hold a reference to the cleanup (or to the effect), the effect can be collected and its cleanup called automatically by GC; storing a reference keeps it active under your control:

```typescript
const state = reactive({ value: 1 })
const activeEffects: (() => void)[] = []

// Store cleanup functions for effects with side effects
for (let i = 0; i < 3; i++) {
    const stopEffect = effect(() => {
        state.value
        
        // Side effect that needs immediate cleanup
        const intervalId = setInterval(() => {
            console.log(`Timer ${i} running`)
        }, 1000)
        
        return () => {
            clearInterval(intervalId) // Prevent memory leaks
        }
    })
    
    activeEffects.push(stopEffect)
}

// Clean up all effects when needed
activeEffects.forEach(stop => stop())
```

**Key Points:**

- **You do not have to call cleanup** - GC may clean up effects when no references remain
- **You may want to call cleanup** - especially for effects with side effects
- **Store cleanup references to keep effects alive** - holding a reference prevents GC cleanup and gives you explicit stop control
- **Parent cleanup cleans child effects** - stopping a parent also stops its child effects
- **All effects use garbage collection** - as the primary cleanup mechanism

### Effect Dependencies

Effects automatically track which reactive properties they access.

```typescript
const state = reactive({ a: 1, b: 2, c: 3 })

effect(() => {
    // Only tracks state.a and state.b
    console.log(`Sum: ${state.a + state.b}`)
})

// Only these changes trigger the effect
state.a = 5 // Triggers effect
state.b = 10 // Triggers effect
state.c = 15 // Does NOT trigger effect
```

### Async Effects and the `dep` Parameter

The `effect` function provides a special `dep` parameter that restores the active effect context for dependency tracking in asynchronous operations. This is crucial because async functions lose the global active effect context when they yield control.

#### The Problem with Async Effects

When an effect function is synchronous, reactive property access automatically tracks dependencies, however, in async functions, the active effect context is lost when the function yields control. 

The `dep` parameter restores the active effect context for dependency tracking.

#### Understanding the active effect context

The reactive system uses a global active effect variable to track which effect is currently running:

```typescript
// Synchronous effect - active effect is maintained throughout
effect(() => {
    // active effect = this effect
    const value = state.count // ✅ Tracked (active effect is set)
    // active effect = this effect (still set)
    const another = state.name // ✅ Tracked (active effect is still set)
})

// Async effect - active effect is lost after await
effect(async () => {
    // active effect = this effect
    const value = state.count // ✅ Tracked (active effect is set)
    
    await someAsyncOperation() // Function exits, active effect = undefined
    
    // active effect = undefined (lost!)
    const another = state.name // ❌ NOT tracked (no active effect)
})

// Async effect with dep() - active effect is restored
effect(async (dep) => {
    // active effect = this effect
    const value = state.count // ✅ Tracked (active effect is set)
    
    await someAsyncOperation() // Function exits, active effect = undefined
    
    // dep() temporarily restores active effect for the callback
    const another = dep(() => state.name) // ✅ Tracked (active effect restored)
})
```

#### Key Benefits of `dep()` in Async Effects

1. **Restored Context**: `dep()` temporarily restores the active effect context for dependency tracking
2. **Consistent Tracking**: Reactive property access works the same way before and after `await`

### Nested Effects

Effects can be created inside other effects and will have separate effect scopes:

```typescript
import { effect, reactive } from 'mutts/reactive'

const state = reactive({ a: 0, b: 0 })

const stopOuter = effect(() => {
    state.a

    // Create an inner effect with its own scope
    const stopInner = effect(() => {
        state.b
    })

    // Return cleanup function for the inner effect
    return stopInner
})
```

### `untracked()`

The `untracked()` function allows you to run code without tracking dependencies, which can be useful for creating effects or performing operations that shouldn't be part of the current effect's dependency graph.

```typescript
import { effect, untracked, reactive } from 'mutts/reactive'

const state = reactive({ a: 0, b: 0 })

effect(() => {
    state.a

    // Create an inner effect without tracking the creation under the outer effect
    let stopInner: (() => void) | undefined
    untracked(() => {
        stopInner = effect(() => {
            state.b
        })
    })

    // Optionally stop it immediately to avoid accumulating watchers
    stopInner && stopInner()
})
```

**Use cases for `untracked()`:**
- Creating effects inside other effects without coupling their dependencies
- Performing side effects that shouldn't trigger when dependencies change
- Avoiding circular dependencies in complex reactive systems

### Effect Options and debugging

Configure the reactive system behavior:

```typescript
import { options as reactiveOptions } from 'mutts/reactive'

// Set maximum effect chain depth
reactiveOptions.maxEffectChain = 50

// Set maximum deep watch traversal depth
reactiveOptions.maxDeepWatchDepth = 200

// Enable debug logging
reactiveOptions.enter = (effect) => console.log('Entering effect:', effect)
reactiveOptions.leave = (effect) => console.log('Leaving effect:', effect)
reactiveOptions.chain = (caller, target) => console.log('Chaining:', caller, '->', target)
```

## Advanced Effects

### Recording Results inside Effects

If you want to capture derived values from an effect, push them from inside the effect body. Use the returned cleanup to manage resources between runs.

```typescript
const state = reactive({ count: 0 })
const results: number[] = []

const stop = effect(() => {
    results.push(state.count * 2)
    return () => {
        // cleanup between runs if needed
    }
})

state.count = 5 // results: [0, 10]
stop()
```

### Effect Cleanup Functions

Effects can return cleanup functions that run before the next execution.

```typescript
const state = reactive({ count: 0 })

effect(() => {
    const interval = setInterval(() => {
        console.log('Count:', state.count)
    }, 1000)
    
    return () => {
        clearInterval(interval)
        console.log('Cleaned up interval')
    }
})

// When state.count changes, the cleanup runs first
state.count = 5
```

### Effect Lifecycle

1. **Initial Run**: Effect runs immediately when created
2. **Dependency Change**: When dependencies change, cleanup runs, then effect re-runs
3. **Manual Stop**: Calling the cleanup function stops the effect permanently

```typescript
const state = reactive({ count: 0 })

const stop = effect(() => {
    console.log('Effect running, count:', state.count)
    return () => console.log('Cleanup running')
})

console.log('Effect created')

state.count = 5
// Output:
// Effect created
// Effect running, count: 0
// Cleanup running
// Effect running, count: 5

stop() // Effect stops permanently
```

### Effect Arguments

Effects can accept additional arguments that are forwarded to the effect function. This is particularly useful in loops or when you need to pass context to the effect:

```typescript
const items = reactive([
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
    { id: 3, name: 'Item 3' }
])

// Create effects for each item with the item index
const effectCleanups: (() => void)[] = []

for (let i = 0; i < items.length; i++) {
    const cleanup = effect((dep, index) => {
        console.log(`Item ${index}:`, items[index].name)
        
        // The index is captured in the closure and passed as argument
        return () => console.log(`Cleaning up effect for item ${index}`)
    }, i)
    
    effectCleanups.push(cleanup)
}

// Later, clean up all effects
effectCleanups.forEach(cleanup => cleanup())
```

### Watch Function

The `watch` function provides a more direct way to observe changes in reactive objects. It comes in two forms:

#### Watch with Value Function

```typescript
const state = reactive({ count: 0, name: 'John' })

const stop = watch(
    () => state.count, // Value function
    (newValue, oldValue) => {
        console.log(`Count changed from ${oldValue} to ${newValue}`)
    }
)

state.count = 5 // Triggers: "Count changed from 0 to 5"
state.name = 'Jane' // No trigger (not watching name)
```

#### Watch Object Properties

The second form of `watch` allows you to watch any property change on a reactive object:

```typescript
const user = reactive({ 
    name: 'John', 
    age: 30, 
    email: 'john@example.com' 
})

const stop = watch(
    user, // The reactive object to watch
    () => {
        console.log('Any property of user changed!')
        console.log('Current user:', user)
    }
)

user.name = 'Jane' // Triggers the callback
user.age = 31      // Triggers the callback
user.email = 'jane@example.com' // Triggers the callback
```

#### Use Cases

**Object-level watching** is particularly useful for:

- **Form validation**: Watch all form fields for changes
- **Auto-save**: Save whenever any field in a document changes
- **Logging**: Track all changes to a state object
- **Dirty checking**: Detect if any property has been modified

```typescript
const form = reactive({
    firstName: '',
    lastName: '',
    email: '',
    isValid: false
})

const stop = watch(form, () => {
    // Auto-save whenever any field changes
    saveForm(form)
    
    // Update validation status
    form.isValid = form.firstName && form.lastName && form.email
})

// Any change to firstName, lastName, or email will trigger auto-save
form.firstName = 'John'
form.lastName = 'Doe'
form.email = 'john.doe@example.com'
```

#### Deep Watching

For both forms of `watch`, you can enable deep watching by passing `{ deep: true }` in the options:

```typescript
const state = reactive({
    user: {
        name: 'John',
        profile: { age: 30 }
    }
})

// Deep watch - triggers on nested property changes
const stop = watch(state, () => {
    console.log('Any nested property changed!')
}, { deep: true })

state.user.name = 'Jane'        // Triggers
state.user.profile.age = 31     // Triggers (nested change)
```

**Deep Watching Behavior:**

- **Unreactive objects are skipped**: Deep watching will not traverse into objects marked as unreactive using `@unreactive` or `unreactive()`
- **Collections are handled specially**:
  - **Arrays**: All elements and length changes are tracked
  - **Sets**: All values are tracked (keys are not separate in Sets)
  - **Maps**: All values are tracked (keys are not tracked separately)
  - **WeakSet/WeakMap**: Cannot be deep watched (not iterable), only replacement triggers
- **Circular references**: Handled safely - There is also a configurable depth limit
- **Performance**: Deep watching has higher overhead than shallow watching

```typescript
// Example with collections
const state = reactive({
    items: [1, 2, 3],
    tags: new Set(['a', 'b']),
    metadata: new Map([['key1', 'value1']])
})

const stop = watch(state, () => {
    console.log('Collection changed')
}, { deep: true })

state.items.push(4)           // Triggers
state.items[0] = 10           // Triggers
state.tags.add('c')           // Triggers
state.metadata.set('key2', 'value2') // Triggers

// WeakSet/WeakMap only trigger on replacement
const weakSet = new WeakSet()
state.weakData = weakSet      // Triggers (replacement)
// Changes to weakSet contents won't trigger (not trackable)
```

#### Cleanup

Both forms of `watch` return a cleanup function:

```typescript
const stop = watch(user, () => {
    console.log('User changed')
})

// Later, stop watching
stop()
```

## Evolution Tracking

### Understanding Object Evolution

The reactive system tracks how objects change over time, creating an "evolution history" that you can inspect.

```typescript
import { getState } from './reactive'

const obj = reactive({ count: 0 })
let state = getState(obj)

effect(() => {
    while ('evolution' in state) {
        console.log('Change:', state.evolution)
        state = state.next
    }
    
    console.log('Current count:', obj.count)
})

obj.count = 5
obj.count = 10
```

### `getState()` - Accessing Change History

Returns the current state object for tracking evolution.

```typescript
function getState(obj: any): State
```

**Returns:** A state object that does contain evolution information ( = `{}`) but will in a next evolution call if the object state has evolved.

### Evolution Types

The system tracks different types of changes:

- **`add`**: Property was added
- **`set`**: Property value was changed
- **`del`**: Property was deleted
- **`bunch`**: Collection operation (array methods, map/set operations)
- **`invalidate`**: Computed property cache was invalidated due to dependency changes

```typescript
const obj = reactive({ count: 0 })
let state = getState(obj)

effect(() => {
    let changes = []
    while ('evolution' in state) {
        changes.push(state.evolution)
        state = state.next
    }
    
    if (changes.length > 0) {
        console.log('Changes since last effect:', changes)
    }
})

obj.count = 5        // { type: 'set', prop: 'count' }
obj.newProp = 'test' // { type: 'add', prop: 'newProp' }
delete obj.count      // { type: 'del', prop: 'count' }

// Array operations
const array = reactive([1, 2, 3])
array.push(4)        // { type: 'bunch', method: 'push' }
array.reverse()      // { type: 'bunch', method: 'reverse' }

// Computed property invalidation
const state = reactive({ a: 1, b: 2 })
const getter = () => state.a + state.b

computed(getter)      // Initial computation
state.a = 5          // This triggers { type: 'invalidate', prop: getter } in computed cache
computed(getter)      // Recomputes due to dependency change
```

### Evolution Type Details

#### `invalidate` Evolution Type

The `invalidate` evolution type occurs when computed properties need to be recalculated due to dependency changes:

```typescript
import { computed, getState, profileInfo } from 'mutts/reactive'

const state = reactive({ a: 1, b: 2 })
const getter = () => state.a + state.b

// Access computed cache state for tracking
let computedState = getState(profileInfo.computedCache)

effect(() => {
    while ('evolution' in computedState) {
        console.log('Computed change:', computedState.evolution)
        computedState = computedState.next
    }
    
    // Reset for next run
    computedState = getState(profileInfo.computedCache)
})

// Initial computation - no evolution event yet
const result1 = computed(getter) // 3

// Change dependency - triggers invalidate evolution
state.a = 5
// Output: "Computed change: { type: 'invalidate', prop: [getter function] }"

const result2 = computed(getter) // 7 (recomputed)
```

**When `invalidate` occurs:**
- A computed property's dependency changes
- The computed cache needs to be cleared and recalculated
- The `prop` field contains the getter function that was invalidated

### Change History Patterns

Common patterns for using evolution tracking:

```typescript
// Pattern 1: Count changes
let state = getState(obj)
effect(() => {
    let changes = 0
    while ('evolution' in state) {
        changes++
        state = state.next
    }
    
    if (changes > 0) {
        console.log(`Detected ${changes} changes`)
        state = getState(obj) // Reset for next run
    }
})

// Pattern 2: Filter specific changes
let state = getState(obj)
effect(() => {
    const relevantChanges = []
    while ('evolution' in state) {
        if (state.evolution.type === 'set') {
            relevantChanges.push(state.evolution)
        }
        state = state.next
    }
    
    if (relevantChanges.length > 0) {
        console.log('Property updates:', relevantChanges)
        state = getState(obj)
    }
})
```

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

## ReactiveArray

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

## Class Reactivity

### `@reactive` Decorator

The `@reactive` decorator makes class instances automatically reactive. This is the recommended approach for adding reactivity to classes.

```typescript
import { reactive } from 'mutts/reactive'

@reactive
class User {
    name: string
    age: number
    
    constructor(name: string, age: number) {
        this.name = name
        this.age = age
    }
    
    updateAge(newAge: number) {
        this.age = newAge
    }
}

const user = new User("John", 30)

effect(() => {
    console.log(`User: ${user.name}, Age: ${user.age}`)
})

user.updateAge(31) // Triggers effect
user.name = "Jane" // Triggers effect
```

### Functional Syntax

You can also use the functional syntax for making classes reactive:

```typescript
import { reactive } from 'mutts/reactive'

class User {
    name: string
    age: number
    
    constructor(name: string, age: number) {
        this.name = name
        this.age = age
    }
    
    updateAge(newAge: number) {
        this.age = newAge
    }
}

const ReactiveUser = reactive(User)
const user = new ReactiveUser("John", 30)

effect(() => {
    console.log(`User: ${user.name}, Age: ${user.age}`)
})

user.updateAge(31) // Triggers effect
user.name = "Jane" // Triggers effect
```

### `ReactiveBase` for Complex Inheritance

For complex inheritance trees, especially when you need to solve constructor reactivity issues, extend `ReactiveBase`:

```typescript
import { ReactiveBase, reactive } from 'mutts/reactive'

class GameObject extends ReactiveBase {
    id = 'game-object'
    position = { x: 0, y: 0 }
}

class Entity extends GameObject {
    health = 100
}

@reactive
class Player extends Entity {
    name = 'Player'
    level = 1
}

const player = new Player()

effect(() => {
    console.log(`Player ${player.name} at (${player.position.x}, ${player.position.y})`)
})

player.position.x = 10 // Triggers effect
player.health = 80     // Triggers effect
```

**Advantages of `ReactiveBase`:**

1. **Constructor Reactivity**: Solves the issue where `this` in the constructor is not yet reactive
2. **Inheritance Safety**: Prevents reactivity from being added to prototype chains in complex inheritance trees
3. **No Side Effects**: The base class itself has no effect - it only enables proper reactivity when combined with `@reactive`

### Choosing the Right Approach

**Use `@reactive` decorator when:**
- You have simple classes without complex inheritance
- You want the cleanest, most modern syntax
- You don't need to modify or use `this` in the constructor

**Use `ReactiveBase` + `@reactive` when:**
- You have complex inheritance trees (like game objects, UI components)
- You need to modify or use `this` in the constructor
- You want to prevent reactivity from being added to prototype chains

### `Reactive` Mixin for Always-Reactive Classes

The `Reactive` mixin provides a class that is always reactive without needing the `@reactive` decorator. This is useful when you want a class that is inherently reactive and can be used as both a base class and a mixin.

```typescript
import { Reactive, effect } from 'mutts/reactive'

// As a base class - no @reactive decorator needed
class Counter extends Reactive {
    count = 0
    
    increment() {
        this.count++
    }
}

// As a mixin function
class BaseModel {
    id = Math.random().toString(36)
}

class UserModel extends Reactive(BaseModel) {
    name = ''
    email = ''
    
    updateName(newName: string) {
        this.name = newName
    }
}

const counter = new Counter()
const user = new UserModel()

effect(() => {
    console.log('Count:', counter.count)
})

effect(() => {
    console.log('User:', user.name)
})

counter.increment() // Triggers effect
user.updateName('John') // Triggers effect
```

**Key Features of `Reactive` Mixin:**

1. **Always Reactive**: No need for `@reactive` decorator
2. **Mixin Support**: Can be used as both `extends Reactive` and `extends Reactive(BaseClass)`
3. **Error Prevention**: Throws an error if used with `@reactive` decorator (since it's redundant)
4. **Caching**: Mixin results are cached for performance

**When to use `Reactive` mixin:**
- You want a class that is always reactive by design
- You need mixin functionality for combining with other base classes
- You want to avoid the `@reactive` decorator syntax
- You're building a library where reactivity is a core feature

**Important**: The `@reactive` decorator will throw an error when used with `Reactive` mixin since it's redundant:

```typescript
// ❌ This will throw an error
@reactive
class MyClass extends Reactive {
    value = 0
}

// ✅ This is the correct way
class MyClass extends Reactive {
    value = 0
}
```

### Making Existing Class Instances Reactive

You can also make existing class instances reactive:

```typescript
class Counter {
    count = 0
    
    increment() {
        this.count++
    }
}

const counter = new Counter()
const reactiveCounter = reactive(counter)

effect(() => {
    console.log('Count:', reactiveCounter.count)
})

reactiveCounter.increment() // Triggers effect
```

### Method Reactivity

Methods that modify properties automatically trigger effects:

```typescript
@reactive
class ShoppingCart {
    items: string[] = []
    
    addItem(item: string) {
        this.items.push(item)
    }
    
    removeItem(item: string) {
        const index = this.items.indexOf(item)
        if (index > -1) {
            this.items.splice(index, 1)
        }
    }
}

const cart = new ShoppingCart()

effect(() => {
    console.log('Cart items:', cart.items)
})

cart.addItem('Apple')  // Triggers effect
cart.removeItem('Apple') // Triggers effect
```

### Inheritance Support

The `@reactive` decorator works with inheritance:

```typescript
@reactive
class Animal {
    species: string
    
    constructor(species: string) {
        this.species = species
    }
}

class Dog extends Animal {
    breed: string
    
    constructor(breed: string) {
        super('Canis')
        this.breed = breed
    }
}

const dog = new Dog('Golden Retriever')

effect(() => {
    console.log(`${dog.species}: ${dog.breed}`)
})

dog.breed = 'Labrador' // Triggers effect
```

**Note**: When using inheritance with the `@reactive` decorator, apply it to the base class. The decorator will automatically handle inheritance properly.

## Non-Reactive System

### `unreactive()`

Marks objects or classes as non-reactive, preventing them from being wrapped.

```typescript
function unreactive<T>(target: T): T
function unreactive(target: Constructor<T>): Constructor<T>
```

**Examples:**

```typescript
// Mark individual object as non-reactive
const obj = { count: 0 }
unreactive(obj)
const reactiveObj = reactive(obj) // Returns obj unchanged

// Mark entire class as non-reactive
class Utility {
    static helper() { return 'help' }
}
unreactive(Utility)
const instance = new Utility()
const reactiveInstance = reactive(instance) // Returns instance unchanged
```

### `@unreactive` Decorator

Mark class properties as non-reactive using class-level syntax.

```typescript
@reactive
@unreactive('id')
class User {
    id: string = 'user-123'
    
    name: string = 'John'
    age: number = 30
}

const user = new User()

effect(() => {
    console.log(user.name, user.age) // Tracks these
    console.log(user.id)             // Does NOT track this
})

user.name = 'Jane' // Triggers effect
user.id = 'new-id' // Does NOT trigger effect
```

You can mark multiple properties as unreactive:

```typescript
@reactive
@unreactive('id', 'metadata', 'internalState')
class User {
    id: string = 'user-123'
    metadata: any = {}
    internalState: any = {}
    
    name: string = 'John'
    age: number = 30
}
```

### Non-Reactive Classes

Classes marked as non-reactive bypass the reactive system entirely:

```typescript
class Config {
    apiUrl: string = 'https://api.example.com'
    timeout: number = 5000
}

unreactive(Config)
```

Alternatively, you can use the `@unreactive` decorator without arguments to mark the entire class as non-reactive:

```typescript
@unreactive
class Config {
    apiUrl: string = 'https://api.example.com'
    timeout: number = 5000
}

const ReactiveConfig = reactive(Config)
const config = new ReactiveConfig()

effect(() => {
    console.log('Config:', config.apiUrl, config.timeout)
})

// These changes won't trigger effects
config.apiUrl = 'https://new-api.example.com'
config.timeout = 10000
```

### Making Special Reactive Objects Non-Reactive

Special reactive objects (Arrays, Maps, Sets, WeakMaps, WeakSets) can also be made non-reactive:

```typescript
// Make individual reactive collections non-reactive
const array = reactive([1, 2, 3])
unreactive(array) // array is no longer reactive

const map = reactive(new Map([['key', 'value']]))
unreactive(map) // map is no longer reactive

const set = reactive(new Set([1, 2, 3]))
unreactive(set) // set is no longer reactive
```

**Making reactive collection classes non-reactive:**

```typescript
// Make the entire ReactiveArray class non-reactive
unreactive(ReactiveArray)

// Now all ReactiveArray instances will be non-reactive
const array = reactive([1, 2, 3]) // Returns non-reactive array
const reactiveArray = new ReactiveArray([1, 2, 3]) // Non-reactive instance

// Make other reactive collection classes non-reactive
unreactive(ReactiveMap)
unreactive(ReactiveSet)
unreactive(ReactiveWeakMap)
unreactive(ReactiveWeakSet)
```

**Use cases for non-reactive collections:**
- Large datasets that don't need reactivity
- Performance-critical operations
- Static configuration data
- Temporary data structures

### Performance Considerations

Non-reactive objects can improve performance:

```typescript
// Good: Mark large, rarely-changing objects as non-reactive
const config = unreactive({
    apiEndpoints: { /* large config object */ },
    featureFlags: { /* many flags */ }
})

// Good: Mark utility classes as non-reactive
class MathUtils {
    static PI = 3.14159
    static square(x: number) { return x * x }
}
unreactive(MathUtils)

// Good: Mark properties that don't need reactivity
class User {
    @unreactive
    metadata: any = {} // Large metadata object
    
    name: string = 'John' // This should be reactive
}
```

## Computed Properties

### `@computed` Decorator

Creates computed properties that cache their values and only recompute when dependencies change.

```typescript
@reactive
class Calculator {
    @computed
    get area() {
        return this.width * this.height
    }
    
    width: number = 10
    height: number = 5
}

const calc = new Calculator()

effect(() => {
    console.log('Area:', calc.area)
})

calc.width = 20  // Triggers effect, recomputes area
calc.height = 10 // Triggers effect, recomputes area
```

### Computed Functions

Create computed values outside of classes:

```typescript
const state = reactive({ a: 1, b: 2 })

const sum = () => state.a + state.b
const product = () => state.a * state.b

effect(() => {
    console.log('Sum:', computed(sum), 'Product:', computed(product))
})

state.a = 5 // Both computed values update
```

**Note:** The `computed()` function takes a getter function and returns the cached or recalculated value. You call `computed(getter)` each time you need the value, not assign it to a variable.

### `computed.map()`

Creates a reactive array by mapping over an input array. The mapper receives the current item value, its index, and the previous mapped value for that index.

```typescript
const input = reactive([1, 2, 3])
const mapped = computed.map(input, (value, index, oldValue) => value * 2)

console.log(mapped) // [2, 4, 6]

// When input changes, mapped automatically updates
input.push(4)
console.log(mapped) // [2, 4, 6, 8]
```

**Mapper signature:**

```typescript
(value: T, index: number, oldValue?: U) => U
```

- **value**: current element from the input array
- **index**: current element index
- **oldValue**: previously computed value at the same index (useful for incremental updates)

**Key Features:**

- **Live Reactivity**: Output array updates when the input array changes (push/pop/splice/assignments)
- **Granular Recompute**: Only indices that change are recomputed; `oldValue` enables incremental updates
- **Simple Contract**: Mapper works directly with `(value, index, oldValue)`

**Performance Characteristics:**

```typescript
const users = reactive([
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 }
])

let computeCount = 0
const processedUsers = computed.map(users, (user) => {
  computeCount++
  return `${user.name} (${user.age})`
})

console.log(computeCount) // 2 (initial computation)

// Modify one user - only that index recomputes
users[0].age = 31
console.log(processedUsers[0]) // "John (31)"
console.log(computeCount) // 3
```

**Advanced Usage:**

```typescript
const orders = reactive([
  { items: [{ price: 10 }, { price: 20 }] },
  { items: [{ price: 15 }] }
])

const orderTotals = computed.map(orders, (order) => (
  order.items.reduce((sum, item) => sum + item.price, 0)
))
```

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNNY' still present for John
```

**When to use which:**

- Use `computed.map` for simple per-index mapping with `(value, index, oldValue)` when you don't need identity-based caching across reorders.
- Use `computed.memo` when you want to cache per input object and preserve mapped outputs (and their internal reactive state) across array reordering operations.

### `computed.memo()`

Creates a reactive mapped array with memoization by input identity. Results are cached per input object so that reordering (e.g., `splice`, `push`, `pop`, `unshift`) preserves the computed output and its internal state for the same input reference.

```typescript
const inputs = reactive([{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }])
let computeCount = 0

const mapped = computed.memo(inputs, (input) => {
  computeCount++
  const result: any = {}

  // Example of internal reactive state derived from the input
  effect(() => {
    result.name = input.name.toUpperCase()
  })

  // You can also expose helpers that mutate the original input
  result.setName = (newName: string) => {
    input.name = newName
  }

  return result
})

// Initial computations
console.log(computeCount) // 3

// Update through helper; no new compute, internal effect updates
mapped[0].setName('Johnny')
console.log(computeCount) // 3
console.log(mapped[0].name) // 'JOHNNY'

// Move an item out and back in; memoization keeps the same mapped object
const buf = inputs.pop()!
console.log(computeCount) // 3
inputs.unshift(buf)
console.log(computeCount) // 3 (no recompute for existing inputs)
console.log(mapped[1].name) // Previous 'JOHNN