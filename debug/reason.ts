import { formatCleanupReason, type CleanupReason } from '../src/reactive/types'

const reasonTypes = new Set(['propChange', 'invalidate', 'external', 'stopped', 'gc', 'lineage', 'error', 'multiple'])
const reasonCauseLists = new WeakSet<object>()

function hasOwn(value: object, key: string) {
	return Object.prototype.hasOwnProperty.call(value, key)
}

export function isCleanupReason(value: unknown): value is CleanupReason {
	if (!value || typeof value !== 'object') return false
	if (!hasOwn(value, 'type')) return false
	const type = (value as { type?: unknown }).type
	if (typeof type !== 'string' || !reasonTypes.has(type)) return false
	switch (type) {
		case 'propChange':
			return Array.isArray((value as { triggers?: unknown }).triggers)
		case 'invalidate':
			return hasOwn(value, 'cause')
		case 'lineage':
			return hasOwn(value, 'parent')
		case 'error':
			return hasOwn(value, 'error')
		case 'multiple':
			return Array.isArray((value as { reasons?: unknown }).reasons)
		default:
			return true
	}
}

type ReasonCauseEntry = {
	label: string
	touch?: unknown[]
	dependency?: unknown[]
}

type ReasonCauseList = {
	count: number
	entries: ReasonCauseEntry[]
}

const reasonCauseEntries = new WeakSet<object>()
const reasonCauseDetails = new WeakSet<object>()

type ReasonCauseDetail = {
	kind: 'touch' | 'dependency'
	values: unknown[]
}

function isReasonCauseList(value: unknown): value is ReasonCauseList {
	return !!value && typeof value === 'object' && reasonCauseLists.has(value)
}

function isReasonCauseEntry(value: unknown): value is ReasonCauseEntry {
	return !!value && typeof value === 'object' && reasonCauseEntries.has(value)
}

function isReasonCauseDetail(value: unknown): value is ReasonCauseDetail {
	return !!value && typeof value === 'object' && reasonCauseDetails.has(value)
}

function wrapReasonCauseEntry(entry: ReasonCauseEntry): ReasonCauseEntry {
	reasonCauseEntries.add(entry)
	return entry
}

function wrapReasonCauseDetail(detail: ReasonCauseDetail): ReasonCauseDetail {
	reasonCauseDetails.add(detail)
	return detail
}

function wrapReasonCauseList(list: ReasonCauseList): ReasonCauseList {
	reasonCauseLists.add(list)
	return list
}

export function getCleanupReasonChain(reason: CleanupReason): CleanupReason[] {
	const chain: CleanupReason[] = []
	let current: CleanupReason | undefined = reason
	while (current) {
		chain.push(current)
		current = current.chain
	}
	return chain
}

function formatReasonSummary(reason: CleanupReason): string {
	switch (reason.type) {
		case 'propChange':
			return `propChange: ${formatTriggerSummary(reason)}`
		case 'invalidate':
			return `invalidate ← ${formatReasonSummary(reason.cause)}`
		case 'stopped':
			return reason.detail ? `stopped (${reason.detail})` : 'stopped'
		case 'external':
			return `external: ${reason.detail}`
		case 'gc':
			return 'gc'
		case 'lineage':
			return `lineage ← ${formatReasonSummary(reason.parent)}`
		case 'error':
			return `error: ${formatUnknownSummary(reason.error)}`
		case 'multiple':
			return `multiple: ${reason.reasons.map(formatReasonSummary).join(' | ')}`
	}
}

function formatTriggerSummary(reason: Extract<CleanupReason, { type: 'propChange' }>): string {
	const groups = new Map<object, { target: string; parts: string[] }>()
	const ordered: Array<{ target: string; parts: string[] }> = []
	for (const { obj, evolution } of reason.triggers) {
		let group = groups.get(obj)
		if (!group) {
			group = { target: describeTarget(obj), parts: [] }
			groups.set(obj, group)
			ordered.push(group)
		}
		group.parts.push(
			evolution.type === 'bunch'
				? `${evolution.type} ${String(evolution.method)}`
				: `${evolution.type} ${String(evolution.prop)}`
		)
	}
	return ordered.map(({ target, parts }) => `${target}: ${parts.join(', ')}`).join(' | ')
}

function formatUnknownSummary(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)
	if (value instanceof Error) return value.message
	if (typeof value === 'function') return value.name || 'anonymous'
	if (typeof value === 'object') return value.constructor?.name || 'object'
	return typeof value
}

