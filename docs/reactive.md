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

1. **Parent-Child Independence**: When an effect is created inside another effect, it becomes a "child" of the parent effect. However, when the parent effect is cleaned up, child effects become independent and are NOT automatically cleaned up - they continue to run until they're garbage collected or explicitly cleaned up.

2. **Garbage Collection Cleanup**: For top-level effects (not created inside other effects) and orphaned child effects, the system uses JavaScript's garbage collection to automatically clean them up when they're no longer referenced.

#### Examples

**Parent-Child Independence:**
```typescript
const state = reactive({ a: 1, b: 2 })

const stopParent = effect(() => {
    state.a
    
    // Child effect - becomes independent when parent is cleaned up
    effect(() => {
        state.b
        return () => console.log('Child cleanup')
    })
    
    return () => console.log('Parent cleanup')
})

// Only cleans up the parent - child becomes independent
stopParent() // Logs: "Parent cleanup" (child continues running)
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

While cleanup is automatic, you should **store and remember** cleanup functions when your effects have side effects that need immediate cleanup:

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

- **You do not have to call cleanup** - the system handles it automatically via garbage collection
- **You may want to call cleanup** - especially for effects with side effects
- **You have to store and remember cleanup** - when you need immediate control over when effects stop
- **Child effects become independent** - when their parent effect is cleaned up, they continue running
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
```

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

Mark class properties as non-reactive.

```typescript
@reactive
class User {
    @unreactive
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

### Non-Reactive Classes

Classes marked as non-reactive bypass the reactive system entirely:

```typescript
class Config {
    apiUrl: string = 'https://api.example.com'
    timeout: number = 5000
}

unreactive(Config)
```
-or-
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

const sum = computed(() => state.a + state.b)
const product = computed(() => state.a * state.b)

effect(() => {
    console.log('Sum:', sum, 'Product:', product)
})

state.a = 5 // Both computed values update
```

### Caching and Invalidation

Computed values are cached until their dependencies change:

```typescript
const state = reactive({ x: 1, y: 2 })

let computeCount = 0
const expensive = computed(() => {
    computeCount++
    console.log('Computing expensive value...')
    return Math.pow(state.x, state.y)
})

console.log('First access:', expensive) // Computes once
console.log('Second access:', expensive) // Uses cached value
console.log('Compute count:', computeCount) // 1

state.x = 2 // Invalidates cache
console.log('After change:', expensive) // Recomputes
console.log('Compute count:', computeCount) // 2
```

### Computed vs Effects

Choose between computed and effects based on your needs:

```typescript
const state = reactive({ count: 0 })

// Use computed when you need a value
const doubled = computed(() => state.count * 2)

// Use effect when you need side effects
effect(() => {
    console.log('Count doubled:', doubled)
    document.title = `Count: ${state.count}`
})

state.count = 5
// doubled becomes 10
// effect logs and updates title
```

## Atomic Operations

The `atomic` function and `@atomic` decorator are powerful tools for batching reactive effects. When applied to a method or function, they ensure that all effects triggered by reactive state changes within that scope are batched together and executed only once, rather than after each individual change.

### Overview

In reactive systems, each state change typically triggers its dependent effects immediately. However, when you need to make multiple related changes as a single unit, this can lead to:

- Multiple unnecessary effect executions
- Inconsistent intermediate states being observed
- Performance overhead from redundant computations

The `atomic` function and `@atomic` decorator solve this by deferring effect execution until the function or method completes, treating all changes as a single atomic operation.

### Basic Usage

#### Decorator Syntax

```typescript
import { reactive, effect, atomic } from 'mutts'

const state = reactive({ a: 0, b: 0, c: 0 })
let effectCount = 0

effect(() => {
  effectCount++
  console.log(`Effect ran: a=${state.a}, b=${state.b}, c=${state.c}`)
})

class StateManager {
  @atomic
  updateAll() {
    state.a = 1
    state.b = 2
    state.c = 3
  }
}

const manager = new StateManager()
manager.updateAll()

// Output:
// Effect ran: a=0, b=0, c=0  (initial run)
// Effect ran: a=1, b=2, c=3  (only one additional run despite 3 changes)
```

