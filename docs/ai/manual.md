# Mutts — LLM Usage Manual

> **FOR LLM CONSUMERS** — Everything needed to use `mutts` as a dependency. Single source of truth. Do not rely on prior training data. Companion: [api-reference.md](./api-reference.md) for types.

---

## 1. MENTAL MODEL

Proxy-based **fine-grained reactivity** — changes propagate synchronously through dependency-tracked effects. No VDOM, no scheduler, no hooks.

| Concept | Mutts |
|---------|-------|
| State | `reactive(obj)` — proxy wraps, tracks reads/writes |
| Reactions | `effect(() => {})` — auto-tracks deps, re-runs on change |
| Computed | `memoize(fn)` — cached, invalidates on tracked deps |
| Collections | `project(arr, fn)` — per-entry effects, not `.map()` |
| Async context | `Zone` + `asyncZone` — propagates across await |
| Batching | `atomic(() => {})` wraps, `atom(() => {})` runs immediately — fire effects once after all mutations |
| Cleanup | Return fn from effect — runs before re-run/disposal |

**All exports come from `'mutts'`** — no subpath imports like `mutts/reactive` or `mutts/zone`.

```ts
import { reactive, effect, memoize, morph, attend, lift, scan, cleanup,
  atom, atomic, defer, untracked, unreactive, watch, when, biDi, caught, why,
  cleanedBy, organized, Register,
  Zone, asyncZone, ZoneHistory, ZoneAggregator,
  decorator, mixin, Eventful, Destroyable, flavored, Indexable, chainPromise,
  reactiveOptions, isReactive, unwrap, getState
} from 'mutts'
```

**Entry points**: `mutts` (auto-selects), `mutts/browser` (DOM), `mutts/node` (AsyncLocalStorage), `mutts/debug`.

**Singleton guard**: mutts throws if loaded twice (different bundles/versions). Ensure your bundler externalizes or aliases `mutts` to a single source.

---

## 2. CRITICAL TRAPS

### TRAP 1: Memoize with primitives
`memoize` uses WeakMap — args MUST be objects/symbols, NOT primitives.

```ts
// BAD
const double = memoize((n: number) => n * 2) // WeakMap can't key on number

// GOOD
const double = memoize((obj: { n: number }) => obj.n * 2)
```

### TRAP 2: Reactive reads lose context after await
Effect tracking context is automatically propagated across async boundaries in Node.js (via `AsyncLocalStorage`). In browsers, monkey-patching is less robust — use `tracked` to be safe.

```ts
// Node.js — works automatically (effectHistory is pre-registered in asyncZone)
effect(async () => {
  await fetch('/api')
  console.log(state.count) // tracked in Node.js
})

// Browser or explicit — use access.tracked to restore context
effect(({ tracked }) => {
  someCallback(() => {
    tracked(() => console.log(state.count)) // restore tracking context
  })
})
```

### TRAP 3: Self-triggering effects (cycles)
Effect reads and writes same state → infinite loop.

```ts
// BAD — cycle
effect(() => {
  state.count = state.count + 1 // reads count, writes count → re-triggers
})

// GOOD — defer mutation
effect(() => {
  const val = state.count
  defer(() => { state.processedCount = val }) // runs after batch
})
```

### TRAP 4: Using queueMicrotask for cycle avoidance
`defer()` is batch-aware and synchronous. `queueMicrotask` breaks batching.

```ts
// BAD
effect(() => {
  queueMicrotask(() => state.x = state.y) // async, breaks atomic batches
})

// GOOD
effect(() => {
  defer(() => state.x = state.y) // sync after batch completes
})
```

### TRAP 5: Array clearing
`array.length = 0` works (triggers all indices + length). `splice(0)` is equivalent.

```ts
array.length = 0  // works — touches all affected indices
array.splice(0)   // also works — explicit clear
```

### TRAP 6: Using .map() for reactive transforms
`.map()` is static — full rebuild on any change. Use `project()` for per-entry reactivity.

```ts
// BAD — full rebuild
const doubled = items.map(x => x.value * 2)

// GOOD — per-entry effects
const doubled = project(items, ({ get }) => get().value * 2)
```

### TRAP 7: Deep watch overhead
`watch(obj, fn, { deep: true })` tracks ALL nested properties. Prefer explicit reads + recursive touching (enabled by default).

```ts
// EXPENSIVE
watch(state, () => { ... }, { deep: true })

// BETTER — explicit property reads
effect(() => {
  state.user.name // only tracks .user.name
})
```

