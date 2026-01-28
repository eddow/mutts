# Mutts API Context

This file contains the aggregated type definitions for the Mutts library.
AI Agents should read this code block to understand correct function signatures and types.

```typescript
/**
 * MUTTS API CONTEXT FILE
 */

// --------------------------------------------------------------------------------
// CORE REACTIVITY
// --------------------------------------------------------------------------------

export declare const Effect: unique symbol;
export declare const cleanup: unique symbol;
export declare const getAt: unique symbol;
export declare const setAt: unique symbol;
/**
 * Symbol to check if an object is reactive
 */
export declare const Reactive: unique symbol;
/**
 * Symbol to map back from a reactive proxy to its original target
 */
export declare const Raw: unique symbol;
export type ScopedCallback = (() => void | (() => void)) & {
    [cleanup]?: () => void;
};
export type DependencyFunction = <T>(fn: () => T) => T;
export type DependencyAccess = {
    tracked: DependencyFunction;
    ascend: DependencyFunction;
    reaction: boolean;
};

export declare function reactive<T extends object>(target: T): T;
export declare function effect(fn: (access: DependencyAccess, ...args: any[]) => (ScopedCallback | undefined | void), ...args: any[]): ScopedCallback;
export declare function unwrap<T>(obj: T): T;
export declare function isReactive(obj: any): boolean;
export declare function isNonReactive(obj: any): boolean;
export declare function untracked<T>(fn: () => T): T;

// --------------------------------------------------------------------------------
// REACTIVE HELPERS
// --------------------------------------------------------------------------------

export declare function atomic<T extends (...args: any[]) => any>(fn: T): T;
export declare function memoize<Result, Args extends any[]>(fn: (...args: Args) => Result, maxArgs?: number): (...args: Args) => Result;
export declare function deepWatch(source: any, callback: (path: string[], value: any) => void): () => void;
export declare function biDi<T>(target: (val: T) => void, source: { get: () => T, set: (v: T) => void }): (val: T) => void;

// --------------------------------------------------------------------------------
// COLLECTIONS
// --------------------------------------------------------------------------------

export interface Register<T, K extends PropertyKey = PropertyKey> extends Iterable<T> {
    length: number;
    [index: number]: T;
    get(key: K): T | undefined;
    set(key: K, value: T): void;
    hasKey(key: K): boolean;
    indexOfKey(key: K): number;
    remove(key: K): void;
    removeAt(index: number): T | undefined;
    push(...items: T[]): number;
    // ... complete array methods are supported
}

export declare function register<T, K extends PropertyKey = PropertyKey>(keyFn: (item: T) => K, initial?: Iterable<T>): Register<T, K>;
export declare function project<S, R>(source: S, apply: (access: any, target: any) => any): R;
export declare function organized<S, T>(source: S, apply: (access: any, target: T) => any, baseTarget?: T): T;

// --------------------------------------------------------------------------------
// DESTROYABLE
// --------------------------------------------------------------------------------

export declare const destructor: unique symbol;
export declare const allocated: unique symbol;
export declare function Destroyable<T>(base?: T): any;
export declare class DestructionError extends Error {}

// --------------------------------------------------------------------------------
// EVENTS
// --------------------------------------------------------------------------------

export interface EventfulMixin {
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
    emit(event: string, ...args: any[]): void;
}
export declare function Eventful<T extends new (...args: any[]) => any>(Base: T): T & (new (...args: any[]) => EventfulMixin);

// --------------------------------------------------------------------------------
// DECORATORS
// --------------------------------------------------------------------------------

export declare function cached(target: any, key: string, descriptor: PropertyDescriptor): void;
export declare function debounce(delay: number): Function;
export declare function throttle(delay: number): Function;
export declare function deprecated(message?: string): Function;

// --------------------------------------------------------------------------------
// INTROSPECTION (AI Debugging)
// --------------------------------------------------------------------------------

export interface ReactivityGraph {
    nodes: { id: string, label: string, type: 'effect'|'object' }[];
    edges: { source: string, target: string, type: string }[];
}

export interface MutationRecord {
    type: 'set' | 'add' | 'delete';
    prop: PropertyKey;
    oldValue: any;
    newValue: any;
    objectName?: string;
}

export declare function getDependencyGraph(): ReactivityGraph;
export declare function getMutationHistory(): MutationRecord[];
export declare const options: {
    cycleHandling: 'throw' | 'warn' | 'break' | 'strict';
    introspection: { enableHistory: boolean; historySize: number };
};

export enum ReactiveErrorCode {
    CYCLE_DETECTED = 'CYCLE_DETECTED',
    MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED',
}
```
