# Effect Error Handling

The `caught` function allows you to catch and handle errors within reactive effects.

## Basic Usage

Register an error handler inside an effect using `caught`:

```typescript
import { effect, caught, reactive } from 'mutts'

const state = reactive({ value: 0 })

effect(() => {
  caught((error) => {
    console.error('Effect failed:', error)
  })

  // Your effect logic that might throw
  if (state.value < 0) throw new Error('Negative value not allowed')
})
```

## Multiple Handlers

You can register multiple handlers. They are tried in order until one succeeds:

```typescript
effect(() => {
  // First handler - try to recover
  caught((error) => {
    if (error.message === 'Retryable') {
      retryOperation()
      return  // Success - stops here
    }
    throw error  // Re-throw to try next handler
  })

  // Second handler - log and continue
  caught((error) => {
    console.log('Operation failed:', error)
  })
})
```

## Parent-Child Error Propagation

Errors in child effects propagate to parent effects:

```typescript
effect(() => {
  // Parent catches child's error
  caught((error) => {
    console.log('Child failed:', error.message)
  })

  effect(() => {
    // This error propagates to parent, even if a reactive re-evaluation
    throw new Error('Child error')
  })
})
```

If no handler catches the error, it propagates up the effect chain until caught or thrown at the root.

## Cleanup from Handler

Handlers can return cleanup functions:

```typescript
effect(() => {
  caught((error) => {
    console.log('Handling error:', error)
    
    return () => {
      // Cleanup when effect is destroyed
      cleanupResources()
    }
  })
})
```

## API

### `caught(handler)`

Registers an error handler for the current effect.

**Parameters:**
- `handler: (error: any) => (() => void) | undefined | void` - Function called when an error occurs in the effect

**Returns:** Nothing

**Throws:** Error if called outside of an effect

**Handler behavior:**
- Returns without throwing → error is considered handled
- Throws → next handler is tried
- Returns a function → used as cleanup when effect stops

## Error Propagation Flow

```
Effect throws
    ↓
Try handlers in order
    ↓
Handler succeeds → effect continues
    ↓
All handlers fail → propagate to parent
    ↓
Parent's handlers try
    ↓
...continue until caught or root reached
```

## Notes

- Handlers must be registered **before** the code that might throw
- Handlers are cleared on each effect re-run (re-register if needed)
- Errors in async effects (Promises) are not caught by `caught` - use `.catch()` on the Promise