#### Function Syntax

For standalone functions or when you need more flexibility, you can use the `atomic` function directly:

```typescript
import { reactive, effect, atomic } from 'mutts'

const state = reactive({ a: 0, b: 0, c: 0 })
let effectCount = 0

effect(() => {
  effectCount++
  console.log(`Effect ran: a=${state.a}, b=${state.b}, c=${state.c}`)
})

// Using atomic function
atomic(() => {
  state.a = 1
  state.b = 2
  state.c = 3
})

// Output:
// Effect ran: a=0, b=0, c=0  (initial run)
// Effect ran: a=1, b=2, c=3  (only one additional run despite 3 changes)
```

#### Returning Values

The atomic function can return values:

```typescript
const result = atomic(() => {
  state.a = 10
  state.b = 20
  return state.a + state.b
})

console.log(result) // 30
```

#### Atomic Method Return Values

The `@atomic` decorator also supports return values from methods:

```typescript
@reactive
class Calculator {
  @atomic
  updateAndCalculate(a: number, b: number) {
    this.a = a
    this.b = b
    return { sum: a + b, product: a * b }
  }
}

const calc = new Calculator()
const result = calc.updateAndCalculate(5, 10)
console.log(result) // { sum: 15, product: 50 }
```

**Key Points:**
- Atomic methods can return any value type (primitives, objects, functions)
- Return values are computed during method execution
- Effects are batched until the method completes, regardless of return values
- Both read-only and state-modifying methods can return values

```typescript
@reactive
class DataProcessor {
  @atomic
  processData(items: Item[]) {
    // Read-only method with return value
    const total = items.reduce((sum, item) => sum + item.value, 0)
    return total
  }

  @atomic
  updateAndProcess(items: Item[]) {
    // State-modifying method with return value
    this.items = items
    this.processedCount = items.length
    this.lastProcessed = new Date()
    
    return {
      count: items.length,
      total: items.reduce((sum, item) => sum + item.value, 0)
    }
  }
}
```

### When to Use Each Approach

#### Use `@atomic` Decorator When:
- You're working with class methods
- You want to declare atomic behavior at the method level
- You prefer declarative syntax
- The method is part of a reactive class

```typescript
@reactive
class TodoManager {
  @atomic
  addTodo(text: string) {
    this.todos.push({ id: Date.now(), text, completed: false })
    this.updateStats()
  }
}
```

#### Use `atomic()` Function When:
- You need atomic behavior for standalone functions
- You're working with functional code
- You need to conditionally apply atomic behavior
- You're working outside of classes

```typescript
// Conditional atomic behavior
const updateState = (shouldBatch: boolean) => {
  const updateFn = () => {
    state.a = 1
    state.b = 2
  }
  
  return shouldBatch ? atomic(updateFn) : updateFn()
}

// Functional approach
const processItems = (items: Item[]) => {
  return atomic(() => {
    items.forEach(item => state.items.set(item.id, item))
    state.count = state.items.size
    return state.count
  })
}
```

### Key Behaviors

#### Immediate Execution, Batched Effects

The decorated method executes immediately, but effects are deferred until completion:

```typescript
class TestClass {
  @atomic
  updateAndLog() {
    console.log('Method starts')
    state.a = 1
    console.log('After setting a')
    state.b = 2
    console.log('After setting b')
    console.log('Method ends')
  }
}

// Execution order:
// Method starts
// After setting a
// After setting b
// Method ends
// Effect runs with final values
```

#### Nested Atomic Methods

Multiple atomic methods can be nested, and all effects are batched at the outermost level:

```typescript
class TestClass {
  @atomic
  updateA() {
    state.a = 1
  }

  @atomic
  updateB() {
    state.b = 2
  }

  @atomic
  updateAll() {
    this.updateA()
    this.updateB()
    state.c = 3
  }
}

// Calling updateAll() will batch all effects from updateA, updateB, and the direct assignment
```

#### Cascading Effects

Effects that trigger other effects are also batched within atomic methods:

