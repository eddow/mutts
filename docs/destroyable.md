# Destroyable

A comprehensive resource management system that provides automatic cleanup for objects with proper destructor handling. The destroyable system integrates with JavaScript's `FinalizationRegistry` for garbage collection-based cleanup and supports modern resource management patterns including the upcoming `using` statement.

## Key Features

- **Automatic Resource Management**: Objects are automatically cleaned up when garbage collected
- **Manual Destruction**: Explicit destruction with immediate cleanup
- **Resource Tracking**: Properties can be marked with `@allocated` to be tracked in a separate allocation object
- **Context Manager Integration**: Support for `Symbol.dispose` and context manager patterns
- **Type Safety**: Full TypeScript support with proper type inference
- **Destruction Safety**: Destroyed objects throw errors when accessed to prevent use-after-free bugs

## Basic Usage

### Creating Destroyable Classes

```typescript
import { Destroyable, allocated, destructor } from 'mutts/destroyable'

// Method 1: With destructor object
class DatabaseConnection {
  constructor(public host: string, public port: number) {
    console.log(`Connecting to ${host}:${port}`)
  }
}

const DestroyableDB = Destroyable(DatabaseConnection, {
  destructor(allocated) {
    console.log('Database connection destroyed')
    // Cleanup logic here
  }
})

// Method 2: With destructor method
class FileHandler extends Destroyable() {
  @allocated
  declare filePath: string

  constructor(path: string) {
    super()
    this.filePath = path
  }

  [destructor](allocated) {
    console.log(`Closing file: ${allocated.filePath}`)
    // Cleanup logic here
  }
}
```

### Using Destroyable Objects

```typescript
// Create and use
const db = new DestroyableDB('localhost', 5432)
const result = db.query('SELECT * FROM users')

// Manual destruction
DestroyableDB.destroy(db) // Returns true if destroyed successfully

// Check if object is destroyable
if (DestroyableDB.isDestroyable(db)) {
  // Object can be destroyed
}
```

## Resource Tracking with @allocated

The `@allocated` decorator automatically stores property values in a separate allocation object that gets passed to the destructor:

```typescript
class ResourceManager extends Destroyable() {
  @allocated
  accessor connection: DatabaseConnection

  @allocated
  accessor cache: Map<string, any>

  constructor() {
    super()
    this.connection = new DatabaseConnection('localhost', 5432)
    this.cache = new Map()
  }

  [destructor](allocated) {
    // allocated.connection and allocated.cache are available
    allocated.connection.close()
    allocated.cache.clear()
  }
}
```

Note that `@allocated` can only be applied on accessors: get, set and auto-`accessor`s. (in case of modern decorator usage, the `set` accessor only)

## Context Manager Integration

### Using withDestroyable()

```typescript
import { withDestroyable } from 'mutts/destroyable'

function useDatabase() {
  const db = new DestroyableDB('localhost', 5432)
  const contextManager = withDestroyable({
    destroy: () => DestroyableDB.destroy(db)
  })

  try {
    const result = db.query('SELECT * FROM users')
    return result
  } finally {
    // Manual cleanup
    contextManager[Symbol.dispose]()
  }
}
```

### Using disposable()

```typescript
import { disposable } from 'mutts/destroyable'

function useDatabaseWithDisposable() {
  const db = new DestroyableDB('localhost', 5432)
  const disposableDb = disposable({
    destroy: () => DestroyableDB.destroy(db)
  })

  try {
    const result = db.query('SELECT * FROM users')
    return result
  } finally {
    // Automatic cleanup via Symbol.dispose
    disposableDb[Symbol.dispose]()
  }
}
```

### Future using Statement Support

When JavaScript's `using` statement becomes available, destroyable objects will work seamlessly:

```typescript
// This will work when `using` statement is available
using file = disposable(new FileHandler('example.txt'))
const content = file.read()
// Automatic cleanup at end of block
```

## API Reference

### Destroyable()

Creates a destroyable class with automatic resource management.

