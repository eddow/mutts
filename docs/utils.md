# Utilities

Mutts provides a collection of lightweight, high-performance utility functions. These are used extensively within the reactive engine but are also exported for general application logic.

## Collection Utilities

### `zip(...arrays)`

A generator that yields tuples containing elements from each input array. It continues until the **longest** array is exhausted (returning `undefined` for shorter arrays).

```typescript
import { zip } from 'mutts';

const names = ['Alice', 'Bob'];
const scores = [100, 95, 80];

for (const [name, score] of zip(names, scores)) {
    console.log(`${name}: ${score}`);
}
// Alice: 100
// Bob: 95
// undefined: 80
```

> [!NOTE]
> `zip` is implemented as a generator for memory efficiency. If you need a plain array, spread the result: `[...zip(a, b)]`.


### `deepCompare(a, b)`

A robust deep comparison utility that handles circular references and various built-in types.

- **Supported Types**: Objects, Arrays, `Set`, `Map`, `Date`, `RegExp`.
- **Circular References**: Safely handled via internal tracking.
- **Prototypes**: Objects must have matching prototypes to be considered equal.

```typescript
import { deepCompare } from 'mutts';

const obj1 = { date: new Date(0), map: new Map([['a', 1]]) };
const obj2 = { date: new Date(0), map: new Map([['a', 1]]) };

deepCompare(obj1, obj2); // true
```

## Type Reflection

### `isConstructor(fn)` / `isObject(value)`

Utilities for robust type checking without the pitfalls of `typeof`.

- `isConstructor`: Returns `true` if the function is a `class` or a native constructor (like `Array`).
- `isObject`: Returns `true` for plain objects. Returns `false` for `null`, `Array`, `Date`, `Map`, etc.

## Debugging & Metadata

### `tag(name, obj)`

Applies a debugging "tag" to an object. It sets `Symbol.toStringTag` and overrides `toString()` so the object appears clearly in logs and DevTools.

### `named(name, fn)`

Renames a function for better stack traces. If the function already has a name, it appends the new name using `::` as a separator (e.g., `original::new`).

```typescript
const myFn = named('Enhanced', () => {});
console.log(myFn.name); // "Enhanced"
```

---
