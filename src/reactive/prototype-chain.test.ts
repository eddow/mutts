import { effect, reactive, reactiveOptions, unwrap } from './index'

describe('prototype chain dependency tracking', () => {
	it('should track both instance and prototype when using Object.create (instanceMembers=false)', () => {
		const original = reactiveOptions.instanceMembers
		reactiveOptions.instanceMembers = false
		try {
			const A = reactive({ something: 0 })
			const B = reactive(Object.create(A))

			let runs = 0
			effect(() => {
				runs++
				// Access inherited property
				;(B as any).something
			})

			// Initial run
			expect(runs).toBe(1)

			// Changing prototype property should trigger
			;(A as any).something = 1
			expect(runs).toBe(2)

			// Changing instance property (shadowing) should also trigger
			;(B as any).something = 2
			expect(runs).toBe(3)
		} finally {
			reactiveOptions.instanceMembers = original
		}
	})

	it('should track inherited when created with Object.create(null) roots (reactive root)', () => {
		const A = reactive(Object.create(null) as any)
		A.x = 1
		const mid = reactive(Object.create(unwrap(A)))
		const leaf = reactive(Object.create(mid))

		let runs = 0
		effect(() => {
			runs++
			;(leaf as any).x
		})

		expect(runs).toBe(1)
		// Update at reactive root should trigger
		A.x = 2
		expect(runs).toBe(2)
		// Update at reactive root should trigger
		mid.x = 3
		expect(runs).toBe(3)
		// Shadow at leaf should trigger
		leaf.x = 4
		expect(runs).toBe(4)
	})
})

