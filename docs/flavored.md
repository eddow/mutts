# Flavored and Captioned Functions

The `flavored` utility creates extensible functions with chainable property modifiers. It enables a fluent API where properties return specialized variants of the base function.

The `captioned` utility is a sibling concept for callback-oriented APIs. It adds a tagged-template call form that can attach a runtime caption to one callback argument before delegating to the base function.

## Overview

Flavored functions allow you to:
- Create property-based modifiers that transform how the function is called
- Chain multiple modifiers together
- Use either automatic option merging (`flavorOptions`) or custom argument transformation (`createFlavor`)
- Return hand-made functions for complete control (the generic case)

Captioned functions allow you to:
- Keep the normal callback-first call form
- Add a tagged-template call form like `` effect`render:${id}`(fn) ``
- Warn when a callback-first API receives an anonymous callback without a caption
- Preserve captioning across flavored variants created with `createFlavor` or `flavorOptions`
- Target callbacks that are not in argument position `0`

## Basic Usage

### Creating a Flavored Function

```typescript
import { flavored, flavorOptions } from 'mutts'

const greet = flavored(
  (name: string, options?: { loud?: boolean }) => {
    const greeting = `Hello, ${name}!`
    return options?.loud ? greeting.toUpperCase() : greeting
  },
  {
    get loud() {
      return flavorOptions(this, { loud: true })
    }
  }
)

greet('World')          // "Hello, World!"
greet.loud('World')     // "HELLO, WORLD!"
```

## API Reference

### `flavored(fn, flavors)`

Creates a flavored function with chainable property modifiers.

**Parameters:**
- `fn` - The base function to flavor
- `flavors` - Object defining the flavor properties (getters or methods)

**Returns:** A proxy of the function with the flavor properties attached.

**Example:**
```typescript
const effect = flavored(baseEffect, {
  get opaque() {
    return flavorOptions(this, { opaque: true })
  },
  named(name: string) {
    return flavorOptions(this, { name })
  }
})

effect(fn)              // Basic usage
effect.opaque(fn)       // With opaque option
effect.named('myEffect')(fn)  // With name option
effect.opaque.named('x')(fn)  // Chained
```

### `captioned(fn, options?)`

Creates a callback-oriented function that also accepts a tagged-template call form. The caption is applied to the configured callback argument before the base function runs.

**Use when:** Your API takes a callback argument and you want ergonomic call-site naming without turning naming itself into a flavor.

**Parameters:**
- `fn` - The callback-first base function
- `options.callbackIndex` - Which argument should be treated as the callback to rename/warn about. Defaults to `0`
- `options.name` - Human-readable label used in warning messages
- `options.rename` - Optional function to customize how the caption is applied to the callback
- `options.warn` - Optional warning sink for anonymous uncaptained callbacks
- `options.shouldWarnAnonymous` - Optional predicate to suppress warnings for specific argument shapes

**Example:**
```typescript
import { captioned } from 'mutts'

const run = captioned(
  (callback: () => void) => {
    callback()
  },
  { name: 'run' }
)

run(function namedTask() {})
run`task:${42}`(() => {})
```

The two call forms are:

```typescript
run(callback)
run`caption`(callback)
```

If `run(callback)` receives an anonymous callback, `captioned` may warn depending on its `shouldWarnAnonymous` policy.

You can also target callbacks that are not the first argument:

```typescript
const attendLike = captioned(
  (source: string[], callback: (value: string) => void) => {
    for (const value of source) callback(value)
  },
  { name: 'attendLike', callbackIndex: 1 }
)

attendLike`items`(['a', 'b'], () => {})
```

### `flavorOptions(fn, defaultOptions)`

Creates a flavored variant that merges options with the last argument.

**Use when:** The last argument is an options object that should be merged.

**Parameters:**
- `fn` - The base flavored function
- `defaultOptions` - Options to merge with provided options

**Example:**
```typescript
const loudGreet = flavorOptions(greet, { loud: true })
loudGreet('World')                    // Uses { loud: true }
loudGreet('World', { prefix: 'Hi' })  // Merges both options
```

### `createFlavor(fn, transform)`

