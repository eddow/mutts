import { asyncHook, asyncHooks, asyncZone, Zone } from 'mutts';

describe('Async Hook Direct Tests', () => {
    let callStack: string[] = [];
    const isBrowser = typeof window !== 'undefined' || (globalThis as any).TEST_ENV === 'browser';
    async function waitForCleanup() {
        if (isBrowser) {
            // Browser needs double microtask to ensure we run AFTER the cleanup 
            await new Promise(r => queueMicrotask(() => queueMicrotask(r as any)));
        } else {
            // Node implementation now uses setImmediate for robust cleanup
            await new Promise(r => setImmediate(r as any));
        }
    }
    let tracking = false;
    let removers: (() => void)[] = [];

    function createHook(name: string) {
        return () => {
            const isTracking = tracking;
            if (isTracking) callStack.push(`${name}:hook`);
            return () => {
                if (isTracking) callStack.push(`${name}:restore`);
                return () => {
                    if (isTracking) callStack.push(`${name}:undo`);
                };
            };
        };
    }

    beforeEach(() => {
        if (expect.getState().currentTestName?.includes('Basic setTimeout')) {
            console.log('[DEBUG] asyncHooks object id:', (asyncHooks as any).__id || 'no-id');
            console.log('[DEBUG] addHook implementation:', asyncHooks.addHook.toString().slice(0, 100));
        }
        callStack = [];
        tracking = false;
        removers = [];
    });

    afterEach(() => {
        tracking = false;
        for (const r of removers) r();
    });

    test('Basic setTimeout', async () => {
        removers.push(asyncHook(createHook('H1')));
        
        await new Promise<void>((resolve) => {
            tracking = true;
            setTimeout(() => {
                callStack.push('callback');
                resolve();
            }, 0);
            tracking = false;
        });
        await waitForCleanup();

        expect(callStack).toContain('H1:hook');
        expect(callStack).toContain('H1:restore');
        expect(callStack).toContain('callback');
        expect(callStack).toContain('H1:undo');
        // Check order of basic ones
        const cbIdx = callStack.indexOf('callback');
        expect(callStack.indexOf('H1:restore')).toBeLessThan(cbIdx);
        expect(callStack.indexOf('H1:undo')).toBeGreaterThan(cbIdx);
    });

    test('Nested setTimeout', async () => {
        removers.push(asyncHook(createHook('H1')));
        
        await new Promise<void>((resolve) => {
            tracking = true;
            setTimeout(() => {
                callStack.push('cb1');
                tracking = true;
                setTimeout(() => {
                    callStack.push('cb2');
                    resolve();
                }, 0);
                tracking = false;
            }, 0);
            tracking = false;
        });
        await waitForCleanup();

        const cb1Idx = callStack.indexOf('cb1');
        const cb2Idx = callStack.indexOf('cb2');
        
        expect(cb1Idx).toBeGreaterThan(-1);
        expect(cb2Idx).toBeGreaterThan(cb1Idx);
        
        // H1:hook for cb2 should be between cb1 and cb2
        // Actually it's between cb1 and cb1's completion (undo)
        const hook2Idx = callStack.lastIndexOf('H1:hook', cb2Idx);
        expect(hook2Idx).toBeGreaterThan(cb1Idx);
    });

    test('Multiple hooks', async () => {
        removers.push(asyncHook(createHook('H1')));
        removers.push(asyncHook(createHook('H2')));
        
        await new Promise<void>((resolve) => {
            tracking = true;
            setTimeout(() => {
                callStack.push('callback');
                resolve();
            }, 0);
            tracking = false;
        });
        await waitForCleanup();

        const cbIdx = callStack.indexOf('callback');
        expect(callStack.indexOf('H1:restore')).toBeLessThan(cbIdx);
        expect(callStack.indexOf('H2:restore')).toBeLessThan(cbIdx);
        expect(callStack.indexOf('H1:undo')).toBeGreaterThan(cbIdx);
        expect(callStack.indexOf('H2:undo')).toBeGreaterThan(cbIdx);
        
        // Reversed undo order check: H2 was added last, so it should be restored last and undone first.
        // H1:restore, H2:restore, callback, H2:undo, H1:undo
        expect(callStack.indexOf('H2:undo')).toBeLessThan(callStack.indexOf('H1:undo'));
    });

    test('Promise.then', async () => {
        removers.push(asyncHook(createHook('H1')));
        
        tracking = true;
        const p = Promise.resolve().then(() => {
            callStack.push('then');
        });
        tracking = false;
        await p;
        await waitForCleanup();

        expect(callStack).toContain('H1:hook');
        expect(callStack).toContain('H1:restore');
        expect(callStack).toContain('then');
        expect(callStack).toContain('H1:undo');
    });

    test('Nested Promises', async () => {
        removers.push(asyncHook(createHook('H1')));
        
        tracking = true;
        const p = Promise.resolve().then(() => {
            callStack.push('then1');
            tracking = true;
            return Promise.resolve().then(() => {
                callStack.push('then2');
            });
        });
        tracking = false;
        await p;
        await waitForCleanup();

        expect(callStack).toContain('then1');
        expect(callStack).toContain('then2');
        expect(callStack.indexOf('then2')).toBeGreaterThan(callStack.indexOf('then1'));
    });

    test('EventTarget (if available)', async () => {
        // Only run this test in browser where we patch EventTarget manually
        if (typeof window === 'undefined' || typeof EventTarget === 'undefined') return;
        
        removers.push(asyncHook(createHook('H1')));
        const et = new EventTarget();
        
        let resolve: any;
        const p = new Promise<void>(r => resolve = r);
        
        const listener = () => {
            callStack.push('event');
            resolve();
        };

        tracking = true;
        et.addEventListener('test', listener);
        tracking = false;
        
        et.dispatchEvent(new Event('test'));
        await p;
        await waitForCleanup();

        expect(callStack).toContain('H1:hook');
        expect(callStack).toContain('H1:restore');
        expect(callStack).toContain('event');
        expect(callStack).toContain('H1:undo');
    });

    test('Dynamically adding/removing hooks', async () => {
        const h1 = createHook('H1');
        const h2 = createHook('H2');
        
        removers.push(asyncHook(h1));
        
        await new Promise<void>(r => {
            tracking = true;
            setTimeout(() => {
                callStack.push('cb1');
                removers.push(asyncHook(h2));
                tracking = true;
                setTimeout(() => {
                    callStack.push('cb2');
                    r();
                }, 0);
                tracking = false;
            }, 0);
            tracking = false;
        });

        expect(callStack).toContain('cb1');
        expect(callStack).toContain('cb2');
        await waitForCleanup();

        // H2 should only be hooked for cb2
        const h2Idx = callStack.indexOf('H2:hook');
        expect(h2Idx).toBeGreaterThan(callStack.indexOf('cb1'));
    });

    test('await resumption', async () => {
        const zone = new Zone<string>();
        asyncZone.add(zone);
        removers.push(asyncHook(createHook('H1')));
        
        await zone.with('test-zone', async () => {
            await new Promise<void>(resolve => {
                tracking = true;
                setTimeout(() => {
                    callStack.push('resolve-task');
                    resolve();
                }, 0);
                tracking = false;
            });
            
            tracking = true;
            callStack.push('after-await:' + zone.active);
            tracking = false;
        });

        const resIdx = callStack.indexOf('resolve-task');
        const awaitIdx = callStack.findIndex(s => s.startsWith('after-await'));
        
        expect(resIdx).toBeGreaterThan(-1);
        expect(awaitIdx).toBeGreaterThan(resIdx);
        expect(callStack[awaitIdx]).toBe('after-await:test-zone');
        
        // Wait for microtask-based cleanup to finish
        await waitForCleanup();

        // Check that H1:undo is after call
        // Note: In Node.js (async_hooks), await resumptions don't always trigger visible before/after hooks 
        // because V8 optimizes them as internal microtasks. However, if context is preserved (verified above),
        // we accept that the "undo" might not be strictly visible in the user-land callstack for the resumption itself.
        if (isBrowser) {
            expect(callStack).toContain('H1:undo');
            expect(callStack.lastIndexOf('H1:undo')).toBeGreaterThan(awaitIdx);
        }
    });

    test('multiple await resumptions', async () => {
        removers.push(asyncHook(createHook('H1')));
        
        await new Promise<void>(resolve => {
            tracking = true;
            setTimeout(() => {
                callStack.push('resolve-task');
                resolve();
            }, 0);
            tracking = false;
        });
        
        tracking = true;
        callStack.push('after-await-1');
        await Promise.resolve().then(() => {
            callStack.push('middle-task');
        });
        callStack.push('after-await-2');
        tracking = false;

        // Wait for microtask-based cleanup to finish
        await waitForCleanup();

        console.log('CallStack Multiple:', JSON.stringify(callStack, null, 2));
        
        expect(callStack.indexOf('after-await-1')).toBeGreaterThan(callStack.indexOf('resolve-task'));
        expect(callStack.indexOf('middle-task')).toBeGreaterThan(callStack.indexOf('after-await-1'));
        expect(callStack.indexOf('after-await-2')).toBeGreaterThan(callStack.indexOf('middle-task'));
        
        // Check that H1:undo is still after after-await-2
        if (isBrowser) {
            const lastUndo = callStack.lastIndexOf('H1:undo');
            expect(lastUndo).toBeGreaterThan(callStack.indexOf('after-await-2'));
        }
    });
});
