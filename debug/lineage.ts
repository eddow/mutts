import { getActiveEffect } from '../src/reactive/effect-context'
import { effectCreationStacks } from '../src/reactive/effects'
import { effectParent, getRoot } from '../src/reactive/registry'
import { type EffectTrigger } from '../src/reactive/types'

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
export function getStackFrame(skipFrames = 0, error?: Error): StackFrame[] {
	if (!error) {
		error = new Error()
		skipFrames++
	}
	if (!error.stack) return []

	const lines = error.stack.split('\n')

	// Dynamically identify the library's internal files if not already done
	if (!internalFile && lines[1]) {
		const selfFrame = parseStackLine(lines[1])
		if (selfFrame) {
			internalFile = selfFrame.fileName
		}
	}

	// Skip "Error" line and requested frames
	const stackLines = lines.slice(skipFrames)
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

	let foundExternal = false
	for (const line of stackLines) {
		const frame = parseStackLine(line)
		if (!frame) continue

		// Robust skipping: if we are still in the internal area, skip it.
		if (!foundExternal) {
			const isInternal =
				frame.functionName === 'captureLineage' ||
				frame.fileName === internalFile ||
				(libraryBase && frame.fileName.startsWith(libraryBase)) ||
				// Heuristic for built mode: index.js in a mutts folder
				(frame.fileName.includes('/mutts/') && (frame.fileName.endsWith('.js') || frame.fileName.endsWith('.ts')))

			// We only want to skip if it's REALLY internal. If we find something that looks like user code, stop skipping.
			if (isInternal && !frame.fileName.includes('/tests/') && !frame.fileName.includes('/example/')) {
				continue
			}
			foundExternal = true
		}

		frames.push(frame)
	}

	return frames
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
			stack: currentStack,
		})
		return segments
	}

	let current: EffectTrigger | undefined = currentEffect
	let lastStack = currentStack

	while (current) {
		const rootFn = getRoot(current)
		const effectName = rootFn.name || 'anonymous'
		
		// Find where this effect starts in the current stack
		// This is tricky because the stack might have internal "runEffect" frames
		// We look for the first frame that might be the effect function itself
		let effectEntryIndex = -1
		for (let i = 0; i < lastStack.length; i++) {
			// We compare function names. Not perfect but often works.
			if (lastStack[i].functionName === effectName) {
				effectEntryIndex = i
				break
			}
		}

		if (effectEntryIndex !== -1) {
			segments.push({
				effectName,
				stack: lastStack.slice(0, effectEntryIndex + 1),
			})
		} else {
			// If we can't find the entry point, just take the whole stack segment
			segments.push({
				effectName,
				stack: lastStack,
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
				stack: creationStack,
			})
			break
		} else {
			break
		}
	}

	return segments
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

export function captureLineage(): string {
	return formatLineage(getLineage())
}

/**
 * Custom formatter for Chrome DevTools to render lineage data nicely.
 */
export const lineageFormatter = {
	header: (obj: any) => {
		if (obj && obj.__isLineage__) {
			return [
				'span',
				{ style: 'color: #704214; font-weight: bold;' },
				`🦴 Effect Lineage (${obj.segments.length} segments)`,
			]
		}
		return null
	},
	hasBody: (obj: any) => obj && obj.__isLineage__,
	body: (obj: any) => {
		if (!obj || !obj.__isLineage__) return null
		const segments: LineageSegment[] = obj.segments
		const children = segments.map((segment, i) => {
			const frames = segment.stack.map((frame) => [
				'div',
				{ style: 'margin-left: 20px; color: #555; font-family: monospace; font-size: 11px;' },
				['span', { style: 'color: #222;' }, `at ${frame.functionName} `],
				['span', { style: 'color: #005cc5; cursor: pointer; text-decoration: underline;' }, `(${frame.fileName}:${frame.lineNumber}:${frame.columnNumber})`],
			])

			const segmentHeader = [
				'div',
				{ style: 'margin-top: 5px; padding: 2px 5px; background: #eee; border-radius: 3px; font-weight: bold;' },
				i === 0 ? `📍 Current: ${segment.effectName}` : `↖ Triggered by: ${segment.effectName}`,
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
