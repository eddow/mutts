import { effect, reactive } from './index'
import { ReactiveMap, ReactiveWeakMap } from './map'
import './index'

describe('ReactiveWeakMap', () => {
	describe('basic functionality', () => {
		it('should create a reactive WeakMap wrapper', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			expect(reactiveWeakMap).toBeInstanceOf(ReactiveWeakMap)
			expect(reactiveWeakMap).toBeInstanceOf(Object)
			// ReactiveWeakMap is a wrapper, not a native WeakMap instance
			expect(reactiveWeakMap).toBeInstanceOf(WeakMap)
		})

		it('should work with reactive() function', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = reactive(weakMap)

			// The reactive wrapper should behave like a WeakMap
			expect(reactiveWeakMap).toBeInstanceOf(WeakMap)
			expect(reactiveWeakMap).toBeInstanceOf(ReactiveWeakMap)
		})

		it('should wrap existing WeakMap with entries', () => {
			const key1 = { id: 1 }
			const key2 = { id: 2 }
			const originalWeakMap = new WeakMap<object, string>([
				[key1, 'value1'],
				[key2, 'value2'],
			])
			const reactiveWeakMap = new ReactiveWeakMap(originalWeakMap)

			expect(reactiveWeakMap.get(key1)).toBe('value1')
			expect(reactiveWeakMap.get(key2)).toBe('value2')
		})
	})

	describe('reactive operations', () => {
		it('should track dependencies when getting values', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key = { id: 1 }
			reactiveWeakMap.set(key, 'test')

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveWeakMap.get(key)
			})

			expect(effectCount).toBe(1)

			// Changing the value should trigger the effect
			reactiveWeakMap.set(key, 'new value')
			expect(effectCount).toBe(2)
		})

		it('should track dependencies when checking existence', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key = { id: 1 }
			reactiveWeakMap.set(key, 'test')

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveWeakMap.has(key)
			})

			expect(effectCount).toBe(1)

			// Deleting the key should trigger the effect
			reactiveWeakMap.delete(key)
			expect(effectCount).toBe(2)
		})

		it('should trigger effects when setting new values', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key = { id: 1 }

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveWeakMap.get(key)
			})

			expect(effectCount).toBe(1)

			// Setting a new value should trigger the effect
			reactiveWeakMap.set(key, 'new value')
			expect(effectCount).toBe(2)
		})

		it('should trigger effects when updating existing values', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key = { id: 1 }
			reactiveWeakMap.set(key, 'old value')

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveWeakMap.get(key)
			})

			expect(effectCount).toBe(1)

			// Updating the value should trigger the effect
			reactiveWeakMap.set(key, 'new value')
			expect(effectCount).toBe(2)
		})

		it('should trigger effects when deleting keys', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key = { id: 1 }
			reactiveWeakMap.set(key, 'test')

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveWeakMap.has(key)
			})

			expect(effectCount).toBe(1)

			// Deleting the key should trigger the effect
			reactiveWeakMap.delete(key)
			expect(effectCount).toBe(2)
		})

		it('should not trigger effects when deleting non-existent keys', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key = { id: 1 }

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveWeakMap.has(key)
			})

			expect(effectCount).toBe(1)

			// Deleting a non-existent key should not trigger the effect
			reactiveWeakMap.delete(key)
			expect(effectCount).toBe(1)
		})
	})

	describe('allProps reactivity', () => {
		it('should trigger allProps effects when setting values', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key1 = { id: 1 }
			const key2 = { id: 2 }

			let allPropsEffectCount = 0
			effect(() => {
				allPropsEffectCount++
				// Access allProps by using a method that iterates
				reactiveWeakMap.has(key1)
				reactiveWeakMap.has(key2)
			})

			expect(allPropsEffectCount).toBe(1)

			// Setting a new value should trigger allProps effects
			reactiveWeakMap.set(key1, 'value1')
			expect(allPropsEffectCount).toBe(2)

			// Setting another value should trigger allProps effects
			reactiveWeakMap.set(key2, 'value2')
			expect(allPropsEffectCount).toBe(3)
		})

		it('should trigger allProps effects when deleting values', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			const key1 = { id: 1 }
			const key2 = { id: 2 }

			reactiveWeakMap.set(key1, 'value1')
			reactiveWeakMap.set(key2, 'value2')

			let allPropsEffectCount = 0
			effect(() => {
				allPropsEffectCount++
				// Access allProps by using a method that iterates
				reactiveWeakMap.has(key1)
				reactiveWeakMap.has(key2)
			})

			expect(allPropsEffectCount).toBe(1)

			// Deleting a value should trigger allProps effects
			reactiveWeakMap.delete(key1)
			expect(allPropsEffectCount).toBe(2)

			// Deleting another value should trigger allProps effects
			reactiveWeakMap.delete(key2)
			expect(allPropsEffectCount).toBe(3)
		})
	})

	describe('WeakMap constraints', () => {
		it('should only accept objects as keys', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)

			// These should work
			const objKey = { id: 1 }
			const arrKey = [1, 2, 3]
			const funcKey = () => {}

			reactiveWeakMap.set(objKey, 'obj value')
			reactiveWeakMap.set(arrKey, 'arr value')
			reactiveWeakMap.set(funcKey, 'func value')

			expect(reactiveWeakMap.get(objKey)).toBe('obj value')
			expect(reactiveWeakMap.get(arrKey)).toBe('arr value')
			expect(reactiveWeakMap.get(funcKey)).toBe('func value')
		})

		it('should not have size property', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)

			// WeakMap should not have a size property
			expect('size' in reactiveWeakMap).toBe(false)
			expect((reactiveWeakMap as any).size).toBeUndefined()
		})

		it('should not have clear method', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)

			// WeakMap should not have a clear method
			expect(typeof (reactiveWeakMap as any).clear).toBe('undefined')
		})
	})

	describe('toStringTag', () => {
		it('should have correct toStringTag', () => {
			const weakMap = new WeakMap<object, string>()
			const reactiveWeakMap = new ReactiveWeakMap(weakMap)
			expect(reactiveWeakMap[Symbol.toStringTag]).toBe('ReactiveWeakMap')
		})
	})
})

