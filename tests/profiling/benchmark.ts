#!/usr/bin/env node
/**
 * Benchmark runner and comparison tool
 * 
 * Usage:
 *   npm run benchmark:save <name>    - Save current profiling results
 *   npm run benchmark:compare <name> - Compare against saved baseline
 *   npm run benchmark:list            - List saved benchmarks
 */
// TODO: Benchmarking should be done in specific conditions - set the options as "production" (no cycle detection, etc.)
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'

const BENCHMARKS_DIR = join(process.cwd(), 'benchmarks')

interface PerformanceResult {
	test: string
	name: string
	avgTime: number
	opsPerSec: number
	minTime: number
	maxTime: number
	iterations: number
}

interface MemoryResult {
	test: string
	name: string
	heapUsedBefore: number
	heapUsedAfter: number
	delta: number
	deltaPercent: number
	deltaKB: number
	heapUsedBeforeMB: number
	heapUsedAfterMB: number
}

interface BenchmarkResult {
	name: string
	timestamp: string
	gitHash?: string
	results: Record<string, PerformanceResult>
	memory: Record<string, MemoryResult>
}

function ensureBenchmarksDir() {
	if (!existsSync(BENCHMARKS_DIR)) {
		mkdirSync(BENCHMARKS_DIR, { recursive: true })
	}
}

function getGitHash(): string | undefined {
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
	} catch {
		return undefined
	}
}

function parseJestOutput(output: string): {
	results: BenchmarkResult['results']
	memory: BenchmarkResult['memory']
} {
	const results: BenchmarkResult['results'] = {}
	const memory: BenchmarkResult['memory'] = {}
	const lines = output.split('\n')
	
	let currentTest = ''
	
	for (const line of lines) {
		// Extract test suite name
		const testMatch = line.match(/PASS tests\/profiling\/(\w+)\.profile\.test\.ts/)
		if (testMatch) {
			currentTest = testMatch[1]!
		}
		
		// Extract benchmark results from BENCHMARK: prefix
		// Match the pattern: BENCHMARK: followed by JSON (may span multiple parts in console output)
		if (line.includes('BENCHMARK:')) {
			try {
				// Extract JSON part after BENCHMARK:
				const jsonStart = line.indexOf('BENCHMARK:') + 'BENCHMARK:'.length
				let jsonStr = line.substring(jsonStart).trim()
				
				// Try to parse, might need to reconstruct if split across lines
				let data
				try {
					data = JSON.parse(jsonStr)
				} catch {
					// Might be partial, try to find complete JSON by looking for balanced braces
					let braceCount = 0
					let endIdx = 0
					for (let i = 0; i < jsonStr.length; i++) {
						if (jsonStr[i] === '{') braceCount++
						if (jsonStr[i] === '}') braceCount--
						if (braceCount === 0 && i > 0) {
							endIdx = i + 1
							break
						}
					}
					if (endIdx > 0) {
						data = JSON.parse(jsonStr.substring(0, endIdx))
					} else {
						continue // Skip if we can't parse
					}
				}
				
				if (data.type === 'memory') {
					// Memory benchmark
					const key = `${currentTest}:${data.name}`
					memory[key] = {
						test: currentTest,
						name: data.name,
						heapUsedBefore: data.heapUsedBefore,
						heapUsedAfter: data.heapUsedAfter,
						delta: data.delta,
						deltaPercent: data.deltaPercent,
						deltaKB: data.deltaKB,
						heapUsedBeforeMB: data.heapUsedBeforeMB,
						heapUsedAfterMB: data.heapUsedAfterMB,
					}
				} else if (data.name && typeof data.avgTime === 'number') {
					// Performance benchmark
					const key = `${currentTest}:${data.name}`
					results[key] = {
						test: currentTest,
						name: data.name,
						avgTime: data.avgTime,
						opsPerSec: data.opsPerSec,
						minTime: data.minTime,
						maxTime: data.maxTime,
						iterations: data.iterations,
					}
				}
			} catch (e) {
				// Ignore parse errors - might be partial JSON or malformed
			}
		}
	}
	
	return { results, memory }
}

