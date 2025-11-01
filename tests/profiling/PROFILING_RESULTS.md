# Understanding Profiling Results

This guide explains how to read and interpret the output from profiling tests.

## Standard Profiling Output

When you run `npm run test:profile`, you'll see console output with performance metrics. Here's how to interpret them:

### Profile Result Format

```
Plain object access:
  Iterations: 1,000,000
  Total time: 64.50ms
  Average: 0.000064ms/op
  Min: 0.000045ms
  Max: 0.045121ms
  Throughput: 15,503,876 ops/sec
```

### Key Metrics Explained

1. **Iterations**: Number of times the operation was executed
   - Higher = more reliable average, but takes longer
   - Typical: 10,000 - 1,000,000 depending on operation speed

2. **Total time**: Wall-clock time for all iterations
   - Use this to see if a test is taking too long
   - Watch for tests that take > 10 seconds

3. **Average (avgTime)**: Average time per operation in milliseconds
   - **Most important metric** - this is what you compare
   - Lower is better
   - Expressed as `ms/op` (milliseconds per operation)

4. **Min/Max time**: Range of operation times
   - **Min**: Best-case performance (often close to plain JS)
   - **Max**: Worst-case performance (may show outliers)
   - Large gap indicates inconsistent performance

5. **Throughput (opsPerSec)**: Operations per second
   - Higher is better
   - Good for understanding scale (e.g., "can handle 100k ops/sec")
   - Formula: `(iterations / totalTime) * 1000`

### Comparison Output

```
=== Profile Comparison ===

Plain object access is 23.81x faster than Reactive object access (0.001460ms difference)
```

**What this means:**
- Reactive operations are **23.81x slower** than plain operations
- This is **expected** - proxies + dependency tracking have overhead
- The difference is **0.001460ms** per operation

### Interpreting Overhead

**Typical overhead ranges:**

| Operation Type | Expected Overhead | Acceptable Range |
|---------------|-------------------|------------------|
| Property access | 10-30x | < 50x |
| Property writes | 15-40x | < 60x |
| Object creation (cached) | 1-3x | < 5x |
| Effect dispatch | 100-500 ops/sec | > 50 ops/sec |
| Deep watch traversal | 1-5ms per object | < 10ms |

**Red flags:**
- Overhead > 100x for simple operations
- Throughput < 10 ops/sec
- Tests taking > 30 seconds

### Reading Comparison Tables

```
Results (sorted by speed):
  Plain object access: 0.000064ms/op
  Reactive object access: 0.001524ms/op

Fastest: Plain object access
Slowest: Reactive object access
```

- Results are sorted from fastest to slowest
- Compare relative performance
- Look for unexpected gaps (e.g., 2x difference when expecting similar)

## Detailed Profiling (CPU Profile)

When you run `npm run test:profile:detailed`, it generates CPU profile files.

### Generated Files

- `isolate-*.log` - Binary CPU profile files
- Created in the project root

### Processing Profiles

```bash
# Process the profile
node --prof-process isolate-*.log > profile.txt

# Or use clinic.js for better visualization
npm install -g clinic
clinic doctor -- node --expose-gc node_modules/.bin/jest --testPathPatterns=profiling
```

### Reading CPU Profile Output

The profile shows:
1. **Function names** - Which functions are called
2. **Ticks** - CPU time spent in each function
3. **Percentage** - % of total CPU time

**What to look for:**
- Functions with high tick counts = hot paths
- Functions with high percentages = bottlenecks
- Functions you don't recognize = potential issues

### Example Profile Section

```
 [JavaScript]:
   ticks  total  nonlib   name
    123    5.2%    5.3%  dependant
     98    4.1%    4.2%  reactiveObject
     76    3.2%    3.3%  touched
```

**Interpretation:**
- `dependant()` uses 5.2% of CPU time - optimization target
- `reactiveObject()` uses 4.1% - also a candidate
- `touched()` uses 3.2% - less critical

## Performance Targets

Based on current measurements:

### Property Access
- **Plain**: ~0.000064ms (15M ops/sec) ✅
- **Reactive**: ~0.001524ms (656k ops/sec) ✅
- **Target**: Keep reactive < 0.002ms per access

### Effect Operations
- **Create effect**: ~0.01ms ✅
- **Effect dispatch**: ~0.009ms ✅
- **Target**: < 0.02ms per effect operation

### Memory Usage
- **Deep watch overhead**: < 50% increase ✅
- **Target**: Keep memory overhead < 100%

## Regression Detection

### Comparing Before/After

1. **Run profiling before changes:**
   ```bash
   npm run test:profile > before.txt
   ```

2. **Make optimization changes**

3. **Run profiling after changes:**
   ```bash
   npm run test:profile > after.txt
   ```

4. **Compare key metrics:**
   - Look at `avgTime` changes
   - Watch for overhead increases
   - Check if throughput improved

### Regression Thresholds

Consider it a regression if:
- Overhead increases by > 10x
- Throughput decreases by > 50%
- Test execution time doubles

## Tips for Reading Results

1. **Focus on `avgTime`** - Most reliable metric
2. **Ignore outliers** - Min/Max can be affected by GC pauses
3. **Compare relative, not absolute** - 2x difference is meaningful
4. **Watch for patterns** - Consistent overhead is better than variable
5. **Use multiple runs** - Performance can vary, run 2-3 times
6. **Check console warnings** - Jest may report timing issues

## Common Patterns

### Good Performance Profile
```
Average: 0.001ms/op
Min: 0.0008ms
Max: 0.003ms
Throughput: 1,000,000 ops/sec
```
- Tight min/max range = consistent
- High throughput = scalable

### Problematic Profile
```
Average: 0.050ms/op
Min: 0.001ms
Max: 0.500ms
Throughput: 20,000 ops/sec
```
- Large min/max gap = inconsistent
- Low throughput = bottleneck
- High average = needs optimization

### Memory Profile
```
Memory Profile:
  Before: 157.20 MB
  After: 170.99 MB
  Delta: 141.25 KB/iteration
  Delta %: 8.78%
```
- Delta % < 50% = reasonable ✅
- Delta % > 100% = memory leak possible ⚠️
- Delta KB/iteration = per-operation cost

## Next Steps

After identifying bottlenecks:

1. **Review optimization opportunities** (see PROFILING.md)
2. **Focus on high-tick functions** from CPU profiles
3. **Measure impact** of changes with before/after comparison
4. **Monitor regressions** by keeping performance baselines

