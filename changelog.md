# 28-01-2026

## bugfixes
- biDi now uses `programatticallySetValue` to prevent circular updates instead of hacking in the batch
- added `toJSON` to reactive arrays