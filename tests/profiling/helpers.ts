// import { performance, PerformanceObserver } from 'perf_hooks'
const performance = globalThis.performance 
const process = globalThis.process || { memoryUsage: () => ({ heapUsed: 0, heapTotal: 0 }) } // @ts-ignore
import { reactiveOptions } from 'mutts'

// Force production settings for accurate profiling
reactiveOptions.cycleHandling = 'none'
reactiveOptions.introspection.enableHistory = false
reactiveOptions.maxDeepWatchDepth = 1000 // Allow deep structures in benchmarks

/**
 * Result of a profiling measurement
 */
export interface ProfileResult {
	/** Name of the benchmark */
	name: string
	/** Average time per operation in milliseconds */
	avgTime: number
	/** Total time for all iterations in milliseconds */
	totalTime: number
	/** Number of iterations performed */
	iterations: number
	/** Operations per second */
	opsPerSec: number
	/** Minimum time for a single operation in milliseconds */
	minTime: number
	/** Maximum time for a single operation in milliseconds */
	maxTime: number
}

/**
 * Options for profiling operations
 */
export interface ProfileOptions {
	/** Number of iterations to run (default: 100000) */
	iterations?: number
	/** Warmup iterations before profiling (default: 1000) */
	warmup?: number
	/** Whether to run GC between warmup and actual test (default: true) */
	gcBetween?: boolean
	/** Custom name for the benchmark */
	name?: string
}

/**
 * Profiles a synchronous operation multiple times and returns statistics
 */
export function profileSync<T>(
	fn: () => T,
	options: ProfileOptions = {}
): ProfileResult {
	const {
		iterations = 100000,
		warmup = 1000,
		gcBetween = true,
		name = 'operation',
	} = options

	// Warmup phase
	for (let i = 0; i < warmup; i++) {
		fn()
	}

	// Optional GC before actual measurement
	if (gcBetween && global.gc) {
		global.gc()
	}

	// Actual profiling
	const times: number[] = []
	const startTotal = performance.now()

	for (let i = 0; i < iterations; i++) {
		const start = performance.now()
		fn()
		const end = performance.now()
		times.push(end - start)
	}

	const endTotal = performance.now()
	const totalTime = endTotal - startTotal

	// Use loops instead of spread to avoid stack overflow with large arrays
	let minTime = times[0]!
	let maxTime = times[0]!
	for (let i = 1; i < times.length; i++) {
		if (times[i]! < minTime) minTime = times[i]!
		if (times[i]! > maxTime) maxTime = times[i]!
	}
	const avgTime = totalTime / iterations
	const opsPerSec = (iterations / totalTime) * 1000

	return {
		name,
		avgTime,
		totalTime,
		iterations,
		opsPerSec,
		minTime,
		maxTime,
	}
}

/**
 * Profiles an async operation multiple times
 */
export async function profileAsync<T>(
	fn: () => Promise<T>,
	options: ProfileOptions = {}
): Promise<ProfileResult> {
	const {
		iterations = 10000,
		warmup = 100,
		gcBetween = true,
		name = 'async-operation',
	} = options

	// Warmup phase
	for (let i = 0; i < warmup; i++) {
		await fn()
	}

	// Optional GC before actual measurement
	if (gcBetween && global.gc) {
		global.gc()
	}

	// Actual profiling
	const times: number[] = []
	const startTotal = performance.now()

	for (let i = 0; i < iterations; i++) {
		const start = performance.now()
		await fn()
		const end = performance.now()
		times.push(end - start)
	}

	const endTotal = performance.now()
	const totalTime = endTotal - startTotal

	// Use loops instead of spread to avoid stack overflow with large arrays
	let minTime = times[0]!
	let maxTime = times[0]!
	for (let i = 1; i < times.length; i++) {
		if (times[i]! < minTime) minTime = times[i]!
		if (times[i]! > maxTime) maxTime = times[i]!
	}
	const avgTime = totalTime / iterations
	const opsPerSec = (iterations / totalTime) * 1000

	return {
		name,
		avgTime,
		totalTime,
		iterations,
		opsPerSec,
		minTime,
		maxTime,
	}
}

/**
 * Compares multiple operations and returns comparison results
 */
