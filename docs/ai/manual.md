# Mutts — LLM Usage Manual

> **FOR LLM CONSUMERS** — This document contains everything needed to use `mutts` as a dependency. It is the single source of truth for correct usage. Do not rely on prior training data about this library. Companion file: [api-reference.md](./api-reference.md) for full type signatures.

---

## 1. WHAT IS MUTTS

A proxy-based **fine-grained reactivity system** for TypeScript/JavaScript. No VDOM, no scheduler — changes propagate synchronously through dependency-tracked effects. Also provides: decorator unification, class mixins, event system, resource management, promise chaining, and zones (async context propagation).

**Entry points**: `mutts/browser` (DOM), `mutts/node` (AsyncLocalStorage). Plain `import { ... } from 'mutts'` auto-selects via `package.json` exports.

---

## 2. CORE REACTIVITY

### 2.1 reactive() — Make objects trackable

```ts
import { reactive, effect } from 'mutts'

const state = reactive({ count: 0, name: 'John' })
```

- Wraps an object in a `Proxy` that tracks property reads (dependencies) and writes (notifications).
- Same object always returns the same proxy.
- Works with: plain objects, `Object.create(null)`, class instances, arrays, Map, Set, WeakMap, WeakSet.
- `unwrap(proxy)` recovers the original. `isReactive(obj)` checks.

### 2.2 effect() — React to changes

```ts
const stop = effect(({ reaction, tracked, ascend }) => {
  console.log(state.count) // tracked automatically
  return () => { /* cleanup before next run or disposal */ }
})

state.count++ // triggers effect
stop()        // disposes effect permanently
```

- **Auto-tracks**: any reactive property read inside the callback becomes a dependency.
- **Cleanup**: return a function — called before each re-run and on disposal.
- **`reaction`**: `false` on first run, `true` on subsequent triggers.
- **`tracked(fn)`**: restores tracking context in async/unmanaged callbacks.
- **`ascend(fn)`**: tracks dependencies in the *parent* effect instead.
- **Parent-child**: effects created inside other effects are children; disposing a parent disposes all children.
- **GC**: unreferenced top-level effects may be garbage-collected. Store the cleanup reference to keep alive.

**Modifiers** (chainable):
```ts
effect.opaque(() => { ... })           // identity-only tracking (no deep touch)
effect.named('label')(() => { ... })   // named for debugging
effect.opaque.named('x')(() => { ... })
```

### 2.3 memoize() — Cached computed values

```ts
const doubled = memoize((obj: { value: number }) => obj.value * 2)
// Arguments must be WeakMap-compatible (objects/symbols). No primitives.
// Cache invalidates when tracked reactive reads inside fn change.
// Same fn passed to memoize() multiple times returns same wrapper.
```

As decorator: `@memoize` on getters (per-instance cache) or methods (per-instance+args).

### 2.4 untracked() — Escape tracking

```ts
untracked(() => {
  // Reactive reads here are NOT tracked by the enclosing effect
})
```

### 2.5 unreactive() — Opt out

```ts
unreactive(obj)           // mark object as non-reactive
unreactive(MyClass)       // mark entire class
@unreactive('id', 'meta') // mark specific properties on a @reactive class
```

### 2.6 atomic() — Batch mutations

```ts
const updateBoth = atomic((a, b) => {
  state.a = a
  state.b = b
  // Effects fire ONCE after both mutations, not twice
})
updateBoth(10, 20)
```

Also works as `@atomic` decorator on class methods.

### 2.7 defer() / addBatchCleanup() — Avoid cycles

When an effect needs to mutate state it reads, defer the mutation:
```ts
effect(() => {
  const len = state.items.length
  defer(() => { state.processedCount = len }) // runs after batch completes
})
```
- Runs synchronously after outermost batch. FIFO order. No microtask delay.
- Outside a batch: executes immediately.

### 2.8 biDi() — Bidirectional binding

Bridges reactive state ↔ external (DOM, third-party). Prevents infinite loops automatically.
```ts
const provide = biDi(
  (v) => inputElement.value = v,       // external setter
  { get: () => model.value, set: (v) => model.value = v }
)
inputElement.addEventListener('input', () => provide(inputElement.value))
```

### 2.9 watch() — Observe changes

```ts
// Watch a specific derivation
watch(() => state.count, (newVal, oldVal) => { ... })

// Watch any property on an object
watch(state, () => { ... })

// Deep watch (higher overhead)
watch(state, () => { ... }, { deep: true })
```

---

## 3. COLLECTIONS

All standard collections get reactive wrappers via `reactive()`:

| Type | Tracking |
|------|----------|
| `reactive([])` | Per-index, `.length`, iteration (allProps) |
| `reactive(new Map())` | Per-key, `.size`, iteration |
| `reactive(new Set())` | Per-value, `.size`, iteration |
| `reactive(new WeakMap())` | Per-key only |
| `reactive(new WeakSet())` | Per-value only |

