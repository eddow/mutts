
# Standard decorators

A TypeScript library that provides standard decorators that should stop being re-implemented for the 50th time

## Cached

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
import { cached } from 'mutts/std-decorators'

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
import { cached } from 'mutts/std-decorators'

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
import { cached } from 'mutts/std-decorators'

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
import { cache, isCached } from 'mutts/std-decorators'

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

## Describe

The `describe` decorator provides a clean, reusable way to configure property descriptors (enumerable, configurable, writable) for class properties. This decorator uses a functional approach that makes it easy to create reusable descriptor configurations.

## API Reference

### `describe(descriptor: PropertyDescriptor): <T>(...properties: (keyof T)[]) => GenericClassDecorator<T>`

A function that creates a decorator to configure property descriptors for specified properties.

**Parameters:**
- `descriptor`: An object with descriptor configuration
  - `enumerable?: boolean` - Controls whether the property appears in enumerations
  - `configurable?: boolean` - Controls whether the property descriptor can be changed
  - `writable?: boolean` - Controls whether the property value can be changed

**Returns:** A function that takes property names and returns a class decorator

**Usage Pattern:**
```typescript
const readonly = describe({ writable: false })
const hidden = describe({ enumerable: false })
const locked = describe({ configurable: false })

@readonly('id', 'createdAt')
@hidden('_private')
@locked('critical')
class MyClass { }
```

## Usage Examples

### Creating Reusable Decorators

```typescript
import { describe } from 'mutts/std-decorators'

// Create reusable descriptor configurations
const readonly = describe({ writable: false })
const hidden = describe({ enumerable: false })
const locked = describe({ configurable: false })

// Use them on classes
@readonly('id', 'createdAt')
@hidden('_private', '_cache')
@locked('critical')
class User {
  id: string = 'user-123'
  name: string = 'John'
  _private: string = 'secret'
  _cache: Map<string, any> = new Map()
  createdAt: Date = new Date()
  critical: string = 'locked'
  
  constructor(name: string) {
    this.name = name
  }
}

const user = new User('Alice')
console.log(Object.keys(user)) // ['id', 'name', 'createdAt', 'critical'] - only enumerable properties
```

### Making Properties Non-Enumerable

```typescript
import { describe } from 'mutts/std-decorators'

const hidden = describe({ enumerable: false })

@hidden('_internal', '_cache', 'debug')
class CacheManager {
  public data: any[] = []
  _internal: Map<string, any> = new Map()
  _cache: WeakMap<object, any> = new WeakMap()
  debug: boolean = false
  
  getCached(key: string) {
    return this._internal.get(key)
  }
}

const cache = new CacheManager()
// Only public properties are enumerable
console.log(Object.keys(cache)) // ['data']
console.log(Object.getOwnPropertyNames(cache)) // ['data', '_internal', '_cache', 'debug']
```

### Read-Only Properties

```typescript
import { describe } from 'mutts/std-decorators'

const readonly = describe({ writable: false })
const readonlyLocked = describe({ writable: false, configurable: false })

@readonly('createdAt', 'version')
@readonlyLocked('id')
class Document {
  id: string
  title: string
  createdAt: Date
  version: number = 1
  
  constructor(id: string, title: string) {
    this.id = id
    this.title = title
    this.createdAt = new Date()
  }
  
  updateTitle(newTitle: string) {
    this.title = newTitle
    this.version++
  }
}

const doc = new Document('doc-1', 'My Document')
// doc.id = 'new-id' // TypeError: Cannot assign to read only property 'id'
// doc.createdAt = new Date() // TypeError: Cannot assign to read only property 'createdAt'
doc.updateTitle('Updated Title') // This works
```

### Configuration Control

```typescript
import { describe } from 'mutts/std-decorators'

const locked = describe({ configurable: false })
const frozen = describe({ configurable: false, writable: false })

@locked('_sealed')
@frozen('_frozen')
class SecureObject {
  public data: any
  _sealed: string = 'cannot be reconfigured'
  _frozen: string = 'cannot be changed or reconfigured'
  
  constructor(data: any) {
    this.data = data
  }
}

const obj = new SecureObject({ key: 'value' })
// Object.defineProperty(obj, '_sealed', { value: 'new' }) // TypeError: Cannot redefine property
// Object.defineProperty(obj, '_frozen', { value: 'new' }) // TypeError: Cannot redefine property
```

## Implementation Details

### Functional Approach

The `describe` decorator uses a functional approach that separates descriptor configuration from property selection:

```typescript
// Create reusable configurations once
const readonly = describe({ writable: false })
const hidden = describe({ enumerable: false })

// Apply to multiple classes with different properties
@readonly('id', 'createdAt')
class User { }

@readonly('version', 'buildDate')  
class Package { }
```

### Common Decorator Patterns

The functional approach makes it easy to create common decorator patterns:

```typescript
import { describe } from './std-decorators'

// Common reusable decorators
export const readonly = describe({ writable: false })
export const hidden = describe({ enumerable: false })
export const locked = describe({ configurable: false })
export const frozen = describe({ writable: false, configurable: false })
export const private = describe({ enumerable: false, configurable: false })

// Usage examples
@readonly('id', 'createdAt')
@hidden('_cache', '_internal')
@locked('critical')
class SecureData {
  id: string = 'secure-1'
  _cache: Map<string, any> = new Map()
  _internal: any = {}
  createdAt: Date = new Date()
  critical: string = 'locked'
  public: string = 'visible'
}
```

### Property Descriptor Merging

The decorator merges the provided descriptor configuration with the existing property descriptor, allowing you to override specific aspects while preserving others:

```typescript
// Original property might have { enumerable: true, writable: true, configurable: true }
// After @readonly('prop') where readonly = describe({ writable: false })
// Final descriptor: { enumerable: true, writable: false, configurable: true }
```

