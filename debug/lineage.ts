import { getActiveEffect } from '../src/reactive/effect-context'
import { getEffectNode, getRoot } from '../src/reactive/registry'
import { type EffectTrigger, effectMarker } from '../src/reactive/types'

export interface StackFrame {
	functionName: string
	fileName: string
	lineNumber: number
	columnNumber: number
	raw: string
}

export interface LineageSegment {
	effect?: EffectTrigger
	effectName: string
	stack: StackFrame[]
}

export interface LineageSignature {
	effect?: EffectTrigger
	stack?: unknown
	digested?: LineageSegment[]
	toString(): string
}

const lineageObjects = new WeakSet<object>()
const lineageSegmentObjects = new WeakSet<object>()
const lineageFrameObjects = new WeakSet<object>()

type LineageSegmentView = {
	index: number
	total: number
	segment: LineageSegment
}

type LineageFrameView = {
	frame: StackFrame
}

export function isLineage(obj: any): obj is LineageSignature {
	return !!obj && typeof obj === 'object' && lineageObjects.has(obj)
}

function isLineageSegmentView(obj: unknown): obj is LineageSegmentView {
	return !!obj && typeof obj === 'object' && lineageSegmentObjects.has(obj)
}

function isLineageFrameView(obj: unknown): obj is LineageFrameView {
	return !!obj && typeof obj === 'object' && lineageFrameObjects.has(obj)
}

let internalFile: string | undefined

function parseStackLine(line: string): StackFrame | null {
	const nodeMatch = line.match(/^\s*at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?$/)
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

function extractRawStack(error: unknown = new Error()): string | undefined {
	if (typeof error === 'string') return error
	if (error && typeof error === 'object' && 'stack' in error) {
		const stack = (error as { stack?: unknown }).stack
		return typeof stack === 'string' ? stack : undefined
	}
	return undefined
}

export function getStackFrame(error?: unknown): string | undefined {
	return extractRawStack(error)
}

function parseStackFrames(stack: unknown): StackFrame[] {
	const rawStack = extractRawStack(stack)
	if (!rawStack) return []

	const lines = rawStack.split('\n')
	const lastLine = lines.findIndex((line) => line.includes(effectMarker.enter))
	if (lastLine !== -1) lines.splice(lastLine)
	const firstLine = lines.findLastIndex((line) => line.includes(effectMarker.leave))
	if (firstLine !== -1) lines.splice(0, firstLine + 1)
	else {
		if (!internalFile && lines[1]) {
			const selfFrame = parseStackLine(lines[1])
			if (selfFrame) internalFile = selfFrame.fileName
		}
		let l = 1
		for (; l < lines.length; l++) {
			const frame = parseStackLine(lines[l])
			if (!frame) continue
			const isInternal =
				/Lineage$/.test(frame.functionName) ||
				frame.functionName === 'eval' ||
				[`getStackFrame`, `captureLineage`, `getLineage`, `digestLineage`, `formatLineage`].includes(
					frame.functionName
				)
			if (!isInternal) break
		}
		lines.splice(0, l)
	}

	return filterNodeModules(lines.map(parseStackLine).filter((frame): frame is StackFrame => !!frame))
}

function filterNodeModules(frames: StackFrame[]): StackFrame[] {
	const result: StackFrame[] = []
	let inNodeModules = false
	for (const frame of frames) {
		const isNodeModule = frame.fileName.includes('/node_modules/')
		if (isNodeModule && !inNodeModules) {
			inNodeModules = true
			result.push({
				functionName: '...node_modules...',
				fileName: '[filtered]',
				lineNumber: 0,
				columnNumber: 0,
				raw: 'at ...node_modules...',
			})
			continue
		}
		if (!isNodeModule && inNodeModules) inNodeModules = false
		if (!isNodeModule) result.push(frame)
	}
	return result
}

function formatEffectPreview(effect?: EffectTrigger): string {
	if (!effect) return 'root'
	return `[effect ${effect.name || 'anonymous'}]`
}

function formatSegmentTitle(segment: LineageSegment, index: number, total: number): string {
	const isLast = index === total - 1
	const prefix = index === 0 ? '📍' : isLast ? '└─' : '├─'
	return `${prefix} Effect: ${segment.effect?.name || 'root'}`
}

function wrapLineageSegmentView(segment: LineageSegment, index: number, total: number): LineageSegmentView {
	const view = { index, total, segment }
	lineageSegmentObjects.add(view)
	return view
}

function wrapLineageFrameView(frame: StackFrame): LineageFrameView {
	const view = { frame }
	lineageFrameObjects.add(view)
	return view
}

function formatLocationHref(frame: StackFrame): string {
	return `${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}`
}

function formatLocationLabel(frame: StackFrame): string {
	const source = frame.fileName.split('?')[0]
	const fileName = source.split('/').pop() || source
	return `${fileName}:${frame.lineNumber}:${frame.columnNumber}`
}

function ensureSignature(signature: LineageSignature): LineageSignature {
	if (!isLineage(signature)) {
		Object.defineProperty(signature, 'toString', {
			value: () => formatLineage(signature),
			enumerable: false,
			configurable: true,
		})
		lineageObjects.add(signature)
	}
	return signature
}

export function getLineage(effect?: EffectTrigger, currentStack: unknown = new Error()): LineageSignature {
	return ensureSignature({
		effect: effect ?? getActiveEffect(),
		stack: currentStack,
		toString() {
			return formatLineage(this)
		},
	})
}

export function captureLineage(effect?: EffectTrigger, currentStack?: unknown): LineageSignature {
	return getLineage(effect, currentStack ?? new Error())
}

export function digestLineage(lineage: LineageSignature): LineageSegment[] {
	if (lineage.digested) return lineage.digested

	const currentEffect = lineage.effect
	const currentStack = parseStackFrames(lineage.stack)
	const segments: LineageSegment[] = []

	if (!currentEffect) {
		lineage.digested = [
			{
				effect: undefined,
				effectName: 'root',
				stack: currentStack,
			},
		]
		return lineage.digested
	}

	let current: EffectTrigger | undefined = currentEffect
	let lastStack = currentStack
	while (current) {
		const rootFn = getRoot(current)
		segments.push({
			effect: rootFn,
			effectName: rootFn.name || 'anonymous',
			stack: lastStack,
		})

		const node = getEffectNode(current)
		const parent = node.parent
		const creationStack = parseStackFrames(node.creationStack)
		if (parent) {
			current = parent
			lastStack = creationStack
		} else if (node.creationStack) {
			segments.push({
				effect: undefined,
				effectName: 'root',
				stack: creationStack,
			})
			break
		} else break
	}

	lineage.digested = segments
	return segments
}

export function formatLineage(lineage: LineageSignature | LineageSegment[]): string {
	const segments = Array.isArray(lineage) ? lineage : digestLineage(lineage)
	const result: string[] = []
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		if (i > 0) {
			const triggerEffect = segments[i - 1].effect
			const triggerName = triggerEffect ? getRoot(triggerEffect).name || 'anonymous' : 'root'
			result.push(` --- effect: ${triggerName} ---`)
		}
		for (const frame of segment.stack) result.push(`    ${frame.raw}`)
	}
	return result.join('\n')
}

