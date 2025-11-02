# Performance Profiling & Coverage Guide

## Coverage

### Running Coverage Tests
```bash
npm run test:coverage
```

### VSCode Integration

1. **Install Extension**: Install the "Coverage Gutters" extension in VSCode
2. **Run Coverage**: Run `npm run test:coverage` to generate coverage data
3. **View in Editor**: Coverage will appear as:
   - Green/Red gutters (left margin) showing line coverage
   - Highlighted lines showing covered/uncovered code
   - Ruler markers showing coverage status

The coverage data is automatically read from `coverage/lcov.info`.

### Coverage Files

Coverage files are generated in the `coverage/` directory:
- `lcov.info` - Used by VSCode extension
- `lcov-report/` - HTML report (open `index.html` in browser)
- `coverage-final.json` - JSON format

## Profiling

### Quick Start

```bash
# Run all profiling tests
npm run test:profile

# Run only benchmark tests
npm run test:profile:benchmark

# Generate detailed CPU profile
npm run test:profile:detailed
```

### Profiling Test Structure

Profiling tests are located in `tests/profiling/` and are **automatically excluded** from normal test runs (`npm test`).

### Test Files

- `proxy.profile.test.ts` - Proxy handler performance
- `tracking.profile.test.ts` - Dependency tracking overhead
- `change.profile.test.ts` - Effect dispatch performance
- `array.profile.test.ts` - Array operations
- `deep-watch.profile.test.ts` - Deep watch traversal

### Profiling Helpers

See `tests/profiling/helpers.ts` for utilities:
- `profileSync()` - Measure synchronous operations
- `profileAsync()` - Measure async operations
- `compareProfiles()` - Compare multiple operations
- `profileMemory()` - Measure memory usage

### Detailed Profiling

For deep analysis, use `npm run test:profile:detailed` which generates Node.js profiler output. Analyze with:

```bash
# Process the profile
node --prof-process isolate-*.log > profile.txt

# Or use clinic.js
npm install -g clinic
clinic doctor -- node --expose-gc node_modules/.bin/jest --testPathPattern=profiling
```

## Scripts Summary

| Script | Purpose |
|--------|---------|
| `npm test` | Run normal tests (excludes profiling) |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:coverage:watch` | Watch mode with coverage |
| `npm run test:profile` | Run profiling tests |
| `npm run test:profile:benchmark` | Run only benchmark tests |
| `npm run test:profile:detailed` | Generate CPU profile |
| `npm run benchmark:save <name>` | Save current profiling results as baseline |
| `npm run benchmark:compare <name>` | Compare current results against saved baseline |
| `npm run benchmark:list` | List all saved benchmarks |

## Tracking Performance Evolution

**Quick start to track performance changes:**

```bash
# 1. Save baseline before changes
npm run benchmark:save baseline-v1.0

# 2. Make your optimizations
# ... edit code ...

# 3. Compare against baseline
npm run benchmark:compare baseline-v1.0
```

This shows you:
- 🟢 **Improvements** (faster operations, less memory)
- 🔴 **Regressions** (slower operations, more memory)  
- ⚪ **Unchanged** metrics
- Percentage changes and speedup factors
- **Memory benchmarks** (heap usage, delta per operation)

**Example output:**
```
🟢 IMPROVED proxy:reactive vs plain object property access
   0.001524ms → 0.001200ms (-21.26%)
   656,168 → 833,333 ops/sec
   1.27x faster

🔴 REGRESSION tracking:property access with active effect
   0.007337ms → 0.009521ms (+29.74%)
   136,281 → 105,034 ops/sec
   0.77x slower
```

See `tests/profiling/BENCHMARK_USAGE.md` for detailed guide.

## Expected Performance

Typical reactive engine overhead:
- Property access: < 10x overhead vs plain objects
- Property writes: < 20x overhead vs plain objects
- Reactive object creation (cached): < 1μs
- Effect dispatch: < 1ms for 1000 operations

## Notes

- Profiling tests use `benchmark:` prefix in test names
- Tests include warmup phases for accurate measurements
- GC is run between warmup and measurement when available
- Memory profiling available via `profileMemory()` helper

