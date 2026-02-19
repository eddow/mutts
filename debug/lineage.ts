import { getActiveEffect } from '../src/reactive/effect-context'
import { getEffectNode, getRoot } from '../src/reactive/registry'
import { type EffectTrigger, effectMarker } from '../src/reactive/types'

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
 * Represents a segment in the effect lineage
 */
export interface LineageSegment {
	effect?: EffectTrigger
	effectName: string
	stack: StackFrame[]
}

const lineageObjects = new WeakSet<any>()

/**
 * Checks if an object is a lineage object
 */
export function isLineage(obj: any): obj is { segments: LineageSegment[] } {
	return obj && typeof obj === 'object' && lineageObjects.has(obj)
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
				frame.functionName === 'eval' ||
				[`getStackFrame`, `captureLineage`].includes(frame.functionName)

			if (!isInternal) break
		}
		lines.splice(0, l)
	}

	return lines.map(parseStackLine).filter(Boolean)
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
			effect: undefined,
			effectName: 'root',
			stack: filterNodeModules(currentStack),
		})
		return segments
	}

	let current: EffectTrigger | undefined = currentEffect
	let lastStack = currentStack

	while (current) {
		const rootFn = getRoot(current)
		// Too aggressive for now
		//if(!rootFn.name) debugger
		const filteredStack = filterNodeModules(lastStack)
		segments.push({
			effect: rootFn,
			effectName: rootFn.name || 'anonymous',
			stack: filteredStack,
		})

		// Move to parent
		const node = getEffectNode(current)
		const parent = node.parent
		const creationStack = node.creationStack as StackFrame[]
		
		if (parent) {
			current = parent
			lastStack = creationStack ?? []
		} else if (creationStack) {
			segments.push({
				effect: undefined,
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
		const isNodeModule = frame.fileName.includes('/node_modules/') //|| frame.fileName.includes('/dist/')
		
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
			const triggerEffect = segments[i - 1].effect
			const triggerName = triggerEffect ? (getRoot(triggerEffect).name || 'anonymous') : 'root'
			result.push(` --- effect: ${triggerName} ---`)
		}
		for (const frame of segment.stack) {
			result.push(`    ${frame.raw}`)
		}
	}
	return result.join('\n')
}

/**
 * Logs lineage segments to console with grouping
 * @param segments - Lineage segments
 */
export function logLineage(segments: LineageSegment[]): void {
	console.groupCollapsed(`🦴 Effect Lineage Trace (${segments.length} segment${segments.length === 1 ? '' : 's'})`)
	
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		
		// Add segment header
		const isLast = i === segments.length - 1
		const prefix = i === 0 ? '📍' : isLast ? '└─' : '├─'
		
		console.groupCollapsed(`${prefix} Effect:`, segment.effect ? segment.effect.name || 'anonymous' : 'root')
		
		// Add stack frames
		for (let j = 0; j < segment.stack.length; j++) {
			const frame = segment.stack[j]
			const isLastFrame = j === segment.stack.length - 1
			const framePrefix = isLastFrame ? '└─' : '├─'
			
			if (frame.functionName === '...node_modules...') {
				console.log(`%c${framePrefix} ${frame.functionName}`, 'color: #888; font-style: italic;')
			} else {
				const fnStyle = frame.functionName === 'anonymous' ? 'color: #888;' : 'color: #1a7f37; font-weight: bold;'
				const fileStyle = 'color: #0550ae;'
				
				console.log(
					`%c${framePrefix} %c${frame.functionName} %c(${frame.fileName}:${frame.lineNumber}:${frame.columnNumber})`,
					'color: #888;',
					fnStyle,
					fileStyle
				)
			}
		}
		
		console.groupEnd()
	}
	
	console.groupEnd()
}

/**
 * Captures and logs lineage to console
 */
export function captureNodeLineage(): void {
	logLineage(getLineage())
}

/**
 * Custom formatter for Chrome DevTools to render lineage data nicely.
 */
export const lineageFormatter = {
	header: (obj: any) => {
		if (isLineage(obj)) {
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
	hasBody: (obj: any) => isLineage(obj),
	body: (obj: any) => {
		if (!isLineage(obj)) return null
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

			const effect = segment.effect

			const segmentHeader = [
				'div',
				{ style: `margin-top: 5px; padding: 2px 5px; background: ${colors.segmentBg}; border-radius: 3px; font-weight: bold;` },
				i === 0 ? '📍 Current: ' : '↖ Effect: ',
				segment.effect?.name || 'anonymous',
				segment.effect ? ['object', { object: segment.effect }] : 'root',
			]

			return ['div', {}, segmentHeader, ...frames]
		})

		return ['div', { style: 'padding: 5px; line-height: 1.4;' }, ...children]
	},
}

/**
 * Wraps lineage data in a way that the Chrome Formatter can recognize.
 */
export function wrapLineageForDebug(segments?: LineageSegment[]) {
	const lineage = {
		segments,
		toString: () => formatLineage(segments ?? getLineage()),
	}
	lineageObjects.add(lineage)
	return lineage
}
