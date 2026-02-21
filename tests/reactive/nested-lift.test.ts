import { describe, expect, it } from 'vitest'
import { reactive, effect, lift, morph, atomic, unlink } from 'mutts'

describe('nested lift propagation', () => {
	it('baseline: effect tracks .length', () => {
		const source = reactive([1, 2, 3])
		const runs: number[] = []

		effect(() => {
			runs.push(source.length)
		})

		expect(runs).toEqual([3])
		source.push(7)
		expect(runs).toEqual([3, 4])
	})

	it('baseline: effect tracks for-of iteration', () => {
		const source = reactive([1, 2, 3])
		const runs: number[] = []

		effect(() => {
			const result: number[] = []
			for (const item of source) result.push(item)
			runs.push(result.length)
		})

		expect(runs).toEqual([3])
		source.push(4)
		expect(runs).toEqual([3, 4])
	})

	it('baseline: effect tracks index loop', () => {
		const source = reactive([1, 2, 3])
		const runs: number[] = []

		effect(() => {
			const result: number[] = []
			for (let i = 0; i < source.length; i++) result.push(source[i])
			runs.push(result.length)
		})

		expect(runs).toEqual([3])
		source.push(4)
		expect(runs).toEqual([3, 4])
	})

	it('single lift updates when source grows', () => {
		const source = reactive([1, 2, 3])
		const innerRuns: number[] = []

		const inner = lift(() => {
			const result: number[] = []
			for (const item of source) result.push(item * 10)
			innerRuns.push(result.length)
			return result
		})

		expect(inner.length).toBe(3)
		expect([...inner]).toEqual([10, 20, 30])
		expect(innerRuns).toEqual([3])

		source.push(4)

		expect(innerRuns).toEqual([3, 4])
		expect(inner.length).toBe(4)
		expect([...inner]).toEqual([10, 20, 30, 40])

		unlink(inner)
	})

	it('outer lift re-evaluates when inner lift array grows', () => {
		const source = reactive([1, 2, 3])

		// Inner lift: produces a reactive array from source
		const inner = lift(() => {
			const result: number[] = []
			for (const item of source) result.push(item * 10)
			return result
		})

		// Outer lift: flattens inner
		const runs: number[] = []
		const outer = lift(() => {
			const flat: number[] = []
			for (const item of inner) flat.push(item)
			runs.push(flat.length)
			return flat
		})

		expect(outer.length).toBe(3)
		expect([...outer]).toEqual([10, 20, 30])
		expect(runs).toEqual([3])

		// Grow the source
		source.push(4)

		expect(inner.length).toBe(4)
		expect(outer.length).toBe(4)
		expect([...outer]).toEqual([10, 20, 30, 40])
		expect(runs.length).toBeGreaterThan(1)

		unlink(inner)
		unlink(outer)
	})

	it('outer lift re-evaluates when project stores inner lift that grows', () => {
		// This mimics the reconciler: project stores a lift result, outer lift reads it
		const children = reactive([reactive([1, 2])])

		// morph over children — each child array gets wrapped in a lift (like processChildren)
		const rendered = morph(children, (childArray) => {
			return lift(() => {
				const result: number[] = []
				for (const item of childArray as number[]) result.push(item)
				return result
			})
		})

		// Outer lift flattens rendered (like flattenNodes)
		const flatRuns: number[] = []
		const flattened = lift(() => {
			const next: number[] = []
			for (const item of rendered) {
				if (item && Array.isArray(item)) {
					for (const child of item) next.push(child)
				}
			}
			flatRuns.push(next.length)
			return next
		})

		expect([...flattened]).toEqual([1, 2])
		expect(flatRuns).toEqual([2])

		// Now grow the inner array (like "Remove All" button appearing)
		;(children[0] as number[]).push(3)

		expect([...flattened]).toEqual([1, 2, 3])
		expect(flatRuns.length).toBeGreaterThan(1)

		unlink(rendered)
		unlink(flattened)
	})

	it('outer lift reads project items that are reactive arrays mutated in-place', () => {
		// This is the exact reconciler pattern:
		// rendered = project(...) where each item is a reactive array (from inner processChildren/lift)
		// flattened = lift that iterates rendered and recurses into each item
		// When an inner reactive array mutates in-place, flattened must re-run
		const inner1 = reactive([10, 20])
		const inner2 = reactive([30])
		const source = reactive([inner1, inner2] as number[][])

		const rendered = morph(source, (value) => value)

		const flatRuns: number[] = []
		const flattened = lift(() => {
			const next: number[] = []
			for (const item of rendered) {
				if (Array.isArray(item)) {
					for (const child of item) next.push(child)
				}
			}
			flatRuns.push(next.length)
			return next
		})

		expect([...flattened]).toEqual([10, 20, 30])
		expect(flatRuns).toEqual([3])

		// Mutate inner array in-place (like inner lift writing new nodes)
		inner1.push(25)
		expect(flatRuns.length).toBe(2)
		expect([...flattened]).toEqual([10, 20, 25, 30])

		unlink(rendered)
		unlink(flattened)
	})

	it('full reconciler chain: render-effect > project > scan > project > lift', () => {
		// Simulates: PounceElement.render effect creates processChildren pipeline
		// Inner condition (if={}) toggles, inner lift updates, outer lift must see it
		const condition = reactive({ value: false })

		let innerFlattened!: ReturnType<typeof lift<number[]>>

		// Simulate PounceElement.render effect
		const stopRender = effect(() => {
			// Inner processChildren: produces nodes based on condition
			innerFlattened = lift(() => {
				const nodes = [1, 2]
				if (condition.value) nodes.push(3) // "Remove All" button
				return nodes
			})
		})

		// Outer morph stores the inner lift result
		const rendered = morph(
			reactive([innerFlattened] as any[]),
			(value) => value
		)

		// Outer lift flattens
		const flatRuns: number[] = []
		const flattened = lift(() => {
			const next: number[] = []
			for (const item of rendered) {
				if (Array.isArray(item)) {
					for (const child of item as number[]) next.push(child)
				}
			}
			flatRuns.push(next.length)
			return next
		})

		// Reconcile effect
		const seen: number[][] = []
		const stopReconcile = effect(() => {
			seen.push([...flattened])
		})

		expect(seen).toEqual([[1, 2]])

		// Toggle condition (like state.list.push() making if={} true)
		condition.value = true

		expect([...innerFlattened]).toEqual([1, 2, 3])
		expect(seen.length).toBeGreaterThan(1)
		expect(seen[seen.length - 1]).toEqual([1, 2, 3])

		stopRender()
		stopReconcile()
		unlink(rendered)
		unlink(flattened)
	})

	it('lift created inside parent effect, read by separate root effect', () => {
		const source = reactive([1, 2, 3])
		let lifted!: ReturnType<typeof lift<number[]>>

		// Parent effect (like PounceElement.render) creates the lift as a child
		const stopParent = effect(() => {
			lifted = lift(() => {
				const result: number[] = []
				for (const item of source) result.push(item * 10)
				return result
			})
		})

		// Separate root effect reads the lift result (like reconcile's redraw)
		const seen: number[][] = []
		const stopReader = effect(() => {
			seen.push([...lifted])
		})

		expect(seen).toEqual([[10, 20, 30]])

		source.push(4)
		expect(seen.length).toBe(2)
		expect(seen[1]).toEqual([10, 20, 30, 40])

		stopParent()
		stopReader()
	})

	it('effect reading lift result re-runs when lift updates', () => {
		const source = reactive([1, 2, 3])
		const lifted = lift(() => {
			const result: number[] = []
			for (const item of source) result.push(item * 10)
			return result
		})

		// Separate effect reads the lift result (like reconcile's redraw)
		const seen: number[][] = []
		effect(() => {
			seen.push([...lifted])
		})

		expect(seen).toEqual([[10, 20, 30]])

		source.push(4)
		expect(seen.length).toBe(2)
		expect(seen[1]).toEqual([10, 20, 30, 40])

		unlink(lifted)
	})

	it('reconcile pattern: project recreates lift, outer effect must see new content', () => {
		// This reproduces the exact reconciler bug:
		// - source array has items that change
		// - project callback creates a lift over each item
		// - when source changes, project re-runs, creating a NEW lift
		// - outer lift flattens all project results
		// - reconcile effect reads the outer lift
		const trigger = reactive({ value: false })
		const items = reactive([1, 2])

		// morph: for each item in source, create a lift (like processChildren)
		const rendered = morph(items, (item) => {
			// This simulates renderChild creating processChildren
			// The lift reads `trigger` to conditionally include extra items
			return lift(() => {
				const result = [item * 10]
				if (trigger.value) result.push(item * 100)
				return result
			})
		})

		// outer lift: flatten (like flattenNodes)
		const flattened = lift(() => {
			const next: number[] = []
			for (const item of rendered) {
				if (item && Array.isArray(item)) {
					for (const child of item) next.push(child)
				}
			}
			return next
		})

		// reconcile effect: reads flattened
		const seen: number[][] = []
		effect(() => {
			seen.push([...flattened])
		})

		expect(seen).toEqual([[10, 20]])

		// Trigger the condition — inner lifts should update, outer should propagate
		trigger.value = true

		expect(seen.length).toBeGreaterThan(1)
		expect(seen[seen.length - 1]).toEqual([10, 100, 20, 200])

		unlink(rendered)
		unlink(flattened)
	})


})
