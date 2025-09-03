# Cached

A TypeScript library that provides a decorator for caching getter results and preventing circular dependencies.

## Overview

The `cached` module provides a decorator that can be applied to getter methods to cache their results and detect circular dependencies. This is useful for expensive computations that should only be calculated once and for preventing infinite recursion in complex object graphs.

## API Reference

### `@cached`

A decorator that can be applied to getter methods to cache their results and detect circular dependencies.

**Target:** Getter methods only

**Returns:** Modified property descriptor with caching logic

**Throws:**

- `Error`: If applied to a non-getter method
- `Error`: If circular dependency is detected

### `isCached(object: Object, propertyKey: PropertyKey): boolean`

Checks if a property on an object has been cached.

**Parameters:**

- `object`: The object to check
- `propertyKey`: The property key to check

**Returns:** `true` if the property is cached, `false` otherwise

### `cache(object: Object, propertyKey: PropertyKey, value: any): void`

Manually caches a value for a property on an object.

**Parameters:**

- `object`: The object to cache the value on
- `propertyKey`: The property key to cache
- `value`: The value to cache

## Usage Examples

### Basic Caching

```typescript
import { cached } from './cached'

class ExpensiveCalculator {
  @cached
  get expensiveValue() {
    // This will only be calculated once
    return this.performExpensiveCalculation()
  }
  
  private performExpensiveCalculation() {
    // Simulate expensive computation
    return Math.random() * 1000
  }
}

const calculator = new ExpensiveCalculator()
console.log(calculator.expensiveValue) // Calculated
console.log(calculator.expensiveValue) // Cached result
```

### Circular Dependency Detection

```typescript
import { cached } from './cached'

class CircularObject {
  @cached
  get valueA() {
    return this.valueB + 1 // This will cause circular dependency
  }
  
  @cached
  get valueB() {
    return this.valueA + 1 // This will cause circular dependency
  }
}

const obj = new CircularObject()
// This will throw: "Circular dependency detected: CircularObject.valueA -> CircularObject.valueB -> again"
console.log(obj.valueA)
```

### Complex Object Graph

```typescript
import { cached } from './cached'

class Node {
  constructor(public id: string, public children: Node[] = []) {}
  
  @cached
  get totalChildren() {
    return this.children.reduce((total, child) => {
      return total + 1 + child.totalChildren
    }, 0)
  }
  
  @cached
  get depth() {
    if (this.children.length === 0) return 0
    return Math.max(...this.children.map(child => child.depth)) + 1
  }
}

const root = new Node('root', [
  new Node('child1', [new Node('grandchild1')]),
  new Node('child2')
])

console.log(root.totalChildren) // 3
console.log(root.depth) // 2
```

### Manual Caching

```typescript
import { cache, isCached } from './cached'

class ManualCache {
  private _value: number | undefined
  
  get value() {
    if (this._value !== undefined) {
      return this._value
    }
    
    const result = this.calculateValue()
    cache(this, 'value', result)
    return result
  }
  
  private calculateValue() {
    return Math.random() * 100
  }
}

const obj = new ManualCache()
console.log(isCached(obj, 'value')) // false
console.log(obj.value) // Calculated and cached
console.log(isCached(obj, 'value')) // true
```

## Implementation Details

### Thread Safety

The current implementation uses a global array for tracking circular dependencies, which means it's not thread-safe. In a multi-threaded environment (like Node.js with worker threads), you might need to use zone.js or a similar solution to avoid async re-entrance issues.

## Error Messages

### Circular Dependency Error

When a circular dependency is detected, the error message includes the full path of the circular reference:

```txt
Circular dependency detected: ClassA.propertyA -> ClassB.propertyB -> ClassC.propertyC -> again
```

### Invalid Usage Error

When the decorator is applied to a non-getter method:

```txt
@cached can only be used on getters
```

## Best Practices

1. **Use for expensive computations**: Only apply `@cached` to getters that perform expensive calculations
2. **Avoid side effects**: Cached getters should be pure functions without side effects
3. **Consider memory usage**: Cached values persist for the lifetime of the object
4. **Test for circular dependencies**: Always test complex object graphs for circular references
5. **Use manual caching for complex logic**: For more control, use the `cache()` function directly

## Limitations

1. **Global state**: The circular dependency detection uses global state
2. **Not thread-safe**: The current implementation is not safe for concurrent access
3. **Memory overhead**: Cached values are stored indefinitely
4. **Getter-only**: Can only be applied to getter methods, not setters or regular methods

## Related

- [JavaScript Decorators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Decorators)
- [Object.defineProperty](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)
- [Zone.js](https://github.com/angular/zone.js) - For async re-entrance handling
