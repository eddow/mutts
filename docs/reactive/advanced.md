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

### `addBatchCleanup()` / `defer()` - Deferring Work to Avoid Cycles

When an effect needs to perform an action that would modify state the effect depends on, this can create a reactive cycle. The `addBatchCleanup` function (also exported as `defer` for semantic clarity) allows you to defer such work until after the current batch of effects completes.

```typescript
import { addBatchCleanup, effect, reactive } from 'mutts/reactive'
// or use the semantic alias:
// import { defer } from 'mutts/reactive'

const state = reactive({ 
  items: [],
  processedCount: 0 
})

effect(() => {
  // This effect reads state.items
  const itemCount = state.items.length
  
  // If we modify state.processedCount here synchronously,
  // it could trigger this effect again → potential cycle
  
  // Instead, defer the mutation until after this effect completes
  addBatchCleanup(() => {
    state.processedCount = itemCount
  })
})

state.items.push('new item')
// Effect runs, deferred callback runs after, no cycle
```

**Common Use Case: Self-Triggering Effects**

A classic scenario is when an effect needs to create side effects that modify the state it reads:

```typescript
class Hive {
  advertisements = reactive({ wood: { demands: [], supplies: [] } })
  movements = reactive([])
  
  setupAdvertisementProcessing() {
    effect(() => {
      // Read advertisements
      const ads = this.advertisements
      
      // We need to create movements based on advertisements,
      // but creating a movement modifies state that might trigger this effect
      
      addBatchCleanup(() => {
        // Deferred: runs after this effect completes
        if (this.canMatchDemandWithSupply(ads.wood)) {
          this.createMovement('wood', supplier, demander)
        }
      })
    })
  }
  
  createMovement(good, from, to) {
    // Modifies reactive state
    this.movements.push({ good, from, to })
  }
}
```

**vs. `queueMicrotask` Anti-Pattern**

Before `addBatchCleanup` was widely known, developers sometimes used `queueMicrotask` as a workaround:

```typescript
// ❌ Anti-pattern: Using queueMicrotask
effect(() => {
  processAdvertisements()
  
  queueMicrotask(() => {
    createMovement()  // Defers via event loop
  })
})
```

**Problems with `queueMicrotask`:**
- ❌ **Async timing**: Relies on JavaScript event loop, not reactive system
- ❌ **Hard to test**: Requires `await` in tests to flush microtasks
- ❌ **Unclear intent**: Not obvious this is for reactive cycle avoidance
- ❌ **No batch coordination**: Runs after event loop, not after reactive batch

**Use `addBatchCleanup` instead:**
```typescript
// ✅ Correct: Using addBatchCleanup
effect(() => {
  processAdvertisements()
  
  addBatchCleanup(() => {
    createMovement()  // Defers to end of reactive batch
  })
})
```

**Benefits:**
- ✅ **Synchronous**: Runs immediately after batch, no event loop delay
- ✅ **Testable**: No need for `await` in tests
- ✅ **Semantic**: Clear that this is deferred work within reactive system
- ✅ **Batch-aware**: Respects reactive batch boundaries

**Execution Timing:**

`addBatchCleanup` callbacks run:
1. After **all effects in the current batch** have executed
2. In **FIFO order** (first added, first executed)
3. **Before** control returns to the caller
4. **Synchronously** (no microtask/setTimeout delay)

```typescript
const state = reactive({ count: 0 })

console.log('1. Starting')

effect(() => {
  console.log('2. Effect running, count:', state.count)
  
  addBatchCleanup(() => {
    console.log('5. Deferred work A')
  })
  
  addBatchCleanup(() => {
    console.log('6. Deferred work B')
  })
  
  console.log('3. Effect ending')
})

console.log('4. After effect created')
// Deferred callbacks run here
console.log('7. All done')

// Output:
// 1. Starting
// 2. Effect running, count: 0
// 3. Effect ending
// 4. After effect created
// 5. Deferred work A
// 6. Deferred work B
// 7. All done
```

**Outside of Batches:**

If `addBatchCleanup` is called when no batch is active, the callback executes **immediately**:

```typescript
// Not inside an effect or atomic operation
addBatchCleanup(() => {
  console.log('Runs immediately')
})
// Callback has already run by this point
```

**Nested Batches:**

Callbacks added in nested batches are collected and run when the **outermost batch** completes:

```typescript
effect(() => {
  addBatchCleanup(() => console.log('Outer deferred'))
  
  atomic(() => {
    addBatchCleanup(() => console.log('Inner deferred'))
  })()
})

// Output:
// Outer deferred
// Inner deferred
// (Both run after outer batch completes)
```

**Error Handling:**

If a deferred callback throws an error, it's logged but doesn't stop other deferred callbacks from running:

```typescript
effect(() => {
  addBatchCleanup(() => {
    throw new Error('First callback fails')
  })
  
  addBatchCleanup(() => {
    console.log('Second callback still runs')
  })
})

// Error is logged, but second callback executes
```

**Best Practices:**

1. **Use for consequence actions**: When an effect's consequences would trigger the effect again
2. **Keep callbacks focused**: Each deferred callback should do one thing
3. **Prefer defer alias**: `defer` is more semantic than `addBatchCleanup` for deferring work
4. **Document why**: Add a comment explaining why deferral is needed

```typescript
effect(() => {
  processData()
  
  // Defer movement creation to avoid triggering this effect again
  // (createMovement modifies state that this effect reads)
  defer(() => {
    createMovement(data)
  })
})
```

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
- **`'strict'`**: Checks the graph BEFORE execution. Prevents infinite loops at the source (higher overhead).

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

