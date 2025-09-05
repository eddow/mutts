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