function saveBenchmark(name: string) {
	ensureBenchmarksDir()
	
	console.log('Running profiling tests...')
	// Capture both stdout and stderr - Jest outputs console.log to stderr
	// Note: Jest may exit with non-zero if tests fail, but we still want the output
	let output = ''
	try {
		output = execSync('npm run test:profile 2>&1', { encoding: 'utf-8' })
	} catch (e: any) {
		// Jest may exit with error code, but output is still captured
		output = e.stdout?.toString() || e.stderr?.toString() || e.message || ''
	}
	
	const { results, memory } = parseJestOutput(output)
	
	if (Object.keys(results).length === 0 && Object.keys(memory).length === 0) {
		console.error('No benchmark results found. Make sure profiling tests output results to console.log')
		process.exit(1)
	}
	
	const benchmark: BenchmarkResult = {
		name,
		timestamp: new Date().toISOString(),
		gitHash: getGitHash(),
		results,
		memory,
	}
	
	const filePath = join(BENCHMARKS_DIR, `${name}.json`)
	writeFileSync(filePath, JSON.stringify(benchmark, null, 2))
	
	console.log(`\n✅ Saved benchmark: ${name}`)
	console.log(`   File: ${filePath}`)
	console.log(`   Performance: ${Object.keys(results).length} benchmarks`)
	console.log(`   Memory: ${Object.keys(memory).length} benchmarks`)
	console.log(`   Git hash: ${benchmark.gitHash || 'N/A'}`)
}

