import { asyncHooks } from "./async"
import { named, tag } from "./utils"

export abstract class AZone<T> {
	abstract active?: T
	enter(value?: T): unknown {
		const prev = this.active
		this.active = value
		return prev
	}
	leave(entered: unknown): void {
		this.active = entered as T | undefined
	}
	with<R>(value: T, fn: () => R): R {
		const entered = this.enter(value)
		try {
			return fn()
		} finally {
			this.leave(entered)
		}
	}
	root<R>(fn: () => R): R {
		let prev = this.enter()
		try {
			return fn()
		} finally {
			this.leave(prev)
		}
	}
	get zoned(): FunctionWrapper {
		const active = this.active
		return named(`${this}@${active}`, (fn) => this.with(active, fn))
	}
}

export type FunctionWrapper = <R>(fn?: () => R) => R

export class Zone<T> extends AZone<T> {
	active: T | undefined
}
type HistoryValue<T> = {present: T | undefined, history: Set<T>}
export class ZoneHistory<T> extends AZone<HistoryValue<T>> {
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
				get active() { return controlled.active },
				set active(value: T | undefined) {
					controlled.active = value
				},
				enter(value?: T) {
					if(value && self.history.has(value)) throw new Error('ZoneHistory: re-entering historical zone')
					if(value !== undefined) self.history.add(value)
					return { added: value, entered: controlled.enter(value) }
				},
				leave(entered: { added: T | undefined, entered: unknown }) {
					if(entered.added !== undefined) self.history.delete(entered.added)
					return controlled.leave(entered.entered)
				}
			})
		)
	}
	get active() {
		return {present: this.controlled.active, history: new Set(this.history)}
	}
	set active(value: HistoryValue<T> | undefined) {
		this.history = this.history && new Set(this.history)
		this.controlled.active = value?.present
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
	set active(value: Map<AZone<unknown>, unknown> | undefined) {
		for (const z of this.#zones) z.active = value?.get(z)
	}
	enter(value?: Map<AZone<unknown>, unknown> | undefined) {
		const entered = new Map<AZone<unknown>, unknown>()
		for (const z of this.#zones) {
			const v = value?.get(z)
			entered.set(z, z.enter(v))
		}
		return entered
	}
	leave(entered: Map<AZone<unknown>, unknown>): void {
		for (const z of this.#zones) z.leave(entered.get(z))
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

export const asyncZone = tag(new ZoneAggregator(), 'async')
asyncHooks.addHook(() => {
	const zone = asyncZone.active
	return () => {
		const prev = asyncZone.active
		asyncZone.active = zone
		return () => asyncZone.active = prev
	}
})
