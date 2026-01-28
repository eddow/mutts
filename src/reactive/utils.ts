import { ReflectGet, ReflectSet } from '../utils'
import { Indexer } from './array'

export function ReflectIGet(obj: any, prop: any, receiver: any) {
	if(obj instanceof Array && typeof prop === 'string') {
		if(prop === 'length') return Indexer.prototype.getLength.call(obj)
		const index = parseInt(prop)
		if(!Number.isNaN(index)) return Indexer.prototype.get.call(obj, index)
	}
	return ReflectGet(obj, prop, receiver)
}

export function ReflectISet(obj: any, prop: any, value: any, receiver: any) {
	if(obj instanceof Array && typeof prop === 'string') {
		if(prop === 'length') return Indexer.prototype.setLength.call(obj, value)
		const index = parseInt(prop)
		if(!Number.isNaN(index)) return Indexer.prototype.set.call(obj, index, value)
	}
	return ReflectSet(obj, prop, value, receiver)
}