```typescript
// Create cascading effects
effect(() => {
  state.b = state.a * 2
})
effect(() => {
  state.c = state.b + 1
})

class TestClass {
  @atomic
  triggerCascade() {
    state.a = 5  // This triggers the cascade
  }
}

// All cascading effects are batched together
```

### Advanced Usage

#### Working with Reactive Classes

The `@atomic` decorator works seamlessly with `@reactive` classes:

```typescript
@reactive
class Counter {
  value = 0
  multiplier = 1

  @atomic
  updateBoth(newValue: number, newMultiplier: number) {
    this.value = newValue
    this.multiplier = newMultiplier
  }
}

const counter = new Counter()
let effectCount = 0

effect(() => {
  effectCount++
  console.log(`Counter: ${counter.value} * ${counter.multiplier}`)
})

counter.updateBoth(5, 2)
// Effect runs only once despite two property changes
```

#### Complex Data Structures

Atomic methods work with arrays, maps, sets, and other complex data structures:

```typescript
const state = reactive({
  items: [1, 2, 3],
  metadata: new Map([['count', 3]]),
  tags: new Set(['active'])
})

class DataManager {
  @atomic
  addItem(item: number) {
    state.items.push(item)
    state.metadata.set('count', state.items.length)
    state.tags.add('modified')
  }

  @atomic
  clearAll() {
    state.items.length = 0
    state.metadata.clear()
    state.tags.clear()
  }
}
```

#### Error Handling

If an atomic method throws an error, effects are still executed for the changes that were made before the error:

```typescript
class TestClass {
  @atomic
  updateWithError() {
    state.a = 1
    throw new Error('Something went wrong')
    // state.b = 2  // This line never executes
  }
}

// Effect will run once for the change to state.a
// state.b remains unchanged due to the error
```

#### Async Operations

Atomic methods can be async, but effects are still batched:

```typescript
class TestClass {
  @atomic
  async updateAsync() {
    state.a = 1
    await someAsyncOperation()
    state.b = 2
  }
}

// Effects are batched even with async operations
```

### Performance Benefits

#### Reduced Effect Executions

Without `atomic`:
```typescript
// This would trigger the effect 3 times
state.a = 1  // Effect runs
state.b = 2  // Effect runs
state.c = 3  // Effect runs
```

With `atomic`:
```typescript
@atomic
updateAll() {
  state.a = 1
  state.b = 2
  state.c = 3
}
// Effect runs only once
```

#### Consistent State

Atomic operations ensure that effects always see a consistent state:

```typescript
effect(() => {
  // This will never see inconsistent intermediate states
  if (state.a > 0 && state.b > 0) {
    console.log('Both values are positive')
  }
})

@atomic
updateBoth() {
  state.a = 1  // Effect doesn't run yet
  state.b = 2  // Effect doesn't run yet
  // Effect runs once with both values updated
}
```

### Best Practices

#### Use for Related Changes

Apply `atomic` to methods that make logically related changes:

```typescript
// Good: Related user profile updates
@atomic
updateProfile(name: string, age: number, email: string) {
  this.name = name
  this.age = age
  this.email = email
}

// Good: Complex state initialization
@atomic
initialize() {
  this.loading = false
  this.data = fetchedData
  this.error = null
  this.lastUpdated = new Date()
}
```

#### Combine with Other Decorators

The `@atomic` decorator works well with other decorators:

```typescript
@reactive
class UserManager {
  @atomic
  updateUser(id: string, updates: Partial<User>) {
    this.users.set(id, { ...this.users.get(id), ...updates })
    this.lastModified = new Date()
  }
}
```

#### Consider Performance

For methods that make many changes, `atomic` provides significant performance benefits:

```typescript
@atomic
updateManyItems(items: Item[]) {
  for (const item of items) {
    this.items.set(item.id, item)
  }
  this.count = this.items.size
  this.lastUpdate = new Date()
}
// Without @atomic: effect would run for each item + count + timestamp
// With @atomic: effect runs only once
```

### Limitations

- **Method-only**: The decorator only works on class methods, not standalone functions (use `atomic()` function instead)
- **Synchronous batching**: Effects are batched until the method completes, but async operations within the method don't affect the batching
- **Error handling**: If a method throws, effects still run for changes made before the error

