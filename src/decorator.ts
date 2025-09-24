// biome-ignore-all lint: sandbox file
/*function DeepBeforeConstructor<T extends new (...args: any[]) => any>(
	target: T,
	context: ClassDecoratorContext
): T {
	return new Proxy(target, {
		construct(originalTarget: T, args: any[], newTarget: any) {
			console.log("Before instance creation - args:", args);

			// Create the instance
			const instance = Reflect.construct(originalTarget, args, newTarget);

			console.log("After instance creation - instance:", instance);
			return instance;
		}
	});
}

@DeepBeforeConstructor
class MyClass {
	constructor(public value: string) {
		console.log("Inside constructor");
	}
}*/

function BeforeConstructor<T extends new (...args: any[]) => any>(ctor: T) {
	return ((...args: any[]) => {
		console.log("Before constructor - instance doesn't exist yet")

		class Init {
			init: string = 'test'
			constructor() {
				console.log('Inside Init constructor')
			}
		}
		// Create the instance manually
		const instance = Reflect.construct(ctor, args, Init)

		console.log('After constructor - instance exists now')
		return instance
	}) as unknown as T
}

@BeforeConstructor
class MyClass {
	constructor(public value: string) {
		console.log('Inside constructor')
	}
	test = 5
}

const obj = new MyClass('test')
console.log(obj.value)
// @ts-ignore
console.log(obj.init)
function decoratorSupport(): 'stage3' | 'legacy' | false {
	let rv: any
	try {
		// Test for Stage 3 decorator signature
		const stage3Decorator = (_target: any, context: any) => {
			rv = context ? 'stage3' : 'legacy'
		}
		// @ts-ignore
		@stage3Decorator
		class Test {}

		// If we get here, Stage 3 decorators are likely supported
		return rv
	} catch (_e) {
		return false
	}
}

console.log(decoratorSupport())
