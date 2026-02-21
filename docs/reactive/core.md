# Reactive Documentation

## Table of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
  - [5-Minute Quick Start](#5-minute-quick-start)
- [Core API](#core-api)
- [Effect System](#effect-system)
  - [Error Handling](./error-handling.md)
- [Atomic Operations](./advanced.md#atomic-operations)
- [Advanced Effects](./advanced.md#advanced-effects)
- [Evolution Tracking](./advanced.md#evolution-tracking)
- [Prototype Chains and Pure Objects](./advanced.md#prototype-chains-and-pure-objects)
- [Recursive Touching](./advanced.md#recursive-touching)
- [Collections](./collections.md)
  - [Register](./collections.md#register)
- [Class Reactivity](#class-reactivity)
- [Non-Reactive System](#non-reactive-system)
- [Morphing](./advanced.md#morph)
- [Memoization](./advanced.md#memoization)
- [Debugging and Development](./advanced.md#debugging-and-development)
  - [Cycle Detection](./advanced.md#cycle-detection)

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
const doubled = morph(source, ({ value }) => value * 2)
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

See [Prototype Chains and Pure Objects](./advanced.md#prototype-chains-and-pure-objects) for detailed information about prototype chain handling.

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

### Object Lifecycle with `link` / `unlink`

While effects handle their own cleanup automatically, **derived reactive objects** (morph results, lifted arrays, processed children, etc.) often need explicit lifecycle management. `link` and `unlink` solve this by forming a **cleanup tree** — an ownership graph independent of the effect hierarchy.

```typescript
import { link, unlink } from 'mutts/reactive'
```

#### Attaching cleanup dependencies

`link(owner, ...deps)` attaches dependencies to an owner object. Dependencies can be:
- **Functions** — called with an optional `CleanupReason` on disposal
- **Objects** — recursively `unlink`ed on disposal

```typescript
const parent = reactive({ items: [] })

// Attach a cleanup callback
link(parent, () => console.log('parent disposed'))

// Attach child objects — they will be recursively unlinked
const childA = morph(parent.items, ({ value }) => value * 2)
const childB = morph(parent.items, ({ value }) => value + 1)
link(parent, childA, childB)

// Mixed: objects and functions together
link(parent, childA, () => timer.clear())
```

#### Disposing an object

`unlink(obj)` disposes all dependencies attached to `obj`:

```typescript
unlink(parent)
// 1. childA is recursively unlinked (its own deps disposed)
// 2. childB is recursively unlinked
// 3. the callback runs: "parent disposed"
```

Calling `unlink` twice is safe — the second call is a no-op.

Not calling `unlink` is also  fine — the object will be cleaned up when garbage is collected.

#### When to use `link`/`unlink` vs effects

| Scenario | Use |
|---|---|
| Reacting to state changes | `effect` |
| Tying a derived object's lifetime to its owner | `link` / `unlink` |
| Cleaning up timers, listeners, DOM nodes | `effect` return or `link` callback |
| Building a cleanup tree across multiple reactive objects | `link` / `unlink` |

**Rule of thumb**: if the thing you're cleaning up is a *reactive object* (not a function), prefer `link`. If it's a *side effect* (timer, listener), prefer an `effect` return or a `link` callback.


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

The `effect` function provides a special `access` parameter with `tracked` and `ascend` functions that restore the active effect context for dependency tracking in asynchronous operations. 

In modern `mutts`, this is powered by the **Zone system**. When zones are registered in `asyncZone`, the active effect context is automatically preserved across `await` points and timers, making manual use of `tracked` optional for these cases.

#### The Problem with Async Effects

Traditionally, in JavaScript, async functions lose their context when they yield control. 

#### Understanding the active effect context

The reactive system uses a global active effect variable to track which effect is currently running:

```typescript
// Synchronous effect - active effect is maintained throughout
effect(() => {
    // active effect = this effect
    const value = state.count // ✅ Tracked (active effect is set)
    const another = state.name // ✅ Tracked (active effect is still set)
})

// Async effect WITHOUT zone registration - context is lost after await
effect(async () => {
    const value = state.count // ✅ Tracked
    
    await someAsyncOperation() 
    
    // context is lost!
    const another = state.name // ❌ NOT tracked
})

// Async effect WITH zone registration - context is preserved
effect(async () => {
    const value = state.count // ✅ Tracked
    
    await someAsyncOperation() 
    
    // context is automatically restored!
    const another = state.name // ✅ Tracked
})

// Using access.tracked() for manual restoration
effect(async ({ tracked }) => {
    await someAsyncOperation() 
    
    // Useful for non-patched APIs or explicit scoping
    const another = tracked(() => state.name) // ✅ Tracked
})
```

#### Key Benefits of the Zone System

1.  **Automatic Restoration**: With zones registered in `asyncZone`, most native async APIs (Promises, timers) automatically preserve the reactive context.
2.  **Manual Control**: `access.tracked()` allows you to manually "passport" the context into third-party libraries or unmanaged callbacks.

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

### Effect Modifiers

The `effect` function provides convenient shortcut modifiers for common options. These can be chained for more concise syntax:

#### `.opaque`

Creates an opaque effect that tracks object references rather than deep content. This is useful when you want effects to re-run only when the object identity changes, not when its properties change.

```typescript
import { effect, reactive } from 'mutts/reactive'

const item = reactive({ id: 1, data: { value: 10 } })

// Regular effect - triggers on any property change
effect(() => {
    console.log('Item data:', item.data.value) // Triggers on item.data.value changes
})

// Opaque effect - only triggers when item.data reference changes
effect.opaque(() => {
    console.log('Data object:', item.data) // Only triggers when item.data is replaced
})

item.data.value = 20       // Triggers regular effect, NOT opaque effect
item.data = { value: 30 }  // Triggers BOTH effects
```

**Use cases for opaque effects:**
- When you only care about object identity (e.g., cache keys, memoization)
- When deep watching would be too expensive
- When working with external data that shouldn't trigger deep reactivity

#### `.named(name)`

Creates a named effect for easier debugging and profiling. The name appears in DevTools and debug logs.

```typescript
import { effect, reactive } from 'mutts/reactive'

const state = reactive({ count: 0 })

// Create a named effect
effect.named('counter-effect')(() => {
    console.log('Count:', state.count)
})

// Named effects can also be combined with other options
effect.named('data-loader').opaque(() => {
    console.log('Loading data...')
})
```

**Benefits of named effects:**
- Easier identification in DevTools
- Better stack traces during debugging
- Helpful for performance profiling

#### Combining Modifiers

Modifiers can be chained in any order:

```typescript
// Named opaque effect
effect.named('my-effect').opaque(() => {
    // Effect code
})

// These are equivalent - order doesn't matter for the result
effect.opaque.named('my-effect')(() => {
    // Effect code
})
```

Note: The modifiers return new effect functions with the options pre-applied, so they can be stored and reused:

```typescript
// Create a reusable named effect factory
const createDataEffect = effect.named('data-layer')

createDataEffect(() => {
    console.log('Effect 1')
})

createDataEffect(() => {
    console.log('Effect 2')
})
```


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

