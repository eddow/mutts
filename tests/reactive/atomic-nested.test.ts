
import { atomic, batch } from '../../src/reactive/effects'

describe('Atomic Decorator Nested', () => {
	it('should propagate return value in nested immediate batch', () => {
		class TestClass {
			@atomic
			method() {
				return 42
			}
		}

		const instance = new TestClass()

		// Simulating being inside a batch (like the game loop)
		let result: any
		batch(() => {
			result = instance.method()
		}, 'immediate')

		expect(result).toBe(42)
	})

	it('should propagate return value in nested non-immediate batch', () => {
		class TestClass {
			@atomic
			method() {
				return 100
			}
		}

		const instance = new TestClass()

		let result: any
		batch(() => {
			result = instance.method()
		})

		expect(result).toBe(100)
	})
})
