# Reactive Documentation


## Introduction

### What is Reactivity?

Reactivity is a programming paradigm where the system automatically tracks dependencies between data and automatically updates when data changes. This library provides a powerful, lightweight reactive system for JavaScript/TypeScript applications.

### Core Concepts

- **Reactive Objects**: Plain JavaScript objects wrapped with reactive capabilities
- **Effects**: Functions that automatically re-run when their dependencies change
- **Dependencies**: Reactive properties that an effect depends on
- **Evolution Tracking**: Built-in change history for reactive objects
- **Collections**: Reactive wrappers for Array, Map, Set, WeakMap, and WeakSet

### Basic Example

```typescript
import { reactive, effect } from './reactive'

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
npm install @your-org/reactive
```

### Basic Usage

```typescript
import { reactive, effect } from '@your-org/reactive'

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
import { reactive, effect } from '@your-org/reactive'

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
import { effect, reactive } from './reactive'

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
import { effect, untracked, reactive } from './reactive'

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
import { options as reactiveOptions } from './reactive'

// Set maximum effect chain depth
reactiveOptions.maxEffectChain = 50

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

### `Reactive` Mixin

The `Reactive` mixin makes class instances automatically reactive.

```typescript
import { Reactive } from './reactive'

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

const ReactiveUser = Reactive(User)
const user = new ReactiveUser("John", 30)

effect(() => {
    console.log(`User: ${user.name}, Age: ${user.age}`)
})

user.updateAge(31) // Triggers effect
user.name = "Jane" // Triggers effect
```

### Making Classes Reactive

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
class ShoppingCart extends Reactive() {
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

The `Reactive` mixin works with inheritance:

```typescript
class Animal {
    species: string
    
    constructor(species: string) {
        this.species = species
    }
}

class Dog extends Reactive(Animal) {
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
class User {
    @unreactive
    id: string = 'user-123'
    
    name: string = 'John'
    age: number = 30
}

const ReactiveUser = Reactive(User)
const user = new ReactiveUser()

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

const ReactiveConfig = Reactive(Config)
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
class Calculator {
    @computed
    get area() {
        return this.width * this.height
    }
    
    width: number = 10
    height: number = 5
}

const ReactiveCalculator = Reactive(Calculator)
const calc = new ReactiveCalculator()

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
import { registerNativeReactivity } from './reactive'

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
import { options as reactiveOptions } from './reactive'

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

### Common Pitfalls

**1. Nested Effects**
```typescript
// ✅ Nested effects are supported with separate scopes
effect(() => {
    const innerEffect = effect(() => {
        console.log('Inner effect')
    })
    
    // Return cleanup function for the inner effect
    return innerEffect
})

// ✅ Or create effects separately
const innerEffect = effect(() => {
    console.log('Inner effect')
})

effect(() => {
    console.log('Outer effect')
})
```

**2. Missing Dependencies**
```typescript
const state = reactive({ count: 0, multiplier: 2 })

// ❌ Missing dependency on multiplier
effect(() => {
    console.log('Result:', state.count) // Only tracks count
})

// ✅ Include all dependencies
effect(() => {
    console.log('Result:', state.count * state.multiplier)
})
```

**3. Infinite Loops**
```typescript
const state = reactive({ count: 0 })

// ❌ This creates an infinite loop
effect(() => {
    state.count++ // Modifies dependency, triggers effect again
})

// ✅ Use proper patterns
effect(() => {
    if (state.count < 10) {
        setTimeout(() => {
            state.count++
        }, 1000)
    }
})
```

**4. Memory Leaks**
```typescript
// ❌ Effect never cleaned up
effect(() => {
    const interval = setInterval(() => {
        console.log('Tick')
    }, 1000)
})

// ✅ Always clean up
const stop = effect(() => {
    const interval = setInterval(() => {
        console.log('Tick')
    }, 1000)
    
    return () => clearInterval(interval)
})

// Later...
stop()
```

## API Reference

### Function Signatures

```typescript
// Core functions
function reactive<T extends Record<PropertyKey, any>>(target: T): T
function effect<T>(fn: (dep: DependencyFunction, ...args: any[]) => T, reaction?: (param: T) => (ScopedCallback | undefined | void), ...args: any[]): ScopedCallback
function effect(fn: (dep: DependencyFunction, ...args: any[]) => (ScopedCallback | undefined | void), ...args: any[]): ScopedCallback
function watch<T>(value: (dep: DependencyFunction) => T, changed: (value: T, oldValue?: T) => void): ScopedCallback
function watch<T extends object>(value: T, changed: () => void): ScopedCallback
function untracked(fn: () => ScopedCallback | undefined | void): void
function unwrap<T>(proxy: T): T
function isReactive(obj: any): boolean
function isNonReactive(obj: any): boolean

// Evolution tracking
function getState(obj: any): State
function addState(obj: any, evolution: Evolution): void

// Non-reactive system
function unreactive<T>(target: T): T
function unreactive(target: new (...args: any[]) => T): new (...args: any[]) => T

// Computed properties
function computed<T>(getter: ComputedFunction<T>): T
function computed(target: any, desc: PropertyKey, descriptor: PropertyDescriptor): void
function computed(target: undefined, desc: ClassAccessorDecoratorContext): void

// Collections
class ReactiveArray extends Array
class ReactiveMap<K, V> extends Map<K, V>
class ReactiveWeakMap<K extends object, V> extends WeakMap<K, V>
class ReactiveSet<T> extends Set<T>
class ReactiveWeakSet<T extends object> extends WeakSet<T>

// Class mixin
const Reactive: <Base extends new (...args: any[]) => any>(Base: Base) => Base

// Native reactivity
function registerNativeReactivity(originalClass: new (...args: any[]) => any, reactiveClass: new (...args: any[]) => any): void
```

### Type Definitions

```typescript
type EffectFunction = (dep: DependencyFunction) => void
type ScopedCallback = () => void
type ComputedFunction<T> = (dep: DependencyFunction) => T

type PropEvolution = {
    type: 'set' | 'del' | 'add'
    prop: any
}

type BunchEvolution = {
    type: 'bunch'
    method: string
}

type Evolution = PropEvolution | BunchEvolution

type State = {
    evolution: Evolution
    next: State
} | {}

type DependencyFunction = <T>(cb: () => T) => T
```

### Configuration Options

```typescript
export const options = {
    enter: (effect: EffectFunction) => {},
    leave: (effect: EffectFunction) => {},
    chain: (caller: EffectFunction, target: EffectFunction) => {},
    maxEffectChain: 100,
    instanceMembers: true,
} as const
```

### Error Types

```typescript
export class ReactiveError extends Error {
    constructor(message: string)
    name: "ReactiveError"
}
```

---

This documentation covers the complete reactive system. For specific examples and use cases, refer to the test files in the codebase.