### Integration

The `atomic` function and `@atomic` decorator integrate seamlessly with:

- `@reactive` classes
- `@unreactive` property marking
- `effect()` functions
- `computed()` values
- Native collection types (Array, Map, Set, etc.)

### Complete Example

```typescript
import { reactive, effect, atomic } from 'mutts'

@reactive
class TodoManager {
  todos: Todo[] = []
  filter: 'all' | 'active' | 'completed' = 'all'
  loading = false

  @atomic
  addTodo(text: string) {
    const todo: Todo = {
      id: Date.now().toString(),
      text,
      completed: false,
      createdAt: new Date()
    }
    this.todos.push(todo)
    this.updateStats()
  }

  @atomic
  toggleTodo(id: string) {
    const todo = this.todos.find(t => t.id === id)
    if (todo) {
      todo.completed = !todo.completed
      this.updateStats()
    }
  }

  @atomic
  setFilter(filter: 'all' | 'active' | 'completed') {
    this.filter = filter
    this.loading = false
  }

  private updateStats() {
    // This method is called from within atomic methods
    // Effects will be batched until the calling atomic method completes
    const activeCount = this.todos.filter(t => !t.completed).length
    const completedCount = this.todos.length - activeCount
    
    // Update derived state
    this.activeCount = activeCount
    this.completedCount = completedCount
    this.allCompleted = completedCount === this.todos.length && this.todos.length > 0
  }
}

// Usage
const todoManager = new TodoManager()

effect(() => {
  console.log(`Active: ${todoManager.activeCount}, Completed: ${todoManager.completedCount}`)
})

// Adding a todo triggers updateStats, but effect runs only once
todoManager.addTodo('Learn MutTs atomic operations')

// Toggling a todo also triggers updateStats, effect runs only once
todoManager.toggleTodo('some-id')
```

This example demonstrates how `atomic` ensures that complex state updates are treated as single, consistent operations, improving both performance and reliability.

## Advanced Patterns

### Custom Reactive Objects

Create custom reactive objects with specialized behavior:

```typescript
class ReactiveArray<T> {
    private items: T[] = []
    
    push(item: T) {
        this.items.push(item)
        touched(this, 'length')
        touched(this, 'allProps')
    }
    
    get length() {
        dependant(this, 'length')
        return this.items.length
    }
    
    get(index: number) {
        dependant(this, index)
        return this.items[index]
    }
}

const array = new ReactiveArray<number>()
effect(() => {
    console.log('Array length:', array.length)
})

array.push(1) // Triggers effect
```

### Native Reactivity Registration

Register custom reactive classes for automatic wrapping:

```typescript
import { registerNativeReactivity } from 'mutts/reactive'

class CustomMap<K, V> {
    private data = new Map<K, V>()
    
    set(key: K, value: V) {
        this.data.set(key, value)
        // Custom reactivity logic
    }
    
    get(key: K) {
        return this.data.get(key)
    }
}

class ReactiveCustomMap<K, V> extends CustomMap<K, V> {
    // Reactive wrapper implementation
}

registerNativeReactivity(CustomMap, ReactiveCustomMap)

// Now CustomMap instances are automatically wrapped
const customMap = reactive(new CustomMap())
```

### Memory Management

The reactive system uses WeakMaps to avoid memory leaks:

```typescript
// Objects can be garbage collected when no longer referenced
let obj = { data: 'large object' }
const reactiveObj = reactive(obj)

effect(() => {
    console.log(reactiveObj.data)
})

// Remove reference
obj = null
reactiveObj = null

// The original object and its reactive wrapper can be GC'd
```

### Performance Optimization

Optimize reactive performance:

