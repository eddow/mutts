# Events

A TypeScript library that provides a type-safe event system built around the `Eventful` class.

## Overview

The `events` module provides a clean, type-safe API for event handling with full TypeScript support. It allows you to define event types, register listeners, emit events, and manage event subscriptions with automatic cleanup.

## API Reference

### `Eventful<Events>`

A base class that provides event handling capabilities with type safety.

**Generic Parameters:**
- `Events`: A record type defining event names and their corresponding callback signatures

**Example:**
```typescript
interface MyEvents {
  userLogin: (userId: string, timestamp: Date) => void
  dataUpdate: (data: any[]) => void
  error: (error: Error) => void
}

class MyClass extends Eventful<MyEvents> {
  // Your class implementation
}
```

### Methods

#### `on(events: Partial<Events>): void`
#### `on<EventType extends keyof Events>(event: EventType, cb: Events[EventType]): () => void`
#### `on.eventName(cb: Events['eventName']): () => void`

Registers event listeners. Can be called with either a single event and callback, an object containing multiple events, or using dot notation.

**Parameters:**
- `event`: The event name (when using single event overload)
- `cb`: The callback function to execute when the event is emitted
- `events`: An object containing event names as keys and callbacks as values (when using bulk overload)

**Returns:** An unsubscribe function (single event overload) or void (bulk overload)

**Example:**
```typescript
// Single event
const unsubscribe = myObject.on('userLogin', (userId, timestamp) => {
  console.log(`User ${userId} logged in at ${timestamp}`)
})

// Dot notation (equivalent to above)
const unsubscribe = myObject.on.userLogin((userId, timestamp) => {
  console.log(`User ${userId} logged in at ${timestamp}`)
})

// Multiple events
myObject.on({
  userLogin: (userId, timestamp) => console.log('Login:', userId),
  dataUpdate: (data) => console.log('Data updated:', data.length),
  error(error) { console.error('Error:', error.message) }
})
```

#### `off(events: Partial<Events>): void`
#### `off<EventType extends keyof Events>(event: EventType, cb?: Events[EventType]): void`
#### `off.eventName(cb?: Events['eventName']): void`

Removes event listeners. Can be called with either a single event (and optional callback), an object containing multiple events, or using dot notation.

**Parameters:**
- `event`: The event name (when using single event overload)
- `cb`: Optional callback function to remove (if not provided, removes all listeners for the event)
- `events`: An object containing event names as keys and callbacks as values (when using bulk overload)

**Example:**
```typescript
// Remove specific callback
myObject.off('userLogin', myCallback)

// Remove specific callback using dot notation
myObject.off.userLogin(myCallback)

// Remove all listeners for an event
myObject.off('userLogin')

// Remove all listeners for an event using dot notation
myObject.off.userLogin()

// Remove multiple events
myObject.off({
  userLogin: myCallback,
  dataUpdate: myDataCallback
})
```

#### `emit<EventType extends keyof Events>(event: EventType, ...args: Parameters<Events[EventType]>): void`
#### `emit.eventName(...args: Parameters<Events['eventName']>): void`

Emits an event, calling all registered listeners and global hooks.

**Parameters:**
- `event`: The event name to emit
- `...args`: Arguments to pass to the event listeners

**Example:**
```typescript
myObject.emit('userLogin', 'user123', new Date())
myObject.emit.userLogin('user123', new Date())  // Dot notation

myObject.emit('dataUpdate', [1, 2, 3])
myObject.emit.dataUpdate([1, 2, 3])  // Dot notation

myObject.emit('error', new Error('Something went wrong'))
myObject.emit.error(new Error('Something went wrong'))  // Dot notation
```

#### `hook(cb: <EventType extends keyof Events>(event: EventType, ...args: Parameters<Events[EventType]>) => void): () => void`

Registers a global hook that receives all events emitted by this instance.

**Parameters:**
- `cb`: A callback function that receives all events and their arguments

**Returns:** An unsubscribe function