Array methods (`push`, `splice`, `sort`, etc.) all trigger reactivity.


### 3.1 Register — Keyed ordered collection

```ts
import { Register } from 'mutts/reactive'

const list = new Register(item => item.id, [
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
])

list.push({ id: 3, label: 'Charlie' })
list.get(2)            // lookup by key, O(1)
list.set(2, newItem)   // update by key
list.remove(2)         // remove by key
list.keep(item => item.active) // filter in-place
list.upsert(v => list.push(v), ...items) // update or insert
```

Full array surface (`map`, `filter`, `reduce`, `sort`, etc.) + CRUD events (`on('add', ...)`, `on('delete', ...)`, `on('update', ...)`, `on('rekey', ...)`).

---

## 4. COLLECTION TRANSFORMS

### 4.1 project() — Per-entry reactive map

The reactive replacement for `.map()`. Each entry gets its own effect — only changed entries recompute.

```ts
import { project, cleanup } from 'mutts'

// Array
const names = project(users, ({ get }) => get().name.toUpperCase())
// names[0] recomputes only when users[0] changes

// Record
const grades = project.record(scores, ({ get }) => get() >= 90 ? 'A' : 'B')

// Map
const totals = project.map(inventory, ({ get }) => get().count)

// Auto-dispatch
const doubled = project(source, ({ get }) => get() * 2)

// Cleanup
names[cleanup]()
```

**Access object**: `{ get(), set(v), key, source, old, value }`

### 4.2 attend() — Per-key lifecycle

Creates inner effect per key. Disposed when key disappears.

```ts
import { attend } from 'mutts'

attend(reactiveRecord, (key) => {
  console.log(`${key} = ${reactiveRecord[key]}`)
  return () => console.log(`cleanup: ${key}`)
})
// Also works with: arrays, Maps, Sets, or raw () => Iterable<Key>
```

### 4.3 organized() — Per-key record transform with side effects

```ts
const doubled = organized(source, (access, target) => {
  target[access.key] = access.get() * 2
  return () => delete target[access.key]
})
```

### 4.4 describe() — Reactive Object.defineProperties

```ts
const descriptors = reactive({ foo: { value: 1, enumerable: true } })
const target = describe(descriptors) // target.foo === 1
descriptors.bar = { get: () => 42, enumerable: true } // target.bar appears
delete descriptors.foo // target.foo disappears
```

### 4.5 scan() — Reactive accumulation

```ts
const result = scan(source, (acc, item) => acc + item.val, 0)
// result is reactive array of intermediates: [1, 3, 6]
// Changing source[1].val only recomputes from index 1 onward
result[cleanup]()
```

Items must be objects (WeakMap keys). Move-optimized (reorders reuse cached intermediates).

### 4.6 lift() — Sync a computed array/object

```ts
const filtered = lift(() => items.filter(x => x.active))
// Only changed elements sync — element-wise diff, not full rebuild
filtered[cleanup]()
```

---

## 5. EVOLUTION TRACKING

```ts
import { getState } from 'mutts/reactive'

let state = getState(obj)
effect(() => {
  while ('evolution' in state) {
    console.log(state.evolution) // { type: 'set'|'add'|'del'|'bunch', prop, method }
    state = state.next
  }
})
```

**Recursive touching**: replacing an object with another of the same prototype triggers fine-grained per-property diffs, not a wholesale parent notification. Disable with `reactiveOptions.recursiveTouching = false`.

---

## 6. ERROR HANDLING

```ts
import { onEffectThrow } from 'mutts'

effect(() => {
  onEffectThrow((error) => {
    console.error('Caught:', error)
    // return without throwing = handled
    // throw = try next handler
    // return function = cleanup on effect disposal
  })
  // ... code that might throw
})
```

- Multiple handlers tried in order. Unhandled errors propagate to parent effect chain.
- **Must register before throwing code** (handlers cleared on re-run).
- Does **not** catch async errors — use `.catch()` on Promises.

---

## 7. DEBUGGING

```ts
import { reactiveOptions } from 'mutts/reactive'

// Cycle detection modes
reactiveOptions.cycleHandling = 'development' // default — graph-based, throws immediately
reactiveOptions.cycleHandling = 'debug'       // full transitive closure, detailed paths
reactiveOptions.cycleHandling = 'production'  // heuristic via maxTriggerPerBatch (fastest)

// Memoization discrepancy (double-run detection)
reactiveOptions.onMemoizationDiscrepancy = (cached, fresh, fn, args, cause) => {
  throw new Error(`Discrepancy in ${fn.name}: ${cause}`)
}

// Lifecycle hooks
reactiveOptions.enter = (effect) => { ... }
reactiveOptions.leave = (effect) => { ... }
reactiveOptions.touched = (obj, evolution) => { ... }

// Introspection (memory-intensive, dev only)
import { enableIntrospection, getDependencyGraph, getMutationHistory } from 'mutts/introspection'
enableIntrospection({ historySize: 100 })
```

