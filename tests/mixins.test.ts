import { mixin } from 'mutts/mixins'

describe('Mixins', () => {
	describe('mixin', () => {
		it('should work as a base class', () => {
			const CounterMixin = mixin((base) => {
				return class extends base {
					count = 0

					increment() {
						this.count++
					}

					getCount() {
						return this.count
					}
				}
			})
			class MyClass extends CounterMixin {
				name = 'test'
			}

			const instance = new MyClass()
			expect(instance.name).toBe('test')
			expect(instance.count).toBe(0)

			instance.increment()
			expect(instance.getCount()).toBe(1)
		})

		it('should work as a mixin function', () => {
			const CounterMixin = mixin((base) => {
				return class extends base {
					count = 0

					increment() {
						this.count++
					}

					getCount() {
						return this.count
					}
				}
			})
			class BaseClass {
				value = 42
			}

			class MyClass extends CounterMixin(BaseClass) {
				name = 'test'
			}

			const instance = new MyClass()
			expect(instance.value).toBe(42)
			expect(instance.name).toBe('test')
			expect(instance.count).toBe(0)

			instance.increment()
			expect(instance.getCount()).toBe(1)
		})

		it('should cache mixin results', () => {
			const CounterMixin = mixin((base) => {
				return class extends base {
					count = 0

					increment() {
						this.count++
					}
				}
			})

			class BaseClass {
				value = 42
			}

			const MixedClass1 = CounterMixin(BaseClass)
			const MixedClass2 = CounterMixin(BaseClass)

			expect(MixedClass1).toBe(MixedClass2)
		})

		it('should throw error when called without base class', () => {
			const CounterMixin = mixin((base) => {
				return class extends base {
					count = 0
				}
			})

			expect(() => (CounterMixin as any)()).toThrow('Mixin requires a base class')
		})

		it('should throw error when called with non-function', () => {
			const CounterMixin = mixin((base) => {
				return class extends base {
					count = 0
				}
			})

			expect(() => (CounterMixin as any)('not a function')).toThrow(
				'Mixin requires a constructor function'
			)
		})

		it('should work with eventful-like functionality', () => {
			const EventfulMixin = mixin((base) => {
				return class extends base {
					events = new Map()

					on(event: string, callback: Function) {
						if (!this.events.has(event)) {
							this.events.set(event, [])
						}
						this.events.get(event)!.push(callback)
					}

					emit(event: string, ...args: any[]) {
						const callbacks = this.events.get(event) || []
						callbacks.forEach((cb) => cb(...args))
					}
				}
			})

			class BaseClass {
				value = 42
			}

			class MyClass extends EventfulMixin(BaseClass) {
				name = 'test'
			}

			const instance = new MyClass()
			expect(instance.value).toBe(42)
			expect(instance.name).toBe('test')

			let called = false
			instance.on('test', () => {
				called = true
			})
			instance.emit('test')
			expect(called).toBe(true)
		})

		it('should work with mixin composition for Reactive<Eventful<Events>>(Eventful) pattern', () => {
			// Define event types
			interface MyEvents {
				userLogin: (userId: string, timestamp: Date) => void
				dataUpdate: (data: any[]) => void
				error: (error: Error) => void
			}

			// Create Eventful mixin
			const EventfulMixin = mixin((base) => {
				return class extends base {
					#events = new Map<keyof MyEvents, ((...args: any[]) => void)[]>()

					on<EventType extends keyof MyEvents>(
						event: EventType,
						cb: MyEvents[EventType]
					): () => void {
						if (!this.#events.has(event)) {
							this.#events.set(event, [])
						}
						this.#events.get(event)!.push(cb)
						return () => {
							const callbacks = this.#events.get(event)
							if (callbacks) {
								const index = callbacks.indexOf(cb)
								if (index > -1) callbacks.splice(index, 1)
							}
						}
					}

					emit<EventType extends keyof MyEvents>(
						event: EventType,
						...args: Parameters<MyEvents[EventType]>
					) {
						const callbacks = this.#events.get(event) || []
						callbacks.forEach((cb) => cb(...args))
					}
				}
			})

			// Create Reactive mixin that wraps Eventful
			const ReactiveMixin = mixin((base) => {
				return class extends base {
					// Add reactive functionality here
					// This would typically wrap the base class with reactive proxies
				}
			})

			// Create the composition: Reactive<Eventful<Events>>(Eventful)
			const ReactiveEventful = ReactiveMixin(EventfulMixin)

			class MyClass extends ReactiveEventful {
				name = 'test'
			}

			const instance = new MyClass()
			expect(instance.name).toBe('test')

			// Test event functionality
			let called = false
			instance.on('userLogin', (userId, timestamp) => {
				called = true
				expect(userId).toBe('user123')
				expect(timestamp).toBeInstanceOf(Date)
			})

			instance.emit('userLogin', 'user123', new Date())
			expect(called).toBe(true)
		})
	})
})