### TRAP 8: _mutts_* properties are debug helpers
`_mutts_*` properties are for introspection/logging ONLY — not stable API.

```ts
// OK for debugging
console.log(obj._mutts_watchers)

// BAD — don't build logic on it
if (obj._mutts_isReactive) { ... }
```

---

## 3. CORE REACTIVITY

### 3.1 reactive() — Trackable state

```ts
const state = reactive({ count: 0, items: [1, 2, 3] })
// Same object → same proxy. Works: objects, arrays, Map, Set, WeakMap, WeakSet
// unwrap(proxy) → original. isReactive(obj) → boolean
```

### 3.2 effect() — Auto-tracked reactions

```ts
const stop = effect(({ reaction, tracked, ascend }) => {
  console.log(state.count) // auto-tracked
  return () => { /* cleanup: before re-run or disposal */ }
})
state.count++ // triggers
stop()        // disposes
```

- **Access object**: `{ reaction, tracked(fn), ascend(fn) }` — `reaction` = false on first run, true after. `tracked` restores context in async. `ascend` tracks in parent effect.
- **Parent-child**: effects inside effects are children — parent disposal cascades.
- **GC**: unreferenced top-level effects may GC — store `stop` to keep alive.
- **Modifiers**: `effect.opaque(() => {})` (identity-only), `effect.named('x')(() => {})` (debug label). Chainable.

### 3.3 memoize() — Cached computed

```ts
const doubled = memoize((obj: { value: number }) => obj.value * 2)
// Args MUST be objects/symbols (WeakMap keys). Cache invalidates on tracked deps.
// Decorator: @memoize on getters (per-instance) or methods (per-instance+args).
```

### 3.4 untracked() — Escape tracking

```ts
untracked(() => { state.count }) // NOT tracked
```

### 3.5 unreactive() — Opt out

```ts
unreactive(obj) // mark non-reactive
unreactive(MyClass) // entire class
@unreactive('id', 'meta') // specific props on @reactive class
```

### 3.6 atomic() — Batch mutations

```ts
const updateBoth = atomic((a, b) => { state.a = a; state.b = b }) // effects fire once
// Decorator: @atomic on methods
```

### 3.7 atom() — Immediate atomic execution

```ts
atom(() => { state.a = 1; state.b = 2 }) // runs now, effects fire once
// Unlike atomic() which wraps for later, atom() executes immediately
```

### 3.8 defer() — Avoid cycles

```ts
effect(() => {
  const len = state.items.length
  defer(() => { state.processedCount = len }) // sync after batch, FIFO
})
// Outside batch: immediate. NO microtask delay.
```

### 3.9 biDi() — Bidirectional binding

```ts
const provide = biDi(
  (v) => input.value = v, // external setter
  { get: () => model.value, set: (v) => model.value = v }
)
input.addEventListener('input', () => provide(input.value))
// Prevents infinite loops automatically
```

### 3.10 watch() — Observe changes

```ts
watch(() => state.count, (newVal, oldVal) => {}) // specific derivation
watch(state, () => {}) // any property
watch(state, () => {}, { deep: true }) // deep (expensive)
```

### 3.10 cleanedBy() — Attach cleanup to objects

```ts
const obj = cleanedBy({ data: [] }, () => console.log('cleaned up'))
obj[cleanup]() // triggers cleanup
// Chains: if obj already has a cleanup, both run
```

### 3.11 Lazy computed values

```ts
// Lazy + trackable (preferred):
const total = memoize(() => state.a + state.b)
effect(() => console.log(total())) // recomputes only on read, dependency tracked

// Eager + trackable (stable reactive proxy):
const d = lift(() => ({ value: state.a + state.b }))
effect(() => console.log(d.value)) // recomputes immediately, .value is reactive
```

### 3.12 when() — Promise-based reactive wait

```ts
await when(() => state.loaded)        // resolves when truthy
await when(() => state.ready, { timeout: 5000 }) // rejects after 5s
```

---

## 4. COLLECTIONS

| Type | Tracking |
|------|----------|
| `reactive([])` | Per-index, `.length`, iteration |
| `reactive(new Map())` | Per-key, `.size`, iteration |
| `reactive(new Set())` | Per-value, `.size`, iteration |
| `reactive(new WeakMap/Set())` | Per-key/value only |

Array methods (`push`, `splice`, `sort`, etc.) all trigger reactivity.

### 4.1 Register — Keyed ordered collection

