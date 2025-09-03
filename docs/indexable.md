# Indexable Documentation

## 1. Overview

### Introduction

The `Indexable` utility is a powerful TypeScript/JavaScript function that enables classes to have numeric index access similar to arrays, while maintaining full control over how values are retrieved and stored. It uses JavaScript's Proxy API to intercept property access and provide custom indexing behavior.

### What is Indexable?

`Indexable` is a factory function that creates classes with numeric index access capabilities. It allows you to:
- Access object properties using numeric indices (e.g., `obj[0]`, `obj[1]`)
- Customize how values are retrieved and stored
- Extend existing classes with index access
- Create read-only or read-write indexable objects
- Maintain type safety with TypeScript

### Key Concepts

- **Index Access**: Numeric property access like arrays (`obj[0]`)
- **Proxy Interception**: Uses JavaScript Proxy to intercept property access
- **Accessor Functions**: Custom functions that define how to get/set values
- **Symbol-Based Methods**: Uses `getAt` and `setAt` symbols for custom access logic
- **Type Safety**: Full TypeScript support with generic types

### Use Cases

- Custom collection classes
- Data structures with numeric indexing
- Wrapper classes for external data sources
- Immutable data structures
- Performance-optimized access patterns

## 2. API Reference

### Core Symbols

#### getAt
```typescript
export const getAt = Symbol('getAt')
```
A symbol used to define custom getter logic for numeric index access. Classes can implement this method to control how values are retrieved.

#### setAt
```typescript
export const setAt = Symbol('setAt')
```
A symbol used to define custom setter logic for numeric index access. Classes can implement this method to control how values are stored.

### Main Function

#### Indexable()
```typescript
export function Indexable<Items, Base extends abstract new (...args: any[]) => any>(
    base: Base,
    accessor: Accessor<InstanceType<Base>, Items>
): new (...args: ConstructorParameters<Base>) => InstanceType<Base> & { [x: number]: Items }
```

The main factory function that creates indexable classes. It has multiple overloads to support different use cases.

### Interfaces

#### IndexingAt
```typescript
interface IndexingAt<Items = any> {
    [getAt](index: number): Items
}
```
Interface for classes that implement custom getter logic using the `getAt` symbol.

#### Accessor
```typescript
interface Accessor<T, Items> {
    get(this: T, index: number): Items
    set?(this: T, index: number, value: Items): void
}
```
Interface defining how to access and optionally modify values at numeric indices.

#### AbstractGetAt
```typescript
abstract class AbstractGetAt<Items = any> {
    abstract [getAt](index: number): Items
}
```
Abstract base class for creating indexable classes with custom getter logic.

### Type Utilities

#### AtReturnType
```typescript
type AtReturnType<T> = T extends { [getAt](index: number): infer R } ? R : never
```
Utility type that extracts the return type from a class's `getAt` method.

## 3. Function Overloads

### Overload 1: Base Class with Accessor
```typescript
Indexable<Items, Base>(base: Base, accessor: Accessor<InstanceType<Base>, Items>)
```
Creates an indexable class that extends an existing base class with custom accessor functions.

**Example:**
```typescript
class MyClass {
    constructor(public data: number[]) {}
}

const IndexableMyClass = Indexable(MyClass, {
    get(this: MyClass, index: number) {
        return this.data[index] * 2; // Custom access logic
    },
    set(this: MyClass, index: number, value: number) {
        this.data[index] = value / 2; // Custom storage logic
    }
});

const instance = new IndexableMyClass([1, 2, 3]);
console.log(instance[0]); // 2 (1 * 2)
instance[1] = 8; // Stores 4 (8 / 2)
```

### Overload 2: Accessor Only
```typescript
Indexable<Items>(accessor: Accessor<any, Items>)
```
Creates an indexable class with custom accessor functions but no base class.

**Example:**
```typescript
const IndexableClass = Indexable({
    get(this: any, index: number) {
        return `Item ${index}`;
    }
});

const instance = new IndexableClass();
console.log(instance[0]); // "Item 0"
console.log(instance[5]); // "Item 5"
```

### Overload 3: Base Class with getAt Method
```typescript
Indexable<Base extends new (...args: any[]) => IndexingAt>(base: Base)
```
Creates an indexable class from a base class that already implements the `getAt` method.

**Example:**
```typescript
class DataStore {
    constructor(private items: string[]) {}
    
    [getAt](index: number): string {
        return this.items[index] || 'default';
    }
}

const IndexableDataStore = Indexable(DataStore);
const store = new IndexableDataStore(['a', 'b', 'c']);
console.log(store[0]); // "a"
console.log(store[10]); // "default"
```

### Overload 4: Abstract Class
```typescript
Indexable<Items>()
```
Creates an abstract indexable class that must be extended with a `getAt` implementation.

