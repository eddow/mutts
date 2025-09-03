# Indexable

A TypeScript library that provides a mixin to make classes indexable with custom getter and setter logic.

## Overview

The `Indexable` mixin allows you to create classes that support numeric index access (`obj[0]`, `obj[1]`, etc.) with custom logic for getting and setting values. This is useful for creating array-like objects, custom collections, or any class that needs indexed access.

## API Reference

### `Indexable<Items, Base>(base, accessor)`

Creates an indexable class from a base class with a custom accessor object.

**Parameters:**

- `base`: The base class constructor
- `accessor`: An object with `get` and `set` methods for index access

**Returns:** A new class constructor that extends the base class and supports numeric indexing

### `Indexable<Items>(accessor)`

Creates an indexable class from scratch with a custom accessor object.

**Parameters:**

- `accessor`: An object with `get` and `set` methods for index access

**Returns:** A new class constructor that supports numeric indexing

### `Indexable<Base>(base)`

Creates an indexable class from a base class that already implements `[getAt]` and optionally `[setAt]` methods.

**Parameters:**

- `base`: The base class constructor that implements `[getAt]` method

**Returns:** A new class constructor that extends the base class and supports numeric indexing

### `Indexable<Items>()`

Creates an abstract class that requires implementation of `[getAt]` method.

**Returns:** An abstract class constructor that enforces `[getAt]` implementation

## Symbols

- `getAt`: Symbol for the getter method
- `setAt`: Symbol for the setter method

## Usage Examples

### Basic Usage with Custom Accessor

```typescript
import { Indexable } from './indexable'

class MyArray {
  constructor(public items: string[]) {}
}

const IndexableArray = Indexable(MyArray, {
  get: (obj, index) => obj.items[index],
  set(obj, index, value) { obj.items[index] = value }
})

const instance = new IndexableArray(['a', 'b', 'c'])
console.log(instance[0]) // 'a'
instance[0] = 'x'
console.log(instance[0]) // 'x'
```

### Using Base Classes with Symbol Methods

```typescript
import { Indexable, getAt, setAt } from './indexable'

class CustomArray {
  constructor(public items: number[]) {}
  
  [getAt](index: number): number {
    return this.items[index] * 2
  }
  
  [setAt](index: number, value: number): void {
    this.items[index] = value / 2
  }
}

const IndexableArray = Indexable(CustomArray)
const instance = new IndexableArray([1, 2, 3])

console.log(instance[0]) // 2
instance[0] = 10
console.log(instance[0]) // 10
console.log(instance.items[0]) // 5
```

### Abstract Class Usage

```typescript
import { Indexable, getAt } from './indexable'

const AbstractIndexable = Indexable<string>()

class StringArray extends AbstractIndexable {
  constructor(private items: string[]) {
    super()
  }
  
  [getAt](index: number): string {
    return this.items[index]
  }
}

const instance = new StringArray(['a', 'b', 'c'])
console.log(instance[0]) // 'a'
```

### Transformation Example

```typescript
import { Indexable } from './indexable'

class NumberArray {
  constructor(public numbers: number[]) {}
}

const IndexableArray = Indexable(NumberArray, {
  get: (obj, index) => obj.numbers[index] * 2,
  set(obj, index, value) { obj.numbers[index] = value / 2 }
})

const instance = new IndexableArray([1, 2, 3])
console.log(instance[0]) // 2
instance[0] = 10
console.log(instance[0]) // 10
console.log(instance.numbers[0]) // 5
```

### Read-Only Access

```typescript
import { Indexable } from './indexable'

class ReadOnlyArray {
  constructor(public items: string[]) {}
}

const IndexableArray = Indexable(ReadOnlyArray, {
  get: (obj, index) => obj.items[index],
})
const instance = new IndexableArray(['a', 'b', 'c'])

console.log(instance[0]) // 'a'
// instance[0] = 'x' // This will throw an error
```

### Indexable from Accessor Only

```typescript
import { Indexable } from './indexable'

const IndexableObj = Indexable({
  get: (obj: any, index: number) => obj._arr?.[index],
  set(obj: any, index: number, value: any) {
    if (!obj._arr) obj._arr = []
    obj._arr[index] = value
  }
})
const instance = new IndexableObj() as any
instance._arr = ['a', 'b', 'c']
console.log(instance[0]) // 'a'
instance[0] = 'x'
console.log(instance[0]) // 'x'
```

## Error Handling

### Missing Setter Method

When a base class implements `[getAt]` but not `[setAt]`, or the accessor omits `set`, attempting to set a value will throw:

```txt
Indexable class has read-only numeric index access
```

### Missing Getter Method

When using the default getter and the base class doesn't implement `[getAt]`, accessing an index will throw:

```txt
Indexable class must have an [getAt] method
```

## Implementation Details

### Proxy-Based Implementation

The library uses JavaScript's `Proxy` to intercept property access and assignment. When a numeric property is accessed:

1. The proxy checks if the property is a number
2. If it's a number, it calls the appropriate getter or setter function
3. If it's not a number, it delegates to the original object

### Symbol-Based Methods

The library uses symbols (`getAt` and `setAt`) to avoid naming conflicts with existing methods. This ensures that the indexing functionality doesn't interfere with other properties or methods of the class.

### Type Safety

The library provides full TypeScript support with proper type inference for:

- Return types based on the getter function
- Parameter types for constructor arguments
- Index access types
