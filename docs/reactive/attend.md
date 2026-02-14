# Reactive Enumeration (`attend`)

The `attend` utility reactively iterates over the entries of a collection, running a per-key effect that is automatically created when a key appears and disposed when it disappears.

## Overview

`attend` is the reactive equivalent of `forEach`. It:
- Tracks the **keys** (or indices, or values) of a collection inside an outer effect.
- **Creates** an inner effect for each key, via `ascend`.
- **Disposes** the inner effect when the key is removed from the collection.
- Allows the callback to return a **cleanup function** (like a regular effect closer).

This is the foundational lifecycle primitive that `organized` is built on.

## API

```typescript
// Raw enumeration callback
function attend<Key>(
    enumerate: () => Iterable<Key>,
    callback: (key: Key) => EffectCloser | void
): ScopedCallback

// Collection shorthands
function attend<T>(source: readonly T[], callback: (index: number) => EffectCloser | void): ScopedCallback
function attend<K, V>(source: Map<K, V>, callback: (key: K) => EffectCloser | void): ScopedCallback
function attend<T>(source: Set<T>, callback: (value: T) => EffectCloser | void): ScopedCallback
function attend<S extends Record<PropertyKey, any>>(source: S, callback: (key: keyof S & string) => EffectCloser | void): ScopedCallback
```

### Parameters

- **`source`** or **`enumerate`**: Either a collection (array, record, Map, Set) or a callback returning an `Iterable<Key>`. The enumeration runs inside the outer effect, so reactive reads (e.g. `source.length`, `Object.keys(source)`) are tracked automatically.
- **`callback`**: Called per key inside an inner effect. May return a cleanup function that runs when the key is removed or before the inner effect re-executes.

### Returns

A `ScopedCallback` that tears down all inner effects and the outer effect.

## Basic Usage

### Record

```typescript
import { reactive, attend } from 'mutts'

const config = reactive({ theme: 'dark', lang: 'en' })

const stop = attend(config, (key) => {
    console.log(`${key} = ${config[key]}`)
    return () => console.log(`cleanup: ${key}`)
})

// Logs: "theme = dark", "lang = en"

config.debug = true
// Logs: "debug = true"

delete config.lang
// Logs: "cleanup: lang"

config.theme = 'light'
// Logs: "cleanup: theme" then "theme = light"
// (inner effect re-runs: previous cleanup fires, then new execution)

stop()
// Disposes everything
```

### Array

```typescript
const items = reactive([10, 20, 30])

attend(items, (i) => {
    console.log(`[${i}] = ${items[i]}`)
})

items.push(40)
// Logs: "[3] = 40"
```

### Map

```typescript
const registry = reactive(new Map([['a', 1]]))

attend(registry, (key) => {
    console.log(`${key} -> ${registry.get(key)}`)
    return () => console.log(`removed: ${key}`)
})

registry.set('b', 2)  // Logs: "b -> 2"
registry.delete('a')   // Logs: "removed: a"
```

### Set

```typescript
const tags = reactive(new Set(['alpha', 'beta']))

attend(tags, (value) => {
    console.log(`tag: ${value}`)
    return () => console.log(`untagged: ${value}`)
})

tags.add('gamma')     // Logs: "tag: gamma"
tags.delete('alpha')  // Logs: "untagged: alpha"
```

### Raw enumeration callback

For custom iteration logic or non-standard collections:

```typescript
const source = reactive({ a: 1, b: 2 })

attend(
    () => Reflect.ownKeys(source),
    (key) => {
        console.log(key, source[key])
    }
)
```

## How it Works

1. An **outer effect** calls `enumerate()` (or derives it from the collection type), collecting the current keys into a `Set`.
2. For each **new key**, `ascend` creates an inner effect that runs the callback.
3. For each **removed key**, the corresponding inner effect is stopped (which triggers its cleanup).
4. The **inner effect** tracks its own reactive dependencies — so if a value changes for an existing key, only that key's effect re-runs.

## Relationship to Other Primitives

| Primitive | Uses `attend`? | Purpose |
|---|---|---|
| `attend` | — | Reactive lifecycle per key |
| `organized` | ✅ | Reactive record mapping with access objects |
| `project` | ❌ | Reactive collection mapping (manages a target + projection context) |
| `scan` | ❌ | Reactive accumulation (sequential key dependency) |

`project` and `scan` have additional concerns (target management, sequential dependencies) that go beyond `attend`'s independent-key lifecycle model.
