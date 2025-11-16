# Reactive Documentation

## Table of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
  - [5-Minute Quick Start](#5-minute-quick-start)
- [Core API](#core-api)
- [Effect System](#effect-system)
- [Atomic Operations](#atomic-operations)
- [Advanced Effects](#advanced-effects)
- [Evolution Tracking](#evolution-tracking)
- [Prototype Chains and Pure Objects](#prototype-chains-and-pure-objects)
- [Recursive Touching](#recursive-touching)
  - [Why Not Deep Watching?](#why-not-deep-watching)
- [Collections](#collections)
  - [Register](#register)
- [Class Reactivity](#class-reactivity)
- [Non-Reactive System](#non-reactive-system)
- [Array Mapping](#array-mapping)
- [Projection](#projection)
- [Record Organization](#record-organization)
- [Memoization](#memoization)
- [Debugging and Development](#debugging-and-development)
  - [Cycle Detection](#cycle-detection)

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

### 5-Minute Quick Start

Learn the essentials in 5 minutes:

**1. Make state reactive:**
```typescript
import { reactive, effect } from 'mutts/reactive'

const state = reactive({ count: 0, name: "John" })
```

**2. React to changes:**
```typescript
// Effects automatically re-run when dependencies change
effect(() => {
  console.log(`Hello ${state.name}, count is ${state.count}`)
})

state.count++       // Triggers effect
state.name = "Jane"  // Triggers effect
```

**3. Work with arrays:**
```typescript
const items = reactive([1, 2, 3])

effect(() => {
  console.log(`Array length: ${items.length}`)
})

items.push(4)  // Triggers effect
```

**4. Use memoization:**
```typescript
const memoized = memoize((user: User) => {
  return expensiveComputation(user)
})

// Only recomputes when user changes
const result = memoized(user)
```

**5. Map over arrays:**
```typescript
const source = reactive([1, 2, 3])
const doubled = mapped(source, x => x * 2)
// [2, 4, 6]

source.push(4)  // doubled automatically becomes [2, 4, 6, 8]
```

**Ready to go!** Continue reading for advanced features.

---

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

**Pure Objects and Prototypes:**

`reactive()` works with any object type, including:
- Normal objects: `reactive({ x: 1 })`
- Pure objects: `reactive(Object.create(null))`
- Objects with prototypes: `reactive(Object.create(parent))`
- Class instances: `reactive(new MyClass())`

See [Prototype Chains and Pure Objects](#prototype-chains-and-pure-objects) for detailed information about prototype chain handling.

### `effect()`

Creates a reactive effect that automatically re-runs when dependencies change.

```typescript
interface DependencyAccess {
    tracked: DependencyFunction  // Track dependencies in the current effect
    ascend: DependencyFunction    // Track dependencies in the parent effect
    reaction: boolean             // true after the first run
}

function effect(
    fn: (access: DependencyAccess, ...args: any[]) => (ScopedCallback | undefined | void),
    ...args: any[]
): ScopedCallback
```

**Parameters:**
- `fn`: The effect function that receives dependency access and may return a cleanup function
- `...args`: Additional arguments that are forwarded to the effect function

**DependencyAccess:**
- `tracked`: Function to track dependencies in the current effect (use this by default)
- `ascend`: Function to track dependencies in the parent effect (useful for effects that should be cleaned up with their parent)
- `reaction`: Boolean flag that is `false` during the initial execution and `true` for every subsequent re-run triggered by dependency changes

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

You can also branch on the `reaction` flag to separate initialisation logic from update logic:

```typescript
effect(({ reaction }) => {
    if (!reaction) {
        console.log('Initial render setup')
    } else {
        console.log('Reacting to dependency change')
    }
})
```

**Using effect with arguments (useful in loops):**
```typescript
const items = reactive([{ id: 1 }, { id: 2 }, { id: 3 }])

// Create effects in a loop, passing loop variables
for (let i = 0; i < items.length; i++) {
    effect((access, index) => {
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
- **Child effects are referenced by parent effects** - and therefore are not subject to GC cleanups

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

### Async Effects and the `access` Parameter

The `effect` function provides a special `access` parameter with `tracked` and `ascend` functions that restore the active effect context for dependency tracking in asynchronous operations. This is crucial because async functions lose the global active effect context when they yield control.

#### The Problem with Async Effects

When an effect function is synchronous, reactive property access automatically tracks dependencies, however, in async functions, the active effect context is lost when the function yields control. 

The `access.tracked()` function restores the active effect context for dependency tracking.

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

// Async effect with access.tracked() - active effect is restored
effect(async ({ tracked }) => {
    // active effect = this effect
    const value = state.count // ✅ Tracked (active effect is set)
    
    await someAsyncOperation() // Function exits, active effect = undefined
    
    // tracked() temporarily restores active effect for the callback
    const another = tracked(() => state.name) // ✅ Tracked (active effect restored)
})
```

#### Key Benefits of `access.tracked()` in Async Effects

1. **Restored Context**: `access.tracked()` temporarily restores the active effect context for dependency tracking
2. **Consistent Tracking**: Reactive property access works the same way before and after `await`

### Using `ascend` for Parent Effect Tracking

The `ascend` function allows you to track dependencies in the parent effect instead of the current effect. This is useful when you want child effects to be cleaned up with their parent, but their dependencies should trigger the parent effect.

```typescript
const inputs = reactive([1, 2, 3])

effect(({ ascend }) => {
    // Track inputs.length in the parent effect
    const length = inputs.length
    
    if (length > 0) {
        // Use ascend to create effects that track dependencies in the parent
        // When parent is cleaned up, these child effects are also cleaned up
        ascend(() => {
            // Dependencies here are tracked in the parent effect
            inputs.forEach((item, index) => {
                console.log(`Item ${index}:`, item)
            })
        })
    }
})
```
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
grep

**When to use `ascend`:**
- When creating child effects that should be cleaned up with their parent
- When child effect dependencies should trigger the parent effect
- For managing effect hierarchies where child effects depend on parent context

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

// Enable/disable recursive touching (default: true)
reactiveOptions.recursiveTouching = false

// Enable debug logging
reactiveOptions.enter = (effect) => console.log('Entering effect:', effect)
reactiveOptions.leave = (effect) => console.log('Leaving effect:', effect)
reactiveOptions.chain = (caller, target) => console.log('Chaining:', caller, '->', target)
```

## Atomic Operations

### `atomic()` - Function Wrapper and Decorator

The `atomic` function wraps a function to batch all reactive effects triggered within it, ensuring effects run only once after the function completes. It can be used both as a function wrapper and as a decorator.

```typescript
import { atomic, reactive, effect } from 'mutts/reactive'

const state = reactive({ a: 0, b: 0 })

effect(() => {
  console.log('Values:', state.a, state.b)
})

// Wrap a function for atomic execution
const updateBoth = atomic((a, b) => {
  state.a = a
  state.b = b
  // All effects triggered by these changes are batched
})

// Effect runs only once with final values
updateBoth(10, 20)

// atomic also works as a decorator
class CounterService {
  @atomic
  updateMultiple(newValue: number) {
    state.a = newValue
    this.performOtherUpdates()
  }
  
  performOtherUpdates() {
    // Changes here are also batched
    state.b = state.a + 1
  }
}

const service = new CounterService()
service.updateMultiple(5)  // Effect runs only once with final values
```

The wrapped function preserves its signature (parameters and return value), and all effects triggered by reactive changes inside it are automatically batched.

### `biDi()` - Bidirectional Binding

Creates a bidirectional binding between a reactive value and a non-reactive external value (like DOM elements), automatically preventing infinite loops.

```typescript
import { biDi, reactive } from 'mutts/reactive'

const model = reactive({ value: '' })

// Bind to a DOM element value property
const provide = biDi(
  (v) => {
    // External setter: called when reactive value changes
    inputElement.value = v
  },
  () => model.value,  // Reactive getter
  (v) => model.value = v  // Reactive setter
)

// Handle user input (external changes)
inputElement.addEventListener('input', () => {
  provide(inputElement.value)  // Updates model.value without causing loop
})

// Changes to model.value also update the input element
model.value = 'new value'  // inputElement.value is updated via biDi
```

**When to use `biDi()`:**

- **Two-way data binding**: Connect reactive state to HTML form inputs, third-party libraries, or non-reactive APIs
- **Prevent circular updates**: Avoid infinite loops when external and reactive changes can trigger each other
- **Integrate external systems**: Bridge between reactive code and legacy/external code that can't be made reactive

**How it works:**

The `biDi()` function creates an effect that syncs reactive → external changes, and returns a function that handles external → reactive changes. The returned function uses atomic operations to suppress the circular effect, preventing infinite update loops.

**Alternative syntax:**

You can pass the reactive getter/setter as a single object instead of two separate parameters:

```typescript
const provide = biDi(
  (v) => inputElement.value = v,
  { get: () => model.value, set: (v) => model.value = v }
)
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
    const cleanup = effect((access, index) => {
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

## Prototype Chains and Pure Objects

The reactive system intelligently handles prototype chains, distinguishing between data prototypes (which should be tracked) and class prototypes (which should not). This enables powerful patterns like using instances as prototypes and working with pure objects created with `Object.create(null)`.

### Pure Objects (Object.create(null))

Pure objects are objects created with `Object.create(null)` that have no prototype. These objects are useful for creating data structures without inheriting properties from `Object.prototype`.

```typescript
// Create a pure object
const pure = reactive(Object.create(null) as any)
pure.x = 1
pure.y = 2

effect(() => {
    console.log(`Pure object: x=${pure.x}, y=${pure.y}`)
})

pure.x = 10 // Triggers effect
```

### Prototype Chain Dependency Tracking

When accessing a property that doesn't exist on an object but exists in its prototype chain, the system automatically tracks dependencies on both the object and the prototype where the property is defined.

```typescript
// Create parent with properties
const parent = reactive({ shared: 'value' })

// Create child that inherits from parent
const child = reactive(Object.create(parent))

effect(() => {
    // Accesses 'shared' from parent through prototype chain
    console.log(child.shared) // Tracks both child.shared AND parent.shared
})

// Changing parent property triggers the effect
parent.shared = 'new value' // Effect runs again
```

### Data Prototypes vs Class Prototypes

The system distinguishes between:

1. **Data Prototypes**: Objects used as prototypes that don't have their own `constructor` property
   - `Object.create({})` - Plain object as prototype
   - `Object.create(instance)` - Reactive instance as prototype
   - Pure object chains

2. **Class Prototypes**: Class prototypes that have their own `constructor` property
   - `Object.create(MyClass.prototype)` - Class prototype
   - These are **not tracked** (we only care about data changes, not method overrides)

### Pure Object Prototype Chains

You can create chains of pure objects for efficient data structures:

```typescript
// Create root pure object
const root = reactive(Object.create(null) as any)
root.baseValue = 1

// Create child that inherits from root
const child = reactive(Object.create(root))
child.derivedValue = 2

// Create grandchild
const grandchild = reactive(Object.create(child))

effect(() => {
    // Accesses baseValue from root through the chain
    console.log(grandchild.baseValue) // 1
    console.log(grandchild.derivedValue) // 2
})

root.baseValue = 10 // Triggers effect
```

### Using Instances as Prototypes

A powerful pattern is using reactive instances as prototypes. This allows sharing reactive state across multiple objects:

```typescript
// Create a shared instance with reactive state
const sharedState = reactive({ count: 0, name: 'Shared' })

// Create multiple objects that share this instance as prototype
const obj1 = reactive(Object.create(sharedState))
const obj2 = reactive(Object.create(sharedState))

effect(() => {
    // obj1 accesses count from sharedState prototype
    console.log(`obj1.count: ${obj1.count}`)
})

effect(() => {
    // obj2 accesses name from sharedState prototype
    console.log(`obj2.name: ${obj2.name}`)
})

// Changing shared state triggers both effects
sharedState.count = 5  // Triggers first effect
sharedState.name = 'New' // Triggers second effect
```

### Shadowing in Prototype Chains

When an object defines its own property that exists in the prototype, it "shadows" the prototype property. The system only tracks the shadowing property, not the prototype property:

```typescript
const parent = reactive({ value: 'parent' })
const child = reactive(Object.create(parent))
child.value = 'child' // Shadows parent.value

effect(() => {
    console.log(child.value) // Tracks child.value, not parent.value
})

parent.value = 'parent-changed' // Does NOT trigger effect (shadowed)
child.value = 'child-changed'   // Triggers effect
```

### Multi-Level Chains with Mixed Types

You can create complex chains mixing pure objects and normal objects:

```typescript
// Pure object root
const root = reactive(Object.create(null) as any)
root.a = 1

// Normal object with pure parent
const mid = reactive(Object.create(root))
mid.b = 2

// Pure object with normal parent
const leaf = reactive(Object.create(mid))

effect(() => {
    console.log(leaf.a) // From root
    console.log(leaf.b) // From mid
})

root.a = 10 // Triggers effect
mid.b = 20  // Triggers effect
```

### Deep Touch with Prototype Chains

When recursive touch is performed on objects with prototype chains, the system compares both own properties and prototype chain properties. This ensures that changes to prototype-level properties are properly detected:

```typescript
const ProtoA = reactive({ x: 1, y: 2 })
const ProtoB = reactive({ x: 10, y: 20 })

const A = reactive(Object.create(ProtoA))
const B = reactive(Object.create(ProtoB))

const C = reactive({ something: A })

effect(() => {
    const val = C.something
    effect(() => {
        // Accesses x through prototype chain
        const nested = val.x
    })
})

// Deep touch replacement - compares prototype chains
C.something = B
// Nested effect runs because ProtoB.x differs from ProtoA.x
```

### Best Practices

1. **Use pure objects for data-only structures**: Pure objects are ideal when you want to avoid inheriting methods from `Object.prototype`.

2. **Use instance prototypes for shared state**: Creating multiple objects with the same instance as prototype is an efficient way to share reactive state.

3. **Avoid class prototypes in data chains**: Don't use class prototypes (`MyClass.prototype`) in data prototype chains - the system won't track them.

4. **Be mindful of shadowing**: Remember that properties defined on an object shadow prototype properties, so changes to the prototype won't trigger effects on the shadowing property.

## Recursive Touching

When you replace a reactive object with another object that shares the same prototype (including `null`-prototype objects and class instances), the system performs a **recursive touch** instead of notifying watchers as if the entire branch changed. This means:

- Watchers attached to the container are *not* re-fired if the container's prototype did not change (this avoids unnecessary parent effect re-runs).
- Watchers attached to nested properties are re-evaluated only for keys that actually changed (added, removed, or whose values differ).
- For arrays, the behaviour stays index-oriented: replacing an element at index `i` fires a touch for that index (and `length` if needed) rather than diffing the element recursively. This preserves reorder detection.
- Prototype chain properties are compared when both objects have prototype chains, ensuring changes to prototype-level properties are detected.

**Integration with Prototype Chains:**

When comparing objects with prototype chains during recursive touch, the system:
- Compares own properties of both objects
- Walks and compares prototype chains (for data prototypes only, not class prototypes)
- Generates notifications for properties that differ at any level of the prototype chain
- Applies origin filtering to ensure only effects that came through the replacement property are notified

### Example

```typescript
const state = reactive({
    nested: {
        title: 'Hello',
        meta: { views: 0 },
    },
})

const containerWatcher = jest.fn()
const titleWatcher = jest.fn()
const viewsWatcher = jest.fn()

effect(()=> containerWatcher(state.nested))
effect(()=> titleWatcher(state.nested.title))
effect(()=> viewsWatcher(state.nested.meta.views))

// Replace nested with another object using the same shape/prototype
state.nested = {
    title: 'Hello world',
    meta: { views: 10 },
}

// containerWatcher runs only once (initial run)
// Deep touch avoids parent effects when only sub-properties change
expect(containerWatcher).toHaveBeenCalledTimes(1)

// titleWatcher reacts to the changed title
expect(titleWatcher).toHaveBeenCalledTimes(2)

// viewsWatcher reacts because the nested meta object changed recursively
expect(viewsWatcher).toHaveBeenCalledTimes(2)
```

This behaviour keeps container-level watchers stable while still delivering fine-grained updates to nested effects—ideal when you replace data structures with freshly fetched objects that share the same prototype.

### Origin Filtering

When recursive touch is triggered (e.g., `C.something = A` replaced with `C.something = B`), the system applies **origin filtering** to ensure only effects that came through the replacement property are notified:

```typescript
const A = reactive({ x: 1, y: 2 })
const B = reactive({ x: 10, y: 20 })
const C = reactive({ something: A })
const D = reactive({ other: A })

let effect1Runs = 0
let effect2Runs = 0

// Effect1 depends on C.something
effect(() => {
    effect1Runs++
    const val = C.something
    effect(() => {
        // Nested effect accesses A.x through C.something
        const nested = A.x
    })
})

// Effect2 depends on A.x directly (not through C.something)
effect(() => {
    effect2Runs++
    const val = A.x
})

// Replace C.something
C.something = B

// Effect1's nested effect runs (it came through C.something)
// Effect2 does NOT run (it doesn't depend on C.something)
```

**Key Points:**
- Effects that depend only on the container property (e.g., `C.something`) do **not** run
- Only nested effects that accessed properties through the container are notified
- Independent effects on the replaced object (e.g., direct dependency on `A.x`) are filtered out
- This minimizes unnecessary re-computations while keeping data consistent

**Note:** This recursive touching behavior can be disabled globally by setting `reactiveOptions.recursiveTouching = false`. When disabled, all object replacements will trigger parent effects regardless of prototype matching.

### Why Not Deep Watching?

You might wonder why deep watching is implemented but not recommended for most use cases. The answer lies in understanding the tradeoffs:

#### The Deep Watching Approach

Traditional deep watching automatically tracks all nested properties:

```typescript
const state = reactive({ user: { profile: { name: 'John' } } })

watch(state, () => {
  console.log('Something changed')
}, { deep: true })

state.user.profile.name = 'Jane'  // Triggers watch
```

**Problems with deep watching:**
- **Performance overhead**: Every nested property access creates a dependency
- **Hidden dependencies**: Unclear which deep properties triggered the effect
- **Circular reference hazards**: Requires depth limits and visited tracking
- **Memory overhead**: Back-references for all nested objects
- **Over-notification**: Triggers when you might not care about a change

#### The Recursive Touch Approach

With recursive touching, you get fine-grained change detection without the overhead:

```typescript
const state = reactive({ user: { profile: { name: 'John' } } })

// Replace the entire user object with fresh data
state.user = fetchUser()  // Only notifies if actual values changed

// Or explicitly track what you need
effect(() => {
  console.log(state.user.profile.name)  // Only tracks this specific path
})
```

**Benefits:**
- **Explicit dependencies**: You see exactly what properties you depend on
- **Better performance**: Only tracks properties you actually read
- **Automatic deduplication**: Reading `obj.toJSON()` marks all properties as used
- **No circular reference issues**: Only touches what you explicitly access
- **Clearer intent**: Your code shows what data matters

#### When to Use Each

**Use recursive touching (default) when:**
- Building UI frameworks (most changes come from fresh data)
- Working with fetched/stale data patterns
- You want explicit dependency tracking
- Performance matters

**Use deep watching when:**
- You truly need to know about ANY change anywhere
- Debugging complex state changes
- Legacy integration where you can't change access patterns
- You explicitly don't care about which property changed

#### Practical Example: Saving Objects

Deep watching makes everything reactive:

```typescript
// ❌ Deep watching - tracks too much
const form = reactive({ 
  fields: { name: '', email: '' },
  meta: { lastSaved: Date.now() }
})
watch(form, saveToServer, { deep: true })
form.meta.lastSaved = Date.now()  // Unnecessary save triggered
```

Recursive touching with explicit tracking:

```typescript
// ✅ Explicit - only saves when form fields change  
const form = reactive({ 
  fields: { name: '', email: '' },
  meta: { lastSaved: Date.now() }
})
effect(() => {
  // Read the nested properties to track them
  const name = form.fields.name
  const email = form.fields.email
  saveToServer({ name, email })
})
form.meta.lastSaved = Date.now()  // No save triggered
form.fields.name = 'John'          // Triggers save
```

Or if you need to serialize the whole form:

```typescript
// ✅ If you serialize, all properties are tracked automatically
effect(() => {
  const data = JSON.stringify(form.fields)  // Marks all fields as used
  saveToServer(data)
})
```

**Bottom line:** Recursive touching gives you the granular control you need without deep watching's overhead, making it ideal for modern reactive applications.

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

## Array Mapping

### `mapped()`

Creates a reactive array by mapping over an input array. The mapper receives the current item value, its index, and the previous mapped value for that index.

```typescript
import { mapped, reactive } from 'mutts/reactive'

const input = reactive([1, 2, 3])
const doubles = mapped(input, (value, index, oldValue) => value * 2)

console.log(doubles) // [2, 4, 6]

// When input changes, the mapped output updates in place
input.push(4)
console.log(doubles) // [2, 4, 6, 8]
```

**Mapper signature:**

```typescript
(value: T, index: number, oldValue?: U) => U
```

- **value**: current element from the input array
- **index**: current element index
- **oldValue**: previously computed value at the same index (useful for incremental updates)

**Key features:**

- **Live reactivity**: Output array updates when the input array changes (push/pop/splice/assignments).
- **Granular recompute**: Only indices that change are recomputed; `oldValue` enables incremental updates.
- **Simple contract**: Mapper works directly with `(value, index, oldValue)` and can freely return reactive objects.

**Performance characteristics:**

```typescript
const users = reactive([
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 }
])

let computeCount = 0
const processedUsers = mapped(users, (user) => {
  computeCount++
  return `${user.name} (${user.age})`
})

console.log(computeCount) // 2 (initial computation)

// Modify one user - only that index recomputes
users[0].age = 31
console.log(processedUsers[0]) // "John (31)"
console.log(computeCount) // 3
```

**Advanced usage:**

```typescript
const orders = reactive([
  { items: [{ price: 10 }, { price: 20 }] },
  { items: [{ price: 15 }] }
])

const orderTotals = mapped(orders, (order) => (
  order.items.reduce((sum, item) => sum + item.price, 0)
))
```

### Identity-preserving mapped arrays

Combine `mapped()` with [`memoize()`](#memoize) when you need to reuse mapped results for the same input identity. The memoized mapper runs at most once per input object, even when the source array is reordered, and it can host additional reactive state that should survive reordering.

```typescript
import { effect, mapped, memoize, reactive } from 'mutts/reactive'

const inputs = reactive([{ name: 'John' }, { name: 'Jane' }])

const memoizedCard = memoize((user: { name: string }) => {
  const view: { name?: string; setName(next: string): void } = {
    setName(next) {
      user.name = next
    },
  }

  effect(() => {
    view.name = user.name.toUpperCase()
  })

  return view
})

const cards = mapped(inputs, (user) => memoizedCard(user))

cards[0].setName('Johnny')
console.log(cards[0].name) // 'JOHNNY'

// Reorder: cached output follows the original object
const first = inputs.shift()!
inputs.push(first)
console.log(cards[1].name) // still 'JOHNNY'
```

Use this pattern when:

- You are mapping an array of reactive objects and want to keep derived objects stable across reorders.
- The mapper returns objects with internal state or nested effects that should survive reordering.
- You prefer to share memoized helpers across multiple mapped arrays.

## Projection

### `project()`

`project()` provides a unified API for transforming reactive collections (arrays, records, and maps) into new reactive collections. Each source entry gets its own reactive effect that recomputes only when that specific entry changes, enabling granular updates perfect for rendering pipelines.

**Note:** `project()` is the modern replacement for `mapped()`. It offers the same per-entry reactivity benefits but works across all collection types with a consistent API.

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

#### Comparison with `mapped()`

`project()` is designed to eventually replace `mapped()`. Key differences:

- **Unified API**: Works with arrays, records, and maps (vs. `mapped()` only for arrays)
- **Access Pattern**: Uses an access object with `get()`/`set()` instead of direct value/index parameters
- **Automatic Target Creation**: Creates its own reactive target container (no need to provide a base target)
- **Consistent Behavior**: Same per-entry reactivity model across all collection types

For new code, prefer `project()` over `mapped()`. Existing `mapped()` code will continue to work, but consider migrating for better consistency and future features.

## Record Organization

### `organized()`

`organized()` is the record companion to [`mapped()`](#mapped). Instead of iterating over numeric indices, it reacts to property additions, updates, and deletions on any `Record<PropertyKey, T>` (plain objects, dictionaries, even reactive proxies) and lets you build **whatever target structure you need**—a new record, nested buckets, a `Map`, or a more elaborate object with metadata.

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

- One effect watching `Reflect.ownKeys(source)` (similar to how `mapped()` tracks `length`)
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

## Memoization

### `memoize()`

`memoize(fn, maxArgs?)` caches the result of `fn` based on the identity of its arguments. All arguments must be WeakMap-compatible values (non-null objects, arrays, or symbols). Passing a primitive throws immediately to prevent inconsistent caching.

**Signature**

```typescript
import { memoize } from 'mutts/reactive'

type Memoizable = object | any[] | symbol

function memoize<Result>(
  fn: (...args: Memoizable[]) => Result,
  maxArgs?: number
): (...args: Memoizable[]) => Result
```

**Parameters**

- `fn`: compute function executed inside an effect. Any reactive reads it performs are tracked; when they change the cached value is discarded and recomputed on the next call.
- `maxArgs` (optional): number of leading arguments to keep. Arguments beyond this index are ignored for caching **and** will not be forwarded to `fn`.

**Behaviour**

- Memoized wrappers are deduplicated per original function. Calling `memoize` multiple times with the same function returns the same memoized wrapper.
- Cache entries live in nested `WeakMap`s keyed by each argument. When the last reference to a key disappears, the corresponding cache entry is eligible for garbage collection.
- When dependencies touched inside `fn` change, the cache entry is removed and a `{ type: 'invalidate' }` touch is emitted.
- Because caching relies on object identity, reuse parameter objects instead of recreating literals for every call.

**Basic usage**

```typescript
import { effect, memoize, reactive } from 'mutts/reactive'

const source = reactive({ value: 1 })
const args = { node: source }

const double = memoize(({ node }: { node: typeof source }) => node.value * 2)

effect(() => {
  console.log(double(args))
})

source.value = 5
// -> cache invalidated, effect re-runs, memoized recomputes to 10
```

**Multiple arguments**

```typescript
const a = reactive({ value: 1 })
const b = reactive({ value: 2 })

const sum = memoize((left: typeof a, right: typeof b) => left.value + right.value)

console.log(sum(a, b)) // 3
b.value = 3
console.log(sum(a, b)) // 4 (cache entry invalidated for the same argument pair)
```

**Limiting argument arity with `maxArgs`**

```typescript
const describe = memoize(
  (node: { id: string }, locale: { language: string }) => `${node.id}:${locale.language}`,
  1
)

describe({ id: 'x' } as any, { language: 'en' }) // locale is ignored, only the first argument is cached
```

Use `maxArgs` when the memoized function should only consider the first _n_ arguments. Subsequent arguments are ignored and not forwarded to `fn`.

### Decorator usage

Apply `@memoize` to class getters or methods to share the same cache semantics. Getters cache per instance; methods cache per instance and argument tuple.

```typescript
import { memoize, reactive } from 'mutts/reactive'

class Example {
  state = reactive({ count: 0 })

  @memoize
  get doubled() {
    return this.state.count * 2
  }

  @memoize
  total(a: { value: number }, b: { value: number }) {
    return a.value + b.value + this.state.count
  }
}
```

### Working with `mapped()`

Pair `memoize()` with [`mapped()`](#mapped) to keep derived array elements stable across reorders (see [Identity-preserving mapped arrays](#identity-preserving-mapped-arrays)). Memoizing the mapper ensures each input object is processed at most once and its derived state persists while the input reference lives.

## Debugging and Development

### Cycle Detection

The reactive system automatically detects circular dependencies between effects. When one effect triggers another effect that eventually triggers the first effect again, a cycle is detected.

#### Cycle Detection Behavior

By default, cycles are detected and an error is thrown. You can configure the behavior using `reactiveOptions.cycleHandling`:

```typescript
import { reactiveOptions } from 'mutts/reactive'

// Options: 'throw' (default), 'warn', or 'break'
reactiveOptions.cycleHandling = 'warn' // Warn instead of throwing
reactiveOptions.cycleHandling = 'break' // Silently break the cycle
```

**Cycle handling modes:**

- **`'throw'`** (default): Throws a `ReactiveError` with a detailed cycle path when a cycle is detected
- **`'warn'`**: Logs a warning message with the cycle path but continues execution (breaks the cycle)
- **`'break'`**: Silently breaks the cycle without any message

#### Cycle Error Messages

When a cycle is detected, the error message includes the full cycle path showing which effects form the cycle:

```typescript
const state = reactive({ a: 0, b: 0, c: 0 })

effect(() => {
  state.b = state.a + 1 // Effect A
})

effect(() => {
  state.c = state.b + 1 // Effect B
})

// This will throw with a detailed cycle path
try {
  effect(() => {
    state.a = state.c + 1 // Effect C - creates cycle: A → B → C → A
  })
} catch (e) {
  console.error(e.message)
  // "[reactive] Cycle detected: effectA → effectB → effectC → effectA"
}
```

The cycle path shows the sequence of effects that form the circular dependency, making it easier to identify and fix the issue.

#### Common Cycle Patterns

**Direct cycle:**
```typescript
const state = reactive({ a: 0, b: 0 })

effect(() => {
  state.b = state.a + 1 // Effect A
})

effect(() => {
  state.a = state.b + 1 // Effect B - creates cycle: A → B → A
})
```

**Indirect cycle:**
```typescript
const state = reactive({ a: 0, b: 0, c: 0 })

effect(() => {
  state.b = state.a + 1 // Effect A
})

effect(() => {
  state.c = state.b + 1 // Effect B
})

effect(() => {
  state.a = state.c + 1 // Effect C - creates cycle: A → B → C → A
})
```

#### Preventing Cycles

To avoid cycles, consider:

1. **Separate read and write effects**: Don't have an effect that both reads and writes the same reactive properties
2. **Use `untracked()`**: For operations that shouldn't create dependencies
3. **Use `atomic()`**: To batch operations and prevent intermediate triggers
4. **Restructure logic**: Break circular dependencies by introducing intermediate state or computed values

**Example - Using `untracked()` to break cycles:**
```typescript
const state = reactive({ count: 0 })

effect(() => {
  // Read count
  const current = state.count
  
  // Write to count without creating a dependency cycle
  untracked(() => {
    if (current < 10) {
      state.count = current + 1
    }
  })
})
```

**Note:** Self-loops (an effect reading and writing the same property, like `obj.prop++`) are automatically ignored and do not create dependency relationships or cycles.

