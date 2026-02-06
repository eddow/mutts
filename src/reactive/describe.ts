import { cleanedBy } from './effect-context'
import { effect } from './effects'
import { reactive } from './proxy'

/**
 * Reactively defines properties on a target object based on a descriptors record.
 * 
 * It tracks the keys of the descriptors record and defines/updates/removes 
 * properties on the target object as they change.
 *
 * @param descriptors - A reactive record of property descriptors.
 * @param target - The object to define properties on (defaults to a new object).
 * @returns The target object with reactive property definitions.
 */
export function describe<T extends object>(
	descriptors: Record<PropertyKey, PropertyDescriptor>,
	target: T = {} as T
): T {
	descriptors = reactive(descriptors)
	const keyEffects = new Map<PropertyKey, () => void>()

	function disposeKey(key: PropertyKey) {
		const stop = keyEffects.get(key)
		if (stop) {
			stop()
			keyEffects.delete(key)
			Reflect.deleteProperty(target, key)
		}
	}

	const cleanup = effect(function describeEffect({ ascend }) {
		const keys = Reflect.ownKeys(descriptors)

		for (const key of keys) {
			if (keyEffects.has(key)) continue
			ascend(() => {
				const stop = effect(function describeKeyEffect() {
					const desc = (descriptors as any)[key]
					if (desc) {
						Object.defineProperty(target, key, {
							...desc,
							configurable: true,
						})
					}
				})
				keyEffects.set(key, stop)
			})
		}

		for (const key of Array.from(keyEffects.keys())) {
			if (!(keys as PropertyKey[]).includes(key)) disposeKey(key)
		}
	})

	return cleanedBy(target, () => {
		cleanup()
		for (const stop of keyEffects.values()) stop()
		keyEffects.clear()
	})
}
