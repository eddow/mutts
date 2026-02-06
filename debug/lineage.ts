import { getActiveEffect } from '../src/reactive/effect-context'
import { effectCreationStacks } from '../src/reactive/effects'
import { effectParent, getRoot } from '../src/reactive/registry'
import { type EffectTrigger } from '../src/reactive/types'

export const effectMarker ={
	enter: 'effect:enter',
	leave: 'effect:leave'
}

/**
 * Structured stack frame
 */
export interface StackFrame {
	functionName: string
	fileName: string
	lineNumber: number
	columnNumber: number
	raw: string
}

/**
 * Parses a single stack line into a structured frame.
 * @param line - A line from Error.stack
 */
export function parseStackLine(line: string): StackFrame | null {
	// Node.js format: "    at functionName (file:line:column)"
	// or "    at file:line:column"
	const nodeMatch = line.match(/^\s*at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?$/)
	
	// Browser format (Firefox/Safari): "functionName@file:line:column" or "file:line:column"
	// Chrome/Edge use Node-like format but without "at" sometimes or with different prefixes
	const browserMatch = line.match(/(?:(.+?)(?:\@|\(?))?(?:(.+?):(\d+):(\d+))(?:\@|\)?)$/)

	const match = nodeMatch || browserMatch
	if (!match) return null

	const [, functionName = 'anonymous', fileName, lineNumber, columnNumber] = match

	return {
		functionName: functionName.trim(),
		fileName,
		lineNumber: parseInt(lineNumber, 10),
		columnNumber: parseInt(columnNumber, 10),
		raw: line.trim(),
	}
}

let internalFile: string | undefined

/**
 * Gets the current call stack
 * @param skipFrames - Number of frames to skip
 * @param error - Optional error to use as source of stack
 */
export function getStackFrame(error = new Error()): StackFrame[] {
	if (!error.stack) return []

	const lines = error.stack.split('\n')

	const lastLine = lines.findIndex((line) => line.includes(effectMarker.enter))
	if (lastLine !== -1) lines.splice(lastLine)
	const firstLine = lines.findLastIndex((line) => line.includes(effectMarker.leave))
	if (firstLine !== -1) lines.splice(0, firstLine+1)
	else {
		// Dynamically identify the library's internal files if not already done
		if (!internalFile && lines[1]) {
			const selfFrame = parseStackLine(lines[1])
			if (selfFrame) {
				internalFile = selfFrame.fileName
			}
		}

		// Skip "Error" line and requested frames
		const frames: StackFrame[] = []

		// Determine the "base" directory of the library to skip other internal files
		// We look for "src" or "dist" to be more specific than just the project root
		const srcIndex = internalFile ? internalFile.lastIndexOf('/src/') : -1
		const distIndex = internalFile ? internalFile.lastIndexOf('/dist/') : -1
		const libraryBase = internalFile ? (
			srcIndex !== -1 ? internalFile.substring(0, srcIndex + 5) : 
			(distIndex !== -1 ? internalFile.substring(0, distIndex + 6) : 
			internalFile.substring(0, internalFile.lastIndexOf('/') + 1))
		) : undefined
		let l
		for (l = 1; l < lines.length; l++) {
			const frame = parseStackLine(lines[l])
			if (!frame) continue

			// Robust skipping: if we are still in the internal area, skip it.
			const isInternal = /Lineage$/.test(frame.functionName) ||
				[`getStackFrame`, `captureLineage`].includes(frame.functionName)

			if (!isInternal) break
		}
		lines.splice(0, l)
	}

	return lines.map(parseStackLine).filter(Boolean)
}

/**
 * Represents a segment in the effect lineage
 */
export interface LineageSegment {
	effectName: string
	stack: StackFrame[]
}

/**
 * Traces the lineage of the current execution through nested effects
 * @param effect - Starting effect (defaults to active effect)
 */
