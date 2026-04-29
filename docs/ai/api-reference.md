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
export type PropTrigger = {
    obj: object;
    evolution: Evolution;
    dependency?: unknown;
    touch?: unknown;
};
export type CleanupReason = {
    type: 'propChange';
    triggers: PropTrigger[];
} | {
    type: 'invalidate';
    cause: CleanupReason;
} | {
    type: 'stopped';
    detail?: string;
} | {
    type: 'gc';
} | {
    type: 'lineage';
    parent: CleanupReason;
} | {
    type: 'error';
    error: unknown;
} | {
    type: 'multiple';
    reasons: CleanupReason[];
};
export type ScopedCallback = (reason?: CleanupReason) => void;
export type EffectCleanup = ScopedCallback;
export type EffectCloser = (reason?: CleanupReason) => void;
export type EffectAccess = {
    tracked: <T>(fn: () => T) => T;
    ascend: <T>(fn: () => T) => T;
    reaction: boolean | CleanupReason;
    signal: AbortSignal;
};
export type EffectOptions = {
    asyncMode?: 'cancel' | 'queue' | 'ignore';
    opaque?: boolean;
    dependencyHook?: (obj: any, prop: any) => void;
    name?: string;
};
export type Evolution = {
    type: 'set' | 'del' | 'add' | 'invalidate';
    prop: any;
} | {
    type: 'bunch';
    method: string;
};

export declare const effect: {
    (fn: (access: EffectAccess) => EffectCloser | undefined | void | Promise<any>, effectOptions?: EffectOptions): EffectCleanup;
    readonly opaque: typeof effect;
    named(name: string): typeof effect;
};
export declare function reactive<T extends object>(target: T): T;
export declare function unwrap<T>(obj: T): T;
export declare function isReactive(obj: any): boolean;
export declare class ReactiveBase {}
export declare function isNonReactive(obj: any): boolean;
export declare function untracked<T>(fn: () => T): T;
export declare function root<T>(fn: () => T): T;
export declare function assertUntracked<T>(fn: () => T): T;
export declare function getState(obj: any): {};
export declare function touched(obj: any, evolution: Evolution, props?: any[]): void;
export declare function touched1(obj: any, evolution: Evolution, prop: any): void;

// --------------------------------------------------------------------------------
// REACTIVE HELPERS
// --------------------------------------------------------------------------------

export declare function atomic<T extends (...args: any[]) => any>(fn: T): T;
export declare function atom<T>(fn: () => T): T;
export declare function memoize<Result, Args extends any[]>(fn: (...args: Args) => Result, maxArgs?: number): (...args: Args) => Result;
export declare function deepWatch<T extends object>(target: T, callback: (value: T) => void, options?: { immediate?: boolean }): EffectCleanup | undefined;
export declare function biDi<T>(received: (value: T) => void, value: { get: () => T, set: (value: T) => void }): (value: T) => void;
export declare function biDi<T>(received: (value: T) => void, get: () => T, set: (value: T) => void): (value: T) => void;
export declare function addBatchCleanup(cleanup: () => void): void;
export declare const defer: typeof addBatchCleanup;
export declare function caught(onThrow: (error: unknown) => EffectCloser | undefined | void): void;
export declare const onEffectThrow: typeof caught;
export declare function getActiveEffect(): ScopedCallback;
export declare const effectAggregator: unknown;
export declare function link(owner: object, ...deps: (ScopedCallback | object)[]): void;
export declare function unlink(owner: object, reason?: CleanupReason): void;

// --------------------------------------------------------------------------------
// COLLECTIONS
// --------------------------------------------------------------------------------

export declare function attend<T>(source: readonly T[], callback: (index: number, access: EffectAccess) => EffectCloser | void): ScopedCallback;
export declare function attend<K, V>(source: Map<K, V>, callback: (key: K, access: EffectAccess) => EffectCloser | void): ScopedCallback;
export declare function attend<T>(source: Set<T>, callback: (value: T, access: EffectAccess) => EffectCloser | void): ScopedCallback;
export declare function attend<S extends object>(source: S, callback: (key: keyof S & string, access: EffectAccess) => EffectCloser | void): ScopedCallback;
export declare function attend<Key>(enumerate: () => Iterable<Key>, callback: (key: Key, access: EffectAccess) => EffectCloser | void): ScopedCallback;
export declare function lift<Output extends any[]>(cb: (access: EffectAccess) => Output): Output;
export declare function lift<Output extends object>(cb: (access: EffectAccess) => Output): Output;
export declare const morph: {
    <I, O>(source: readonly I[] | (() => readonly I[]), fn: (arg: I, access?: EffectAccess) => O, options?: { pure?: boolean | ((i: I) => boolean) }): readonly O[];
    <K, V, O>(source: Map<K, V>, fn: (arg: V, key: K, access?: EffectAccess) => O, options?: { pure?: boolean | ((i: V) => boolean) }): Map<K, O>;
    <S extends Record<PropertyKey, any>, O>(source: S, fn: (arg: S[keyof S], key: keyof S, access?: EffectAccess) => O, options?: { pure?: boolean | ((i: S[keyof S]) => boolean) }): { [K in keyof S]: O };
    pure: typeof morph;
};
export declare function organized<S, T>(source: S, apply: (access: any, target: T) => any, baseTarget?: T): T;
export declare function organize<T>(target: object, property: PropertyKey, access: { get?(): T, set?(value: T): boolean }): () => boolean;
export declare const watch: {
    <T>(value: (dep: EffectAccess) => T, changed: (value: T, oldValue?: T) => void, options?: { immediate?: boolean, deep?: false }): EffectCleanup;
    <T extends object | any[]>(value: (dep: EffectAccess) => T, changed: (value: T, oldValue?: T) => void, options?: { immediate?: boolean, deep: true }): EffectCleanup;
    <T extends object | any[]>(value: T, changed: (value: T) => void, options?: { immediate?: boolean, deep?: boolean }): EffectCleanup;
    readonly deep: typeof watch;
    readonly immediate: typeof watch;
};
export declare function when<T>(predicate: (dep: EffectAccess) => T, timeout?: number): Promise<T>;
export interface Resource<T> {
    value: T | undefined;
    loading: boolean;
    error: any;
    latest: T | undefined;
    reload(): void;
    promise: Promise<void>;
}
export declare function resource<T>(fetcher: (access: EffectAccess) => Promise<T> | T, options?: { initialValue?: T }): Resource<T>;
export declare function unreactive<T extends object>(obj: T): T;

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

// See: 'mutts/debug' for programmatic access
// buildReactivityGraph, getMutationHistory, getDependents, getDependencies, etc.

export declare const reactiveOptions: {
    scheduler: 'raw' | 'ordered' | 'debug';
    /** @deprecated Use scheduler instead. */
    cycleHandling: 'raw' | 'ordered' | 'debug' | 'production' | 'development';
    introspection: unknown;
};

export enum ReactiveErrorCode {
    CycleDetected = 'Cycle detected',
    MaxDepthExceeded = 'Max depth exceeded',
    MaxReactionExceeded = 'Max reaction exceeded',
    WriteInComputed = 'Write in computed',
    TrackingError = 'Tracking error',
    BrokenEffects = 'Broken effects',
}
```
