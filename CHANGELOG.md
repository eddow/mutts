# 1.0.9

## Refactoring

- `resolve` -> `lift` (array buffering)

# 1.0.8

## TODOs

- arrays indexing on change

## Finishing touches

- The async hooks have been corrected and are working as expected: tests have been set to run on node and browser

# 1.0.7

## Functionality

- Effects dependencies tracking really seems to have only one effect: early cycle detection, but a huge cost in terms of performance. It has been rendered optional.

## Refactoring

- prototype forwarding -> metaProtos
- ReflectGet/ReflectSet -> FoolProof.get/set
- removed old mapped/reduced, rewrote `scan`
- zoning made a double-entry point, there are 2 ways to hook an `await` (node/browser)

## Bugfixes

- biDi now uses `programmaticallySetValue` to prevent circular updates instead of hacking in the batch
- added `toJSON` to reactive arrays