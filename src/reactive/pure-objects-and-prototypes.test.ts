import { effect, reactive } from './index'

describe('pure objects and prototype chains', () => {
	describe('pure objects (Object.create(null))', () => {
		it('should track properties on pure objects', () => {
			const pure = reactive(Object.create(null) as any)
			pure.x = 1

			let runs = 0
			effect(() => {
				runs++
				const val = pure.x
				void val
			})

			expect(runs).toBe(1)
			expect(pure.x).toBe(1)

			pure.x = 2
			expect(runs).toBe(2)
			expect(pure.x).toBe(2)
		})

		it('should track properties added to pure objects', () => {
			const pure = reactive(Object.create(null) as any)

			let runs = 0
			effect(() => {
				runs++
				// Access property that doesn't exist yet
				const val = (pure as any).x
				void val
			})

			expect(runs).toBe(1)

			// Add property - should trigger effect
			pure.x = 1
			expect(runs).toBe(2)
			expect(pure.x).toBe(1)
		})
	})

	describe('pure object prototype chains', () => {
		it('should track properties through pure object prototype chain', () => {
			const parent = reactive(Object.create(null) as any)
			parent.a = 1
			const child = reactive(Object.create(parent))

			let runs = 0
			effect(() => {
				runs++
				const val = (child as any).a // Inherited from parent
				void val
			})

			expect(runs).toBe(1)
			expect((child as any).a).toBe(1)

			// Changing parent property should trigger effect
			parent.a = 2
			expect(runs).toBe(2)
			expect((child as any).a).toBe(2)
		})

		it('should track properties in multi-level pure object chain', () => {
			const root = reactive(Object.create(null) as any)
			root.x = 1

			const mid = reactive(Object.create(root))
			mid.y = 2

			const leaf = reactive(Object.create(mid))

			let runs = 0
			effect(() => {
				runs++
				const x = (leaf as any).x // From root
				const y = (leaf as any).y // From mid
				void x
				void y
			})

			expect(runs).toBe(1)

			// Change root property
			root.x = 10
			expect(runs).toBe(2)

			// Change mid property
			mid.y = 20
			expect(runs).toBe(3)
		})

		it('should handle shadowing in pure object chains', () => {
			const parent = reactive(Object.create(null) as any)
			parent.value = 'parent'

			const child = reactive(Object.create(parent))
			child.value = 'child' // Shadow parent.value

			let runs = 0
			effect(() => {
				runs++
				const val = (child as any).value
				void val
			})

			expect(runs).toBe(1)
			expect((child as any).value).toBe('child')

			// Changing parent.value should NOT trigger (child shadows it)
			parent.value = 'parent-changed'
			expect(runs).toBe(1)
			expect((child as any).value).toBe('child')

			// Changing child.value should trigger
			child.value = 'child-changed'
			expect(runs).toBe(2)
			expect((child as any).value).toBe('child-changed')
		})
	})

	describe('objects with instance as prototype (Object.create(instance))', () => {
		it('should track properties when instance is used as prototype', () => {
			const instance = reactive({ x: 1, y: 2 })
			const child = reactive(Object.create(instance))

			let runs = 0
			effect(() => {
				runs++
				const x = (child as any).x // From instance prototype
				const y = (child as any).y // From instance prototype
				void x
				void y
			})

			expect(runs).toBe(1)
			expect((child as any).x).toBe(1)
			expect((child as any).y).toBe(2)

			// Changing instance properties should trigger effect
			instance.x = 10
			expect(runs).toBe(2)
			expect((child as any).x).toBe(10)

			instance.y = 20
			expect(runs).toBe(3)
			expect((child as any).y).toBe(20)
		})

		it('should handle shadowing when instance is prototype', () => {
			const instance = reactive({ value: 'instance' })
			const child = reactive(Object.create(instance))
			child.value = 'child' // Shadow instance.value

			let runs = 0
			effect(() => {
				runs++
				const val = (child as any).value
				void val
			})

			expect(runs).toBe(1)
			expect((child as any).value).toBe('child')

			// Changing instance.value should NOT trigger (child shadows it)
			instance.value = 'instance-changed'
			expect(runs).toBe(1)
			expect((child as any).value).toBe('child')

			// Changing child.value should trigger
			child.value = 'child-changed'
			expect(runs).toBe(2)
			expect((child as any).value).toBe('child-changed')
		})

		it('should track nested objects when instance is prototype', () => {
			const instance = reactive({ nested: { value: 1 } })
			const child = reactive(Object.create(instance))

			let runs = 0
			effect(() => {
				runs++
				const nested = (child as any).nested
				const value = nested?.value
				void nested
				void value
			})

			expect(runs).toBe(1)

			// Changing nested value should trigger
			instance.nested.value = 2
			expect(runs).toBe(2)
		})

		it('should track nested objects with deep touch', () => {
			const instance = reactive({ nested: { value: 1 } })
			const child = reactive(Object.create(instance))

			let runs1 = 0
			let runs2 = 0
			effect(() => {
				runs1++
				const nested = (child as any).nested
				void nested
				effect(() => {
					runs2++
					const value = nested?.value
					void value
				})
			})

			expect(runs1).toBe(1)
			expect(runs2).toBe(1)

			// Changing nested value should trigger
			instance.nested = { value: 2 }
			expect(runs1).toBe(1)
			expect(runs2).toBe(2)
		})

		it('should handle multi-level chain with instance in middle', () => {
			const root = reactive(Object.create(null) as any)
			root.a = 1

			// Create instance with root as its prototype
			const instance = reactive(Object.create(root))
			instance.b = 2

			const mid = reactive(Object.create(instance))
			const leaf = reactive(Object.create(mid))

			let runs = 0
			effect(() => {
				runs++
				const a = (leaf as any).a // From root (through instance chain)
				const b = (leaf as any).b // From instance
				void a
				void b
			})

			expect(runs).toBe(1)

			// Change root property - should trigger (a is accessible through chain)
			root.a = 10
			expect(runs).toBe(2)

			// Change instance property - should trigger
			instance.b = 20
			expect(runs).toBe(3)
		})
	})

	describe('mixed pure objects and normal objects', () => {
		it('should track when pure object has normal object as prototype', () => {
			const normalProto = reactive({ x: 1 })
			const pure = reactive(Object.create(normalProto) as any)

			let runs = 0
			effect(() => {
				runs++
				const val = pure.x // From normalProto
				void val
			})

			expect(runs).toBe(1)

			normalProto.x = 2
			expect(runs).toBe(2)
		})

		it('should track when normal object has pure object as prototype', () => {
			const pureProto = reactive(Object.create(null) as any)
			pureProto.x = 1

			const normal = reactive(Object.create(pureProto))

			let runs = 0
			effect(() => {
				runs++
				const val = (normal as any).x // From pureProto
				void val
			})

			expect(runs).toBe(1)

			pureProto.x = 2
			expect(runs).toBe(2)
		})
	})

	describe('edge cases', () => {
		it('should handle Object.create with multiple reactive instances', () => {
			const instance1 = reactive({ a: 1 })
			const instance2 = reactive({ b: 2 })

			const child1 = reactive(Object.create(instance1))
			const child2 = reactive(Object.create(instance2))

			let runs1 = 0
			let runs2 = 0

			effect(() => {
				runs1++
				const val = (child1 as any).a
				void val
			})

			effect(() => {
				runs2++
				const val = (child2 as any).b
				void val
			})

			expect(runs1).toBe(1)
			expect(runs2).toBe(1)

			// Changing instance1 should only trigger effect1
			instance1.a = 10
			expect(runs1).toBe(2)
			expect(runs2).toBe(1)

			// Changing instance2 should only trigger effect2
			instance2.b = 20
			expect(runs1).toBe(2)
			expect(runs2).toBe(2)
		})

		it('should handle deep nesting with instance prototype', () => {
			const deepInstance = reactive({
				level1: {
					level2: {
						value: 1,
					},
				},
			})

			const child = reactive(Object.create(deepInstance))

			let runs = 0
			effect(() => {
				runs++
				const value = (child as any).level1.level2.value
				void value
			})

			expect(runs).toBe(1)

			deepInstance.level1.level2.value = 2
			expect(runs).toBe(2)
		})

		it('should handle property addition to instance used as prototype', () => {
			const instance = reactive({ existing: 1 } as any)
			const child = reactive(Object.create(instance))

			let runs = 0
			effect(() => {
				runs++
				const existing = (child as any).existing
				const newProp = (child as any).newProp
				void existing
				void newProp
			})

			expect(runs).toBe(1)

			// Add new property to instance
			instance.newProp = 2
			expect(runs).toBe(2)
		})

		it('should handle pure object with class prototype (should not walk into class)', () => {
			class MyClass {
				method() {
					return 'method'
				}
			}

			const pure = reactive(Object.create(MyClass.prototype) as any)
			pure.data = 1

			let runs = 0
			effect(() => {
				runs++
				const data = pure.data
				const method = pure.method
				void data
				void method
			})

			expect(runs).toBe(1)

			// Changing data should trigger
			pure.data = 2
			expect(runs).toBe(2)

			// Note: We can't override class methods reactively, so changing method won't trigger
			// This is expected - we don't track class prototypes
		})

		it('should handle Object.create(null) then adding prototype later', () => {
			const pure = reactive(Object.create(null) as any)
			pure.x = 1

			const proto = reactive({ y: 2 })
			Object.setPrototypeOf(pure, proto)

			let runs = 0
			effect(() => {
				runs++
				const x = pure.x
				const y = pure.y // Now accessible via proto
				void x
				void y
			})

			expect(runs).toBe(1)

			proto.y = 20
			expect(runs).toBe(2)
		})
	})

	describe('cascading effects with prototypes', () => {
		it('should handle cascading effects through prototype chain', () => {
			const parent = reactive(Object.create(null) as any)
			parent.a = 0

			const child = reactive(Object.create(parent))
			const grandchild = reactive(Object.create(child))

			// Effect that reads from grandchild
			effect(() => {
				;(grandchild as any).a // Reads from parent through chain
			})

			let cascadingRuns = 0
			effect(() => {
				cascadingRuns++
				// This effect depends on parent.a
				const val = parent.a
				// And sets a property on child
				;(child as any).b = val + 1
			})

			expect(cascadingRuns).toBe(1)

			parent.a = 5
			expect(cascadingRuns).toBe(2)
			expect((child as any).b).toBe(6)
		})

		it('should handle nested effects with instance prototype', () => {
			const instance = reactive({ count: 0 })
			const child = reactive(Object.create(instance))

			let parentRuns = 0
			let childRuns = 0

			effect(() => {
				parentRuns++
				const count = (child as any).count

				effect(() => {
					childRuns++
					const doubled = count * 2
					void doubled
				})
			})

			expect(parentRuns).toBe(1)
			expect(childRuns).toBe(1)

			instance.count = 5
			expect(parentRuns).toBe(2)
			expect(childRuns).toBe(2)
		})
	})
})
