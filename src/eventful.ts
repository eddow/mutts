/**
 * Base type for event maps - all event handlers must be functions
 */
export type EventsBase = Record<string, (...args: any[]) => void>
/**
 * A type-safe event system that provides a clean API for event handling
 * @template Events - The event map defining event names and their handler signatures
 */
export class Eventful<Events extends EventsBase> {
	readonly #events = new Map<keyof Events, ((...args: any[]) => void)[]>()
	readonly #hooks = [] as ((...args: any[]) => void)[]

	public hook(
		cb: <EventType extends keyof Events>(
			event: EventType,
			...args: Parameters<Events[EventType]>
		) => void
	): () => void {
		if (!this.#hooks.includes(cb)) this.#hooks.push(cb)
		return () => {
			this.#hooks.splice(this.#hooks.indexOf(cb), 1)
		}
	}

	public on(events: Partial<Events>): void
	public on<EventType extends keyof Events>(event: EventType, cb: Events[EventType]): () => void
	public on<EventType extends keyof Events>(
		eventOrEvents: EventType | Partial<Events>,
		cb?: Events[EventType]
	): () => void {
		if (typeof eventOrEvents === 'object') {
			for (const e of Object.keys(eventOrEvents) as (keyof Events)[]) {
				this.on(e, eventOrEvents[e]!)
			}
		} else if (cb !== undefined) {
			let callbacks = this.#events.get(eventOrEvents)
			if (!callbacks) {
				callbacks = []
				this.#events.set(eventOrEvents, callbacks)
			}
			callbacks.push(cb)
		}
		// @ts-expect-error Generic case leads to generic case
		return () => this.off(eventOrEvents, cb)
	}
	public off(events: Partial<Events>): void
	public off<EventType extends keyof Events>(event: EventType, cb?: Events[EventType]): void
	public off<EventType extends keyof Events>(
		eventOrEvents: EventType | Partial<Events>,
		cb?: Events[EventType]
	): void {
		if (typeof eventOrEvents === 'object') {
			for (const e of Object.keys(eventOrEvents) as (keyof Events)[]) {
				this.off(e, eventOrEvents[e])
			}
		} else if (cb !== null && cb !== undefined) {
			const callbacks = this.#events.get(eventOrEvents)
			if (callbacks) {
				this.#events.set(
					eventOrEvents,
					callbacks.filter((c) => c !== cb)
				)
			}
		} else {
			// Remove all listeners for this event
			this.#events.delete(eventOrEvents)
		}
	}
	public emit<EventType extends keyof Events>(
		event: EventType,
		...args: Parameters<Events[EventType]>
	) {
		const callbacks = this.#events.get(event)
		if (callbacks) for (const cb of callbacks) cb.apply(this, args)
		for (const cb of this.#hooks) cb.call(this, event, ...args)
	}
}

/* TODO:
this.on.click(() => {...}))
this.raise.click(args)
*/