```typescript
// 1. Use non-reactive for static data
const staticConfig = unreactive({
    apiUrl: 'https://api.example.com',
    version: '1.0.0'
})

// 2. Batch changes when possible
const state = reactive({ a: 1, b: 2, c: 3 })

// Instead of:
state.a = 10
state.b = 20
state.c = 30

// Consider batching or using a single update method

// 3. Avoid unnecessary reactivity
@reactive
class User {
    @unreactive
    private internalId = crypto.randomUUID() // Never changes
    
    name: string = 'John' // Changes, should be reactive
}

// 4. Use appropriate collection types
const smallSet = new ReactiveSet(new Set()) // For small collections
const largeMap = new ReactiveMap(new Map()) // For large collections with key access
```

## Debugging and Development

### Debug Options

Configure debug behavior:

```typescript
import { options as reactiveOptions } from 'mutts/reactive'

// Track effect entry/exit
reactiveOptions.enter = (effect) => {
    console.log('🔵 Entering effect:', effect.name || 'anonymous')
}

reactiveOptions.leave = (effect) => {
    console.log('🔴 Leaving effect:', effect.name || 'anonymous')
}

// Track effect chaining
reactiveOptions.chain = (caller, target) => {
    console.log('⛓️ Effect chain:', caller.name || 'anonymous', '->', target.name || 'anonymous')
}

// Set maximum chain depth
reactiveOptions.maxEffectChain = 50

// Set maximum deep watch traversal depth
reactiveOptions.maxDeepWatchDepth = 200
```

### Effect Stack Traces

Debug effect execution:

```typescript
const state = reactive({ count: 0 })

effect(() => {
    console.trace('Effect running')
    console.log('Count:', state.count)
})

// This will show the call stack when the effect runs
state.count = 5
```

### Evolution Inspection

Inspect object evolution history:

```typescript
const obj = reactive({ x: 1 })
let state = getState(obj)

effect(() => {
    console.log('=== Evolution History ===')
    let depth = 0
    while ('evolution' in state) {
        console.log(`${'  '.repeat(depth)}${state.evolution.type}: ${state.evolution.prop}`)
        state = state.next
        depth++
    }
    console.log('=== End History ===')
    
    // Reset state reference
    state = getState(obj)
})

obj.x = 2
obj.y = 'new'
delete obj.x
```

## API Reference

### Decorators

#### `@computed`

Marks a class accessor as computed. The computed value will be cached and invalidated when dependencies change.

```typescript
class MyClass {
  private _value = 0;
  
  @computed
  get doubled() {
    return this._value * 2;
  }
}

// Function usage
function myExpensiveCalculus() {

}
...
const result = computed(myExpensiveCalculus);
```

**Use Cases:**
- Caching expensive calculations
- Derived state that depends on reactive values
- Computed properties in classes
- Performance optimization for frequently accessed values

**Notes:**
By how JS works, writing `computed(()=> ...)` will always be wrong, as the notation `()=> ...` internally is a `new Function(...)`.
So, even if the return value is cached, it will never be used.

#### `@atomic`

Marks a class method as atomic, batching all effects triggered within the method until it completes.

```typescript
class MyClass {
  @atomic
  updateMultiple() {
    this.a = 1
    this.b = 2
    this.c = 3
    // Effects are batched and run only once after this method completes
  }

  @atomic
  updateAndReturn() {
    this.a = 10
    this.b = 20
    return { sum: this.a + this.b, product: this.a * this.b }
  }
}

// Function usage
const result = atomic(() => {
  state.a = 1
  state.b = 2
  return state.a + state.b
})
```

**Use Cases:**
- Batching multiple related state changes
- Performance optimization for methods with multiple updates
- Ensuring consistent state in effects
- Reducing unnecessary effect executions
- Returning computed values from atomic operations

**Notes:**
- Effects are deferred until the method/function completes
- Nested atomic methods are batched at the outermost level
- Works with both class methods and standalone functions
- Methods and functions can return values (primitives, objects, functions)

#### `@unreactive`

Marks a class property as non-reactive. The property change will not be tracked by the reactive system.

Marks a class (and its descendants) as non-reactive.

```typescript
class MyClass {
  @unreactive
  private config = { theme: 'dark' };
}

// Class decorator usage
@unreactive
class NonReactiveClass {
  // All instances will be non-reactive
}

// Function usage
const nonReactiveObj = unreactive({ config: { theme: 'dark' } });
```

