# Benchmark Tracking & Evolution

This guide shows how to track performance evolution over time using the benchmark tool.

## Quick Start

### 1. Save a Baseline

Before making changes, save a baseline:

```bash
npm run benchmark:save baseline-v1.0
```

This will:
- Run all profiling tests
- Capture performance metrics
- Save them to `benchmarks/baseline-v1.0.json`
- Include git hash and timestamp

### 2. Make Changes

Make your optimizations or changes to the code.

### 3. Compare Against Baseline

After changes, compare:

```bash
npm run benchmark:compare baseline-v1.0
```

This will:
- Run profiling tests again
- Compare against your saved baseline
- Show improvements (🟢), regressions (🔴), and unchanged (⚪)
- Display percentage changes and speedup factors

## Example Output

```
📊 Benchmark Comparison

Baseline: baseline-v1.0 (2024-01-15T10:30:00.000Z)
Current:  current (2024-01-15T14:45:00.000Z)
Git:      7a3b2c1 → 8d4e5f2

================================================================================

🟢 IMPROVED proxy:reactive vs plain object property access
   0.001524ms → 0.001200ms (-21.26%)
   656,168 → 833,333 ops/sec
   1.27x faster

🔴 REGRESSION tracking:property access with active effect
   0.007337ms → 0.009521ms (+29.74%)
   136,281 → 105,034 ops/sec
   0.77x slower

⚪ UNCHANGED array:reactive array index access
   0.000389ms → 0.000390ms (0.00%)
   2,565,216 → 2,564,102 ops/sec

================================================================================
Performance Summary: 🟢 5 improved | 🔴 2 regressed | ⚪ 20 unchanged

================================================================================

💾 Memory Benchmarks

🟢 IMPROVED deep-watch:Deep watch overhead
   Delta: 142.4397 → 135.2000 KB/iteration
   Delta %: 5.29% → 4.95%
   Memory: 262.84 → 260.12 MB (before)
           276.75 → 272.45 MB (after)
   -5.08% less memory per operation

================================================================================
Memory Summary: 🟢 1 improved | 🔴 0 regressed | ⚪ 0 unchanged
```

## Workflow Examples

### Tracking Optimization Progress

```bash
# Before optimization
npm run benchmark:save before-optimization

# Make changes
# ... edit code ...

# After optimization
npm run benchmark:compare before-optimization
```

### Comparing Versions

```bash
# Save current version
npm run benchmark:save v1.2.0

# Later, after updates
npm run benchmark:compare v1.2.0
```

### Before/After Specific Change

```bash
# Save before
npm run benchmark:save before-proxy-optimization

# Implement optimization
# ... code changes ...

# Compare
npm run benchmark:compare before-proxy-optimization
```

## Listing Saved Benchmarks

```bash
npm run benchmark:list
```

Output:
```
📋 Saved Benchmarks

  baseline-v1.0
    Date: 1/15/2024, 10:30:00 AM
    Git:  7a3b2c1
    Tests: 27 benchmarks

  before-optimization
    Date: 1/15/2024, 2:15:00 PM
    Git:  8d4e5f2
    Tests: 27 benchmarks
```

## Understanding Results

### Improvement Indicators 🟢
- **Negative percentage** = faster (good)
- **Speedup > 1x** = improvement
- **Higher ops/sec** = better throughput

### Regression Indicators 🔴
- **Positive percentage** = slower (bad)
- **Speedup < 1x** = regression
- **Lower ops/sec** = worse throughput

### What's Significant?

- **< 1% change**: Noise, likely not significant
- **1-10% change**: Possibly meaningful, check consistency
- **> 10% change**: Significant, worth investigating

### Interpreting Speedup

- `1.5x faster` = 50% improvement (excellent)
- `2x faster` = 100% improvement (doubled speed)
- `0.8x slower` = 20% regression (needs investigation)

## Best Practices

1. **Save before major changes** - Always baseline before optimizations
2. **Use descriptive names** - `before-proxy-fix` not `test1`
3. **Include git hash** - Tool automatically includes it
4. **Compare consistently** - Same conditions, same machine
5. **Multiple runs** - Run 2-3 times to check consistency
6. **Document context** - Note what changed between benchmarks

## File Structure

Benchmarks are saved in:
```
benchmarks/
  baseline-v1.0.json
  before-optimization.json
  after-optimization.json
```

Each file contains:
- Timestamp
- Git hash
- All benchmark results with metrics

## Advanced Usage

### Manual Comparison

You can manually compare JSON files:

```bash
# View a saved benchmark
cat benchmarks/baseline-v1.0.json | jq '.results["proxy:reactive vs plain"]'
```

### CI/CD Integration

Save benchmarks in CI:

```bash
# In CI pipeline
npm run benchmark:save ci-$(date +%Y%m%d)
```

## Memory Benchmarking

The benchmark tool also tracks memory usage metrics:

### Memory Metrics Tracked

- **heapUsedBefore/After**: Heap memory used before and after operations
- **delta**: Memory delta per iteration (in bytes)
- **deltaKB**: Memory delta per iteration (in kilobytes)
- **deltaPercent**: Percentage increase in heap usage
- **heapUsedBeforeMB/AfterMB**: Memory in megabytes (for readability)

### Example Memory Output

```
💾 Memory Benchmarks

🟢 IMPROVED deep-watch:Deep watch overhead
   Delta: 142.4397 → 135.2000 KB/iteration
   Delta %: 5.29% → 4.95%
   Memory: 262.84 → 260.12 MB (before)
           276.75 → 272.45 MB (after)
   -5.08% less memory per operation
```

### Interpreting Memory Results

**Lower is better:**
- 🟢 **IMPROVED**: Less memory used per operation
- 🔴 **REGRESSION**: More memory used per operation
- ⚪ **UNCHANGED**: Similar memory usage

**Memory benchmarks included:**
- `memory.profile.test.ts` - Memory profiling tests
- Deep watch memory overhead
- Object creation memory
- Effect lifecycle memory

## Troubleshooting

**No results found?**
- Make sure profiling tests use `console.log()` for output
- Check that tests are running successfully

**Results inconsistent?**
- Run multiple times to check variance
- Ensure same Node.js version
- Check for background processes affecting performance

**Missing benchmarks?**
- Verify benchmarks directory exists
- Check file permissions
- Ensure JSON files are valid