**Example:**
```typescript
const AbstractIndexable = Indexable<string>();

class StringArray extends AbstractIndexable {
    constructor(private items: string[]) {
        super();
    }
    
    [getAt](index: number): string {
        return this.items[index] || '';
    }
}

const array = new StringArray(['hello', 'world']);
console.log(array[0]); // "hello"
```

## 4. Implementation Details

### Proxy-Based Architecture

The Indexable utility uses JavaScript's Proxy API to intercept property access. When you access a numeric property (e.g., `obj[0]`), the proxy:

1. Checks if the property exists on the target object
2. If it's a numeric property, calls the appropriate accessor function
3. If it's a regular property, delegates to the original object
4. Handles property setting with similar logic

### Prototype Chain Management

The utility carefully manages the prototype chain to ensure:
- Methods from the base class are accessible
- The proxy intercepts numeric property access
- Regular property access works normally
- Inheritance works correctly

### Property Access Interception

```typescript
// Simplified version of the proxy logic
new Proxy(base.prototype, {
    get(target, prop, receiver) {
        if (typeof prop === 'string') {
            const numProp = Number(prop);
            if (!Number.isNaN(numProp)) {
                return accessor.get.call(receiver, numProp);
            }
        }
        return target[prop];
    }
})
```

### Error Handling

The utility provides clear error messages for common issues:
- Missing `getAt` method: "Indexable class must have an [getAt] method"
- Read-only access: "Indexable class has read-only numeric index access"

## 5. Usage Examples

### Basic Usage

```typescript
// Create a simple indexable class
const SimpleIndexable = Indexable({
    get(this: any, index: number) {
        return `Value at index ${index}`;
    }
});

const obj = new SimpleIndexable();
console.log(obj[0]); // "Value at index 0"
console.log(obj[42]); // "Value at index 42"
```

### Custom Accessor Functions

```typescript
// Create an indexable class with custom logic
class DataWrapper {
    constructor(private data: any[]) {}
}

const IndexableWrapper = Indexable(DataWrapper, {
    get(this: DataWrapper, index: number) {
        const value = this.data[index];
        return value ? value.toUpperCase() : 'NOT_FOUND';
    },
    set(this: DataWrapper, index: number, value: any) {
        this.data[index] = value.toLowerCase();
    }
});

const wrapper = new IndexableWrapper(['hello', 'world']);
console.log(wrapper[0]); // "HELLO"
wrapper[1] = 'UNIVERSE';
console.log(wrapper[1]); // "universe"
```

### Extending Existing Classes

```typescript
// Extend a built-in class
class CustomArray extends Array {
    constructor(...items: number[]) {
        super(...items);
    }
}

const IndexableCustomArray = Indexable(CustomArray, {
    get(this: CustomArray, index: number) {
        const value = super[index];
        return value ? value * 2 : 0;
    }
});

const arr = new IndexableCustomArray(1, 2, 3);
console.log(arr[0]); // 2 (1 * 2)
console.log(arr[1]); // 4 (2 * 2)
```

### Read-Only Indexable Classes

```typescript
// Create a read-only indexable class
const ReadOnlyIndexable = Indexable({
    get(this: any, index: number) {
        return `Read-only value at ${index}`;
    }
    // No set method = read-only
});

const readOnly = new ReadOnlyIndexable();
console.log(readOnly[0]); // "Read-only value at 0"
// readOnly[0] = "new value"; // Error: read-only access
```

### Abstract Indexable Classes

```typescript
// Create an abstract indexable class
const AbstractStringIndexable = Indexable<string>();

class StringCollection extends AbstractStringIndexable {
    private items: string[] = [];
    
    [getAt](index: number): string {
        return this.items[index] || '';
    }
    
    add(item: string) {
        this.items.push(item);
    }
}

const collection = new StringCollection();
collection.add('first');
collection.add('second');
console.log(collection[0]); // "first"
console.log(collection[1]); // "second"
```

## 6. Advanced Patterns

### Combining with Other Decorators

```typescript
// Combine with class decorators
function Logged(target: any) {
    return class extends target {
        constructor(...args: any[]) {
            console.log(`Creating ${target.name}`);
            super(...args);
        }
    };
}

const LoggedIndexable = Logged(Indexable({
    get(this: any, index: number) {
        return `Item ${index}`;
    }
}));
```

### Performance Considerations

- **Proxy Overhead**: Each property access goes through the proxy, adding minimal overhead
- **Memory Usage**: Proxy objects use slightly more memory than regular objects
- **Caching**: Consider caching frequently accessed values if performance is critical
- **Batch Operations**: For bulk operations, access the underlying data directly

### Memory Management