function describeTarget(value: unknown): string {
	if (!value || typeof value !== 'object') return formatUnknownSummary(value)
	const tag = value[Symbol.toStringTag]
	if (typeof tag === 'string' && tag && tag !== 'Object' && tag !== 'Array') return tag
	if (Array.isArray(value)) return 'Array'
	if (value instanceof Map) return 'Map'
	if (value instanceof Set) return 'Set'
	return value.constructor?.name || 'object'
}

function formatPreview(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)
	if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`
	if (value instanceof Error) return `[Error: ${value.message}]`
	if (value && typeof value === 'object' && 'stack' in value) return '[lineage]'
	if (typeof value === 'object') return `[${value.constructor?.name || 'object'}]`
	return `[${typeof value}]`
}

function renderDetailValue(value: unknown, color: string): unknown[] {
	if (value && typeof value === 'object' && 'stack' in value) {
		return ['object', { object: value }]
	}
	return ['span', { style: `color: ${color}; white-space: pre-wrap;` }, formatPreview(value)]
}

type ReasonLineageDetail = {
	kind: 'touch' | 'dependency'
	target: string
	label: string
	value: unknown
}

function getReasonLineageDetails(reason: CleanupReason): ReasonLineageDetail[] {
	switch (reason.type) {
		case 'propChange': {
			const details: ReasonLineageDetail[] = []
			for (const trigger of reason.triggers) {
				const target =
					trigger.evolution.type === 'bunch'
						? String(trigger.evolution.method)
						: String(trigger.evolution.prop)
				const label =
					trigger.evolution.type === 'bunch'
						? `${trigger.evolution.type} ${String(trigger.evolution.method)}`
						: `${trigger.evolution.type} ${String(trigger.evolution.prop)}`
				if (trigger.touch) details.push({ kind: 'touch', target, label, value: trigger.touch })
				if (trigger.dependency)
					details.push({ kind: 'dependency', target, label, value: trigger.dependency })
			}
			return details
		}
		case 'invalidate':
			return getReasonLineageDetails(reason.cause)
		case 'lineage':
			return getReasonLineageDetails(reason.parent)
		case 'multiple':
			return reason.reasons.flatMap(getReasonLineageDetails)
		case 'external':
		default:
			return []
	}
}

function renderLineageGroup(
	label: string,
	details: ReasonLineageDetail[],
	colors: { block: string; title: string; meta: string }
): unknown[] {
	const groupObject = Object.fromEntries(details.map(({ label, value }) => [label, value]))
	return [
		'div',
		{
			style: `margin-top: 4px; padding: 3px 5px; background: ${colors.block}; border-radius: 3px;`,
		},
		['div', { style: `color: ${colors.title}; margin-bottom: 3px;` }, `${label}: ${details.length}`],
		['object', { object: groupObject }],
	]
}

function renderLineageList(
	details: ReasonLineageDetail[],
	colors: { block: string; title: string; meta: string }
): unknown[] {
	const grouped = new Map<string, ReasonCauseEntry>()
	for (const { kind, label, value } of details) {
		let entry = grouped.get(label)
		if (!entry) {
			entry = { label }
			grouped.set(label, entry)
		}
		if (kind === 'touch') entry.touch = [...(entry.touch ?? []), value]
		if (kind === 'dependency') entry.dependency = [...(entry.dependency ?? []), value]
	}
	const listObject = wrapReasonCauseList({
		count: grouped.size,
		entries: Array.from(grouped.values(), wrapReasonCauseEntry),
	})
	return [
		'div',
		{
			style: `margin-top: 4px; padding: 3px 5px; background: ${colors.block}; border-radius: 3px;`,
		},
		['object', { object: listObject }],
	]
}

function formatReasonWithoutChain(reason: CleanupReason): unknown[] {
	switch (reason.type) {
		case 'propChange':
			return formatCleanupReason({ type: 'propChange', triggers: reason.triggers })
		case 'invalidate':
			return formatCleanupReason({ type: 'invalidate', cause: reason.cause })
		case 'stopped':
			return formatCleanupReason(reason.detail ? { type: 'stopped', detail: reason.detail } : { type: 'stopped' })
		case 'external':
			return formatCleanupReason({ type: 'external', detail: reason.detail })
		case 'gc':
			return formatCleanupReason({ type: 'gc' })
		case 'lineage':
			return formatCleanupReason({ type: 'lineage', parent: reason.parent })
		case 'error':
			return formatCleanupReason({ type: 'error', error: reason.error })
		case 'multiple':
			return formatCleanupReason({ type: 'multiple', reasons: reason.reasons })
	}
}

export function logReason(reason: CleanupReason, tag?: string): string {
	const chain = getCleanupReasonChain(reason)
	console.groupCollapsed(`🧹 Cleanup Reason${tag ? ` (${tag})` : ''}`)
	for (let i = 0; i < chain.length; i++) {
		console.groupCollapsed(`${i === 0 ? '📍' : '↖'} ${formatReasonSummary(chain[i])}`)
		const details = getReasonLineageDetails(chain[i])
		if (details.length > 0) {
			for (const { kind, label, value } of details) console.log(`${kind} ${label}`, value)
		} else {
			console.log(...formatReasonWithoutChain(chain[i]))
		}
		console.groupEnd()
	}
	console.groupEnd()
	return `🧹 Cleanup Reason${tag ? ` (${tag})` : ''}`
}

export const reasonFormatter = {
	header: (obj: unknown) => {
		if (isReasonCauseList(obj)) {
			return ['span', { style: 'font-weight: bold;' }, `causes: ${obj.count}`]
		}
		if (isReasonCauseEntry(obj)) {
			return [
				'span',
				{ style: 'font-weight: bold;' },
				`${obj.label}:`,
				...(obj.touch?.length
					? [
							['span', { style: 'margin-left: 6px;' }, ['object', { object: wrapReasonCauseDetail({ kind: 'touch', values: obj.touch }) }]],
						]
					: []),
				...(obj.dependency?.length
					? [
							['span', { style: 'margin-left: 6px;' }, ['object', { object: wrapReasonCauseDetail({ kind: 'dependency', values: obj.dependency }) }]],
						]
					: []),
			]
		}
		if (isReasonCauseDetail(obj)) {
			return [
				'span',
				{ style: 'font-weight: normal;' },
				obj.values.length === 1 ? obj.kind : `${obj.values.length} ${obj.kind}`,
			]
		}
		if (!isCleanupReason(obj)) return null
		const chain = getCleanupReasonChain(obj)
		const isDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
		const color = isDark ? '#8fb3ff' : '#0b5fff'
		return ['span', { style: `color: ${color}; font-weight: bold;` }, `🧹 ${formatReasonSummary(obj)}${chain.length > 1 ? ` ×${chain.length}` : ''}`]
	},
	hasBody: (obj: unknown) => isCleanupReason(obj) || isReasonCauseList(obj) || isReasonCauseDetail(obj),
	body: (obj: unknown) => {
		if (isReasonCauseList(obj)) {
			return [
				'div',
				{ style: 'padding: 4px 0;' },
				...obj.entries.map((entry) => [
					'div',
					{ style: 'display: block; margin-top: 2px;' },
					['object', { object: entry }],
				]),
			]
		}
		if (isReasonCauseDetail(obj)) {
			const detailValue =
				obj.values.length === 1
					? obj.values[0]
					: Object.fromEntries(obj.values.map((value, index) => [`${obj.kind} ${index + 1}`, value]))
			return [
				'div',
				{ style: 'padding: 4px 0; line-height: 1.4;' },
				[
					'div',
					{ style: 'margin-top: 2px;' },
					renderDetailValue(detailValue, 'inherit'),
				],
			]
		}
		if (!isCleanupReason(obj)) return null
		const chain = getCleanupReasonChain(obj)
		const isDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
		const colors = isDark
			? { block: '#2d2d2d', title: '#ffffff', meta: '#8b949e' }
			: { block: '#eee', title: '#222', meta: '#57606a' }
		const children = chain.map((reason, index) => {
			const lineageDetails = getReasonLineageDetails(reason)
			const renderedDetails =
				lineageDetails.length > 0
					? [renderLineageList(lineageDetails, colors)]
					: formatReasonWithoutChain(reason).map((part) =>
							typeof part === 'string'
								? ['span', { style: `color: ${colors.meta}; white-space: pre-wrap;` }, part]
								: renderDetailValue(part, colors.meta)
						)
			return [
				'div',
				{ style: `margin-top: 5px; padding: 4px 6px; background: ${colors.block}; border-radius: 3px;` },
				['div', { style: `font-weight: bold; color: ${colors.title}; margin-bottom: 3px;` }, `${index === 0 ? '📍' : '↖'} ${formatReasonSummary(reason)}`],
				['div', { style: 'display: inline-block;' }, ...renderedDetails],
			]
		})
		return ['div', { style: 'padding: 5px; line-height: 1.4;' }, ...children]
	},
}
