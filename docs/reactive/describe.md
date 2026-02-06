# Reactive Property Description (`describe`)

The `describe` utility provides a reactive way to define or update properties on an object using a record of property descriptors.

## Overview

Unlike `Object.defineProperties`, the reactive `describe` utility is alive:
- It tracks the **keys** of the descriptors record.
- When a new key is added to the descriptors record, the property is defined on the target object.
- When a key is removed, the property is removed from the target object.
- When a descriptor itself changes (e.g. its `value` or `get` function), the property definition is updated.

This is particularly useful when projecting props or dynamically extending objects in a reactive way.

## API

```typescript
function describe<T extends object>(
    descriptors: Record<PropertyKey, PropertyDescriptor>,
    target: T = {} as T
): T
```

### Parameters

- `descriptors`: A reactive record where each value is a standard `PropertyDescriptor`.
- `target` (optional): The object to define properties on. If omitted, a new plain object is created and returned.

### Returns

The `target` object with reactive property definitions.

## Basic Usage

```typescript
import { reactive, describe, effect } from 'mutts/reactive'

const target = {}
const descriptors = reactive({
    foo: { value: 1, enumerable: true }
})

describe(descriptors, target)

console.log(target.foo) // 1

// Adding a property reactively
descriptors.bar = { get: () => 42, enumerable: true }
console.log(target.bar) // 42

// Removing a property reactively
delete descriptors.foo
console.log('foo' in target) // false
```

## Integration with `project`

`describe` is often used in conjunction with `project` to create dynamic projections of property descriptors:

```typescript
import { project, describe, memoize } from 'mutts/reactive'

function propsInto(props, into) {
    const descriptors = project(props, ({ key, value }) => ({
        get: memoize(() => (typeof value === 'function' ? value() : value)),
        enumerable: true,
        configurable: true
    }))
    
    return describe(descriptors, into)
}
```

## Renaming Conflict

Previously, `mutts` had a decorator named `describe`. To avoid confusion with this utility, the decorator has been renamed to `@descriptor`.

```typescript
@descriptor({ enumerable: false })
class MyClass {
    internal = 'secret'
}
```
