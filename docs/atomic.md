# @atomic Decorator

The `@atomic` decorator is a powerful tool for batching reactive effects in the MutTs reactivity system. When applied to a method, it ensures that all effects triggered by reactive state changes within that method are batched together and executed only once, rather than after each individual change.

## Overview

In reactive systems, each state change typically triggers its dependent effects immediately. However, when you need to make multiple related changes as a single unit, this can lead to:

- Multiple unnecessary effect executions
- Inconsistent intermediate states being observed
- Performance overhead from redundant computations

The `@atomic` decorator solves this by deferring effect execution until the method completes, treating all changes as a single atomic operation.

## Basic Usage

### Decorator Syntax

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

### Function Syntax

For standalone functions or when you need more flexibility, you can use the `atomic` function directly:

```typescript
import { reactive, effect, atomicFn } from 'mutts'

const state = reactive({ a: 0, b: 0, c: 0 })
let effectCount = 0

effect(() => {
  effectCount++
  console.log(`Effect ran: a=${state.a}, b=${state.b}, c=${state.c}`)
})

// Using atomic function
atomicFn(() => {
  state.a = 1
  state.b = 2
  state.c = 3
})

// Output:
// Effect ran: a=0, b=0, c=0  (initial run)
// Effect ran: a=1, b=2, c=3  (only one additional run despite 3 changes)
```

### Returning Values

The atomic function can return values:

```typescript
const result = atomicFn(() => {
  state.a = 10
  state.b = 20
  return state.a + state.b
})

console.log(result) // 30
```

## When to Use Each Approach

### Use `@atomic` Decorator When:
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

### Use `atomicFn()` Function When:
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
  
  return shouldBatch ? atomicFn(updateFn) : updateFn()
}

// Functional approach
const processItems = (items: Item[]) => {
  return atomicFn(() => {
    items.forEach(item => state.items.set(item.id, item))
    state.count = state.items.size
    return state.count
  })
}
```

## Key Behaviors

### Immediate Execution, Batched Effects

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

### Nested Atomic Methods

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

### Cascading Effects

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

## Advanced Usage

### Working with Reactive Classes

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

### Complex Data Structures

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

### Error Handling

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

### Async Operations

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

## Performance Benefits

### Reduced Effect Executions

Without `@atomic`:
```typescript
// This would trigger the effect 3 times
state.a = 1  // Effect runs
state.b = 2  // Effect runs
state.c = 3  // Effect runs
```

With `@atomic`:
```typescript
@atomic
updateAll() {
  state.a = 1
  state.b = 2
  state.c = 3
}
// Effect runs only once
```

### Consistent State

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

## Best Practices

### Use for Related Changes

Apply `@atomic` to methods that make logically related changes:

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

### Combine with Other Decorators

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

### Consider Performance

For methods that make many changes, `@atomic` provides significant performance benefits:

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

## Limitations

- **Method-only**: The decorator only works on class methods, not standalone functions
- **Synchronous batching**: Effects are batched until the method completes, but async operations within the method don't affect the batching
- **Error handling**: If a method throws, effects still run for changes made before the error

## Integration

The `@atomic` decorator integrates seamlessly with:

- `@reactive` classes
- `@unreactive` property marking
- `effect()` functions
- `computed()` values
- Native collection types (Array, Map, Set, etc.)

## Example: Complete Usage

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

This example demonstrates how `@atomic` ensures that complex state updates are treated as single, consistent operations, improving both performance and reliability.
