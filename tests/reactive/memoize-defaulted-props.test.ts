/**
 * Test to reproduce the issue where memoize is applied to a defaulted prop
 * and doesn't invalidate when the underlying reactive value changes after
 * a property assignment.
 *
 * The Issue:
 * - propsInto() wraps getters with memoize(() => state.sharedCount)
 * - reactive() wraps the props object with a Proxy
 * - defaulted() uses Object.setPrototypeOf on the reactive proxy
 * - When finalProps.count is assigned, it breaks memoization invalidation
 */

import { reactive, memoize, effect, unwrap } from 'mutts/reactive'

// Simulate the defaulted function from pounce-ts
function defaulted<T extends Record<PropertyKey, any>, D extends Record<PropertyKey, any>>(
	value: T,
	defaultValue: D
): T & D {
	return Object.setPrototypeOf(value, defaultValue) as T & D
}

// Simulate the propsInto function from pounce-ts
function propsInto<P extends Record<string, any>>(props: P): any {
	const result: any = {}

	for (const [key, value] of Object.entries(props || {})) {
		if (typeof value === 'object' && value !== null && 'get' in value && 'set' in value) {
			// 2-way binding
			Object.defineProperty(result, key, {
				get: memoize(value.get),
				set: (newValue: any) => value.set(newValue),
				enumerable: true,
				configurable: true,
			})
		} else if (typeof value === 'function') {
			// One-way binding - THIS IS WHERE THE ISSUE IS
			Object.defineProperty(result, key, {
				get: memoize(value),
				enumerable: true,
				configurable: true,
			})
		} else {
			// Static value
			Object.defineProperty(result, key, {
				value: value,
				enumerable: true,
				writable: false,
				configurable: true,
			})
		}
	}
	return result
}

describe('memoize with defaulted props', () => {
	it('should invalidate memoize when underlying reactive value changes', () => {
		// Create a reactive state
		const state = reactive({
			sharedCount: 5,
		})

		// Simulate how props are passed to a component AFTER Babel transformation
		// Babel transforms count={state.sharedCount} into count={() => state.sharedCount}
		const props = {
			count: () => state.sharedCount,
		}

		// First apply propsInto which wraps getters with memoize
		const propsAfterInto = propsInto(props)

		// In renderer.ts line 59, propsInto is wrapped with reactive()
		const propsAfterReactive = reactive(propsAfterInto)

		// Apply defaulted - this creates a proxy with prototype chain
		const finalProps = defaulted(propsAfterReactive, {
			maxValue: 100,
			minValue: 0,
			step: 1,
		})

		// Track changes
		const observed: number[] = []
		effect(() => {
			const count = (finalProps as any).count
			observed.push(count)
		})

		// Initial effect execution
		expect(observed).toEqual([5])

		// Update the reactive value
		state.sharedCount = 10

		// Expected: memoize should invalidate and effect should re-run
		expect(observed).toEqual([5, 10])
		expect((finalProps as any).count).toBe(10)
	})

	it('should invalidate memoize after property assignment and reactive value change', () => {
		// Create a reactive state
		const state = reactive({
			sharedCount: 5,
		})

		// Simulate how props are passed to a component AFTER Babel transformation
		const props = {
			count: () => state.sharedCount,
		}

		// First apply propsInto which wraps getters with memoize
		const propsAfterInto = propsInto(props)

		// In renderer.ts line 59, propsInto is wrapped with reactive()
		const propsAfterReactive = reactive(propsAfterInto)

		// Apply defaulted - this creates a proxy with prototype chain
		const finalProps = defaulted(propsAfterReactive, {
			maxValue: 100,
			minValue: 0,
			step: 1,
		})

		// Track changes
		const observed: number[] = []
		const stopFirstEffect = effect(() => {
			const count = (finalProps as any).count
			observed.push(count)
		})

		// Initial effect execution
		expect(observed).toEqual([5])

		// Update the reactive value
		state.sharedCount = 10
		expect(observed).toEqual([5, 10])
		expect((finalProps as any).count).toBe(10)

		// NOW TRY TO ASSIGN TO finalProps.count (like Counter.tsx does)
		// This assignment to a getter-only property will silently fail (doesn't create own property).
		// The assignment triggers a read of the old value via the proxy's set handler,
		// which should use withEffect(undefined, ...) to avoid registering dependencies.
		// However, this read operation may interfere with memoization dependency tracking.
		;(finalProps as any).count = 99

		// Stop the first effect to avoid double-tracking
		stopFirstEffect()

		// Clear the observed array for the new effect
		observed.length = 0

		// Create a new effect to track changes after assignment
		// This simulates a component re-rendering after the assignment.
		// When this effect reads finalProps.count, it should register dependencies on state.sharedCount
		// via the memoized getter's internal effect.
		const stopSecondEffect = effect(() => {
			const count = (finalProps as any).count
			observed.push(count)
		})

		// Should observe the current value (10, from the previous state.sharedCount = 10)
		// The assignment to 99 doesn't affect the reactive value, so it should still be 10
		expect(observed).toEqual([10])

		// Now change the reactive value
		// This should invalidate the memoize cache and trigger the effect
		state.sharedCount = 15

		expect(observed).toEqual([10, 15])
		expect((finalProps as any).count).toBe(15)

		stopSecondEffect()
	})

	it('should maintain memoize invalidation after defaulted() is applied', () => {
		// Create a reactive state
		const state = reactive({
			sharedCount: 5,
		})

		const props = {
			count: () => state.sharedCount,
		}

		const propsAfterInto = propsInto(props)
		const propsAfterReactive = reactive(propsAfterInto)
		const finalProps = defaulted(propsAfterReactive, {
			maxValue: 100,
		})

		const observed: number[] = []
		effect(() => {
			observed.push((finalProps as any).count)
		})

		expect(observed).toEqual([5])

		// Change reactive value multiple times
		state.sharedCount = 10
		expect(observed).toEqual([5, 10])

		state.sharedCount = 15
		expect(observed).toEqual([5, 10, 15])

		state.sharedCount = 20
		expect(observed).toEqual([5, 10, 15, 20])

		expect((finalProps as any).count).toBe(20)
	})

	it('should handle property assignment without breaking subsequent memoization', () => {
		// Create a reactive state
		const state = reactive({
			sharedCount: 5,
		})

		const props = {
			count: () => state.sharedCount,
		}

		const propsAfterInto = propsInto(props)
		const propsAfterReactive = reactive(propsAfterInto)
		const finalProps = defaulted(propsAfterReactive, {
			maxValue: 100,
		})

		// Initial value
		expect((finalProps as any).count).toBe(5)

		// Assign a new value (this is the problematic operation)
		// This assignment may create an own property on the proxy, breaking memoization
		;(finalProps as any).count = 99

		// Verify the unwrapped object state
		const unwrapped = unwrap(finalProps)
		const unwrappedDesc = Object.getOwnPropertyDescriptor(unwrapped, 'count')
		expect(unwrappedDesc).toBeDefined()

		// After assignment, memoization should still work when reactive value changes
		// Reset to track from here
		const observed: number[] = []
		state.sharedCount = 10

		effect(() => {
			observed.push((finalProps as any).count)
		})

		// Should observe current state (10)
		expect(observed).toEqual([10])

		// Change reactive value again - should still invalidate
		// BUG: This may fail because memoization is broken after property assignment
		state.sharedCount = 15
		// Expected: memoize should invalidate and effect should re-run
		expect(observed).toEqual([10, 15])
		expect((finalProps as any).count).toBe(15)
	})
})

