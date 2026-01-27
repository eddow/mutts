# Mutts AI Agent Manual

> [!IMPORTANT]
> **Identity**: You are an AI Agent. This document is written for **YOU**.
> **Purpose**: This file defines the protocols and high-level strategy for working with the `mutts` reactivity system.

## 1. Technical Documentation
Do not rely on outdated internal knowledge. Use the current documentation as your primary source of truth:

- **[Debugging Tools](../reactive/debugging.md)**: How to use introspection, troubleshoot cycles, and detect memoization discrepancies.
- **[API Reference](./api-reference.md)**: Exact TypeScript signatures for library functions.

## 2. Debugging Protocol
When you encounter reactivity bugs (infinite loops, unexpected updates), **DO NOT GUESS**. 

1. **Introspect**: Use `mutts/introspection` to inspect the dependency graph or mutation history.
2. **Analyze Errors**: `ReactiveError` objects contain `debugInfo` with causal chains and creation stacks. Use them to trace the fault.
3. **Verify**: Use `reactiveOptions.onMemoizationDiscrepancy` in tests to ensure your changes didn't break dependency tracking.

## 3. Architecture Constraints
1. **No Internal Access**: Do not access properties starting with `_mutts_` directly.
2. **Explicit Naming**: Always name your effects (`effect(fn, { name: '...' })`) to make future debugging easier for yourself or other agents.
3. **Affirmative State**: Prefer derived state and effects over imperative event-driven updates.

