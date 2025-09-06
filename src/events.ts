const events = Symbol('events')
const hooks = Symbol('hooks')
export class Eventful<Events extends Record<string, (...args: any[]) => void>> {
	constructor() {
		Object.defineProperty(this, events, {
			...Object.getOwnPropertyDescriptor(Eventful.prototype, events)!,
			enumerable: false,
			writable: false,
			configurable: false,
		})
	}
	protected readonly [events] = new Map<keyof Events, ((...args: any[]) => void)[]>()
	protected readonly [hooks] = [] as ((...args: any[]) => void)[]

	public hook(
		cb: <EventType extends keyof Events>(
			event: EventType,
			...args: Parameters<Events[EventType]>
		) => void
	): () => void {
		if (!this[hooks].includes(cb)) this[hooks].push(cb)
		return () => {
			this[hooks].splice(this[hooks].indexOf(cb), 1)
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
			let callbacks = this[events].get(eventOrEvents)
			if (!callbacks) {
				callbacks = []
				this[events].set(eventOrEvents, callbacks)
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
			const callbacks = this[events].get(eventOrEvents)
			if (callbacks) {
				this[events].set(
					eventOrEvents,
					callbacks.filter((c) => c !== cb)
				)
			}
		}
	}
	public emit<EventType extends keyof Events>(
		event: EventType,
		...args: Parameters<Events[EventType]>
	) {
		const callbacks = this[events].get(event)
		if (callbacks) for (const cb of callbacks) cb(...args)
		for (const cb of this[hooks]) cb(event, ...args)
	}
}
