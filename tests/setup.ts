import { reactiveOptions } from 'mutts';

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