describe('ReactiveMap', () => {
	describe('basic functionality', () => {
		it('should create a reactive Map wrapper', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			expect(reactiveMap).toBeInstanceOf(ReactiveMap)
			expect(reactiveMap).toBeInstanceOf(Object)
			// ReactiveMap is a wrapper, not a native Map instance
			expect(reactiveMap).toBeInstanceOf(Map)
		})

		it('should work with reactive() function', () => {
			const map = new Map<string, number>()
			const reactiveMap = reactive(map)

			// The reactive wrapper should behave like a Map
			expect(reactiveMap).toBeInstanceOf(Map)
			expect(reactiveMap).toBeInstanceOf(ReactiveMap)
		})

		it('should wrap existing Map with entries', () => {
			const originalMap = new Map<string, number>([
				['key1', 1],
				['key2', 2],
			])
			const reactiveMap = new ReactiveMap(originalMap)

			expect(reactiveMap.get('key1')).toBe(1)
			expect(reactiveMap.get('key2')).toBe(2)
			expect(reactiveMap.size).toBe(2)
		})

		it('should accept Map instance', () => {
			const originalMap = new Map([
				['key1', 1],
				['key2', 2],
			])
			const reactiveMap = new ReactiveMap(originalMap)

			expect(reactiveMap.get('key1')).toBe(1)
			expect(reactiveMap.get('key2')).toBe(2)
			expect(reactiveMap.size).toBe(2)
		})
	})

	describe('reactive operations', () => {
		it('should track size dependencies', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.size
			})

			expect(effectCount).toBe(1)

			// Adding a key should trigger the effect
			reactiveMap.set('test', 42)
			expect(effectCount).toBe(2)
		})

		it('should track dependencies when getting values', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			reactiveMap.set('test', 42)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.get('test')
			})

			expect(effectCount).toBe(1)

			// Changing the value should trigger the effect
			reactiveMap.set('test', 100)
			expect(effectCount).toBe(2)
		})

		it('should track dependencies when checking existence', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			reactiveMap.set('test', 42)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.has('test')
			})

			expect(effectCount).toBe(1)

			// Deleting the key should trigger the effect
			reactiveMap.delete('test')
			expect(effectCount).toBe(2)
		})

		it('should trigger effects when setting new values', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.get('test')
			})

			expect(effectCount).toBe(1)

			// Setting a new value should trigger the effect
			reactiveMap.set('test', 42)
			expect(effectCount).toBe(2)
		})

		it('should trigger effects when updating existing values', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			reactiveMap.set('test', 42)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.get('test')
			})

			expect(effectCount).toBe(1)

			// Updating the value should trigger the effect
			reactiveMap.set('test', 100)
			expect(effectCount).toBe(2)
		})

		it('should trigger effects when deleting keys', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			reactiveMap.set('test', 42)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.has('test')
			})

			expect(effectCount).toBe(1)

			// Deleting the key should trigger the effect
			reactiveMap.delete('test')
			expect(effectCount).toBe(2)
		})

		it('should not trigger effects when deleting non-existent keys', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.has('test')
			})

			expect(effectCount).toBe(1)

			// Deleting a non-existent key should not trigger the effect
			reactiveMap.delete('test')
			expect(effectCount).toBe(1)
		})
	})

	describe('allProps reactivity', () => {
		it('should trigger allProps effects when setting values', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let allPropsEffectCount = 0
			effect(() => {
				allPropsEffectCount++
				// Access allProps by using iteration methods
				reactiveMap.entries()
			})

			expect(allPropsEffectCount).toBe(1)

			// Setting a new value should trigger allProps effects
			reactiveMap.set('key1', 1)
			expect(allPropsEffectCount).toBe(2)

			// Setting another value should trigger allProps effects
			reactiveMap.set('key2', 2)
			expect(allPropsEffectCount).toBe(3)
		})

		it('should trigger allProps effects when deleting values', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			reactiveMap.set('key1', 1)
			reactiveMap.set('key2', 2)

			let allPropsEffectCount = 0
			effect(() => {
				allPropsEffectCount++
				// Access allProps by using iteration methods
				reactiveMap.keys()
			})

			expect(allPropsEffectCount).toBe(1)

			// Deleting a value should trigger allProps effects
			reactiveMap.delete('key1')
			expect(allPropsEffectCount).toBe(2)

			// Deleting another value should trigger allProps effects
			reactiveMap.delete('key2')
			expect(allPropsEffectCount).toBe(3)
		})

		it('should trigger allProps effects when clearing', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			reactiveMap.set('key1', 1)
			reactiveMap.set('key2', 2)

			let allPropsEffectCount = 0
			effect(() => {
				allPropsEffectCount++
				// Access allProps by using iteration methods
				reactiveMap.values()
			})

			expect(allPropsEffectCount).toBe(1)

			// Clearing should trigger allProps effects
			reactiveMap.clear()
			expect(allPropsEffectCount).toBe(2)
		})
	})

	describe('iteration methods', () => {
		it('should track allProps for entries()', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.entries()
			})

			expect(effectCount).toBe(1)

			// Any map change should trigger the effect
			reactiveMap.set('test', 42)
			expect(effectCount).toBe(2)
		})

		it('should track allProps for forEach()', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.forEach(() => {})
			})

			expect(effectCount).toBe(1)

			// Any map change should trigger the effect
			reactiveMap.set('test', 42)
			expect(effectCount).toBe(2)
		})

		it('should track allProps for keys()', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.keys()
			})

			expect(effectCount).toBe(1)

			// Any map change should trigger the effect
			reactiveMap.set('test', 42)
			expect(effectCount).toBe(2)
		})

		it('should track allProps for values()', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				reactiveMap.values()
			})

			expect(effectCount).toBe(1)

			// Any map change should trigger the effect
			reactiveMap.set('test', 42)
			expect(effectCount).toBe(2)
		})

		it('should track allProps for Symbol.iterator', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let effectCount = 0
			effect(() => {
				effectCount++
				for (const [_key, _value] of reactiveMap) {
					// Just iterate to trigger allProps dependency
				}
			})

			expect(effectCount).toBe(1)

			// Any map change should trigger the effect
			reactiveMap.set('test', 42)
			expect(effectCount).toBe(2)
		})
	})

	describe('clear method', () => {
		it('should trigger size and allProps effects when clearing', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			reactiveMap.set('key1', 1)
			reactiveMap.set('key2', 2)

			let sizeEffectCount = 0
			let allPropsEffectCount = 0

			effect(() => {
				sizeEffectCount++
				reactiveMap.size
			})

			effect(() => {
				allPropsEffectCount++
				reactiveMap.entries()
			})

			expect(sizeEffectCount).toBe(1)
			expect(allPropsEffectCount).toBe(1)

			// Clearing should trigger both effects
			reactiveMap.clear()
			expect(sizeEffectCount).toBe(2)
			expect(allPropsEffectCount).toBe(2)
		})

		it('should not trigger effects when clearing empty map', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)

			let sizeEffectCount = 0
			let allPropsEffectCount = 0

			effect(() => {
				sizeEffectCount++
				reactiveMap.size
			})

			effect(() => {
				allPropsEffectCount++
				reactiveMap.entries()
			})

			expect(sizeEffectCount).toBe(1)
			expect(allPropsEffectCount).toBe(1)

			// Clearing empty map should not trigger effects
			reactiveMap.clear()
			expect(sizeEffectCount).toBe(1)
			expect(allPropsEffectCount).toBe(1)
		})
	})

	describe('static methods', () => {
		it('should create ReactiveMap from existing Map', () => {
			const originalMap = new Map([
				['key1', 1],
				['key2', 2],
			])
			const reactiveMap = new ReactiveMap(originalMap)
			expect(reactiveMap).toBeInstanceOf(ReactiveMap)
			expect(reactiveMap.size).toBe(2)
			expect(reactiveMap.get('key1')).toBe(1)
			expect(reactiveMap.get('key2')).toBe(2)
		})

		it('should work with reactive() function on existing Map', () => {
			const originalMap = new Map([
				['key1', 1],
				['key2', 2],
			])
			const reactiveMap = reactive(originalMap)
			expect(reactiveMap).toBeInstanceOf(ReactiveMap)
			expect(reactiveMap.size).toBe(2)
			expect(reactiveMap.get('key1')).toBe(1)
			expect(reactiveMap.get('key2')).toBe(2)
		})
	})

	describe('toStringTag', () => {
		it('should have correct toStringTag', () => {
			const map = new Map<string, number>()
			const reactiveMap = new ReactiveMap(map)
			expect(reactiveMap[Symbol.toStringTag]).toBe('Map')
		})
	})

	describe('seamless reactive integration', () => {
		describe('native Map integration', () => {
			it('should automatically create ReactiveMap when using reactive() on native Map', () => {
				const nativeMap = new Map([
					['key1', 1],
					['key2', 2],
				])
				const reactiveMap = reactive(nativeMap)

				// Should be a ReactiveMap instance
				expect(reactiveMap).toBeInstanceOf(ReactiveMap)
				// Should still behave like a Map
				expect(reactiveMap.get('key1')).toBe(1)
				expect(reactiveMap.get('key2')).toBe(2)
				expect(reactiveMap.size).toBe(2)
			})

			it('should track dependencies when accessing reactive native Map', () => {
				const nativeMap = new Map([['key1', 1]])
				const reactiveMap = reactive(nativeMap)

				let effectCount = 0
				effect(() => {
					effectCount++
					reactiveMap.get('key1')
				})

				expect(effectCount).toBe(1)

				// Modifying the reactive map should trigger effects
				reactiveMap.set('key1', 100)
				expect(effectCount).toBe(2)
			})

			it('should track size dependencies on reactive native Map', () => {
				const nativeMap = new Map([['key1', 1]])
				const reactiveMap = reactive(nativeMap)

				let effectCount = 0
				effect(() => {
					effectCount++
					reactiveMap.size
				})

				expect(effectCount).toBe(1)

				// Adding a key should trigger size effect
				reactiveMap.set('key2', 2)
				expect(effectCount).toBe(2)
			})

			it('should track allProps dependencies on reactive native Map', () => {
				const nativeMap = new Map([['key1', 1]])
				const reactiveMap = reactive(nativeMap)

				let effectCount = 0
				effect(() => {
					effectCount++
					reactiveMap.entries()
				})

				expect(effectCount).toBe(1)

				// Any map change should trigger allProps effect
				reactiveMap.set('key2', 2)
				expect(effectCount).toBe(2)
			})

			it('should handle clear operations on reactive native Map', () => {
				const nativeMap = new Map([
					['key1', 1],
					['key2', 2],
				])
				const reactiveMap = reactive(nativeMap)

				let sizeEffectCount = 0
				let allPropsEffectCount = 0

				effect(() => {
					sizeEffectCount++
					reactiveMap.size
				})

				effect(() => {
					allPropsEffectCount++
					reactiveMap.keys()
				})

				expect(sizeEffectCount).toBe(1)
				expect(allPropsEffectCount).toBe(1)

				// Clearing should trigger both effects
				reactiveMap.clear()
				expect(sizeEffectCount).toBe(2)
				expect(allPropsEffectCount).toBe(2)
			})
		})

		describe('native WeakMap integration', () => {
			it('should automatically create ReactiveWeakMap when using reactive() on native WeakMap', () => {
				const key1 = { id: 1 }
				const key2 = { id: 2 }
				const nativeWeakMap = new WeakMap([
					[key1, 'value1'],
					[key2, 'value2'],
				])
				const reactiveWeakMap = reactive(nativeWeakMap)

				// Should be a ReactiveWeakMap instance
				expect(reactiveWeakMap).toBeInstanceOf(ReactiveWeakMap)
				// Should still behave like a WeakMap
				expect(reactiveWeakMap.get(key1)).toBe('value1')
				expect(reactiveWeakMap.get(key2)).toBe('value2')
			})

			it('should track dependencies when accessing reactive native WeakMap', () => {
				const key = { id: 1 }
				const nativeWeakMap = new WeakMap([[key, 'value']])
				const reactiveWeakMap = reactive(nativeWeakMap)

				let effectCount = 0
				effect(() => {
					effectCount++
					reactiveWeakMap.get(key)
				})

				expect(effectCount).toBe(1)

				// Modifying the reactive weak map should trigger effects
				reactiveWeakMap.set(key, 'new value')
				expect(effectCount).toBe(2)
			})

			it('should handle delete operations on reactive native WeakMap', () => {
				const key = { id: 1 }
				const nativeWeakMap = new WeakMap([[key, 'value']])
				const reactiveWeakMap = reactive(nativeWeakMap)

				let effectCount = 0
				effect(() => {
					effectCount++
					reactiveWeakMap.has(key)
				})

				expect(effectCount).toBe(1)

				// Deleting the key should trigger effects
				reactiveWeakMap.delete(key)
				expect(effectCount).toBe(2)
			})
		})

		describe('mixed usage scenarios', () => {
			it('should work with both reactive Map and WeakMap in same effect', () => {
				const nativeMap = new Map([['key1', 1]])
				const key = { id: 1 }
				const nativeWeakMap = new WeakMap([[key, 'value']])

				const reactiveMap = reactive(nativeMap)
				const reactiveWeakMap = reactive(nativeWeakMap)

				let effectCount = 0
				effect(() => {
					effectCount++
					reactiveMap.get('key1')
					reactiveWeakMap.get(key)
				})

				expect(effectCount).toBe(1)

				// Modifying either should trigger the effect
				reactiveMap.set('key1', 100)
				expect(effectCount).toBe(2)

				reactiveWeakMap.set(key, 'new value')
				expect(effectCount).toBe(3)
			})

			it('should handle nested reactive structures', () => {
				const nativeMap = new Map([['config', { enabled: true }]])
				const reactiveMap = reactive(nativeMap)

				let effectCount = 0
				effect(() => {
					effectCount++
					const config = reactiveMap.get('config')
					if (config?.enabled) {
						// Access nested property
					}
				})

				expect(effectCount).toBe(1)

				// Modifying the map should trigger effects
				reactiveMap.set('config', { enabled: false })
				expect(effectCount).toBe(2)
			})

			it('should work with reactive() called multiple times', () => {
				const nativeMap = new Map([['key1', 1]])
				const reactiveMap1 = reactive(nativeMap)
				const reactiveMap2 = reactive(nativeMap)

				// Should return the same reactive instance
				expect(reactiveMap1).toBe(reactiveMap2)
				expect(reactiveMap1).toBeInstanceOf(ReactiveMap)
			})

			it('should handle empty maps and weak maps', () => {
				const emptyMap = reactive(new Map())
				const emptyWeakMap = reactive(new WeakMap())

				expect(emptyMap).toBeInstanceOf(ReactiveMap)
				expect(emptyWeakMap).toBeInstanceOf(ReactiveWeakMap)
				expect(emptyMap.size).toBe(0)
			})
		})
	})
})
