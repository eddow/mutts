import { Eventful } from './eventful'

describe('Eventful', () => {
	// Define test event types
	interface TestEvents extends Record<string, (...args: any[]) => void> {
		userLogin: (userId: string, timestamp: Date) => void
		dataUpdate: (data: any[]) => void
		error: (error: Error) => void
		simple: () => void
		withNumber: (value: number) => void
	}

	class TestEventful extends Eventful<TestEvents> {
		// Test class that extends Eventful
		// Just make `emit` public for testing
		public emit<EventType extends keyof TestEvents>(
			event: EventType,
			...args: Parameters<TestEvents[EventType]>
		) {
			super.emit(event, ...args)
		}
	}

	describe('basic functionality', () => {
		it('should register and emit single events', () => {
			const eventful = new TestEventful()
			let callCount = 0
			let receivedUserId = ''
			let receivedTimestamp: Date | null = null

			eventful.on('userLogin', (userId, timestamp) => {
				callCount++
				receivedUserId = userId
				receivedTimestamp = timestamp
			})

			const testDate = new Date()
			eventful.emit('userLogin', 'user123', testDate)

			expect(callCount).toBe(1)
			expect(receivedUserId).toBe('user123')
			expect(receivedTimestamp).toBe(testDate)
		})

		it('should register and emit events with no parameters', () => {
			const eventful = new TestEventful()
			let callCount = 0

			eventful.on('simple', () => {
				callCount++
			})

			eventful.emit('simple')

			expect(callCount).toBe(1)
		})

		it('should register and emit events with primitive parameters', () => {
			const eventful = new TestEventful()
			let receivedValue = 0

			eventful.on('withNumber', (value) => {
				receivedValue = value
			})

			eventful.emit('withNumber', 42)

			expect(receivedValue).toBe(42)
		})
	})

	describe('multiple listeners', () => {
		it('should support multiple listeners for the same event', () => {
			const eventful = new TestEventful()
			let callCount1 = 0
			let callCount2 = 0

			eventful.on('simple', () => callCount1++)
			eventful.on('simple', () => callCount2++)

			eventful.emit('simple')

			expect(callCount1).toBe(1)
			expect(callCount2).toBe(1)
		})

		it('should call all listeners in registration order', () => {
			const eventful = new TestEventful()
			const callOrder: number[] = []

			eventful.on('simple', () => callOrder.push(1))
			eventful.on('simple', () => callOrder.push(2))
			eventful.on('simple', () => callOrder.push(3))

			eventful.emit('simple')

			expect(callOrder).toEqual([1, 2, 3])
		})
	})

	describe('unsubscribe functionality', () => {
		it('should return unsubscribe function for single event', () => {
			const eventful = new TestEventful()
			let callCount = 0

			const unsubscribe = eventful.on('simple', () => callCount++)

			eventful.emit('simple')
			expect(callCount).toBe(1)

			unsubscribe()
			eventful.emit('simple')
			expect(callCount).toBe(1) // Should not increment
		})

		it('should unsubscribe specific callback when provided', () => {
			const eventful = new TestEventful()
			let callCount1 = 0
			let callCount2 = 0

			const callback1 = () => callCount1++
			const callback2 = () => callCount2++

			eventful.on('simple', callback1)
			eventful.on('simple', callback2)

			eventful.emit('simple')
			expect(callCount1).toBe(1)
			expect(callCount2).toBe(1)

			eventful.off('simple', callback1)
			eventful.emit('simple')
			expect(callCount1).toBe(1) // Should not increment
			expect(callCount2).toBe(2) // Should still increment
		})

		it('should remove all listeners when no callback provided to off', () => {
			const eventful = new TestEventful()
			let callCount1 = 0
			let callCount2 = 0

			eventful.on('simple', () => callCount1++)
			eventful.on('simple', () => callCount2++)

			eventful.emit('simple')
			expect(callCount1).toBe(1)
			expect(callCount2).toBe(1)

			eventful.off('simple')
			eventful.emit('simple')
			expect(callCount1).toBe(1) // Should not increment
			expect(callCount2).toBe(1) // Should not increment
		})
	})

	describe('bulk event registration', () => {
		it('should register multiple events at once', () => {
			const eventful = new TestEventful()
			let loginCount = 0
			let dataCount = 0
			let errorCount = 0

			eventful.on({
				userLogin: () => loginCount++,
				dataUpdate: () => dataCount++,
				error: () => errorCount++,
			})

			eventful.emit('userLogin', 'user123', new Date())
			eventful.emit('dataUpdate', [1, 2, 3])
			eventful.emit('error', new Error('test'))

			expect(loginCount).toBe(1)
			expect(dataCount).toBe(1)
			expect(errorCount).toBe(1)
		})

		it('should unsubscribe multiple events at once', () => {
			const eventful = new TestEventful()
			let loginCount = 0
			let dataCount = 0

			const loginCallback = () => loginCount++
			const dataCallback = () => dataCount++

			eventful.on('userLogin', loginCallback)
			eventful.on('dataUpdate', dataCallback)

			eventful.emit('userLogin', 'user123', new Date())
			eventful.emit('dataUpdate', [1, 2, 3])
			expect(loginCount).toBe(1)
			expect(dataCount).toBe(1)

			eventful.off({
				userLogin: loginCallback,
				dataUpdate: dataCallback,
			})

			eventful.emit('userLogin', 'user123', new Date())
			eventful.emit('dataUpdate', [1, 2, 3])
			expect(loginCount).toBe(1) // Should not increment
			expect(dataCount).toBe(1) // Should not increment
		})
	})

	describe('global hooks', () => {
		it('should call global hooks for all events', () => {
			const eventful = new TestEventful()
			const hookCalls: Array<{ event: string; args: any[] }> = []

			eventful.hook((event, ...args) => {
				hookCalls.push({ event: String(event), args })
			})

			eventful.emit('userLogin', 'user123', new Date())
			eventful.emit('simple')
			eventful.emit('withNumber', 42)

			expect(hookCalls).toHaveLength(3)
			expect(hookCalls[0].event).toBe('userLogin')
			expect(hookCalls[0].args).toEqual(['user123', expect.any(Date)])
			expect(hookCalls[1].event).toBe('simple')
			expect(hookCalls[1].args).toEqual([])
			expect(hookCalls[2].event).toBe('withNumber')
			expect(hookCalls[2].args).toEqual([42])
		})

		it('should support multiple global hooks', () => {
			const eventful = new TestEventful()
			let hook1Count = 0
			let hook2Count = 0

			eventful.hook(() => hook1Count++)
			eventful.hook(() => hook2Count++)

			eventful.emit('simple')

			expect(hook1Count).toBe(1)
			expect(hook2Count).toBe(1)
		})

		it('should return unsubscribe function for hooks', () => {
			const eventful = new TestEventful()
			let hookCount = 0

			const unsubscribe = eventful.hook(() => hookCount++)

			eventful.emit('simple')
			expect(hookCount).toBe(1)

			unsubscribe()
			eventful.emit('simple')
			expect(hookCount).toBe(1) // Should not increment
		})

		it('should prevent duplicate hook registration', () => {
			const eventful = new TestEventful()
			let hookCount = 0

			const hookCallback = () => hookCount++

			eventful.hook(hookCallback)
			eventful.hook(hookCallback) // Should not add duplicate

			eventful.emit('simple')
			expect(hookCount).toBe(1) // Should only be called once
		})
	})

	describe('combined functionality', () => {
		it('should call both specific listeners and global hooks', () => {
			const eventful = new TestEventful()
			let specificCount = 0
			let hookCount = 0

			eventful.on('simple', () => specificCount++)
			eventful.hook(() => hookCount++)

			eventful.emit('simple')

			expect(specificCount).toBe(1)
			expect(hookCount).toBe(1)
		})

		it('should handle complex event scenarios', () => {
			const eventful = new TestEventful()
			const events: string[] = []

			// Register multiple listeners
			eventful.on('userLogin', () => events.push('login1'))
			eventful.on('userLogin', () => events.push('login2'))
			eventful.on('dataUpdate', () => events.push('data1'))

			// Register global hook
			eventful.hook((event, ..._args) => {
				events.push(`hook:${String(event)}`)
			})

			// Emit events
			eventful.emit('userLogin', 'user123', new Date())
			eventful.emit('dataUpdate', [1, 2, 3])

			expect(events).toEqual(['login1', 'login2', 'hook:userLogin', 'data1', 'hook:dataUpdate'])
		})
	})

	describe('edge cases', () => {
		it('should handle emitting events with no listeners', () => {
			const eventful = new TestEventful()

			// Should not throw
			expect(() => {
				eventful.emit('userLogin', 'user123', new Date())
				eventful.emit('simple')
			}).not.toThrow()
		})

		it('should handle unsubscribing non-existent callbacks', () => {
			const eventful = new TestEventful()

			// Should not throw
			expect(() => {
				eventful.off('simple', () => {})
				eventful.off('simple')
			}).not.toThrow()
		})

		it('should handle unsubscribing from non-existent events', () => {
			const eventful = new TestEventful()

			// Should not throw
			expect(() => {
				eventful.off('nonExistentEvent' as any)
			}).not.toThrow()
		})

		it('should handle multiple unsubscribes of the same callback', () => {
			const eventful = new TestEventful()
			let callCount = 0

			const callback = () => callCount++
			const unsubscribe = eventful.on('simple', callback)

			eventful.emit('simple')
			expect(callCount).toBe(1)

			unsubscribe()
			unsubscribe() // Should not throw
			unsubscribe() // Should not throw

			eventful.emit('simple')
			expect(callCount).toBe(1) // Should not increment
		})
	})

	describe('type safety', () => {
		it('should enforce correct parameter types', () => {
			const eventful = new TestEventful()

			// These should compile without errors
			eventful.on('userLogin', (userId: string, timestamp: Date) => {
				expect(typeof userId).toBe('string')
				expect(timestamp).toBeInstanceOf(Date)
			})

			eventful.on('dataUpdate', (data: any[]) => {
				expect(Array.isArray(data)).toBe(true)
			})

			eventful.on('error', (error: Error) => {
				expect(error).toBeInstanceOf(Error)
			})

			// Emit with correct types
			eventful.emit('userLogin', 'user123', new Date())
			eventful.emit('dataUpdate', [1, 2, 3])
			eventful.emit('error', new Error('test'))
		})
	})
})
