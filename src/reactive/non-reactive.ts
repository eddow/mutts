import { reactive } from './proxy'

/**
 * Converts an iterator to a generator that yields reactive values
 */
export function* makeReactiveIterator<T>(iterator: Iterator<T>): Generator<T> {
	let result = iterator.next()
	while (!result.done) {
		yield reactive(result.value)
		result = iterator.next()
	}
}

/**
 * Converts an iterator of key-value pairs to a generator that yields reactive key-value pairs
 */
export function* makeReactiveEntriesIterator<K, V>(iterator: Iterator<[K, V]>): Generator<[K, V]> {
	let result = iterator.next()
	while (!result.done) {
		const [key, value] = result.value
		yield [reactive(key), reactive(value)]
		result = iterator.next()
	}
}