export function compareProfiles(
	results: ProfileResult[]
): {
	results: ProfileResult[]
	fastest: ProfileResult
	slowest: ProfileResult
	comparison: Array<{
		name: string
		vs: string
		timesFaster: number
		timeDiff: number
	}>
} {
	const sorted = [...results].sort((a, b) => a.avgTime - b.avgTime)
	const fastest = sorted[0]
	const slowest = sorted[sorted.length - 1]

	const comparison: Array<{
		name: string
		vs: string
		timesFaster: number
		timeDiff: number
	}> = []

	for (let i = 0; i < results.length; i++) {
		for (let j = i + 1; j < results.length; j++) {
			const a = results[i]
			const b = results[j]
			const faster = a.avgTime < b.avgTime ? a : b
			const slower = a.avgTime < b.avgTime ? b : a
			const timesFaster = slower.avgTime / faster.avgTime
			const timeDiff = Math.abs(a.avgTime - b.avgTime)

			comparison.push({
				name: faster.name,
				vs: slower.name,
				timesFaster,
				timeDiff,
			})
		}
	}

	return {
		results: sorted,
		fastest,
		slowest,
		comparison,
	}
}

/**
 * Formats a ProfileResult for console output
 */
export function formatProfileResult(result: ProfileResult): string {
	// Output in parseable format for benchmark tool
	const jsonData = JSON.stringify({
		name: result.name,
		avgTime: result.avgTime,
		opsPerSec: result.opsPerSec,
		minTime: result.minTime,
		maxTime: result.maxTime,
		iterations: result.iterations,
		totalTime: result.totalTime,
	})
	
	console.log(`BENCHMARK:${jsonData}`)
	
	return `
${result.name}:
  Iterations: ${result.iterations.toLocaleString()}
  Total time: ${result.totalTime.toFixed(2)}ms
  Average: ${result.avgTime.toFixed(6)}ms/op
  Min: ${result.minTime.toFixed(6)}ms
  Max: ${result.maxTime.toFixed(6)}ms
  Throughput: ${result.opsPerSec.toLocaleString()} ops/sec
`.trim()
}

/**
 * Formats comparison results for console output
 */
export function formatComparison(
	comparison: ReturnType<typeof compareProfiles>
): string {
	let output = '=== Profile Comparison ===\n\n'
	output += 'Results (sorted by speed):\n'
	for (const result of comparison.results) {
		output += formatProfileResult(result) + '\n\n'
	}
	output += `Fastest: ${comparison.fastest.name}\n`
	output += `Slowest: ${comparison.slowest.name}\n\n`
	output += 'Comparisons:\n'
	for (const comp of comparison.comparison) {
		output += `  ${comp.name} is ${comp.timesFaster.toFixed(2)}x faster than ${comp.vs} (${comp.timeDiff.toFixed(6)}ms difference)\n`
	}
	return output
}

/**
 * Measures memory usage before and after an operation
 */
export interface MemoryProfile {
	heapUsedBefore: number
	heapUsedAfter: number
	heapTotalBefore: number
	heapTotalAfter: number
	delta: number
	deltaPercent: number
}

export function profileMemory(
	fn: () => void,
	options: { iterations?: number; gcBetween?: boolean } = {}
): MemoryProfile {
	const { iterations = 1000, gcBetween = true } = options

	if (gcBetween && global.gc) {
		global.gc()
	}

	const before = process.memoryUsage()
	for (let i = 0; i < iterations; i++) {
		fn()
	}
	const after = process.memoryUsage()

	const heapUsedDelta = after.heapUsed - before.heapUsed
	const heapTotalDelta = after.heapTotal - before.heapTotal
	const delta = heapUsedDelta / iterations
	const deltaPercent = (heapUsedDelta / before.heapUsed) * 100

	return {
		heapUsedBefore: before.heapUsed,
		heapUsedAfter: after.heapUsed,
		heapTotalBefore: before.heapTotal,
		heapTotalAfter: after.heapTotal,
		delta,
		deltaPercent,
	}
}

/**
 * Memory usage formatter
 */
export function formatMemoryProfile(profile: MemoryProfile, name?: string): string {
	// Output in parseable format for benchmark tool
	const jsonData = JSON.stringify({
		type: 'memory',
		name: name || 'Memory profile',
		heapUsedBefore: profile.heapUsedBefore,
		heapUsedAfter: profile.heapUsedAfter,
		heapTotalBefore: profile.heapTotalBefore,
		heapTotalAfter: profile.heapTotalAfter,
		delta: profile.delta,
		deltaPercent: profile.deltaPercent,
		deltaKB: profile.delta / 1024,
		heapUsedBeforeMB: profile.heapUsedBefore / 1024 / 1024,
		heapUsedAfterMB: profile.heapUsedAfter / 1024 / 1024,
	})
	
	console.log(`BENCHMARK:${jsonData}`)
	
	return `
Memory Profile${name ? `: ${name}` : ''}:
  Before: ${(profile.heapUsedBefore / 1024 / 1024).toFixed(2)} MB
  After: ${(profile.heapUsedAfter / 1024 / 1024).toFixed(2)} MB
  Delta: ${(profile.delta / 1024).toFixed(4)} KB/iteration
  Delta %: ${profile.deltaPercent.toFixed(2)}%
`.trim()
}

