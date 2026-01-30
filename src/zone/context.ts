/**
 * Generic context preservation (zoning)
 */

/**
 * Interface for objects that hold state that should be preserved across async boundaries
 */
export interface Zonable<T = any> {
	/**
	 * Capture current state
	 */
	capture(): T
	/**
	 * Restore state from a snapshot
	 */
	enter(snapshot: T): void
	/**
	 * Rollback to previous state
	 */
	leave?(): void
	/**
	 * Optional: wrap a callback in a specific execution context
	 */
	inZone?(cb: () => any): any
}

/**
 * Helper class to implement Zonable for a state accessed via get/set
 */
export class ZonableStack<T> implements Zonable<T> {
	private _history: T[] = []

	constructor(
		private readonly _get: () => T,
		private readonly _set: (value: T) => void,
		public inZone?: (cb: () => any) => any
	) {}

	capture(): T {
		return this._get()
	}

	enter(snapshot: T): void {
		this._history.push(this._get())
		this._set(snapshot)
	}

	leave(): void {
		if (this._history.length === 0) return
		this._set(this._history.pop()!)
	}
}

export const zoneBound = Symbol('zoneBound')