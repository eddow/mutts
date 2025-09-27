import { effect, reactive } from './index'
import './collections'

describe('ReactiveWeakSet', () => {
	describe('reactive operations', () => {
		it('should track dependencies when checking existence', () => {
			const ws = new WeakSet<object>()
			const rws = reactive(ws)
			const key = { id: 1 }

			let count = 0
			effect(() => {
				count++
				rws.has(key)
			})

			expect(count).toBe(1)
			rws.add(key)
			expect(count).toBe(2)
			rws.delete(key)
			expect(count).toBe(3)
		})

		it('should not trigger when deleting non-existent keys', () => {
			const ws = new WeakSet<object>()
			const rws = reactive(ws)
			const key = { id: 1 }

			let count = 0
			effect(() => {
				count++
				rws.has(key)
			})

			expect(count).toBe(1)
			rws.delete(key)
			expect(count).toBe(1)
		})
	})

	describe('toStringTag', () => {
		it('should have correct toStringTag', () => {
			const ws = new WeakSet<object>()
			const rws = reactive(ws)
			expect(rws[Symbol.toStringTag]).toBe('ReactiveWeakSet')
		})
	})
})

describe('ReactiveSet', () => {
	describe('reactive operations', () => {
		it('should track size dependencies', () => {
			const s = new Set<number>()
			const rs = reactive(s)

			let count = 0
			effect(() => {
				count++
				rs.size
			})

			expect(count).toBe(1)
			rs.add(1)
			expect(count).toBe(2)
		})

		it('should track dependencies when checking existence', () => {
			const s = new Set<number>()
			const rs = reactive(s)
			rs.add(1)

			let count = 0
			effect(() => {
				count++
				rs.has(1)
			})

			expect(count).toBe(1)
			rs.add(2)
			expect(count).toBe(1)
			rs.delete(1)
			expect(count).toBe(2)
		})

		it('should trigger effects when adding new values', () => {
			const s = new Set<number>()
			const rs = reactive(s)

			let count = 0
			effect(() => {
				count++
				rs.has(1)
			})

			expect(count).toBe(1)
			rs.add(1)
			expect(count).toBe(2)
		})

		it('should trigger effects when deleting values', () => {
			const s = new Set<number>()
			const rs = reactive(s)
			rs.add(1)

			let count = 0
			effect(() => {
				count++
				rs.has(1)
			})

			expect(count).toBe(1)
			rs.delete(1)
			expect(count).toBe(2)
		})

		it('should not trigger effects when deleting non-existent values', () => {
			const s = new Set<number>()
			const rs = reactive(s)

			let count = 0
			effect(() => {
				count++
				rs.has(1)
			})

			expect(count).toBe(1)
			rs.delete(1)
			expect(count).toBe(1)
		})
	})

	describe('allProps reactivity', () => {
		it('should trigger allProps effects when adding values', () => {
			const s = new Set<number>()
			const rs = reactive(s)

			let allPropsCount = 0
			effect(() => {
				allPropsCount++
				// Use iteration to depend on all entries
				for (const _v of rs.entries()) {
				}
			})

			expect(allPropsCount).toBe(1)
			rs.add(1)
			expect(allPropsCount).toBe(2)
			rs.add(2)
			expect(allPropsCount).toBe(3)
		})

		it('should trigger allProps effects when deleting values', () => {
			const s = new Set<number>()
			const rs = reactive(s)
			rs.add(1)
			rs.add(2)

			let allPropsCount = 0
			effect(() => {
				allPropsCount++
				rs.keys()
			})

			expect(allPropsCount).toBe(1)
			rs.delete(1)
			expect(allPropsCount).toBe(2)
			rs.delete(2)
			expect(allPropsCount).toBe(3)
		})

		it('should trigger allProps effects when clearing', () => {
			const s = new Set<number>()
			const rs = reactive(s)
			rs.add(1)
			rs.add(2)

			let sizeCount = 0
			let allPropsCount = 0
			effect(() => {
				sizeCount++
				rs.size
			})
			effect(() => {
				allPropsCount++
				rs.values()
			})

			expect(sizeCount).toBe(1)
			expect(allPropsCount).toBe(1)
			rs.clear()
			expect(sizeCount).toBe(2)
			expect(allPropsCount).toBe(2)
		})
	})

	describe('iteration methods', () => {
		it('should track allProps for entries()', () => {
			const rs = reactive(new Set<number>())

			let count = 0
			effect(() => {
				count++
				rs.entries()
			})

			expect(count).toBe(1)
			rs.add(1)
			expect(count).toBe(2)
		})

		it('should track allProps for forEach()', () => {
			const rs = reactive(new Set<number>())

			let count = 0
			effect(() => {
				count++
				rs.forEach(() => {})
			})

			expect(count).toBe(1)
			rs.add(1)
			expect(count).toBe(2)
		})

		it('should track allProps for keys() and values() and iterator', () => {
			const rs = reactive(new Set<number>())

			let countKeys = 0
			let countValues = 0
			let countIter = 0

			effect(() => {
				countKeys++
				rs.keys()
			})

			effect(() => {
				countValues++
				rs.values()
			})

			effect(() => {
				countIter++
				for (const _v of rs) {
				}
			})

			expect(countKeys).toBe(1)
			expect(countValues).toBe(1)
			expect(countIter).toBe(1)

			rs.add(1)
			expect(countKeys).toBe(2)
			expect(countValues).toBe(2)
			expect(countIter).toBe(2)
		})
	})

	describe('seamless reactive integration', () => {
		it('should automatically create ReactiveSet when using reactive() on native Set', () => {
			const nativeSet = new Set([1, 2])
			const rs = reactive(nativeSet)
			expect(rs.size).toBe(2)
			// dependency tracking
			let count = 0
			effect(() => {
				count++
				rs.has(1)
			})
			expect(count).toBe(1)
			rs.delete(1)
			expect(count).toBe(2)
		})

		it('should automatically create ReactiveWeakSet when using reactive() on native WeakSet', () => {
			const k = { id: 1 }
			const native = new WeakSet([k])
			const rws = reactive(native)

			let count = 0
			effect(() => {
				count++
				rws.has(k)
			})
			expect(count).toBe(1)
			rws.delete(k)
			expect(count).toBe(2)
		})
	})
})
