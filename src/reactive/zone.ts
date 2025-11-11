/**
 * Zone-like async context preservation for reactive effects
 *
 * Automatically preserves effect context across async boundaries:
 * - Promise methods: .then(), .catch(), .finally()
 * - Timers: setTimeout(), setInterval()
 * - Animation: requestAnimationFrame() (if available)
 * - Microtasks: queueMicrotask() (if available)
 *
 * **IMPORTANT:** This module is opt-in via `reactiveOptions.asyncMode` (truthy = enabled, false = disabled).
 * By default, async zone is ENABLED with 'cancel' mode.
 *
 * When disabled (asyncMode = false), use `tracked()` manually in async callbacks.
 * When enabled (asyncMode = 'cancel' | 'queue' | 'ignore'), async entry points are wrapped ONCE.
 */

import { captureEffectStack, withEffectStack } from './effect-context'
import { options, ScopedCallback } from './types'

let zoneHooked = false

// Store original Promise methods at module load time (before any wrapping)
// This ensures we always have the true originals, even if wrapping happens multiple times
const originalPromiseThen =
	Object.getOwnPropertyDescriptor(Promise.prototype, 'then')?.value || Promise.prototype.then
const originalPromiseCatch =
	Object.getOwnPropertyDescriptor(Promise.prototype, 'catch')?.value || Promise.prototype.catch
const originalPromiseFinally =
	Object.getOwnPropertyDescriptor(Promise.prototype, 'finally')?.value || Promise.prototype.finally

// Store original timer functions at module load time
const originalSetTimeout = globalThis.setTimeout
const originalSetInterval = globalThis.setInterval
const originalRequestAnimationFrame =
	typeof globalThis.requestAnimationFrame !== 'undefined'
		? globalThis.requestAnimationFrame
		: undefined
const originalQueueMicrotask =
	typeof globalThis.queueMicrotask !== 'undefined' ? globalThis.queueMicrotask : undefined

/**
 * Check the asyncMode option and hook Promise.prototype once if enabled
 * Called lazily on first effect creation
 * asyncMode being truthy enables async zone, false disables it
 */
export function ensureZoneHooked() {
	if (zoneHooked || !options.asyncMode) return
	hookZone()
	zoneHooked = true
}

/**
 * Hook Promise.prototype methods to preserve effect context
 */
