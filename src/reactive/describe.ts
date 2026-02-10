import { attend } from './buffer'
import { touched1 } from './change'
import { cleanedBy } from './effect-context'
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
	target: T = Object.create(null) as T
): T {
	descriptors = reactive(descriptors)

	const stop = attend(
		() => Reflect.ownKeys(descriptors),
		(key) => {
			const desc = (descriptors as any)[key]
			if (desc) {
				Object.defineProperty(target, key, {
					enumerable: true,
					...desc,
					configurable: true,
				})
				touched1(target, { type: 'set', prop: key }, key)
			}
			return () => Reflect.deleteProperty(target, key)
		}
	)

	return cleanedBy(target, stop)
}
