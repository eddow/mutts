import { biDi, reactive, reactiveOptions } from 'mutts/reactive'

describe('biDi', () => {
	it('should create bidirectional binding without infinite loops', () => {
		const model = reactive({ value: 'initial' })
		const external = { value: 'initial' }
		
		let externalUpdates = 0
		let modelUpdates = 0
		
		// Bidirectional binding
		const provide = biDi(
			(v) => {
				external.value = v
				externalUpdates++
			},
			() => model.value,
			(v) => {
				model.value = v
				modelUpdates++
			}
		)
		
		// Initial state - effect runs once
		expect(externalUpdates).toBe(1)
		expect(modelUpdates).toBe(0)
		expect(external.value).toBe('initial')
		
		// Change from external side (simulating user input)
		provide('external1')
		expect(externalUpdates).toBe(1) // Should NOT update (no loop)
		expect(modelUpdates).toBe(1)    // Should update once
		expect(model.value).toBe('external1')
		
		// Change from reactive side
		model.value = 'reactive1'
		expect(externalUpdates).toBe(2) // Should update
		expect(modelUpdates).toBe(1)
		expect(model.value).toBe('reactive1')
		expect(external.value).toBe('reactive1')
		
		// Change from external again
		provide('external2')
		expect(externalUpdates).toBe(2) // Should NOT loop
		expect(modelUpdates).toBe(2)
		expect(model.value).toBe('external2')
	})
	
	it('should work with object syntax for get/set', () => {
		const model = reactive({ value: '' })
		const external = { value: '' }
		
		let updates = 0
		
		const provide = biDi(
			(v) => {
				external.value = v
				updates++
			},
			{ get: () => model.value, set: (v) => model.value = v }
		)
		
		// Initial sync
		expect(updates).toBe(1)
		expect(external.value).toBe('')
		
		// External change
		provide('test')
		expect(updates).toBe(1) // No loop
		expect(model.value).toBe('test')
		
		// Reactive change
		model.value = 'changed'
		expect(updates).toBe(2)
		expect(external.value).toBe('changed')
	})
	
	it('should handle rapid successive updates', () => {
		const model = reactive({ value: 0 })
		const external = { value: 0 }
		let updates = 0
		
		const provide = biDi(
			(v) => {
				external.value = v
				updates++
			},
			() => model.value,
			(v) => model.value = v
		)
		
		// Initial
		expect(updates).toBe(1)
		
		// Rapid updates
		provide(1)
		provide(2)
		provide(3)
		provide(4)
		
		expect(updates).toBe(1) // No loops
		expect(model.value).toBe(4)
	})
	
	it('should handle multiple independent bindings', () => {
		const model1 = reactive({ value: '' })
		const model2 = reactive({ value: '' })
		
		const ext1 = { value: '' }
		const ext2 = { value: '' }
		
		let updates1 = 0
		let updates2 = 0
		
		const provide1 = biDi(
			(v) => { ext1.value = v; updates1++ },
			() => model1.value,
			(v) => model1.value = v
		)
		
		const provide2 = biDi(
			(v) => { ext2.value = v; updates2++ },
			() => model2.value,
			(v) => model2.value = v
		)
		
		// Initial
		expect(updates1).toBe(1)
		expect(updates2).toBe(1)
		
		// Update first binding
		provide1('first')
		expect(updates1).toBe(1)
		expect(updates2).toBe(1)
		expect(model1.value).toBe('first')
		
		// Update second binding
		provide2('second')
		expect(updates1).toBe(1)
		expect(updates2).toBe(1)
		expect(model2.value).toBe('second')
		
		// Update first reactive side
		model1.value = 'reactive1'
		expect(updates1).toBe(2)
		expect(updates2).toBe(1)
		expect(ext1.value).toBe('reactive1')
		
		// Update second reactive side
		model2.value = 'reactive2'
		expect(updates1).toBe(2)
		expect(updates2).toBe(2)
		expect(ext2.value).toBe('reactive2')
	})
	
	it('should work with nested property paths', () => {
		const state = reactive({ 
			user: { 
				profile: { 
					name: '' 
				}
			} 
		})
		const external = { value: '' }
		let updates = 0
		
		const provide = biDi(
			(v) => { external.value = v; updates++ },
			() => state.user.profile.name,
			(v) => state.user.profile.name = v
		)
		
		expect(updates).toBe(1)
		
		provide('John')
		expect(updates).toBe(1)
		expect(state.user.profile.name).toBe('John')
		
		state.user.profile.name = 'Jane'
		expect(updates).toBe(2)
		expect(external.value).toBe('Jane')
	})
})