**Signatures:**
```typescript
// With base class and destructor object
Destroyable<T, Allocated>(base: T, destructorObj: Destructor<Allocated>)

// With destructor object only
Destroyable<Allocated>(destructorObj: Destructor<Allocated>)

// With base class only (requires [destructor] method)
Destroyable<T, Allocated>(base: T)

// Abstract base class
Destroyable<Allocated>()
```

### @allocated

Decorator that marks properties to be stored in the allocated object and passed to the destructor.

```typescript
@allocated
declare propertyName: Type
```

### withDestroyable()

Creates a context manager for manual disposal.

```typescript
withDestroyable<T extends { destroy(): boolean }>(destroyable: T): ContextManager<T>
```

### disposable()

Adds `Symbol.dispose` method to an object for automatic cleanup.

```typescript
disposable<T extends { destroy(): boolean }>(destroyable: T): T & { [Symbol.dispose](): void }
```

### callOnGC()

Registers a callback to be called when an object is garbage collected.

```typescript
callOnGC(cb: () => void): () => void
```

### Type Utilities

#### AllocatedProperties<T>

Extracts the allocated properties type from a destroyable instance.

```typescript
type AllocatedProperties<T> = T extends { [allocatedValues]: infer A } ? A : never
```

#### Allocated<T>

Generic type for defining allocated property structures.

```typescript
type Allocated<T extends Record<PropertyKey, any> = Record<PropertyKey, any>> = T
```

#### AllocatedKeys<T> and AllocatedFromKeys<T>

Extract properties with specific naming conventions.

```typescript
type AllocatedKeys<T> = {
  [K in keyof T]: K extends `allocated${string}` ? K : never
}[keyof T]

type AllocatedFromKeys<T> = Pick<T, AllocatedKeys<T>>
```

#### MarkAllocated<T>

Branded type for marking allocated properties at compile time.

```typescript
type MarkAllocated<T> = T & { readonly [allocatedBrand]: true }
```

#### AllocatedProperty<T>

Interface for properties marked as allocated.

```typescript
interface AllocatedProperty<T = any> {
  [allocatedBrand]: true
  value: T
}
```

#### Runtime Utilities

```typescript
function getAllocatedProperties<T extends object>(instance: T): PropertyKey[]
function isAllocatedProperty<T extends object>(instance: T, property: PropertyKey): boolean
```

## Error Handling

### DestructionError

Thrown when attempting to access a destroyed object:

```typescript
import { DestructionError } from 'mutts/destroyable'

try {
  destroyedObject.someProperty
} catch (error) {
  if (error instanceof DestructionError) {
    console.log('Object has been destroyed')
  }
}
```

## Type-Safe Allocated Properties

### Approach 1: Manual Type Mapping (Recommended)

Define explicit interfaces for your allocated properties:

```typescript
interface DatabaseAllocated {
  connection: DatabaseConnection
  pool: ConnectionPool[]
  cache: Map<string, any>
}

class DatabaseManager extends Destroyable() {
  @allocated
  declare connection: DatabaseConnection

  @allocated
  declare pool: ConnectionPool[]

  @allocated
  declare cache: Map<string, any>

  constructor() {
    super()
    this.connection = new DatabaseConnection()
    this.pool = []
    this.cache = new Map()
  }

  [destructor](allocated: DatabaseAllocated) {
    // Type-safe access with full IntelliSense
    allocated.connection.close()
    allocated.pool.forEach(pool => pool.destroy())
    allocated.cache.clear()
  }

  // Type-safe method to get allocated values
  getAllocatedValues(): DatabaseAllocated {
    return this[allocatedValues] as DatabaseAllocated
  }
}
```

### Approach 2: Generic Allocated Type

Use the generic `Allocated<T>` type for flexibility:

```typescript
interface FileAllocated extends Allocated {
  filePath: string
  fileHandle: any
  metadata: Record<string, any>
}

class FileHandler extends Destroyable() {
  @allocated
  declare filePath: string

  @allocated
  declare fileHandle: any

  @allocated
  declare metadata: Record<string, any>

  [destructor](allocated: FileAllocated) {
    // Type-safe cleanup
  }
}
```

### Approach 3: Naming Convention with AllocatedKeys

Use naming conventions for automatic type extraction:

