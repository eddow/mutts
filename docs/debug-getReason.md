# `__MUTTS_DEBUG__.getReason()`

## Overview

The `getReason()` function allows you to access the reason why the current effect is being executed from within the effect itself. This is useful for debugging and understanding what triggered an effect to re-run.

## Usage

```typescript
import * as mutts from 'mutts'

// DevTools are automatically enabled in development mode
const debug = (globalThis as any).__MUTTS_DEBUG__

const state = mutts.reactive({ count: 0 })

mutts.effect(() => {
  const reason = debug.getReason()
  
  if (!reason) {
    console.log('First run - no reason')
  } else if (reason.type === 'propChange') {
    console.log(`Re-run due to ${reason.triggers.length} property changes:`)
    for (const trigger of reason.triggers) {
      console.log(`  - ${trigger.evolution.type} on ${trigger.evolution.prop}`)
    }
  }
  
  console.log('Count:', state.count)
})

// Trigger changes
state.count = 1  // Shows propChange reason
```

## Return Value

Returns `undefined` or a `CleanupReason` object:

### `undefined`
- Returned on the first run of an effect
- No cleanup/reason is available for initial execution

### `CleanupReason` types

#### `{ type: 'propChange', triggers: PropTrigger[] }`
The effect was re-run because one or more reactive properties changed.

- `triggers`: Array of property changes that triggered this re-run
  - `obj`: The reactive object that changed
  - `evolution`: Details about what changed
    - `type`: `'set' | 'del' | 'add' | 'invalidate' | 'bunch'`
    - `prop`: The property that changed (or method name for 'bunch')
  - `dependency`: Stack trace from when the dependency was created (if lineage tracking enabled)
  - `touch`: Stack trace from when the property was modified (if lineage tracking enabled)

#### `{ type: 'stopped', detail?: string }`
The effect was explicitly stopped via its cleanup function.

#### `{ type: 'gc' }`
The effect was cleaned up by garbage collection.

#### `{ type: 'error', error: unknown }`
The effect is being re-run due to an error in a previous run.

#### `{ type: 'lineage', parent: CleanupReason }`
A parent effect was cleaned up, causing this child effect to also be cleaned up.

#### `{ type: 'invalidate', cause: CleanupReason }`
The effect was invalidated for some other reason.

#### `{ type: 'multiple', reasons: CleanupReason[] }`
Multiple reasons combined (rare, usually from complex cleanup scenarios).

## Examples

### Debugging Multiple Dependencies

```typescript
const state = mutts.reactive({ 
  user: { name: 'John' },
  posts: [{ title: 'Hello' }]
})

mutts.effect(() => {
  const reason = debug.getReason()
  
  if (reason?.type === 'propChange') {
    console.log(`Effect triggered by ${reason.triggers.length} changes:`)
    reason.triggers.forEach(trigger => {
      if (trigger.evolution.type === 'set') {
        console.log(`  Property '${trigger.evolution.prop}' changed`)
      } else if (trigger.evolution.type === 'add') {
        console.log(`  Property '${trigger.evolution.prop}' added`)
      }
    })
  }
  
  console.log(`User: ${state.user.name}, Posts: ${state.posts.length}`)
})

// Multiple simultaneous changes
mutts.untracked(() => {
  state.user.name = 'Jane'
  state.posts.push({ title: 'New Post' })
})
```

### Conditional Logic Based on Reason

```typescript
mutts.effect(() => {
  const reason = debug.getReason()
  
  if (!reason) {
    // First run - expensive initialization
    console.log('Initializing...')
    // setup expensive resources
  } else if (reason.type === 'propChange') {
    // Re-run - can optimize based on what changed
    const userChanged = reason.triggers.some(t => 
      t.evolution.prop === 'name'
    )
    if (userChanged) {
      console.log('User name changed - updating UI')
    }
  }
  
  console.log(`User: ${state.user.name}`)
})
```

## Notes

- The reason is only available during the effect's execution
- After the effect completes, the reason is cleared
- The reason reflects why the *previous* run was cleaned up, not why the current run started
- In TypeScript, you can type the return value as:
  ```typescript
  type CleanupReason = import('mutts').CleanupReason
  const reason: CleanupReason | undefined = debug.getReason()
  ```

## Configuration

Reason gathering is controlled by `options.introspection.gatherReasons`:

```typescript
import { reactiveOptions } from 'mutts'

// Disable reason gathering for production (performance)
reactiveOptions.introspection = null

// Or customize what lineage information is captured
reactiveOptions.introspection = {
  gatherReasons: { lineages: 'touch' }, // 'none' | 'touch' | 'dependency' | 'both'
  logErrors: true,
  enableHistory: true,
  historySize: 50,
}
```
