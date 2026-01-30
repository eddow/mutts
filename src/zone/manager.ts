import { zoneBound, type Zonable } from './context'

/**
 * Aggregates multiple Zonables and manages their lifecycle as a single unit.
 * Also implements Zonable to allow nesting managers.
 */
export class ZonesManager implements Zonable<any[]> {
	private readonly _zonables = new Set<Zonable>()

	add(zonable: Zonable) {
		this._zonables.add(zonable)
	}

	remove(zonable: Zonable) {
		this._zonables.delete(zonable)
	}

	/**
	 * Capture state from all managed zonables
	 */
	capture(): any[] {
		return Array.from(this._zonables).map((z) => z.capture())
	}

	/**
	 * Restore state to all managed zonables
	 */
	enter(snapshots: any[]): void {
		const zonables = Array.from(this._zonables)
		for (let i = 0; i < zonables.length; i++) {
			zonables[i].enter(snapshots[i])
		}
	}

	/**
	 * Rollback state for all managed zonables
	 */
	leave(): void {
		// Restore in reverse order is usually safer for stacks
		const zonables = Array.from(this._zonables).reverse()
		for (const z of zonables) {
			z.leave?.()
		}
	}

	/**
	 * Wrap execution in all managed inZone hooks
	 * TODO: refactor as `inZone<T>(cb: () => T): () => T`
	 */
	inZone<T>(cb: () => T): T {
		const zonables = Array.from(this._zonables)
		const chain = (index: number): T => {
			if (index >= zonables.length) return cb()
			const z = zonables[index]
			if (z.inZone) {
				return z.inZone(() => chain(index + 1))
			}
			return chain(index + 1)
		}
		return chain(0)
	}

	/**
	 * Binds a function to the current captured context of all zonables
	 */
	bind<T extends Function>(fn: T): T {
		if (typeof fn !== 'function' || (fn as any)[zoneBound]) return fn

		const zonables = Array.from(this._zonables)
		const snapshots = zonables.map((z) => z.capture())
		const manager = this

		const bound = function (this: any, ...args: any[]) {
			for (let i = 0; i < zonables.length; i++) {
				zonables[i].enter(snapshots[i])
			}
			try {
				return manager.inZone(() => fn.apply(this, args))
			} finally {
				// Restore in reverse order
				for (let i = zonables.length - 1; i >= 0; i--) {
					zonables[i].leave?.()
				}
			}
		}

		Object.defineProperty(bound, zoneBound, { value: this, enumerable: false })
		Object.defineProperty(bound, 'name', { value: fn.name ? `zoneBound(${fn.name})` : 'zoneBound' })

		return bound as unknown as T
	}
}
