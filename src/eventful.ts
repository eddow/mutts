/**
 * Base type for event maps - all event handlers must be functions
 */
export type EventsBase = Record<string, (...args: any[]) => void>

const events = Symbol('events')
const hooks = Symbol('hooks')

type EventfulStore = {
	[events]: Map<PropertyKey, Set<(...args: any[]) => void>>
	[hooks]: Set<(...args: any[]) => void>
}

function getEventMap(target: object): EventfulStore[typeof events] {
	return (target as EventfulStore)[events]
}

function getHookSet(target: object): EventfulStore[typeof hooks] {
	return (target as EventfulStore)[hooks]
}

const eventBehavior = {
	on<EventType extends keyof EventsBase>(
		eventOrEvents: EventType | Partial<EventsBase>,
		cb?: EventsBase[EventType]
	): (this: Eventful<any>) => void {
		const self = this as Eventful<any>
		const eventMap = getEventMap(self)
		if (typeof eventOrEvents === 'object') {
			for (const e of Object.keys(eventOrEvents) as (keyof EventsBase)[]) {
				this.on(e, eventOrEvents[e]!)
			}
		} else if (cb !== undefined) {
			const callbacks = eventMap.get(eventOrEvents) ?? new Set<EventsBase[EventType]>()
			if (!callbacks.has(cb)) callbacks.add(cb)
			eventMap.set(eventOrEvents, callbacks)
		}
		return () => this.off(eventOrEvents, cb)
	},
	off<EventType extends keyof EventsBase>(
		eventOrEvents: EventType | Partial<EventsBase>,
		cb?: EventsBase[EventType]
	): void {
		const self = this as Eventful<any>
		const eventMap = getEventMap(self)
		if (typeof eventOrEvents === 'object') {
			for (const e of Object.keys(eventOrEvents) as (keyof EventsBase)[]) {
				this.off(e, eventOrEvents[e])
			}
		} else if (cb !== null && cb !== undefined) {
			const callbacks = eventMap.get(eventOrEvents)
			if (callbacks) {
				callbacks.delete(cb)
				if (!callbacks.size) eventMap.delete(eventOrEvents)
			}
		} else {
			// Remove all listeners for this event
			eventMap.delete(eventOrEvents)
		}
	},
	emit<EventType extends keyof EventsBase>(
		event: EventType,
		...args: Parameters<EventsBase[EventType]>
	) {
		const self = this as Eventful<any>
		const callbacks = getEventMap(self).get(event)
		if (callbacks) for (const cb of callbacks) cb.apply(this, args)
		for (const cb of getHookSet(self)) cb.call(this, event, ...args)
	},
}

function perEvent(
	eventful: Eventful<any>,
	fct: (event: string, ...args: any[]) => void,
	use?: 'use'
) {
	const cache = new Map<string, (...args: any[]) => any>()
	return new Proxy(fct, {
		get(target, prop: PropertyKey) {
			if (typeof prop !== 'string')
				return (target as typeof target & Record<PropertyKey, unknown>)[prop]
			if (use && !getEventMap(eventful).has(prop) && !getHookSet(eventful).size) return () => {}

			// Return cached function or create and cache
			let cached = cache.get(prop)
			if (!cached) {
				cached = (...args: any[]) => fct.apply(eventful, [prop, ...args])
				cache.set(prop, cached)
			}
			return cached
		},
	})
}

/**
 * A type-safe event system that provides a clean API for event handling
 * @template Events - The event map defining event names and their handler signatures
 */
export class Eventful<Events extends EventsBase> {
	private readonly [events] = new Map<keyof Events, Set<(...args: any[]) => void>>()
	private readonly [hooks] = new Set<(...args: any[]) => void>()

	public hook(
		cb: <EventType extends keyof Events>(
			event: EventType,
			...args: Parameters<Events[EventType]>
		) => void
	): () => void {
		this[hooks].add(cb)
		return () => {
			this[hooks].delete(cb)
		}
	}

	public on = perEvent(this, eventBehavior.on) as ((events: Partial<Events>) => void) &
		(<EventType extends keyof Events>(event: EventType, cb: Events[EventType]) => () => void) & {
			[event in keyof Events]: (cb: Events[event]) => () => void
		}
	public off = perEvent(this, eventBehavior.off) as ((events: Partial<Events>) => void) &
		(<EventType extends keyof Events>(event: EventType, cb?: Events[EventType]) => void) & {
			[event in keyof Events]: (cb?: Events[event]) => void
		}

	public emit = perEvent(this, eventBehavior.emit, 'use') as (<EventType extends keyof Events>(
		event: EventType,
		...args: Parameters<Events[EventType]>
	) => void) &
		Events
}