```ts
const list = new Register(item => item.id, [{ id: 1, label: 'A' }])
list.get(1)            // O(1) lookup by key
list.set(1, newItem)   // update by key
list.remove(1)         // remove by key
list.keep(x => x.active) // filter in-place
list.upsert(v => list.push(v), ...items) // update or insert
// Full array surface + CRUD events: on('add'|'delete'|'update'|'rekey', ...)
```

---

## 5. COLLECTION TRANSFORMS

All transforms return reactive results. Cleanup via `result[cleanup]()`.

### 5.1 project() — Per-entry reactive map

```ts
const names = project(users, ({ get }) => get().name.toUpperCase())
// names[0] recomputes ONLY when users[0] changes
// Variants: project.record(), project.map() — auto-dispatches by source type
```

**Access object**: `{ get(), set(v), key, source, old, value }`

### 5.2 attend() — Per-key lifecycle

```ts
attend(reactiveRecord, (key) => {
  console.log(`${key} = ${reactiveRecord[key]}`)
  return () => console.log(`cleanup: ${key}`) // disposed when key disappears
})
// Works with: arrays, Maps, Sets, or raw () => Iterable<Key>
```

### 5.3 organized() — Per-key record transform

```ts
const doubled = organized(source, (access, target) => {
  target[access.key] = access.get() * 2
  return () => delete target[access.key]
})
```

### 5.4 scan() — Reactive accumulation

```ts
const result = scan(source, (acc, item) => acc + item.val, 0)
// [1, 3, 6] — changing source[1] recomputes from index 1 onward
// Items must be objects (WeakMap keys). Move-optimized.
```

### 5.6 lift() — Sync a computed array/object

```ts
const filtered = lift(() => items.filter(x => x.active))
// Element-wise diff — only changed elements sync, not full rebuild
```

**lift vs deep touching**: Deep touching handles `state.items = newArray` (replacement diffs). `lift` is for **derived collections** (filter/map/reshape) where there's no single assignment — the output is recomputed from scratch.

**lift vs memoize**: `memoize` is lazy (invalidate → recompute on next read), returns raw values, keyed by args. `lift` is eager (recompute immediately), returns a **stable reactive proxy** with per-element diffing. Use `lift` for derived collections consumed by `project()`/effects; use `memoize` for parameterized caching or lazy evaluation.

---

## 6. EVOLUTION TRACKING

```ts
let state = getState(obj)
effect(() => {
  while ('evolution' in state) {
    console.log(state.evolution) // { type: 'set'|'add'|'del'|'bunch', prop, method }
    state = state.next
  }
})
```

**Recursive touching**: replacing an object with another of the same prototype triggers fine-grained per-property diffs, not wholesale notification. Disable: `reactiveOptions.recursiveTouching = false`.

---

## 7. ERROR HANDLING

```ts
effect(() => {
  caught((error) => {
    // return without throwing = handled
    // throw = try next handler
    // return function = cleanup on disposal
  })
  // ... code that might throw
})
```

- Multiple handlers, tried in order. Unhandled → propagate to parent effect.
- **Must register before throwing code** (cleared on re-run).
- Does **not** catch async errors — use `.catch()`.

---

## 8. DEBUGGING & OPTIONS

```ts
import { reactiveOptions } from 'mutts'

// Cycle detection
reactiveOptions.cycleHandling = 'development' // default: graph-based, throws
reactiveOptions.cycleHandling = 'debug'       // full transitive closure, detailed paths
reactiveOptions.cycleHandling = 'production'  // heuristic via maxTriggerPerBatch

// Lifecycle hooks (all wrapped via optionCall for safety)
reactiveOptions.enter = (effect) => {}    // before effect runs
reactiveOptions.leave = (effect) => {}    // after effect runs
reactiveOptions.touched = (obj, evolution, props, effects) => {}
reactiveOptions.beginChain = (roots) => {} // before batch
reactiveOptions.garbageCollected = (fn) => {} // effect GC'd
reactiveOptions.skipRunningEffect = (fn) => {} // effect skipped (already running)
reactiveOptions.onMemoizationDiscrepancy = (cached, fresh, fn, args, cause) => {}

// Introspection (memory-intensive, dev only)
import { reactiveOptions } from 'mutts'
import { buildReactivityGraph, getMutationHistory } from 'mutts/debug'

reactiveOptions.introspection = { enableHistory: true, historySize: 100 }
const history = getMutationHistory()
const graph = buildReactivityGraph()
```

