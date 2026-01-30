import { unhookAsyncZone, Zone, ZoneHistory, ZoneAggregator, wrapAsync, configureAsyncZone, asyncZone } from '../src/zone';

describe('Zone', () => {
    test('basic with/active functionality', () => {
        const zone = new Zone<string>();
        expect(zone.active).toBeUndefined();

        zone.with('a', () => {
            expect(zone.active).toBe('a');
            zone.with('b', () => {
                expect(zone.active).toBe('b');
            });
            expect(zone.active).toBe('a');
        });

        expect(zone.active).toBeUndefined();
    });

    test('root functionality overrides current value', () => {
        const zone = new Zone<string>();
        zone.with('a', () => {
            zone.root(() => {
                expect(zone.active).toBeUndefined();
            });
            expect(zone.active).toBe('a');
        });
    });

    test('zoned getter snapshots current state', () => {
        const zone = new Zone<string>();
        let wrapper: any;

        zone.with('a', () => {
            wrapper = zone.zoned;
        });

        zone.with('b', () => {
            wrapper(() => {
                // Should be 'a' because it was snapshotted
                expect(zone.active).toBe('a');
            });
            expect(zone.active).toBe('b');
        });
    });
});

describe('ZoneHistory', () => {
    test('tracks history and allows present access', () => {
        const zone = new ZoneHistory<string>();
        zone.present.with('a', () => {
            expect(zone.active.present).toBe('a');
            expect(zone.has('a')).toBe(true);
            
            zone.present.with('b', () => {
                expect(zone.active.present).toBe('b');
                expect(zone.has('a')).toBe(true);
                expect(zone.has('b')).toBe(true);
            });
        });
    });

    test('throws on re-entry of historical zone', () => {
        const zone = new ZoneHistory<string>();
        zone.present.with('a', () => {
            expect(() => {
                zone.present.with('a', () => {});
            }).toThrow('ZoneHistory: re-entering historical zone');
        });
    });
});

describe('ZoneAggregator', () => {
    test('merges multiple zones', () => {
        const z1 = new Zone<string>();
        const z2 = new Zone<number>();
        const agg = new ZoneAggregator(z1, z2);

        z1.with('v1', () => {
            z2.with(123, () => {
                const active = agg.active!;
                expect(active.get(z1)).toBe('v1');
                expect(active.get(z2)).toBe(123);
            });
        });
    });

    test('with() on aggregator enters all zones', () => {
        const z1 = new Zone<string>();
        const z2 = new Zone<number>();
        const agg = new ZoneAggregator(z1, z2);

        const values = new Map<any, any>([[z1, 'hello'], [z2, 42]]);
        
        agg.with(values, () => {
            expect(z1.active).toBe('hello');
            expect(z2.active).toBe(42);
        });
    });
});

describe('Async Propagation', () => {
    beforeEach(() => {
        asyncZone.clear();
        if (unhookAsyncZone) unhookAsyncZone();
    });

    test('wrapAsync preserves context in setTimeout', (done) => {
        const zone = new Zone<string>();
        const unhook = wrapAsync(zone.zoned, { timer: true });

        zone.with('test', () => {
            setTimeout(() => {
                try {
                    expect(zone.active).toBe('test');
                    unhook();
                    done();
                } catch (e) {
                    unhook();
                    done(e);
                }
            }, 0);
        });
    });

    test('check if promise is patched', () => {
        const originalThen = Promise.prototype.then;
        configureAsyncZone();
        try {
            expect(Promise.prototype.then).not.toBe(originalThen);
        } finally {
            if (unhookAsyncZone) unhookAsyncZone(); // Clean up if needed, though configureAsyncZone handles it
        }
    });

    test('configureAsyncZone works top-to-bottom', async () => {
        const zone = new Zone<string>();
        asyncZone.add(zone);
        configureAsyncZone();

        await zone.with('async-test', async () => {
            expect(zone.active).toBe('async-test');
            // Try different async points
            await new Promise(r => setTimeout(r, 0)); 
            expect(zone.active).toBe('async-test');
            await Promise.resolve().then(() => {});
            expect(zone.active).toBe('async-test');
        });

        expect(zone.active).toBeUndefined();
    });
});