**Example:**
```typescript
const unsubscribe = myObject.hook((event, ...args) => {
  console.log(`Event ${String(event)} emitted with args:`, args)
})
```

## Dot Notation Syntax

For convenience, `on`, `off`, and `emit` all support a dot notation syntax that provides a cleaner alternative to the string-based API.

| String Notation | Dot Notation |
|----------------|--------------|
| `obj.on('event', cb)` | `obj.on.event(cb)` |
| `obj.off('event', cb)` | `obj.off.event(cb)` |
| `obj.off('event')` | `obj.off.event()` |
| `obj.emit('event', args)` | `obj.emit.event(args)` |

Both forms are functionally equivalent. The dot notation provides:

- **Cleaner syntax**: No quotes needed around event names
- **Better IDE support**: Autocomplete for event names
- **Type safety**: Full TypeScript inference for event arguments

**Example:**

```typescript
class Button extends Eventful<{ click: (x: number, y: number) => void; hover: () => void }> {}

const button = new Button()

// Register listener using dot notation
button.on.click((x, y) => console.log(`Clicked at ${x}, ${y}`))

// Emit using dot notation
button.emit.click(100, 200)

// Remove listener using dot notation
button.off.click(myCallback)
// Or remove all click listeners
button.off.click()
```

## Usage Examples

### Basic Event Handling

```typescript
import { Eventful } from 'mutts/eventful'

interface AppEvents {
  ready: () => void
  dataLoaded: (data: any[]) => void
  error: (error: Error) => void
}

class App extends Eventful<AppEvents> {
  async initialize() {
    try {
      // Do initialization work
      this.emit('ready')
    } catch (error) {
      this.emit('error', error as Error)
    }
  }
  
  async loadData() {
    try {
      const data = await fetchData()
      this.emit('dataLoaded', data)
    } catch (error) {
      this.emit('error', error as Error)
    }
  }
}

// Usage
const app = new App()

app.on('ready', () => console.log('App is ready!'))
app.on('dataLoaded', (data) => console.log('Data loaded:', data.length))
app.on('error', (error) => console.error('App error:', error.message))

await app.initialize()
await app.loadData()
```

### Component Communication

```typescript
interface ComponentEvents {
  stateChange: (newState: any) => void
  userAction: (action: string, payload: any) => void
}

class Component extends Eventful<ComponentEvents> {
  private state: any = {}
  
  setState(newState: any) {
    this.state = { ...this.state, ...newState }
    this.emit('stateChange', this.state)
  }
  
  handleUserAction(action: string, payload: any) {
    this.emit('userAction', action, payload)
  }
}

// Parent component listening to child events
const child = new Component()
child.on('stateChange', (newState) => {
  console.log('Child state changed:', newState)
})
child.on('userAction', (action, payload) => {
  console.log('User performed action:', action, payload)
})
```

### Global Event Logging

```typescript
class Service extends Eventful<ServiceEvents> {
  // ... service implementation
}

const service = new Service()

// Log all events for debugging
const unsubscribe = service.hook((event, ...args) => {
  console.log(`[${new Date().toISOString()}] Service event: ${String(event)}`, args)
})

// Later, stop logging
unsubscribe()
```

## Key Features

- **Type Safety**: Full TypeScript support with compile-time event type checking
- **Multiple Listeners**: Support for multiple listeners per event type
- **Global Hooks**: Ability to listen to all events with a single hook
- **Automatic Cleanup**: Unsubscribe functions for easy memory management
- **Bulk Operations**: Register or remove multiple event listeners at once
- **Flexible API**: Support for both single events and bulk event operations

## Use Cases

- **Component Communication**: Enable components to communicate through events
- **State Management**: Notify subscribers of state changes
- **Plugin Systems**: Allow plugins to hook into application events
- **Observer Pattern**: Implement the observer pattern with type safety
- **Debugging**: Global event logging and monitoring
- **Decoupled Architecture**: Create loosely coupled systems through event communication