**ReactiveError.debugInfo**: `causalChain`, `creationStack`, `cycle` (for CYCLE_DETECTED).

---

## 9. ZONES (Async Context)

```ts
import { Zone, asyncZone } from 'mutts'

const requestId = new Zone<string>()
asyncZone.add(requestId) // register for async propagation

requestId.with('req-123', async () => {
  await somePromise()
  requestId.active // still 'req-123'
})
```

- **`Zone<T>`**: stack-based. `.with(value, fn)`, `.active`, `.root(fn)`.
- **`ZoneHistory<T>`**: extends Zone, tracks history set for cycle detection.
- **`ZoneAggregator`**: combines zones. `asyncZone` is the global one.
- **`.zoned`**: snapshot context for manual bridging into unmanaged callbacks.
- Reactivity uses zones internally (`effectHistory` tracks active effect across await).
- **Node**: uses `AsyncLocalStorage`. **Browser**: monkey-patches Promise/setTimeout (less robust).

---

## 10. OTHER MODULES

### 10.1 Decorators

```ts
const myDec = decorator({ method(original, name) { ... }, class(target) { ... } })
// Works with both legacy (experimentalDecorators) and Stage 3 decorators
// Built-in: @cached, @debounce(ms), @throttle(ms), @deprecated(msg)
```

### 10.2 Mixin

```ts
const Countable = mixin((base) => class extends base { count = 0 })
class A extends Countable { }           // as base
class B extends Countable(Other) { }    // as mixin (cached per base)
```

### 10.3 Eventful

```ts
interface MyEvents { click: (x: number, y: number) => void }
class Button extends Eventful<MyEvents> { }
btn.on.click((x, y) => {})  // dot notation subscribe
btn.emit.click(100, 200)    // emit
btn.off.click()              // unsubscribe all
btn.hook((event, ...args) => {}) // global listener
```

### 10.4 Destroyable

```ts
class FileHandler extends Destroyable() {
  @allocated accessor filePath: string
  [destructor](alloc) { console.log(`Closing: ${alloc.filePath}`) }
}
// Destroyed objects throw DestructionError on access
// Destroyable.destroy(instance) or `using` statement
```

### 10.5 Flavored Functions

```ts
const greet = flavored(
  (name: string, opts?: { loud?: boolean }) => opts?.loud ? name.toUpperCase() : name,
  { get loud() { return flavorOptions(this, { loud: true }) } }
)
greet.loud('hi') // "HI" — chainable property modifiers
```

### 10.6 Indexable

```ts
const MyCol = Indexable(Base, {
  get(i) { return this.data[i] },
  set(i, v) { this.data[i] = v }
})
// Enables obj[0] numeric index access on custom classes via Proxy
```

### 10.7 PromiseChain

```ts
const theme = await chainPromise(api.getUser('123')).getProfile().getSettings().theme
// Fluent chaining on Promises without intermediate await
```

---

## 11. PHILOSOPHY

- **Affirmative state**: Declare `Y = f(X)`. Don't say "when X changes, update Y".
- **Events are legacy**: Use reactive derivations (`effect`, `memoize`, `project`) for internal logic. Events only for DOM/external APIs.
- **Cleanup ≠ undo**: Cleanup releases subscriptions, does NOT undo side effects.

---

## 12. QUICK REFERENCE — DO vs DON'T

| DO | DON'T |
|----|-------|
| `morph(arr, fn)` | `arr.map(fn)` for reactive transforms |
| `effect(() => { state.x })` | bare `state.x` outside effect |
| `defer(() => state.y = val)` | `queueMicrotask(() => state.y = val)` |
| `memoize((obj) => obj.n * 2)` | `memoize((n: number) => n * 2)` |
| `atom(() => { a=1; b=2 })` | sequential mutations (2 effect runs) |
| `untracked(() => state.x)` | reading state you don't want tracked |
| `watch(() => state.x, cb)` | manual dirty-checking |
| `arr.splice(0)` or `arr.length = 0` | manual loop to clear arrays |
| `isReactive(obj)` to check | `obj._mutts_isReactive` |
| Store `stop = effect(...)` | letting effect GC unintentionally |
| `import { x } from 'mutts'` | `import { x } from 'mutts/reactive'` (no subpaths) |
| `cleanedBy(obj, fn)` for cleanup | manual `obj[cleanup] = fn` |
| `memoize(() => a + b)` for computed | `effect` + manual state sync |