### Constructor Timing

The property descriptor configuration is applied in the constructor after calling the parent constructor, ensuring that the properties are properly initialized before descriptor modification.

## Best Practices

1. **Create reusable configurations**: Define descriptor configurations once and reuse them
2. **Use descriptive names**: Name your descriptor configurations clearly (`readonly`, `hidden`, `locked`)
3. **Combine multiple decorators**: Stack multiple `describe` decorators for complex configurations
4. **Use for encapsulation**: Hide internal properties from enumeration
5. **Control immutability**: Make critical properties read-only
6. **Prevent reconfiguration**: Lock important properties from being modified

## Limitations

1. **Class-level only**: Cannot be applied to individual properties
2. **Constructor timing**: Properties must exist before descriptor modification
3. **No runtime changes**: Descriptor configuration is fixed at class definition time
4. **Type safety**: TypeScript doesn't enforce descriptor constraints at compile time

## Deprecated

The `deprecated` decorator provides a way to mark methods, getters, setters, or classes as deprecated with optional custom warning messages.

## API Reference

### `@deprecated` / `@deprecated(message: string)`

A decorator that can be applied to methods, getters, setters, or classes to mark them as deprecated.

**Target:** Methods, getters, setters, classes

**Parameters:**
- `message` (optional): Custom deprecation message to display

**Returns:** Modified method/getter/setter/class with deprecation warning

**Throws:**
- `Error`: If applied to an unsupported target

## Usage Examples

### Basic Deprecation

```typescript
import { deprecated } from 'mutts/std-decorators'

class API {
  @deprecated
  oldMethod() {
    return 'old implementation'
  }
  
  @deprecated
  get oldValue() {
    return 'deprecated value'
  }
}

const api = new API()
api.oldMethod() // Console: "API.oldMethod is deprecated"
api.oldValue    // Console: "API.oldValue is deprecated"
```

### Custom Deprecation Messages

```typescript
import { deprecated } from 'mutts/std-decorators'

class API {
  @deprecated('Use newMethod() instead')
  oldMethod() {
    return 'old implementation'
  }
  
  @deprecated('This will be removed in v2.0')
  get oldValue() {
    return 'deprecated value'
  }
  
  @deprecated('Use setNewValue() instead')
  set oldValue(value: string) {
    // deprecated setter
  }
}

const api = new API()
api.oldMethod() // Console: "API.oldMethod is deprecated: Use newMethod() instead"
api.oldValue    // Console: "API.oldValue is deprecated: This will be removed in v2.0"
api.oldValue = 'test' // Console: "API.oldValue is deprecated: Use setNewValue() instead"
```

### Class Deprecation

```typescript
import { deprecated } from './std-decorators'

@deprecated('Use NewClass instead')
class OldClass {
  constructor() {}
}

new OldClass() // Console: "OldClass.constructor is deprecated: Use NewClass instead"
```

### Multiple Deprecation Messages

```typescript
import { deprecated } from './std-decorators'

class API {
  @deprecated('This will be removed in v2.0')
  method1() {}
  
  @deprecated('Use the new API')
  method2() {}
  
  @deprecated('Legacy support only')
  method3() {}
}
```

## Implementation Details

### Warning Message Format

The default warning message format is:
```
{ClassName}.{methodName} is deprecated
```

With custom message:
```
{ClassName}.{methodName} is deprecated: {customMessage}
```

### Console Output

The decorator uses `console.warn()` to display deprecation messages. You can override the warning behavior by modifying the `deprecated.warn` function:

```typescript
import { deprecated } from './std-decorators'

// Override the warning function
deprecated.warn = (target, propertyKey, message?) => {
  // Custom warning logic
  alert(`${target.constructor.name}.${String(propertyKey)} is deprecated${message ? `: ${message}` : ''}`)
}
```

## Best Practices

1. **Provide clear alternatives**: Always include information about what to use instead
2. **Include version information**: Mention when the deprecated feature will be removed
3. **Use consistent messaging**: Follow a consistent format across your codebase
4. **Document migration paths**: Provide clear upgrade instructions
5. **Monitor usage**: Track which deprecated features are still being used

## Debounce

The `debounce` decorator delays the execution of a method until a specified amount of time has passed since the last time it was called. This is useful for handling rapid events like keystrokes or window resizing.

## API Reference

### `@debounce(delay: number)`

A decorator that debounces a method.

**Parameters:**
- `delay`: The delay in milliseconds to wait before executing the method.

**Returns:** A method decorator.

## Usage Example

```typescript
import { debounce } from 'mutts/std-decorators'

class SearchComponent {
  @debounce(300)
  onSearch(query: string) {
    // This will only run after 300ms of inactivity
    console.log(`Searching for: ${query}`)
    this.performApiCall(query)
  }

  performApiCall(query: string) {
    // ...
  }
}
```

## Throttle

The `throttle` decorator limits the execution of a method to at most once every specified amount of time. This is useful for rate-limiting expensive operations like scroll handlers or animations.

## API Reference

### `@throttle(delay: number)`

A decorator that throttles a method.

**Parameters:**
- `delay`: The time interval in milliseconds.

**Returns:** A method decorator.

## Usage Example

```typescript
import { throttle } from 'mutts/std-decorators'

class ScrollHandler {
  @throttle(100)
  onScroll(event: Event) {
    // This will run at most once every 100ms
    console.log('Scroll event processed')
    this.updateUI()
  }

  updateUI() {
    // ...
  }
}
```

## Related

- [JavaScript Decorators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Decorators)
- [Object.defineProperty](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)
- [Object.getOwnPropertyDescriptor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor)
- [Zone.js](https://github.com/angular/zone.js) - For async re-entrance handling
