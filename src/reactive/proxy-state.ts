export const objectToProxy = new WeakMap<object, object>()
export const proxyToObject = new WeakMap<object, object>()

export function storeProxyRelationship(target: object, proxy: object) {
	objectToProxy.set(target, proxy)
	proxyToObject.set(proxy, target)
}

export function getExistingProxy<T extends object>(target: T): T | undefined {
	return objectToProxy.get(target) as T | undefined
}

export function trackProxyObject(proxy: object, target: object) {
	proxyToObject.set(proxy, target)
}

export function unwrap<T>(obj: T): T {
	let current = obj
	while (current && typeof current === 'object' && current !== null && proxyToObject.has(current)) {
		current = proxyToObject.get(current) as T
	}
	return current
}

export function isReactive(obj: any): boolean {
	return proxyToObject.has(obj)
}