export function getLineage(effect?: EffectTrigger): LineageSegment[] {
	const currentEffect = effect ?? getActiveEffect()
	const currentStack = getStackFrame() // Robustly skips internal mutts frames
	const segments: LineageSegment[] = []

	if (!currentEffect) {
		segments.push({
			effectName: 'root',
			stack: filterNodeModules(currentStack),
		})
		return segments
	}

	let current: EffectTrigger | undefined = currentEffect
	let lastStack = currentStack

	while (current) {
		const rootFn = getRoot(current)
		if(!rootFn.name) debugger
		const effectName = rootFn.name || 'anonymous'
		
		// Find where this effect starts in the current stack
		// This is tricky because the stack might have internal "runEffect" frames
		// We look for the first frame that might be the effect function itself
		let effectEntryIndex = -1
		const filteredStack = filterNodeModules(lastStack)
		for (let i = 0; i < filteredStack.length; i++) {
			// We compare function names. Not perfect but often works.
			if (filteredStack[i].functionName === effectMarker.enter) {
				effectEntryIndex = i-1
				break
			}
		}

		if (effectEntryIndex !== -1) {
			segments.push({
				effectName,
				stack: filteredStack.slice(0, effectEntryIndex + 1),
			})
		} else {
			// If we can't find the entry point, just take the whole stack segment
			segments.push({
				effectName,
				stack: filteredStack,
			})
		}

		// Move to parent
		const parent = effectParent.get(current)
		const creationStack = effectCreationStacks.get(rootFn)
		
		if (parent) {
			current = parent
			lastStack = creationStack ?? []
		} else if (creationStack) {
			segments.push({
				effectName: 'root',
				stack: filterNodeModules(creationStack),
			})
			break
		} else {
			break
		}
	}

	return segments
}
/**
 * Filters out node_modules frames and groups them
 * @param frames - Array of stack frames
 */
function filterNodeModules(frames: StackFrame[]): StackFrame[] {
	const result: StackFrame[] = []
	let inNodeModules = false
	
	for (const frame of frames) {
		const isNodeModule = frame.fileName.includes('/node_modules/')
		
		if (isNodeModule && !inNodeModules) {
			// Start of node_modules block
			inNodeModules = true
			result.push({
				functionName: '...node_modules...',
				fileName: '[filtered]',
				lineNumber: 0,
				columnNumber: 0,
				raw: '    at ...node_modules...'
			})
		} else if (!isNodeModule && inNodeModules) {
			// End of node_modules block
			inNodeModules = false
			result.push(frame)
		} else if (!isNodeModule) {
			// Regular frame
			result.push(frame)
		}
		// Skip frames inside node_modules
	}
	
	return result
}

/**
 * Formats lineage segments into a single stack-like string
 * @param segments - Lineage segments
 */
export function formatLineage(segments: LineageSegment[]): string {
	const result: string[] = []
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		if (i > 0) {
			result.push(` --- effect: ${segments[i - 1].effectName} ---`)
		}
		for (const frame of segment.stack) {
			result.push(`    ${frame.raw}`)
		}
	}
	return result.join('\n')
}

/**
 * Formats lineage segments for Node.js console output with colors and styling
 * @param segments - Lineage segments
 */
