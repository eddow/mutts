/**
 * Global async API hooking with context preservation
 */

import { ZonesManager } from './manager'

export type AsyncZoneOptions = {
	enabled: boolean
	zones: {
		setTimeout?: boolean
		setInterval?: boolean
		requestAnimationFrame?: boolean
		queueMicrotask?: boolean
	}
}

export class AsyncZoneManager {
	// TODO: should extend ZonesManager instead of having one
	public readonly manager = new ZonesManager()
	private _hooked = false

	private _options: AsyncZoneOptions = {
		enabled: true,
		zones: {
			setTimeout: true,
			setInterval: true,
			requestAnimationFrame: true,
			queueMicrotask: true,
		},
	}

	// Store original methods
	private readonly _originals = {
		then: Object.getOwnPropertyDescriptor(Promise.prototype, 'then')?.value || Promise.prototype.then,
		catch: Object.getOwnPropertyDescriptor(Promise.prototype, 'catch')?.value || Promise.prototype.catch,
		finally: Object.getOwnPropertyDescriptor(Promise.prototype, 'finally')?.value || Promise.prototype.finally,
		setTimeout: globalThis.setTimeout,
		setInterval: globalThis.setInterval,
		requestAnimationFrame: typeof globalThis.requestAnimationFrame !== 'undefined' ? globalThis.requestAnimationFrame : undefined,
		queueMicrotask: typeof globalThis.queueMicrotask !== 'undefined' ? globalThis.queueMicrotask : undefined,
	}

	configure(options: Partial<AsyncZoneOptions>) {
		this._options = { ...this._options, ...options }
		if (this._hooked) {
			this.unhook()
			this.hook()
		}
	}

	get isHooked() {
		return this._hooked
	}

	hook() {
		if (this._hooked || !this._options.enabled) return
		this._hooked = true

		const self = this

		let inHook = false
		Promise.prototype.then = function <T, R1, R2>(
			this: Promise<T>,
			onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
			onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
		): Promise<R1 | R2> {
			if (inHook) return self._originals.then.call(this, onFulfilled, onRejected)
			inHook = true
			try {
				const wrappedOnFulfilled = typeof onFulfilled === 'function' ? self.manager.bind(onFulfilled) : onFulfilled
				const wrappedOnRejected = typeof onRejected === 'function' ? self.manager.bind(onRejected) : onRejected
				return self._originals.then.call(this, wrappedOnFulfilled, wrappedOnRejected)
			} finally {
				inHook = false
			}
		}

		Promise.prototype.catch = function <T>(
			this: Promise<T>,
			onRejected?: ((reason: any) => T | PromiseLike<T>) | null
		): Promise<T> {
			if (inHook) return self._originals.catch.call(this, onRejected)
			inHook = true
			try {
				const wrappedOnRejected = typeof onRejected === 'function' ? self.manager.bind(onRejected) : onRejected
				return self._originals.catch.call(this, wrappedOnRejected)
			} finally {
				inHook = false
			}
		}

		Promise.prototype.finally = function <T>(
			this: Promise<T>,
			onFinally?: (() => void) | null
		): Promise<T> {
			if (inHook) return self._originals.finally.call(this, onFinally)
			inHook = true
			try {
				const wrappedOnFinally = typeof onFinally === 'function' ? self.manager.bind(onFinally) : onFinally
				return self._originals.finally.call(this, wrappedOnFinally)
			} finally {
				inHook = false
			}
		}

		globalThis.setTimeout = (<TArgs extends any[]>(
			callback: (...args: TArgs) => void,
			delay?: number,
			...args: TArgs
		): any => {
			return self._originals.setTimeout.apply(globalThis, [
				self._wrap(callback, !!self._options.zones.setTimeout),
				delay,
				...args,
			] as any)
		}) as any

		globalThis.setInterval = (<TArgs extends any[]>(
			callback: (...args: TArgs) => void,
			delay?: number,
			...args: TArgs
		): any => {
			return self._originals.setInterval.apply(globalThis, [
				self._wrap(callback, !!self._options.zones.setInterval),
				delay,
				...args,
			] as any)
		}) as any

		if (this._originals.requestAnimationFrame)
			globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
				return self._originals.requestAnimationFrame!.call(
					globalThis,
					self._wrap(callback, !!self._options.zones.requestAnimationFrame) as FrameRequestCallback
				)
			}

		if (this._originals.queueMicrotask)
			globalThis.queueMicrotask = (callback: () => void): void => {
				self._originals.queueMicrotask!.call(
					globalThis,
					self._wrap(callback, !!self._options.zones.queueMicrotask) as () => void
				)
			}
	}

	unhook() {
		if (!this._hooked) return
		this._hooked = false

		Promise.prototype.then = this._originals.then
		Promise.prototype.catch = this._originals.catch
		Promise.prototype.finally = this._originals.finally
		globalThis.setTimeout = this._originals.setTimeout
		globalThis.setInterval = this._originals.setInterval
		if (this._originals.requestAnimationFrame) globalThis.requestAnimationFrame = this._originals.requestAnimationFrame
		if (this._originals.queueMicrotask) globalThis.queueMicrotask = this._originals.queueMicrotask
	}

	private _wrap<T extends Function>(cb: T | null | undefined, enabled = true): T | undefined {
		if (!cb) return undefined
		return enabled ? this.manager.bind(cb) : cb
	}
}

export const asyncZoneManager = new AsyncZoneManager()
