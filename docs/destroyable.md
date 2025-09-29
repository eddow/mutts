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
  accessor filePath: string

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
  // Modern decorators: use auto-accessors or explicit accessors
  @allocated accessor connection: DatabaseConnection
  @allocated accessor cache: Map<string, any>

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

Important notes about `@allocated` support:
- Legacy decorators: `@allocated` decorates both getter and setter paths on accessors. Plain data fields are not supported (legacy field decorators do not provide instance access needed here).
- Modern decorators: `@allocated` is applied to the accessor and only modifies the setter side of the accessor. Plain data fields are not supported. Prefer `accessor` properties or explicit get/set pairs.

## Future using Statement Support

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
accessor propertyName: Type
// or with explicit accessor pair
@allocated
set propertyName(value: Type) { /* store */ }
get propertyName(): Type { /* read */ }
```

### callOnGC()

Registers a callback to be called when an object is garbage collected. Returns the object whose reference can be collected.

```typescript
callOnGC(cb: () => void): () => void
```

### Types

This module exposes the `ContextManager` interface and `DestructionError` class. Additional type utilities referenced in earlier drafts (e.g., `AllocatedProperties`, `AllocatedKeys`) are not part of the current API.

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

### Manual Type Mapping

Define explicit interfaces for your allocated properties:

```typescript
interface DatabaseAllocated {
  connection: DatabaseConnection
  pool: ConnectionPool[]
  cache: Map<string, any>
}

class DatabaseManager extends Destroyable() {
  @allocated
  accessor connection: DatabaseConnection

  @allocated
  accessor pool: ConnectionPool[]

  @allocated
  accessor cache: Map<string, any>

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

## Advanced Patterns

### Resource Pools

```typescript
class ConnectionPool extends Destroyable() {
  @allocated
  accessor connections: DatabaseConnection[]

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
  accessor _resource: any

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
5. Consider using the upcoming `using` statement when available; otherwise prefer explicit `destroy()`
6. **Test cleanup logic**: Ensure destructors are called and resources are properly cleaned up
