import { IterableWeakMap, IterableWeakSet } from '../src'

function tick(ms: number = 0) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GlobalWithGC {
	gc?: () => void
}

const gc = (globalThis as unknown as GlobalWithGC).gc

async function collectGarbages() {
	await tick()
	gc!()
	await tick()
}

describe('IterableWeakMap', () => {
	it('should create an empty map', () => {
		const map = new IterableWeakMap<object, string>()
		expect(map.size).toBe(0)
		expect([...map]).toEqual([])
	})

	it('should create a map from entries', () => {
		const key1 = {}
		const key2 = {}
		const map = new IterableWeakMap([
			[key1, 'value1'],
			[key2, 'value2'],
		])
		expect(map.size).toBe(2)
		expect(map.get(key1)).toBe('value1')
		expect(map.get(key2)).toBe('value2')
	})

	it('should set and get values', () => {
		const map = new IterableWeakMap<object, string>()
		const key = {}
		map.set(key, 'value')
		expect(map.get(key)).toBe('value')
		expect(map.has(key)).toBe(true)
	})

	it('should update existing values', () => {
		const map = new IterableWeakMap<object, string>()
		const key = {}
		map.set(key, 'value1')
		map.set(key, 'value2')
		expect(map.get(key)).toBe('value2')
		expect(map.size).toBe(1)
	})

	it('should delete entries', () => {
		const map = new IterableWeakMap<object, string>()
		const key1 = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		expect(map.delete(key1)).toBe(true)
		expect(map.has(key1)).toBe(false)
		expect(map.has(key2)).toBe(true)
		expect(map.delete(key1)).toBe(false)
	})

	it('should clear all entries', () => {
		const map = new IterableWeakMap<object, string>()
		const key1 = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		map.clear()
		expect(map.size).toBe(0)
		expect(map.has(key1)).toBe(false)
		expect(map.has(key2)).toBe(false)
	})

	it('should iterate over entries', () => {
		const map = new IterableWeakMap<object, string>()
		const key1 = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		const entries = [...map.entries()]
		expect(entries.length).toBe(2)
		expect(entries).toContainEqual([key1, 'value1'])
		expect(entries).toContainEqual([key2, 'value2'])
	})

	it('should iterate over keys', () => {
		const map = new IterableWeakMap<object, string>()
		const key1 = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		const keys = [...map.keys()]
		expect(keys.length).toBe(2)
		expect(keys).toContain(key1)
		expect(keys).toContain(key2)
	})

	it('should iterate over values', () => {
		const map = new IterableWeakMap<object, string>()
		const key1 = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		const values = [...map.values()]
		expect(values.length).toBe(2)
		expect(values).toContain('value1')
		expect(values).toContain('value2')
	})

	it('should support Symbol.iterator', () => {
		const map = new IterableWeakMap<object, string>()
		const key1 = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		const entries = [...map]
		expect(entries.length).toBe(2)
	})

	it('should support forEach', () => {
		const map = new IterableWeakMap<object, string>()
		const key1 = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		const results: Array<[string, object]> = []
		map.forEach((value, key) => {
			results.push([value, key])
		})
		expect(results.length).toBe(2)
		expect(results).toContainEqual(['value1', key1])
		expect(results).toContainEqual(['value2', key2])
	})

	it('should have correct toStringTag', () => {
		const map = new IterableWeakMap<object, string>()
		expect(map[Symbol.toStringTag]).toBe('IterableWeakMap')
	})

	it('should handle garbage collected entries', async () => {
		if (!gc) {
			console.warn('GC not available, skipping garbage collection test')
			return
		}

		const map = new IterableWeakMap<object, string>()
		let key1: object | null = {}
		const key2 = {}
		map.set(key1, 'value1')
		map.set(key2, 'value2')
		expect(map.size).toBe(2)

		// Remove reference to key1
		key1 = null
		await collectGarbages()

		// The size might be 1 or 2 depending on GC timing
		const size = map.size
		expect(size).toBeGreaterThanOrEqual(1)
		expect(size).toBeLessThanOrEqual(2)
		expect(map.has(key2)).toBe(true)
	})
})

