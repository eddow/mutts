# Mixin System

The mixin system provides a powerful way to create reusable functionality that can be applied to classes either as base classes or as mixin functions.

## Overview

The `mixin()` function creates a mixin that can be used in two ways:
1. **As a base class** - `class MyClass extends MyMixin`
2. **As a mixin function** - `class MyClass extends MyMixin(SomeBase)`

## Basic Usage

### Creating a Mixin

```typescript
import { mixin } from 'mutts/mixin'

const CounterMixin = mixin((base) => {
  return class extends base {
    count = 0

    increment() {
      this.count++
    }

    getCount() {
      return this.count
    }
  }
})
```

### Using as Base Class

```typescript
class MyClass extends CounterMixin {
  name = 'MyClass'

  greet() {
    return `Hello, I'm ${this.name} with count ${this.count}`
  }
}

const instance = new MyClass()
instance.increment()
console.log(instance.greet()) // "Hello, I'm MyClass with count 1"
```

### Using as Mixin Function

```typescript
class BaseClass {
  value = 42
}

class MyClass extends CounterMixin(BaseClass) {
  name = 'MyClass'
}

const instance = new MyClass()
console.log(instance.value) // 42 (from BaseClass)
console.log(instance.count) // 0 (from CounterMixin)
instance.increment()
console.log(instance.getCount()) // 1
```

## Advanced Examples

### Eventful Mixin

```typescript
const EventfulMixin = mixin((base) => {
  return class extends base {
    #events = new Map()

    on(event: string, callback: Function) {
      if (!this.#events.has(event)) {
        this.#events.set(event, [])
      }
      this.#events.get(event)!.push(callback)
    }

    emit(event: string, ...args: any[]) {
      const callbacks = this.#events.get(event) || []
      callbacks.forEach(cb => cb(...args))
    }

    off(event: string, callback?: Function) {
      if (!callback) {
        this.#events.delete(event)
        return
      }
      const callbacks = this.#events.get(event) || []
      this.#events.set(event, callbacks.filter(cb => cb !== callback))
    }
  }
})

// Use as base class
class EventEmitter extends EventfulMixin {
  constructor(public name: string) {
    super()
  }
}

// Use as mixin
class GameObject extends EventfulMixin(BaseClass) {
  constructor(public id: string) {
    super()
  }
}
```

### Combining Mixins

```typescript
class BaseModel {
  id = Math.random().toString(36)
}

class UserModel extends EventfulMixin(CounterMixin(BaseModel)) {
  name = 'User'
  email = 'user@example.com'

  updateProfile(newName: string) {
    this.name = newName
    this.emit('profileUpdated', { name: newName })
    this.increment()
  }
}

const user = new UserModel()
user.on('profileUpdated', (data) => {
  console.log('Profile updated:', data)
})

user.updateProfile('John Doe')
// Output: "Profile updated: { name: 'John Doe' }"
// user.count is now 1
```

## Caching

The mixin system automatically caches results to ensure that the same base class always returns the same mixed class. This provides:

- **Performance**: No repeated class creation
- **Identity**: Same base class always produces the same mixed class
- **Memory efficiency**: Automatic cleanup when base classes are garbage collected

```typescript
const MixinA = mixin((base) => class extends base { prop = 'A' })
const MixinB = mixin((base) => class extends base { prop = 'B' })

class BaseClass {}

const Mixed1 = MixinA(BaseClass)
const Mixed2 = MixinA(BaseClass)

console.log(Mixed1 === Mixed2) // true - same reference due to caching
```

## Error Handling

The mixin system provides clear error messages for invalid usage:

```typescript
const MyMixin = mixin((base) => class extends base {})

// ❌ Error: Mixin requires a base class
MyMixin()

// ❌ Error: Mixin requires a constructor function  
MyMixin('not a function')

// ✅ Valid usage
MyMixin(SomeClass)
```

## Type Safety

The mixin system preserves TypeScript type information:

```typescript
interface User {
  name: string
  email: string
}

const UserMixin = mixin((base) => {
  return class extends base {
    validateEmail(): boolean {
      return this.email.includes('@')
    }
  }
})

class UserModel extends UserMixin {
  name = ''
  email = ''
}

const user = new UserModel()
user.validateEmail() // TypeScript knows this method exists
```

## Best Practices

1. **Keep mixins focused**: Each mixin should provide a single, cohesive piece of functionality
2. **Use descriptive names**: Make it clear what functionality the mixin provides
3. **Document behavior**: Include JSDoc comments for mixin methods
4. **Consider composition**: Combine multiple small mixins rather than creating one large mixin
5. **Test thoroughly**: Mixins can have complex interactions, so comprehensive testing is important

## Integration with MutTs

The mixin system is designed to work seamlessly with other MutTs features:

- **ReactiveBase**: Can be used as a mixin to add reactivity to any class
- **Eventful**: Can be used as a mixin to add event handling to any class
- **Destroyable**: Can be used as a mixin to add cleanup functionality to any class

This allows for powerful combinations like:

```typescript
// Reactive + Eventful + Destroyable
class GameEntity extends Destroyable(Eventful(ReactiveBase(BaseClass))) {
  // Your game entity with all capabilities
}
```