Creates a flavored variant with custom argument transformation.

**Use when:** You need to transform arguments before calling the base function.

**Parameters:**
- `fn` - The base flavored function
- `transform` - Function that receives and returns the arguments tuple

**Example:**
```typescript
const doubleArgs = createFlavor(add, (a: number, b: number): [number, number] => {
  return [a * 2, b * 2]
})
doubleArgs(3, 4)  // Returns 14 (6 + 8)
```

## The Generic Case: Hand-Made Functions

When `flavorOptions` or `createFlavor` don't fit your needs, you can return a **hand-made function** directly. This gives you complete control over the behavior.

### Basic Hand-Made Function

```typescript
const fetch = flavored(fetchData, {
  // Returns a completely custom function
  withTimeout(timeout: number) {
    return (url: string, options?: { retries?: number }) => {
      return fetchData(url, { ...options, timeout })
    }
  }
})

// Usage
const fetchWith500ms = fetch.withTimeout(500)
fetchWith500ms('api.com')  // Uses timeout: 500
```

### Re-Flavoring Hand-Made Functions

Hand-made functions can be re-flavored to enable further chaining:

```typescript
const process = flavored(baseProcess, {
  presetMultiplier(multiplier: number) {
    // Create the preset function
    const presetFn = (value: number, options?: { offset?: number }) => {
      return baseProcess(value, { ...options, multiplier })
    }
    // Re-flavor it to enable chaining
    return flavored(presetFn, {
      get withOffset() {
        return flavorOptions(this, { offset: 10 })
      }
    })
  }
})

// Usage
const times3 = process.presetMultiplier(3)
times3(5)              // 15 (5 * 3)
times3.withOffset(5)   // 20 (5 * 3 + 5)
```

### When to Use Each Approach

| Approach | Use When |
|----------|----------|
| `flavorOptions` | You have an options object as the last argument |
| `createFlavor` | You need to transform arguments structurally |
| **Hand-made function** | You need complete control, different signature, or side effects |

## Advanced Patterns

### Chaining Multiple Modifiers

```typescript
const createUser = flavored(createUserBase, {
  get admin() {
    return flavorOptions(this, { admin: true })
  },
  get verified() {
    return flavorOptions(this, { verified: true })
  }
})

createUser.admin.verified('Alice')  // Both options applied
```

### Combining Approaches

```typescript
const calculator = flavored(
  (a: number, b: number, opts?: { multiply?: boolean }) => {
    return opts?.multiply ? a * b : a + b
  },
  {
    get multiply() {
      return flavorOptions(this, { multiply: true })
    },
    double() {
      return createFlavor(this, (a, b, opts?): [number, number, typeof opts] => {
        return [a * 2, b * 2, opts]
      })
    }
  }
)

calculator.multiply(3, 4)     // 12
calculator.double()(3, 4)     // 14 (6 + 8)
```

## Combining `flavored` and `captioned`

They solve different problems:

- `flavored` changes how a function is configured via chainable properties
- `captioned` changes how a callback-first function can be called

They compose naturally:

```typescript
const watch = captioned(
  flavored(baseWatch, {
    get immediate() {
      return flavorOptions(this, { immediate: true })
    }
  }),
  { name: 'watch' }
)

watch(() => state.count, changed)
watch`counter:watch`(() => state.count, changed)
watch.immediate`counter:watch`(() => state.count, changed)
```

For callback arguments in another position, use `callbackIndex`:

```typescript
const attend = captioned(baseAttend, {
  name: 'attend',
  callbackIndex: 1,
})

attend`entries`(source, (key) => {
  console.log(key)
})
```

## TypeScript Considerations

Flavored functions use proxies and require type assertions for complex chaining scenarios:

```typescript
const effectWithModifiers = flavored(effect, {
  get opaque(): EffectWithModifiers {
    return flavorOptions(this, { opaque: true }) as EffectWithModifiers
  },
  named(name: string): EffectWithModifiers {
    return flavorOptions(this, { name }) as EffectWithModifiers
  }
})
```

The `as EffectWithModifiers` cast enables proper type inference for chained modifiers.
