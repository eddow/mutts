import { named, tag } from "./utils"

export abstract class AZone<T> {
	abstract readonly active: T | undefined
	abstract with<R>(value: T, fn: () => R): R
	abstract root<R>(fn: () => R): R
	get zoned(): FunctionWrapper {
		const active = this.active
		return named(`${this}@${active}`, (fn) => this.with(active, fn))
	}
}

export type FunctionWrapper = <R>(fn?: () => R) => R

export class Zone<T> extends AZone<T> {
	private _active: T | undefined
	get active(): T | undefined {
		return this._active
	}
	with<R>(value: T, fn: () => R): R {
		const prev = this._active
		this._active = value
		try {
			return fn()
		} finally {
			this._active = prev
		}
	}
	root<R>(fn: () => R): R {
		let prev = this._active
		this._active = undefined
		try {
			return fn()
		} finally {
			this._active = prev
		}
	}
}

export class ZoneHistory<T> extends AZone<{present: T | undefined, history: Set<T>}> {
	private	history = new Set<T>()
	public readonly present: AZone<T>
	public has(value: T): boolean {
		return this.history.has(value)
	}
	public some(predicate: (value: T) => boolean): boolean {
		for(const value of this.history) if(predicate(value)) return true
		return false
	}
	constructor(private controlled: AZone<T> = new Zone<T>()) {
		super()
		const self = this
		this.present = Object.create(controlled,
			Object.getOwnPropertyDescriptors({
				get _active() { return (controlled as any)._active },
				set _active(value: T | undefined) { (controlled as any)._active = value },
				with<R>(value: T, fn: () => R): R {
					if(value && self.history.has(value)) {
						throw new Error('ZoneHistory: re-entering historical zone')
					}
					self.history.add(value)
					try {
						return controlled.with(value, fn)
					} finally {
						self.history.delete(value)
					}
				}
			})
		)
	}
	get active() {
		return {present: this.controlled.active, history: new Set(this.history)}
	}
	with<R>(value: {present: T | undefined, history: Set<T>}, fn: () => R): R {
		const prev = this.history
		this.history = value.history
		try {
			return this.controlled.with(value.present, fn)
		} finally {
			this.history = prev
		}
	}
	root<R>(fn: () => R): R {
		let prev = this.history
		this.history = new Set()
		try {
			return this.controlled.root(fn)
		} finally {
			this.history = prev
		}
	}
}

