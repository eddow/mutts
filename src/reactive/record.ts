import { FoolProof } from '../utils'
import { attend } from './buffer'
import { touched1 } from './change'
import { cleanedBy } from './effect-context'
import { reactive } from './proxy'
import {
	cleanup,
	CleanupReason,
	type EffectCloser,
	type ScopedCallback,
} from './types'

/**
 * Provides type-safe access to a source object's property within the organized callback.
 * @template Source - The type of the source object
 * @template Key - The type of the property key in the source object
 */
export type OrganizedAccess<Source extends Record<PropertyKey, any>, Key extends keyof Source> = {
	/** The property key being accessed */
	readonly key: Key

	/**
	 * Gets the current value of the property from the source object
	 * @returns The current value of the property
	 */
	get(): Source[Key]

	/**
	 * Updates the property value in the source object
	 * @param value - The new value to set
	 * @returns {boolean} True if the update was successful
	 */
	set(value: Source[Key]): boolean

	/**
	 * The current value of the property (equivalent to using get()/set() directly)
	 */
	value: Source[Key]
}

/**
 * Callback function type for the organized function that processes each source property.
 * @template Source - The type of the source object
 * @template Target - The type of the target object
 */
export type OrganizedCallback<Source extends Record<PropertyKey, any>, Target extends object> = <
	Key extends keyof Source,
>(
	/**
	 * Accessor object for the current source property
	 */
	access: OrganizedAccess<Source, Key>,

	/**
	 * The target object where organized data will be stored
	 */
	target: Target
) => EffectCloser | undefined

/**
 * The result type of the organized function, combining the target object with cleanup capability.
 * @template Target - The type of the target object
 */
export type OrganizedResult<Target extends object> = Target & {
	/**
	 * Cleanup function to dispose of all reactive bindings created by organized().
	 * This is automatically called when the effect that created the organized binding is disposed.
	 */
	[cleanup]: ScopedCallback
}

/**
 * Organizes a source object's properties into a target object using a callback function.
 * This creates a reactive mapping between source properties and a target object,
 * automatically handling property additions, updates, and removals.
 *
 * @template Source - The type of the source object
 * @template Target - The type of the target object (defaults to Record<PropertyKey, any>)
 *
 * @param {Source} source - The source object to organize
 * @param {OrganizedCallback<Source, Target>} apply - Callback function that defines how each source property is mapped to the target
 * @param {Target} [baseTarget={}] - Optional base target object to use (will be made reactive if not already)
 *
 * @returns {OrganizedResult<Target>} The target object with cleanup capability
 *
 * @example
 * // Organize user permissions into role-based access
 * const user = reactive({ isAdmin: true, canEdit: false });
 * const permissions = organized(
 *   user,
 *   (access, target) => {
 *     if (access.key === 'isAdmin') {
 *       target.hasFullAccess = access.value;
 *     }
 *     target[`can${access.key.charAt(0).toUpperCase() + access.key.slice(1)}`] = access.value;
 *   }
 * );
 *
 * @example
 * // Transform object structure with cleanup
 * const source = reactive({ firstName: 'John', lastName: 'Doe' });
 * const formatted = organized(
 *   source,
 *   (access, target) => {
 *     if (access.key === 'firstName' || access.key === 'lastName') {
 *       target.fullName = `${source.firstName} ${source.lastName}`.trim();
 *     }
 *   }
 * );
 *
 * @example
 * // Using with cleanup in a component
 * effect(() => {
 *   const data = fetchData();
 *   const organizedData = organized(data, (access, target) => {
 *     // Transform data
 *   });
 *
 *   // The cleanup will be called automatically when the effect is disposed
 *   return () => organizedData[cleanup]();
 * });
 */
export function organized<
	Source extends Record<PropertyKey, any>,
	Target extends object = Record<PropertyKey, any>,
>(
	source: Source,
	apply: OrganizedCallback<Source, Target>,
	baseTarget: Target = {} as Target
): OrganizedResult<Target> {
	const observedSource = reactive(source) as Source
	const target = reactive(baseTarget) as Target

	const stop = attend(
		() => {
			const keys: PropertyKey[] = []
			for (const key in observedSource) keys.push(key)
			return keys
		},
		(key) => {
			const sourceKey = key as keyof Source
			const accessBase = {
				key: sourceKey,
				get: () => FoolProof.get(observedSource, sourceKey, observedSource),
				set: (value: Source[typeof sourceKey]) =>
					FoolProof.set(observedSource, sourceKey, value, observedSource),
			}
			Object.defineProperty(accessBase, 'value', {
				get: accessBase.get,
				set: accessBase.set,
				configurable: true,
				enumerable: true,
			})
			return apply(accessBase as OrganizedAccess<Source, typeof sourceKey>, target)
		}
	)

	return cleanedBy(target, (reason?: CleanupReason) => stop(reason)) as OrganizedResult<Target>
}

/**
 * Organizes a property on a target object
 * Shortcut for defineProperty/delete with touched signal
 * @param target - The target object
 * @param property - The property to organize
 * @param access - The access object
 * @returns The property descriptor
 */
export function organize<T>(
	target: object,
	property: PropertyKey,
	access: { get?(): T; set?(value: T): boolean }
) {
	Object.defineProperty(target, property, {
		get: access.get,
		set: access.set,
		configurable: true,
		enumerable: true,
	})
	touched1(target, { type: 'set', prop: property }, property)
	return () => delete (target as any)[property]
}