function loadBenchmark(name: string): BenchmarkResult {
	const filePath = join(BENCHMARKS_DIR, `${name}.json`)
	if (!existsSync(filePath)) {
		console.error(`Benchmark "${name}" not found`)
		process.exit(1)
	}
	
	return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function compareBenchmarks(baseline: BenchmarkResult, current: BenchmarkResult) {
	console.log('\n📊 Benchmark Comparison\n')
	console.log(`Baseline: ${baseline.name} (${baseline.timestamp})`)
	console.log(`Current:  ${current.name || 'Current run'} (${current.timestamp})`)
	console.log(`Git:      ${baseline.gitHash} → ${current.gitHash || 'current'}\n`)
	console.log('='.repeat(80))
	
	const allKeys = new Set([...Object.keys(baseline.results), ...Object.keys(current.results)])
	const sortedKeys = Array.from(allKeys).sort()
	
	let improved = 0
	let regressed = 0
	let unchanged = 0
	
	for (const key of sortedKeys) {
		const base = baseline.results[key]
		const curr = current.results[key]
		
		if (!base) {
			console.log(`\n🆕 NEW: ${key}`)
			if (curr) {
				console.log(`   ${curr.avgTime.toFixed(6)}ms/op (${curr.opsPerSec.toLocaleString()} ops/sec)`)
			}
			continue
		}
		
		if (!curr) {
			console.log(`\n❌ REMOVED: ${key}`)
			console.log(`   Was: ${base.avgTime.toFixed(6)}ms/op`)
			continue
		}
		
		const diff = curr.avgTime - base.avgTime
		const diffPercent = ((diff / base.avgTime) * 100).toFixed(2)
		const speedup = (base.avgTime / curr.avgTime).toFixed(2)
		
		const status = diff > 0.00001 ? '🔴 REGRESSION' : diff < -0.00001 ? '🟢 IMPROVED' : '⚪ UNCHANGED'
		
		if (diff > 0.00001) regressed++
		else if (diff < -0.00001) improved++
		else unchanged++
		
		console.log(`\n${status} ${key}`)
		console.log(`   ${base.avgTime.toFixed(6)}ms → ${curr.avgTime.toFixed(6)}ms (${diffPercent}%)`)
		console.log(`   ${base.opsPerSec.toLocaleString()} → ${curr.opsPerSec.toLocaleString()} ops/sec`)
		if (Math.abs(diff) > 0.00001) {
			console.log(`   ${speedup}x ${diff > 0 ? 'slower' : 'faster'}`)
		}
	}
	
	console.log('\n' + '='.repeat(80))
	console.log(`Performance Summary: 🟢 ${improved} improved | 🔴 ${regressed} regressed | ⚪ ${unchanged} unchanged`)
	
	// Compare memory benchmarks
	const allMemoryKeys = new Set([...Object.keys(baseline.memory || {}), ...Object.keys(current.memory || {})])
	if (allMemoryKeys.size > 0) {
		console.log('\n' + '='.repeat(80))
		console.log('\n💾 Memory Benchmarks\n')
		
		const sortedMemoryKeys = Array.from(allMemoryKeys).sort()
		let memoryImproved = 0
		let memoryRegressed = 0
		let memoryUnchanged = 0
		
		for (const key of sortedMemoryKeys) {
			const base = baseline.memory?.[key]
			const curr = current.memory?.[key]
			
			if (!base) {
				console.log(`\n🆕 NEW: ${key}`)
				if (curr) {
					console.log(`   ${curr.deltaKB.toFixed(4)} KB/iteration (${curr.deltaPercent.toFixed(2)}%)`)
					console.log(`   ${curr.heapUsedBeforeMB.toFixed(2)} → ${curr.heapUsedAfterMB.toFixed(2)} MB`)
				}
				continue
			}
			
			if (!curr) {
				console.log(`\n❌ REMOVED: ${key}`)
				console.log(`   Was: ${base.deltaKB.toFixed(4)} KB/iteration`)
				continue
			}
			
			const deltaDiff = curr.delta - base.delta
			const deltaPercentDiff = curr.deltaPercent - base.deltaPercent
			
			// Lower delta is better (less memory per operation)
			const status = deltaDiff > 0.1 ? '🔴 REGRESSION' : deltaDiff < -0.1 ? '🟢 IMPROVED' : '⚪ UNCHANGED'
			
			if (deltaDiff > 0.1) memoryRegressed++
			else if (deltaDiff < -0.1) memoryImproved++
			else memoryUnchanged++
			
			console.log(`\n${status} ${key}`)
			console.log(`   Delta: ${base.deltaKB.toFixed(4)} → ${curr.deltaKB.toFixed(4)} KB/iteration`)
			console.log(`   Delta %: ${base.deltaPercent.toFixed(2)}% → ${curr.deltaPercent.toFixed(2)}%`)
			console.log(`   Memory: ${base.heapUsedBeforeMB.toFixed(2)} → ${curr.heapUsedBeforeMB.toFixed(2)} MB (before)`)
			console.log(`           ${base.heapUsedAfterMB.toFixed(2)} → ${curr.heapUsedAfterMB.toFixed(2)} MB (after)`)
			if (Math.abs(deltaDiff) > 0.1) {
				const improvement = ((base.delta - curr.delta) / base.delta * 100).toFixed(2)
				console.log(`   ${deltaDiff > 0 ? '+' : ''}${improvement}% ${deltaDiff > 0 ? 'more' : 'less'} memory per operation`)
			}
		}
		
		console.log('\n' + '='.repeat(80))
		console.log(`Memory Summary: 🟢 ${memoryImproved} improved | 🔴 ${memoryRegressed} regressed | ⚪ ${memoryUnchanged} unchanged`)
	}
}

function listBenchmarks() {
	ensureBenchmarksDir()
	
	const files = readdirSync(BENCHMARKS_DIR)
		.filter(f => f.endsWith('.json'))
		.map(f => {
			const filePath = join(BENCHMARKS_DIR, f)
			const content = JSON.parse(readFileSync(filePath, 'utf-8'))
			return {
				name: f.replace('.json', ''),
				...content,
			}
		})
		.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
	
	if (files.length === 0) {
		console.log('No saved benchmarks found.')
		return
	}
	
	console.log('\n📋 Saved Benchmarks\n')
	for (const bench of files) {
		console.log(`  ${bench.name}`)
		console.log(`    Date: ${new Date(bench.timestamp).toLocaleString()}`)
		console.log(`    Git:  ${bench.gitHash || 'N/A'}`)
		console.log(`    Performance: ${Object.keys(bench.results || {}).length} benchmarks`)
		console.log(`    Memory: ${Object.keys(bench.memory || {}).length} benchmarks`)
		console.log()
	}
}

// CLI handling
const command = process.argv[2]
const name = process.argv[3]

if (command === 'save') {
	if (!name) {
		console.error('Usage: npm run benchmark:save <name>')
		process.exit(1)
	}
	saveBenchmark(name)
} else if (command === 'compare') {
	if (!name) {
		console.error('Usage: npm run benchmark:compare <baseline-name>')
		process.exit(1)
	}
	
	const baseline = loadBenchmark(name)
	
	console.log('Running current profiling tests...')
	// Capture both stdout and stderr - Jest outputs console.log to stderr
	// Note: Jest may exit with non-zero if tests fail, but we still want the output
	let output = ''
	try {
		output = execSync('npm run test:profile 2>&1', { encoding: 'utf-8' })
	} catch (e: any) {
		// Jest may exit with error code, but output is still captured
		output = e.stdout?.toString() || e.stderr?.toString() || e.message || ''
	}
	const { results: currentResults, memory: currentMemory } = parseJestOutput(output)
	
	const current: BenchmarkResult = {
		name: 'current',
		timestamp: new Date().toISOString(),
		gitHash: getGitHash(),
		results: currentResults,
		memory: currentMemory,
	}
	
	compareBenchmarks(baseline, current)
} else if (command === 'list') {
	listBenchmarks()
} else {
	console.log('Benchmark Tool')
	console.log('\nCommands:')
	console.log('  npm run benchmark:save <name>    - Save current profiling results')
	console.log('  npm run benchmark:compare <name> - Compare against saved baseline')
	console.log('  npm run benchmark:list           - List saved benchmarks')
	process.exit(1)
}

