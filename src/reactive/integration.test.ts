import { effect, reactive } from './index'

describe('integration tests', () => {
	it('should work with complex nested structures', () => {
		const state = reactive({
			user: {
				profile: {
					name: 'John',
					age: 30,
				},
				settings: {
					theme: 'dark',
					notifications: true,
				},
			},
			app: {
				version: '1.0.0',
				features: ['auth', 'chat'],
			},
		})

		let profileEffectCount = 0
		let settingsEffectCount = 0
		let appEffectCount = 0

		effect(() => {
			profileEffectCount++
			state.user.profile.name
			state.user.profile.age
		})

		effect(() => {
			settingsEffectCount++
			state.user.settings.theme
		})

		effect(() => {
			appEffectCount++
			state.app.version
		})

		expect(profileEffectCount).toBe(1)
		expect(settingsEffectCount).toBe(1)
		expect(appEffectCount).toBe(1)

		// Change profile
		state.user.profile.name = 'Jane'
		expect(profileEffectCount).toBe(2)
		expect(settingsEffectCount).toBe(1)
		expect(appEffectCount).toBe(1)

		// Change settings
		state.user.settings.theme = 'light'
		expect(profileEffectCount).toBe(2)
		expect(settingsEffectCount).toBe(2)
		expect(appEffectCount).toBe(1)

		// Change app
		state.app.version = '1.1.0'
		expect(profileEffectCount).toBe(2)
		expect(settingsEffectCount).toBe(2)
		expect(appEffectCount).toBe(2)
	})
})