**Use Cases:**
- Configuration objects that shouldn't trigger reactivity
- Static data that never changes
- Performance optimization for objects that don't need tracking
- Third-party objects that shouldn't be made reactive

### Core Functions

#### `reactive<T>(target: T): T`

Creates a reactive proxy of the target object. All property access and mutations will be tracked.

**Use Cases:**
- Converting plain objects to reactive objects
- Making class instances reactive
- Creating reactive arrays, maps, and sets
- Setting up reactive state management

```typescript
const state = reactive({ count: 0, name: 'John' });
const items = reactive([1, 2, 3]);
const map = reactive(new Map([['key', 'value']]));
```

#### `effect(fn, ...args): ScopedCallback`

Creates a reactive effect that runs when its dependencies change.

**Use Cases:**
- Side effects like DOM updates
- Logging and debugging
- Data synchronization
- Cleanup operations

```typescript
const cleanup = effect((dep) => {
  console.log('Count changed:', state.count);
  return () => {
    // Cleanup function
  };
});
```

#### `atomic<T>(fn: () => T): T`

Creates an atomic operation that batches all effects triggered within the function until it completes.

**Use Cases:**
- Batching multiple related state changes
- Performance optimization for functions with multiple updates
- Ensuring consistent state in effects
- Reducing unnecessary effect executions

```typescript
const result = atomic(() => {
  state.a = 1
  state.b = 2
  return state.a + state.b
})
```

#### `computed<T>(getter: ComputedFunction<T>): T`

Creates a computed value that caches its result and recomputes when dependencies change.

**Use Cases:**
- Derived state calculations
- Expensive computations
- Data transformations
- Conditional logic based on reactive state

```typescript
const result = computed(someExpensiveCalculus);
```

#### `watch(value, callback, options?): ScopedCallback`

Watches a reactive value or function and calls a callback when it changes.

**Use Cases:**
- Reacting to specific value changes
- Debugging reactive state
- Side effects for specific properties
- Data validation

```typescript
// Watch a specific value
const stop = watch(() => state.count, (newVal, oldVal) => {
  console.log(`Count changed from ${oldVal} to ${newVal}`);
});

// Watch an object with deep option
const stopDeep = watch(state, (newState) => {
  console.log('State changed:', newState);
}, { deep: true, immediate: true });
```

#### `unwrap<T>(proxy: T): T`

Returns the original object from a reactive proxy.

**Use Cases:**
- Accessing original object for serialization
- Passing to non-reactive functions
- Performance optimization
- Debugging

```typescript
const original = unwrap(reactiveState);
JSON.stringify(original); // Safe to serialize
```

#### `isReactive(obj: any): boolean`

Checks if an object is a reactive proxy.

**Use Cases:**
- Type checking
- Debugging
- Conditional logic
- Validation

```typescript
if (isReactive(obj)) {
  console.log('Object is reactive');
}
```

#### `isNonReactive(obj: any): boolean`

Checks if an object is marked as non-reactive.

**Use Cases:**
- Validation
- Debugging
- Conditional logic
- Type checking

```typescript
if (isNonReactive(obj)) {
  console.log('Object is non-reactive');
}
```

#### `untracked(fn: () => void): void`

Executes a function without tracking dependencies.

**Use Cases:**
- Performance optimization
- Avoiding circular dependencies
- Side effects that shouldn't trigger reactivity
- Batch operations

```typescript
untracked(() => {
  // This won't create dependencies
  console.log('Untracked operation');
});
```

#### `getState(obj)`

Gets the current state of a reactive object. Used internally for tracking changes.

**Use Cases:**
- Debugging reactive state
- Custom reactive implementations
- State inspection

#### `invalidateComputed(callback, warn?)`

Registers a callback to be called when a computed property is invalidated.

**Use Cases:**
- Custom computed implementations
- Cleanup operations
- Performance monitoring

```typescript
const computed = computed(() => {
  invalidateComputed(() => {
    console.log('Computed invalidated');
  });
  return expensiveCalculation();
});
```

### Configuration

#### `reactiveOptions`

Global options for the reactive system.

