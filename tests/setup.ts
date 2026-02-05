import { reactiveOptions } from 'mutts';
import { afterEach } from 'vitest';
import { effectHistory } from '../src/reactive/effect-context';

reactiveOptions.onMemoizationDiscrepancy = (cached, fresh, fn, args, cause) => {
    const fnName = (fn as any).name || 'anonymous';
    let argsStr = 'unknown';
    try {
        argsStr = JSON.stringify(args);
    } catch {
        argsStr = '[Circular]';
    }
    
    let cachedStr = 'unknown';
    try {
        cachedStr = JSON.stringify(cached);
    } catch {
        cachedStr = '[Circular]';
    }

    let freshStr = 'unknown';
    try {
        freshStr = JSON.stringify(fresh);
    } catch {
        freshStr = '[Circular]';
    }

    const message = `Memoization discrepancy detected in ${fnName} during ${cause}!
Arguments: ${argsStr}
Cached value: ${cachedStr}
Fresh value:  ${freshStr}
This usually means a reactive dependency is missing in the memoized function.`;

    throw new Error(message);
};

// Clear zone history between tests to ensure isolation
afterEach(() => {
    // Clear the zone history to prevent test interference
    const history = (effectHistory as any).history;
    if (history) {
        history.clear();
    }
    
    // Import and reset module-level variables
    const effectsModule = require('../src/reactive/effects');
    
    // Reset batch state
    if (effectsModule.batchQueue !== undefined) {
        effectsModule.batchQueue = undefined;
    }
    if (effectsModule.activationRegistry !== undefined) {
        effectsModule.activationRegistry = undefined;
    }
    
    // Clear batch cleanups
    const { batchCleanups } = require('../src/reactive/effects');
    if (batchCleanups?.clear) {
        batchCleanups.clear();
    }
});
