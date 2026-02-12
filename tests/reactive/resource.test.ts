import { describe, expect, it, vi } from 'vitest'
import { resource } from '../../src/reactive/watch'
import { reactive } from '../../src/reactive/proxy'

describe('resource', () => {
	it('should load initial value (async)', () => {
		const r = resource(async () => 'hello', { initialValue: 'init' })
		// Async fetcher returns a Promise, so initial value is preserved synchronously
		expect(r.value).toBe('init')
		expect(r.latest).toBe('init')
		expect(r.loading).toBe(true)
		
		// Wait for effect
		return new Promise<void>(resolve => {
			setTimeout(() => {
				expect(r.value).toBe('hello')
				expect(r.loading).toBe(false)
				resolve()
			}, 0)
		})
	})
	
	it('should load value immediately (sync)', () => {
		const r = resource(() => 'hello', { initialValue: 'init' })
		// Sync fetcher runs immediately
		expect(r.value).toBe('hello')
		expect(r.latest).toBe('hello')
		expect(r.loading).toBe(false)
	})

	it('should handle async fetch', async () => {
		const r = resource(async () => {
			await new Promise(resolve => setTimeout(resolve, 10))
			return 'loaded'
		})

		expect(r.loading).toBe(true)
		expect(r.value).toBeUndefined()

		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.loading).toBe(false)
		expect(r.value).toBe('loaded')
	})

	it('should handle errors', async () => {
		const r = resource(async () => {
			throw new Error('fail')
		})

		await new Promise(resolve => setTimeout(resolve, 10))
		expect(r.loading).toBe(false)
		expect(r.error).toBeInstanceOf(Error)
		expect(r.error.message).toBe('fail')
	})

	it('should react to dependencies', async () => {
		const state = reactive({ id: 1 })
		const r = resource(() => `item-${state.id}`)

		await new Promise(resolve => setTimeout(resolve, 0))
		expect(r.value).toBe('item-1')

		state.id = 2
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(r.value).toBe('item-2')
	})

	it('should handle race conditions', async () => {
		const state = reactive({ id: 1 })
		
		// Mock fetcher that takes longer for id=1 than id=2
		const r = resource(async () => {
			const id = state.id
			if (id === 1) {
				await new Promise(resolve => setTimeout(resolve, 50))
				return 'slow-1'
			} else {
				await new Promise(resolve => setTimeout(resolve, 10))
				return 'fast-2'
			}
		})

		// Trigger fetch 1
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(r.loading).toBe(true)

		// Trigger fetch 2 immediately
		state.id = 2
		
		// Wait for fetch 2 to complete
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('fast-2')
		expect(r.loading).toBe(false)

		// Wait for fetch 1 to complete (should be ignored)
		await new Promise(resolve => setTimeout(resolve, 40))
		expect(r.value).toBe('fast-2')
		expect(r.loading).toBe(false)
	})
	
	it('should reload manually', async () => {
		let count = 0
		const r = resource(() => ++count)
		
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(r.value).toBe(1)
		
		r.reload()
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(r.value).toBe(2)
	})
})
