#!/usr/bin/env node
/**
 * Benchmark runner and comparison tool
 * 
 * Usage:
 *   npm run benchmark:save <name>    - Save current profiling results
 *   npm run benchmark:compare <name> - Compare against saved baseline
 *   npm run benchmark:list            - List saved benchmarks
 */

import { execSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'

const BENCHMARKS_DIR = join(process.cwd(), 'benchmarks')

interface BenchmarkResult {
	name: string
	timestamp: string
	gitHash?: string
	results: Record<string, {
		test: string
		name: string
		avgTime: number
		opsPerSec: number
		minTime: number
		maxTime: number
		iterations: number
	}>
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

function parseJestOutput(output: string): BenchmarkResult['results'] {
	const results: BenchmarkResult['results'] = {}
	const lines = output.split('\n')
	
	let currentTest = ''
	
	for (const line of lines) {
		// Extract test suite name
		const testMatch = line.match(/PASS tests\/profiling\/(\w+)\.profile\.test\.ts/)
		if (testMatch) {
			currentTest = testMatch[1]!
		}
		
		// Extract benchmark results from BENCHMARK: prefix
		const benchMatch = line.match(/BENCHMARK:(.+)/)
		if (benchMatch) {
			try {
				const data = JSON.parse(benchMatch[1]!)
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
			} catch (e) {
				// Ignore parse errors
			}
		}
	}
	
	return results
}

function saveBenchmark(name: string) {
	ensureBenchmarksDir()
	
	console.log('Running profiling tests...')
	const output = execSync('npm run test:profile 2>&1', { encoding: 'utf-8' })
	
	const results = parseJestOutput(output)
	
	if (Object.keys(results).length === 0) {
		console.error('No benchmark results found. Make sure profiling tests output results to console.log')
		process.exit(1)
	}
	
	const benchmark: BenchmarkResult = {
		name,
		timestamp: new Date().toISOString(),
		gitHash: getGitHash(),
		results,
	}
	
	const filePath = join(BENCHMARKS_DIR, `${name}.json`)
	writeFileSync(filePath, JSON.stringify(benchmark, null, 2))
	
	console.log(`\n✅ Saved benchmark: ${name}`)
	console.log(`   File: ${filePath}`)
	console.log(`   Results: ${Object.keys(results).length} benchmarks`)
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
	console.log(`Summary: 🟢 ${improved} improved | 🔴 ${regressed} regressed | ⚪ ${unchanged} unchanged`)
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
		console.log(`    Tests: ${Object.keys(bench.results).length} benchmarks`)
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
	const output = execSync('npm run test:profile 2>&1', { encoding: 'utf-8' })
	const currentResults = parseJestOutput(output)
	
	const current: BenchmarkResult = {
		name: 'current',
		timestamp: new Date().toISOString(),
		gitHash: getGitHash(),
		results: currentResults,
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