function hookZone() {
	// biome-ignore lint/suspicious/noThenProperty: Intentional wrapping for zone functionality
	Promise.prototype.then = function <T, R1, R2>(
		this: Promise<T>,
		onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
		onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
	): Promise<R1 | R2> {
		// Capture effect context at the time .then() is called
		const capturedStack = captureEffectStack()

		// Only wrap if we have an active effect (avoid unnecessary wrapping)
		if (capturedStack.length) {
			return originalPromiseThen.call(
				this,
				wrapCallback(onFulfilled, capturedStack),
				wrapCallback(onRejected, capturedStack)
			)
		}

		// No active effect, use original directly
		return originalPromiseThen.call(this, onFulfilled, onRejected)
	}

	Promise.prototype.catch = function <T>(
		this: Promise<T>,
		onRejected?: ((reason: any) => T | PromiseLike<T>) | null
	): Promise<T> {
		const capturedStack = captureEffectStack()

		if (capturedStack.length) {
			return originalPromiseCatch.call(this, wrapCallback(onRejected, capturedStack))
		}

		return originalPromiseCatch.call(this, onRejected)
	}

	Promise.prototype.finally = function <T>(
		this: Promise<T>,
		onFinally?: (() => void) | null
	): Promise<T> {
		const capturedStack = captureEffectStack()

		return capturedStack.length && onFinally
			? originalPromiseFinally.call(this, wrapCallback(onFinally, capturedStack))
			: originalPromiseFinally.call(this, onFinally)
	}

	// Hook setTimeout - preserve original function properties for Node.js compatibility
	const wrappedSetTimeout = (<TArgs extends any[]>(
		callback: (...args: TArgs) => void,
		delay?: number,
		...args: TArgs
	): ReturnType<typeof originalSetTimeout> => {
		const capturedStack = captureEffectStack()

		if (capturedStack.length) {
			return originalSetTimeout.call(
				globalThis,
				(...cbArgs: TArgs) => {
					withEffectStack(capturedStack, () => callback(...cbArgs))
				},
				delay,
				...args
			) as ReturnType<typeof originalSetTimeout>
		}

		return originalSetTimeout.call(globalThis, callback, delay, ...args)
	}) as typeof originalSetTimeout
	Object.assign(wrappedSetTimeout, originalSetTimeout)
	globalThis.setTimeout = wrappedSetTimeout

	// Hook setInterval - preserve original function properties for Node.js compatibility
	const wrappedSetInterval = (<TArgs extends any[]>(
		callback: (...args: TArgs) => void,
		delay?: number,
		...args: TArgs
	): ReturnType<typeof originalSetInterval> => {
		const capturedStack = captureEffectStack()

		if (capturedStack.length) {
			return originalSetInterval.call(
				globalThis,
				(...cbArgs: TArgs) => {
					withEffectStack(capturedStack, () => callback(...cbArgs))
				},
				delay,
				...args
			) as ReturnType<typeof originalSetInterval>
		}

		return originalSetInterval.call(globalThis, callback, delay, ...args)
	}) as typeof originalSetInterval
	Object.assign(wrappedSetInterval, originalSetInterval)
	globalThis.setInterval = wrappedSetInterval

	// Hook requestAnimationFrame if available
	if (originalRequestAnimationFrame) {
		globalThis.requestAnimationFrame = ((
			callback: FrameRequestCallback
		): ReturnType<typeof originalRequestAnimationFrame> => {
			const capturedStack = captureEffectStack()

			if (capturedStack.length) {
				return originalRequestAnimationFrame.call(globalThis, (time: DOMHighResTimeStamp) => {
					withEffectStack(capturedStack, () => callback(time))
				})
			}

			return originalRequestAnimationFrame.call(globalThis, callback)
		}) as typeof originalRequestAnimationFrame
	}

	// Hook queueMicrotask if available
	if (originalQueueMicrotask) {
		globalThis.queueMicrotask = ((callback: () => void): void => {
			const capturedStack = captureEffectStack()

			if (capturedStack.length) {
				originalQueueMicrotask.call(globalThis, () => {
					withEffectStack(capturedStack, () => callback())
				})
				return
			}

			originalQueueMicrotask.call(globalThis, callback)
		}) as typeof originalQueueMicrotask
	}
}

/**
 * Wraps a callback to restore effect context when executed
 */
function wrapCallback<T extends (...args: any[]) => any>(
	callback: T | null | undefined,
	capturedStack: ScopedCallback[]
): T | undefined {
	if (!callback) return undefined

	return ((...args: any[]) => {
		if (capturedStack.length) {
			return withEffectStack(capturedStack, () => callback(...args))
		}
		return callback(...args)
	}) as T
}

/**
 * Manually enable/disable the zone (for testing)
 */
export function setZoneEnabled(enabled: boolean) {
	if (enabled && !zoneHooked) {
		hookZone()
		zoneHooked = true
	} else if (!enabled && zoneHooked) {
		// Restore original Promise methods
		// biome-ignore lint/suspicious/noThenProperty: Restoring original methods
		Promise.prototype.then = originalPromiseThen
		Promise.prototype.catch = originalPromiseCatch
		Promise.prototype.finally = originalPromiseFinally

		// Restore original timer functions
		globalThis.setTimeout = originalSetTimeout
		globalThis.setInterval = originalSetInterval
		if (originalRequestAnimationFrame) {
			globalThis.requestAnimationFrame = originalRequestAnimationFrame
		}
		if (originalQueueMicrotask) {
			globalThis.queueMicrotask = originalQueueMicrotask
		}

		zoneHooked = false
	}
}

/**
 * Check if zone is currently hooked
 */
export function isZoneEnabled(): boolean {
	return zoneHooked
}