export function nodeLineage(segments: LineageSegment[]): string {
	// ANSI color codes for Node.js terminal
	const colors = {
		reset: '\x1b[0m',
		bright: '\x1b[1m',
		dim: '\x1b[2m',
		red: '\x1b[31m',
		green: '\x1b[32m',
		yellow: '\x1b[33m',
		blue: '\x1b[34m',
		magenta: '\x1b[35m',
		cyan: '\x1b[36m',
		white: '\x1b[37m',
		gray: '\x1b[90m',
		bgRed: '\x1b[41m',
		bgGreen: '\x1b[42m',
		bgYellow: '\x1b[43m',
		bgBlue: '\x1b[44m',
		bgMagenta: '\x1b[45m',
		bgCyan: '\x1b[46m',
		bgWhite: '\x1b[47m',
	}
	
	const result: string[] = []
	
	// Add header
	result.push('')
	result.push(`${colors.bright}${colors.cyan}╭─────────────────────────────────────${colors.reset}`)
	result.push(`${colors.bright}${colors.cyan}│${colors.reset} ${colors.bright}${colors.yellow}🦴 Effect Lineage Trace${colors.reset} ${colors.gray}(${segments.length} segment${segments.length === 1 ? '' : 's'})${colors.reset}`)
	result.push(`${colors.bright}${colors.cyan}╰─────────────────────────────────────${colors.reset}`)
	result.push('')
	
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		
		// Add segment header
		const isLast = i === segments.length - 1
		const prefix = i === 0 ? '📍' : isLast ? '└─' : '├─'
		const connector = isLast ? '  ' : '│ '
		
		result.push(`${colors.gray}${connector}${colors.reset}${colors.bright}${colors.magenta}${prefix} Effect: ${segment.effectName}${colors.reset}`)
		
		// Add stack frames
		for (let j = 0; j < segment.stack.length; j++) {
			const frame = segment.stack[j]
			const isLastFrame = j === segment.stack.length - 1
			const framePrefix = isLast && isLast ? '   └─' : isLast ? '   ├─' : '   │'
			
			if (frame.functionName === '...node_modules...') {
				// Special formatting for node_modules placeholder
				result.push(`${colors.gray}   ${connector}${colors.reset}${colors.dim}${framePrefix} ${colors.yellow}${frame.functionName}${colors.reset}`)
			} else {
				// Regular frame
				const fnColor = frame.functionName === 'anonymous' ? colors.gray : colors.green
				const fileColor = colors.blue
				const lineColor = colors.cyan
				
				result.push(`${colors.gray}   ${connector}${colors.reset}${colors.dim}${framePrefix}${colors.reset} ${fnColor}${frame.functionName}${colors.reset} ${colors.gray}(${colors.reset}${fileColor}${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}${colors.reset}${colors.gray})${colors.reset}`)
			}
		}
		
		// Add separator between segments
		if (i < segments.length - 1) {
			result.push('')
		}
	}
	
	return result.join('\n')
}

/**
 * Captures and formats lineage for Node.js console output
 */
export function captureNodeLineage(): string {
	return nodeLineage(getLineage())
}

/**
 * Custom formatter for Chrome DevTools to render lineage data nicely.
 */
export const lineageFormatter = {
	header: (obj: any) => {
		if (obj && obj.__isLineage__) {
			// Try to detect DevTools theme - default to dark colors if uncertain
			const isDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
			
			const headerColor = isDark ? '#cd9d5d' : '#704214'
			
			return [
				'span',
				{ style: `color: ${headerColor}; font-weight: bold;` },
				`🦴 Effect Lineage (${obj.segments.length} segments)`,
			]
		}
		return null
	},
	hasBody: (obj: any) => obj && obj.__isLineage__,
	body: (obj: any) => {
		if (!obj || !obj.__isLineage__) return null
		const segments: LineageSegment[] = obj.segments
		
		// Try to detect DevTools theme
		const isDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
		
		const colors = isDark ? {
			frameText: '#ccc',
			functionName: '#ffffff',
			fileLink: '#58a6ff',
			segmentBg: '#2d2d2d',
		} : {
			frameText: '#555',
			functionName: '#222',
			fileLink: '#005cc5',
			segmentBg: '#eee',
		}
		
		const children = segments.map((segment, i) => {
			const frames = segment.stack.map((frame) => [
				'div',
				{ style: `margin-left: 20px; color: ${colors.frameText}; font-family: monospace; font-size: 11px;` },
				['span', { style: `color: ${colors.functionName};` }, `at ${frame.functionName} `],
				['span', {}, `${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}`],
			])

			const segmentHeader = [
				'div',
				{ style: `margin-top: 5px; padding: 2px 5px; background: ${colors.segmentBg}; border-radius: 3px; font-weight: bold;` },
				i === 0 ? `📍 Current: ${segment.effectName}` : `↖ Effect: ${segment.effectName}`,
			]

			return ['div', {}, segmentHeader, ...frames]
		})

		return ['div', { style: 'padding: 5px; line-height: 1.4;' }, ...children]
	},
}

/**
 * Wraps lineage data in a way that the Chrome Formatter can recognize.
 */
export function wrapLineageForDebug(segments: LineageSegment[]) {
	return {
		__isLineage__: true,
		segments,
		toString: () => formatLineage(segments),
	}
}
