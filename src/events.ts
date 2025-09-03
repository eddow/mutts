const Events = Symbol("events")
export class Eventful<Events extends Record<string, (...args: any[]) => void>> {
	constructor() {
		Object.defineProperty(this, Events, {
			...Object.getOwnPropertyDescriptor(Eventful.prototype, Events)!,
			enumerable: false,
			writable: false,
			configurable: false,
		})
	}
	protected readonly [Events] = new Map<PropertyKey, ((...args: any[]) => void)[]>()
	public on(events: Partial<Events>): void
	public on<EventType extends keyof Events>(event: EventType, cb: Events[EventType]): () => void
	public on<EventType extends keyof Events>(
		eventOrEvents: EventType | Partial<Events>,
		cb?: Events[EventType],
	): () => void {
		if (typeof eventOrEvents === "object") {
			for (const e of Object.keys(eventOrEvents) as (keyof Events)[]) {
				this.on(e, eventOrEvents[e]!)
			}
		} else if (cb !== undefined) {
			let callbacks = this[Events].get(eventOrEvents)
			if (!callbacks) {
				callbacks = []
				this[Events].set(eventOrEvents, callbacks)
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
		cb?: Events[EventType],
	): void {
		if (typeof eventOrEvents === "object") {
			for (const e of Object.keys(eventOrEvents) as (keyof Events)[]) {
				this.off(e, eventOrEvents[e])
			}
		} else if (cb !== null && cb !== undefined) {
			const callbacks = this[Events].get(eventOrEvents)
			if (callbacks) {
				this[Events].set(
					eventOrEvents,
					callbacks.filter((c) => c !== cb),
				)
			}
		}
	}
	public emit<EventType extends keyof Events>(
		event: EventType,
		...args: Parameters<Events[EventType]>
	) {
		const callbacks = this[Events].get(event)
		if (callbacks)
			for (const cb of callbacks) {
				cb(...args)
			}
	}
}
