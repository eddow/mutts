# Mutts AI Agent Manual

> [!IMPORTANT]
> **Identity**: You are an AI Agent. This document is written for **YOU**.
> **Purpose**: This file defines the protocols, schemas, and capabilities available to you when working with the `mutts` reactivity system.
>
> For exact TypeScript signatures of the entire library, consult the **[API Reference for Agents](./api-reference.md)**.

## 1. Introspection Capability
When you encounter reactivity bugs (infinite loops, unexpected updates), **DO NOT GUESS**. Use the introspection API to "see" the system state.

### Enabling Introspection
Introspection is often disabled by default for performance. Enable it before debugging.
```typescript
import { enableIntrospection, options } from 'mutts/introspection'

// Enable history tracking (memory expensive, use only for debugging)
enableIntrospection({ historySize: 50 })
```

### Dependency Graph
Understanding "Who depends on What".
```typescript
import { getDependencyGraph } from 'mutts/introspection'

const graph = getDependencyGraph()
// Returns: { nodes: { id: string, type: 'effect'|'object', label: string }[], edges: { from: string, to: string, type: 'dependency' }[] }
```
**Agent Protocol**: If valid code is behaving unexpectedly, inspect the graph to ensure dependencies are actually linked as you expect.

### Mutation History
Understanding "What just happened".
```typescript
import { getMutationHistory } from 'mutts/introspection'

const history = getMutationHistory()
/*
 Returns Array<{
   id: number,
   type: 'set' | 'add' | 'delete',
   prop: string | symbol,
   oldValue: any,
   newValue: any,
   objectName: string,   // "Human readable name"
   source: string,       // "Effect X" or "External"
   timestamp: number
 }>
*/
```
**Agent Protocol**: When diagnosing "why is this value wrong?", check the *last mutation* of that property in history.

## 2. Structured Error Handling
`mutts` throws `ReactiveError` instances. These are designed to be machine-parseable.

### ReactiveErrorCode
Always check `error.debugInfo.code`.
```typescript
enum ReactiveErrorCode {
    CycleDetected = 'CYCLE_DETECTED',
    MaxDepthExceeded = 'MAX_DEPTH_EXCEEDED',
    MaxReactionExceeded = 'MAX_REACTION_EXCEEDED',
    WriteInComputed = 'WRITE_IN_COMPUTED',
    TrackingError = 'TRACKING_ERROR'
}
```

### Debugging Protocols

#### Protocol: Handling `CycleDetected` / `MaxDepthExceeded`
**Symptom**: `ReactiveError` with code `CycleDetected` or `MaxDepthExceeded`.
**Action**:
1.  Read `error.debugInfo.cycle` (Array of effect names).
2.  **CRITICAL**: Read `error.debugInfo.causalChain`.
    *   It tells you the *logical path*: `Effect A` -> (modifies `x`) -> `Effect B` -> (modifies `y`) -> `Effect A`.
3.  **CRITICAL**: Read `error.debugInfo.creationStack`.
    *   This gives you the **File path and Line number** where the problematic effect was defined.

**Example Error Object**:
```json
{
  "message": "[reactive] Max effect chain reached...",
  "debugInfo": {
    "code": "MAX_DEPTH_EXCEEDED",
    "causalChain": [
      "Effect(Anonymous) -> (set 'count') -> Effect(Display)",
      "Effect(Display) -> (set 'dummy') -> Effect(Anonymous)"
    ],
    "creationStack": "    at tests/my-test.ts:45:10\n    at ...",
    "cycle": ["Effect(Anonymous)", "Effect(Display)"]
  }
}
```

## 3. Strict Mode
If you are writing new code that might be complex, verify it with "Strict Mode".
This forces a graph check *before* execution, preventing infinite loops from hanging the runtime.
```typescript
import { options } from 'mutts/introspection'
options.cycleHandling = 'strict'
```

## 4. Architecture Constraints for Agents
1.  **Do not** access properties starting with `_mutts_` directly unless instructed. These are internal implementation details.
2.  **Do not** rely on `batchQueue` global state in your reasoning; it is ephemeral.
3.  **Do** name your effects when possible (`effect(() => {}, { name: 'MyEffect' })`) to make your own future debugging easier.