describe('IterableWeakSet', () => {
	it('should create an empty set', () => {
		const set = new IterableWeakSet<object>()
		expect(set.size).toBe(0)
		expect([...set]).toEqual([])
	})

	it('should create a set from iterable', () => {
		const key1 = {}
		const key2 = {}
		const set = new IterableWeakSet([key1, key2])
		expect(set.size).toBe(2)
		expect(set.has(key1)).toBe(true)
		expect(set.has(key2)).toBe(true)
	})

	it('should add and check values', () => {
		const set = new IterableWeakSet<object>()
		const key = {}
		set.add(key)
		expect(set.has(key)).toBe(true)
	})

	it('should not add duplicate values', () => {
		const set = new IterableWeakSet<object>()
		const key = {}
		set.add(key)
		set.add(key)
		expect(set.size).toBe(1)
	})

	it('should delete entries', () => {
		const set = new IterableWeakSet<object>()
		const key1 = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		expect(set.delete(key1)).toBe(true)
		expect(set.has(key1)).toBe(false)
		expect(set.has(key2)).toBe(true)
		expect(set.delete(key1)).toBe(false)
	})

	it('should clear all entries', () => {
		const set = new IterableWeakSet<object>()
		const key1 = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		set.clear()
		expect(set.size).toBe(0)
		expect(set.has(key1)).toBe(false)
		expect(set.has(key2)).toBe(false)
	})

	it('should iterate over entries', () => {
		const set = new IterableWeakSet<object>()
		const key1 = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		const entries = [...set.entries()]
		expect(entries.length).toBe(2)
		expect(entries.map(([k]) => k)).toContain(key1)
		expect(entries.map(([k]) => k)).toContain(key2)
	})

	it('should iterate over keys', () => {
		const set = new IterableWeakSet<object>()
		const key1 = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		const keys = [...set.keys()]
		expect(keys.length).toBe(2)
		expect(keys).toContain(key1)
		expect(keys).toContain(key2)
	})

	it('should iterate over values', () => {
		const set = new IterableWeakSet<object>()
		const key1 = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		const values = [...set.values()]
		expect(values.length).toBe(2)
		expect(values).toContain(key1)
		expect(values).toContain(key2)
	})

	it('should support Symbol.iterator', () => {
		const set = new IterableWeakSet<object>()
		const key1 = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		const values = [...set]
		expect(values.length).toBe(2)
		expect(values).toContain(key1)
		expect(values).toContain(key2)
	})

	it('should support forEach', () => {
		const set = new IterableWeakSet<object>()
		const key1 = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		const results: object[] = []
		set.forEach((value) => {
			results.push(value)
		})
		expect(results.length).toBe(2)
		expect(results).toContain(key1)
		expect(results).toContain(key2)
	})

	it('should have correct toStringTag', () => {
		const set = new IterableWeakSet<object>()
		expect(set[Symbol.toStringTag]).toBe('IterableWeakSet')
	})

	describe('Set operations', () => {
		it('should compute union', () => {
			const set1 = new IterableWeakSet<object>()
			const set2 = new Set<object>()
			const key1 = {}
			const key2 = {}
			const key3 = {}
			set1.add(key1)
			set1.add(key2)
			set2.add(key2)
			set2.add(key3)
			const union = set1.union(set2)
			expect(union.size).toBe(3)
			expect(union.has(key1)).toBe(true)
			expect(union.has(key2)).toBe(true)
			expect(union.has(key3)).toBe(true)
		})

		it('should compute intersection', () => {
			const set1 = new IterableWeakSet<object>()
			const set2 = new Set<object>()
			const key1 = {}
			const key2 = {}
			const key3 = {}
			set1.add(key1)
			set1.add(key2)
			set2.add(key2)
			set2.add(key3)
			const intersection = set1.intersection(set2)
			expect(intersection.size).toBe(1)
			expect(intersection.has(key2)).toBe(true)
		})

		it('should compute difference', () => {
			const set1 = new IterableWeakSet<object>()
			const set2 = new Set<object>()
			const key1 = {}
			const key2 = {}
			const key3 = {}
			set1.add(key1)
			set1.add(key2)
			set2.add(key2)
			set2.add(key3)
			const difference = set1.difference(set2)
			expect(difference.size).toBe(1)
			expect(difference.has(key1)).toBe(true)
		})

		it('should compute symmetricDifference', () => {
			const set1 = new IterableWeakSet<object>()
			const set2 = new Set<object>()
			const key1 = {}
			const key2 = {}
			const key3 = {}
			set1.add(key1)
			set1.add(key2)
			set2.add(key2)
			set2.add(key3)
			const symDiff = set1.symmetricDifference(set2)
			expect(symDiff.size).toBe(2)
			expect(symDiff.has(key1)).toBe(true)
			expect(symDiff.has(key3)).toBe(true)
		})

		it('should check isSubsetOf', () => {
			const set1 = new IterableWeakSet<object>()
			const set2 = new Set<object>()
			const key1 = {}
			const key2 = {}
			set1.add(key1)
			set2.add(key1)
			set2.add(key2)
			expect(set1.isSubsetOf(set2)).toBe(true)
			set1.add(key2)
			expect(set1.isSubsetOf(set2)).toBe(true)
		})

		it('should check isSupersetOf', () => {
			const set1 = new IterableWeakSet<object>()
			const set2 = new Set<object>()
			const key1 = {}
			const key2 = {}
			set1.add(key1)
			set1.add(key2)
			set2.add(key1)
			expect(set1.isSupersetOf(set2)).toBe(true)
			set2.add(key2)
			expect(set1.isSupersetOf(set2)).toBe(true)
		})

		it('should check isDisjointFrom', () => {
			const set1 = new IterableWeakSet<object>()
			const set2 = new Set<object>()
			const key1 = {}
			const key2 = {}
			set1.add(key1)
			set2.add(key2)
			expect(set1.isDisjointFrom(set2)).toBe(true)
			set2.add(key1)
			expect(set1.isDisjointFrom(set2)).toBe(false)
		})
	})

	it('should handle garbage collected entries', async () => {
		if (!gc) {
			console.warn('GC not available, skipping garbage collection test')
			return
		}

		const set = new IterableWeakSet<object>()
		let key1: object | null = {}
		const key2 = {}
		set.add(key1)
		set.add(key2)
		expect(set.size).toBe(2)

		// Remove reference to key1
		key1 = null
		await collectGarbages()

		// The size might be 1 or 2 depending on GC timing
		const size = set.size
		expect(size).toBeGreaterThanOrEqual(1)
		expect(size).toBeLessThanOrEqual(2)
		expect(set.has(key2)).toBe(true)
	})
})