export function logLineage(lineage: LineageSignature | LineageSegment[]): void {
	const segments = Array.isArray(lineage) ? lineage : digestLineage(lineage)
	console.groupCollapsed(`🦴 Effect Lineage Trace (${segments.length} segment${segments.length === 1 ? '' : 's'})`)
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		const isLast = i === segments.length - 1
		const prefix = i === 0 ? '📍' : isLast ? '└─' : '├─'
		console.groupCollapsed(`${prefix} Effect:`, segment.effect ? segment.effect.name || 'anonymous' : 'root')
		for (let j = 0; j < segment.stack.length; j++) {
			const frame = segment.stack[j]
			const isLastFrame = j === segment.stack.length - 1
			const framePrefix = isLastFrame ? '└─' : '├─'
			if (frame.functionName === '...node_modules...') {
				console.log(`%c${framePrefix} ${frame.functionName}`, 'color: #888; font-style: italic;')
			} else {
				const fnStyle =
					frame.functionName === 'anonymous' ? 'color: #888;' : 'color: #1a7f37; font-weight: bold;'
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

export function captureNodeLineage(): void {
	logLineage(getLineage())
}

export const lineageFormatter = {
	header: (obj: any) => {
		if (isLineageSegmentView(obj)) {
			const isDark =
				typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
			const frameColor = isDark ? '#8b949e' : '#57606a'
			return [
				'span',
				{ style: 'font-weight: bold;' },
				formatSegmentTitle(obj.segment, obj.index, obj.total),
				['span', { style: `color: ${frameColor}; margin-left: 6px; font-weight: normal;` }, formatEffectPreview(obj.segment.effect)],
				[
					'span',
					{ style: `color: ${frameColor}; margin-left: 6px; font-weight: normal;` },
					`${obj.segment.stack.length} frame${obj.segment.stack.length === 1 ? '' : 's'}`,
				],
			]
		}
		if (isLineageFrameView(obj)) {
			const isDark =
				typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
			const fnColor = obj.frame.functionName === 'anonymous' ? '#8b949e' : isDark ? '#ffffff' : '#222'
			const linkColor = isDark ? '#58a6ff' : '#005cc5'
			return [
				'div',
				{ style: 'display: block;' },
				['span', { style: `color: ${fnColor}; font-weight: bold;` }, obj.frame.functionName],
				['span', { style: 'color: #8b949e; margin: 0 6px;' }, '@'],
				[
					'span',
					{ style: `color: ${linkColor}; text-decoration: underline;` },
					formatLocationHref(obj.frame),
				],
			]
		}
		if (!isLineage(obj)) return null
		const isDark =
			typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
		const headerColor = isDark ? '#cd9d5d' : '#704214'
		return [
			'span',
			{ style: `color: ${headerColor}; font-weight: bold;` },
			obj.digested
				? `🦴 Effect Lineage (${obj.digested.length} segments)`
				: '🦴 Effect Lineage (lazy)',
		]
	},
	hasBody: (obj: any) => isLineage(obj) || isLineageSegmentView(obj),
	body: (obj: any) => {
		if (isLineageSegmentView(obj)) {
			return [
				'div',
				{ style: 'padding: 4px 0;' },
				...obj.segment.stack.map((frame) => [
					'div',
					{ style: 'display: block; margin-top: 2px;' },
					['object', { object: wrapLineageFrameView(frame) }],
				]),
			]
		}
		if (!isLineage(obj)) return null
		const segments = digestLineage(obj)
		return [
			'div',
			{ style: 'padding: 5px; line-height: 1.4;' },
			...segments.map((segment, index) => [
				'div',
				{ style: 'display: block; margin-top: 4px;' },
				['object', { object: wrapLineageSegmentView(segment, index, segments.length) }],
			]),
		]
	},
}

export function wrapLineageForDebug(lineage?: LineageSignature) {
	return ensureSignature(lineage ?? getLineage())
}
