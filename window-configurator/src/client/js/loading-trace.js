const TRACE_STATE_KEY = '__WINDOW_CAD_LOADING_TRACE_STATE__';
const TRACE_RUN_COUNTER_KEY = '__WINDOW_CAD_LOADING_TRACE_RUN_COUNTER__';

function clockNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}

function formatMs(value) {
    return `${Math.max(0, Number(value) || 0).toFixed(1)}ms`;
}

function logLine(trace, label, {
    now = clockNow(),
    durationMs = null,
    details = null,
    suffix = '',
} = {}) {
    const elapsedMs = now - trace.startedAt;
    const deltaMs = now - trace.lastAt;
    trace.lastAt = now;
    trace.sequence += 1;

    const duration = Number.isFinite(Number(durationMs))
        ? ` | took ${formatMs(durationMs)}`
        : '';
    const extraSuffix = suffix ? ` | ${suffix}` : '';
    const prefix = `[CAD LOAD #${trace.runId} ${String(trace.sequence).padStart(2, '0')}]`;
    const message = `${prefix} ${new Date().toISOString()} | +${formatMs(elapsedMs)} | Δ${formatMs(deltaMs)}${duration}${extraSuffix} | ${label}`;

    if (details === null || details === undefined) {
        console.log(message);
    } else {
        console.log(message, details);
    }
}

export function getCadLoadingTrace() {
    return globalThis[TRACE_STATE_KEY] || null;
}

export function startCadLoadingTrace(label = 'CAD loading started', details = null) {
    let trace = getCadLoadingTrace();
    if (!trace || trace.finished) {
        const startedAt = clockNow();
        const runId = (Number(globalThis[TRACE_RUN_COUNTER_KEY]) || 0) + 1;
        globalThis[TRACE_RUN_COUNTER_KEY] = runId;
        trace = {
            runId,
            startedAt,
            lastAt: startedAt,
            sequence: 0,
            finished: false,
        };
        globalThis[TRACE_STATE_KEY] = trace;
        logLine(trace, label, { now: startedAt, details, suffix: 'trace start' });
        return trace;
    }

    markCadLoading(label, details);
    return trace;
}

export function markCadLoading(label, details = null, durationMs = null) {
    const trace = getCadLoadingTrace();
    if (!trace || trace.finished) return;
    logLine(trace, label, { durationMs, details });
}

export async function measureCadLoading(label, operation, details = null) {
    const startedAt = clockNow();
    try {
        const result = await operation();
        markCadLoading(label, details, clockNow() - startedAt);
        return result;
    } catch (error) {
        markCadLoading(`${label} FAILED`, {
            ...(details && typeof details === 'object' ? details : {}),
            error: error?.message || String(error),
        }, clockNow() - startedAt);
        throw error;
    }
}

export function measureCadLoadingSync(label, operation, details = null) {
    const startedAt = clockNow();
    try {
        const result = operation();
        markCadLoading(label, details, clockNow() - startedAt);
        return result;
    } catch (error) {
        markCadLoading(`${label} FAILED`, {
            ...(details && typeof details === 'object' ? details : {}),
            error: error?.message || String(error),
        }, clockNow() - startedAt);
        throw error;
    }
}

export function finishCadLoadingTrace(label = 'Loading CAD profiles popup hidden', details = null) {
    const trace = getCadLoadingTrace();
    if (!trace || trace.finished) return;

    const now = clockNow();
    const totalMs = now - trace.startedAt;
    const unaccountedSinceLastMarkMs = now - trace.lastAt;
    logLine(trace, label, {
        now,
        details,
        suffix: `TOTAL ${formatMs(totalMs)} | since previous marker ${formatMs(unaccountedSinceLastMarkMs)}`,
    });
    trace.finished = true;
}
