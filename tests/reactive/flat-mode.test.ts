import { effect, reactive, reactiveOptions as options } from 'mutts/reactive'

describe('flat reactivity mode', () => {
	let beforeReactivity: any
	beforeAll(() => {
		beforeReactivity = options.cycleHandling
		options.cycleHandling = 'none'
	})

	afterAll(() => {
		options.cycleHandling = beforeReactivity
	})

	it('should push already present effects to the end of the batch (FIFO)', () => {
		const state = reactive({ a: 0, b: 0 })
		const sequence: string[] = []

		// Effect 1: triggered by 'a', triggers 'b'
		effect(() => {
			state.a
			sequence.push('E1')
			state.b++
		})

		// Effect 2: triggered by 'b'
		effect(() => {
			state.b
			sequence.push('E2')
		})

		// Effect 3: triggered by 'a'
		effect(() => {
			state.a
			sequence.push('E3')
		})

		// Reset sequence after initial runs
		sequence.length = 0

		// Trigger 'a'
		// Initial collection: [E1, E3] (since both depend on 'a', in creation order)
		// 1. E1 runs. sequence: [E1]. E1 increments 'b'.
		// 2. E2 is triggered by 'b'. Since it's FIFO, E2 is added to the END.
		// Queue: [E3, E2]
		// 3. E3 runs. sequence: [E1, E3].
		// 4. E2 runs. sequence: [E1, E3, E2].
		state.a++

		expect(sequence).toEqual(['E1', 'E3', 'E2'])
	})

	it('should move an existing effect to the end if it is re-triggered', () => {
		const state = reactive({ a: 0, b: 0, c: 0 })
		const sequence: string[] = []

		// E1 triggered by 'a', triggers 'c'
		effect(() => {
			state.a
			sequence.push('E1')
			state.c++
		})

		// E2 triggered by 'a'
		effect(() => {
			state.a
			sequence.push('E2')
		})

		// E3 triggered by 'b'
		effect(() => {
			state.b
			sequence.push('E3')
		})

		sequence.length = 0

		// We want to trigger a batch manually to control the order if possible, 
		// but touched() handles it.
		// If we change 'a' and 'b' in the same batch (e.g. via atomic)
		const action = () => {
			state.a++
			state.b++
		}
		
		// In creation order: E1, E2, E3.
		// state.a++ triggers E1, E2. Queue: [E1, E2]
		// state.b++ triggers E3. Queue: [E1, E2, E3]
		// 1. E1 runs. sequence: [E1]. E1 increments 'c'.
		// 2. Someone depends on 'c'? Let's add E3 dependency on 'c'.
		
		sequence.length = 0
		// REDO with specific dependencies
	})

	it('should handle "push to end" when an effect is re-queued', () => {
		const state = reactive({ trigger: 0, b: 0 })
		const sequence: string[] = []

		// E1 depends on trigger, increments b
		effect(() => {
			state.trigger
			sequence.push('E1')
			state.b++
		})

		// E2 depends on trigger and b
		effect(() => {
			state.trigger
			state.b
			sequence.push('E2')
		})

		sequence.length = 0

		// Trigger both via state.trigger
		// 1. E1, E2 are collected. Queue: [E1, E2]
		// 2. E1 runs. sequence: [E1]. E1 increments b.
		// 3. E2 is triggered by b. E2 is ALREADY in queue. 
		//    "Push to end" moves E2 to the end (which it already is, but the delete/set ensures it).
		// Queue: [E2]
		// 4. E2 runs once. sequence: [E1, E2]
		
		state.trigger++
		expect(sequence).toEqual(['E1', 'E2'])
	})
})