```typescript
class ResourceManager extends Destroyable() {
  @allocated
  declare allocatedConnection: DatabaseConnection

  @allocated
  declare allocatedCache: Map<string, any>

  // Regular property (not allocated)
  regularProperty: string = 'not allocated'

  [destructor](allocated: any) {
    // Cleanup logic
  }
}

// Extract only properties starting with "allocated"
type AllocatedProps = AllocatedFromKeys<ResourceManager>
// Result: { allocatedConnection: DatabaseConnection; allocatedCache: Map<string, any> }
```

### Approach 4: Runtime Type Checking

Use runtime utilities to check allocated properties:

```typescript
class DynamicManager extends Destroyable() {
  @allocated
  declare resource1: any

  @allocated
  declare resource2: any

  regularProp: string = 'regular'

  checkProperties() {
    const allocatedProps = getAllocatedProperties(this)
    console.log('Allocated properties:', allocatedProps)
    // Output: ['resource1', 'resource2']

    console.log('Is resource1 allocated?', isAllocatedProperty(this, 'resource1')) // true
    console.log('Is regularProp allocated?', isAllocatedProperty(this, 'regularProp')) // false
  }

  [destructor](allocated: any) {
    // Cleanup logic
  }
}
```

### Approach 5: Branded Types

Use branded types for compile-time marking:

```typescript
class NetworkManager extends Destroyable() {
  @allocated
  declare socket: MarkAllocated<Socket>

  @allocated
  declare buffer: MarkAllocated<Buffer>

  constructor() {
    super()
    this.socket = { connected: true } as MarkAllocated<Socket>
    this.buffer = Buffer.alloc(1024) as MarkAllocated<Buffer>
  }

  [destructor](allocated: any) {
    // Type-safe cleanup
  }
}
```

## Advanced Patterns

### Resource Pools

```typescript
class ConnectionPool extends Destroyable() {
  @allocated
  declare connections: DatabaseConnection[]

  constructor(size: number) {
    super()
    this.connections = Array.from({ length: size }, () => 
      new DatabaseConnection('localhost', 5432)
    )
  }

  [destructor](allocated) {
    // Close all connections
    allocated.connections.forEach(conn => conn.close())
  }

  getConnection(): DatabaseConnection {
    return this.connections[Math.floor(Math.random() * this.connections.length)]
  }
}
```

### Lazy Resource Loading

```typescript
class LazyResource extends Destroyable() {
  @allocated
  declare _resource: any

  get resource() {
    if (!this._resource) {
      this._resource = this.loadResource()
    }
    return this._resource
  }

  private loadResource() {
    // Expensive resource loading
    return new ExpensiveResource()
  }

  [destructor](allocated) {
    if (allocated._resource) {
      allocated._resource.cleanup()
    }
  }
}
```

## Use Cases

- **Database Connections**: Automatic connection cleanup
- **File Handles**: Ensure files are properly closed
- **Network Resources**: Cleanup network connections and streams
- **Memory Management**: Automatic cleanup of large objects
- **Plugin Systems**: Cleanup when plugins are unloaded
- **Temporary Resources**: Automatic cleanup of temporary files or data
- **Event Listeners**: Remove event listeners when objects are destroyed
- **Timers and Intervals**: Clear timers and intervals automatically

## Performance Considerations

- **FinalizationRegistry**: Uses native JavaScript FinalizationRegistry for efficient cleanup
- **WeakMap Storage**: Internal storage uses WeakMaps to avoid memory leaks
- **Lazy Cleanup**: Resources are only cleaned up when objects are garbage collected or explicitly destroyed
- **Proxy Overhead**: Destroyed objects use Proxy for access protection (minimal overhead)

## Best Practices

1. **Always provide destructors**: Either via destructor object or `[destructor]` method
2. **Use @allocated for resources**: Mark properties that need cleanup with `@allocated`
3. **Prefer explicit destruction**: Use `destroy()` for immediate cleanup when possible
4. **Handle destruction errors**: Check for `DestructionError` when accessing objects
5. **Use context managers**: Use `withDestroyable()` or `disposable()` for automatic cleanup
6. **Test cleanup logic**: Ensure destructors are called and resources are properly cleaned up
