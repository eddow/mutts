type ElementTypes<T extends readonly unknown[]> = {
	[K in keyof T]: T[K] extends readonly (infer U)[] ? U : T[K]
}

export function zip<T extends (readonly unknown[])[]>(...args: T): ElementTypes<T>[] {
	if (!args.length) return []
	const minLength = Math.min(...args.map((arr) => arr.length))
	const result: ElementTypes<T>[] = []

	for (let i = 0; i < minLength; i++) {
		const tuple = args.map((arr) => arr[i]) as ElementTypes<T>
		result.push(tuple)
	}

	return result
}

const nativeConstructors = new Set<Function>([
	Object,
	Array,
	Date,
	Function,
	Set,
	Map,
	WeakMap,
	WeakSet,
	Promise,
	Error,
	TypeError,
	ReferenceError,
	SyntaxError,
	RangeError,
	URIError,
	EvalError,
	Reflect,
	Proxy,
	RegExp,
	String,
	Number,
	Boolean,
] as Function[])
export function isConstructor(fn: Function): boolean {
	return nativeConstructors.has(fn) || fn.toString().startsWith('class ')
}

export function renamed<F extends Function>(fct: F, name: string): F {
	return Object.defineProperties(fct, {
		name: {
			value: name,
		},
	})
}
