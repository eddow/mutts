import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { resource, reactive, effect, unwrap, reset } from '../../src/entry-browser'
import { watchers } from '../../src/reactive/registry'

describe('resource', () => {
	beforeEach(() => {
		reset()
	})

	afterEach(() => {
		reset()
	})

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
		void r.loading // Trigger lazy init

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

	it('should not stall after multiple async transitions (parenting trap regression)', async () => {
		const state = reactive({ id: 1 })
		const log: string[] = []

		const r = resource(async () => {
			const id = state.id
			await new Promise(resolve => setTimeout(resolve, 5))
			return `page-${id}`
		})
		void r.loading // Trigger lazy init
		// Observe the resource value via an effect to simulate a render effect
		effect(() => {
			if (r.value !== undefined) log.push(r.value)
		})

		// Wait for initial fetch (id=1)
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-1')

		// Transition 1→2
		state.id = 2
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-2')

		// Transition 2→3 — this is the one that stalled before the fix
		state.id = 3
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-3')

		// Transition 3→4 — extra check for stability
		state.id = 4
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-4')
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(log).toEqual(['page-1', 'page-2', 'page-3', 'page-4'])
	})

	it('should not stall with zone-restored .then() (browser polyfill scenario)', async () => {
		// Simulate the browser async polyfill scenario:
		// .then() callbacks run with effectHistory restored to the resource effect

		const state = reactive({ postId: 1 })

		const r = resource(async () => {
			const id = state.postId
			await new Promise(resolve => setTimeout(resolve, 5))
			return `Post ${id}`
		})

		const rendered: string[] = []
		effect(() => {
			rendered.push(`${r.value ?? '(loading)'}`)
		})

		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('Post 1')

		// Check that postId is still tracked
		const stateRaw = unwrap(state)
		const stateWatchers = watchers.get(stateRaw)
		const postIdDeps = stateWatchers?.get('postId')
		expect(postIdDeps?.size).toBeGreaterThan(0)

		state.postId = 2
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('Post 2')
	})

	it('should not stall after multiple async transitions (parenting trap regression)', async () => {
		const state = reactive({ id: 1 })
		const log: string[] = []

		const r = resource(async () => {
			const id = state.id
			await new Promise(resolve => setTimeout(resolve, 5))
			return `page-${id}`
		})
		void r.loading // Trigger lazy init
		// Observe the resource value via an effect to simulate a render effect
		effect(() => {
			if (r.value !== undefined) log.push(r.value)
		})

		// Wait for initial fetch (id=1)
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-1')

		// Transition 1→2
		state.id = 2
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-2')

		// Transition 2→3 — this is the one that stalled before the fix
		state.id = 3
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-3')

		// Transition 3→4 — extra check for stability
		state.id = 4
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('page-4')
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(log).toEqual(['page-1', 'page-2', 'page-3', 'page-4'])
	})

	it('should not stall with zone-restored .then() (browser polyfill scenario)', async () => {
		// Simulate the browser async polyfill scenario:
		// .then() callbacks run with effectHistory restored to the resource effect

		const state = reactive({ postId: 1 })

		const r = resource(async () => {
			const id = state.postId
			await new Promise(resolve => setTimeout(resolve, 5))
			return `Post ${id}`
		})

		const rendered: string[] = []
		effect(() => {
			rendered.push(`${r.value ?? '(loading)'}`)
		})

		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('Post 1')

		// Check that postId is still tracked
		const stateRaw = unwrap(state)
		const stateWatchers = watchers.get(stateRaw)
		const postIdDeps = stateWatchers?.get('postId')
		expect(postIdDeps?.size).toBeGreaterThan(0)

		state.postId = 2
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(r.value).toBe('Post 2')
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

	it('should provide AbortSignal and abort it on re-run', async () => {
		const state = reactive({ id: 1 })
		const signals: AbortSignal[] = []
		
		const r = resource(async ({ signal }) => {
			signals.push(signal)
			const id = state.id // Track state.id
			await new Promise(resolve => setTimeout(resolve, 50))
			return `item-${id}`
		})
		void r.loading // Trigger lazy init

		await new Promise(resolve => setTimeout(resolve, 5))
		expect(signals.length).toBe(1)
		expect(signals[0].aborted).toBe(false)

		// Trigger re-run
		state.id = 2
		await new Promise(resolve => setTimeout(resolve, 5))
		
		expect(signals.length).toBe(2)
		expect(signals[0].aborted).toBe(true)
		expect(signals[0].reason?.message).toContain('Effect aborted')
		expect(signals[1].aborted).toBe(false)
		
		await new Promise(resolve => setTimeout(resolve, 60))
		expect(r.value).toBe('item-2')
	})
})
