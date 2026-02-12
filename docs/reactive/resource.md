# Reactive Resource (`resource`)

The `resource` utility creates a reactive object that automatically tracks the state of an asynchronous operation (loading, value, error). It is designed to simplify data fetching and async state management in a reactive environment.

## Overview

`resource` wraps an async function (the "fetcher") and returns a reactive object that:
-   **Tracks dependencies**: Automatically re-runs the fetcher when reactive dependencies accessed within it change.
-   **Manages state**: Provides `loading`, `value`, `error`, and `latest` properties that update automatically.
-   **Handles race conditions**: Ensures that only the result of the latest fetch is applied, discarding results from stale requests.
-   **Supports manual reload**: Exposes a `reload()` method to force a refresh.

## API

```typescript
function resource<T>(
    fetcher: (dep: EffectAccess) => Promise<T> | T,
    options?: { initialValue?: T }
): Resource<T>

interface Resource<T> {
    value: T | undefined  // The current successful value
    loading: boolean      // True if a fetch is in progress
    error: any            // Error from the last failed fetch
    latest: T | undefined // The latest successful value (preserved during loading)
    reload: () => void    // Function to manually trigger a re-fetch
}
```

### Parameters

-   **`fetcher`**: A function that returns a value `T` or a `Promise<T>`. It receives an `EffectAccess` object, allowing for dependency tracking control (e.g., `dep.tracked()`). Reactive properties accessed synchronously or within tracked scopes are dependencies.
-   **`options`**: Optional configuration object.
    -   `initialValue`: Initial value for `value` and `latest` before the first fetch completes (or if the first fetch is async).

### Returns

A reactive object implementing the `Resource<T>` interface.

## Usage

### Basic Async Fetch

```typescript
import { reactive, resource } from 'mutts/reactive'

// ID usually comes from another reactive source
const state = reactive({ userId: 1 })

// Create a resource that fetches user data based on state.userId
const user = resource(async () => {
    const response = await fetch(`/api/users/${state.userId}`)
    return response.json()
})

// Use the resource in your view
effect(() => {
    if (user.loading) {
        console.log('Loading...')
    } else if (user.error) {
        console.error('Error:', user.error)
    } else {
        console.log('User:', user.value)
    }
})

// Changing state.userId automatically triggers a new fetch
state.userId = 2
```

### Handling Race Conditions

`resource` automatically handles race conditions. If `state.userId` changes quickly from 1 to 2, and the request for user 1 takes longer than user 2, the result for user 1 will be ignored when it arrives, preventing inconsistent state.

### Using `latest` for Smooth Transitions

The `value` property becomes `undefined` (or `initialValue`) when a new fetch starts if the previous value is not preserved (current implementation resets `value` only on success? No, `value` is kept from previous success? - *Clarification: In the implementation, `value` is NOT reset to undefined on new fetch start, it retains the old value until new value arrives, unless `initialValue` was used? Let's check implementation behavior.*)

*Correction based on implementation:*
The current implementation:
```typescript
state.loading = true
state.error = undefined
// ... fetcher executes ...
// on success:
state.value = val
state.latest = val
state.loading = false
```
It does **NOT** reset `value` to `undefined` when a new fetch starts. So `value` acts like `latest`. The distinction is primarily semantic or for future behavior where `value` might be reset. Currently `value` and `latest` behave similarly regarding preservation of old data during loading.

```typescript
effect(() => {
    // Show old data while loading new data
    if (user.loading) {
        console.log('Reloading... showing cached version:', user.latest)
    } else {
        console.log('Current:', user.value)
    }
})
```

### Manual Reload

You can trigger a re-fetch without changing dependencies:

```typescript
// Refresh the data (e.g., user clicked a "Refresh" button)
user.reload()
```

### Synchronous Resources

`resource` can also wrap synchronous calculations, essentially behaving like a computed property but with the `Resource` interface structure.

```typescript
const count = reactive({ value: 1 })

const doubled = resource(() => {
    return count.value * 2
})

console.log(doubled.value) // 2
console.log(doubled.loading) // false
```