export class ZoneAggregator extends AZone<Map<AZone<unknown>, unknown>> {
	#zones = new Set<AZone<unknown>>()
	constructor(...zones: AZone<unknown>[]) {
		super()
		for (const z of zones) this.#zones.add(z)
	}
	get active(): Map<AZone<unknown>, unknown> | undefined {
		const rv = new Map<AZone<unknown>, unknown>()
		for (const z of this.#zones)
			if (z.active !== undefined) rv.set(z, z.active)
		return rv
	}
	with<R>(value: Map<AZone<unknown>, unknown> | undefined, fn: () => R): R {
		let rv = fn
		for (const z of this.#zones) {
			const v = value?.get(z)
			rv = ((next) => named(`${this}[${z}]${v}`, () => z.with(v, next)))(rv)
		}
		return rv()
	}
	root<R>(fn: () => R): R {
		let rv = fn
		for (const z of this.#zones) rv = named(`${this}[${z}]<root>`, () => z.root(rv))
		return rv()
	}
	add(z: AZone<unknown>) {
		this.#zones.add(z)
	}
	delete(z: AZone<unknown>) {
		this.#zones.delete(z)
	}
	clear() {
		this.#zones.clear()
	}
}

export type AsyncWrapHooks = {
	promise?: boolean,
	timer?: boolean,
	requestAnimationFrame?: boolean,
	microtask?: boolean,
	//TODO: other hooks? (fetch, ...)
}
// We have reinvented the wh... AsyncLocalStorage. It's kept for its integration with zones.
export function wrapAsync(
	wrapper: FunctionWrapper | AZone<unknown>,
	hooks: AsyncWrapHooks = {}
) {
	const originals = {
		then: Promise.prototype.then,
		catch: Promise.prototype.catch,
		finally: Promise.prototype.finally,
		setTimeout: globalThis.setTimeout,
		setInterval: globalThis.setInterval,
		setImmediate: globalThis.setImmediate,
		requestAnimationFrame: globalThis.requestAnimationFrame,
		queueMicrotask: globalThis.queueMicrotask,
	}
	function wrap<Args extends any[], R>(fn: ((...args: Args) => R) | null | undefined) {
		if (typeof fn !== 'function') return fn
		const w = typeof wrapper === 'function' ? wrapper : wrapper.zoned
		return (...args: Args) => w(function asyncWrapper() {
			return fn.apply(this, args)
		})
	}
	if(hooks.promise !== false) {
		Promise.prototype.then = function <T, R1, R2>(
			this: Promise<T>,
			onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
			onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
		): Promise<R1 | R2> {
			const wrappedOnFulfilled = wrap(onFulfilled)
			const wrappedOnRejected = wrap(onRejected)
			return originals.then.call(this, wrappedOnFulfilled, wrappedOnRejected)
		}

		Promise.prototype.catch = function <T>(
			this: Promise<T>,
			onRejected?: ((reason: any) => T | PromiseLike<T>) | null
		): Promise<T> {
			const wrappedOnRejected = wrap(onRejected)
			return originals.catch.call(this, wrappedOnRejected)
		}

		Promise.prototype.finally = function <T>(
			this: Promise<T>,
			onFinally?: (() => void) | null
		): Promise<T> {
			const wrappedOnFinally = wrap(onFinally)
			return originals.finally.call(this, wrappedOnFinally)
		}
	}

	if(hooks.timer !== false) {
		globalThis.setTimeout = (<TArgs extends any[]>(
			callback: (...args: TArgs) => void,
			...args: TArgs
		) => {
			return originals.setTimeout.apply(this, [
				wrap(callback),
				...args,
			])
		}) as any
		globalThis.setInterval = (<TArgs extends any[]>(
			callback: (...args: TArgs) => void,
			...args: TArgs
		) => {
			return originals.setInterval.apply(this, [
				wrap(callback),
				...args,
			])
		}) as any
		globalThis.setImmediate = (<TArgs extends any[]>(
			callback: (...args: TArgs) => void,
			...args: TArgs
		) => {
			return originals.setImmediate.apply(this, [
				wrap(callback),
				...args,
			])
		}) as any
	}

	if(originals.requestAnimationFrame && hooks.requestAnimationFrame !== false) {
		globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
			return originals.requestAnimationFrame.apply(this, [
				wrap(callback),
			])
		}
	}

	if (originals.queueMicrotask && hooks.microtask !== false)
		globalThis.queueMicrotask = (callback: VoidFunction): void => {
			originals.queueMicrotask!.call(
				globalThis,
				wrap(callback),
			)
		}
	return () => {
		Promise.prototype.then = originals.then
		Promise.prototype.catch = originals.catch
		Promise.prototype.finally = originals.finally
		globalThis.setTimeout = originals.setTimeout
		globalThis.setInterval = originals.setInterval
		if (originals.requestAnimationFrame) globalThis.requestAnimationFrame = originals.requestAnimationFrame
		if (originals.queueMicrotask) globalThis.queueMicrotask = originals.queueMicrotask
	}
}

export const asyncZone = tag(new ZoneAggregator(), 'async')
export let unhookAsyncZone: (() => void) | undefined
export function configureAsyncZone(hooks: AsyncWrapHooks = {}) {
	if(unhookAsyncZone) unhookAsyncZone()
	unhookAsyncZone = wrapAsync(asyncZone, hooks)
}