- **Weak References**: Consider using WeakMap/WeakSet for storing references
- **Cleanup**: Implement cleanup methods if your accessor functions create closures
- **Circular References**: Be careful to avoid circular references in accessor functions

## 7. Troubleshooting

### Common Issues

**TypeScript Errors:**
```typescript
// Error: Property '0' does not exist on type 'MyClass'
// Solution: Ensure the class is properly typed with Indexable
const MyIndexableClass = Indexable(MyClass, accessor);
```

**Runtime Errors:**
```typescript
// Error: Indexable class must have an [getAt] method
// Solution: Implement the getAt method or provide an accessor function
```

**Property Access Issues:**
```typescript
// Error: Cannot set property '0' of read-only object
// Solution: Implement the setAt method or provide a set accessor
```

### Debugging Tips

1. **Check Accessor Functions**: Ensure your accessor functions are properly defined
2. **Verify Base Class**: Make sure the base class is compatible with Indexable
3. **Type Checking**: Use TypeScript's strict mode to catch type errors early
4. **Console Logging**: Add logging to accessor functions to debug access patterns

### Performance Issues

- **Profile Property Access**: Use browser dev tools to profile property access
- **Optimize Accessors**: Keep accessor functions lightweight
- **Consider Alternatives**: For high-performance scenarios, consider direct property access

## 8. Best Practices

### When to Use Indexable

**Use Indexable when:**
- You need numeric index access on custom classes
- You want to customize how values are retrieved/stored
- You're building data structure libraries
- You need type-safe index access

**Consider alternatives when:**
- Performance is critical and proxy overhead is unacceptable
- You only need simple array-like behavior (use Array directly)
- You're working with existing code that doesn't support proxies

### Design Patterns

1. **Accessor Pattern**: Separate access logic from data storage
2. **Proxy Pattern**: Use proxies for cross-cutting concerns
3. **Factory Pattern**: Create indexable classes dynamically
4. **Template Method**: Define abstract behavior with concrete implementations

### Testing Strategies

```typescript
// Test index access
describe('IndexableClass', () => {
    it('should access values by index', () => {
        const instance = new IndexableClass();
        expect(instance[0]).toBe('expected value');
    });
    
    it('should handle out-of-bounds access', () => {
        const instance = new IndexableClass();
        expect(instance[999]).toBe('default value');
    });
    
    it('should set values by index', () => {
        const instance = new IndexableClass();
        instance[0] = 'new value';
        expect(instance[0]).toBe('new value');
    });
});
```

## 9. Migration Guide

### From Manual Index Access

**Before:**
```typescript
class MyClass {
    getValue(index: number) {
        return this.data[index];
    }
    
    setValue(index: number, value: any) {
        this.data[index] = value;
    }
}

const obj = new MyClass();
const value = obj.getValue(0);
obj.setValue(1, 'new value');
```

**After:**
```typescript
const IndexableMyClass = Indexable(MyClass, {
    get(this: MyClass, index: number) {
        return this.data[index];
    },
    set(this: MyClass, index: number, value: any) {
        this.data[index] = value;
    }
});

const obj = new IndexableMyClass();
const value = obj[0];
obj[1] = 'new value';
```

### From Array-Like Classes

**Before:**
```typescript
class CustomArray {
    private items: any[] = [];
    
    get(index: number) {
        return this.items[index];
    }
    
    set(index: number, value: any) {
        this.items[index] = value;
    }
}
```

**After:**
```typescript
const IndexableCustomArray = Indexable(CustomArray, {
    get(this: CustomArray, index: number) {
        return this.items[index];
    },
    set(this: CustomArray, index: number, value: any) {
        this.items[index] = value;
    }
});
```

### Breaking Changes

- **Proxy Support**: Requires ES6+ environments with Proxy support
- **Type Safety**: May require TypeScript configuration updates
- **Performance**: Introduces proxy overhead for property access

## 10. Appendix

### TypeScript Configuration

```json
{
    "compilerOptions": {
        "target": "ES6",
        "lib": ["ES6", "DOM"],
        "strict": true,
        "experimentalDecorators": true
    }
}
```

### Browser Compatibility

- **ES6+**: Full support in modern browsers
- **IE11**: No support (no Proxy API)
- **Node.js**: 6.0+ for full support, 0.12+ with polyfills

### Related Utilities

- **Proxy**: JavaScript's built-in proxy API
- **Symbol**: Used for custom property keys
- **Object.setPrototypeOf**: For prototype chain manipulation

### Changelog

**v1.0.0**
- Initial release
- Support for all four function overloads
- Full TypeScript support
- Proxy-based implementation

---

This documentation provides a comprehensive guide to using the Indexable utility. The utility is particularly powerful for creating custom data structures that need numeric index access while maintaining full control over the access patterns and maintaining type safety.
