# PromiseChain

A TypeScript utility that transforms promises into chainable objects, allowing you to call methods directly on promise results without awaiting them first.

## Overview

The `promiseChain` module provides a way to work with promises in a more fluent, chainable manner. Instead of using `await` at every step, you can call methods directly on promise results and let the system handle the promise resolution automatically.

## API Reference

### `chainPromise<T>(given: Promise<T> | T): PromiseChain<T>`

Transforms a promise or value into a chainable object that automatically handles promise resolution and method forwarding.

**Parameters:**
- `given`: A promise or any value to make chainable

**Returns:** A chainable object that maintains the original promise methods (`then`, `catch`, `finally`) while allowing direct method access

**Example:**
```typescript
import { chainPromise } from './promiseChain'

// Basic usage
const result = await chainPromise(Promise.resolve({ name: 'John', age: 30 })).getName()
console.log(result) // 'John'

// Chaining multiple methods
const info = await chainPromise(fetchUserData())
  .getProfile()
  .getSettings()
  .getPreferences()
```

## Type Definitions

### `PromiseChain<T>`

A type that represents a chainable promise with the following characteristics:

- **For Functions**: Returns a chainable function that can be called and returns a `PromiseChain`
- **For Objects**: Returns a chainable object where all properties return `PromiseChain` instances
- **For Primitives**: Returns a promise that resolves to the primitive value
- **Promise Methods**: Maintains original `then`, `catch`, and `finally` methods

### `Resolved<T>`

A utility type that recursively resolves promise types:

```typescript
type Resolved<T> = T extends Promise<infer U>
  ? Resolved<U>
  : T extends (...args: infer Args) => infer R
    ? (...args: Args) => Resolved<R>
    : T extends object
      ? { [k in keyof T]: k extends 'then' | 'catch' | 'finally' ? T[k] : Resolved<T[k]> }
      : T
```

## Usage Examples

### Basic Method Chaining

```typescript
import { chainPromise } from './promiseChain'

// Define an API object
const api = {
  getUser: (id: string) => Promise.resolve({
    id,
    name: 'John Doe',
    email: 'john@example.com',
    getProfile: () => Promise.resolve({
      bio: 'Software developer',
      avatar: 'avatar.jpg',
      getSettings: () => Promise.resolve({
        theme: 'dark',
        notifications: true
      })
    })
  })
}

// Chain method calls without await
const settings = await chainPromise(api.getUser('123'))
  .getProfile()
  .getSettings()

console.log(settings) // { theme: 'dark', notifications: true }
```

### Function Chaining

```typescript
const mathOperations = {
  add: (a: number) => (b: number) => Promise.resolve(a + b),
  multiply: (a: number) => (b: number) => Promise.resolve(a * b),
  square: (a: number) => Promise.resolve(a * a)
}

// Chain function calls
const result = await chainPromise(mathOperations.add(5)(10))
  .multiply(2)
  .square()

console.log(result) // 900 (15 * 2 = 30, 30^2 = 900)
```

### API Data Processing

```typescript
const dataService = {
  fetchUsers: () => Promise.resolve([
    { id: 1, name: 'Alice', active: true },
    { id: 2, name: 'Bob', active: false },
    { id: 3, name: 'Charlie', active: true }
  ]),
  filterActive: (users: any[]) => users.filter(user => user.active),
  mapNames: (users: any[]) => users.map(user => user.name),
  sort: (names: string[]) => names.sort()
}

// Process data through a chain
const activeUserNames = await chainPromise(dataService.fetchUsers())
  .filterActive()
  .mapNames()
  .sort()

console.log(activeUserNames) // ['Alice', 'Charlie']
```

### Error Handling

```typescript
const riskyOperation = () => Promise.resolve({
  mightFail: () => Promise.reject(new Error('Something went wrong')),
  safeOperation: () => Promise.resolve('Success')
})

// Handle errors in the chain
try {
  const result = await chainPromise(riskyOperation())
    .mightFail()
    .safeOperation()
} catch (error) {
  console.error('Chain failed:', error.message)
}

// Or use promise methods
const result = await chainPromise(riskyOperation())
  .mightFail()
  .catch(() => ({ safeOperation: () => Promise.resolve('Fallback') }))
  .safeOperation()
```

### Mixed Promise and Non-Promise Operations

```typescript
const mixedOperations = {
  getData: () => Promise.resolve({ value: 42 }),
  process: (data: any) => data.value * 2, // Synchronous
  validate: (value: number) => Promise.resolve(value > 0),
  format: (isValid: boolean) => isValid ? 'Valid' : 'Invalid'
}

// Chain synchronous and asynchronous operations
const result = await chainPromise(mixedOperations.getData())
  .process() // Synchronous
  .validate() // Asynchronous
  .format() // Asynchronous

console.log(result) // 'Valid'
```

### Working with Arrays

```typescript
const arrayOperations = {
  getNumbers: () => Promise.resolve([1, 2, 3, 4, 5]),
  filter: (arr: number[]) => arr.filter(n => n % 2 === 0),
  map: (arr: number[]) => arr.map(n => n * 2),
  reduce: (arr: number[]) => arr.reduce((sum, n) => sum + n, 0)
}

// Chain array operations
const sum = await chainPromise(arrayOperations.getNumbers())
  .filter() // [2, 4]
  .map() // [4, 8]
  .reduce() // 12

console.log(sum) // 12
```

## Key Features

- **Automatic Promise Resolution**: No need to use `await` at every step
- **Method Forwarding**: Direct access to methods on promise results
- **Type Safety**: Full TypeScript support with proper type inference
- **Promise Method Preservation**: Maintains `then`, `catch`, and `finally` methods
- **Caching**: WeakMap-based caching prevents duplicate wrapping
- **Flexible**: Works with functions, objects, and primitive values
- **Error Propagation**: Errors in the chain are properly propagated

## Use Cases

- **API Chaining**: Chain multiple API calls without intermediate awaits
- **Data Processing Pipelines**: Process data through multiple transformation steps
- **Functional Programming**: Create fluent interfaces for promise-based operations
- **Reducing Boilerplate**: Eliminate repetitive `await` statements
- **Complex Async Workflows**: Simplify complex asynchronous operation chains
- **Promise Composition**: Compose multiple promise-based operations elegantly

## Performance Considerations

- **Caching**: The system uses WeakMaps to cache wrapped objects, preventing duplicate wrapping
- **Lazy Evaluation**: Methods are only called when the chain is awaited
- **Memory Management**: WeakMaps ensure proper garbage collection of cached objects
- **Proxy Overhead**: Each chainable object is wrapped in a Proxy, which has minimal performance impact for most use cases
