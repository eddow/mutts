# project

This document explains how `project(...)` composes reactive effects, and why it uses `ascend(...)` when creating per-item/per-key effects.

## What `project` builds

`project` is a reactive “mapping” primitive.

- A **source** collection (`Array`, `Map`, `Register`, plain record)
- A **target** collection of the same shape
- A set of effects that keep target in sync with source:
  - **structure effect** (length/keys watcher)
  - **item effect** per key/index (computes the projected value)

The important property is **stability**: changing one source entry should only re-run the effect that owns that entry.

## Effects involved

For `project.array(source, apply)` the implementation creates:

- **Length effect**: watches the set of valid indexes by reading `source.length`.
- **Index effects**: created lazily (when an index appears), one effect per index.

The other variants (`project.map`, `project.record`, `project.register`) follow the same pattern:

- a *keys effect* (watches which keys exist)
- a *key effect* per key

## Cleanup and “garbage collection”

`effect(...)` has two cleanup pathways:

- **explicit**: you keep the returned stop function and call it.
- **GC-driven** (Node with `--expose-gc`): for **root effects only**, a `FinalizationRegistry` calls `stopEffect()` when the stop function itself becomes unreachable.

Parenting matters because only root effects are eligible for automatic GC cleanup.

### Parent-child relationship

When an effect is created while another effect is active, it becomes a **child**:

- the parent keeps a reference to a child-cleanup function
- when the parent is cleaned up, it calls child-cleanups

This guarantees that **unstored** children do not leak and do not rely on GC.

## Why `project` uses `ascend(...)`

In `project.ts`, per-item effects are created inside the structure effect.

If we created item effects “normally” inside the structure effect body, they would be parented to the structure effect.

That is *not* what we want:

- The structure effect re-runs whenever the set of keys/indexes changes.
- On each re-run, `effect(...)` executes the previous cleanup first.
- If item effects were children of the structure effect, that cleanup would stop all item effects on every structural update.

That would break stability:

- pushing a new element would unnecessarily dispose and recreate existing item effects
- nested projections would be especially unstable

### What `ascend` does here

`ascend` is a wrapper around `effectHistory.zoned`.

It executes a function in the **parent effect context** (the effect that was active when the structure effect itself was created).

So the parent chain becomes:

- owning effect (the effect that called `project(...)`)
  - structure effect (length/keys)
  - item effects (per index/key)

All of them share the same owner.

This gives the intended semantics:

- structure effect may re-run many times without killing item effects
- when the owning effect stops (explicitly or by GC), it will stop:
  - the structure effect
  - all item effects
  - all nested projections under those item effects

## Projection context

During an item effect’s first run, `project` calls:

- `setActiveProjection({ source, key, target, depth, parent })`

This attaches a `ProjectionContext` to the currently running effect via `effectProjectionMetadata`.

`getActiveProjection()` is how nested projections discover their parent projection.

The goal is to allow:

- a nested projection to compute its own `depth`
- a nested projection to know its parent projection (for debugging/introspection)

## Testing expectations

The behavior that matters (and that tests should lock down) is:

- item effects are not disposed on structural updates of the same projection
- disposing an outer item stops all nested projection effects under that item
- disposing the owning effect (or letting it be GC’ed) stops all projection effects created under it
