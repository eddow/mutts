# Profiling Tests

This directory contains performance profiling tests for the reactive engine. These tests measure the overhead and performance characteristics of various reactive operations.

## Running Profiling Tests

### Basic Profiling
```bash
npm run test:profile
```

Runs all profiling tests and outputs performance metrics to the console.

### Benchmark Tests Only
```bash
npm run test:profile:benchmark
```

Runs only tests marked with `benchmark:` in their name (typically the most intensive performance tests).

### Detailed Profiling with Node.js Profiler
```bash
npm run test:profile:detailed
```

Generates a CPU profile file that can be analyzed with:
```bash
node --prof-process isolate-*.log > processed.txt
```

Or use tools like:
- [clinic.js](https://clinicjs.org/)
- [0x](https://github.com/davidmarkclements/0x)
- Chrome DevTools (load the generated `.heapsnapshot` or CPU profile)

## Test Files

- **proxy.profile.test.ts** - Proxy handler overhead (property access, writes, creation)
- **tracking.profile.test.ts** - Dependency tracking (`dependant()` calls)
- **change.profile.test.ts** - Change detection and effect dispatch
- **array.profile.test.ts** - Reactive array operations
- **deep-watch.profile.test.ts** - Deep watching traversal and memory usage

## Profiling Helpers

The `helpers.ts` file provides utilities for consistent profiling:

- `profileSync()` - Profile synchronous operations
- `profileAsync()` - Profile async operations  
- `compareProfiles()` - Compare multiple operations
- `profileMemory()` - Measure memory usage
- `formatProfileResult()` - Format results for display

## Example Output

```
=== Profile Comparison ===

Results (sorted by speed):
Plain object access:
  Iterations: 1,000,000
  Total time: 12.34ms
  Average: 0.000012ms/op
  ...

Reactive object access:
  Iterations: 1,000,000
  Total time: 45.67ms
  Average: 0.000046ms/op
  ...

Fastest: Plain object access
Slowest: Reactive object access

Comparisons:
  Plain object access is 3.82x faster than Reactive object access (0.000034ms difference)
```

## VSCode Integration

Profiling tests are automatically excluded from normal test runs. They only run when explicitly requested via the profiling scripts.

## Tips

1. **Warmup**: Tests include warmup phases to ensure consistent measurements
2. **GC**: Tests run garbage collection between warmup and measurement when available
3. **Iterations**: Adjust iterations in test code based on operation speed
4. **Memory**: Use `profileMemory()` for memory-sensitive operations
5. **Comparison**: Use `compareProfiles()` to compare implementations

## Interpreting Results

- **avgTime**: Average time per operation in milliseconds
- **opsPerSec**: Throughput (higher is better)
- **minTime/maxTime**: Range of operation times
- **Overhead**: Percentage increase compared to plain operations

Typical reactive overhead expectations:
- Property access: < 10x overhead
- Property writes: < 20x overhead  
- Object creation (cached): < 1 microsecond
- Effect dispatch: < 1ms for 1000 operations