**ReactiveError.debugInfo** contains: `causalChain`, `creationStack`, `cycle` (for CYCLE_DETECTED).

---

## 8. ZONES (Async Context)

```ts
import { Zone, asyncZone } from 'mutts/zone'

const requestId = new Zone<string>()
asyncZone.add(requestId)     // register for async propagation

requestId.with('req-123', async () => {
  await somePromise()
  requestId.active // still 'req-123'
})
```

- `Zone<T>`: stack-based storage. `.with(value, fn)`, `.active`, `.root(fn)`.
- `ZoneHistory<T>`: tracks history for cycle detection.
- `ZoneAggregator`: combines multiple zones. `asyncZone` is the global one.
- `.zoned`: snapshot current context for manual bridging into unmanaged callbacks.
- Reactivity uses zones internally (`effectHistory` zone tracks active effect across await).

---

## 9. OTHER MODULES

### 9.1 Decorators (`mutts/decorator`)

Unified system for legacy (`experimentalDecorators`) and modern (Stage 3):
```ts
import { decorator } from 'mutts/decorator'
const myDec = decorator({ method(original, name) { ... }, class(target) { ... } })
```

Standard decorators: `@cached`, `@debounce(ms)`, `@throttle(ms)`, `@deprecated(msg)`.

### 9.2 Mixin (`mutts/mixin`)

```ts
import { mixin } from 'mutts/mixin'
const Countable = mixin((base) => class extends base { count = 0; increment() { this.count++ } })

class A extends Countable { }           // as base class
class B extends Countable(OtherBase) { } // as mixin
// Cached: same base always returns same mixed class
```

### 9.3 Eventful (`mutts/eventful`)

Type-safe event system:
```ts
import { Eventful } from 'mutts/eventful'
interface MyEvents { click: (x: number, y: number) => void }
class Button extends Eventful<MyEvents> { }

const btn = new Button()
btn.on.click((x, y) => { ... })   // dot notation
btn.emit.click(100, 200)
btn.off.click()
const unhook = btn.hook((event, ...args) => { ... }) // global listener
```

### 9.4 Destroyable (`mutts/destroyable`)

Resource management with `FinalizationRegistry` and `Symbol.dispose`:
```ts
import { Destroyable, allocated, destructor } from 'mutts/destroyable'

class FileHandler extends Destroyable() {
  @allocated accessor filePath: string
  [destructor](alloc) { console.log(`Closing: ${alloc.filePath}`) }
}
// Destroyed objects throw DestructionError on access.
// Explicit: Destroyable.destroy(instance) or future `using` statement.
```

### 9.5 Flavored Functions (`mutts/flavored`)

Chainable property modifiers on functions:
```ts
import { flavored, flavorOptions } from 'mutts'
const greet = flavored(
  (name: string, opts?: { loud?: boolean }) => opts?.loud ? name.toUpperCase() : name,
  { get loud() { return flavorOptions(this, { loud: true }) } }
)
greet.loud('hi') // "HI"
```

### 9.6 Indexable (`mutts/indexable`)

Numeric index access (`obj[0]`) on custom classes via Proxy:
```ts
import { Indexable } from 'mutts/indexable'
const MyCollection = Indexable(BaseClass, {
  get(index) { return this.data[index] },
  set(index, v) { this.data[index] = v }
})
```

### 9.7 PromiseChain (`mutts/promiseChain`)

Fluent chaining on Promises without intermediate `await`:
```ts
import { chainPromise } from 'mutts/promiseChain'
const theme = await chainPromise(api.getUser('123')).getProfile().getSettings().theme
```

---

## 10. PHILOSOPHY & TRAPS

### Affirmative State
Declare `Y = f(X)`. Do NOT say "when X changes, update Y". The system ensures consistency.

### Events Are Legacy
Only use events for DOM interaction or external APIs. Internal logic should use reactive derivations (`effect`, `memoize`, `project`).

### Cleanup Semantics
Cleanup functions release reactive subscriptions, NOT undo side effects. If an element is being removed, there's no point resetting its attributes.

### Key Traps

| Trap | Fix |
|------|-----|
| `memoize` with primitive args | Args must be objects/symbols (WeakMap keys) |
| Bare reactive reads lose context after `await` | Register zones in `asyncZone` or use `tracked(() => ...)` |
| Self-triggering effects | Use `defer()` / `addBatchCleanup()` |
| `queueMicrotask` for cycle avoidance | Use `defer()` instead (synchronous, batch-aware) |
| Deep watch overhead | Prefer explicit property reads + recursive touching |
| `_mutts_*` properties are debug/introspection helpers | Use them for logging, tracing, and profiling only — not as stable API |

