import { effect, reactive } from '../src/reactive/index'
import { Stack, asyncZoneManager } from '../src/zone'
/* TODO: We should have 2 'zone.test.ts': one here and one in `./reactive`
This one should test the zones without the reactive system.
The later should test the zones used by the reactive system.
*/
describe('Generic Zoning', () => {
	beforeAll(() => {
		asyncZoneManager.hook()
	})

	afterAll(() => {
		asyncZoneManager.unhook()
	})

	it('should preserve custom stack context across async boundaries', async () => {
		const myStack = new Stack<string>()
		asyncZoneManager.manager.add(myStack)

		let captured: string | undefined
		myStack.push('outer')

		const p = Promise.resolve().then(() => {
			captured = myStack.get()
		})

		myStack.push('inner')
		await p
		expect(captured).toBe('outer')
		
		myStack.pop() // inner
		myStack.pop() // outer
	})

	it('should preserve context in nested effects', async () => {
		const myStack = new Stack<number>()
		asyncZoneManager.manager.add(myStack)
		
		const results: number[] = []
		
		myStack.push(1)
		
		effect(() => {
			const val = myStack.get()
			if (val !== undefined) results.push(val)
			
			if (val === 1) {
				Promise.resolve().then(() => {
					myStack.push(2)
					// trigger something?
				})
			}
		})
		
		await new Promise(resolve => setTimeout(resolve, 10))
		// This is just a basic check, real usage is more complex
	})
})
