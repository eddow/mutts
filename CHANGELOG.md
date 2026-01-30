# 1.0.7

## Functionality

- Effects dependencies tracking really seems to have only one effect: early cycle detection, but a huge cost in terms of performance. It has been rendered optional.

## Refactoring

- prototype forwarding -> metaProtos
- ReflectGet/ReflectSet -> FoolProof.get/set
- removed old mapped/reduced, rewrote `scan`
- zoning made a double-entry point, there are 2 ways to hook an `await` (node/browser)

## Bugfixes

- biDi now uses `programatticallySetValue` to prevent circular updates instead of hacking in the batch
- added `toJSON` to reactive arrays