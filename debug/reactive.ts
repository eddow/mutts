import { isReactive, unwrap } from '../src/reactive/types'

function getColors() {
	const isDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
	return {
		accent: isDark ? '#b392f0' : '#6f42c1',
		meta: isDark ? '#8b949e' : '#57606a',
	}
}

function getReactiveTarget(obj: unknown): object | undefined {
	if (!obj || typeof obj !== 'object' || !isReactive(obj)) return undefined
	return unwrap(obj)
}

export const reactiveFormatter = {
	header: (obj: unknown) => {
		const target = getReactiveTarget(obj)
		if (!target) return null
		const colors = getColors()
		return [
			'span',
			{},
			['span', { style: `color: ${colors.accent}; font-weight: bold;` }, 'Reactive<'],
			['object', { object: target }],
			['span', { style: `color: ${colors.accent}; font-weight: bold;` }, '>'],
		]
	},
	hasBody: () => false,
}
