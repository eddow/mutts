# Flavored Functions

The `flavored` utility creates extensible functions with chainable property modifiers. It enables a fluent API where properties return specialized variants of the base function.

## Overview

Flavored functions allow you to:
- Create property-based modifiers that transform how the function is called
- Chain multiple modifiers together
- Use either automatic option merging (`flavorOptions`) or custom argument transformation (`createFlavor`)
- Return hand-made functions for complete control (the generic case)

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
