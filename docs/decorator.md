# Decorator System

A unified decorator system that works seamlessly across both Legacy (legacy) and Modern (standard) decorator environments in TypeScript.

Hopefully this library will soon become obsolete, but it is still a struggle when writing a library to choose which version of decorators to use. Here is a way for a library to provide decorators that can be used however the using application is configured.

## Overview

The `decorator` function provides a single API that automatically adapts to your environment's decorator system, ensuring consistent behavior whether you're using legacy decorators or the new standard decorators.

## Core Function

### `decorator(description: DecoratorDescription): Decorator`

Creates a decorator from a description object that defines how different decorator types should behave.

```typescript
import { decorator } from 'mutts'

const myDecorator = decorator({
  class(target) {
    // Handle class decoration
    return target
  },
  method(original, name) {
    // Handle method decoration
    return function(...args) {
      return original.apply(this, args)
    }
  },
  getter(original, name) {
    // Handle getter decoration
    return function() {
      return original.call(this)
    }
  },
  setter(original, name) {
    // Handle setter decoration
    return function(value) {
      return original.call(this, value)
    }
  },
  default(...args) {
    // Handle any other decorator type or fallback
    console.log('Default handler called with:', args)
  }
})
```

## Decorator Types

### Class Decorators

Modify or extend classes:

```typescript
const enhanced = decorator({
  class(original) {
    return class extends original {
      static version = '1.0.0'
    }
  }
})

@enhanced
class MyClass {
  value = 'test'
}

console.log((MyClass as any).version) // '1.0.0'
```

### Method Decorators

Wrap method calls:

```typescript
const logged = decorator({
  method(original, name) {
    return function(...args) {
      console.log(`Calling ${String(name)} with:`, args)
      return original.apply(this, args)
    }
  }
})

class Calculator {
  @logged
  add(a: number, b: number) {
    return a + b
  }
}

const calc = new Calculator()
calc.add(2, 3) // Logs: "Calling add with: [2, 3]"
```

### Getter/Setter Decorators

Wrap accessor calls:

```typescript
const tracked = decorator({
  getter(original, name) {
    return function() {
      console.log(`Getting ${String(name)}`)
      return original.call(this)
    }
  },
  setter(original, name) {
    return function(value) {
      console.log(`Setting ${String(name)} to:`, value)
      return original.call(this, value)
    }
  }
})

class Person {
  private _name = ''
  
  @tracked
  get name() {
    return this._name
  }
  
  @tracked
  set name(value: string) {
    this._name = value
  }
}

const person = new Person()
person.name = 'John' // Logs: "Setting name to: John"
console.log(person.name) // Logs: "Getting name" then "John"
```

### Combined Decorators

You can combine multiple decorator types in a single decorator:

```typescript
const fullDecorator = decorator({
  class(target) {
    return class extends target {
      static decorated = true
    }
  },
  method(original, name) {
    return function(...args) {
      return `method: ${original.apply(this, args)}`
    }
  },
  getter(original, name) {
    return function() {
      return `get: ${original.call(this)}`
    }
  }
})

@fullDecorator
class TestClass {
  @fullDecorator
  greet(name: string) {
    return `Hello ${name}`
  }
  
  @fullDecorator
  get data() {
    return 'test'
  }
}

const instance = new TestClass()
console.log(instance.greet('World')) // "method: Hello World"
console.log(instance.data) // "get: test"
```

### Default Handler

The `default` handler is called for any decorator type that doesn't have a specific handler defined, or as a fallback:

```typescript
const myDecorator = decorator({
  class(target) {
    return target
  },
  default(...args) {
    console.log('Default handler called with:', args)
    // Handle any decorator type not explicitly defined
  }
})
```

When defining that handler, there is no type verification for a type conflict with other decorators signature, even if the types are strictly checked at runtime, the handler will never receive `(object, string)` as an argument in a legacy environment for example (field decorator)

## Fields

Weirdly enough, there is no standard ways to decorate standard instance value fields. Legacy and Modern have no intersection of data beside the name of the decorated field - and they both lack something important:
- Legacy decorators give access to the prototype but not to the instances
- Modern does the opposite: gives access to the instances (through `addInitializer`) but not to the class.

The best ways to go through with fields are :

### Auto-accessors

JS/TS Have a so called auto-accessors available with the `accessor` keyword
```ts
class MClass {
  accessor myValue = 5
}
```

This will create a get/set pair automatically accessing an internal value. When this is decorated, the setter and the getter will be decorated separately.

### Class decorator

Giving the properties, as a list or an object can solve all this, with the help of the helper type `GenericClassDecorator`.
```ts
const myDecorator = decorator({
	getter(key, original) {
    //...
	},
  setter(key, original) {
    //...
  },
	default<T>(...args: (keyof T)[]): GenericClassDecorator<T> {
  //default<T>(_description: { [k in keyof T]?: string }): GenericClassDecorator<T> {
		return (classOriginal) => {
      //...
    }
	},
})
```

This example would allow the following code *with type checking*

```ts
@myDecorator('field1', 'method')
//@myDecorator({ field1: 'always', method: 'no' })
class Test {
	field1 = 'value1'
	field2 = 42
  @myDecorator
  accessor field3
  method() { /* ... */ }
}
```

## Environment Detection

The system automatically detects whether you're using Legacy or Modern decorators:

```typescript
import { detectDecoratorSupport } from 'mutts'

const support = detectDecoratorSupport()
console.log(support) // 'modern' | 'legacy' | false
```

## Type Safety

The decorator function provides full TypeScript support with proper type inference:

```typescript
// TypeScript will validate property names
function createDecorator<T extends new (...args: any[]) => any>(
  ...properties: (keyof InstanceType<T>)[]
) {
  return decorator({
    class(original) {
      console.log('Decorating class with properties:', properties)
      return original
    }
  })
}

@createDecorator('method', 'value') // TypeScript validates these exist on the class
class MyClass {
  method() {}
  value = 'test'
}
```

## Key Features

- **Environment Agnostic**: Works with both Legacy and Modern decorators
- **Type Safe**: Full TypeScript support with proper inference
- **Unified API**: Single API surface regardless of environment
- **Consistent Behavior**: Same results across all environments
- **Future Proof**: Will work when Modern becomes standard

## Implementation Details

The decorator system uses different underlying implementations based on your environment:

- **Legacy**: Uses `experimentalDecorators` with `PropertyDescriptor` manipulation
- **Modern**: Uses the new decorator standard with `DecoratorContext` objects

The `decorator` function automatically routes to the appropriate implementation and normalizes the differences between the two systems, providing a consistent API regardless of which environment you're using.

