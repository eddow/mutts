import { asyncHook, asyncHooks, asyncZone, effect, reactive, reset, Zone } from 'mutts';

describe('Async Hook Direct Tests', () => {
    let callStack: string[] = [];
    const isBrowser = typeof window !== 'undefined' || (globalThis as any).TEST_ENV === 'browser';
    async function waitForCleanup() {
        if (isBrowser) {
            await new Promise(r =>
                queueMicrotask(() => queueMicrotask(() => queueMicrotask(r as any)))
            );
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

    beforeEach(async () => {
        await waitForCleanup();
        if (expect.getState().currentTestName?.includes('Basic setTimeout')) {
            console.log('[DEBUG] asyncHooks object id:', (asyncHooks as any).__id || 'no-id');
            console.log('[DEBUG] addHook implementation:', asyncHooks.addHook.toString().slice(0, 100));
        }
        callStack = [];
        tracking = false;
        removers = [];
    });

    afterEach(async () => {
        await waitForCleanup();
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
        // Check order of basic ones
        const cbIdx = callStack.indexOf('callback');
        expect(callStack.indexOf('H1:restore')).toBeLessThan(cbIdx);
    });

    test('Schedulers freeze when reactivity breaks', async () => {
        const state = reactive({ broken: false });
        const calls: string[] = [];
        let interval: ReturnType<typeof setInterval> | undefined;
        let immediate: ReturnType<typeof setImmediate> | undefined;

        try {
            effect(() => {
                if (state.broken) throw new Error('break schedulers');
            });

            setTimeout(() => calls.push('timeout'), 20);
            interval = setInterval(() => calls.push('interval'), 5);
            if (typeof setImmediate === 'function') {
                immediate = setImmediate(() => calls.push('immediate'));
            }
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => calls.push('raf'));
            }

            expect(() => {
                state.broken = true;
            }).toThrow('break schedulers');

            reset();
            await new Promise<void>((resolve) => setTimeout(resolve, 50));

            expect(calls).toEqual([]);
        } finally {
            if (interval) clearInterval(interval);
            if (immediate) clearImmediate(immediate);
            reset();
        }
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
        // DOM events are NOT zone-wrapped — zones are for async context
        // preservation (Promise, setTimeout), not synchronous DOM callbacks.
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

        // Event fires normally, but no zone hook/restore/undo
        expect(callStack).toContain('event');
        expect(callStack).not.toContain('H1:hook');
        expect(callStack).not.toContain('H1:restore');
        expect(callStack).not.toContain('H1:undo');
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

        // Browser propagation is sticky-promise based; context preservation above is the contract.
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
        
        // Browser propagation is sticky-promise based; ordering above is the contract.
    });

    test('Reproduction: Context propagation across Promise.resolve().then()', async () => {
        let currentContext = 'root';
        // Simulate Zone-like hook
        const removeHook = asyncHooks.addHook(() => {
            const captured = currentContext;
            return () => {
                const prev = currentContext;
                currentContext = captured;
                return () => {
                    currentContext = prev;
                };
            };
        });

        try {
            currentContext = 'test-context';
            await new Promise(r => setTimeout(r, 0));
            expect(currentContext).toBe('test-context');
            await Promise.resolve().then(() => {});
            expect(currentContext).toBe('test-context');
        } finally {
            removeHook();
        }
    });

    test('Reproduction: Map identity', async () => {
        const key = {};
        let currentMap = new Map();
        
        const removeHook = asyncHooks.addHook(() => {
            const captured = new Map(currentMap); // Snapshot
            return () => {
                const prev = new Map(currentMap);
                currentMap = captured; // Restore snapshot
                return () => { currentMap = prev; };
            };
        });
        
        try {
            currentMap.set(key, 'value');
            await new Promise(r => setTimeout(r, 0));
            expect(currentMap.get(key)).toBe('value');
            await Promise.resolve().then(() => {});
            expect(currentMap.get(key)).toBe('value');
        } finally {
            removeHook();
        }
    });



    test('Reproduction: Scope Exit (simulating zone.with)', async () => {
        let globalContext: string | undefined = undefined;
        // Hook captures/restores globalContext
        const removeHook = asyncHooks.addHook(() => {
            const captured = globalContext;
            return () => {
                const prev = globalContext;
                globalContext = captured;
                return () => { globalContext = prev; };
            };
        });

        try {
            // Simulate zone.with
            const run = async () => {
                // Enter scope
                const prev = globalContext;
                globalContext = 'async-test';
                
                // Start async operation (simulate the body of zone.with)
                const p = (async () => {
                   // Initial capture happens here for setTimeout?
                   await new Promise(r => setTimeout(r, 0));
                   expect(globalContext).toBe('async-test'); // Check 1
                   
                   await Promise.resolve().then(() => {});
                   expect(globalContext).toBe('async-test'); // Check 2
                })();
                
                // Leave scope SYNC (simulate finally block of zone.with)
                globalContext = prev; 
                
                return p;
            };

            await run();
        } finally {
            removeHook();
        }
    });

});