**Properties:**
- `enter(effect: Function)`: Called when an effect is entered
- `leave(effect: Function)`: Called when an effect is left
- `chain(target: Function, caller?: Function)`: Called when effects are chained
- `maxEffectChain: number`: Maximum effect chain depth (default: 100)
- `maxDeepWatchDepth: number`: Maximum deep watch traversal depth (default: 100)
- `instanceMembers: boolean`: Only react on instance members (default: true)
- `warn(...args: any[])`: Warning function (default: console.warn)

**Use Cases:**
- Debugging reactive behavior
- Performance tuning
- Custom logging
- Error handling

```typescript
reactiveOptions.maxEffectChain = 50;
reactiveOptions.enter = (effect) => console.log('Effect entered:', effect.name);
```

### Classes

#### `ReactiveBase`

Base class for reactive objects. When extended, instances are automatically made reactive.

**Use Cases:**
- Creating reactive classes
- Automatic reactivity for class instances
- Type safety for reactive objects

```typescript
class MyState extends ReactiveBase {
  count = 0;
  name = '';
}

const state = new MyState(); // Automatically reactive
```

#### `ReactiveError`

Error class for reactive system errors.

**Use Cases:**
- Error handling in reactive code
- Debugging reactive issues
- Custom error types

### Collections

Collections (Array, Map, Set, WeakMap, WeakSet) can be automatically made reactive when passed to `reactive()`:

```typescript
const items = reactive([1, 2, 3]);
items.push(4); // Triggers reactivity

const map = reactive(new Map([['key', 'value']]));
map.set('newKey', 'newValue'); // Triggers reactivity

const set = reactive(new Set([1, 2, 3]));
set.add(4); // Triggers reactivity
```

#### Automatic Collection Reactivity

All native collections have their specific management:

```typescript
// Collections still need to be wrapped with reactive()
const arr = reactive([1, 2, 3]) // ReactiveArray
const map = reactive(new Map()) // ReactiveMap
const set = reactive(new Set()) // ReactiveSet
const weakMap = reactive(new WeakMap()) // ReactiveWeakMap
const weakSet = reactive(new WeakSet()) // ReactiveWeakSet

effect(() => {
    console.log('Array length:', arr.length)
    console.log('Map size:', map.size)
    console.log('Set size:', set.size)
})

arr.push(4) // Triggers effect
map.set('key', 'value') // Triggers effect
set.add('item') // Triggers effect
```

**Use Cases:**
- Applications that primarily work with reactive collections
- Global reactive state management
- Ensuring collection methods (push, set, add, etc.) trigger reactivity
- Performance optimization for collection-heavy applications

**Note:** This module registers native collection types to use specialized reactive wrappers. Without importing this module, collections wrapped with `reactive()` will only have basic object reactivity - collection methods like `map.set()`, `array.push()`, etc. will not trigger effects. The `reactive()` wrapper is still required, but the collections module ensures proper reactive behavior for collection-specific operations.

### Types

#### `ScopedCallback`

Type for effect cleanup functions.

#### `DependencyFunction`

Type for dependency tracking functions used in effects and computed values.

#### `WatchOptions`

Options for the watch function:
- `immediate?: boolean`: Call callback immediately
- `deep?: boolean`: Watch nested properties

### Profile Information

#### `profileInfo`

Object containing internal reactive system state for debugging and profiling.

**Properties:**
- `objectToProxy`: WeakMap of original objects to their proxies
- `proxyToObject`: WeakMap of proxies to their original objects
- `effectToReactiveObjects`: WeakMap of effects to watched objects
- `watchers`: WeakMap of objects to their property watchers
- `objectParents`: WeakMap of objects to their parent relationships
- `objectsWithDeepWatchers`: WeakSet of objects with deep watchers
- `deepWatchers`: WeakMap of objects to their deep watchers
- `effectToDeepWatchedObjects`: WeakMap of effects to deep watched objects
- `nonReactiveObjects`: WeakSet of non-reactive objects
- `computedCache`: WeakMap of computed functions to their cached values

**Use Cases:**
- Debugging reactive behavior
- Performance profiling
- Memory leak detection
- System state inspection
